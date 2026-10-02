import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { CustomerConsentStatus, CustomerMaster, User } from '../types';
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
  return snap.docs.map(item=>item.data() as any).filter(item=>item.kind==='customer_master'&&item.active!==false&&!item.mergedIntoCustomerId).map(item=>item as CustomerMaster);
};

export const dmsCustomerService={
  list,

  getById:async(companyId:string,storeId:string,customerId:string):Promise<CustomerMaster|null>=>{
    const items=await list(companyId,storeId);
    return items.find(item=>item.customerId===customerId)||null;
  },

  ensure:async(input:{
    companyId:string;
    storeId:string;
    name:string;
    phone?:string;
    email?:string;
    document?:string;
    address?:string;
    city?:string;
    state?:string;
    zipCode?:string;
    actor?:Pick<User,'email'|'name'>|null;
  }):Promise<CustomerMaster>=>{
    const phone=cleanPhone(input.phone);
    const email=cleanEmail(input.email);
    const masters=await list(input.companyId,input.storeId);
    const document=String(input.document||'').replace(/\D/g,'').slice(0,14);
    const existing=masters.find(item=>
      (document&&String(item.document||'')===document) ||
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
      document:document||existing?.document||'',
      address:String(input.address||existing?.address||'').trim(),
      city:String(input.city||existing?.city||'').trim(),
      state:String(input.state||existing?.state||'').trim().toUpperCase().slice(0,2),
      zipCode:String(input.zipCode||existing?.zipCode||'').replace(/\D/g,'').slice(0,8),
      active:true,
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

  deduplicate:async(companyId:string,storeId:string,actor?:Pick<User,'email'|'name'>|null)=>{
    const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
    const all=snap.docs.map(item=>item.data() as any).filter(item=>item.kind==='customer_master'&&item.active!==false&&!item.mergedIntoCustomerId).map(item=>item as CustomerMaster);
    const keyFor=(item:CustomerMaster)=>{
      const document=String(item.document||'').replace(/\D/g,'');
      const phone=cleanPhone(item.phone);
      const email=cleanEmail(item.email);
      if(document.length>=11)return 'doc:'+document;
      if(phone.length>=8)return 'phone:'+phone;
      if(email)return 'email:'+email;
      return '';
    };
    const groups=new Map<string,CustomerMaster[]>();
    all.forEach(item=>{const key=keyFor(item);if(!key)return;const list=groups.get(key)||[];list.push(item);groups.set(key,list);});
    let merged=0;
    const passageSnap=await getDocs(query(collection(db,'showroom_passages'),where('companyId','==',companyId),where('storeId','==',storeId)));
    for(const group of groups.values()){
      if(group.length<2)continue;
      const ordered=[...group].sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
      const canonical=ordered[0];
      for(const duplicate of ordered.slice(1)){
        for(const passage of passageSnap.docs){
          const data=passage.data() as any;
          if(data.customerId===duplicate.customerId){
            await setDoc(doc(db,'showroom_passages',passage.id),{customerId:canonical.customerId,updatedAt:now()},{merge:true});
          }
        }
        await setDoc(doc(db,LEDGER,duplicate.id),{active:false,mergedIntoCustomerId:canonical.customerId,updatedAt:now()},{merge:true});
        await dmsAuditService.record({
          companyId,storeId,entityType:'customer',entityId:duplicate.customerId,
          action:'customer_master_merged',label:'Cliente duplicado unificado',
          details:duplicate.name+' → '+canonical.name,actor,
        }).catch(()=>undefined);
        merged+=1;
      }
    }
    return merged;
  },

  setConsent:async(input:{
    customer:CustomerMaster;
    status:CustomerConsentStatus;
    source:string;
    purposes:string[];
    actor:Pick<User,'email'|'name'>;
  }):Promise<CustomerMaster>=>{
    const stamp=now();
    const next:CustomerMaster={
      ...input.customer,
      consentStatus:input.status,
      consentAt:input.status==='granted'?(input.customer.consentAt||stamp):input.customer.consentAt,
      consentSource:String(input.source||'Motyq').trim(),
      consentPurposes:Array.from(new Set(input.purposes.map(value=>String(value||'').trim()).filter(Boolean))),
      consentUpdatedBy:input.actor.email,
      consentUpdatedByName:input.actor.name,
      consentUpdatedAt:stamp,
      updatedAt:stamp,
    };
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'customer',entityId:next.customerId,
      action:input.status==='granted'?'customer_consent_granted':'customer_consent_revoked',
      label:input.status==='granted'?'Autorização de contato registrada':'Autorização de contato revogada',
      details:[next.consentSource,...(next.consentPurposes||[])].filter(Boolean).join(' · '),actor:input.actor,
    }).catch(()=>undefined);
    return next;
  },

  save:async(customer:CustomerMaster,actor?:Pick<User,'email'|'name'>|null):Promise<CustomerMaster>=>{
    const next:CustomerMaster={
      ...customer,
      name:String(customer.name||'').trim(),
      phone:cleanPhone(customer.phone),
      email:cleanEmail(customer.email),
      document:String(customer.document||'').replace(/\D/g,'').slice(0,14),
      address:String(customer.address||'').trim(),
      city:String(customer.city||'').trim(),
      state:String(customer.state||'').trim().toUpperCase().slice(0,2),
      zipCode:String(customer.zipCode||'').replace(/\D/g,'').slice(0,8),
      updatedAt:now(),
    };
    if(!next.name)throw new Error('Informe o nome do cliente.');
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'customer',entityId:next.customerId,
      action:'customer_master_updated',label:'Cadastro mestre de cliente atualizado',
      details:[next.name,next.phone,next.email].filter(Boolean).join(' · '),actor,
    }).catch(()=>undefined);
    return next;
  },
};
