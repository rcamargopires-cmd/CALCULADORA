import { collection, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { OperationalStockItem, User } from '../types';
import { operationalDataService } from './operationalDataService';

export const stockSnapshotService = {
  replace: async (items: OperationalStockItem[], fileName: string, user?: User) => {
    if (!items.length) throw new Error('Nenhuma linha de estoque reconhecida no arquivo.');
    const snapshotDate = items[0].snapshotDate;

    // Reimportar a mesma data deve substituir a fotografia anterior, não somar veículos.
    const previous = await getDocs(query(collection(db, 'operational_stock'), where('snapshotDate', '==', snapshotDate)));
    for (const oldDoc of previous.docs) await deleteDoc(oldDoc.ref);

    return operationalDataService.importStock(items, fileName, user);
  },
};
