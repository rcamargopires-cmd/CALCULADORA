import { collection, doc, getDoc, getDocs, query, setDoc, deleteDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Store, User } from '../types';
import { companyIdForUser, DEFAULT_COMPANY_ID } from './companyService';
import { DEFAULT_STORE_ID, storeIdForUser } from './storeService';

const USERS_COLLECTION = 'users';
const userCompanyId = (user?: Partial<User> | null) => user?.companyId || DEFAULT_COMPANY_ID;

const managementRequest = async (method: 'GET' | 'POST' | 'DELETE', body?: any, companyId?: string) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Sua sessão expirou. Entre novamente no Motyq.');
  const token = await currentUser.getIdToken();
  const suffix = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  const response = await fetch(`/api/user-management${suffix}`, {
    method,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(payload?.error || 'user_management_failed');
    const message =
      code === 'cross_company_forbidden' ? 'Você só pode administrar usuários da sua própria empresa.' :
      code === 'role_forbidden' || code === 'protected_user' ? 'Somente o administrador master pode alterar esse perfil.' :
      code === 'cannot_delete_self' ? 'Você não pode remover seu próprio usuário.' :
      code === 'server_firestore_not_configured' ? 'A gestão de usuários ainda não está configurada no servidor.' :
      'Não foi possível concluir a gestão de usuários.';
    throw new Error(message);
  }
  return payload;
};

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

  getManagementContext: async (actor: User, companyId?: string): Promise<{ users: User[]; stores: Store[]; companyId: string }> => {
    const role = String(actor.role || '');
    if (role !== 'admin' && role !== 'manager') return { users: [], stores: [], companyId: companyIdForUser(actor) };
    const tenant = role === 'admin'
      ? String(companyId || companyIdForUser(actor) || DEFAULT_COMPANY_ID)
      : companyIdForUser(actor);
    const payload = await managementRequest('GET', undefined, tenant);
    const users = Array.isArray(payload?.users) ? payload.users as User[] : [];
    const stores = Array.isArray(payload?.stores) ? payload.stores as Store[] : [];
    return {
      companyId: String(payload?.companyId || tenant),
      users: users.sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email), 'pt-BR')),
      stores,
    };
  },

  getForManagement: async (actor: User, companyId?: string): Promise<User[]> => {
    const context = await userService.getManagementContext(actor, companyId);
    return context.users;
  },

  saveManaged: async (actor: User, user: User): Promise<void> => {
    const actorRole = String(actor.role || '');
    if (actorRole !== 'admin' && actorRole !== 'manager') throw new Error('Sem permissão para gerenciar usuários.');
    await managementRequest('POST', { user: stripUndefined({ ...user, id: user.email }) });
  },

  deleteManaged: async (actor: User, target: User): Promise<void> => {
    const actorRole = String(actor.role || '');
    if (actorRole !== 'admin' && actorRole !== 'manager') throw new Error('Sem permissão para remover usuários.');
    await managementRequest('DELETE', { email: target.email });
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
