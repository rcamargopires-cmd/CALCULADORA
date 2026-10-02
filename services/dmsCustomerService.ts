import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { CustomerMaster, User } from '../types';
import { dmsAuditService } from './dmsAuditService';

const LEDGER='operational_meta';
const safe=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const cleanPhone=(value:unknown)=>String(value??'').replace(/\D/g,'').slice(0,15);
const cleanEmail=(value:unknown)=>String(value??'').trim().toLowerCase();
const now=()=>new Date().toISOString();
const newId=(companyId:string)=>safe(`cus_${companyId}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`);
const docId=(customerId:string)=>safe(`customer_master_${customerId}`);

const list=async(companyId:string,storeId:string):Promise<CustomerMaster[]>=>{
  const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
  return snap.docs.map(item=>item.data() as any).filter(item=>item.kind==='customer_master').map(item=>item as CustomerMaster);
};

export const dmsCustomerService={
  list,

  ensure:async(input:{
    companyId:string;
    storeId:string;
    name:string;
    phone?:string;
    email?:string;
    document?:string;
    actor?:Pick<User,'email'|'name'>|null;
  }):Promise<CustomerMaster>=>{
    const phone=cleanPhone(input.phone);
    const email=cleanEmail(input.email);
    const masters=await list(input.companyId,input.storeId);
    const existing=masters.find(item=>
      (phone&&cleanPhone(item.phone)===phone) ||
      (email&&cleanEmail(item.email)===email)
    );
    const stamp=now();
    const customerId=existing?.customerId||newId(input.companyId);
    const next:CustomerMaster={
      id:docId(customerId),
      kind:'customer_master',
      customerId,
      companyId:input.companyId,
      storeId:input.storeId,
      name:String(input.name||existing?.name||'Cliente').trim(),
      phone:phone||existing?.phone||'',
      email:email||existing?.email||'',
      document:String(input.document||existing?.document||'').replace(/\D/g,'').slice(0,14),
      createdAt:existing?.createdAt||stamp,
      updatedAt:stamp,
    };
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    if(!existing){
      await dmsAuditService.record({
        companyId:input.companyId,storeId:input.storeId,entityType:'customer',entityId:customerId,
        action:'customer_master_created',label:'Cliente incluído no cadastro mestre do DMS',
        details:[next.name,next.phone,next.email].filter(Boolean).join(' · '),actor:input.actor,
      }).catch(()=>undefined);
    }
    return next;
  },
};
