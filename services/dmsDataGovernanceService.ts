import { collection, doc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { CustomerMaster, DmsDataRetentionPolicy, User } from '../types';
import { dmsAuditService } from './dmsAuditService';

const LEDGER='operational_meta';
const policyId=(companyId:string,storeId:string)=>`data_retention_policy_${companyId}_${storeId}`.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,180);
const now=()=>new Date().toISOString();

export const DEFAULT_DATA_RETENTION_POLICY={
  crmInactivityMonths:36,
  auditRetentionYears:5,
  financialRetentionYears:10,
  allowCustomerAnonymization:true,
} as const;

export const dmsDataGovernanceService={
  getPolicy:async(companyId:string,storeId:string):Promise<DmsDataRetentionPolicy>=>{
    const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
    const found=snap.docs.map(item=>item.data() as any).find(item=>item.kind==='data_retention_policy') as DmsDataRetentionPolicy|undefined;
    return found||{
      id:policyId(companyId,storeId),kind:'data_retention_policy',companyId,storeId,
      ...DEFAULT_DATA_RETENTION_POLICY,updatedAt:now(),
    };
  },

  savePolicy:async(policy:DmsDataRetentionPolicy,actor:Pick<User,'email'|'name'>):Promise<DmsDataRetentionPolicy>=>{
    const next:DmsDataRetentionPolicy={
      ...policy,
      crmInactivityMonths:Math.max(1,Math.round(Number(policy.crmInactivityMonths)||36)),
      auditRetentionYears:Math.max(1,Math.round(Number(policy.auditRetentionYears)||5)),
      financialRetentionYears:Math.max(1,Math.round(Number(policy.financialRetentionYears)||10)),
      updatedAt:now(),updatedBy:actor.email,updatedByName:actor.name,
    };
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'system',entityId:next.id,
      action:'retention_policy_updated',label:'Política LGPD de retenção atualizada',
      details:`CRM ${next.crmInactivityMonths} meses · auditoria ${next.auditRetentionYears} anos · financeiro ${next.financialRetentionYears} anos`,
      actor,
    }).catch(()=>undefined);
    return next;
  },

  anonymizeCustomer:async(customer:CustomerMaster,actor:Pick<User,'email'|'name'>,reason:string):Promise<CustomerMaster>=>{
    const policy=await dmsDataGovernanceService.getPolicy(customer.companyId,customer.storeId);
    if(!policy.allowCustomerAnonymization)throw new Error('A política desta unidade não permite anonimização manual.');
    if(customer.anonymizedAt)return customer;
    const stamp=now();
    const batch=writeBatch(db);
    const next:CustomerMaster={
      ...customer,
      name:'Cliente anonimizado',
      phone:'',
      email:'',
      document:'',
      address:'',
      city:'',
      state:'',
      zipCode:'',
      active:false,
      consentStatus:'revoked',
      consentUpdatedAt:stamp,
      consentUpdatedBy:actor.email,
      consentUpdatedByName:actor.name,
      anonymizedAt:stamp,
      anonymizedBy:actor.email,
      anonymizedByName:actor.name,
      updatedAt:stamp,
    };
    batch.set(doc(db,LEDGER,customer.id),next,{merge:true});

    const passages=await getDocs(query(
      collection(db,'showroom_passages'),
      where('companyId','==',customer.companyId),
      where('storeId','==',customer.storeId),
    ));
    for(const item of passages.docs){
      const data:any=item.data();
      if(data.customerId!==customer.customerId)continue;
      batch.set(item.ref,{
        customerName:'Cliente anonimizado',phone:'',customerEmail:'',
        notes:'',updatedAt:stamp,
      },{merge:true});
    }
    await batch.commit();

    await dmsAuditService.record({
      companyId:customer.companyId,storeId:customer.storeId,entityType:'customer',entityId:customer.customerId,
      action:'customer_anonymized',label:'Dados pessoais do cliente anonimizados',
      details:`${String(reason||'Solicitação LGPD').slice(0,500)} · registros financeiros/fiscais transacionais permanecem preservados pela política de retenção.`,
      actor,
    }).catch(()=>undefined);
    return next;
  },
};
