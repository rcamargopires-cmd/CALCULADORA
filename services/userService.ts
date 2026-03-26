import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { User, UserRole, UserStatus } from '../types';

const USERS_COLLECTION = 'users';

export const userService = {
  // Busca todos os usuários
  getAll: async (): Promise<User[]> => {
    const querySnapshot = await getDocs(collection(db, USERS_COLLECTION));
    return querySnapshot.docs.map(doc => doc.data() as User);
  },

  // Busca um usuário específico
  getUser: async (email: string): Promise<User | null> => {
    const docRef = doc(db, USERS_COLLECTION, email);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as User;
    }
    return null;
  },

  // Salva ou Atualiza usuário
  save: async (user: User): Promise<void> => {
    const userToSave = { ...user, id: user.email };
    if (!userToSave.createdAt) {
      userToSave.createdAt = new Date().toISOString();
    }
    await setDoc(doc(db, USERS_COLLECTION, user.email), userToSave);
  },

  // Remove usuário
  delete: async (email: string): Promise<void> => {
    await deleteDoc(doc(db, USERS_COLLECTION, email));
  }
};
