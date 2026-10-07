import { arrayUnion, collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from '../types';

export type EvaluationQueueStatus = 'requested' | 'in_progress' | 'inspection' | 'awaiting_pricing' | 'pricing' | 'completed' | 'rejected' | 'cancelled';
export type EvaluationAuditType = 'requested' | 'accepted' | 'inspection_saved' | 'sent_to_pricing' | 'pricing_started' | 'approved' | 'rejected' | 'cancelled';
export type EvaluationAuditEvent = { type: EvaluationAuditType; at: string; byEmail: string; byName: string; note?: string };

export interface EvaluationQueueRequest {
  id: string;
  companyId: string;
  storeId: string;
  requesterEmail: string;
  requesterName: string;
  evaluatorEmail: string;
  evaluatorName: string;
  plate: string;
  renavam: string;
  vehicle: string;
  brand: string;
  year: string;
  km: string;
  fuel: string;
  hasSpareKey: string;
  hasManual: string;
  notes: string;
  identificationSource: string;
  status: EvaluationQueueStatus;
  recommendedBuy?: number;
  marketIqEvaluationId?: string;
  createdAt?: any;
  updatedAt?: any;
  startedAt?: any;
  inspectionCompletedAt?: any;
  pricingStartedAt?: any;
  pricingEmail?: string;
  pricingName?: string;
  decisionReason?: string;
  inspectionPhotoCount?: number;
  inspectionDamageCount?: number;
  inspectionDamageTotal?: number;
  auditTrail?: EvaluationAuditEvent[];
  completedAt?: any;
}

const COLLECTION = 'evaluation_requests';
const cleanPlate = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
const cleanRenavam = (value: unknown) => String(value || '').replace(/\D/g, '').slice(0, 11);
const safe = (value: unknown) => String(value || '').trim();
const millis = (value: any) => {
  try {
    if (value?.toMillis) return value.toMillis();
    if (value?.seconds) return Number(value.seconds) * 1000;
    return value ? new Date(value).getTime() : 0;
  } catch { return 0; }
};
const newest = (items: EvaluationQueueRequest[]) => [...items].sort((a, b) => millis(b.createdAt) - millis(a.createdAt));

export const evaluationQueueService = {
  create: async (input: Omit<EvaluationQueueRequest, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'startedAt' | 'completedAt' | 'recommendedBuy' | 'marketIqEvaluationId'>) => {
    const plate = cleanPlate(input.plate);
    const id = `evaluation_${input.companyId}_${input.storeId}_${plate || 'sem-placa'}_${Date.now()}`
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 190);

    await setDoc(doc(db, COLLECTION, id), {
      ...input,
      id,
      plate,
      renavam: cleanRenavam(input.renavam),
      requesterEmail: safe(input.requesterEmail).toLowerCase(),
      evaluatorEmail: safe(input.evaluatorEmail).toLowerCase(),
      status: 'requested',
      auditTrail: [{
        type: 'requested',
        at: new Date().toISOString(),
        byEmail: safe(input.requesterEmail).toLowerCase(),
        byName: safe(input.requesterName) || safe(input.requesterEmail),
      }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  },

  subscribe: (
    currentUser: User,
    companyId: string,
    storeId: string,
    callback: (items: EvaluationQueueRequest[]) => void,
    onError?: (error: unknown) => void,
  ) => {
    const seller = currentUser.role === 'seller' || currentUser.role === 'user';
    const q = seller
      ? query(
          collection(db, COLLECTION),
          where('companyId', '==', companyId),
          where('storeId', '==', storeId),
          where('requesterEmail', '==', currentUser.email.toLowerCase()),
        )
      : query(
          collection(db, COLLECTION),
          where('companyId', '==', companyId),
          where('storeId', '==', storeId),
        );

    return onSnapshot(q, snapshot => {
      const items = newest(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as EvaluationQueueRequest)));
      if (currentUser.role === 'manager' && !currentUser.pricingDeskOnly) {
        const email = currentUser.email.toLowerCase();
        callback(items.filter(item => !item.evaluatorEmail || item.evaluatorEmail === email));
        return;
      }
      callback(items);
    }, error => {
      console.error('Evaluation queue subscription failed', error);
      callback([]);
      onError?.(error);
    });
  },

  start: async (id: string, evaluator: User) => {
    await updateDoc(doc(db, COLLECTION, id), {
      status: 'in_progress',
      evaluatorEmail: evaluator.email.toLowerCase(),
      evaluatorName: evaluator.name || evaluator.email,
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  linkInspectionDraft: async (_id: string, _marketIqEvaluationId: string, _evaluator: User) => {
    // Preview-safe: the MarketIQ draft itself is the durable inspection record.
    // Queue linkage is applied only after Firebase rules for the new flow are promoted.
  },

  completeInspection: async (
    id: string,
    evaluator: User,
    summary?: { marketIqEvaluationId?: string; photoCount?: number; damageCount?: number; damageTotal?: number },
  ) => {
    await updateDoc(doc(db, COLLECTION, id), {
      status: 'awaiting_pricing',
      evaluatorEmail: evaluator.email.toLowerCase(),
      evaluatorName: evaluator.name || evaluator.email,
      ...(summary?.marketIqEvaluationId ? { marketIqEvaluationId: summary.marketIqEvaluationId } : {}),
      ...(typeof summary?.photoCount === 'number' ? { inspectionPhotoCount: summary.photoCount } : {}),
      ...(typeof summary?.damageCount === 'number' ? { inspectionDamageCount: summary.damageCount } : {}),
      ...(typeof summary?.damageTotal === 'number' ? { inspectionDamageTotal: summary.damageTotal } : {}),
      inspectionCompletedAt: serverTimestamp(),
      auditTrail: arrayUnion({
        type: 'sent_to_pricing',
        at: new Date().toISOString(),
        byEmail: evaluator.email.toLowerCase(),
        byName: evaluator.name || evaluator.email,
      }),
      updatedAt: serverTimestamp(),
    });
  },

  startPricing: async (id: string, actor: User) => {
    await updateDoc(doc(db, COLLECTION, id), {
      status: 'pricing',
      pricingEmail: actor.email.toLowerCase(),
      pricingName: actor.name || actor.email,
      pricingStartedAt: serverTimestamp(),
      auditTrail: arrayUnion({
        type: 'pricing_started',
        at: new Date().toISOString(),
        byEmail: actor.email.toLowerCase(),
        byName: actor.name || actor.email,
      }),
      updatedAt: serverTimestamp(),
    });
  },

  finish: async (
    id: string,
    status: 'completed' | 'rejected',
    recommendedBuy?: number,
    marketIqEvaluationId?: string,
    decisionReason?: string,
    actor?: { email?: string; name?: string },
  ) => {
    await updateDoc(doc(db, COLLECTION, id), {
      status,
      ...(typeof recommendedBuy === 'number' ? { recommendedBuy } : {}),
      ...(marketIqEvaluationId ? { marketIqEvaluationId } : {}),
      ...(safe(decisionReason) ? { decisionReason: safe(decisionReason) } : {}),
      auditTrail: arrayUnion({
        type: status === 'completed' ? 'approved' : 'rejected',
        at: new Date().toISOString(),
        byEmail: safe(actor?.email).toLowerCase(),
        byName: safe(actor?.name || actor?.email),
        ...(safe(decisionReason) ? { note: safe(decisionReason) } : {}),
      }),
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },
};
