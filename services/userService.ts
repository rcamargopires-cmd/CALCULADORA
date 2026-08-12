import { collection, doc, getDoc, getDocs, query, setDoc, deleteDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User } from '../types';
import { DEFAULT_COMPANY_ID } from './companyService';

const USERS_COLLECTION = 'users';
const userCompanyId = (user?: Partial<User> | null) => user?.companyId || DEFAULT_COMPANY_ID;

export const userService = {
  getAll: async (companyId?: string): Promise<User[]> => {
    if (companyId) {
      const scoped = await getDocs(query(collection(db, USERS_COLLECTION), where('companyId', '==', companyId)));
      return scoped.docs.map(item => item.data() as User);
    }

    const email = auth.currentUser?.email;
    if (!email) return [];
    const mine = await getDoc(doc(db, USERS_COLLECTION, email));
    const me = mine.exists() ? mine.data() as User : null;

    if (me?.role === 'admin' || email === 'r.camargo.pires@gmail.com') {
      const all = await getDocs(collection(db, USERS_COLLECTION));
      return all.docs.map(item => item.data() as User);
    }

    const tenant = userCompanyId(me);
    const scoped = await getDocs(query(collection(db, USERS_COLLECTION), where('companyId', '==', tenant)));
    if (!scoped.empty || tenant !== DEFAULT_COMPANY_ID) return scoped.docs.map(item => item.data() as User);

    // Compatibilidade temporária até a migração de segurança carimbar os usuários antigos da Abrão Reze.
    const legacy = await getDocs(collection(db, USERS_COLLECTION));
    return legacy.docs
      .map(item => item.data() as User)
      .filter(item => userCompanyId(item) === DEFAULT_COMPANY_ID);
  },

  getUser: async (email: string): Promise<User | null> => {
    const docRef = doc(db, USERS_COLLECTION, email);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() as User : null;
  },

  save: async (user: User): Promise<void> => {
    const userToSave = { ...user, id: user.email };
    if (!userToSave.createdAt) userToSave.createdAt = new Date().toISOString();
    await setDoc(doc(db, USERS_COLLECTION, user.email), userToSave);
  },

  delete: async (email: string): Promise<void> => {
    await deleteDoc(doc(db, USERS_COLLECTION, email));
  }
};
