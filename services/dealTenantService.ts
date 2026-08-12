import { addDoc, collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { SavedCalculation, User } from '../types';
import { companyIdForUser } from './companyService';
import { COMPANY_SCOPE_EVENT, companyScopeService } from './companyScopeService';
import { storeIdForUser } from './storeService';
import { STORE_SCOPE_EVENT, storeScopeService } from './storeScopeService';

export type DealTenantContext = { companyId: string; storeId: string };

type DealWithoutId = Omit<SavedCalculation, 'id'>;

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
        onData(sorted(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as SavedCalculation))));
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
    const payload = { ...item, ...tenant };
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
