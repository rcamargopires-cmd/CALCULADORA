import { operationalDataService } from './operationalDataService';
import { sellerPerformanceService } from './sellerPerformanceService';
import { companyScopeService } from './companyScopeService';
import { storeScopeService } from './storeScopeService';
import { storeScopedOperationalService } from './storeScopedOperationalService';

// Monthly commercial-cycle guard.
// Performance KPIs are cumulative inside a calendar month, so the last map from
// a previous month must never be treated as the current month's live snapshot.
// Historical documents remain stored in Firestore; only the active operational
// reading is scoped to the current calendar month.
const currentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const belongsToCurrentMonth = (referenceDate?: string | null) =>
  Boolean(referenceDate && String(referenceDate).slice(0, 7) === currentMonthKey());

const rawScopedLatestPerformance = storeScopedOperationalService.getLatestPerformance.bind(storeScopedOperationalService);
const rawScopedPerformanceHistory = storeScopedOperationalService.getPerformanceHistory.bind(storeScopedOperationalService);
const rawSellerMine = sellerPerformanceService.getMine.bind(sellerPerformanceService);
const rawSellerHistory = sellerPerformanceService.getMyHistory.bind(sellerPerformanceService);

// Direct consumers such as Action Center, Impact and Director views also receive
// only a current-month live performance snapshot.
storeScopedOperationalService.getLatestPerformance = async (...args) => {
  const snapshot = await rawScopedLatestPerformance(...args);
  return snapshot && belongsToCurrentMonth(snapshot.referenceDate) ? snapshot : null;
};

// Legacy/compatibility consumers use the same rule. History exposed to live
// operational screens is current-month only, preventing September day 1 from
// comparing cumulative August figures against a new monthly cycle.
operationalDataService.getLatestPerformance = async () =>
  storeScopedOperationalService.getLatestPerformance(storeScopeService.get(), companyScopeService.get());

operationalDataService.getPerformanceHistory = async () => {
  const rows = await rawScopedPerformanceHistory(storeScopeService.get(), companyScopeService.get());
  return rows.filter(item => belongsToCurrentMonth(item.referenceDate));
};

// Seller My Performance follows the same monthly cycle. The old records remain
// in seller_performance/history, but the live panel starts clean each month.
sellerPerformanceService.getMine = async (email: string) => {
  const record = await rawSellerMine(email);
  return record && belongsToCurrentMonth(record.referenceDate) ? record : null;
};

sellerPerformanceService.getMyHistory = async (...args) => {
  const rows = await rawSellerHistory(...args);
  return rows.filter(item => belongsToCurrentMonth(item.referenceDate));
};

export const monthCycle = {
  currentMonthKey,
  belongsToCurrentMonth,
};
