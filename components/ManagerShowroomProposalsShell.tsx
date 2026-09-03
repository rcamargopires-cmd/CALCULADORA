import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { User } from '../types';
import { userService } from '../services/userService';
import { companyIdForUser } from '../services/companyService';
import { COMPANY_SCOPE_EVENT, companyScopeService } from '../services/companyScopeService';
import { storeIdForUser, storeService } from '../services/storeService';
import { STORE_SCOPE_EVENT, storeScopeService } from '../services/storeScopeService';
import ManagerShowroomProposals from './ManagerShowroomProposals';

const ManagerShowroomProposalsShell: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [storeName, setStoreName] = useState('');

  useEffect(() => onAuthStateChanged(auth, async firebaseUser => {
    if (!firebaseUser?.email) { setUser(null); return; }
    try {
      const profile = await userService.getUser(firebaseUser.email);
      if (!profile || profile.status !== 'active' || !['admin', 'manager'].includes(profile.role)) { setUser(null); return; }
      setUser(profile);
      const company = profile.role === 'admin' ? companyScopeService.get(profile) : companyIdForUser(profile);
      const store = profile.role === 'admin' ? storeScopeService.get(profile) : storeIdForUser(profile);
      setCompanyId(company); setStoreId(store);
      const stores = await storeService.getAll();
      setStoreName(storeService.getName(stores.filter(item => !item.companyId || item.companyId === company), store));
    } catch { setUser(null); }
  }), []);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    const refresh = async () => {
      const company = companyScopeService.get(user);
      const store = storeScopeService.get(user);
      setCompanyId(company); setStoreId(store);
      const stores = await storeService.getAll();
      setStoreName(storeService.getName(stores.filter(item => !item.companyId || item.companyId === company), store));
    };
    window.addEventListener(COMPANY_SCOPE_EVENT, refresh);
    window.addEventListener(STORE_SCOPE_EVENT, refresh);
    return () => { window.removeEventListener(COMPANY_SCOPE_EVENT, refresh); window.removeEventListener(STORE_SCOPE_EVENT, refresh); };
  }, [user]);

  if (!user || !companyId || !storeId) return null;
  return <ManagerShowroomProposals currentUser={user} companyId={companyId} storeId={storeId} storeName={storeName || 'Unidade atual'}/>;
};

export default ManagerShowroomProposalsShell;
