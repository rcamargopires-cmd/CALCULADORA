import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { OperationalPerformanceSeller, OperationalPerformanceSnapshot, User } from '../types';
import { normalize } from './operationalDataService';
import { DEFAULT_COMPANY_ID } from './companyService';
import { companyScopeService } from './companyScopeService';
import { DEFAULT_STORE_ID, storeIdForUser } from './storeService';
import { userService } from './userService';

export type SellerPerformanceRecord = {
  sellerEmail: string;
  sellerName: string;
  referenceDate: string;
  sheetName: string;
  metrics: OperationalPerformanceSeller;
  storeId?: string;
  companyId?: string;
};

const officialClosingRate = (item: OperationalPerformanceSeller) => {
  const flow = Number(item.flowTotal || 0);
  const rawRate = Number(item.closingPercent || 0);
  const rawClosing = Number(item.closing || 0);
  if (flow > 0 && rawRate > 0 && rawRate <= 2 && Math.abs(rawRate - rawClosing) < 0.000001) return rawRate * 100;
  return rawRate;
};

const officialClosingCount = (item: OperationalPerformanceSeller) => {
  const flow = Number(item.flowTotal || 0);
  const rate = officialClosingRate(item);
  if (flow > 0 && Number.isFinite(rate)) {
    const derived = (rate / 100) * flow;
    const rounded = Math.round(derived);
    return Math.abs(derived - rounded) < 0.02 ? rounded : Number(derived.toFixed(2));
  }
  return Number(item.closing || 0);
};

const normalizeMetrics = (item: OperationalPerformanceSeller): OperationalPerformanceSeller => ({
  ...item,
  closing: officialClosingCount(item),
  closingPercent: officialClosingRate(item),
});

const findUserForSeller = (seller: OperationalPerformanceSeller, users: User[]) => {
  const key = normalize(seller.seller);
  const sellerUsers = users.filter(user => user.role === 'seller' || user.role === 'user');
  const exactMatches = sellerUsers.filter(user => normalize(user.name || '') === key);
  if (exactMatches.length === 1) return exactMatches[0];
  const firstNameMatches = sellerUsers.filter(user => normalize(user.name || '').split(' ')[0] === key.split(' ')[0]);
  return firstNameMatches.length === 1 ? firstNameMatches[0] : undefined;
};

export const sellerPerformanceService = {
  syncFromSnapshot: async (
    snapshot: OperationalPerformanceSnapshot,
    storeId = snapshot.storeId || DEFAULT_STORE_ID,
    companyId = snapshot.companyId || companyScopeService.get(),
  ) => {
    const tenant = companyId || DEFAULT_COMPANY_ID;
    const users = (await userService.getAll(tenant))
      .filter(user => user.status === 'active' && storeIdForUser(user) === storeId);
    let linked = 0;

    for (const seller of snapshot.sellers) {
      const user = findUserForSeller(seller, users);
      if (!user?.email) continue;
      const email = String(user.email).trim();
      const record: SellerPerformanceRecord = {
        sellerEmail: email,
        sellerName: seller.seller,
        referenceDate: snapshot.referenceDate,
        sheetName: snapshot.sheetName,
        metrics: normalizeMetrics(seller),
        companyId: tenant,
        storeId,
      };

      await setDoc(doc(db, 'seller_performance', email), {
        ...record, userId: user.id || '', userRole: user.role, updatedAt: serverTimestamp(),
      }, { merge: true });

      await setDoc(doc(db, 'seller_performance', email, 'history', `${storeId}_${snapshot.referenceDate}`), {
        ...record, userId: user.id || '', userRole: user.role, updatedAt: serverTimestamp(),
      }, { merge: true });
      linked += 1;
    }
    return linked;
  },

  getMine: async (email: string): Promise<SellerPerformanceRecord | null> => {
    const exactEmail = String(email || '').trim();
    if (!exactEmail) return null;
    const snap = await getDoc(doc(db, 'seller_performance', exactEmail));
    return snap.exists() ? snap.data() as SellerPerformanceRecord : null;
  },

  getMyHistory: async (email: string): Promise<SellerPerformanceRecord[]> => {
    const exactEmail = String(email || '').trim();
    if (!exactEmail) return [];
    const snap = await getDocs(collection(db, 'seller_performance', exactEmail, 'history'));
    return snap.docs
      .map(item => item.data() as SellerPerformanceRecord)
      .filter(item => !!item.referenceDate && !!item.metrics)
      .sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
  },
};
