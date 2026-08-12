import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Store, User } from '../types';
import { DEFAULT_COMPANY_ID } from './companyService';

export const DEFAULT_STORE_ID = 'outlet-sorocaba';

export const DEFAULT_STORE: Store = {
  id: DEFAULT_STORE_ID,
  code: 'OUTLET',
  name: 'Outlet Sorocaba',
  active: true,
  companyId: DEFAULT_COMPANY_ID,
};

const CONFIG_REF = doc(db, 'config', 'multistore');

const normalizeStores = (raw: unknown): Store[] => {
  const list = Array.isArray(raw) ? raw : [];
  const parsed = list
    .map((item: any) => ({
      id: String(item?.id || '').trim(),
      code: String(item?.code || '').trim().toUpperCase(),
      name: String(item?.name || '').trim(),
      active: item?.active !== false,
      companyId: String(item?.companyId || DEFAULT_COMPANY_ID).trim(),
    }))
    .filter(item => item.id && item.name);

  if (!parsed.some(item => item.id === DEFAULT_STORE_ID)) parsed.unshift(DEFAULT_STORE);
  return parsed;
};

export const storeIdForUser = (user?: Pick<User, 'storeId'> | null) => user?.storeId || DEFAULT_STORE_ID;
export const storeCompanyId = (store?: Pick<Store, 'companyId'> | null) => store?.companyId || DEFAULT_COMPANY_ID;

export const storeService = {
  getAll: async (): Promise<Store[]> => {
    const snap = await getDoc(CONFIG_REF);
    if (!snap.exists()) return [DEFAULT_STORE];
    return normalizeStores(snap.data()?.stores);
  },

  getByCompany: async (companyId: string): Promise<Store[]> => {
    const stores = await storeService.getAll();
    return stores.filter(store => storeCompanyId(store) === (companyId || DEFAULT_COMPANY_ID));
  },

  saveAll: async (stores: Store[]): Promise<void> => {
    const normalized = normalizeStores(stores);
    await setDoc(CONFIG_REF, { stores: normalized, updatedAt: new Date().toISOString() }, { merge: true });
  },

  getName: (stores: Store[], storeId?: string) =>
    stores.find(store => store.id === (storeId || DEFAULT_STORE_ID))?.name || DEFAULT_STORE.name,
};
