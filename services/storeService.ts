import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
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
const directorScopeRef = (companyId: string) => doc(db, 'director_scope', companyId || DEFAULT_COMPANY_ID);

const normalizeStores = (raw: unknown, includeDefault = true): Store[] => {
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

  if (includeDefault && !parsed.some(item => item.id === DEFAULT_STORE_ID)) parsed.unshift(DEFAULT_STORE);
  return parsed;
};

const currentProfile = async (): Promise<User | null> => {
  const email = auth.currentUser?.email;
  if (!email) return null;
  try {
    const snap = await getDoc(doc(db, 'users', email));
    return snap.exists() ? snap.data() as User : null;
  } catch {
    return null;
  }
};

const readMasterStores = async (): Promise<Store[]> => {
  try {
    const snap = await getDoc(CONFIG_REF);
    if (!snap.exists()) return [DEFAULT_STORE];
    return normalizeStores(snap.data()?.stores);
  } catch {
    return [DEFAULT_STORE];
  }
};

const readDirectorStores = async (companyId: string): Promise<Store[]> => {
  const tenant = companyId || DEFAULT_COMPANY_ID;
  try {
    const snap = await getDoc(directorScopeRef(tenant));
    if (!snap.exists()) return tenant === DEFAULT_COMPANY_ID ? [DEFAULT_STORE] : [];
    const scoped = normalizeStores(snap.data()?.stores, false)
      .filter(store => storeCompanyId(store) === tenant);
    if (!scoped.length && tenant === DEFAULT_COMPANY_ID) return [DEFAULT_STORE];
    return scoped;
  } catch {
    return tenant === DEFAULT_COMPANY_ID ? [DEFAULT_STORE] : [];
  }
};

const writeDirectorScope = async (companyId: string, stores: Store[]) => {
  const tenant = companyId || DEFAULT_COMPANY_ID;
  const scoped = stores.filter(store => (store.companyId || DEFAULT_COMPANY_ID) === tenant);
  await setDoc(directorScopeRef(tenant), {
    companyId: tenant,
    stores: scoped,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
};

export const storeIdForUser = (user?: Pick<User, 'storeId'> | null) => user?.storeId || DEFAULT_STORE_ID;
export const storeCompanyId = (store?: Pick<Store, 'companyId'> | null) => store?.companyId || DEFAULT_COMPANY_ID;

export const storeService = {
  getAll: async (): Promise<Store[]> => {
    const profile = await currentProfile();
    if (profile?.role === 'director') {
      return readDirectorStores(profile.companyId || DEFAULT_COMPANY_ID);
    }
    return readMasterStores();
  },

  getDirectorStores: async (companyId: string): Promise<Store[]> =>
    readDirectorStores(companyId || DEFAULT_COMPANY_ID),

  getByCompany: async (companyId: string): Promise<Store[]> => {
    const stores = await storeService.getAll();
    return stores.filter(store => storeCompanyId(store) === (companyId || DEFAULT_COMPANY_ID));
  },

  syncDirectorScope: async (companyId: string): Promise<void> => {
    const stores = await readMasterStores();
    await writeDirectorScope(companyId || DEFAULT_COMPANY_ID, stores);
  },

  saveAll: async (stores: Store[]): Promise<void> => {
    const normalized = normalizeStores(stores);
    await setDoc(CONFIG_REF, { stores: normalized, updatedAt: new Date().toISOString() }, { merge: true });
    const companies = Array.from(new Set(normalized.map(store => storeCompanyId(store))));
    await Promise.all(companies.map(companyId => writeDirectorScope(companyId, normalized)));
  },

  getName: (stores: Store[], storeId?: string) =>
    stores.find(store => store.id === (storeId || DEFAULT_STORE_ID))?.name || DEFAULT_STORE.name,
};
