import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from '../types';

export type EvaluationRequestStatus = 'requested' | 'in_progress' | 'completed' | 'rejected' | 'cancelled';
export type EvaluationRequestType = 'trade_in' | 'direct_purchase' | 'simple';

export interface EvaluationRequest {
  id: string;
  kind: 'evaluation_request';
  companyId: string;
  storeId: string;
  userId: string;
  requesterEmail: string;
  requesterName: string;
  evaluatorEmail: string;
  evaluatorName: string;
  evaluationType: EvaluationRequestType;
  customerName: string;
  customerPhone: string;
  interestModel: string;
  plate: string;
  renavam: string;
  vehicle: string;
  year: string;
  km: string;
  hasSpareKey: string;
  hasManual: string;
  notes: string;
  status: EvaluationRequestStatus;
  recommendedBuy?: number;
  marketIqEvaluationId?: string;
  createdAt?: any;
  updatedAt?: any;
  startedAt?: any;
  completedAt?: any;
}

const cleanPlate = (value: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const safe = (value: unknown) => String(value || '').trim();
const asMillis = (value: any) => {
  try {
    if (value?.toMillis) return value.toMillis();
    if (value?.seconds) return Number(value.seconds) * 1000;
    if (value) return new Date(value).getTime();
  } catch {}
  return 0;
};

const sortNewest = (items: EvaluationRequest[]) => [...items].sort((a, b) => asMillis(b.createdAt) - asMillis(a.createdAt));

export const evaluationRequestService = {
  create: async (input: Omit<EvaluationRequest, 'id' | 'kind' | 'status' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    const plate = cleanPlate(input.plate);
    const id = `evaluation_request_${input.companyId}_${input.storeId}_${plate || 'sem-placa'}_${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 190);
    await setDoc(doc(db, 'deals', id), {
      ...input,
      id,
      kind: 'evaluation_request',
      plate,
      userId: safe(input.requesterEmail).toLowerCase(),
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
    callback: (items: EvaluationRequest[]) => void,
    onError?: (error: unknown) => void,
  ) => {
    const isSeller = currentUser.role === 'seller' || currentUser.role === 'user';
    const q = isSeller
      ? query(
          collection(db, 'deals'),
          where('companyId', '==', companyId),
          where('storeId', '==', storeId),
          where('userId', '==', currentUser.email.toLowerCase()),
        )
      : query(
          collection(db, 'deals'),
          where('companyId', '==', companyId),
          where('storeId', '==', storeId),
        );

    return onSnapshot(q, snapshot => {
      const all = snapshot.docs
        .map(item => ({ id: item.id, ...item.data() } as EvaluationRequest))
        .filter(item => item.kind === 'evaluation_request');

      if (currentUser.role === 'manager') {
        const email = currentUser.email.toLowerCase();
        callback(sortNewest(all.filter(item => !item.evaluatorEmail || item.evaluatorEmail === email)));
        return;
      }
      callback(sortNewest(all));
    }, error => {
      console.error('Evaluation request subscription failed', error);
      callback([]);
      onError?.(error);
    });
  },

  start: async (id: string, evaluator: User): Promise<void> => {
    await updateDoc(doc(db, 'deals', id), {
      status: 'in_progress',
      evaluatorEmail: evaluator.email.toLowerCase(),
      evaluatorName: evaluator.name || evaluator.email,
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  finish: async (id: string, status: 'completed' | 'rejected', recommendedBuy?: number, marketIqEvaluationId?: string): Promise<void> => {
    await updateDoc(doc(db, 'deals', id), {
      status,
      ...(typeof recommendedBuy === 'number' ? { recommendedBuy } : {}),
      ...(marketIqEvaluationId ? { marketIqEvaluationId } : {}),
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  attachEvaluation: async (id: string, marketIqEvaluationId: string): Promise<void> => {
    if (!id || !marketIqEvaluationId) return;
    await updateDoc(doc(db, 'deals', id), {
      marketIqEvaluationId,
      updatedAt: serverTimestamp(),
    });
  },
};
