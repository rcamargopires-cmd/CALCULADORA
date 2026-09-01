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
  const headerIndex = matrix.findIndex(row =>
    row.some((cell: any) => normalize(String(cell)) === 'status') &&
    row.some((cell: any) => normalize(String(cell)) === 'placa')
  );
  if (headerIndex < 0) return [];

  const headers = matrix[headerIndex].map((header: any) => normalize(String(header)));
  const idx = (...names: string[]) => headers.findIndex((header: string) => names.map(normalize).includes(header));
  const iStatus = idx('status');
  const iModel = idx('modelo / anuncio', 'modelo / anúncio');
  const iPlate = idx('placa');
  const iKm = idx('km site');
  const iPrice = idx('preco site', 'preço site');
  const iPhotos = idx('fotos');
  const iPhotoStatus = idx('status fotos');
  const iAlert = idx('alerta / acao', 'alerta / ação');
  const iUrl = idx('url/fonte');
  const iAudit = idx('auditado em');

  return matrix.slice(headerIndex + 1).map((row: any[]) => {
    const plate = cleanPlate(row[iPlate]);
    if (!looksLikePlate(plate)) return null;

    const rawStatus = normalize(String(row[iStatus] ?? ''));
    const rawPhoto = normalize(String(row[iPhotoStatus] ?? ''));
    const adStatus: MarketPresenceItem['adStatus'] = rawStatus.includes('sem anuncio') ? 'missing' : 'active';
    let photoStatus: MarketPresenceItem['photoStatus'] = 'not_validated';
    if (adStatus === 'missing' || rawPhoto.includes('sem anuncio')) photoStatus = 'missing';
    else if (rawPhoto === 'ok') photoStatus = 'ok';
    else if (rawPhoto.includes('insuficiente')) photoStatus = 'insufficient';

    return {
      id: `${referenceDate}_${plate}`,
      referenceDate,
      plate,
      vehicle: String(row[iModel] ?? ''),
      adStatus,
      photoStatus,
      ...(row[iPhotos] !== '' ? { photoCount: toNumber(row[iPhotos]) } : {}),
      ...(row[iPrice] !== '' ? { sitePrice: toNumber(row[iPrice]) } : {}),
      ...(row[iKm] !== '' ? { siteKm: toNumber(row[iKm]) } : {}),
      alert: String(row[iAlert] ?? ''),
      url: String(row[iUrl] ?? ''),
      auditedAt: String(row[iAudit] ?? referenceDate),
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
    if (audit.length) {
      const auditCount = await marketPresenceService.importAudit(audit, fileName, user, storeId, companyId);
      window.dispatchEvent(new CustomEvent('motyq:unified-stock-audit-imported', {
        detail: { stockCount: count, auditCount, fileName },
      }));
    }
  } catch (error) {
    console.warn('Motyq: estoque atualizado, mas a Auditoria Site não pôde ser importada automaticamente.', error);
    window.dispatchEvent(new CustomEvent('motyq:unified-stock-audit-warning'));
  } finally {
    pendingFiles.delete(fileName);
  }

  return count;
};
