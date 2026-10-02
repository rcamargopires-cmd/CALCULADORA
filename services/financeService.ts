import { collection, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { FinanceEntry, FinanceEntryStatus, FinanceEntryType, FinanceOrigin, User } from '../types';
import { dmsAuditService } from './dmsAuditService';

const LEDGER='operational_meta';
const safe=(value:string)=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const cleanPlate=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const now=()=>new Date().toISOString();

const normalize=(entry:FinanceEntry):FinanceEntry=>({
  ...entry,
  id:safe(entry.id),
  kind:'finance_entry',
  plate:entry.plate?cleanPlate(entry.plate):undefined,
  amount:Math.max(0,Number(entry.amount)||0),
  dueDate:entry.dueDate?String(entry.dueDate).slice(0,10):undefined,
  competenceDate:entry.competenceDate?String(entry.competenceDate).slice(0,10):undefined,
});

const fromSnapshot=(docs:any[])=>docs
  .map(item=>item.data() as any)
  .filter(item=>item.kind==='finance_entry')
  .map(item=>item as FinanceEntry)
  .sort((a,b)=>String(b.dueDate||b.createdAt||'').localeCompare(String(a.dueDate||a.createdAt||'')));

const addMonths=(iso:string,months:number)=>{
  const base=iso?new Date(`${iso}T12:00:00`):new Date();
  const day=base.getDate();
  base.setDate(1);
  base.setMonth(base.getMonth()+months);
  const last=new Date(base.getFullYear(),base.getMonth()+1,0).getDate();
  base.setDate(Math.min(day,last));
  return `${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}-${String(base.getDate()).padStart(2,'0')}`;
};

export const financeService={
  create:async(input:{
    entryType:FinanceEntryType;
    category:string;
    description:string;
    party:string;
    amount:number;
    dueDate?:string;
    competenceDate?:string;
    plate?:string;
    vehicle?:string;
    vehicleId?:string;
    chartAccountId?:string;
    costCenterId?:string;
    origin?:FinanceOrigin;
    originId?:string;
    companyId:string;
    storeId:string;
    actor:Pick<User,'email'|'name'>;
  })=>{
    const stamp=now();
    const id=safe(`finance_${input.companyId}_${input.storeId}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`);
    const entry=normalize({
      id,
      kind:'finance_entry',
      entryType:input.entryType,
      status:'pending',
      category:input.category||'Outros',
      description:input.description||'Lançamento financeiro',
      party:input.party||'Não informado',
      amount:input.amount,
      dueDate:input.dueDate,
      competenceDate:input.competenceDate||stamp.slice(0,10),
      plate:input.plate,
      vehicle:input.vehicle,
      vehicleId:input.vehicleId,
      chartAccountId:input.chartAccountId,
      costCenterId:input.costCenterId,
      origin:input.origin||'manual',
      originId:input.originId,
      companyId:input.companyId,
      storeId:input.storeId,
      createdAt:stamp,
      updatedAt:stamp,
      createdBy:input.actor.email,
      createdByName:input.actor.name,
    });
    await setDoc(doc(db,LEDGER,id),entry,{merge:true});
    await dmsAuditService.record({
      companyId:input.companyId,
      storeId:input.storeId,
      entityType:'finance',
      entityId:id,
      vehicleId:input.vehicleId,
      plate:input.plate,
      action:input.entryType==='payable'?'finance_payable_created':'finance_receivable_created',
      label:input.entryType==='payable'?'Conta a pagar criada':'Conta a receber criada',
      details:`${input.category} · ${input.description} · ${input.party}`,
      amount:Number(entry.amount)||0,
      actor:input.actor,
    }).catch(()=>undefined);
    return entry;
  },

  createInstallments:async(input:{
    entryType:FinanceEntryType;
    category:string;
    description:string;
    party:string;
    totalAmount:number;
    installmentCount:number;
    firstDueDate?:string;
    competenceDate?:string;
    plate?:string;
    vehicle?:string;
    vehicleId?:string;
    chartAccountId?:string;
    costCenterId?:string;
    origin?:FinanceOrigin;
    originId?:string;
    companyId:string;
    storeId:string;
    actor:Pick<User,'email'|'name'>;
  }):Promise<FinanceEntry[]>=>{
    const count=Math.max(1,Math.min(120,Math.trunc(Number(input.installmentCount)||1)));
    const total=Math.max(0,Number(input.totalAmount)||0);
    if(total<=0)throw new Error('Informe um valor total maior que zero.');
    const groupId=safe(`installments_${input.companyId}_${input.storeId}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
    const cents=Math.round(total*100);
    const baseCents=Math.floor(cents/count);
    let remaining=cents-baseCents*count;
    const first=input.firstDueDate||new Date().toISOString().slice(0,10);
    const created:FinanceEntry[]=[];
    for(let index=0;index<count;index++){
      const partCents=baseCents+(remaining>0?1:0);
      if(remaining>0)remaining-=1;
      const entry=await financeService.create({
        entryType:input.entryType,
        category:input.category,
        description:`${input.description} · ${index+1}/${count}`,
        party:input.party,
        amount:partCents/100,
        dueDate:addMonths(first,index),
        competenceDate:input.competenceDate,
        plate:input.plate,
        vehicle:input.vehicle,
        vehicleId:input.vehicleId,
        chartAccountId:input.chartAccountId,
        costCenterId:input.costCenterId,
        origin:input.origin,
        originId:input.originId,
        companyId:input.companyId,
        storeId:input.storeId,
        actor:input.actor,
      });
      const linked=await financeService.update(entry,{
        installmentGroupId:groupId,
        installmentNumber:index+1,
        installmentCount:count,
      });
      created.push(linked);
    }
    return created;
  },

  update:async(entry:FinanceEntry,patch:Partial<FinanceEntry>)=>{
    const next=normalize({...entry,...patch,updatedAt:now()});
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    return next;
  },

  settle:async(
    entry:FinanceEntry,
    actor:Pick<User,'email'|'name'>,
    paymentMethod='',
    paymentReference='',
    financeAccountId='',
  )=>{
    const stamp=now();
    const status:FinanceEntryStatus=entry.entryType==='payable'?'paid':'received';
    const patch:Partial<FinanceEntry>={
      status,
      settledAt:stamp,
      paymentMethod,
      paymentReference,
      financeAccountId:financeAccountId||entry.financeAccountId||'',
      updatedAt:stamp,
    };
    await setDoc(doc(db,LEDGER,entry.id),patch,{merge:true});
    await dmsAuditService.record({
      companyId:entry.companyId,
      storeId:entry.storeId,
      entityType:'finance',
      entityId:entry.id,
      vehicleId:entry.vehicleId,
      plate:entry.plate,
      action:entry.entryType==='payable'?'finance_paid':'finance_received',
      label:entry.entryType==='payable'?'Pagamento baixado':'Recebimento baixado',
      details:[entry.description,entry.party,paymentMethod,paymentReference,financeAccountId].filter(Boolean).join(' · '),
      amount:Number(entry.amount)||0,
      actor,
    }).catch(()=>undefined);
    return {...entry,...patch};
  },

  cancel:async(entry:FinanceEntry)=>{
    const patch:Partial<FinanceEntry>={status:'cancelled',updatedAt:now()};
    await setDoc(doc(db,LEDGER,entry.id),patch,{merge:true});
    return {...entry,...patch};
  },

  getAll:async(companyId:string,storeId:string):Promise<FinanceEntry[]>=>{
    const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
    return fromSnapshot(snap.docs);
  },

  subscribe:(companyId:string,storeId:string,onItems:(items:FinanceEntry[])=>void,onError?:(error:unknown)=>void)=>onSnapshot(
    query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)),
    snap=>onItems(fromSnapshot(snap.docs)),
    error=>onError?.(error),
  ),
};
