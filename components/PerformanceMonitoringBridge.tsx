import React,{useEffect} from 'react';
import type { User } from '../types';
import { performanceMonitoringService } from '../services/performanceMonitoringService';

const PerformanceMonitoringBridge:React.FC<{user:User}>=({user})=>{
  useEffect(()=>{
    const key=`motyq:perf:${user.companyId||''}:${user.email}:${new Date().toISOString().slice(0,10)}`;
    if(sessionStorage.getItem(key)==='done')return;
    let longTaskCount=0;
    let longTaskTotalMs=0;
    let observer:PerformanceObserver|null=null;
    try{
      if('PerformanceObserver' in window){
        observer=new PerformanceObserver(list=>{
          for(const item of list.getEntries()){
            longTaskCount+=1;
            longTaskTotalMs+=item.duration;
          }
        });
        observer.observe({entryTypes:['longtask']});
      }
    }catch{}
    const timer=window.setTimeout(()=>{
      const base=performanceMonitoringService.collect();
      void performanceMonitoringService.record(user,{
        ...base,longTaskCount:Math.max(base.longTaskCount,longTaskCount),
        longTaskTotalMs:Math.max(base.longTaskTotalMs,Math.round(longTaskTotalMs*10)/10),
      }).then(()=>sessionStorage.setItem(key,'done')).catch(()=>undefined);
    },5000);
    return()=>{window.clearTimeout(timer);observer?.disconnect();};
  },[user.email,user.companyId,user.storeId,JSON.stringify(user.storeIds||[])]);
  return null;
};

export default PerformanceMonitoringBridge;
