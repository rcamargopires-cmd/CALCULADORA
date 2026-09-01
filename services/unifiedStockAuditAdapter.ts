import * as XLSX from 'xlsx';
import { MarketPresenceItem } from '../types';
import { normalize } from './operationalDataService';
import { marketPresenceService } from './marketPresenceService';
import { stockSnapshotService } from './stockSnapshotService';

const pendingFiles = new Map<string, File>();

const cleanPlate = (value: unknown) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const looksLikePlate = (value: unknown) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(cleanPlate(value));
const toNumber = (value: unknown) => {
  const raw = String(value ?? '').trim().replace(/R\$/gi, '').replace(/%/g, '').replace(/\s/g, '');
  if (!raw || raw.startsWith('#')) return 0;
  if (raw.includes(',') && raw.includes('.')) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  if (raw.includes(',')) return Number(raw.replace(',', '.')) || 0;
  return Number(raw) || 0;
};

const parseAuditSheet = async (file: File, referenceDate: string): Promise<MarketPresenceItem[]> => {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheetName = wb.SheetNames.find(name => normalize(name) === 'auditoria site');
  if (!sheetName) return [];

  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '', raw: true });

  const headerIndex = matrix.findIndex(row => {
    const normalized = row.map((cell: any) => normalize(String(cell)));
    const hasPlate = normalized.includes('placa');
    const hasStatus = normalized.some((value: string) => ['status', 'status anuncio'].includes(value));
    return hasPlate && hasStatus;
  });
  if (headerIndex < 0) return [];

  const headers = matrix[headerIndex].map((header: any) => normalize(String(header)));
  const idx = (...names: string[]) => {
    const wanted = names.map(normalize);
    return headers.findIndex((header: string) => wanted.includes(header));
  };

  const iStatus = idx('status', 'status anuncio', 'status anúncio');
  const iModel = idx('modelo / anuncio', 'modelo / anúncio');
  const iPlate = idx('placa');
  const iKm = idx('km site');
  const iPrice = idx('preco site', 'preço site');
  const iPhotos = idx('fotos');
  const iPhotoStatus = idx('status fotos');
  const iAlert = idx('alerta / acao', 'alerta / ação');
  const iUrl = idx('url', 'url/fonte', 'url / fonte');
  const iAudit = idx('data auditoria', 'auditado em', 'data da auditoria');

  if (iStatus < 0 || iPlate < 0) return [];

  return matrix.slice(headerIndex + 1).map((row: any[]) => {
    const plate = cleanPlate(row[iPlate]);
    if (!looksLikePlate(plate)) return null;

    const rawStatus = normalize(String(row[iStatus] ?? ''));
    const rawPhoto = iPhotoStatus >= 0 ? normalize(String(row[iPhotoStatus] ?? '')) : '';
    const adStatus: MarketPresenceItem['adStatus'] = rawStatus.includes('sem anuncio') ? 'missing' : 'active';

    let photoStatus: MarketPresenceItem['photoStatus'] = 'not_validated';
    if (adStatus === 'missing' || rawPhoto.includes('sem anuncio')) photoStatus = 'missing';
    else if (rawPhoto === 'ok') photoStatus = 'ok';
    else if (
      rawPhoto.includes('insuficiente') ||
      rawPhoto.includes('apenas') ||
      rawPhoto.includes('1 foto') ||
      rawPhoto.includes('uma foto')
    ) photoStatus = 'insufficient';

    const auditedRaw = iAudit >= 0 ? row[iAudit] : referenceDate;
    const auditedAt = auditedRaw instanceof Date ? auditedRaw.toISOString() : String(auditedRaw || referenceDate);

    return {
      id: `${referenceDate}_${plate}`,
      referenceDate,
      plate,
      vehicle: iModel >= 0 ? String(row[iModel] ?? '') : '',
      adStatus,
      photoStatus,
      ...(iPhotos >= 0 && row[iPhotos] !== '' ? { photoCount: toNumber(row[iPhotos]) } : {}),
      ...(iPrice >= 0 && row[iPrice] !== '' ? { sitePrice: toNumber(row[iPrice]) } : {}),
      ...(iKm >= 0 && row[iKm] !== '' ? { siteKm: toNumber(row[iKm]) } : {}),
      alert: iAlert >= 0 ? String(row[iAlert] ?? '') : '',
      url: iUrl >= 0 ? String(row[iUrl] ?? '') : '',
      auditedAt,
    } as MarketPresenceItem;
  }).filter(Boolean) as MarketPresenceItem[];
};

if (typeof document !== 'undefined') {
  document.addEventListener('change', event => {
    const input = event.target as HTMLInputElement | null;
    if (!input || input.type !== 'file') return;
    const file = input.files?.[0];
    if (!file || !/\.(xls|xlsx)$/i.test(file.name)) return;
    pendingFiles.set(file.name, file);
  }, true);
}

const originalReplace = stockSnapshotService.replace.bind(stockSnapshotService);

stockSnapshotService.replace = async (items, fileName, user, storeId, companyId) => {
  const count = await originalReplace(items, fileName, user, storeId, companyId);
  const file = pendingFiles.get(fileName);
  if (!file) return count;

  try {
    const referenceDate = items[0]?.snapshotDate || new Date().toISOString().slice(0, 10);
    const audit = await parseAuditSheet(file, referenceDate);
    if (!audit.length) {
      window.dispatchEvent(new CustomEvent('motyq:unified-stock-audit-warning'));
      return count;
    }

    const auditCount = await marketPresenceService.importAudit(audit, fileName, user, storeId, companyId);
    window.dispatchEvent(new CustomEvent('motyq:unified-stock-audit-imported', {
      detail: { stockCount: count, auditCount, fileName },
    }));
  } catch (error) {
    console.warn('Motyq: estoque atualizado, mas a Auditoria Site não pôde ser importada automaticamente.', error);
    window.dispatchEvent(new CustomEvent('motyq:unified-stock-audit-warning'));
  } finally {
    pendingFiles.delete(fileName);
  }

  return count;
};
