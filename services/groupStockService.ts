import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface GroupStockItem {
  plate: string;
  model: string;
  stockOwner: string;
  location: string;
  days: number;
  cost: number;
  suggestedPrice: number;
  km: number;
  year: string;
  color: string;
  fuel: string;
  transmission: string;
  brand: string;
  status: string;
  transit: string;
  notices: string[];
  purchaseCompany?: string;
}

export interface GroupStockSnapshot {
  companyId: string;
  items: GroupStockItem[];
  sourceFile: string;
  sourceUpdatedAt?: string;
  importedAt: string;
  importedBy: string;
}

const safeId = (value: string) => String(value || 'empresa').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 120);
const documentId = (companyId: string) => `group_stock_${safeId(companyId)}`;
const refFor = (companyId: string) => doc(db, 'config', documentId(companyId));
const cleanPlate = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const normalizeItems = (items: GroupStockItem[]) => Array.from(new Map(
  items
    .map(item => ({
      ...item,
      plate: cleanPlate(item.plate),
      model: String(item.model || '').trim(),
      stockOwner: String(item.stockOwner || '').trim(),
      location: String(item.location || '').trim(),
      days: Number(item.days) || 0,
      cost: Number(item.cost) || 0,
      suggestedPrice: Number(item.suggestedPrice) || 0,
      km: Number(item.km) || 0,
      year: String(item.year || '').trim(),
      color: String(item.color || '').trim(),
      fuel: String(item.fuel || '').trim(),
      transmission: String(item.transmission || '').trim(),
      brand: String(item.brand || '').trim(),
      status: String(item.status || '').trim(),
      transit: String(item.transit || '').trim(),
      notices: (Array.isArray(item.notices) ? item.notices : []).map(value => String(value || '').trim()).filter(Boolean).slice(0, 3),
      ...(item.purchaseCompany ? { purchaseCompany: String(item.purchaseCompany).trim() } : {}),
    }))
    .filter(item => /^[A-Z0-9]{7}$/.test(item.plate))
    .map(item => [item.plate, item]),
).values());

export const groupStockService = {
  save: async (snapshot: GroupStockSnapshot) => {
    const items = normalizeItems(snapshot.items);
    if (!items.length) throw new Error('Nenhum veículo válido foi reconhecido no estoque compartilhado.');
    await setDoc(refFor(snapshot.companyId), {
      companyId: snapshot.companyId,
      items,
      sourceFile: snapshot.sourceFile,
      sourceUpdatedAt: snapshot.sourceUpdatedAt || '',
      importedAt: snapshot.importedAt,
      importedBy: snapshot.importedBy,
      rows: items.length,
      updatedAt: serverTimestamp(),
    }, { merge: false });
    return items.length;
  },

  subscribe: (companyId: string, onData: (snapshot: GroupStockSnapshot | null) => void, onError?: (error: unknown) => void) =>
    onSnapshot(refFor(companyId), snap => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data();
      onData({
        companyId: String(data.companyId || companyId),
        items: normalizeItems(Array.isArray(data.items) ? data.items as GroupStockItem[] : []),
        sourceFile: String(data.sourceFile || ''),
        sourceUpdatedAt: String(data.sourceUpdatedAt || ''),
        importedAt: String(data.importedAt || ''),
        importedBy: String(data.importedBy || ''),
      });
    }, onError),
};
