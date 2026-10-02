import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { FinanceAccount, FinanceClosing, FinanceClosingPeriod, FinanceEntry, FinanceReconciliation, User } from '../types';
import { financeService } from './financeService';
import { financeAccountService } from './financeAccountService';
import { dmsAuditService } from './dmsAuditService';

const LEDGER='operational_meta';
const safe=(value:string)=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const now=()=>new Date().toISOString();

const entryDate=(entry:FinanceEntry)=>String(entry.settledAt||entry.dueDate||entry.competenceDate||entry.createdAt||'').slice(0,10);
const settled=(entry:FinanceEntry)=>entry.status==='paid'||entry.status==='received';

const balanceAt=(account:FinanceAccount,entries:FinanceEntry[],endDate:string)=>{
  let balance=Number(account.openingBalance)||0;
  for(const entry of entries){
    if(!settled(entry)||entry.financeAccountId!==account.accountId)continue;
    const date=entryDate(entry);
    if(!date||date>endDate)continue;
    balance+=entry.entryType==='receivable'?Number(entry.amount)||0:-(Number(entry.amount)||0);
  }
  return balance;
};

export const financeReconciliationService={
  preview:async(companyId:string,storeId:string,financeAccountId:string,startDate:string,endDate:string)=>{
    const [accounts,entries]=await Promise.all([
      financeAccountService.list(companyId,storeId),
      financeService.getAll(companyId,storeId),
    ]);
    const account=accounts.find(item=>item.accountId===financeAccountId);
    if(!account)throw new Error('Conta financeira não encontrada.');
    const candidates=entries.filter(entry=>{
      const date=entryDate(entry);
      return settled(entry)&&entry.financeAccountId===financeAccountId&&date>=startDate&&date<=endDate;
    });
    return{
      account,
      candidates,
      systemBalance:balanceAt(account,entries,endDate),
    };
  },

  reconcile:async(input:{
    companyId:string;storeId:string;financeAccountId:string;startDate:string;endDate:string;
    statementBalance:number;actor:Pick<User,'email'|'name'>;
  }):Promise<FinanceReconciliation>=>{
    const preview=await financeReconciliationService.preview(input.companyId,input.storeId,input.financeAccountId,input.startDate,input.endDate);
    const statementBalance=Number(input.statementBalance)||0;
    const difference=statementBalance-preview.systemBalance;
    const stamp=now();
    const id=safe(`reconciliation_${input.companyId}_${input.storeId}_${input.financeAccountId}_${input.endDate}_${Date.now()}`);
    const reconciliation:FinanceReconciliation={
      id,kind:'finance_reconciliation',companyId:input.companyId,storeId:input.storeId,
      financeAccountId:input.financeAccountId,startDate:input.startDate,endDate:input.endDate,
      systemBalance:preview.systemBalance,statementBalance,difference,
      status:Math.abs(difference)<0.01?'balanced':'difference',
      financeEntryIds:preview.candidates.map(item=>item.id),
      createdAt:stamp,createdBy:input.actor.email,createdByName:input.actor.name,
    };
    await setDoc(doc(db,LEDGER,id),reconciliation,{merge:false});
    for(const entry of preview.candidates){
      await setDoc(doc(db,LEDGER,entry.id),{reconciliationId:id,reconciledAt:stamp,updatedAt:stamp},{merge:true});
    }
    await dmsAuditService.record({
      companyId:input.companyId,storeId:input.storeId,entityType:'finance',entityId:id,
      action:'finance_reconciled',label:'Conciliação financeira registrada',
      details:`${preview.account.name} · ${input.startDate} a ${input.endDate} · diferença ${difference.toFixed(2)}`,
      amount:statementBalance,actor:input.actor,
    }).catch(()=>undefined);
    return reconciliation;
  },

  closePeriod:async(input:{
    companyId:string;storeId:string;financeAccountId:string;periodType:FinanceClosingPeriod;
    referenceDate:string;declaredBalance:number;notes?:string;actor:Pick<User,'email'|'name'>;
  }):Promise<FinanceClosing>=>{
    const [accounts,entries]=await Promise.all([
      financeAccountService.list(input.companyId,input.storeId),
      financeService.getAll(input.companyId,input.storeId),
    ]);
    const account=accounts.find(item=>item.accountId===input.financeAccountId);
    if(!account)throw new Error('Conta financeira não encontrada.');
    const endDate=input.periodType==='monthly'
      ? new Date(Number(input.referenceDate.slice(0,4)),Number(input.referenceDate.slice(5,7)),0,12).toISOString().slice(0,10)
      : input.referenceDate.slice(0,10);
    const systemBalance=balanceAt(account,entries,endDate);
    const declaredBalance=Number(input.declaredBalance)||0;
    const difference=declaredBalance-systemBalance;
    const stamp=now();
    const id=safe(`closing_${input.companyId}_${input.storeId}_${input.financeAccountId}_${input.periodType}_${input.referenceDate}`);
    const closing:FinanceClosing={
      id,kind:'finance_closing',companyId:input.companyId,storeId:input.storeId,
      financeAccountId:input.financeAccountId,periodType:input.periodType,referenceDate:input.referenceDate,
      systemBalance,declaredBalance,difference,notes:String(input.notes||'').trim(),
      closedAt:stamp,closedBy:input.actor.email,closedByName:input.actor.name,
    };
    await setDoc(doc(db,LEDGER,id),closing,{merge:true});
    await dmsAuditService.record({
      companyId:input.companyId,storeId:input.storeId,entityType:'finance',entityId:id,
      action:'finance_period_closed',label:input.periodType==='daily'?'Fechamento diário registrado':'Fechamento mensal registrado',
      details:`${account.name} · diferença ${difference.toFixed(2)}`,amount:declaredBalance,actor:input.actor,
    }).catch(()=>undefined);
    return closing;
  },

  listReconciliations:async(companyId:string,storeId:string):Promise<FinanceReconciliation[]>=>{
    const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
    return snap.docs.map(item=>item.data() as any)
      .filter(item=>item.kind==='finance_reconciliation')
      .map(item=>item as FinanceReconciliation)
      .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  },

  listClosings:async(companyId:string,storeId:string):Promise<FinanceClosing[]>=>{
    const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
    return snap.docs.map(item=>item.data() as any)
      .filter(item=>item.kind==='finance_closing')
      .map(item=>item as FinanceClosing)
      .sort((a,b)=>String(b.closedAt||'').localeCompare(String(a.closedAt||'')));
  },
};
