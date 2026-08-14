import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type AssetGuardSlaThresholds = {
  sendTargetHours: number;
  sendCriticalHours: number;
  transitTargetHours: number;
  transitCriticalHours: number;
};

export type AssetGuardSlaResolvedConfig = AssetGuardSlaThresholds & {
  source: 'default' | 'company' | 'store';
};

export const DEFAULT_ASSETGUARD_SLA: AssetGuardSlaThresholds = {
  sendTargetHours: 12,
  sendCriticalHours: 24,
  transitTargetHours: 12,
  transitCriticalHours: 24,
};

const safeId = (value: string) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 100);
const companyDocId = (companyId: string) => `assetguard_sla_company_${safeId(companyId)}`;
const storeDocId = (companyId: string, storeId: string) => `assetguard_sla_store_${safeId(companyId)}_${safeId(storeId)}`;
const numberOr = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalize = (raw: Record<string, unknown> | undefined, fallback: AssetGuardSlaThresholds = DEFAULT_ASSETGUARD_SLA): AssetGuardSlaThresholds => {
  const sendTargetHours = numberOr(raw?.sendTargetHours, fallback.sendTargetHours);
  const sendCriticalHours = Math.max(numberOr(raw?.sendCriticalHours, fallback.sendCriticalHours), sendTargetHours);
  const transitTargetHours = numberOr(raw?.transitTargetHours, fallback.transitTargetHours);
  const transitCriticalHours = Math.max(numberOr(raw?.transitCriticalHours, fallback.transitCriticalHours), transitTargetHours);
  return { sendTargetHours, sendCriticalHours, transitTargetHours, transitCriticalHours };
};

const notify = (companyId: string, storeId: string) => {
  window.dispatchEvent(new CustomEvent('dealmaster:assetguard-sla-config-updated', { detail: { companyId, storeId } }));
};

export const assetGuardSlaConfigService = {
  async get(companyId: string, storeId: string): Promise<AssetGuardSlaResolvedConfig> {
    const [companyDoc, storeDoc] = await Promise.all([
      getDoc(doc(db, 'config', companyDocId(companyId))),
      getDoc(doc(db, 'operational_meta', storeDocId(companyId, storeId))),
    ]);

    const companyExists = companyDoc.exists();
    const companyConfig = normalize(companyExists ? companyDoc.data() as Record<string, unknown> : undefined);
    if (storeDoc.exists()) {
      const raw = storeDoc.data() as Record<string, unknown>;
      if (raw.useCompanyDefault !== true) return { ...normalize(raw, companyConfig), source: 'store' };
    }
    return { ...companyConfig, source: companyExists ? 'company' : 'default' };
  },

  async saveStore(companyId: string, storeId: string, config: AssetGuardSlaThresholds) {
    const normalized = normalize(config as unknown as Record<string, unknown>);
    await setDoc(doc(db, 'operational_meta', storeDocId(companyId, storeId)), {
      ...normalized,
      type: 'assetguard_sla_config',
      companyId,
      storeId,
      useCompanyDefault: false,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    notify(companyId, storeId);
    return normalized;
  },

  async useCompanyDefault(companyId: string, storeId: string) {
    await setDoc(doc(db, 'operational_meta', storeDocId(companyId, storeId)), {
      type: 'assetguard_sla_config',
      companyId,
      storeId,
      useCompanyDefault: true,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    notify(companyId, storeId);
  },

  async saveCompany(companyId: string, config: AssetGuardSlaThresholds) {
    const normalized = normalize(config as unknown as Record<string, unknown>);
    await setDoc(doc(db, 'config', companyDocId(companyId)), {
      ...normalized,
      type: 'assetguard_sla_config',
      companyId,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    window.dispatchEvent(new CustomEvent('dealmaster:assetguard-sla-config-updated', { detail: { companyId } }));
    return normalized;
  },
};
