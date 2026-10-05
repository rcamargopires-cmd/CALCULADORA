import React,{useEffect} from 'react';
import type { User } from '../types';
import { dmsIntegrityService } from '../services/dmsIntegrityService';
import { dealTenantService } from '../services/dealTenantService';
import { financeAccountService } from '../services/financeAccountService';

const dayKey=()=>new Date().toISOString().slice(0,10);

const DmsIntegrityAutoRunner:React.FC<{user:User;companyId:string;storeId:string}>=({user,companyId,storeId})=>{
  useEffect(()=>{
    if(!companyId||!storeId)return;
    const key=`motyq:dms-integrity:${companyId}:${storeId}:${dayKey()}`;
    if(localStorage.getItem(key)==='done')return;
    let cancelled=false;
    const timer=window.setTimeout(()=>{
      const prepare=user.role==='admin'
        ? Promise.all([
            dealTenantService.cleanupKnownQaRecords(user).catch(()=>0),
            financeAccountService.cleanupKnownQaAccounts(companyId,storeId,user).catch(()=>0),
          ])
        : Promise.resolve([0,0]);
      void prepare.then(()=>dmsIntegrityService.runAndStore(companyId,storeId,user))
        .then(report=>{
          if(cancelled)return;
          localStorage.setItem(key,'done');
          if(report.criticalCount>0){
            window.dispatchEvent(new CustomEvent('motyq:dms-integrity-alert',{detail:{
              companyId,storeId,critical:report.criticalCount,warning:report.warningCount,
            }}));
          }
        })
        .catch(error=>console.warn('Motyq: diagnóstico automático indisponível.',error));
    },2500);
    return()=>{cancelled=true;window.clearTimeout(timer);};
  },[companyId,storeId,user.email]);
  return null;
};

export default DmsIntegrityAutoRunner;
