import { addDoc, collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { SavedCalculation, User } from '../types';
import { companyIdForUser } from './companyService';
import { COMPANY_SCOPE_EVENT, companyScopeService } from './companyScopeService';
import { storeIdForUser } from './storeService';
import { STORE_SCOPE_EVENT, storeScopeService } from './storeScopeService';

export type DealTenantContext = { companyId: string; storeId: string };

type DealWithoutId = Omit<SavedCalculation, 'id'>;
type DealDocument = SavedCalculation & { kind?: string };

const contextFor = (user: User): DealTenantContext => ({
  companyId: user.role === 'admin' ? companyScopeService.get(user) : companyIdForUser(user),
  storeId: user.role === 'admin' ? storeScopeService.get(user) : storeIdForUser(user),
});

const sorted = (items: SavedCalculation[]) => [...items].sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));

export const dealTenantService = {
  getContext: contextFor,

  subscribeDeals: (user: User, onData: (items: SavedCalculation[]) => void, onError?: (error: unknown) => void) => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const bind = () => {
      unsubscribeSnapshot?.();
      const { companyId, storeId } = contextFor(user);
      const base = collection(db, 'deals');
      const q = (user.role === 'seller' || user.role === 'user')
        ? query(base, where('companyId', '==', companyId), where('storeId', '==', storeId), where('userId', '==', user.id))
        : query(base, where('companyId', '==', companyId), where('storeId', '==', storeId));

      unsubscribeSnapshot = onSnapshot(q, snapshot => {
        const normalDeals = snapshot.docs
          .map(item => ({ id: item.id, ...item.data() } as DealDocument))
          .filter(item => item.kind !== 'evaluation_request');
        onData(sorted(normalDeals));
      }, error => onError?.(error));
    };

    bind();
    const refresh = () => { if (user.role === 'admin') bind(); };
    window.addEventListener(COMPANY_SCOPE_EVENT, refresh);
    window.addEventListener(STORE_SCOPE_EVENT, refresh);

    return () => {
      unsubscribeSnapshot?.();
      window.removeEventListener(COMPANY_SCOPE_EVENT, refresh);
      window.removeEventListener(STORE_SCOPE_EVENT, refresh);
    };
  },

  subscribeDirectory: (user: User, onData: (items: User[]) => void, onError?: (error: unknown) => void) => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const bind = () => {
      unsubscribeSnapshot?.();
      const { companyId, storeId } = contextFor(user);
      const q = query(
        collection(db, 'users'),
        where('companyId', '==', companyId),
        where('storeId', '==', storeId),
      );
      unsubscribeSnapshot = onSnapshot(q, snapshot => {
        const users = snapshot.docs
          .map(item => item.data() as User)
          .filter(item => item.status === 'active' && item.role !== 'admin');
        onData(users);
      }, error => onError?.(error));
    };

    bind();
    const refresh = () => { if (user.role === 'admin') bind(); };
    window.addEventListener(COMPANY_SCOPE_EVENT, refresh);
    window.addEventListener(STORE_SCOPE_EVENT, refresh);

    return () => {
      unsubscribeSnapshot?.();
      window.removeEventListener(COMPANY_SCOPE_EVENT, refresh);
      window.removeEventListener(STORE_SCOPE_EVENT, refresh);
    };
  },

  save: async (user: User, item: DealWithoutId, existingId?: string) => {
    const tenant = contextFor(user);
    const plate=String(item.data?.licensePlate||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!/^[A-Z0-9]{7}$/.test(plate))throw new Error('Informe uma placa válida antes de salvar a negociação.');
    const saleValue=Number(item.data?.invoiceValue)||0;
    if(saleValue<=0)throw new Error('Informe um valor de venda maior que zero.');
    if(item.data?.dealStatus==='closed'){
      const totalPayment=Number(item.data?.payments?.entry||0)+Number(item.data?.payments?.financing||0)+Number(item.data?.payments?.tradeIn||0);
      if(totalPayment<=0)throw new Error('Informe as formas de pagamento antes de fechar a venda.');
      if(Math.abs(totalPayment-saleValue)>1)throw new Error('O total das formas de pagamento deve conferir com o valor da venda.');
      if(!String(item.userId||user.id||'').trim()||!String(item.userName||user.name||'').trim())throw new Error('Identifique o vendedor responsável antes de fechar a venda.');
    }
    const payload = { ...item, data:{...item.data,licensePlate:plate}, ...tenant };
    if (existingId) {
      await setDoc(doc(db, 'deals', existingId), { ...payload, updatedAt: new Date().toISOString() }, { merge: true });
      return existingId;
    }
    const created = await addDoc(collection(db, 'deals'), { ...payload, createdAt: new Date().toISOString() });
    return created.id;
  },

  remove: async (user: User, dealId: string) => {
    if (user.role !== 'admin') throw new Error('Apenas administradores podem excluir negociações.');
    await deleteDoc(doc(db, 'deals', dealId));
  },
};
