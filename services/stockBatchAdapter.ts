import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { OperationalStockItem, User } from '../types';
import { companyScopeService } from './companyScopeService';
import { DEFAULT_COMPANY_ID } from './companyService';
import { storeScopedOperationalService } from './storeScopedOperationalService';

// Every stock import is a full replacement of the store's active inventory.
// Older rows remain stored only for compatibility/history, but are never mixed
// into the current operational stock after a new batch is activated.
type BatchedStockItem = OperationalStockItem & { importBatchId?: string };

const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 120);
const currentId = (storeId: string) => `current_${safeId(storeId)}`;
const newBatchId = (companyId: string, storeId: string, snapshotDate: string) =>
  safeId(`${companyId}_${storeId}_${snapshotDate}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

const rawImportStock = storeScopedOperationalService.importStock.bind(storeScopedOperationalService);
const rawGetLatestStock = storeScopedOperationalService.getLatestStock.bind(storeScopedOperationalService);

storeScopedOperationalService.importStock = async (
  items: OperationalStockItem[],
  fileName: string,
  user: User | undefined,
  storeId: string,
  companyId = companyScopeService.get(),
) => {
  if (!items.length) throw new Error('Nenhuma linha de estoque reconhecida no arquivo.');
  const tenant = companyId || DEFAULT_COMPANY_ID;
  const snapshotDate = items[0].snapshotDate;
  const importBatchId = newBatchId(tenant, storeId, snapshotDate);
  const batched = items.map(item => ({ ...item, importBatchId })) as BatchedStockItem[];

  const count = await rawImportStock(batched, fileName, user, storeId, tenant);

  await setDoc(doc(db, 'operational_meta', currentId(storeId)), {
    companyId: tenant,
    storeId,
    latestStockDate: snapshotDate,
    latestStockBatchId: importBatchId,
    stockRows: count,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return count;
};

storeScopedOperationalService.getLatestStock = async (
  storeId: string,
  companyId = companyScopeService.get(),
): Promise<OperationalStockItem[]> => {
  const tenant = companyId || DEFAULT_COMPANY_ID;
  const rows = await rawGetLatestStock(storeId, tenant) as BatchedStockItem[];
  if (!rows.length) return [];

  try {
    const current = await getDoc(doc(db, 'operational_meta', currentId(storeId)));
    const data = current.exists() ? current.data() : null;
    const batchId = String(data?.latestStockBatchId || '');
    if (!batchId) return rows;
    return rows.filter(item => item.importBatchId === batchId);
  } catch {
    return rows;
  }
};
