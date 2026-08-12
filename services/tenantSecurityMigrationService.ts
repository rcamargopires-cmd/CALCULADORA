import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { OperationalPerformanceSnapshot, OperationalStockItem, User } from '../types';
import { DEFAULT_COMPANY_ID } from './companyService';
import { DEFAULT_STORE_ID } from './storeService';

const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 120);
const performanceScopedId = (date: string) => `performance_${DEFAULT_STORE_ID}_${safeId(date)}`;
const stockScopedId = (date: string) => `stock_summary_${DEFAULT_STORE_ID}_${safeId(date)}`;

export type TenantMigrationResult = {
  users: number;
  stock: number;
  meta: number;
  imports: number;
  sellerPerformance: number;
  sellerHistory: number;
  deals: number;
  aliases: number;
};

export const tenantSecurityMigrationService = {
  prepareDefaultTenant: async (): Promise<TenantMigrationResult> => {
    const result: TenantMigrationResult = { users: 0, stock: 0, meta: 0, imports: 0, sellerPerformance: 0, sellerHistory: 0, deals: 0, aliases: 0 };

    const usersSnap = await getDocs(collection(db, 'users'));
    const users = new Map<string, User>();
    for (const item of usersSnap.docs) {
      const data = item.data() as User;
      const next: User = {
        ...data,
        id: data.id || data.email || item.id,
        email: data.email || item.id,
        companyId: data.companyId || DEFAULT_COMPANY_ID,
        storeId: data.storeId || DEFAULT_STORE_ID,
      };
      users.set(item.id, next);
      users.set(next.email, next);
      if (!data.companyId || !data.storeId) {
        await setDoc(item.ref, { companyId: next.companyId, storeId: next.storeId }, { merge: true });
        result.users += 1;
      }
    }

    const stockSnap = await getDocs(collection(db, 'operational_stock'));
    for (const item of stockSnap.docs) {
      const data = item.data() as OperationalStockItem;
      if (!data.companyId || !data.storeId) {
        await setDoc(item.ref, {
          companyId: data.companyId || DEFAULT_COMPANY_ID,
          storeId: data.storeId || DEFAULT_STORE_ID,
        }, { merge: true });
        result.stock += 1;
      }
    }

    const metaSnap = await getDocs(collection(db, 'operational_meta'));
    for (const item of metaSnap.docs) {
      const data = item.data() as any;
      const isOperational = item.id === 'current' || item.id.startsWith('current_') || item.id.startsWith('performance_') || item.id.startsWith('stock_summary_');
      if (!isOperational) continue;
      const companyId = data.companyId || DEFAULT_COMPANY_ID;
      const storeId = data.storeId || DEFAULT_STORE_ID;
      if (!data.companyId || !data.storeId) {
        await setDoc(item.ref, { companyId, storeId }, { merge: true });
        result.meta += 1;
      }

      if (item.id === 'current') {
        await setDoc(doc(db, 'operational_meta', `current_${DEFAULT_STORE_ID}`), { ...data, companyId: DEFAULT_COMPANY_ID, storeId: DEFAULT_STORE_ID }, { merge: true });
        result.aliases += 1;
      } else if (/^performance_\d{4}-\d{2}-\d{2}$/.test(item.id) && data.referenceDate) {
        await setDoc(doc(db, 'operational_meta', performanceScopedId(String(data.referenceDate))), {
          ...(data as OperationalPerformanceSnapshot), companyId: DEFAULT_COMPANY_ID, storeId: DEFAULT_STORE_ID,
        }, { merge: true });
        result.aliases += 1;
      } else if (/^stock_summary_\d{4}-\d{2}-\d{2}$/.test(item.id) && data.referenceDate) {
        await setDoc(doc(db, 'operational_meta', stockScopedId(String(data.referenceDate))), {
          ...data, companyId: DEFAULT_COMPANY_ID, storeId: DEFAULT_STORE_ID,
        }, { merge: true });
        result.aliases += 1;
      }
    }

    const importsSnap = await getDocs(collection(db, 'operational_imports'));
    for (const item of importsSnap.docs) {
      const data = item.data() as any;
      if (!data.companyId || !data.storeId) {
        await setDoc(item.ref, {
          companyId: data.companyId || DEFAULT_COMPANY_ID,
          storeId: data.storeId || DEFAULT_STORE_ID,
        }, { merge: true });
        result.imports += 1;
      }
    }

    const sellerSnap = await getDocs(collection(db, 'seller_performance'));
    for (const item of sellerSnap.docs) {
      const data = item.data() as any;
      const owner = users.get(item.id) || users.get(String(data.sellerEmail || ''));
      const companyId = data.companyId || owner?.companyId || DEFAULT_COMPANY_ID;
      const storeId = data.storeId || owner?.storeId || DEFAULT_STORE_ID;
      if (!data.companyId || !data.storeId) {
        await setDoc(item.ref, { companyId, storeId }, { merge: true });
        result.sellerPerformance += 1;
      }
      const history = await getDocs(collection(db, 'seller_performance', item.id, 'history'));
      for (const historyItem of history.docs) {
        const historyData = historyItem.data() as any;
        if (!historyData.companyId || !historyData.storeId) {
          await setDoc(historyItem.ref, {
            companyId: historyData.companyId || companyId,
            storeId: historyData.storeId || storeId,
          }, { merge: true });
          result.sellerHistory += 1;
        }
      }
    }

    const dealsSnap = await getDocs(collection(db, 'deals'));
    for (const item of dealsSnap.docs) {
      const data = item.data() as any;
      if (data.companyId && data.storeId) continue;
      const owner = users.get(String(data.userId || ''));
      await setDoc(item.ref, {
        companyId: data.companyId || owner?.companyId || DEFAULT_COMPANY_ID,
        storeId: data.storeId || owner?.storeId || DEFAULT_STORE_ID,
      }, { merge: true });
      result.deals += 1;
    }

    await setDoc(doc(db, 'config', 'tenant_security'), {
      preparedAt: new Date().toISOString(),
      defaultCompanyId: DEFAULT_COMPANY_ID,
      defaultStoreId: DEFAULT_STORE_ID,
      result,
    }, { merge: true });

    return result;
  },

  getStatus: async () => {
    const snap = await getDoc(doc(db, 'config', 'tenant_security'));
    return snap.exists() ? snap.data() : null;
  },
};
