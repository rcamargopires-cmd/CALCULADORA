import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Company, CompanyBilling, CompanyPlan, DealMasterModule, User } from '../types';

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
const MODULE_IDS: DealMasterModule[] = ['dealGuard','goalTrack','myPerformance','commandCenter','stockIntelligence','trends','smartAlerts','executiveInsights','aiManager','assetGuard','multiStore','groupOverview','dmsConnect'];

const validPlan = (value: unknown): CompanyPlan => {
  const raw = String(value || '').toLowerCase();
  return raw === 'starter' || raw === 'pro' || raw === 'enterprise' ? raw : 'starter';
};

const normalizeBilling = (value: unknown): CompanyBilling | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const enabled = raw.enabled === true;
  const dueValue = Number(raw.dueDay);
  const graceValue = Number(raw.graceDays);
  const dueDay = Math.min(28, Math.max(1, Number.isFinite(dueValue) && dueValue > 0 ? dueValue : 10));
  const graceDays = Math.min(30, Math.max(0, Number.isFinite(graceValue) ? graceValue : 3));
  const nextDueAt = String(raw.nextDueAt || '').slice(0, 10);
  const manualGraceUntil = String(raw.manualGraceUntil || '').slice(0, 10);
  const lastPaidAt = String(raw.lastPaidAt || '');
  const updatedAt = String(raw.updatedAt || '');
  return {
    enabled,
    dueDay,
    nextDueAt,
    graceDays,
    ...(manualGraceUntil ? { manualGraceUntil } : {}),
    ...(raw.manualBlocked === true ? { manualBlocked: true } : {}),
    ...(lastPaidAt ? { lastPaidAt } : {}),
    ...(['manual','asaas','stripe','mercadopago','other'].includes(String(raw.provider||'')) ? { provider: String(raw.provider) as CompanyBilling['provider'] } : {}),
    ...(String(raw.paymentUrl||'').trim() ? { paymentUrl: String(raw.paymentUrl).trim() } : {}),
    ...(String(raw.externalCustomerId||'').trim() ? { externalCustomerId: String(raw.externalCustomerId).trim() } : {}),
    ...(String(raw.externalSubscriptionId||'').trim() ? { externalSubscriptionId: String(raw.externalSubscriptionId).trim() } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
};

const normalizeFiscal = (value: unknown): Company['fiscal'] | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const provider = ['manual','focus_nfe','nuvem_fiscal','other'].includes(String(raw.provider||'')) ? String(raw.provider) as NonNullable<Company['fiscal']>['provider'] : 'manual';
  const environment = String(raw.environment||'homologacao') === 'producao' ? 'producao' : 'homologacao';
  return {
    enabled: raw.enabled === true,
    provider,
    environment,
    ...(String(raw.updatedAt||'') ? { updatedAt: String(raw.updatedAt) } : {}),
  };
};

const normalizeOverrides = (value: unknown): Partial<Record<DealMasterModule, boolean>> | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const next: Partial<Record<DealMasterModule, boolean>> = {};
  MODULE_IDS.forEach(module => {
    if (typeof raw[module] === 'boolean') next[module] = raw[module] as boolean;
  });
  return Object.keys(next).length ? next : undefined;
};

const normalizeCompanies = (raw: unknown): Company[] => {
  const list = Array.isArray(raw) ? raw : [];
  const parsed = list.map((item: any) => {
    const trialEndsAt = item?.trialEndsAt ? String(item.trialEndsAt) : '';
    const moduleOverrides = normalizeOverrides(item?.moduleOverrides);
    const billing = normalizeBilling(item?.billing);
    const fiscal = normalizeFiscal(item?.fiscal);
    return {
      id: String(item?.id || '').trim(),
      slug: String(item?.slug || item?.id || '').trim(),
      name: String(item?.name || '').trim(),
      plan: validPlan(item?.plan),
      status: item?.status === 'suspended' ? 'suspended' : item?.status === 'trial' ? 'trial' : 'active',
      ...(item?.environment === 'demo' ? { environment: 'demo' as const } : item?.environment === 'production' ? { environment: 'production' as const } : {}),
      createdAt: String(item?.createdAt || new Date().toISOString()),
      ...(trialEndsAt ? { trialEndsAt } : {}),
      ...(billing ? { billing } : {}),
      ...(fiscal ? { fiscal } : {}),
      ...(moduleOverrides ? { moduleOverrides } : {}),
    } as Company;
  }).filter(item => item.id && item.name) as Company[];

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