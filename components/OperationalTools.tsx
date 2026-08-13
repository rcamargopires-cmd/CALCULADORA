import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { Company, Store, User } from '../types';
import { userService } from '../services/userService';
import { companyIdForUser, companyService, DEFAULT_COMPANY } from '../services/companyService';
import { COMPANY_SCOPE_EVENT, companyScopeService } from '../services/companyScopeService';
import { DEFAULT_STORE, storeCompanyId, storeIdForUser, storeService } from '../services/storeService';
import { STORE_SCOPE_EVENT, storeScopeService } from '../services/storeScopeService';
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

const OperationalTools: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([DEFAULT_COMPANY]);
  const [stores, setStores] = useState<Store[]>([DEFAULT_STORE]);
  const [companyId, setCompanyId] = useState(DEFAULT_COMPANY.id);
  const [storeId, setStoreId] = useState(DEFAULT_STORE.id);

  const resolveContext = async (profile: User) => {
    if (profile.role !== 'admin') {
      const resolvedCompany = companyIdForUser(profile);
      const resolvedStore = storeIdForUser(profile);
      companyScopeService.set(resolvedCompany);
      storeScopeService.set(resolvedStore);
      setCompanyId(resolvedCompany);
      setStoreId(resolvedStore);
      setCompanies(resolvedCompany === DEFAULT_COMPANY.id ? [DEFAULT_COMPANY] : [{ id: resolvedCompany, slug: resolvedCompany, name: 'Minha empresa', plan: 'starter', status: 'active' }]);
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
    if (!firebaseUser?.email) { setUser(null); return; }
    try {
      const profile = await userService.getUser(firebaseUser.email);
      if (profile?.status !== 'active') { setUser(null); return; }
      await resolveContext(profile);
      setUser(profile);
    } catch {
      setUser(null);
    }
  }), []);

  useEffect(() => {
    const onCompany = async (event: Event) => {
      const next = (event as CustomEvent<{ companyId?: string }>).detail?.companyId;
      if (!next || !user || user.role !== 'admin') return;
      setCompanyId(next);
      const allStores = await storeService.getAll();
      setStores(allStores);
      const companyStores = allStores.filter(store => store.active && storeCompanyId(store) === next);
      const nextStore = companyStores[0]?.id || '';
      if (nextStore) { storeScopeService.set(nextStore); setStoreId(nextStore); }
    };
    const onStore = (event: Event) => {
      const next = (event as CustomEvent<{ storeId?: string }>).detail?.storeId;
      if (next) setStoreId(next);
    };
    window.addEventListener(COMPANY_SCOPE_EVENT, onCompany);
    window.addEventListener(STORE_SCOPE_EVENT, onStore);
    return () => {
      window.removeEventListener(COMPANY_SCOPE_EVENT, onCompany);
      window.removeEventListener(STORE_SCOPE_EVENT, onStore);
    };
  }, [user]);

  const companyName = useMemo(() => companyService.getName(companies, companyId), [companies, companyId]);
  const companyStores = useMemo(() => stores.filter(store => storeCompanyId(store) === companyId), [stores, companyId]);
  const storeName = useMemo(() => storeService.getName(companyStores, storeId), [companyStores, storeId]);

  if (!user) return null;
  const isManager = user.role === 'admin' || user.role === 'manager';
  const isSeller = user.role === 'seller' || user.role === 'user';

  return <>
    {isSeller && <SellerPrivacyGuard user={user}/>} 
    {isManager && storeId && <OperationalDataPanel currentUser={user} companyId={companyId} storeId={storeId} storeName={storeName}/>} 
    {isManager && <ExecutiveInsights/>}
    {isManager && <SmartAlerts/>}
    {isManager && <AIManagerV2/>}
    {storeId && <AssetGuardPanel currentUser={user} companyName={companyName} storeName={storeName}/>} 
    {user.role === 'admin' && <HierarchyPanel currentUser={user}/>} 
    {user.role === 'admin' && <MultiStorePanel currentUser={user} companyId={companyId} companyName={companyName}/>} 
    {user.role === 'admin' && <GroupOverview currentUser={user} companyId={companyId} companyName={companyName}/>} 
    {user.role === 'admin' && <CompaniesPanel currentUser={user}/>} 
    {user.role === 'admin' && <TenantSecurityPanel currentUser={user}/>} 
  </>;
};

export default OperationalTools;