import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { User } from '../types';
import { dmsAuditService } from './dmsAuditService';

const COLLECTIONS=[
  'operational_stock','operational_sales','market_presence','prep_orders','vehicle_history',
  'showroom_passages','evaluation_requests','operational_imports','operational_meta',
] as const;

const readScoped=async(name:string,companyId:string,storeId:string)=>{
  const snap=await getDocs(query(
    collection(db,name),
    where('companyId','==',companyId),
    where('storeId','==',storeId),
  ));
  return snap.docs.map(item=>({__docId:item.id,...item.data()}));
};

const fileSafe=(value:string)=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,80);

export const dmsExportService={
  buildAuditExport:async(companyId:string,storeId:string,actor:Pick<User,'email'|'name'>)=>{
    const entries=await Promise.all(COLLECTIONS.map(async name=>{
      try{return[name,await readScoped(name,companyId,storeId)] as const;}
      catch(error:any){return[name,{error:String(error?.message||'Falha de leitura')}] as const;}
    }));
    const data=Object.fromEntries(entries);
    const generatedAt=new Date().toISOString();
    const counts=Object.fromEntries(entries.map(([name,value])=>[
      name,Array.isArray(value)?value.length:0,
    ]));
    await dmsAuditService.record({
      companyId,storeId,entityType:'system',entityId:`export_${generatedAt}`,
      action:'dms_audit_exported',label:'Exportação de dados e auditoria gerada',
      details:Object.entries(counts).map(([name,count])=>`${name}=${count}`).join(' · '),actor,
    }).catch(()=>undefined);
    return{
      schema:'motyq-dms-audit-export/v1',
      generatedAt,companyId,storeId,
      generatedBy:actor.email,generatedByName:actor.name,
      counts,data,
    };
  },

  downloadJson:async(companyId:string,storeId:string,actor:Pick<User,'email'|'name'>)=>{
    const payload=await dmsExportService.buildAuditExport(companyId,storeId,actor);
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;
    anchor.download=`motyq-auditoria-${fileSafe(companyId)}-${fileSafe(storeId)}-${payload.generatedAt.slice(0,10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    return payload;
  },
};
