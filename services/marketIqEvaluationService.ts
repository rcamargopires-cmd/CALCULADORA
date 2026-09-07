import { collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';

export type MarketIQEvaluationStatus = 'draft' | 'approved' | 'rejected';

export type MarketIQEvaluation = {
  id: string;
  kind: 'marketiq_evaluation';
  companyId: string;
  storeId: string;
  storeName: string;
  plate: string;
  vehicle: string;
  year: string;
  km: string;
  fipe: string;
  notes: string;
  recommendedBuy?: number;
  status: MarketIQEvaluationStatus;
  createdByEmail: string;
  createdByName: string;
  showroomPassageId?: string;
  dealId?: string;
  customerName?: string;
  customerPhone?: string;
  interestModel?: string;
  sellerName?: string;
  sellerEmail?: string;
  linkedAt?: string;
  createdAt?: any;
  updatedAt?: any;
  decidedAt?: any;
};

const cleanPlate = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 180);
const sortNewest = (items: MarketIQEvaluation[]) => items.sort((a, b) => {
  const ta = Number((a.createdAt as any)?.seconds || 0);
  const tb = Number((b.createdAt as any)?.seconds || 0);
  return tb - ta;
});

export const marketIqEvaluationService = {
  create: async (input: Omit<MarketIQEvaluation, 'id' | 'kind' | 'status' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    const plate = cleanPlate(input.plate);
    const id = safeId(`marketiq_${input.companyId}_${input.storeId}_${plate || 'sem-placa'}_${Date.now()}`);
    await setDoc(doc(db, 'operational_meta', id), {
      ...input,
      plate,
      id,
      kind: 'marketiq_evaluation',
      status: 'draft',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    window.dispatchEvent(new CustomEvent('motyq:marketiq-history-updated', { detail: { plate } }));
    return id;
  },

  listByPlate: async (companyId: string, storeId: string, plateValue: string): Promise<MarketIQEvaluation[]> => {
    const plate = cleanPlate(plateValue);
    if (!companyId || !storeId || !plate) return [];
    const snap = await getDocs(query(
      collection(db, 'operational_meta'),
      where('kind', '==', 'marketiq_evaluation'),
      where('companyId', '==', companyId),
      where('storeId', '==', storeId),
      where('plate', '==', plate),
    ));
    return sortNewest(snap.docs.map(item => ({ id: item.id, ...item.data() } as MarketIQEvaluation)));
  },

  listByStore: async (companyId: string, storeId: string): Promise<MarketIQEvaluation[]> => {
    if (!companyId || !storeId) return [];
    const snap = await getDocs(query(
      collection(db, 'operational_meta'),
      where('kind', '==', 'marketiq_evaluation'),
      where('companyId', '==', companyId),
      where('storeId', '==', storeId),
    ));
    return sortNewest(snap.docs.map(item => ({ id: item.id, ...item.data() } as MarketIQEvaluation)));
  },

  listByPassage: async (companyId: string, storeId: string, passageId: string): Promise<MarketIQEvaluation[]> => {
    if (!companyId || !storeId || !passageId) return [];
    const all = await marketIqEvaluationService.listByStore(companyId, storeId);
    return all.filter(item => item.showroomPassageId === passageId);
  },

  getLatestByPlate: async (companyId: string, storeId: string, plate: string): Promise<MarketIQEvaluation | null> => {
    const list = await marketIqEvaluationService.listByPlate(companyId, storeId, plate);
    return list[0] || null;
  },

  setStatus: async (id: string, status: MarketIQEvaluationStatus, recommendedBuy?: number): Promise<void> => {
    await updateDoc(doc(db, 'operational_meta', id), {
      status,
      ...(recommendedBuy !== undefined ? { recommendedBuy } : {}),
      updatedAt: serverTimestamp(),
      decidedAt: serverTimestamp(),
    });
    window.dispatchEvent(new CustomEvent('motyq:marketiq-history-updated'));
  },
};
