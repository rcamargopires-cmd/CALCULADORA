import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { Company, DealMasterModule, Store, User } from '../types';
import { userService } from '../services/userService';
import { companyIdForUser, companyService, DEFAULT_COMPANY } from '../services/companyService';
import { COMPANY_SCOPE_EVENT, companyScopeService } from '../services/companyScopeService';
import { DEFAULT_STORE, storeCompanyId, storeIdForUser, storeService } from '../services/storeService';
import { STORE_SCOPE_EVENT, storeScopeService } from '../services/storeScopeService';
import { companySnapshotForUser, moduleEnabled } from '../services/planEntitlementService';
import '../services/storeScopeAdapter';
import OperationalDataPanel from './OperationalDataPanel';
import AIManagerV2 from './AIManagerV2';
import HierarchyPanel from './HierarchyPanel';
import SellerPrivacyGuard from './SellerPrivacyGuard';
import SmartAlerts from './SmartAlerts';
import ExecutiveInsights from './ExecutiveInsights';
import MultiStorePanel from './MultiStorePanel';
import GroupOverview from './GroupOverview';
import CompaniesPanel from './CompaniesPanel';
import TenantSecurityPanel from './TenantSecurityPanel';
import AssetGuardPanel from './AssetGuardPanel';
import PlanAccessBadge from './PlanAccessBadge';
import MarketPresencePanel from './MarketPresencePanel';
import PrepTrackPanel from './PrepTrackPanel';
import ShowroomFlowHub from './ShowroomFlowHub';
import ShowroomReports from './ShowroomReports';

const OperationalTools: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([DEFAULT_COMPANY]);
  const [stores, setStores] = useState<Store[]>([DEFAULT_STORE]);
  const [companyId, setCompanyId] = useState(DEFAULT_COMPANY.id);
  const [storeId, setStoreId] = useState(DEFAULT_STORE.id);

  const resolveContext = async (profile: User) => {
    if (profile.role !== 'admin') {
      const resolvedCompany = companyIdForUser(profile); const resolvedStore = storeIdForUser(profile); const companySnapshot = companySnapshotForUser(profile);
      companyScopeService.set(resolvedCompany); storeScopeService.set(resolvedStore); setCompanyId(resolvedCompany); setStoreId(resolvedStore); setCompanies([companySnapshot]);
      setStores(resolvedStore === DEFAULT_STORE.id ? [DEFAULT_STORE] : [{ id: resolvedStore, code: 'UNIDADE', name: 'Minha unidade', active: true, companyId: resolvedCompany }]); return;
    }
    const [availableCompanies, availableStores] = await Promise.all([companyService.getAll(), storeService.getAll()]); setCompanies(availableCompanies); setStores(availableStores);
    const resolvedCompany = companyScopeService.ensureValid(availableCompanies, profile); setCompanyId(resolvedCompany);
    const companyStores = availableStores.filter(store => store.active && storeCompanyId(store) === resolvedCompany); const resolvedStore = companyStores.length ? storeScopeService.ensureValid(companyStores, profile) : ''; if (resolvedStore) setStoreId(resolvedStore);
  };

  useEffect(() => onAuthStateChanged(auth, async firebaseUser => { if (!firebaseUser?.email) { setUser(null); return; } try { const profile = await userService.getUser(firebaseUser.email); if (profile?.status !== 'active') { setUser(null); return; } await resolveContext(profile); setUser(profile); } catch { setUser(null); } }), []);
  useEffect(() => { const onCompany = async (event: Event) => { const next = (event as CustomEvent<{ companyId?: string }>).detail?.companyId; if (!next || !user || user.role !== 'admin') return; setCompanyId(next); const allStores = await storeService.getAll(); setStores(allStores); const companyStores = allStores.filter(store => store.active && storeCompanyId(store) === next); const nextStore = companyStores[0]?.id || ''; if (nextStore) { storeScopeService.set(nextStore); setStoreId(nextStore); } }; const onStore = (event: Event) => { const next = (event as CustomEvent<{ storeId?: string }>).detail?.storeId; if (next) setStoreId(next); }; const refreshCompanies = async () => { if (!user || user.role !== 'admin') return; setCompanies(await companyService.getAll()); }; window.addEventListener(COMPANY_SCOPE_EVENT, onCompany); window.addEventListener(STORE_SCOPE_EVENT, onStore); window.addEventListener('dealmaster:company-entitlements-updated', refreshCompanies); return () => { window.removeEventListener(COMPANY_SCOPE_EVENT, onCompany); window.removeEventListener(STORE_SCOPE_EVENT, onStore); window.removeEventListener('dealmaster:company-entitlements-updated', refreshCompanies); }; }, [user]);

  const activeCompany = useMemo(() => companies.find(company => company.id === companyId) || (user ? companySnapshotForUser(user) : DEFAULT_COMPANY), [companies, companyId, user]);
  const companyName = activeCompany.name || companyService.getName(companies, companyId);
  const companyStores = useMemo(() => stores.filter(store => storeCompanyId(store) === companyId), [stores, companyId]);
  const storeName = useMemo(() => storeService.getName(companyStores, storeId), [companyStores, storeId]);
  if (!user) return null;
  if (user.role === 'reception') return storeId ? <ShowroomFlowHub currentUser={user} companyId={companyId} storeId={storeId} storeName={storeName}/> : null;

  const isManager = user.role === 'admin' || user.role === 'manager'; const isSeller = user.role === 'seller' || user.role === 'user';
  const has = (module: DealMasterModule) => moduleEnabled(activeCompany, module);
  const hasOperationalData = has('commandCenter') || has('stockIntelligence') || has('smartAlerts') || has('executiveInsights') || has('aiManager');

  return <>
    <PlanAccessBadge company={activeCompany}/>
    {storeId && <ShowroomFlowHub currentUser={user} companyId={companyId} storeId={storeId} storeName={storeName}/>} 
    {isManager && storeId && <div className="fixed right-20 z-[139]" style={{bottom:440}}><ShowroomReports companyId={companyId} storeId={storeId} storeName={storeName}/></div>}
    {isSeller && <SellerPrivacyGuard user={user}/>} 
    {isManager && storeId && hasOperationalData && <OperationalDataPanel currentUser={user} companyId={companyId} storeId={storeId} storeName={storeName}/>} 
    {isManager && storeId && has('stockIntelligence') && <MarketPresencePanel companyId={companyId} storeId={storeId} storeName={storeName}/>} 
    {isManager && storeId && has('stockIntelligence') && <PrepTrackPanel currentUser={user} companyId={companyId} storeId={storeId} storeName={storeName}/>} 
    {isManager && has('executiveInsights') && <ExecutiveInsights/>}
    {isManager && storeId && has('smartAlerts') && <SmartAlerts companyId={companyId} storeId={storeId} storeName={storeName}/>} 
    {isManager && has('aiManager') && <AIManagerV2/>}
    {storeId && has('assetGuard') && <AssetGuardPanel currentUser={user} companyId={companyId} storeId={storeId} companyName={companyName} storeName={storeName}/>} 
    {user.role === 'admin' && <HierarchyPanel currentUser={user}/>} 
    {user.role === 'admin' && has('multiStore') && <MultiStorePanel currentUser={user} companyId={companyId} companyName={companyName}/>} 
    {user.role === 'admin' && has('groupOverview') && <GroupOverview currentUser={user} companyId={companyId} companyName={companyName}/>} 
    {user.role === 'admin' && <CompaniesPanel currentUser={user}/>} 
    {user.role === 'admin' && <TenantSecurityPanel currentUser={user}/>} 
  </>;
};
export default OperationalTools;