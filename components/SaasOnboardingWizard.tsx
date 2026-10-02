import React,{useState} from 'react';
import { CheckCircle2, Rocket, X } from 'lucide-react';
import type { Company, CompanyPlan, Store, User } from '../types';
import { companyService } from '../services/companyService';
import { storeService } from '../services/storeService';
import { userService } from '../services/userService';
import { defaultBilling, nextMonthlyDue } from '../services/billingService';

type Props={open:boolean;onClose:()=>void;currentUser:User;onComplete:()=>Promise<void>|void};
const safe=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
const code=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]/g,'').toUpperCase().slice(0,8)||'MATRIZ';

const SaasOnboardingWizard:React.FC<Props>=({open,onClose,currentUser,onComplete})=>{
  const[step,setStep]=useState(1);
  const[companyName,setCompanyName]=useState('');
  const[plan,setPlan]=useState<CompanyPlan>('pro');
  const[storeName,setStoreName]=useState('');
  const[storeCode,setStoreCode]=useState('MATRIZ');
  const[managerName,setManagerName]=useState('');
  const[managerEmail,setManagerEmail]=useState('');
  const[billingEnabled,setBillingEnabled]=useState(true);
  const[dueDay,setDueDay]=useState(10);
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  const[created,setCreated]=useState<{company:Company;store:Store;manager:User}|null>(null);

  if(!open)return null;

  const finish=async()=>{
    const name=companyName.trim(),unit=storeName.trim(),manager=managerName.trim(),email=managerEmail.trim().toLowerCase();
    if(!name||!unit||!manager||!email.includes('@'))return setError('Preencha empresa, unidade, gestor e e-mail.');
    setBusy(true);setError('');
    try{
      const [companies,stores]=await Promise.all([companyService.getAll(),storeService.getAll()]);
      let companyId=safe(name)||`empresa-${Date.now()}`;
      if(companies.some(item=>item.id===companyId))companyId=`${companyId}-${Date.now().toString().slice(-5)}`;
      let storeId=`${companyId}-${safe(unit)||'principal'}`;
      if(stores.some(item=>item.id===storeId))storeId=`${storeId}-${Date.now().toString().slice(-4)}`;
      const trial=new Date();trial.setDate(trial.getDate()+14);
      const billing=defaultBilling(dueDay);
      const company:Company={
        id:companyId,slug:companyId,name,plan,status:'trial',createdAt:new Date().toISOString(),trialEndsAt:trial.toISOString(),
        billing:{
          ...billing,enabled:billingEnabled,dueDay,
          nextDueAt:billingEnabled?nextMonthlyDue(dueDay):'',
          updatedAt:new Date().toISOString(),
        },
      };
      const store:Store={id:storeId,code:code(storeCode),name:unit,active:true,companyId};
      const managerUser:User={
        id:email,email,name:manager,role:'manager',status:'active',
        companyId,storeId,storeIds:[storeId],dmsAccessProfile:'management',
        companyPlan:plan,companyStatus:'trial',companyBilling:company.billing,companyFiscal:company.fiscal,
        createdAt:new Date().toISOString(),
      };
      await companyService.saveAll([...companies.filter(item=>item.id!==company.id),company]);
      await storeService.saveAll([...stores.filter(item=>item.id!==store.id),store]);
      await userService.saveManaged(currentUser,managerUser);
      setCreated({company,store,manager:managerUser});
      setStep(4);
      await onComplete();
    }catch(cause:any){setError(cause?.message||'Não foi possível concluir o onboarding.');}
    finally{setBusy(false);}
  };

  return <div className="fixed inset-0 z-[940] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5" onClick={onClose}>
    <div className="mx-auto my-4 w-full max-w-2xl rounded-[30px] bg-white p-5 text-slate-900 shadow-2xl sm:p-7" onClick={event=>event.stopPropagation()}>
      <header className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.15em] text-blue-600">MOTYQ · ONBOARDING</p><h2 className="mt-1 text-2xl font-semibold">Nova operação em poucos passos.</h2><p className="mt-2 text-sm text-slate-500">Empresa, unidade principal, gestor e cobrança inicial são criados juntos.</p></div><button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200"><X size={17}/></button></header>
      <div className="mt-5 flex gap-2">{[1,2,3,4].map(item=><div key={item} className={`h-2 flex-1 rounded-full ${item<=step?'bg-blue-600':'bg-slate-100'}`}/>)}</div>
      {error&&<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {step===1&&<section className="mt-6 space-y-4"><h3 className="font-semibold">1. Empresa e plano</h3><Field label="Empresa / grupo" value={companyName} onChange={setCompanyName} placeholder="Ex.: Grupo Automax"/><label className="block text-xs font-semibold text-slate-500">Plano<select value={plan} onChange={e=>setPlan(e.target.value as CompanyPlan)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="starter">Starter</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></label><button disabled={!companyName.trim()} onClick={()=>setStep(2)} className="h-11 w-full rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-40">CONTINUAR</button></section>}

      {step===2&&<section className="mt-6 space-y-4"><h3 className="font-semibold">2. Unidade principal</h3><Field label="Nome da unidade" value={storeName} onChange={setStoreName} placeholder="Ex.: Loja Centro"/><Field label="Código" value={storeCode} onChange={value=>setStoreCode(code(value))} placeholder="MATRIZ"/><div className="flex gap-2"><button onClick={()=>setStep(1)} className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-bold text-slate-600">VOLTAR</button><button disabled={!storeName.trim()} onClick={()=>setStep(3)} className="h-11 flex-1 rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-40">CONTINUAR</button></div></section>}

      {step===3&&<section className="mt-6 space-y-4"><h3 className="font-semibold">3. Gestor e cobrança</h3><div className="grid gap-3 sm:grid-cols-2"><Field label="Nome do gestor" value={managerName} onChange={setManagerName}/><Field label="E-mail do gestor" type="email" value={managerEmail} onChange={setManagerEmail}/></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={billingEnabled} onChange={e=>setBillingEnabled(e.target.checked)}/> Ativar controle mensal de cobrança</label>{billingEnabled&&<label className="mt-3 block text-xs font-semibold text-slate-500">Dia do vencimento<input type="number" min={1} max={28} value={dueDay} onChange={e=>setDueDay(Math.min(28,Math.max(1,Number(e.target.value)||10)))} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"/></label>}</div><div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900">O gestor será cadastrado no Motyq. No primeiro acesso, ele usa o próprio e-mail e a opção <b>Criar minha senha</b> na tela de login.</div><div className="flex gap-2"><button onClick={()=>setStep(2)} className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-bold text-slate-600">VOLTAR</button><button disabled={busy||!managerName.trim()||!managerEmail.includes('@')} onClick={()=>void finish()} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-40"><Rocket size={16}/>{busy?'CRIANDO...':'CRIAR OPERAÇÃO'}</button></div></section>}

      {step===4&&created&&<section className="mt-7 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={28}/></div><h3 className="mt-4 text-2xl font-semibold">Operação criada.</h3><p className="mt-2 text-sm text-slate-500">{created.company.name} · {created.store.name}</p><div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-sm"><p><b>Gestor:</b> {created.manager.name}</p><p className="mt-1"><b>Acesso:</b> {created.manager.email}</p><p className="mt-1"><b>Plano:</b> {created.company.plan.toUpperCase()}</p><p className="mt-1"><b>Status:</b> avaliação por 14 dias</p></div><button onClick={onClose} className="mt-5 h-11 w-full rounded-xl bg-slate-900 text-sm font-bold text-white">CONCLUIR</button></section>}
    </div>
  </div>;
};

const Field=({label,value,onChange,type='text',placeholder=''}:{label:string;value:string;onChange:(value:string)=>void;type?:string;placeholder?:string})=><label className="block text-xs font-semibold text-slate-500">{label}<input type={type} value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"/></label>;

export default SaasOnboardingWizard;
