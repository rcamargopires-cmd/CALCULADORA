import { collection, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { FinanceAccount, FinanceAccountType, User } from '../types';
import { dmsAuditService } from './dmsAuditService';

const LEDGER='operational_meta';
const safe=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const now=()=>new Date().toISOString();

const fromDocs=(docs:any[])=>docs
  .map(item=>item.data() as any)
  .filter(item=>item.kind==='finance_account')
  .map(item=>item as FinanceAccount)
  .sort((a,b)=>Number(b.active)-Number(a.active)||a.name.localeCompare(b.name,'pt-BR'));

export const financeAccountService={
  list:async(companyId:string,storeId:string):Promise<FinanceAccount[]>=>{
    const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
    return fromDocs(snap.docs);
  },

  subscribe:(companyId:string,storeId:string,onItems:(items:FinanceAccount[])=>void,onError?:(error:unknown)=>void)=>onSnapshot(
    query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)),
    snap=>onItems(fromDocs(snap.docs)),
    error=>onError?.(error),
  ),

  create:async(input:{
    companyId:string;storeId:string;accountType:FinanceAccountType;name:string;
    bankName?:string;agency?:string;accountNumber?:string;pixKey?:string;openingBalance?:number;
    actor:Pick<User,'email'|'name'>;
  }):Promise<FinanceAccount>=>{
    const stamp=now();
    const accountId=safe(`finacct_${input.companyId}_${input.storeId}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
    const account:FinanceAccount={
      id:accountId,kind:'finance_account',accountId,
      accountType:input.accountType,name:String(input.name||'').trim(),
      bankName:String(input.bankName||'').trim(),agency:String(input.agency||'').trim(),
      accountNumber:String(input.accountNumber||'').trim(),pixKey:String(input.pixKey||'').trim(),
      openingBalance:Number(input.openingBalance)||0,active:true,
      companyId:input.companyId,storeId:input.storeId,createdAt:stamp,updatedAt:stamp,
    };
    if(!account.name)throw new Error('Informe o nome da conta.');
    await setDoc(doc(db,LEDGER,account.id),account,{merge:false});
    await dmsAuditService.record({
      companyId:input.companyId,storeId:input.storeId,entityType:'finance',entityId:account.id,
      action:'finance_account_created',label:account.accountType==='bank'?'Conta bancária criada':'Caixa criado',
      details:account.name,actor:input.actor,
    }).catch(()=>undefined);
    return account;
  },

  deactivate:async(account:FinanceAccount,actor:Pick<User,'email'|'name'>)=>{
    if(!account.active)return account;
    const next:FinanceAccount={...account,active:false,updatedAt:now()};
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'finance',entityId:next.id,
      action:'finance_account_deactivated',label:'Conta financeira inativada',details:next.name,actor,
    }).catch(()=>undefined);
    return next;
  },

  save:async(account:FinanceAccount,actor?:Pick<User,'email'|'name'>|null)=>{
    const next:FinanceAccount={...account,name:String(account.name||'').trim(),openingBalance:Number(account.openingBalance)||0,updatedAt:now()};
    if(!next.name)throw new Error('Informe o nome da conta.');
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'finance',entityId:next.id,
      action:'finance_account_updated',label:'Conta financeira atualizada',details:next.name,actor,
    }).catch(()=>undefined);
    return next;
  },
};
