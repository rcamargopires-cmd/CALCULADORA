import type { Company, CompanyBilling, User } from '../types';

export type BillingState='disabled'|'current'|'due_today'|'overdue'|'blocked';
export type BillingSnapshot={
  state:BillingState;
  dueDate:string;
  graceUntil:string;
  daysLate:number;
  daysUntilBlock:number;
  label:string;
};

const dateOnly=(value?:string)=>{
  if(!value)return'';
  const match=String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match?match[0]:'';
};
const todayLocal=()=>{
  const d=new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
};
const asDate=(value:string)=>new Date(value+'T12:00:00');
const addDays=(value:string,days:number)=>{
  const d=asDate(value);d.setDate(d.getDate()+days);
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
};
const diffDays=(from:string,to:string)=>Math.round((asDate(to).getTime()-asDate(from).getTime())/86400000);

export const defaultBilling=(dueDay=10):CompanyBilling=>({
  enabled:false,
  dueDay:Math.min(28,Math.max(1,dueDay)),
  nextDueAt:'',
  graceDays:3,
});

export const nextMonthlyDue=(dueDay:number,from=new Date(),forceNextMonth=false)=>{
  const day=Math.min(28,Math.max(1,Number(dueDay)||10));
  const next=new Date(from.getFullYear(),from.getMonth()+(forceNextMonth?1:0),day,12);
  if(!forceNextMonth&&next.getTime()<=from.getTime())next.setMonth(next.getMonth()+1);
  return [next.getFullYear(),String(next.getMonth()+1).padStart(2,'0'),String(next.getDate()).padStart(2,'0')].join('-');
};

export const billingSnapshot=(billing?:CompanyBilling|null,now=todayLocal()):BillingSnapshot=>{
  if(!billing?.enabled)return{state:'disabled',dueDate:'',graceUntil:'',daysLate:0,daysUntilBlock:0,label:'Cobrança desativada'};
  const dueDate=dateOnly(billing.nextDueAt)||nextMonthlyDue(billing.dueDay);
  const automaticGrace=addDays(dueDate,Math.max(0,Number(billing.graceDays)||0));
  const manual=dateOnly(billing.manualGraceUntil);
  const graceUntil=manual&&manual>automaticGrace?manual:automaticGrace;
  if(billing.manualBlocked)return{state:'blocked',dueDate,graceUntil,daysLate:Math.max(0,diffDays(dueDate,now)),daysUntilBlock:0,label:'Bloqueado manualmente'};
  if(now<dueDate)return{state:'current',dueDate,graceUntil,daysLate:0,daysUntilBlock:diffDays(now,graceUntil)+1,label:'Em dia'};
  if(now===dueDate)return{state:'due_today',dueDate,graceUntil,daysLate:0,daysUntilBlock:diffDays(now,graceUntil)+1,label:'Vence hoje'};
  if(now<=graceUntil)return{state:'overdue',dueDate,graceUntil,daysLate:Math.max(1,diffDays(dueDate,now)),daysUntilBlock:Math.max(1,diffDays(now,graceUntil)+1),label:'Pagamento pendente'};
  return{state:'blocked',dueDate,graceUntil,daysLate:Math.max(1,diffDays(dueDate,now)),daysUntilBlock:0,label:'Bloqueado por inadimplência'};
};

export const billingForUser=(user?:User|null):CompanyBilling|undefined=>user?.companyBilling;

export const companyBillingSnapshot=(company?:Company|null)=>billingSnapshot(company?.billing);

export const billingService={defaultBilling,nextMonthlyDue,billingSnapshot,billingForUser,companyBillingSnapshot};
