import { GoogleGenAI } from '@google/genai';
import { OperationalPerformanceSeller, OperationalPerformanceSnapshot, OperationalStockItem } from '../types';
import { OperationalStockHistoryPoint } from './operationalDataService';

export type AiTone = 'critical' | 'attention' | 'positive';

export type ManagerAiSignal = {
  tone: AiTone;
  priority: number;
  title: string;
  evidence: string;
  action: string;
};

export type SellerAiFocus = {
  seller: string;
  sellerKey: string;
  sales: number;
  projection: number;
  goal: number;
  capture: number;
  captureGoal: number;
  margin: number;
  marginGoal: number;
  evaluations: number;
  reason: string;
};

export type ManagerAiGoals = {
  monthlyGoal: number;
  captureGoal: number;
  marginGoal: number;
  sellerMonthlyGoal: number;
  sellerCaptureGoal: number;
  sellerMarginGoal: number;
};

export type SellerGoalMap = Record<string, { monthly: number; capture: number; margin: number }>;

export type ManagerAiContext = {
  snapshot: OperationalPerformanceSnapshot | null;
  performanceHistory: OperationalPerformanceSnapshot[];
  stock: OperationalStockItem[];
  stockHistory: OperationalStockHistoryPoint[];
  goals: ManagerAiGoals;
  sellerGoals?: SellerGoalMap;
};

export type ManagerAiBrief = {
  status: 'critical' | 'attention' | 'healthy';
  headline: string;
  summary: string;
  signals: ManagerAiSignal[];
  sellerFocus: SellerAiFocus[];
  metrics: {
    sales: number;
    projection: number;
    projectionDelta: number;
    capture: number;
    captureDelta: number;
    margin: number;
    marginDelta: number;
    evaluations: number;
    criticalStock: number;
    criticalStockValue: number;
    agedStock: number;
  };
};

const officialClosingRate = (item: OperationalPerformanceSeller | null | undefined) => {
  if (!item) return 0;
  const flow = Number(item.flowTotal || 0);
  const rawRate = Number(item.closingPercent || 0);
  const rawClosing = Number(item.closing || 0);
  if (flow > 0 && rawRate > 0 && rawRate <= 2 && Math.abs(rawRate - rawClosing) < 0.000001) return rawRate * 100;
  return rawRate;
};

const officialClosingCount = (item: OperationalPerformanceSeller | null | undefined) => {
  if (!item) return 0;
  const flow = Number(item.flowTotal || 0);
  const rate = officialClosingRate(item);
  if (flow > 0 && Number.isFinite(rate)) {
    const derived = (rate / 100) * flow;
    const rounded = Math.round(derived);
    return Math.abs(derived - rounded) < 0.02 ? rounded : Number(derived.toFixed(2));
  }
  return Number(item.closing || 0);
};

const aggregateSnapshot = (snapshot: OperationalPerformanceSnapshot | null) => {
  const sellers = snapshot?.sellers || [];
  const sales = sellers.reduce((sum, item) => sum + officialClosingCount(item), 0);
  const projection = sellers.reduce((sum, item) => sum + Number(item.projection || 0), 0);
  const captureQty = sellers.reduce((sum, item) => sum + Number(item.captureQty || 0), 0);
  const evaluations = sellers.reduce((sum, item) => sum + Number(item.evaluations || 0), 0);
  const marginTotal = sellers.reduce((sum, item) => sum + Number(item.marginTotal || 0), 0);
  const weightedMargin = sales > 0
    ? sellers.reduce((sum, item) => sum + Number(item.marginPercent || 0) * officialClosingCount(item), 0) / sales
    : 0;
  const capture = sales > 0 ? captureQty / sales * 100 : 0;
  const closingFlow = sellers.reduce((sum, item) => sum + Number(item.flowTotal || 0), 0);
  const closingRate = closingFlow > 0 ? sales / closingFlow * 100 : 0;
  return { sales, projection, capture, evaluations, margin: weightedMargin, marginTotal, closingRate };
};

const latestComparable = (history: OperationalPerformanceSnapshot[], currentDate: string) => {
  const currentMonth = currentDate.slice(0, 7);
  return history
    .filter(item => item.referenceDate?.startsWith(currentMonth) && item.referenceDate < currentDate)
    .sort((a, b) => a.referenceDate.localeCompare(b.referenceDate))
    .at(-1) || null;
};

const brl = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
}).format(value || 0);

export const buildManagerIntelligence = (context: ManagerAiContext): ManagerAiBrief => {
  const { snapshot, performanceHistory, stock, goals, sellerGoals = {} } = context;
  const current = aggregateSnapshot(snapshot);
  const previousSnapshot = snapshot ? latestComparable(performanceHistory, snapshot.referenceDate) : null;
  const previous = aggregateSnapshot(previousSnapshot);

  const projectionDelta = previousSnapshot ? current.projection - previous.projection : 0;
  const captureDelta = previousSnapshot ? current.capture - previous.capture : 0;
  const marginDelta = previousSnapshot ? current.margin - previous.margin : 0;

  const agedStock = stock.filter(item => Number(item.stockDays || 0) > 60);
  const criticalStock = stock.filter(item => Number(item.stockDays || 0) > 90);
  const criticalStockValue = criticalStock.reduce((sum, item) => sum + Number(item.cost || 0), 0);

  const signals: ManagerAiSignal[] = [];

  if (!snapshot) {
    signals.push({
      tone: 'critical', priority: 0,
      title: 'Mapa de Performance ausente',
      evidence: 'Sem o mapa atual, o DealMaster não consegue interpretar ritmo, margem, captura e equipe.',
      action: 'Importe o Mapa de Performance do dia antes de tomar decisões comerciais pelo painel.',
    });
  } else {
    if (current.projection < goals.monthlyGoal) {
      const gap = goals.monthlyGoal - current.projection;
      signals.push({
        tone: 'critical', priority: 0,
        title: `Projeção abaixo da meta em ${gap.toFixed(1)} venda(s)`,
        evidence: `A projeção atual é ${current.projection.toFixed(1)} para uma meta de ${goals.monthlyGoal}.${previousSnapshot ? ` Movimento desde o último mapa: ${projectionDelta >= 0 ? '+' : ''}${projectionDelta.toFixed(1)}.` : ''}`,
        action: projectionDelta > 0
          ? 'O ritmo está reagindo. Preserve as ações que elevaram a projeção e concentre gestão nos vendedores ainda abaixo do ritmo.'
          : 'Priorize geração de oportunidades, avaliações e avanço do funil antes de recorrer a desconto generalizado.',
      });
    } else {
      signals.push({
        tone: 'positive', priority: 5,
        title: 'Projeção da loja no ritmo da meta',
        evidence: `Projeção ${current.projection.toFixed(1)} para meta ${goals.monthlyGoal}.`,
        action: 'Proteja margem e captura enquanto mantém o ritmo comercial.',
      });
    }

    if (current.capture < goals.captureGoal) {
      signals.push({
        tone: 'attention', priority: 1,
        title: `Captura abaixo da meta em ${(goals.captureGoal - current.capture).toFixed(1)} p.p.`,
        evidence: `Captura atual ${current.capture.toFixed(1)}% para meta ${goals.captureGoal}%.${previousSnapshot ? ` Variação: ${captureDelta >= 0 ? '+' : ''}${captureDelta.toFixed(1)} p.p.` : ''}`,
        action: 'Aumente foco em negociações com troca e acompanhe vendedores com baixa captura antes do fechamento.',
      });
    }

    if (current.sales > 0 && current.margin < goals.marginGoal) {
      signals.push({
        tone: 'attention', priority: 1,
        title: `Margem MC abaixo da meta em ${(goals.marginGoal - current.margin).toFixed(1)} p.p.`,
        evidence: `MC atual ${current.margin.toFixed(1)}% para meta ${goals.marginGoal}%.${previousSnapshot ? ` Variação: ${marginDelta >= 0 ? '+' : ''}${marginDelta.toFixed(1)} p.p.` : ''}`,
        action: 'Evite usar preço como primeira resposta. Trabalhe valor, financiamento, troca e rentabilidade por negociação.',
      });
    }
  }

  if (criticalStock.length > 0) {
    signals.push({
      tone: criticalStock.length >= 5 ? 'critical' : 'attention',
      priority: criticalStock.length >= 5 ? 0 : 2,
      title: `${criticalStock.length} veículo(s) acima de 90 dias`,
      evidence: `${brl(criticalStockValue)} estão imobilizados na faixa crítica do estoque.`,
      action: 'Crie uma fila de ação para os +90 dias, priorizando preço, exposição, leads e proposta comercial por veículo.',
    });
  }

  const sellerFocus: SellerAiFocus[] = (snapshot?.sellers || []).map(seller => {
    const custom = sellerGoals[seller.sellerKey];
    const goal = custom?.monthly ?? goals.sellerMonthlyGoal;
    const captureGoal = custom?.capture ?? goals.sellerCaptureGoal;
    const marginGoal = custom?.margin ?? goals.sellerMarginGoal;
    const sales = officialClosingCount(seller);
    const projection = Number(seller.projection || 0);
    const capture = Number(seller.capturePercent || 0);
    const margin = Number(seller.marginPercent || 0);
    const evaluations = Number(seller.evaluations || 0);

    const reasons: string[] = [];
    if (projection < goal) reasons.push(`projeção ${projection.toFixed(1)}/${goal}`);
    if (capture < captureGoal) reasons.push(`captura ${capture.toFixed(1)}%`);
    if (sales > 0 && margin < marginGoal) reasons.push(`MC ${margin.toFixed(1)}%`);
    if (Number(seller.flowTotal || 0) > 0 && evaluations === 0) reasons.push('fluxo sem avaliações');

    return {
      seller: seller.seller,
      sellerKey: seller.sellerKey,
      sales,
      projection,
      goal,
      capture,
      captureGoal,
      margin,
      marginGoal,
      evaluations,
      reason: reasons.join(' · '),
    };
  }).filter(item => item.reason).sort((a, b) => {
    const gapA = Math.max(a.goal - a.projection, 0);
    const gapB = Math.max(b.goal - b.projection, 0);
    return gapB - gapA || a.capture - b.capture;
  }).slice(0, 4);

  sellerFocus.forEach((seller, index) => {
    signals.push({
      tone: 'attention', priority: 2 + index / 10,
      title: `${seller.seller}: atenção individual`,
      evidence: seller.reason,
      action: seller.projection < seller.goal
        ? 'Atue em atividade, avaliações e avanço do funil. Só pressione preço se o gargalo realmente for conversão final.'
        : seller.capture < seller.captureGoal
          ? 'Direcione negociações para captura e valorização da troca.'
          : 'Proteja rentabilidade e mantenha o ritmo.',
    });
  });

  const sortedSignals = signals.sort((a, b) => a.priority - b.priority).slice(0, 7);
  const criticalCount = sortedSignals.filter(item => item.tone === 'critical').length;
  const attentionCount = sortedSignals.filter(item => item.tone === 'attention').length;
  const status = criticalCount ? 'critical' : attentionCount ? 'attention' : 'healthy';

  const headline = status === 'critical'
    ? 'A operação exige ação em pontos específicos, não desconto generalizado.'
    : status === 'attention'
      ? 'A operação está controlável, mas há indicadores que pedem correção agora.'
      : 'A operação está equilibrada. O foco agora é preservar qualidade do resultado.';

  const summaryParts: string[] = [];
  if (snapshot) summaryParts.push(`${current.sales} vendas, projeção ${current.projection.toFixed(1)} para meta ${goals.monthlyGoal}`);
  if (current.sales > 0) summaryParts.push(`MC ${current.margin.toFixed(1)}% e captura ${current.capture.toFixed(1)}%`);
  if (criticalStock.length) summaryParts.push(`${criticalStock.length} carros +90 dias`);
  const summary = summaryParts.length
    ? `${summaryParts.join(' · ')}. ${previousSnapshot ? `Desde o último mapa, a projeção variou ${projectionDelta >= 0 ? '+' : ''}${projectionDelta.toFixed(1)}.` : 'O histórico ainda está começando.'}`
    : 'Importe os dados operacionais para iniciar a leitura inteligente.';

  return {
    status,
    headline,
    summary,
    signals: sortedSignals,
    sellerFocus,
    metrics: {
      sales: current.sales,
      projection: current.projection,
      projectionDelta,
      capture: current.capture,
      captureDelta,
      margin: current.margin,
      marginDelta,
      evaluations: current.evaluations,
      criticalStock: criticalStock.length,
      criticalStockValue,
      agedStock: agedStock.length,
    },
  };
};

const getClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada.');
  return new GoogleGenAI({ apiKey });
};

export const generateManagerAiBrief = async (brief: ManagerAiBrief): Promise<string> => {
  const ai = getClient();
  const signals = brief.signals.map((item, index) => `${index + 1}. [${item.tone}] ${item.title}. Evidência: ${item.evidence}. Ação sugerida: ${item.action}`).join('\n');
  const sellers = brief.sellerFocus.length
    ? brief.sellerFocus.map(item => `- ${item.seller}: ${item.reason}`).join('\n')
    : '- Nenhum vendedor em atenção prioritária.';

  const prompt = `
Você é o DealMaster AI, um copiloto de gestão comercial para concessionárias e lojas de seminovos.
Sua função é interpretar APENAS os dados e sinais fornecidos. Não invente números, causas, metas ou acontecimentos.

OBJETIVO:
Entregar um briefing executivo curto, claro e acionável para o gestor da loja.

REGRAS:
- Português do Brasil.
- No máximo 220 palavras.
- Não use linguagem genérica de coaching.
- Não recomende baixar preço sem evidência de gargalo na conversão ou estoque envelhecido.
- Diferencie problema de volume, captura, margem, atividade e estoque.
- Quando houver tendência, explique se o movimento melhorou, piorou ou ficou estável.
- Termine com "Prioridade de hoje:" e UMA ação principal.
- Use apenas texto simples, sem tabelas e sem títulos em Markdown com #.

RESUMO DO MOTOR DEALMASTER:
${brief.summary}

SINAIS PRIORIZADOS:
${signals}

VENDEDORES EM FOCO:
${sellers}

Escreva como um gerente master experiente analisando a operação antes da reunião diária.
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  return response.text?.trim() || 'Não foi possível gerar o briefing executivo agora.';
};
