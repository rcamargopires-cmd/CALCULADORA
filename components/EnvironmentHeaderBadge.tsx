import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, MapPin } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { Company, Store, User } from '../types';
import { userService } from '../services/userService';
import { companyIdForUser, companyService, DEFAULT_COMPANY } from '../services/companyService';
import { COMPANY_SCOPE_EVENT, companyScopeService } from '../services/companyScopeService';
import { storeCompanyId, storeIdForUser, storeService } from '../services/storeService';
import { STORE_SCOPE_EVENT, storeScopeService } from '../services/storeScopeService';

const SLOT_ID = 'motyq-environment-header-slot';

const findHeader = () => document.querySelector('#root > div > div.max-w-6xl > header') as HTMLElement | null;

const ensureSlot = () => {
  const existing = document.getElementById(SLOT_ID);
  if (existing) return existing;
  const header = findHeader();
  if (!header) return null;
  const slot = document.createElement('div');
  slot.id = SLOT_ID;
  slot.className = 'w-full md:w-auto md:shrink-0';
  const actions = header.lastElementChild;
  if (actions) header.insertBefore(slot, actions);
  else header.appendChild(slot);
  return slot;
};

const EnvironmentHeaderBadge: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([DEFAULT_COMPANY]);
  const [stores, setStores] = useState<Store[]>([]);
  const [companyId, setCompanyId] = useState(DEFAULT_COMPANY.id);
  const [storeId, setStoreId] = useState('');
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  const loadContext = async (profile: User) => {
    const role = String(profile.role || '');
    const [allCompanies, allStores] = await Promise.all([
      role === 'admin' ? companyService.getAll() : Promise.resolve([DEFAULT_COMPANY]),
      storeService.getAll(),
    ]);
    const nextCompanyId = role === 'admin' ? companyScopeService.get(profile) : companyIdForUser(profile);
    const companyStores = allStores.filter(store => store.active && storeCompanyId(store) === nextCompanyId);
    const nextStoreId = role === 'admin' ? storeScopeService.get(profile) : storeIdForUser(profile);
    setCompanies(allCompanies);
    setStores(allStores);
    setCompanyId(nextCompanyId);
    setStoreId(companyStores.some(store => store.id === nextStoreId) ? nextStoreId : companyStores[0]?.id || nextStoreId || '');
  };

  useEffect(() => onAuthStateChanged(auth, async firebaseUser => {
    if (!firebaseUser?.email) {
      setUser(null);
      return;
    }
    try {
      const profile = await userService.getUser(firebaseUser.email);
      if (!profile || profile.status !== 'active') {
        setUser(null);
        return;
      }
      setUser(profile);
      await loadContext(profile);
    } catch {
      setUser(null);
    }
  }), []);

  useEffect(() => {
    let observer: MutationObserver | undefined;
    const syncSlot = () => {
      const next = ensureSlot();
      if (next) setSlot(next);
    };
    syncSlot();
    observer = new MutationObserver(syncSlot);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    if (!user) return;
    const refresh = () => loadContext(user).catch(() => undefined);
    window.addEventListener(COMPANY_SCOPE_EVENT, refresh);
    window.addEventListener(STORE_SCOPE_EVENT, refresh);
    window.addEventListener('dealmaster:company-entitlements-updated', refresh);
    return () => {
      window.removeEventListener(COMPANY_SCOPE_EVENT, refresh);
      window.removeEventListener(STORE_SCOPE_EVENT, refresh);
      window.removeEventListener('dealmaster:company-entitlements-updated', refresh);
    };
  }, [user]);

  const companyName = useMemo(() => {
    if (!user) return '';
    if (String(user.role) !== 'admin') {
      return user.companyName || companies.find(company => company.id === companyId)?.name || (companyId === DEFAULT_COMPANY.id ? DEFAULT_COMPANY.name : companyId);
    }
    return companyService.getName(companies, companyId);
  }, [companies, companyId, user]);

  const storeName = useMemo(() => {
    if (!user || String(user.role) === 'director') return '';
    const companyStores = stores.filter(store => storeCompanyId(store) === companyId);
    return companyStores.find(store => store.id === storeId)?.name || (storeId ? storeService.getName(companyStores, storeId) : '');
  }, [stores, companyId, storeId, user]);

  if (!user || !slot) return null;
  const isDirector = String(user.role) === 'director';

  return createPortal(
    <div className="motyq-environment-badge flex min-h-12 w-full items-center gap-3 rounded-2xl border border-sky-300/15 bg-sky-300/[0.045] px-3 py-2 md:w-auto md:min-w-[210px]">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-sky-300/15 bg-sky-300/[0.07] text-sky-300">
        <Building2 size={17}/>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[9px] font-black uppercase tracking-[0.16em] text-sky-300/75">{isDirector ? 'GRUPO ATIVO' : 'AMBIENTE ATIVO'}</p>
        <p className="truncate text-[12px] font-extrabold text-zinc-100">{companyName}</p>
        <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] text-zinc-500">
          <MapPin size={10} className="shrink-0"/>
          <span className="truncate">{isDirector ? 'Visão consolidada do grupo' : storeName || 'Unidade não definida'}</span>
        </div>
      </div>
    </div>,
    slot,
  );
};

export default EnvironmentHeaderBadge;
