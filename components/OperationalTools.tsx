import React, { useEffect, useMemo, useState } from 'react';
import { Landmark, LogOut } from 'lucide-react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
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
import SellerActionInbox from './SellerActionInbox';
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
import DirectorPanorama from './DirectorPanorama';
import DirectorAccessPanel from './DirectorAccessPanel';
import ActionCenter from './ActionCenter';

const OperationalTools: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([DEFAULT_COMPANY]);
  const [stores, setStores] = useState<Store[]>([DEFAULT_STORE]);
  const [companyId, setCompanyId] = useState(DEFAULT_COMPANY.id);
  const [storeId, setStoreId] = useState(DEFAULT_STORE.id);
  const [directorOpen, setDirectorOpen] = useState(false);

  const resolveContext = async (profile: User) => {
    const role = String(profile.role || '');
    if (role === 'director') {
      const resolvedCompany = companyIdForUser(profile);
      const companySnapshot = companySnapshotForUser(profile);
      const availableStores = await storeService.getAll();
      const companyStores = availableStores.filter(store => store.active && storeCompanyId(store) === resolvedCompany);
      companyScopeService.set(resolvedCompany);
      setCompanyId(resolvedCompany);
      setCompanies([companySnapshot]);
      setStores(companyStores);
      const firstStore = companyStores[0]?.id || storeIdForUser(profile) || '';
      if (firstStore) {
        storeScopeService.set(firstStore);
        setStoreId(firstStore);
      }
      return;
    }
    if (role !== 'admin') {
      const resolvedCompany = companyIdForUser(profile);
      const resolvedStore = storeIdForUser(profile);
      const companySnapshot = companySnapshotForUser(profile);
      companyScopeService.set(resolvedCompany);
      storeScopeService.set(resolvedStore);
      setCompanyId(resolvedCompany);
      setStoreId(resolvedStore);
      setCompanies([companySnapshot]);
      setStores(resolvedStore === DEFAULT_STORE.id ? [DEFAULT_STORE] : [{ id: resolvedStore, code: 'UNIDADE', name: 'Minha unidade', active: true, companyId: resolvedCompany }]);
      return;
    }
    const [availableCompanies, availableStores] = await Promise.all([companyService.getAll(), storeService.getAll()]);
    setCompanies(availableCompanies);
    setStores(availableStores);
    const resolvedCompany = companyScopeService.ensureValid(availableCompanies, profile);
    setCompanyId(resolvedCompany);
    const companyStores = availableStores.filter(store => store.active && storeCompanyId(store) === resolvedCompany);
    const resolvedStore = companyStores.length ? storeScopeService.ensureValid(companyStores, profile) : '';
    if (resolvedStore) setStoreId(resolvedStore);
  };

  useEffect(() => onAuthStateChanged(auth, async firebaseUser => {
    if (!firebaseUser?.email) {
      setUser(null);
      return;
    }
    try {
      const profile = await userService.getUser(firebaseUser.email);
      if (profile?.status !== 'active') {
        setUser(null);
        return;
      }
      await resolveContext(profile);
      setUser(profile);
    } catch {
      setUser(null);
    }
  }), []);

  useEffect(() => {
    const onCompany = async (event: Event) => {
      const next = (event as CustomEvent<{ companyId?: string }>).detail?.companyId;
      if (!next || !user || String(user.role) !== 'admin') return;
      setCompanyId(next);
      const allStores = await storeService.getAll();
      setStores(allStores);
      const companyStores = allStores.filter(store => store.active && storeCompanyId(store) === next);
      const nextStore = companyStores[0]?.id || '';
      if (nextStore) {
        storeScopeService.set(nextStore);
        setStoreId(nextStore);
      }
    };
    const onStore = (event: Event) => {
      const next = (event as CustomEvent<{ storeId?: string }>).detail?.storeId;
      if (next) setStoreId(next);
    };
    const refreshCompanies = async () => {
      if (!user || String(user.role) !== 'admin') return;
      setCompanies(await companyService.getAll());
    };
    window.addEventListener(COMPANY_SCOPE_EVENT, onCompany);
    window.addEventListener(STORE_SCOPE_EVENT, onStore);
    window.addEventListener('dealmaster:company-entitlements-updated', refreshCompanies);
    return () => {
      window.removeEventListener(COMPANY_SCOPE_EVENT, onCompany);
      window.removeEventListener(STORE_SCOPE_EVENT, onStore);
      window.removeEventListener('dealmaster:company-entitlements-updated', refreshCompanies);
    };
  }, [user]);

  const activeCompany = useMemo(() => companies.find(company => company.id === companyId) || (user ? companySnapshotForUser(user) : DEFAULT_COMPANY), [companies, companyId, user]);
  const companyName = activeCompany.name || companyService.getName(companies, companyId);
  const companyStores = useMemo(() => stores.filter(store => storeCompanyId(store) === companyId), [stores, companyId]);
  const storeName = useMemo(() => storeService.getName(companyStores, storeId), [companyStores, storeId]);

  if (!user) return null;
  const role = String(user.role || '');

  if (role === 'reception') {
    return storeId ? <ShowroomFlowHub currentUser={user} companyId={companyId} storeId={storeId} storeName={storeName}/> : null;
  }

  if (role === 'director') {
    return <>
      <DirectorPanorama currentUser={user} companyId={companyId} companyName={companyName}/>
      <button
        onClick={() => signOut(auth)}
        title="Sair do MOTYQ"
        className="fixed right-6 top-5 z-[540] flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-[#20242c] px-3 text-xs font-bold text-zinc-200 shadow-xl transition hover:bg-[#2a2f38]"
      >
        <LogOut size={15}/>
        SAIR
      </button>
    </>;
  }

  const isManager = role === 'admin' || role === 'manager';
  const isSeller = role === 'seller' || role === 'user';
  const has = (module: DealMasterModule) => moduleEnabled(activeCompany, module);
  const hasOperationalData = has('commandCenter') || has('stockIntelligence') || has('smartAlerts') || has('executiveInsights') || has('aiManager');

  return <>
    <PlanAccessBadge company={activeCompany}/>
    {storeId && <ShowroomFlowHub currentUser={user} companyId={companyId} storeId={storeId} storeName={storeName}/>} 
    {isManager && storeId && <ShowroomReports companyId={companyId} storeId={storeId} storeName={storeName}/>} 
    {isSeller && <SellerPrivacyGuard user={user}/>} 
    {isSeller && storeId && <SellerActionInbox currentUser={user} companyId={companyId} storeId={storeId} storeName={storeName}/>} 
    {isManager && storeId && <ActionCenter currentUser={user} companyId={companyId} storeId={storeId} storeName={storeName}/>} 
    {isManager && storeId && hasOperationalData && <OperationalDataPanel currentUser={user} companyId={companyId} storeId={storeId} storeName={storeName}/>} 
    {isManager && storeId && has('stockIntelligence') && <MarketPresencePanel companyId={companyId} storeId={storeId} storeName={storeName}/>} 
    {isManager && storeId && has('stockIntelligence') && <PrepTrackPanel currentUser={user} companyId={companyId} storeId={storeId} storeName={storeName}/>} 
    {isManager && has('executiveInsights') && <ExecutiveInsights/>}
    {isManager && storeId && has('smartAlerts') && <SmartAlerts companyId={companyId} storeId={storeId} storeName={storeName}/>} 
    {isManager && has('aiManager') && <AIManagerV2/>}
    {storeId && has('assetGuard') && <AssetGuardPanel currentUser={user} companyId={companyId} storeId={storeId} companyName={companyName} storeName={storeName}/>} 
    {role === 'admin' && <HierarchyPanel currentUser={user}/>} 
    {role === 'admin' && has('multiStore') && <MultiStorePanel currentUser={user} companyId={companyId} companyName={companyName}/>} 
    {role === 'admin' && has('groupOverview') && <GroupOverview currentUser={user} companyId={companyId} companyName={companyName}/>} 
    {role === 'admin' && <button onClick={()=>setDirectorOpen(true)} title="Diretoria · Panorama do Grupo" className="group fixed bottom-72 left-5 z-[144] grid h-12 w-12 place-items-center rounded-full border border-amber-300/25 bg-[#20242c] text-amber-200 shadow-2xl transition hover:border-amber-300/50 hover:bg-[#272c35]"><Landmark size={18}/><span className="pointer-events-none absolute left-14 whitespace-nowrap rounded-lg border border-white/10 bg-[#20242c] px-3 py-2 text-xs font-semibold text-amber-100 opacity-0 shadow-xl transition group-hover:opacity-100">Diretoria</span></button>}
    {role === 'admin' && directorOpen && <div className="fixed inset-0 z-[519]"><button onClick={()=>setDirectorOpen(false)} className="fixed right-6 top-5 z-[530] rounded-xl border border-white/10 bg-black/40 px-4 py-2 text-xs font-bold text-white">FECHAR</button><DirectorAccessPanel currentUser={user} company={activeCompany}/><DirectorPanorama currentUser={user} companyId={companyId} companyName={companyName}/></div>}
    {role === 'admin' && <CompaniesPanel currentUser={user}/>} 
    {role === 'admin' && <TenantSecurityPanel currentUser={user}/>} 
  </>;
};

export default OperationalTools;
