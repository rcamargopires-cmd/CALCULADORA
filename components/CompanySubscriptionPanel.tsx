import React,{useMemo,useState} from 'react';
import { CreditCard, ExternalLink, X } from 'lucide-react';
import type { Company, User } from '../types';
import { billingSnapshot } from '../services/billingService';
import { MODULES, PLAN_META, moduleEnabled } from '../services/planEntitlementService';

const dateBr=(value?:string)=>value?String(value).slice(0,10).split('-').reverse().join('/'):'—';
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value);

const CompanySubscriptionPanel:React.FC<{currentUser:User;company:Company}>=({currentUser,company})=>{
  const[open,setOpen]=useState(false);
  const billing=company.billing;
  const snapshot=billingSnapshot(billing);
  const enabled=useMemo(()=>MODULES.filter(item=>moduleEnabled(company,item.id)),[company]);
  const locked=useMemo(()=>MODULES.filter(item=>!moduleEnabled(company,item.id)),[company]);
  const meta=PLAN_META[company.plan];
  const canOpenPayment=Boolean(billing?.paymentUrl&&/^https?:\/\//i.test(billing.paymentUrl));

  return <>
    <button title="Assinatura Motyq" onClick={()=>setOpen(true)} className="hidden" type="button">Assinatura Motyq</button>
    {open&&<div className="fixed inset-0 z-[298] overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm" onClick={()=>setOpen(false)}>
      <div className="mx-auto my-8 max-w-3xl overflow-hidden rounded-[30px] bg-white text-slate-900 shadow-2xl" onClick={e=>e.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-6"><div><p className="text-[10px] font-black uppercase tracking-[.15em] text-blue-600">MOTYQ · MINHA ASSINATURA</p><h2 className="mt-1 text-2xl font-semibold">{company.name}</h2><p className="mt-1 text-sm text-slate-500">Plano {meta.label} · {money(meta.price)}/mês</p></div><button onClick={()=>setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200"><X size={17}/></button></header>
        <div className="p-6">
          <section className="grid gap-3 sm:grid-cols-3"><Card label="Situação" value={company.status==='trial'?'Avaliação':company.status==='active'?'Ativa':'Suspensa'}/><Card label="Cobrança" value={billing?.enabled?snapshot.label:'Desativada'}/><Card label="Próximo vencimento" value={billing?.enabled?dateBr(snapshot.dueDate):'—'}/></section>
          {company.status==='trial'&&<div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Período de avaliação até <b>{dateBr(company.trialEndsAt)}</b>.</div>}
          {billing?.enabled&&snapshot.state!=='ok'&&<div className={`mt-4 rounded-2xl border p-4 text-sm ${snapshot.state==='blocked'?'border-red-200 bg-red-50 text-red-800':'border-amber-200 bg-amber-50 text-amber-800'}`}><b>{snapshot.label}.</b> {snapshot.daysLate>0?`${snapshot.daysLate} dia(s) em atraso.`:''}</div>}
          {canOpenPayment&&<a href={billing!.paymentUrl} target="_blank" rel="noreferrer" className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white"><CreditCard size={16}/> ABRIR COBRANÇA / PAGAMENTO <ExternalLink size={14}/></a>}
          {!canOpenPayment&&billing?.enabled&&<div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">A cobrança está sendo controlada no Motyq, mas esta empresa ainda não possui link de pagamento externo configurado pelo administrador.</div>}
          <section className="mt-6"><h3 className="text-sm font-semibold">Módulos do plano</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{enabled.map(item=><div key={item.id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-800">{item.label}</p><p className="mt-1 text-[10px] text-emerald-700/70">{item.description}</p></div>)}{locked.map(item=><div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 opacity-70"><p className="text-xs font-semibold text-slate-600">{item.label}</p><p className="mt-1 text-[10px] text-slate-500">Não incluído nesta assinatura.</p></div>)}</div></section>
          <p className="mt-5 text-[10px] text-slate-400">Usuário: {currentUser.email}</p>
        </div>
      </div>
    </div>}
  </>;
};
const Card=({label,value}:{label:string;value:string})=><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>;
export default CompanySubscriptionPanel;
