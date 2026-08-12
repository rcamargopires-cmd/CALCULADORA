import { Store, User } from '../types';
import { DEFAULT_STORE_ID, storeIdForUser } from './storeService';

const STORAGE_KEY = 'dealmaster:selected-store';
export const STORE_SCOPE_EVENT = 'dealmaster:store-scope-changed';

const readStored = () => {
  try { return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_STORE_ID; }
  catch { return DEFAULT_STORE_ID; }
};

export const storeScopeService = {
  get: (user?: User | null) => {
    if (!user) return readStored();
    if (user.role !== 'admin') return storeIdForUser(user);
    return readStored();
  },

  set: (storeId: string) => {
    const next = storeId || DEFAULT_STORE_ID;
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch {}
    window.dispatchEvent(new CustomEvent(STORE_SCOPE_EVENT, { detail: { storeId: next } }));
  },

  ensureValid: (stores: Store[], user?: User | null) => {
    const current = storeScopeService.get(user);
    const valid = stores.some(store => store.active && store.id === current);
    if (valid) return current;
    const fallback = user && user.role !== 'admin' ? storeIdForUser(user) : DEFAULT_STORE_ID;
    storeScopeService.set(fallback);
    return fallback;
  },
};
