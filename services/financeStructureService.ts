import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { FinanceChartAccount, FinanceCostCenter, FinanceNature, User } from '../types';
import { dmsAuditService } from './dmsAuditService';

const LEDGER='operational_meta';
const safe=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const now=()=>new Date().toISOString();

const load=async(companyId:string,storeId:string)=>{
  const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
  const rows=snap.docs.map(item=>item.data() as any);
  return{
    chartAccounts:rows.filter(item=>item.kind==='finance_chart_account').map(item=>item as FinanceChartAccount).sort((a,b)=>a.code.localeCompare(b.code)),
    costCenters:rows.filter(item=>item.kind==='finance_cost_center').map(item=>item as FinanceCostCenter).sort((a,b)=>a.code.localeCompare(b.code)),
  };
};

export const financeStructureService={
  load,

  createChartAccount:async(input:{companyId:string;storeId:string;code:string;name:string;nature:FinanceNature;actor:Pick<User,'email'|'name'>})=>{
    const code=String(input.code||'').trim();
    const name=String(input.name||'').trim();
    if(!code||!name)throw new Error('Informe código e nome da conta.');
    const current=await load(input.companyId,input.storeId);
    if(current.chartAccounts.some(item=>item.code.toLowerCase()===code.toLowerCase()))throw new Error('Já existe uma conta com este código.');
    const stamp=now();
    const chartAccountId=safe('coa_'+input.companyId+'_'+input.storeId+'_'+code);
    const item:FinanceChartAccount={id:'finance_chart_'+chartAccountId,kind:'finance_chart_account',chartAccountId,code,name,nature:input.nature,active:true,companyId:input.companyId,storeId:input.storeId,createdAt:stamp,updatedAt:stamp};
    await setDoc(doc(db,LEDGER,item.id),item,{merge:false});
    await dmsAuditService.record({companyId:input.companyId,storeId:input.storeId,entityType:'finance',entityId:item.id,action:'chart_account_created',label:'Conta contábil criada',details:code+' · '+name,actor:input.actor}).catch(()=>undefined);
    return item;
  },

  createCostCenter:async(input:{companyId:string;storeId:string;code:string;name:string;actor:Pick<User,'email'|'name'>})=>{
    const code=String(input.code||'').trim();
    const name=String(input.name||'').trim();
    if(!code||!name)throw new Error('Informe código e nome do centro de custo.');
    const current=await load(input.companyId,input.storeId);
    if(current.costCenters.some(item=>item.code.toLowerCase()===code.toLowerCase()))throw new Error('Já existe um centro com este código.');
    const stamp=now();
    const costCenterId=safe('cc_'+input.companyId+'_'+input.storeId+'_'+code);
    const item:FinanceCostCenter={id:'finance_cost_'+costCenterId,kind:'finance_cost_center',costCenterId,code,name,active:true,companyId:input.companyId,storeId:input.storeId,createdAt:stamp,updatedAt:stamp};
    await setDoc(doc(db,LEDGER,item.id),item,{merge:false});
    await dmsAuditService.record({companyId:input.companyId,storeId:input.storeId,entityType:'finance',entityId:item.id,action:'cost_center_created',label:'Centro de custo criado',details:code+' · '+name,actor:input.actor}).catch(()=>undefined);
    return item;
  },

  setChartAccountActive:async(item:FinanceChartAccount,active:boolean)=>{
    const next={...item,active,updatedAt:now()};await setDoc(doc(db,LEDGER,item.id),next,{merge:true});return next;
  },
  setCostCenterActive:async(item:FinanceCostCenter,active:boolean)=>{
    const next={...item,active,updatedAt:now()};await setDoc(doc(db,LEDGER,item.id),next,{merge:true});return next;
  },
};
