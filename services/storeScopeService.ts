import { Store, User } from '../types';
import { DEFAULT_STORE_ID, storeIdForUser } from './storeService';

const STORAGE_KEY = 'dealmaster:selected-store';
export const STORE_SCOPE_EVENT = 'dealmaster:store-scope-changed';

export const storeScopeService = {
  get: (user?: User | null) => {
    if (!user) return DEFAULT_STORE_ID;
    if (user.role !== 'admin') return storeIdForUser(user);
    try { return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_STORE_ID; }
    catch { return DEFAULT_STORE_ID; }
  },

  set: (storeId: string) => {
    try { window.localStorage.setItem(STORAGE_KEY, storeId || DEFAULT_STORE_ID); }
    catch {}
    window.dispatchEvent(new CustomEvent(STORE_SCOPE_EVENT, { detail: { storeId: storeId || DEFAULT_STORE_ID } }));
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
