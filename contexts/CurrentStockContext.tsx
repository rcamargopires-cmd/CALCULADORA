import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { OperationalStockItem, User } from '../types';
import { currentStockService } from '../services/currentStockService';
import { COMPANY_SCOPE_EVENT, companyScopeService } from '../services/companyScopeService';
import { STORE_SCOPE_EVENT, storeScopeService } from '../services/storeScopeService';

type CurrentStockState={
  rows:OperationalStockItem[];
  companyId:string;
  storeId:string;
  loading:boolean;
  refresh:()=>Promise<void>;
};

const CurrentStockContext=createContext<CurrentStockState>({
  rows:[],
  companyId:'',
  storeId:'',
  loading:false,
  refresh:async()=>{},
});

const resolveScope=(user:User|null)=>({
  companyId:user?companyScopeService.get(user):'',
  storeId:user?storeScopeService.get(user):'',
});

export const CurrentStockProvider:React.FC<{user:User|null;children:React.ReactNode}>=({user,children})=>{
  const[scope,setScope]=useState(()=>resolveScope(user));
  const[rows,setRows]=useState<OperationalStockItem[]>([]);
  const[loading,setLoading]=useState(false);

  useEffect(()=>{
    const sync=()=>setScope(resolveScope(user));
    sync();
    window.addEventListener(COMPANY_SCOPE_EVENT,sync);
    window.addEventListener(STORE_SCOPE_EVENT,sync);
    return()=>{
      window.removeEventListener(COMPANY_SCOPE_EVENT,sync);
      window.removeEventListener(STORE_SCOPE_EVENT,sync);
    };
  },[user]);

  const refresh=useCallback(async()=>{
    if(!scope.companyId||!scope.storeId){setRows([]);return;}
    setLoading(true);
    try{
      setRows(await currentStockService.getCurrent(scope.companyId,scope.storeId));
    }finally{
      setLoading(false);
    }
  },[scope.companyId,scope.storeId]);

  useEffect(()=>{
    if(!scope.companyId||!scope.storeId){setRows([]);return;}
    void refresh();
    return currentStockService.subscribe(
      scope.companyId,
      scope.storeId,
      next=>{setRows(next);setLoading(false);},
      error=>{console.warn('MOTYQ current stock subscription unavailable',error);setLoading(false);},
    );
  },[scope.companyId,scope.storeId,refresh]);

  const value=useMemo(()=>({rows,companyId:scope.companyId,storeId:scope.storeId,loading,refresh}),[rows,scope.companyId,scope.storeId,loading,refresh]);
  return <CurrentStockContext.Provider value={value}>{children}</CurrentStockContext.Provider>;
};

export const useCurrentStock=()=>useContext(CurrentStockContext);
