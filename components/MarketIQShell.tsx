import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { User } from '../types';
import { userService } from '../services/userService';
import { companyIdForUser } from '../services/companyService';
import { companyScopeService, COMPANY_SCOPE_EVENT } from '../services/companyScopeService';
import { storeIdForUser, storeService } from '../services/storeService';
import { storeScopeService, STORE_SCOPE_EVENT } from '../services/storeScopeService';
import MarketIQ from './MarketIQ';

const MarketIQShell:React.FC=()=>{
 const[user,setUser]=useState<User|null>(null);const[companyId,setCompanyId]=useState('');const[storeId,setStoreId]=useState('');const[storeName,setStoreName]=useState('');
 const resolve=async(profile:User)=>{
   const isAdmin=profile.role==='admin';
   const company=isAdmin?companyScopeService.get(profile):companyIdForUser(profile);
   const store=isAdmin?storeScopeService.get(profile):storeIdForUser(profile);
   setCompanyId(company);setStoreId(store);
   try{const stores=await storeService.getAll();setStoreName(storeService.getName(stores.filter((s:any)=>(s.companyId||company)===company),store));}catch{setStoreName('Unidade ativa');}
 };
 useEffect(()=>onAuthStateChanged(auth,async fb=>{if(!fb?.email){setUser(null);return;}try{const p=await userService.getUser(fb.email);if(!p||p.status!=='active'||!['admin','manager'].includes(String(p.role))){setUser(null);return;}setUser(p);await resolve(p);}catch{setUser(null);}}),[]);
 useEffect(()=>{if(!user||user.role!=='admin')return;const refresh=()=>void resolve(user);window.addEventListener(COMPANY_SCOPE_EVENT,refresh);window.addEventListener(STORE_SCOPE_EVENT,refresh);return()=>{window.removeEventListener(COMPANY_SCOPE_EVENT,refresh);window.removeEventListener(STORE_SCOPE_EVENT,refresh);};},[user]);
 if(!user||!companyId||!storeId)return null;
 return <MarketIQ currentUser={user} companyId={companyId} storeId={storeId} storeName={storeName||'Unidade ativa'}/>;
};
export default MarketIQShell;
