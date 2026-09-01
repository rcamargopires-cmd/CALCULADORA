import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { OperationalPerformanceSeller, OperationalPerformanceSnapshot, User } from '../types';
import { normalize } from './operationalDataService';
import { DEFAULT_COMPANY_ID, companyIdForUser } from './companyService';
import { companyScopeService } from './companyScopeService';
import { normalizeOfficialSellerMetrics } from './performanceMetrics';
import { DEFAULT_STORE_ID, storeIdForUser } from './storeService';
import { storeScopeService } from './storeScopeService';
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

const findUserForSeller = (seller: OperationalPerformanceSeller, users: User[]) => {
  const key = normalize(seller.seller);
  const sellerUsers = users.filter(user => user.role === 'seller' || user.role === 'user');
  const exactMatches = sellerUsers.filter(user => normalize(user.name || '') === key);
  if (exactMatches.length === 1) return exactMatches[0];
  const firstNameMatches = sellerUsers.filter(user => normalize(user.name || '').split(' ')[0] === key.split(' ')[0]);
  return firstNameMatches.length === 1 ? firstNameMatches[0] : undefined;
};

const resolveHistoryScope = async (user?: User | null) => {
  let profile = user || null;
  if (!profile && auth.currentUser?.email) {
    try { profile = await userService.getUser(auth.currentUser.email); } catch {}
  }
  return {
    companyId: profile ? companyIdForUser(profile) : companyScopeService.get(),
    storeId: profile ? storeIdForUser(profile) : storeScopeService.get(),
  };
};

const readHistory = async (email: string, user?: User | null): Promise<SellerPerformanceRecord[]> => {
  const exactEmail = String(email || '').trim();
  if (!exactEmail) return [];
  const { companyId, storeId } = await resolveHistoryScope(user);
  const snap = await getDocs(query(
    collection(db, 'seller_performance', exactEmail, 'history'),
    where('companyId', '==', companyId),
    where('storeId', '==', storeId),
  ));
  return snap.docs
    .map(item => item.data() as SellerPerformanceRecord)
    .filter(item => !!item.referenceDate && !!item.metrics)
    .map(item => ({ ...item, metrics: normalizeOfficialSellerMetrics(item.metrics) }))
    .sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
};

export const sellerPerformanceService = {
  syncFromSnapshot: async (
    snapshot: OperationalPerformanceSnapshot,
    storeId = snapshot.storeId || DEFAULT_STORE_ID,
    companyId = snapshot.companyId || companyScopeService.get(),
  ) => {
    const tenant = companyId || DEFAULT_COMPANY_ID;
    const users = (await userService.getAll(tenant, storeId))
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
        metrics: normalizeOfficialSellerMetrics(seller),
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
    if (!snap.exists()) return null;
    const record = snap.data() as SellerPerformanceRecord;
    return { ...record, metrics: normalizeOfficialSellerMetrics(record.metrics) };
  },

  getMyHistory: async (email: string, user?: User | null): Promise<SellerPerformanceRecord[]> =>
    readHistory(email, user),

  // Archive intentionally bypasses the live current-month adapter. It is used by
  // the seller's Closing History so previous months remain available forever.
  getMyHistoryArchive: async (email: string, user?: User | null): Promise<SellerPerformanceRecord[]> =>
    readHistory(email, user),
};