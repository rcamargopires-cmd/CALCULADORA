import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Company, CompanyPlan, User } from '../types';

export const DEFAULT_COMPANY_ID = 'abrao-reze';

export const DEFAULT_COMPANY: Company = {
  id: DEFAULT_COMPANY_ID,
  slug: DEFAULT_COMPANY_ID,
  name: 'Abrão Reze',
  plan: 'enterprise',
  status: 'active',
  createdAt: '2026-08-01T00:00:00.000Z',
};

const CONFIG_REF = doc(db, 'config', 'companies');

const validPlan = (value: unknown): CompanyPlan => {
  const raw = String(value || '').toLowerCase();
  return raw === 'starter' || raw === 'pro' || raw === 'enterprise' ? raw : 'starter';
};

const normalizeCompanies = (raw: unknown): Company[] => {
  const list = Array.isArray(raw) ? raw : [];
  const parsed = list.map((item: any) => ({
    id: String(item?.id || '').trim(),
    slug: String(item?.slug || item?.id || '').trim(),
    name: String(item?.name || '').trim(),
    plan: validPlan(item?.plan),
    status: item?.status === 'suspended' ? 'suspended' : item?.status === 'trial' ? 'trial' : 'active',
    createdAt: String(item?.createdAt || new Date().toISOString()),
    trialEndsAt: item?.trialEndsAt ? String(item.trialEndsAt) : undefined,
  })).filter(item => item.id && item.name) as Company[];

  if (!parsed.some(item => item.id === DEFAULT_COMPANY_ID)) parsed.unshift(DEFAULT_COMPANY);
  return parsed;
};

export const companyIdForUser = (user?: Pick<User, 'companyId'> | null) => user?.companyId || DEFAULT_COMPANY_ID;

export const companyService = {
  getAll: async (): Promise<Company[]> => {
    const snap = await getDoc(CONFIG_REF);
    if (!snap.exists()) return [DEFAULT_COMPANY];
    return normalizeCompanies(snap.data()?.companies);
  },

  saveAll: async (companies: Company[]): Promise<void> => {
    await setDoc(CONFIG_REF, { companies: normalizeCompanies(companies), updatedAt: new Date().toISOString() }, { merge: true });
  },

  getName: (companies: Company[], companyId?: string) =>
    companies.find(company => company.id === (companyId || DEFAULT_COMPANY_ID))?.name || DEFAULT_COMPANY.name,
};
