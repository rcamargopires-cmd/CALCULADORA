import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { OperationalPerformanceSnapshot, OperationalSaleItem, OperationalStockItem, User } from '../types';
import { DEFAULT_COMPANY_ID } from './companyService';
import { companyScopeService } from './companyScopeService';
import { DEFAULT_STORE_ID } from './storeService';

const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 120);
const belongsToStore = (value: { storeId?: string }, storeId: string) => (value.storeId || DEFAULT_STORE_ID) === storeId;
const belongsToCompany = (value: { companyId?: string }, companyId: string) => (value.companyId || DEFAULT_COMPANY_ID) === companyId;

export type StoreStockHistoryPoint = {
  referenceDate: string;
  stockCount: number;
  stockValue: number;
  aged60: number;
  critical90: number;
  critical90Value: number;
  storeId?: string;
  companyId?: string;
};

const currentId = (storeId: string) => `current_${safeId(storeId)}`;
const performanceId = (storeId: string, date: string) => `performance_${safeId(storeId)}_${safeId(date)}`;
const stockSummaryId = (storeId: string, date: string) => `stock_summary_${safeId(storeId)}_${safeId(date)}`;

const getStoreCurrent = async (storeId: string, companyId: string) => {
  const scoped = await getDoc(doc(db, 'operational_meta', currentId(storeId)));
  if (scoped.exists()) {
    const data = scoped.data();
    if (belongsToCompany(data, companyId)) return data;
  }
  if (storeId === DEFAULT_STORE_ID && companyId === DEFAULT_COMPANY_ID) {
    const legacy = await getDoc(doc(db, 'operational_meta', 'current'));
    return legacy.exists() ? legacy.data() : null;
  }
  return null;
};

export const storeScopedOperationalService = {
  importStock: async (
    items: OperationalStockItem[],
    fileName: string,
    user: User | undefined,
    storeId: string,
    companyId = companyScopeService.get(),
  ) => {
    if (!items.length) throw new Error('Nenhuma linha de estoque reconhecida no arquivo.');
    const snapshotDate = items[0].snapshotDate;
    const tenant = companyId || DEFAULT_COMPANY_ID;
    const scoped = items.map(item => ({
      ...item,
      id: safeId(`${tenant}_${storeId}_${snapshotDate}_${item.plate || item.id}`),
      storeId,
      companyId: tenant,
    }));
    for (const item of scoped) await setDoc(doc(db, 'operational_stock', item.id), item, { merge: true });

    const stockValue = scoped.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
    const aged60 = scoped.filter(item => Number(item.stockDays) > 60).length;
    const critical = scoped.filter(item => Number(item.stockDays) > 90);
    const critical90Value = critical.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);

    await setDoc(doc(db, 'operational_meta', stockSummaryId(storeId, snapshotDate)), {
      referenceDate: snapshotDate, companyId: tenant, storeId, stockCount: scoped.length, stockValue, aged60,
      critical90: critical.length, critical90Value, updatedAt: serverTimestamp(),
    }, { merge: true });
    await setDoc(doc(db, 'operational_meta', currentId(storeId)), {
      companyId: tenant, storeId, latestStockDate: snapshotDate, stockRows: scoped.length, updatedAt: serverTimestamp(),
    }, { merge: true });
    await addDoc(collection(db, 'operational_imports'), {
      type: 'stock', companyId: tenant, storeId, referenceDate: snapshotDate, rows: scoped.length, fileName,
      importedBy: user?.email || '', importedAt: serverTimestamp(),
    });
    return scoped.length;
  },

  importPerformance: async (
    snapshot: OperationalPerformanceSnapshot,
    fileName: string,
    user: User | undefined,
    storeId: string,
    companyId = companyScopeService.get(),
  ) => {
    if (!snapshot.sellers.length) throw new Error('Nenhum vendedor reconhecido no mapa.');
    const tenant = companyId || DEFAULT_COMPANY_ID;
    const scoped: OperationalPerformanceSnapshot = { ...snapshot, companyId: tenant, storeId };
    await setDoc(doc(db, 'operational_meta', performanceId(storeId, snapshot.referenceDate)), {
      ...scoped, sourceFile: fileName, importedBy: user?.email || '', updatedAt: serverTimestamp(),
    }, { merge: true });
    await setDoc(doc(db, 'operational_meta', currentId(storeId)), {
      companyId: tenant, storeId, latestPerformanceDate: snapshot.referenceDate,
      performanceRowsLastImport: snapshot.sellers.length, updatedAt: serverTimestamp(),
    }, { merge: true });
    await addDoc(collection(db, 'operational_imports'), {
      type: 'performance', companyId: tenant, storeId, referenceDate: snapshot.referenceDate, rows: snapshot.sellers.length,
      fileName, importedBy: user?.email || '', importedAt: serverTimestamp(),
    });
    return snapshot.sellers.length;
  },

  getLatestStock: async (storeId: string, companyId = companyScopeService.get()): Promise<OperationalStockItem[]> => {
    const tenant = companyId || DEFAULT_COMPANY_ID;
    const current = await getStoreCurrent(storeId, tenant);
    const latest = String(current?.latestStockDate || '');
    if (!latest) return [];

    const scoped = await getDocs(query(
      collection(db, 'operational_stock'),
      where('companyId', '==', tenant),
      where('storeId', '==', storeId),
    ));
    const rows = scoped.docs.map(item => item.data() as OperationalStockItem).filter(item => item.snapshotDate === latest);
    if (rows.length || tenant !== DEFAULT_COMPANY_ID || storeId !== DEFAULT_STORE_ID) return rows;

    // Compatibilidade temporária antes da migração dos snapshots antigos do Outlet.
    const legacy = await getDocs(query(collection(db, 'operational_stock'), where('snapshotDate', '==', latest)));
    return legacy.docs
      .map(item => item.data() as OperationalStockItem)
      .filter(item => belongsToCompany(item, tenant) && belongsToStore(item, storeId));
  },

  getSales: async (storeId: string, companyId = companyScopeService.get()): Promise<OperationalSaleItem[]> => {
    const tenant = companyId || DEFAULT_COMPANY_ID;
    const scoped = await getDocs(query(
      collection(db, 'operational_sales'),
      where('companyId', '==', tenant),
      where('storeId', '==', storeId),
    ));
    return scoped.docs.map(item => item.data() as OperationalSaleItem);
  },

  getLatestPerformance: async (storeId: string, companyId = companyScopeService.get()): Promise<OperationalPerformanceSnapshot | null> => {
    const tenant = companyId || DEFAULT_COMPANY_ID;
    const current = await getStoreCurrent(storeId, tenant);
    const latest = String(current?.latestPerformanceDate || '');
    if (!latest) return null;
    const scoped = await getDoc(doc(db, 'operational_meta', performanceId(storeId, latest)));
    if (scoped.exists() && belongsToCompany(scoped.data(), tenant)) return scoped.data() as OperationalPerformanceSnapshot;
    if (storeId === DEFAULT_STORE_ID && tenant === DEFAULT_COMPANY_ID) {
      const legacy = await getDoc(doc(db, 'operational_meta', `performance_${safeId(latest)}`));
      return legacy.exists() ? { ...(legacy.data() as OperationalPerformanceSnapshot), companyId: tenant, storeId } : null;
    }
    return null;
  },

  getPerformanceHistory: async (storeId: string, companyId = companyScopeService.get()): Promise<OperationalPerformanceSnapshot[]> => {
    const tenant = companyId || DEFAULT_COMPANY_ID;
    const scoped = await getDocs(query(
      collection(db, 'operational_meta'),
      where('companyId', '==', tenant),
      where('storeId', '==', storeId),
    ));
    const snapshots = scoped.docs
      .map(item => item.data() as OperationalPerformanceSnapshot)
      .filter(item => !!item.referenceDate && Array.isArray(item.sellers));

    // Durante a migração, o Outlet ainda pode ter pontos antigos sem companyId/storeId.
    if (tenant === DEFAULT_COMPANY_ID && storeId === DEFAULT_STORE_ID) {
      try {
        const legacy = await getDocs(collection(db, 'operational_meta'));
        legacy.docs.forEach(item => {
          const data = item.data() as OperationalPerformanceSnapshot;
          if (item.id.startsWith('performance_') && data.referenceDate && Array.isArray(data.sellers) && belongsToCompany(data, tenant) && belongsToStore(data, storeId)) snapshots.push({ ...data, companyId: tenant, storeId });
        });
      } catch {}
    }

    const unique = new Map<string, OperationalPerformanceSnapshot>();
    snapshots.forEach(item => unique.set(item.referenceDate, { ...item, companyId: tenant, storeId }));
    return Array.from(unique.values()).sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
  },

  getStockHistory: async (storeId: string, companyId = companyScopeService.get()): Promise<StoreStockHistoryPoint[]> => {
    const tenant = companyId || DEFAULT_COMPANY_ID;
    const scoped = await getDocs(query(
      collection(db, 'operational_meta'),
      where('companyId', '==', tenant),
      where('storeId', '==', storeId),
    ));
    const points = scoped.docs
      .map(item => item.data() as StoreStockHistoryPoint)
      .filter(item => !!item.referenceDate && typeof item.stockCount === 'number');

    if (tenant === DEFAULT_COMPANY_ID && storeId === DEFAULT_STORE_ID) {
      try {
        const legacy = await getDocs(collection(db, 'operational_meta'));
        legacy.docs.forEach(item => {
          const data = item.data() as StoreStockHistoryPoint;
          if (item.id.startsWith('stock_summary_') && data.referenceDate && typeof data.stockCount === 'number' && belongsToCompany(data, tenant) && belongsToStore(data, storeId)) points.push({ ...data, companyId: tenant, storeId });
        });
      } catch {}
    }

    const unique = new Map<string, StoreStockHistoryPoint>();
    points.forEach(item => unique.set(item.referenceDate, { ...item, companyId: tenant, storeId }));
    return Array.from(unique.values()).sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
  },
};
