import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { User } from '../types';
import { userService } from '../services/userService';
import { companyIdForUser } from '../services/companyService';
import { COMPANY_SCOPE_EVENT, companyScopeService } from '../services/companyScopeService';
import { storeIdForUser, storeService } from '../services/storeService';
import { STORE_SCOPE_EVENT, storeScopeService } from '../services/storeScopeService';
import MarketPresenceCorrectionPanel from './MarketPresenceCorrectionPanel';

const MarketPresenceCorrectionShell:React.FC=()=>{
 const[user,setUser]=useState<User|null>(null);const[companyId,setCompanyId]=useState('');const[storeId,setStoreId]=useState('');const[storeName,setStoreName]=useState('Unidade');
 const resolve=async(profile:User)=>{const admin=profile.role==='admin';const company=admin?companyScopeService.get():companyIdForUser(profile);const store=admin?storeScopeService.get():storeIdForUser(profile);setCompanyId(company);setStoreId(store);try{const stores=await storeService.getAll();setStoreName(stores.find(item=>item.id===store)?.name||'Unidade');}catch{setStoreName('Unidade');}};
 useEffect(()=>onAuthStateChanged(auth,async firebaseUser=>{if(!firebaseUser?.email){setUser(null);return;}try{const profile=await userService.getUser(firebaseUser.email);if(!profile||profile.status!=='active'||!['admin','manager'].includes(profile.role)){setUser(null);return;}setUser(profile);await resolve(profile);}catch{setUser(null);}}),[]);
 useEffect(()=>{if(!user)return;const refresh=()=>resolve(user);window.addEventListener(COMPANY_SCOPE_EVENT,refresh);window.addEventListener(STORE_SCOPE_EVENT,refresh);return()=>{window.removeEventListener(COMPANY_SCOPE_EVENT,refresh);window.removeEventListener(STORE_SCOPE_EVENT,refresh);};},[user]);
 if(!user||!companyId||!storeId)return null;
 return <MarketPresenceCorrectionPanel currentUser={user} companyId={companyId} storeId={storeId} storeName={storeName}/>;
};

export default MarketPresenceCorrectionShell;
