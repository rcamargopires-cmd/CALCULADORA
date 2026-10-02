import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { User } from '../types';
import { storeScopeService } from './storeScopeService';

const safe=(value:string)=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const num=(value:number)=>Number.isFinite(value)?Math.round(value*10)/10:0;

export type DmsPerformanceSample={
  navigationMs:number;
  domInteractiveMs:number;
  transferKb:number;
  decodedBodyKb:number;
  longTaskCount:number;
  longTaskTotalMs:number;
  firstContentfulPaintMs:number;
};

export const performanceMonitoringService={
  collect:():DmsPerformanceSample=>{
    const nav=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined;
    const paints=performance.getEntriesByType('paint') as PerformanceEntry[];
    const fcp=paints.find(item=>item.name==='first-contentful-paint');
    const longTasks=(performance.getEntriesByType('longtask')||[]) as PerformanceEntry[];
    return{
      navigationMs:num(nav?.duration||0),
      domInteractiveMs:num(nav?.domInteractive||0),
      transferKb:num((nav?.transferSize||0)/1024),
      decodedBodyKb:num((nav?.decodedBodySize||0)/1024),
      longTaskCount:longTasks.length,
      longTaskTotalMs:num(longTasks.reduce((sum,item)=>sum+item.duration,0)),
      firstContentfulPaintMs:num(fcp?.startTime||0),
    };
  },

  record:async(user:User,sample?:DmsPerformanceSample)=>{
    if(!user.companyId)return;
    const storeId=storeScopeService.get(user)||user.storeId||'';
    if(!storeId)return;
    const metrics=sample||performanceMonitoringService.collect();
    const stamp=new Date().toISOString();
    const id=safe(`dms_performance_${user.companyId}_${storeId}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`);
    await setDoc(doc(db,'operational_meta',id),{
      id,kind:'dms_performance',companyId:user.companyId,storeId,
      ...metrics,createdAt:stamp,userEmail:user.email,userName:user.name,role:user.role,
      path:location.pathname+location.search,
      userAgent:navigator.userAgent.slice(0,600),
    },{merge:false});
  },
};
