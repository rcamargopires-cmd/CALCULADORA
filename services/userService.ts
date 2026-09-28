import { collection, doc, getDoc, getDocs, query, setDoc, deleteDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User } from '../types';
import { companyIdForUser, DEFAULT_COMPANY_ID } from './companyService';
import { DEFAULT_STORE_ID, storeIdForUser } from './storeService';

const USERS_COLLECTION = 'users';
const userCompanyId = (user?: Partial<User> | null) => user?.companyId || DEFAULT_COMPANY_ID;

const stripUndefined = <T,>(value: T): T => {
  if (Array.isArray(value)) return value.map(item => stripUndefined(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, stripUndefined(item)])
    ) as T;
  }
  return value;
};

export const userService = {
  getAll: async (companyId?: string, storeId?: string): Promise<User[]> => {
    const email = auth.currentUser?.email;
    if (!email) return [];

    const mine = await getDoc(doc(db, USERS_COLLECTION, email));
    const me = mine.exists() ? mine.data() as User : null;
    const isAdmin = me?.role === 'admin' || email === 'r.camargo.pires@gmail.com';

    if (isAdmin) {
      if (companyId && storeId) {
        const scoped = await getDocs(query(
          collection(db, USERS_COLLECTION),
          where('companyId', '==', companyId),
          where('storeId', '==', storeId),
        ));
        return scoped.docs.map(item => item.data() as User);
      }
      if (companyId) {
        const scoped = await getDocs(query(collection(db, USERS_COLLECTION), where('companyId', '==', companyId)));
        return scoped.docs.map(item => item.data() as User);
      }
      const all = await getDocs(collection(db, USERS_COLLECTION));
      return all.docs.map(item => item.data() as User);
    }

    if (!me) return [];
    const tenant = userCompanyId(me);
    const unit = storeIdForUser(me) || DEFAULT_STORE_ID;
    const scoped = await getDocs(query(
      collection(db, USERS_COLLECTION),
      where('companyId', '==', tenant),
      where('storeId', '==', unit),
    ));
    return scoped.docs.map(item => item.data() as User);
  },

  getUser: async (email: string): Promise<User | null> => {
    const docRef = doc(db, USERS_COLLECTION, email);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() as User : null;
  },

  getForManagement: async (actor: User, companyId?: string): Promise<User[]> => {
    const role = String(actor.role || '');
    if (role !== 'admin' && role !== 'manager') return [];
    const tenant = role === 'admin'
      ? String(companyId || companyIdForUser(actor) || DEFAULT_COMPANY_ID)
      : companyIdForUser(actor);
    const scoped = await getDocs(query(
      collection(db, USERS_COLLECTION),
      where('companyId', '==', tenant),
    ));
    return scoped.docs
      .map(item => item.data() as User)
      .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email), 'pt-BR'));
  },

  saveManaged: async (actor: User, user: User): Promise<void> => {
    const actorRole = String(actor.role || '');
    if (actorRole !== 'admin' && actorRole !== 'manager') throw new Error('Sem permissão para gerenciar usuários.');
    const actorCompany = companyIdForUser(actor);
    const targetCompany = companyIdForUser(user);
    if (actorRole === 'manager') {
      if (targetCompany !== actorCompany) throw new Error('O gestor só pode administrar usuários da própria empresa.');
      if (user.role === 'admin' || user.role === 'director') throw new Error('Somente o administrador master pode criar esse perfil.');
    }
    const userToSave = stripUndefined({ ...user, id: user.email });
    if (!userToSave.createdAt) userToSave.createdAt = new Date().toISOString();
    await setDoc(doc(db, USERS_COLLECTION, user.email), userToSave);
  },

  deleteManaged: async (actor: User, target: User): Promise<void> => {
    const actorRole = String(actor.role || '');
    if (actorRole !== 'admin' && actorRole !== 'manager') throw new Error('Sem permissão para remover usuários.');
    if (String(actor.email).toLowerCase() === String(target.email).toLowerCase()) throw new Error('Você não pode remover seu próprio usuário.');
    if (actorRole === 'manager') {
      if (companyIdForUser(target) !== companyIdForUser(actor)) throw new Error('O gestor só pode administrar usuários da própria empresa.');
      if (target.role === 'admin' || target.role === 'director') throw new Error('Somente o administrador master pode remover esse perfil.');
    }
    await deleteDoc(doc(db, USERS_COLLECTION, target.email));
  },

  save: async (user: User): Promise<void> => {
    const userToSave = stripUndefined({ ...user, id: user.email });
    if (!userToSave.createdAt) userToSave.createdAt = new Date().toISOString();
    await setDoc(doc(db, USERS_COLLECTION, user.email), userToSave);
  },

  delete: async (email: string): Promise<void> => {
    await deleteDoc(doc(db, USERS_COLLECTION, email));
  }
};
