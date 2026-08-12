import { OperationalPerformanceSeller, OperationalPerformanceSnapshot } from '../types';

const number = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nearInteger = (value: number, tolerance = 0.08) =>
  Number.isFinite(value) && Math.abs(value - Math.round(value)) <= tolerance;

// Excel costuma armazenar percentuais como 0.06 para 6%.
export const normalizedPercent = (value: unknown) => {
  const raw = number(value);
  if (!raw) return 0;
  return Math.abs(raw) <= 1 ? raw * 100 : raw;
};

/**
 * Fechamento é a métrica oficial de vendas.
 * 1) Um Fechamento inteiro positivo é sempre soberano.
 * 2) Se a célula vier fracionada/quebrada, usamos coerência de Captura como recuperação.
 * 3) Só então usamos % Fechamento x Fluxo como fallback.
 * Nunca usa Vendas Syonet como venda oficial.
 */
export const officialClosingCount = (item: OperationalPerformanceSeller | null | undefined) => {
  if (!item) return 0;

  const rawClosing = number(item.closing);
  const captureQty = number(item.captureQty);
  const capturePercent = normalizedPercent(item.capturePercent);
  const flow = number(item.flowTotal);
  const closingRate = normalizedPercent(item.closingPercent);

  // A coluna Fechamento é a fonte principal quando contém uma quantidade válida.
  if (rawClosing > 0 && nearInteger(rawClosing, 0.02)) return Math.round(rawClosing);

  // Zero também é válido quando não existe captura contradizendo o dado.
  if (rawClosing === 0 && captureQty === 0) return 0;

  // Ex.: 2 capturas / 33,3% = aproximadamente 6 vendas.
  if (captureQty > 0 && capturePercent > 0) {
    const inferred = captureQty / (capturePercent / 100);
    if (inferred >= captureQty && nearInteger(inferred)) return Math.round(inferred);
  }

  // Último recurso: % fechamento x fluxo total.
  if (flow > 0 && closingRate >= 0) {
    const inferred = (closingRate / 100) * flow;
    if (nearInteger(inferred)) return Math.round(inferred);
  }

  // Mantém o valor cru apenas para não apagar informação em um arquivo atípico.
  return rawClosing >= 0 ? Number(rawClosing.toFixed(2)) : 0;
};

export const officialClosingRate = (item: OperationalPerformanceSeller | null | undefined) => {
  if (!item) return 0;
  const flow = number(item.flowTotal);
  const closing = officialClosingCount(item);
  if (flow > 0 && closing >= 0) return closing / flow * 100;
  const raw = normalizedPercent(item.closingPercent);
  return raw >= 0 && raw <= 100 ? raw : 0;
};

export const normalizeOfficialSellerMetrics = (item: OperationalPerformanceSeller): OperationalPerformanceSeller => {
  const closing = officialClosingCount(item);
  const flow = number(item.flowTotal);
  return {
    ...item,
    closing,
    // Recalcula a taxa a partir do Fechamento oficial. Isso também mantém compatibilidade
    // com telas antigas que ainda derivam quantidade usando taxa x fluxo.
    closingPercent: flow > 0 ? closing / flow * 100 : officialClosingRate(item),
    capturePercent: normalizedPercent(item.capturePercent),
    marginPercent: normalizedPercent(item.marginPercent),
    evaluationRate: normalizedPercent(item.evaluationRate),
    orderPercent: normalizedPercent(item.orderPercent),
  };
};

export const aggregatePerformanceSnapshot = (snapshot: OperationalPerformanceSnapshot | null | undefined): OperationalPerformanceSeller | null => {
  if (!snapshot) return null;
  const sellers = snapshot.sellers || [];
  if (!sellers.length) return snapshot.total ? normalizeOfficialSellerMetrics(snapshot.total) : null;

  const normalized = sellers.map(normalizeOfficialSellerMetrics);
  const sum = (key: keyof OperationalPerformanceSeller) => normalized.reduce((acc, item) => acc + number(item[key]), 0);
  const closing = normalized.reduce((acc, item) => acc + number(item.closing), 0);
  const flow = sum('flowTotal');
  const marginTotal = sum('marginTotal');
  const captureQty = sum('captureQty');

  return {
    seller: 'TOTAL',
    sellerKey: 'total',
    passages: sum('passages'),
    orders: sum('orders'),
    flowTotal: flow,
    orderPercent: flow ? sum('orders') / flow * 100 : 0,
    workInPeriod: sum('workInPeriod'),
    avgContactsPerDay: 0,
    evaluations: sum('evaluations'),
    evaluationRate: flow ? sum('evaluations') / flow * 100 : 0,
    closing,
    syonetSales: sum('syonetSales'),
    closingPercent: flow ? closing / flow * 100 : 0,
    marginPerCar: closing ? marginTotal / closing : 0,
    marginTotal,
    marginPercent: closing
      ? normalized.reduce((acc, item) => acc + normalizedPercent(item.marginPercent) * number(item.closing), 0) / closing
      : 0,
    captureQty,
    capturePercent: closing ? captureQty / closing * 100 : 0,
    pipeline: sum('pipeline'),
    projection: sum('projection'),
    additionalPurchase: sum('additionalPurchase'),
  };
};