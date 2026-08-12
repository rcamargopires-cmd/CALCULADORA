import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { OperationalPerformanceSnapshot, OperationalSaleItem, OperationalStockItem, User } from '../types';
import { DEFAULT_STORE_ID } from './storeService';

const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 120);
const belongsToStore = (value: { storeId?: string }, storeId: string) => (value.storeId || DEFAULT_STORE_ID) === storeId;

export type StoreStockHistoryPoint = {
  referenceDate: string;
  stockCount: number;
  stockValue: number;
  aged60: number;
  critical90: number;
  critical90Value: number;
  storeId?: string;
};

const currentId = (storeId: string) => `current_${safeId(storeId)}`;
const performanceId = (storeId: string, date: string) => `performance_${safeId(storeId)}_${safeId(date)}`;
const stockSummaryId = (storeId: string, date: string) => `stock_summary_${safeId(storeId)}_${safeId(date)}`;

const getStoreCurrent = async (storeId: string) => {
  const scoped = await getDoc(doc(db, 'operational_meta', currentId(storeId)));
  if (scoped.exists()) return scoped.data();
  if (storeId === DEFAULT_STORE_ID) {
    const legacy = await getDoc(doc(db, 'operational_meta', 'current'));
    return legacy.exists() ? legacy.data() : null;
  }
  return null;
};

export const storeScopedOperationalService = {
  importStock: async (items: OperationalStockItem[], fileName: string, user: User | undefined, storeId: string) => {
    if (!items.length) throw new Error('Nenhuma linha de estoque reconhecida no arquivo.');
    const snapshotDate = items[0].snapshotDate;
    const scoped = items.map(item => ({ ...item, id: safeId(`${storeId}_${snapshotDate}_${item.plate || item.id}`), storeId }));
    for (const item of scoped) await setDoc(doc(db, 'operational_stock', item.id), item, { merge: true });

    const stockValue = scoped.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
    const aged60 = scoped.filter(item => Number(item.stockDays) > 60).length;
    const critical = scoped.filter(item => Number(item.stockDays) > 90);
    const critical90Value = critical.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);

    await setDoc(doc(db, 'operational_meta', stockSummaryId(storeId, snapshotDate)), {
      referenceDate: snapshotDate, storeId, stockCount: scoped.length, stockValue, aged60,
      critical90: critical.length, critical90Value, updatedAt: serverTimestamp(),
    }, { merge: true });
    await setDoc(doc(db, 'operational_meta', currentId(storeId)), {
      storeId, latestStockDate: snapshotDate, stockRows: scoped.length, updatedAt: serverTimestamp(),
    }, { merge: true });
    await addDoc(collection(db, 'operational_imports'), {
      type: 'stock', storeId, referenceDate: snapshotDate, rows: scoped.length, fileName,
      importedBy: user?.email || '', importedAt: serverTimestamp(),
    });
    return scoped.length;
  },

  importPerformance: async (snapshot: OperationalPerformanceSnapshot, fileName: string, user: User | undefined, storeId: string) => {
    if (!snapshot.sellers.length) throw new Error('Nenhum vendedor reconhecido no mapa.');
    const scoped: OperationalPerformanceSnapshot = { ...snapshot, storeId };
    await setDoc(doc(db, 'operational_meta', performanceId(storeId, snapshot.referenceDate)), {
      ...scoped, sourceFile: fileName, importedBy: user?.email || '', updatedAt: serverTimestamp(),
    }, { merge: true });
    await setDoc(doc(db, 'operational_meta', currentId(storeId)), {
      storeId, latestPerformanceDate: snapshot.referenceDate,
      performanceRowsLastImport: snapshot.sellers.length, updatedAt: serverTimestamp(),
    }, { merge: true });
    await addDoc(collection(db, 'operational_imports'), {
      type: 'performance', storeId, referenceDate: snapshot.referenceDate, rows: snapshot.sellers.length,
      fileName, importedBy: user?.email || '', importedAt: serverTimestamp(),
    });
    return snapshot.sellers.length;
  },

  getLatestStock: async (storeId: string): Promise<OperationalStockItem[]> => {
    const current = await getStoreCurrent(storeId);
    const latest = String(current?.latestStockDate || '');
    if (!latest) return [];
    const all = await getDocs(collection(db, 'operational_stock'));
    return all.docs
      .map(item => item.data() as OperationalStockItem)
      .filter(item => item.snapshotDate === latest && belongsToStore(item, storeId));
  },

  getSales: async (storeId: string): Promise<OperationalSaleItem[]> => {
    const all = await getDocs(collection(db, 'operational_sales'));
    return all.docs.map(item => item.data() as OperationalSaleItem).filter(item => belongsToStore(item, storeId));
  },

  getLatestPerformance: async (storeId: string): Promise<OperationalPerformanceSnapshot | null> => {
    const current = await getStoreCurrent(storeId);
    const latest = String(current?.latestPerformanceDate || '');
    if (!latest) return null;
    const scoped = await getDoc(doc(db, 'operational_meta', performanceId(storeId, latest)));
    if (scoped.exists()) return scoped.data() as OperationalPerformanceSnapshot;
    if (storeId === DEFAULT_STORE_ID) {
      const legacy = await getDoc(doc(db, 'operational_meta', `performance_${safeId(latest)}`));
      return legacy.exists() ? { ...(legacy.data() as OperationalPerformanceSnapshot), storeId: DEFAULT_STORE_ID } : null;
    }
    return null;
  },

  getPerformanceHistory: async (storeId: string): Promise<OperationalPerformanceSnapshot[]> => {
    const all = await getDocs(collection(db, 'operational_meta'));
    const snapshots = all.docs
      .filter(item => item.id.startsWith('performance_'))
      .map(item => item.data() as OperationalPerformanceSnapshot)
      .filter(item => !!item.referenceDate && Array.isArray(item.sellers) && belongsToStore(item, storeId));
    const unique = new Map<string, OperationalPerformanceSnapshot>();
    snapshots.forEach(item => unique.set(item.referenceDate, { ...item, storeId }));
    return Array.from(unique.values()).sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
  },

  getStockHistory: async (storeId: string): Promise<StoreStockHistoryPoint[]> => {
    const all = await getDocs(collection(db, 'operational_meta'));
    const points = all.docs
      .filter(item => item.id.startsWith('stock_summary_'))
      .map(item => item.data() as StoreStockHistoryPoint)
      .filter(item => !!item.referenceDate && belongsToStore(item, storeId));
    const unique = new Map<string, StoreStockHistoryPoint>();
    points.forEach(item => unique.set(item.referenceDate, { ...item, storeId }));
    return Array.from(unique.values()).sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
  },
};
