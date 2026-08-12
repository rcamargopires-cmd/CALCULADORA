import { Company, User } from '../types';
import { companyIdForUser, DEFAULT_COMPANY_ID } from './companyService';

const STORAGE_KEY = 'dealmaster:selected-company';
export const COMPANY_SCOPE_EVENT = 'dealmaster:company-scope-changed';

export const companyScopeService = {
  get: (user?: User | null) => {
    if (!user) return DEFAULT_COMPANY_ID;
    if (user.role !== 'admin') return companyIdForUser(user);
    try { return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_COMPANY_ID; }
    catch { return DEFAULT_COMPANY_ID; }
  },

  set: (companyId: string) => {
    const next = companyId || DEFAULT_COMPANY_ID;
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch {}
    window.dispatchEvent(new CustomEvent(COMPANY_SCOPE_EVENT, { detail: { companyId: next } }));
  },

  ensureValid: (companies: Company[], user?: User | null) => {
    const current = companyScopeService.get(user);
    const valid = companies.some(company => company.status !== 'suspended' && company.id === current);
    if (valid) return current;
    const fallback = user && user.role !== 'admin' ? companyIdForUser(user) : DEFAULT_COMPANY_ID;
    companyScopeService.set(fallback);
    return fallback;
  },
};
