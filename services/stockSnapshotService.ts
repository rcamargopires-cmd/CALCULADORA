import { collection, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { OperationalStockItem, User } from '../types';
import { DEFAULT_COMPANY_ID } from './companyService';
import { companyScopeService } from './companyScopeService';
import { DEFAULT_STORE_ID } from './storeService';
import { storeScopedOperationalService } from './storeScopedOperationalService';

export const stockSnapshotService = {
  replace: async (
    items: OperationalStockItem[],
    fileName: string,
    user: User | undefined,
    storeId: string,
    companyId = companyScopeService.get(),
  ) => {
    if (!items.length) throw new Error('Nenhuma linha de estoque reconhecida no arquivo.');
    const snapshotDate = items[0].snapshotDate;
    const tenant = companyId || DEFAULT_COMPANY_ID;

    const scoped = await getDocs(query(
      collection(db, 'operational_stock'),
      where('companyId', '==', tenant),
      where('storeId', '==', storeId),
    ));
    for (const oldDoc of scoped.docs) {
      const data = oldDoc.data() as OperationalStockItem;
      if (data.snapshotDate === snapshotDate) await deleteDoc(oldDoc.ref);
    }

    // Compatibilidade de uma única vez com fotografias antigas do Outlet sem tenant explícito.
    if (tenant === DEFAULT_COMPANY_ID && storeId === DEFAULT_STORE_ID) {
      try {
        const legacy = await getDocs(query(collection(db, 'operational_stock'), where('snapshotDate', '==', snapshotDate)));
        for (const oldDoc of legacy.docs) {
          const data = oldDoc.data() as OperationalStockItem;
          if (!data.companyId && (!data.storeId || data.storeId === DEFAULT_STORE_ID)) await deleteDoc(oldDoc.ref);
        }
      } catch {}
    }

    return storeScopedOperationalService.importStock(items, fileName, user, storeId, tenant);
  },
};
