import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { OperationalPerformanceSeller, OperationalPerformanceSnapshot, OperationalSaleItem, OperationalStockItem, User } from '../types';

const clean = (value: unknown) => String(value ?? '').trim();
export const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 120);

export type OperationalStockHistoryPoint = {
  referenceDate: string;
  stockCount: number;
  stockValue: number;
  aged60: number;
  critical90: number;
  critical90Value: number;
};

export const parseNumber = (value: unknown) => {
  const raw = clean(value).replace(/R\$/gi, '').replace(/%/g, '').replace(/\s/g, '');
  if (!raw || /^#/.test(raw)) return 0;
  if (raw.includes(',') && raw.includes('.')) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  if (raw.includes(',')) return Number(raw.replace(',', '.')) || 0;
  return Number(raw) || 0;
};

const asPercent = (value: unknown) => {
  const n = parseNumber(value);
  return Math.abs(n) <= 1 ? n * 100 : n;
};

const parseBoolean = (value: unknown) => {
  const v = normalize(clean(value));
  return ['sim', 's', 'yes', 'y', '1', 'com troca', 'troca', 'captura'].includes(v);
};

const detectDelimiter = (line: string) => {
  const candidates = [';', ',', '\t'];
  return candidates.sort((a, b) => line.split(b).length - line.split(a).length)[0];
};

const splitCsvLine = (line: string, delimiter: string) => {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      out.push(current.trim()); current = '';
    } else current += char;
  }
  out.push(current.trim());
  return out;
};

export const parseCsv = (text: string) => {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [] as Record<string, string>[];
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map(h => normalize(h));
  return lines.slice(1).map(line => {
    const values = splitCsvLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => row[h] = values[i] ?? '');
    return row;
  }).filter(row => Object.values(row).some(Boolean));
};

const valueByAliases = (row: Record<string, string>, aliases: string[]) => {
  for (const alias of aliases) {
    const key = normalize(alias);
    if (row[key] !== undefined && clean(row[key]) !== '') return row[key];
  }
  return '';
};

const aliases = {
  plate: ['placa', 'placa veiculo', 'placa do veiculo'],
  vehicle: ['veiculo', 'modelo', 'descricao', 'modelo veiculo', 'descricao veiculo'],
  stockDays: ['dias estoque', 'dias de estoque', 'dias patio', 'dias de patio', 'idade estoque', 'permanencia'],
  cost: ['custo', 'valor custo', 'custo veiculo', 'valor de custo'],
  fipe: ['fipe', 'valor fipe', 'tabela fipe'],
  askingPrice: ['preco', 'preco venda', 'preco anunciado', 'valor anunciado', 'valor venda'],
  location: ['local', 'unidade', 'loja', 'localizacao'],
  status: ['status', 'situacao'],
  saleDate: ['data', 'data venda', 'data faturamento', 'dt faturamento', 'faturado em'],
  seller: ['vendedor', 'consultor', 'nome vendedor'],
  invoiceValue: ['valor nf', 'nota fiscal', 'valor nota fiscal', 'valor faturado', 'faturamento'],
  marginValue: ['margem valor', 'margem r', 'margem rs', 'valor margem', 'lucro', 'margem'],
  marginPercent: ['margem percentual', 'margem %', 'percentual margem', 'margem percent'],
  tradeIn: ['troca', 'captura', 'com troca', 'tem troca'],
};

const performanceAliases = {
  seller: ['vendedor'],
  passages: ['passagens'],
  orders: ['pedido'],
  flowTotal: ['fluxo total'],
  orderPercent: ['pedido %', 'pedido percentual'],
  workInPeriod: ['trab no periodo', 'trabalho no periodo'],
  avgContactsPerDay: ['media contatos por dia'],
  evaluations: ['quantida avaliacao', 'quantidade avaliacao', 'quantidade de avaliacao'],
  evaluationRate: ['% taxa avaliacao', 'taxa avaliacao'],
  closing: ['fechamento'],
  syonetSales: ['vendas syonet'],
  closingPercent: ['% fechamento', 'fechamento %'],
  marginPerCar: ['mc por carro'],
  marginTotal: ['mc total'],
  marginPercent: ['% mc', 'mc %'],
  captureQty: ['qtde captura', 'quantidade captura'],
  capturePercent: ['% captura', 'captura %'],
  pipeline: ['caixa d agua', 'caixa dagua'],
  projection: ['projecao vendedor'],
  additionalPurchase: ['compra adicional'],
};

const normalizeDate = (raw: string, fallback: string) => {
  const v = clean(raw);
  if (!v) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const br = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }
  return fallback;
};

export const mapStockRows = (rows: Record<string, string>[], snapshotDate: string): OperationalStockItem[] => rows.map((row, index) => {
  const plate = clean(valueByAliases(row, aliases.plate)).toUpperCase();
  const vehicle = clean(valueByAliases(row, aliases.vehicle));
  const key = plate || `linha-${index + 1}`;
  return {
    id: safeId(`${snapshotDate}_${key}`),
    snapshotDate,
    plate,
    vehicle,
    stockDays: parseNumber(valueByAliases(row, aliases.stockDays)),
    cost: parseNumber(valueByAliases(row, aliases.cost)),
    fipe: parseNumber(valueByAliases(row, aliases.fipe)),
    askingPrice: parseNumber(valueByAliases(row, aliases.askingPrice)),
    location: clean(valueByAliases(row, aliases.location)),
    status: clean(valueByAliases(row, aliases.status)),
  };
}).filter(item => item.plate || item.vehicle);

export const mapSalesRows = (rows: Record<string, string>[], referenceDate: string): OperationalSaleItem[] => rows.map((row, index) => {
  const saleDate = normalizeDate(valueByAliases(row, aliases.saleDate), referenceDate);
  const plate = clean(valueByAliases(row, aliases.plate)).toUpperCase();
  const vehicle = clean(valueByAliases(row, aliases.vehicle));
  const invoiceValue = parseNumber(valueByAliases(row, aliases.invoiceValue));
  const marginValue = parseNumber(valueByAliases(row, aliases.marginValue));
  let marginPercent = parseNumber(valueByAliases(row, aliases.marginPercent));
  if (!marginPercent && invoiceValue) marginPercent = (marginValue / invoiceValue) * 100;
  const tradeRaw = valueByAliases(row, aliases.tradeIn);
  const key = plate || `${normalize(vehicle)}-${index + 1}`;
  return {
    id: safeId(`${saleDate}_${key}`),
    saleDate,
    plate,
    vehicle,
    seller: clean(valueByAliases(row, aliases.seller)),
    invoiceValue,
    marginValue,
    marginPercent,
    hasTradeIn: clean(tradeRaw) ? parseBoolean(tradeRaw) : undefined,
  };
}).filter(item => item.plate || item.vehicle || item.invoiceValue);

export const mapPerformanceRows = (rows: Record<string, string>[]): { sellers: OperationalPerformanceSeller[]; total?: OperationalPerformanceSeller } => {
  const mapped = rows.map(row => {
    const seller = clean(valueByAliases(row, performanceAliases.seller));
    if (!seller) return null;
    const item: OperationalPerformanceSeller = {
      seller,
      sellerKey: normalize(seller),
      passages: parseNumber(valueByAliases(row, performanceAliases.passages)),
      orders: parseNumber(valueByAliases(row, performanceAliases.orders)),
      flowTotal: parseNumber(valueByAliases(row, performanceAliases.flowTotal)),
      orderPercent: asPercent(valueByAliases(row, performanceAliases.orderPercent)),
      workInPeriod: parseNumber(valueByAliases(row, performanceAliases.workInPeriod)),
      avgContactsPerDay: parseNumber(valueByAliases(row, performanceAliases.avgContactsPerDay)),
      evaluations: parseNumber(valueByAliases(row, performanceAliases.evaluations)),
      evaluationRate: asPercent(valueByAliases(row, performanceAliases.evaluationRate)),
      closing: parseNumber(valueByAliases(row, performanceAliases.closing)),
      syonetSales: parseNumber(valueByAliases(row, performanceAliases.syonetSales)),
      closingPercent: asPercent(valueByAliases(row, performanceAliases.closingPercent)),
      marginPerCar: parseNumber(valueByAliases(row, performanceAliases.marginPerCar)),
      marginTotal: parseNumber(valueByAliases(row, performanceAliases.marginTotal)),
      marginPercent: asPercent(valueByAliases(row, performanceAliases.marginPercent)),
      captureQty: parseNumber(valueByAliases(row, performanceAliases.captureQty)),
      capturePercent: asPercent(valueByAliases(row, performanceAliases.capturePercent)),
      pipeline: parseNumber(valueByAliases(row, performanceAliases.pipeline)),
      projection: parseNumber(valueByAliases(row, performanceAliases.projection)),
      additionalPurchase: parseNumber(valueByAliases(row, performanceAliases.additionalPurchase)),
    };
    return item;
  }).filter(Boolean) as OperationalPerformanceSeller[];
  const total = mapped.find(i => i.sellerKey === 'total');
  return { sellers: mapped.filter(i => i.sellerKey !== 'total'), total };
};

export const operationalDataService = {
  importStock: async (items: OperationalStockItem[], fileName: string, user?: User) => {
    if (!items.length) throw new Error('Nenhuma linha de estoque reconhecida no arquivo.');
    for (const item of items) await setDoc(doc(db, 'operational_stock', item.id), item, { merge: true });
    const snapshotDate = items[0].snapshotDate;
    const stockValue = items.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
    const aged60 = items.filter(item => Number(item.stockDays) > 60).length;
    const critical = items.filter(item => Number(item.stockDays) > 90);
    const critical90Value = critical.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
    await setDoc(doc(db, 'operational_meta', `stock_summary_${safeId(snapshotDate)}`), {
      referenceDate: snapshotDate,
      stockCount: items.length,
      stockValue,
      aged60,
      critical90: critical.length,
      critical90Value,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await setDoc(doc(db, 'operational_meta', 'current'), { latestStockDate: snapshotDate, stockRows: items.length, updatedAt: serverTimestamp() }, { merge: true });
    await addDoc(collection(db, 'operational_imports'), { type: 'stock', referenceDate: snapshotDate, rows: items.length, fileName, importedBy: user?.email || '', importedAt: serverTimestamp() });
    return items.length;
  },

  importSales: async (items: OperationalSaleItem[], fileName: string, referenceDate: string, user?: User) => {
    if (!items.length) throw new Error('Nenhuma venda reconhecida no arquivo.');
    for (const item of items) await setDoc(doc(db, 'operational_sales', item.id), item, { merge: true });
    await setDoc(doc(db, 'operational_meta', 'current'), { latestSalesImportDate: referenceDate, salesRowsLastImport: items.length, updatedAt: serverTimestamp() }, { merge: true });
    await addDoc(collection(db, 'operational_imports'), { type: 'sales', referenceDate, rows: items.length, fileName, importedBy: user?.email || '', importedAt: serverTimestamp() });
    return items.length;
  },

  importPerformance: async (snapshot: OperationalPerformanceSnapshot, fileName: string, user?: User) => {
    if (!snapshot.sellers.length) throw new Error('Nenhum vendedor reconhecido no mapa.');
    const id = `performance_${safeId(snapshot.referenceDate)}`;
    await setDoc(doc(db, 'operational_meta', id), {
      ...snapshot,
      sourceFile: fileName,
      importedBy: user?.email || '',
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await setDoc(doc(db, 'operational_meta', 'current'), {
      latestPerformanceDate: snapshot.referenceDate,
      performanceRowsLastImport: snapshot.sellers.length,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await addDoc(collection(db, 'operational_imports'), {
      type: 'performance',
      referenceDate: snapshot.referenceDate,
      rows: snapshot.sellers.length,
      fileName,
      importedBy: user?.email || '',
      importedAt: serverTimestamp(),
    });
    return snapshot.sellers.length;
  },

  getLatestStock: async (): Promise<OperationalStockItem[]> => {
    const meta = await getDoc(doc(db, 'operational_meta', 'current'));
    const latest = meta.exists() ? String(meta.data().latestStockDate || '') : '';
    if (!latest) return [];
    const snap = await getDocs(query(collection(db, 'operational_stock'), where('snapshotDate', '==', latest)));
    return snap.docs.map(d => d.data() as OperationalStockItem);
  },

  getSales: async (): Promise<OperationalSaleItem[]> => {
    const snap = await getDocs(collection(db, 'operational_sales'));
    return snap.docs.map(d => d.data() as OperationalSaleItem);
  },

  getLatestPerformance: async (): Promise<OperationalPerformanceSnapshot | null> => {
    const meta = await getDoc(doc(db, 'operational_meta', 'current'));
    const latest = meta.exists() ? String(meta.data().latestPerformanceDate || '') : '';
    if (!latest) return null;
    const snap = await getDoc(doc(db, 'operational_meta', `performance_${safeId(latest)}`));
    return snap.exists() ? snap.data() as OperationalPerformanceSnapshot : null;
  },

  getPerformanceHistory: async (): Promise<OperationalPerformanceSnapshot[]> => {
    const snap = await getDocs(collection(db, 'operational_meta'));
    return snap.docs
      .filter(item => item.id.startsWith('performance_'))
      .map(item => item.data() as OperationalPerformanceSnapshot)
      .filter(item => !!item.referenceDate && Array.isArray(item.sellers))
      .sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
  },

  getStockHistory: async (): Promise<OperationalStockHistoryPoint[]> => {
    const snap = await getDocs(collection(db, 'operational_meta'));
    return snap.docs
      .filter(item => item.id.startsWith('stock_summary_'))
      .map(item => item.data() as OperationalStockHistoryPoint)
      .filter(item => !!item.referenceDate)
      .sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
  },
};
