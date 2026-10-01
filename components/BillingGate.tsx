import React,{useEffect,useMemo,useState} from 'react';
import {AlertTriangle,Clock3,LockKeyhole,LogOut,Mail,ShieldCheck} from 'lucide-react';
import {signOut} from 'firebase/auth';
import {auth} from '../firebase';
import type {User} from '../types';
import {PLAN_META} from '../services/planEntitlementService';
import {billingSnapshot} from '../services/billingService';

const brl=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value);
const dateBr=(value:string)=>value?value.split('-').reverse().join('/'):'';
const dayKey=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};

const BillingGate:React.FC<{user:User;children:React.ReactNode}>=({user,children})=>{
  const[today,setToday]=useState(dayKey());
  useEffect(()=>{
    const timer=window.setInterval(()=>setToday(dayKey()),60_000);
    return()=>window.clearInterval(timer);
  },[]);
  const snapshot=useMemo(()=>billingSnapshot(user.companyBilling,today),[user.companyBilling,today]);
  const price=PLAN_META[user.companyPlan||'starter']?.price||0;

  if(user.role==='admin'||snapshot.state==='disabled'||snapshot.state==='current')return <>{children}</>;

  if(snapshot.state==='blocked'){
    const subject=encodeURIComponent('Regularização de assinatura MOTYQ');
    const body=encodeURIComponent('Olá, preciso regularizar a assinatura do MOTYQ da minha empresa.');
    return <div className="min-h-screen bg-[#07111f] p-5 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-40px)] max-w-3xl items-center justify-center">
        <section className="w-full rounded-[32px] border border-red-400/20 bg-white/[.055] p-7 shadow-2xl backdrop-blur md:p-10">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-500/15 text-red-300"><LockKeyhole size={28}/></div>
          <p className="mt-6 text-[11px] font-black uppercase tracking-[.17em] text-red-300">ASSINATURA TEMPORARIAMENTE SUSPENSA</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Pagamento pendente</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">O acesso operacional foi pausado porque o vencimento de <strong className="text-white">{dateBr(snapshot.dueDate)}</strong> ultrapassou o período de tolerância. Nenhum dado foi apagado. Estoque, CRM, usuários e histórico permanecem preservados.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Info label="Plano" value={String(user.companyPlan||'starter').toUpperCase()}/>
            <Info label="Mensalidade" value={brl(price)}/>
            <Info label="Dias em atraso" value={String(snapshot.daysLate)}/>
          </div>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a href={`mailto:motyq@motyq.com.br?subject=${subject}&body=${body}`} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-slate-900"><Mail size={17}/> Regularizar pagamento</a>
            <button onClick={()=>void signOut(auth)} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 px-5 text-sm font-bold text-white"><LogOut size={17}/> Sair</button>
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs text-slate-400"><ShieldCheck size={15}/> Após a confirmação do pagamento, o acesso pode ser liberado imediatamente pela administração MOTYQ.</div>
        </section>
      </div>
    </div>;
  }

  return <>
    <div className={`fixed left-1/2 top-3 z-[9999] w-[min(94vw,760px)] -translate-x-1/2 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur ${snapshot.state==='overdue'?'border-amber-300 bg-amber-50/95 text-amber-950':'border-sky-300 bg-sky-50/95 text-sky-950'}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{snapshot.state==='overdue'?<AlertTriangle size={19}/>:<Clock3 size={19}/>}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">{snapshot.state==='due_today'?'Sua mensalidade MOTYQ vence hoje':'Pagamento pendente'}</p>
          <p className="mt-0.5 text-xs leading-5">{snapshot.state==='due_today'
            ?`Vencimento em ${dateBr(snapshot.dueDate)}. O sistema continua funcionando normalmente.`
            :`Vencimento em ${dateBr(snapshot.dueDate)} · ${snapshot.daysLate} dia(s) em atraso. Acesso será suspenso em ${snapshot.daysUntilBlock} dia(s) se o pagamento não for regularizado.`}</p>
        </div>
        <a href="mailto:motyq@motyq.com.br?subject=Pagamento%20MOTYQ" className="shrink-0 rounded-lg border border-current/20 px-3 py-2 text-[10px] font-black uppercase">Regularizar</a>
      </div>
    </div>
    {children}
  </>;
};

const Info=({label,value}:{label:string;value:string})=><div className="rounded-2xl border border-white/10 bg-white/[.05] p-4"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold text-white">{value}</p></div>;

export default BillingGate;
