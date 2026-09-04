import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface MarketIqVehicleIdentity {
  plate: string;
  brand: string;
  model: string;
  year: string;
  fuel: string;
  renavam?: string;
  fipeCode?: string;
  lastFipeValue?: number;
  lastFipeReference?: string;
  source: 'crlv' | 'stock' | 'manual';
  companyId: string;
  storeId: string;
  identifiedAt?: string;
  identifiedBy?: string;
}

const cleanPlate = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
const safeId = (value: string) => String(value || 'scope').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 100);
const refFor = (companyId: string, storeId: string, plate: string) =>
  doc(db, 'operational_meta', `marketiq_vehicle_${safeId(companyId)}_${safeId(storeId)}_${cleanPlate(plate)}`);

const normalize = (data: Partial<MarketIqVehicleIdentity>, companyId: string, storeId: string, plate: string): MarketIqVehicleIdentity => ({
  plate: cleanPlate(data.plate || plate),
  brand: String(data.brand || '').trim(),
  model: String(data.model || '').trim(),
  year: String(data.year || '').trim(),
  fuel: String(data.fuel || '').trim(),
  renavam: String(data.renavam || '').replace(/\D/g, ''),
  fipeCode: String(data.fipeCode || '').trim(),
  lastFipeValue: Number(data.lastFipeValue) || 0,
  lastFipeReference: String(data.lastFipeReference || '').trim(),
  source: data.source === 'stock' || data.source === 'manual' ? data.source : 'crlv',
  companyId,
  storeId,
  identifiedAt: String(data.identifiedAt || ''),
  identifiedBy: String(data.identifiedBy || ''),
});

export const marketIqVehicleCacheService = {
  get: async (companyId: string, storeId: string, plate: string): Promise<MarketIqVehicleIdentity | null> => {
    const cleaned = cleanPlate(plate);
    if (!/^[A-Z0-9]{7}$/.test(cleaned)) return null;
    const snap = await getDoc(refFor(companyId, storeId, cleaned));
    if (!snap.exists()) return null;
    const data = snap.data() as Partial<MarketIqVehicleIdentity>;
    const item = normalize(data, companyId, storeId, cleaned);
    return item.model && item.year ? item : null;
  },

  save: async (identity: MarketIqVehicleIdentity) => {
    const plate = cleanPlate(identity.plate);
    if (!/^[A-Z0-9]{7}$/.test(plate)) throw new Error('Placa inválida para cache do MarketIQ.');
    if (!identity.companyId || !identity.storeId || !identity.model || !identity.year) throw new Error('Identificação incompleta para cache do MarketIQ.');
    const normalized = normalize(identity, identity.companyId, identity.storeId, plate);
    await setDoc(refFor(identity.companyId, identity.storeId, plate), {
      ...normalized,
      kind: 'marketiq_vehicle_identity',
      updatedAt: serverTimestamp(),
    }, { merge: true });
  },
};
