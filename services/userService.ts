import { collection, doc, getDoc, getDocs, query, setDoc, deleteDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User } from '../types';
import { DEFAULT_COMPANY_ID } from './companyService';
import { DEFAULT_STORE_ID, storeIdForUser } from './storeService';

const USERS_COLLECTION = 'users';
const userCompanyId = (user?: Partial<User> | null) => user?.companyId || DEFAULT_COMPANY_ID;

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

  save: async (user: User): Promise<void> => {
    const userToSave = { ...user, id: user.email };
    if (!userToSave.createdAt) userToSave.createdAt = new Date().toISOString();
    await setDoc(doc(db, USERS_COLLECTION, user.email), userToSave);
  },

  delete: async (email: string): Promise<void> => {
    await deleteDoc(doc(db, USERS_COLLECTION, email));
  }
};
