import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from '../types';

export type EvaluationQueueStatus = 'requested' | 'in_progress' | 'completed' | 'rejected' | 'cancelled';

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
      if (currentUser.role === 'manager') {
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

  finish: async (id: string, status: 'completed' | 'rejected', recommendedBuy?: number, marketIqEvaluationId?: string) => {
    await updateDoc(doc(db, COLLECTION, id), {
      status,
      ...(typeof recommendedBuy === 'number' ? { recommendedBuy } : {}),
      ...(marketIqEvaluationId ? { marketIqEvaluationId } : {}),
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },
};
