import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { Store, User } from '../types';
import { userService } from '../services/userService';
import { DEFAULT_STORE, storeIdForUser, storeService } from '../services/storeService';
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

const OperationalTools: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [stores, setStores] = useState<Store[]>([DEFAULT_STORE]);
  const [storeId, setStoreId] = useState(DEFAULT_STORE.id);

  useEffect(() => onAuthStateChanged(auth, async firebaseUser => {
    if (!firebaseUser?.email) { setUser(null); return; }
    try {
      const profile = await userService.getUser(firebaseUser.email);
      if (profile?.status !== 'active') { setUser(null); return; }
      const available = await storeService.getAll();
      setStores(available);
      const resolved = profile.role === 'admin'
        ? storeScopeService.ensureValid(available, profile)
        : storeIdForUser(profile);
      if (profile.role !== 'admin') storeScopeService.set(resolved);
      setStoreId(resolved);
      setUser(profile);
    } catch {
      setUser(null);
    }
  }), []);

  useEffect(() => {
    const onScope = (event: Event) => {
      const next = (event as CustomEvent<{ storeId?: string }>).detail?.storeId;
      if (next) setStoreId(next);
    };
    window.addEventListener(STORE_SCOPE_EVENT, onScope);
    return () => window.removeEventListener(STORE_SCOPE_EVENT, onScope);
  }, []);

  const storeName = useMemo(() => storeService.getName(stores, storeId), [stores, storeId]);

  if (!user) return null;
  const isManager = user.role === 'admin' || user.role === 'manager';
  const isSeller = user.role === 'seller' || user.role === 'user';

  return <>
    {isSeller && <SellerPrivacyGuard user={user}/>} 
    {isManager && <OperationalDataPanel currentUser={user} storeId={storeId} storeName={storeName}/>} 
    {isManager && <ExecutiveInsights/>}
    {isManager && <SmartAlerts/>}
    {isManager && <AIManagerV2/>}
    {user.role === 'admin' && <HierarchyPanel currentUser={user}/>} 
    {user.role === 'admin' && <MultiStorePanel currentUser={user}/>} 
    {user.role === 'admin' && <GroupOverview currentUser={user}/>} 
  </>;
};

export default OperationalTools;
