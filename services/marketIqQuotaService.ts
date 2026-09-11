import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type MarketIqQuotaLimit = 500 | 1000 | 2000;

export type MarketIqQuotaStatus = {
  companyId: string;
  month: string;
  limit: MarketIqQuotaLimit;
  used: number;
  remaining: number;
  percent: number;
  warning: boolean;
  blocked: boolean;
};

const DEFAULT_LIMIT: MarketIqQuotaLimit = 500;
const SESSION_KEY = 'motyq:marketiq-quota-session';

const safeCompanyId = (value: string) => String(value || 'abrao-reze').trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'abrao-reze';
const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const planRef = (companyId: string) => doc(db, 'config', `marketiq_plan_${safeCompanyId(companyId)}`);
const usageRef = (companyId: string, month = currentMonth()) => doc(db, 'operational_meta', `marketiq_usage_${safeCompanyId(companyId)}_${month.replace('-', '')}`);
const validLimit = (value: unknown): MarketIqQuotaLimit => value === 1000 || value === 2000 ? value : DEFAULT_LIMIT;

const statusFrom = (companyId: string, limit: MarketIqQuotaLimit, usedRaw: unknown, month = currentMonth()): MarketIqQuotaStatus => {
  const used = Math.max(0, Number(usedRaw) || 0);
  const remaining = Math.max(0, limit - used);
  const percent = limit ? Math.min(100, Math.round((used / limit) * 1000) / 10) : 100;
  return {
    companyId,
    month,
    limit,
    used,
    remaining,
    percent,
    warning: percent >= 80 && used < limit,
    blocked: used >= limit,
  };
};

const newSessionId = () => {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  try { window.sessionStorage.setItem(SESSION_KEY, id); } catch {}
  return id;
};

const getSessionId = () => {
  try {
    const current = window.sessionStorage.getItem(SESSION_KEY);
    if (current) return current;
  } catch {}
  return newSessionId();
};

export class MarketIqQuotaExceededError extends Error {
  status: MarketIqQuotaStatus;
  constructor(status: MarketIqQuotaStatus) {
    super(`Limite mensal do MarketIQ atingido (${status.used}/${status.limit}).`);
    this.name = 'MarketIqQuotaExceededError';
    this.status = status;
  }
}

export const marketIqQuotaService = {
  beginEvaluationSession: () => newSessionId(),
  getEvaluationSessionId: () => getSessionId(),

  getPlan: async (companyId: string): Promise<MarketIqQuotaLimit> => {
    const snap = await getDoc(planRef(companyId));
    return snap.exists() ? validLimit(snap.data()?.limit) : DEFAULT_LIMIT;
  },

  setPlan: async (companyId: string, limit: MarketIqQuotaLimit): Promise<void> => {
    const normalized = validLimit(limit);
    await setDoc(planRef(companyId), {
      kind: 'marketiq_plan',
      companyId: safeCompanyId(companyId),
      limit: normalized,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    window.dispatchEvent(new CustomEvent('motyq:marketiq-quota-updated', { detail: { companyId, limit: normalized } }));
  },

  getStatus: async (companyId: string): Promise<MarketIqQuotaStatus> => {
    const month = currentMonth();
    const [planSnap, usageSnap] = await Promise.all([getDoc(planRef(companyId)), getDoc(usageRef(companyId, month))]);
    const limit = planSnap.exists() ? validLimit(planSnap.data()?.limit) : DEFAULT_LIMIT;
    const used = usageSnap.exists() ? usageSnap.data()?.used : 0;
    return statusFrom(companyId, limit, used, month);
  },

  assertAvailable: async (companyId: string): Promise<MarketIqQuotaStatus> => {
    const status = await marketIqQuotaService.getStatus(companyId);
    if (status.blocked) throw new MarketIqQuotaExceededError(status);
    return status;
  },

  consumeEvaluation: async (input: { companyId: string; storeId: string; userEmail?: string; sessionId?: string }): Promise<MarketIqQuotaStatus> => {
    const companyId = safeCompanyId(input.companyId);
    const month = currentMonth();
    const sessionId = String(input.sessionId || getSessionId()).trim();
    if (!sessionId) throw new Error('Sessão de avaliação não encontrada.');

    const pRef = planRef(companyId);
    const uRef = usageRef(companyId, month);

    const result = await runTransaction(db, async tx => {
      const [pSnap, uSnap] = await Promise.all([tx.get(pRef), tx.get(uRef)]);
      const limit = pSnap.exists() ? validLimit(pSnap.data()?.limit) : DEFAULT_LIMIT;
      const current = uSnap.exists() ? uSnap.data() : null;
      const used = Math.max(0, Number(current?.used) || 0);
      const ids = Array.isArray(current?.consultationIds) ? current.consultationIds.map((item: unknown) => String(item)) : [];

      if (ids.includes(sessionId)) return statusFrom(companyId, limit, used, month);
      const before = statusFrom(companyId, limit, used, month);
      if (before.blocked) throw new MarketIqQuotaExceededError(before);

      const nextUsed = used + 1;
      const now = new Date().toISOString();
      tx.set(uRef, {
        kind: 'marketiq_usage',
        companyId,
        month,
        used: nextUsed,
        consultationIds: [...ids, sessionId],
        lastStoreId: String(input.storeId || ''),
        lastUserEmail: String(input.userEmail || '').toLowerCase(),
        updatedAt: now,
        ...(uSnap.exists() ? {} : { createdAt: now }),
      }, { merge: true });

      return statusFrom(companyId, limit, nextUsed, month);
    });

    window.dispatchEvent(new CustomEvent('motyq:marketiq-quota-updated', { detail: result }));
    return result;
  },
};
