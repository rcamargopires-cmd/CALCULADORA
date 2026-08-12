import { collection, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { OperationalStockItem, User } from '../types';
import { DEFAULT_STORE_ID } from './storeService';
import { storeScopedOperationalService } from './storeScopedOperationalService';

export const stockSnapshotService = {
  replace: async (items: OperationalStockItem[], fileName: string, user: User | undefined, storeId: string) => {
    if (!items.length) throw new Error('Nenhuma linha de estoque reconhecida no arquivo.');
    const snapshotDate = items[0].snapshotDate;

    // Reimportar a mesma data substitui apenas a fotografia da unidade selecionada.
    const previous = await getDocs(query(collection(db, 'operational_stock'), where('snapshotDate', '==', snapshotDate)));
    for (const oldDoc of previous.docs) {
      const data = oldDoc.data() as OperationalStockItem;
      const oldStore = data.storeId || DEFAULT_STORE_ID;
      if (oldStore === storeId) await deleteDoc(oldDoc.ref);
    }

    return storeScopedOperationalService.importStock(items, fileName, user, storeId);
  },
};
