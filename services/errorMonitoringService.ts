import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { User } from '../types';
import { storeScopeService } from './storeScopeService';

const seen=new Map<string,number>();
const safe=(value:string)=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);

export const errorMonitoringService={
  capture:async(user:User|null|undefined,input:{source:string;message:string;stack?:string;url?:string;details?:string})=>{
    if(!user?.companyId)return;
    const signature=`${input.source}|${input.message}|${input.stack||''}`.slice(0,800);
    const last=seen.get(signature)||0;
    if(Date.now()-last<60_000)return;
    seen.set(signature,Date.now());
    const storeId=storeScopeService.get(user)||user.storeId||'';
    if(!storeId)return;
    const id=safe(`dms_error_${user.companyId}_${storeId}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`);
    await setDoc(doc(db,'operational_meta',id),{
      id,kind:'dms_error',companyId:user.companyId,storeId,
      source:String(input.source||'client').slice(0,120),
      message:String(input.message||'Erro desconhecido').slice(0,2000),
      stack:String(input.stack||'').slice(0,8000),
      url:String(input.url||location.href||'').slice(0,1200),
      details:String(input.details||'').slice(0,3000),
      userEmail:user.email,userName:user.name,role:user.role,
      createdAt:new Date().toISOString(),
      userAgent:navigator.userAgent.slice(0,600),
    },{merge:false});
  },
};
