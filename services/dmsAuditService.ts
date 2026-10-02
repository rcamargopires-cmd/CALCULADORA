import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { DmsAuditEvent, User } from '../types';

const LEDGER='operational_meta';
const safe=(value:string)=>String(value||'')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-zA-Z0-9_-]/g,'-')
  .replace(/-+/g,'-')
  .slice(0,180);

export const dmsAuditService={
  record:async(input:{
    companyId:string;
    storeId:string;
    entityType:DmsAuditEvent['entityType'];
    entityId:string;
    action:string;
    label:string;
    details?:string;
    amount?:number;
    plate?:string;
    vehicleId?:string;
    actor?:Pick<User,'email'|'name'>|null;
  }):Promise<DmsAuditEvent>=>{
    const at=new Date().toISOString();
    const id=safe(`audit_${input.companyId}_${input.storeId}_${input.entityType}_${input.entityId}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
    const event:DmsAuditEvent={
      id,
      kind:'audit_event',
      companyId:input.companyId,
      storeId:input.storeId,
      entityType:input.entityType,
      entityId:input.entityId,
      action:input.action,
      label:input.label,
      ...(input.details?{details:input.details}:{}),
      ...(typeof input.amount==='number'?{amount:input.amount}:{}),
      ...(input.plate?{plate:input.plate}:{}),
      ...(input.vehicleId?{vehicleId:input.vehicleId}:{}),
      at,
      actorEmail:input.actor?.email||'',
      actorName:input.actor?.name||'',
    };
    await setDoc(doc(db,LEDGER,id),event,{merge:true});
    return event;
  },

  listForEntity:async(companyId:string,storeId:string,entityType:DmsAuditEvent['entityType'],entityId:string):Promise<DmsAuditEvent[]>=>{
    const snap=await getDocs(query(
      collection(db,LEDGER),
      where('companyId','==',companyId),
      where('storeId','==',storeId),
    ));
    return snap.docs
      .map(item=>item.data() as any)
      .filter(item=>item.kind==='audit_event'&&item.entityType===entityType&&item.entityId===entityId)
      .map(item=>item as DmsAuditEvent)
      .sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
  },
};
