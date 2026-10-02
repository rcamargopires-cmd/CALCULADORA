import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2, CalendarClock, CheckCircle2, ChevronRight, CreditCard, LockKeyhole, LogOut, Pencil, Plus, ReceiptText, RefreshCw,
  UserCog, Users, X
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import type { Company, CompanyPlan, DmsAccessProfile, DmsPermissionKey, Store as MotyqStore, User, UserRole, UserStatus } from '../types';
import { companyIdForUser, companyService } from '../services/companyService';
import { companyScopeService } from '../services/companyScopeService';
import { storeCompanyId, storeService } from '../services/storeService';
import { storeScopeService } from '../services/storeScopeService';
import { userService } from '../services/userService';
import { MODULES, PLAN_META, defaultModuleEnabled } from '../services/planEntitlementService';
import { DEMO_COMPANY_ID, demoSeedService } from '../services/demoSeedService';
import { billingSnapshot, defaultBilling, nextMonthlyDue } from '../services/billingService';
import DmsPermissionEditor from './DmsPermissionEditor';
import StoreAccessEditor from './StoreAccessEditor';
import SaasOnboardingWizard from './SaasOnboardingWizard';
import ProductionReadinessPanel from './ProductionReadinessPanel';
import { asaasBillingService } from '../services/asaasBillingService';

type Tab='companies'|'users';
const planLabel:Record<CompanyPlan,string>={starter:'Starter',pro:'Pro',enterprise:'Enterprise'};
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value);
const addDays=(days:number)=>{const d=new Date();d.setDate(d.getDate()+days);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const dateBr=(value?:string)=>value?String(value).slice(0,10).split('-').reverse().join('/'):'—';
const slugify=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,52);

const AdminControlCenter:React.FC<{currentUser:User}>=({currentUser})=>{
  const[tab,setTab]=useState<Tab>('companies');
  const[companies,setCompanies]=useState<Company[]>([]);
  const[stores,setStores]=useState<MotyqStore[]>([]);
  const[users,setUsers]=useState<User[]>([]);
  const[selectedCompanyId,setSelectedCompanyId]=useState('');
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState('');
  const[message,setMessage]=useState('');
  const[error,setError]=useState('');
  const[newCompanyOpen,setNewCompanyOpen]=useState(false);
  const[onboardingOpen,setOnboardingOpen]=useState(false);
  const[newUserOpen,setNewUserOpen]=useState(false);
  const[editingUser,setEditingUser]=useState<User|null>(null);
  const[editingModules,setEditingModules]=useState<Company|null>(null);
  const[readinessCompany,setReadinessCompany]=useState<Company|null>(null);
  const[companyName,setCompanyName]=useState('');
  const[companyPlan,setCompanyPlan]=useState<CompanyPlan>('pro');
  const[userForm,setUserForm]=useState({name:'',email:'',role:'manager' as UserRole,dmsAccessProfile:'management' as DmsAccessProfile,dmsPermissionOverrides:{} as Partial<Record<DmsPermissionKey,boolean>>,status:'active' as UserStatus,storeId:'',storeIds:[] as string[]});

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const [companyList,storeList,userList]=await Promise.all([
        companyService.getAll(),
        storeService.getAll(),
        userService.getAll(),
      ]);
      setCompanies(companyList);
      setStores(storeList);
      setUsers(userList);
      if(selectedCompanyId&&!companyList.some(company=>company.id===selectedCompanyId))setSelectedCompanyId('');
    }catch(cause:any){
      setError(cause?.message||'Não foi possível carregar a Central Master.');
    }finally{setLoading(false);}
  };

  useEffect(()=>{void load();},[]);

  const cards=useMemo(()=>companies.map(company=>({
    company,
    stores:stores.filter(store=>storeCompanyId(store)===company.id),
    users:users.filter(user=>user.role!=='admin'&&companyIdForUser(user)===company.id),
  })),[companies,stores,users]);

  const selectedCompany=companies.find(company=>company.id===selectedCompanyId)||null;
  const selectedStores=stores.filter(store=>selectedCompanyId&&storeCompanyId(store)===selectedCompanyId&&store.active);
  const selectedUsers=users.filter(user=>selectedCompanyId&&companyIdForUser(user)===selectedCompanyId&&user.role!=='admin');

  const enterCompany=async(company:Company)=>{
    setError('');
    const companyStores=stores.filter(store=>store.active&&storeCompanyId(store)===company.id);
    const storeId=companyStores[0]?.id||(company.id===DEMO_COMPANY_ID?'motyq-demo-principal':'');
    companyScopeService.set(company.id);
    if(storeId)storeScopeService.set(storeId);

    if(company.id===DEMO_COMPANY_ID){
      setMessage('Ambiente demo isolado aberto. Reiniciando somente os dados demonstrativos...');
      void demoSeedService.resetAndSeed(currentUser).catch((cause:any)=>{
        console.error('Demo seed failed after entering company',cause);
        setError(cause?.message||'A demo abriu, mas parte dos dados demonstrativos não pôde ser atualizada.');
      });
    }
  };

  const createCompany=async()=>{
    const cleanName=companyName.trim();
    if(!cleanName)return;
    const base=slugify(cleanName)||`cliente-${companies.length+1}`;
    let id=base,counter=2;
    while(companies.some(company=>company.id===id))id=`${base}-${counter++}`;
    const now=new Date();
    const trial=new Date(now);trial.setDate(trial.getDate()+14);
    const company:Company={id,slug:id,name:cleanName,plan:companyPlan,status:'trial',createdAt:now.toISOString(),trialEndsAt:trial.toISOString(),fiscal:{enabled:false,provider:'manual',environment:'homologacao',updatedAt:now.toISOString()}};
    const store:MotyqStore={id:`${id}-principal`,code:'MATRIZ',name:`${cleanName} · Principal`,active:true,companyId:id};
    setSaving('company');setError('');
    try{
      await companyService.saveAll([...companies,company]);
      await storeService.saveAll([...stores,store]);
      setCompanies(prev=>[...prev,company]);
      setStores(prev=>[...prev,store]);
      setSelectedCompanyId(company.id);
      setCompanyName('');
      setCompanyPlan('pro');
      setNewCompanyOpen(false);
      setMessage(`${cleanName} criada com unidade principal e 14 dias de avaliação.`);
    }catch(cause:any){setError(cause?.message||'Não foi possível criar a empresa.');}
    finally{setSaving('');}
  };

  const updateCompany=async(company:Company,patch:Partial<Company>)=>{
    const nextCompany={...company,...patch};
    const updated=companies.map(item=>item.id===company.id?nextCompany:item);
    setSaving(company.id);setError('');
    try{
      await companyService.saveAll(updated);
      const affected=users.filter(user=>user.role!=='admin'&&companyIdForUser(user)===company.id);
      if(affected.length){
        await Promise.all(affected.map(user=>userService.save({
          ...user,
          companyPlan:nextCompany.plan,
          companyStatus:nextCompany.status,
          companyBilling:nextCompany.billing,
          companyFiscal:nextCompany.fiscal,
          companyModuleOverrides:nextCompany.moduleOverrides,
        })));
      }
      setCompanies(updated);
      setUsers(prev=>prev.map(user=>companyIdForUser(user)===company.id&&user.role!=='admin'?{
        ...user,
        companyPlan:nextCompany.plan,
        companyStatus:nextCompany.status,
        companyBilling:nextCompany.billing,
        companyFiscal:nextCompany.fiscal,
        companyModuleOverrides:nextCompany.moduleOverrides,
      }:user));
      setMessage(`${company.name}: plano e acessos atualizados.`);
    }catch(cause:any){setError(cause?.message||'Não foi possível atualizar a empresa.');}
    finally{setSaving('');}
  };

  const updateBilling=async(company:Company,patch:Partial<NonNullable<Company['billing']>>)=>{
    const base=company.billing||defaultBilling();
    await updateCompany(company,{billing:{...base,...patch,updatedAt:new Date().toISOString()}});
  };

  const activateAsaas=async(company:Company)=>{
    const document=window.prompt('CPF/CNPJ do responsável financeiro da empresa:','')?.trim()||'';
    if(![11,14].includes(document.replace(/\D/g,'').length))return setError('Informe um CPF ou CNPJ válido para o Asaas.');
    const email=window.prompt('E-mail financeiro para cobrança:','')?.trim()||'';
    if(!email.includes('@'))return setError('Informe um e-mail financeiro válido.');
    const phone=window.prompt('Celular financeiro com DDD (opcional):','')?.trim()||'';
    const billing=company.billing||defaultBilling();
    const nextDueDate=company.status==='trial'&&company.trialEndsAt&&new Date(company.trialEndsAt).getTime()>Date.now()
      ?String(company.trialEndsAt).slice(0,10)
      :(billing.nextDueAt||nextMonthlyDue(billing.dueDay||10));
    setSaving(company.id);setError('');setMessage('');
    try{
      const result=await asaasBillingService.createSubscription({
        company,
        payer:{name:company.name,cpfCnpj:document,email,mobilePhone:phone},
        amount:PLAN_META[company.plan].price,
        nextDueDate,
        billingType:'UNDEFINED',
      });
      setMessage(`${company.name}: cobrança recorrente Asaas ativada. Assinatura ${result.subscriptionId}.`);
      await load();
    }catch(cause:any){setError(cause?.message||'Não foi possível ativar a recorrência Asaas.');}
    finally{setSaving('');}
  };

  const changePlan=async(company:Company,nextPlan:CompanyPlan)=>{
    if(nextPlan===company.plan)return;
    const billing=company.billing||defaultBilling();
    setSaving(company.id);setError('');setMessage('');
    try{
      if(billing.provider==='asaas'&&billing.externalSubscriptionId){
        await asaasBillingService.updateSubscription({
          companyId:company.id,amount:PLAN_META[nextPlan].price,plan:nextPlan,
          nextDueDate:billing.nextDueAt,updatePendingPayments:false,
        });
      }
      await updateCompany(company,{plan:nextPlan});
      setMessage(`${company.name}: plano alterado para ${planLabel[nextPlan]}${billing.provider==='asaas'&&billing.externalSubscriptionId?' e recorrência Asaas sincronizada':''}.`);
    }catch(cause:any){setError(cause?.message||'Não foi possível alterar o plano.');}
    finally{setSaving('');}
  };

  const toggleBilling=async(company:Company)=>{
    const base=company.billing||defaultBilling();
    const enabled=!base.enabled;
    if(base.provider==='asaas'&&base.externalSubscriptionId){
      setSaving(company.id);setError('');setMessage('');
      try{
        await asaasBillingService.setSubscriptionStatus({
          companyId:company.id,status:enabled?'ACTIVE':'INACTIVE',
          ...(enabled?{nextDueDate:base.nextDueAt||nextMonthlyDue(base.dueDay||10)}:{}),
        });
        await load();
        setMessage(`${company.name}: recorrência Asaas ${enabled?'reativada':'pausada'}.`);
      }catch(cause:any){setError(cause?.message||'Não foi possível alterar a recorrência Asaas.');}
      finally{setSaving('');}
      return;
    }
    await updateBilling(company,{
      enabled,
      nextDueAt:enabled?(base.nextDueAt||nextMonthlyDue(base.dueDay||10)):base.nextDueAt,
      manualBlocked:false,
    });
  };

  const markPaid=async(company:Company)=>{
    const base=company.billing||defaultBilling();
    await updateBilling(company,{
      enabled:true,
      dueDay:base.dueDay||10,
      nextDueAt:nextMonthlyDue(base.dueDay||10,new Date(),true),
      lastPaidAt:new Date().toISOString(),
      manualBlocked:false,
      manualGraceUntil:'',
    });
  };

  const extendGrace=async(company:Company,days=3)=>{
    await updateBilling(company,{enabled:true,manualBlocked:false,manualGraceUntil:addDays(days)});
  };

  const toggleManualBlock=async(company:Company)=>{
    const base=company.billing||defaultBilling();
    if(base.manualBlocked){
      await updateBilling(company,{enabled:true,manualBlocked:false,manualGraceUntil:addDays(3)});
    }else{
      await updateBilling(company,{enabled:true,manualBlocked:true});
    }
  };

  const openNewUser=()=>{
    const storeId=selectedStores[0]?.id||'';
    setEditingUser(null);
    setUserForm({name:'',email:'',role:'manager',dmsAccessProfile:'management',dmsPermissionOverrides:{},status:'active',storeId,storeIds:storeId?[storeId]:[]});
    setNewUserOpen(true);
  };

  const openEditUser=(user:User)=>{
    setEditingUser(user);
    setUserForm({
      name:user.name||'',
      email:user.email||'',
      role:user.role==='user'?'seller':user.role,
      dmsAccessProfile:user.dmsAccessProfile||'management',
      dmsPermissionOverrides:user.dmsPermissionOverrides||{},
      status:user.status,
      storeId:user.storeId||selectedStores[0]?.id||'',
      storeIds:user.storeIds?.length?user.storeIds:[user.storeId||selectedStores[0]?.id||''].filter(Boolean),
    });
    setError('');
    setMessage('');
    setNewUserOpen(true);
  };

  const saveUser=async()=>{
    if(!selectedCompany)return;
    const name=userForm.name.trim(),email=userForm.email.trim().toLowerCase();
    if(!name||!email.includes('@')||!userForm.storeId){setError('Informe nome, e-mail e unidade.');return;}
    const base=editingUser;
    const next:User={
      ...(base||{}),
      id:email,email,name,role:userForm.role,
      dmsAccessProfile:userForm.role==='manager'?userForm.dmsAccessProfile:undefined,
      dmsPermissionOverrides:userForm.role==='manager'?userForm.dmsPermissionOverrides:undefined,
      status:userForm.status,
      companyId:selectedCompany.id,storeId:userForm.storeId,storeIds:userForm.storeIds.length?userForm.storeIds:[userForm.storeId].filter(Boolean),
      companyPlan:selectedCompany.plan,companyStatus:selectedCompany.status,
      companyBilling:selectedCompany.billing,
      companyFiscal:selectedCompany.fiscal,
      companyModuleOverrides:selectedCompany.moduleOverrides,
      createdAt:base?.createdAt||new Date().toISOString(),
    };
    setSaving('user');setError('');
    try{
      await userService.saveManaged(currentUser,next);
      setUsers(prev=>[...prev.filter(user=>user.email!==email),next]);
      setNewUserOpen(false);
      setEditingUser(null);
      setMessage(base?`${name} atualizado com sucesso.`:`${name} criado em ${selectedCompany.name}.`);
    }catch(cause:any){setError(cause?.message||'Não foi possível salvar o usuário.');}
    finally{setSaving('');}
  };

  const deleteUser=async(user:User)=>{
    if(!window.confirm(`Remover ${user.name} do Motyq?`))return;
    setSaving(user.email);setError('');
    try{
      await userService.deleteManaged(currentUser,user);
      setUsers(prev=>prev.filter(item=>item.email!==user.email));
      setMessage(`${user.name} removido.`);
    }catch(cause:any){setError(cause?.message||'Não foi possível remover o usuário.');}
    finally{setSaving('');}
  };

  const roleLabel=(role:UserRole)=>role==='manager'?'Gestor':role==='seller'||role==='user'?'Vendedor':role==='reception'?'Recepção':role==='evaluator'?'Avaliador':role==='director'?'Diretoria':'Administrador';

  return <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[250px] overflow-hidden border-r border-blue-300/20 bg-[linear-gradient(180deg,#2368b8_0%,#1f5da7_55%,#2f73c5_100%)] p-5 text-white shadow-[12px_0_36px_rgba(34,93,167,.10)] lg:flex lg:flex-col">
      <img src="/motyq-brand-light.svg" alt="MOTYQ" className="h-12 w-auto object-contain object-left"/>
      <div className="mt-6 rounded-2xl border border-white/55 bg-[#eef5fc] p-4 shadow-[0_14px_30px_rgba(15,23,42,.10)]">
        <p className="text-[9px] font-black uppercase tracking-[.18em] text-[#1f6fc7]">CENTRAL MASTER</p>
        <p className="mt-1 text-sm font-bold text-slate-900">Ambiente neutro</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">Nenhum dado operacional de cliente é carregado aqui.</p>
      </div>
      <nav className="mt-6 space-y-2">
        <button onClick={()=>setTab('companies')} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold ${tab==='companies'?'bg-[#347df4] text-white shadow-[0_10px_24px_rgba(15,72,161,.24)]':'text-blue-50/90 hover:bg-white/[.10] hover:text-white'}`}><Building2 size={18}/> Empresas & Planos</button>
        <button onClick={()=>setTab('users')} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold ${tab==='users'?'bg-[#347df4] text-white shadow-[0_10px_24px_rgba(15,72,161,.24)]':'text-blue-50/90 hover:bg-white/[.10] hover:text-white'}`}><Users size={18}/> Usuários & Acessos</button>
      </nav>
      <div className="mt-auto">
        <button onClick={()=>signOut(auth)} className="flex w-full items-center gap-3 rounded-xl border border-blue-100/70 bg-[#245fa8] px-3 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(15,72,161,.18)] transition hover:bg-[#1d5598] hover:border-white"><LogOut size={17} className="text-white"/> <span className="text-white">Sair</span></button>
      </div>
    </aside>

    <main className="lg:pl-[250px]">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-blue-600">MOTYQ · ADMINISTRAÇÃO MASTER</p>
            <h1 className="mt-1 text-2xl font-semibold">{tab==='companies'?'Empresas & Planos':'Usuários & Acessos'}</h1>
            <p className="mt-1 text-sm text-slate-500">{tab==='companies'?'Crie clientes, defina planos e entre em qualquer ambiente.':'Administre as pessoas de cada empresa sem misturar carteiras.'}</p>
          </div>
          <button onClick={()=>void load()} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500" title="Atualizar"><RefreshCw size={17}/></button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl p-5 md:p-8">
        <div className="mb-5 flex gap-2 lg:hidden">
          <button onClick={()=>setTab('companies')} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab==='companies'?'bg-blue-600 text-white':'border border-slate-200 bg-white text-slate-600'}`}>Empresas</button>
          <button onClick={()=>setTab('users')} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab==='users'?'bg-blue-600 text-white':'border border-slate-200 bg-white text-slate-600'}`}>Usuários</button>
        </div>

        {message&&<div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
        {error&&<div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {tab==='companies'&&<>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-semibold text-slate-800">{companies.length} empresa(s) cadastrada(s)</p><p className="mt-1 text-xs text-slate-500">Você só entra nos dados de uma empresa quando clicar em “Entrar no ambiente”.</p></div>
            <div className="flex flex-wrap gap-2"><button onClick={()=>setOnboardingOpen(true)} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700"><UserCog size={17}/> Onboarding guiado</button>            <button onClick={()=>setNewCompanyOpen(true)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white"><Plus size={17}/> Nova empresa</button></div>
          </div>

          {loading?<div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Carregando empresas...</div>:
          <div className="grid gap-4 xl:grid-cols-2">{cards.map(({company,stores:companyStores,users:companyUsers})=><article key={company.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-semibold">{company.name}</h2><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${company.status==='active'?'bg-emerald-50 text-emerald-700':company.status==='trial'?'bg-amber-50 text-amber-700':'bg-red-50 text-red-700'}`}>{company.status==='active'?'ATIVA':company.status==='trial'?'AVALIAÇÃO':'SUSPENSA'}</span></div><p className="mt-1 text-xs text-slate-500">{planLabel[company.plan]} · {money(PLAN_META[company.plan].price)}/mês</p></div>
              <button disabled={company.status==='suspended'} onClick={()=>void enterCompany(company)} className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-30">Entrar <ChevronRight size={15}/></button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="Unidades" value={companyStores.filter(store=>store.active).length}/>
              <Stat label="Usuários" value={companyUsers.length}/>
              <Stat label="Plano" value={planLabel[company.plan]}/>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label><span className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Plano</span><select disabled={saving===company.id} value={company.plan} onChange={e=>void changePlan(company,e.target.value as CompanyPlan)} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="starter">Starter</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></label>
              <label><span className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Situação</span><select disabled={saving===company.id} value={company.status} onChange={e=>void updateCompany(company,{status:e.target.value as Company['status']})} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="trial">Avaliação</option><option value="active">Ativa</option><option value="suspended">Suspensa</option></select></label>
            </div>
            <button disabled={saving===company.id} onClick={()=>setEditingModules(company)} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 text-xs font-bold text-violet-700 disabled:opacity-50"><LockKeyhole size={14}/> CONFIGURAR MÓDULOS DO PLANO</button>
            <button onClick={()=>setReadinessCompany(company)} className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-700"><CheckCircle2 size={14}/> PRÉ-VOO DE PRODUÇÃO</button>
            {(()=>{const fiscal=company.fiscal||{enabled:false,provider:'manual' as const,environment:'homologacao' as const};return <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><div className="flex items-center gap-2"><ReceiptText size={15} className="text-indigo-600"/><p className="text-[10px] font-black uppercase tracking-[.12em] text-indigo-700">Integração fiscal</p></div><p className="mt-1 text-xs text-slate-500">NF-e integrada ao Pedido de Venda. A tributação continua parametrizada pela empresa/contador.</p></div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={fiscal.enabled} onChange={e=>void updateCompany(company,{fiscal:{...fiscal,enabled:e.target.checked,updatedAt:new Date().toISOString()}})}/> Ativa</label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label><span className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Provedor fiscal</span><select value={fiscal.provider} onChange={e=>void updateCompany(company,{fiscal:{...fiscal,provider:e.target.value as NonNullable<Company['fiscal']>['provider'],updatedAt:new Date().toISOString()}})} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs"><option value="manual">Manual</option><option value="focus_nfe">Focus NFe</option><option value="nuvem_fiscal">Nuvem Fiscal</option><option value="other">Outro</option></select></label>
                <label><span className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Ambiente</span><select value={fiscal.environment} onChange={e=>void updateCompany(company,{fiscal:{...fiscal,environment:e.target.value as 'homologacao'|'producao',updatedAt:new Date().toISOString()}})} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs"><option value="homologacao">Homologação</option><option value="producao">Produção</option></select></label>
              </div>
              {fiscal.provider==='focus_nfe'&&<p className="mt-3 rounded-xl border border-indigo-100 bg-white p-3 text-[10px] leading-5 text-slate-500">O token da Focus NFe fica somente no servidor, em <b>FOCUS_NFE_TOKEN</b> ou no mapa multiempresa <b>FOCUS_NFE_TOKENS_JSON</b>. Ele nunca é salvo no navegador.</p>}
            </div>})()}
            {(()=>{const billing=company.billing||defaultBilling();const finance=billingSnapshot(billing);return <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><div className="flex items-center gap-2"><CreditCard size={15} className="text-blue-600"/><p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-500">Cobrança mensal</p></div><p className="mt-1 text-xs text-slate-500">{billing.enabled?`Próximo vencimento ${dateBr(finance.dueDate)} · tolerância ${billing.graceDays} dia(s)`:'Controle financeiro desativado para esta empresa.'}</p></div>
                <div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${finance.state==='blocked'?'bg-red-100 text-red-700':finance.state==='overdue'?'bg-amber-100 text-amber-800':finance.state==='due_today'?'bg-sky-100 text-sky-700':billing.enabled?'bg-emerald-100 text-emerald-700':'bg-slate-200 text-slate-600'}`}>{finance.label.toUpperCase()}</span><button disabled={saving===company.id} onClick={()=>void toggleBilling(company)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-700">{billing.enabled?'DESATIVAR':'ATIVAR'}</button></div>
              </div>
              {billing.enabled&&<><div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label><span className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Próximo vencimento</span><input type="date" value={String(billing.nextDueAt||'').slice(0,10)} onChange={e=>void updateBilling(company,{nextDueAt:e.target.value,dueDay:Number(e.target.value.slice(-2))||billing.dueDay})} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs"/></label>
                <label><span className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Tolerância</span><select value={billing.graceDays} onChange={e=>void updateBilling(company,{graceDays:Number(e.target.value)})} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs"><option value={0}>Sem tolerância</option><option value={1}>1 dia</option><option value={3}>3 dias</option><option value={5}>5 dias</option><option value={7}>7 dias</option></select></label>
                <div><span className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Situação financeira</span><div className="mt-1.5 flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold">{finance.state==='overdue'?`${finance.daysLate} dia(s) em atraso`:finance.state==='blocked'?`${finance.daysLate} dia(s) em atraso`:finance.label}</div></div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label><span className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Provedor</span><select value={billing.provider||'manual'} onChange={e=>void updateBilling(company,{provider:e.target.value as NonNullable<Company['billing']>['provider']})} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs"><option value="manual">Manual</option><option value="asaas">Asaas</option><option value="stripe">Stripe</option><option value="mercadopago">Mercado Pago</option><option value="other">Outro</option></select></label>
                <label><span className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Link de cobrança / portal</span><input type="url" value={billing.paymentUrl||''} onChange={e=>void updateBilling(company,{paymentUrl:e.target.value.trim()})} placeholder="https://..." className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs"/></label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {billing.provider==='asaas'&&!billing.externalSubscriptionId&&<button disabled={saving===company.id} onClick={()=>void activateAsaas(company)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-black text-white"><CreditCard size={13}/> ATIVAR RECORRÊNCIA ASAAS</button>}
                {billing.provider==='asaas'&&billing.externalSubscriptionId&&<span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-[10px] font-black text-blue-700"><CheckCircle2 size={13}/> ASAAS ATIVO</span>}
                <button disabled={saving===company.id} onClick={()=>void markPaid(company)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-black text-white"><CheckCircle2 size={13}/> MARCAR PAGO</button>
                <button disabled={saving===company.id} onClick={()=>void extendGrace(company,3)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-800"><CalendarClock size={13}/> +3 DIAS</button>
                <button disabled={saving===company.id} onClick={()=>void toggleManualBlock(company)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-black ${billing.manualBlocked?'border-blue-200 bg-blue-50 text-blue-700':'border-red-200 bg-red-50 text-red-700'}`}><LockKeyhole size={13}/>{billing.manualBlocked?'REATIVAR +3 DIAS':'BLOQUEAR AGORA'}</button>
              </div></>}
            </div>})()}
          </article>)}</div>}
        </>}

        {tab==='users'&&<>
          <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
            <aside className="rounded-[24px] border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Escolha a empresa</p>
              <div className="mt-3 space-y-2">{companies.map(company=><button key={company.id} onClick={()=>setSelectedCompanyId(company.id)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left text-sm font-semibold ${selectedCompanyId===company.id?'border-blue-200 bg-blue-50 text-blue-700':'border-slate-200 bg-white text-slate-700'}`}><span className="truncate">{company.name}</span><ChevronRight size={15}/></button>)}</div>
            </aside>

            <section className="rounded-[24px] border border-slate-200 bg-white p-5">
              {!selectedCompany?<div className="grid min-h-[360px] place-items-center text-center"><div><UserCog size={34} className="mx-auto text-slate-300"/><p className="mt-3 font-semibold text-slate-700">Selecione uma empresa</p><p className="mt-1 text-sm text-slate-500">Os usuários só aparecem depois que você escolhe o cliente.</p></div></div>:<>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-blue-600">EQUIPE</p><h2 className="mt-1 text-xl font-semibold">{selectedCompany.name}</h2><p className="mt-1 text-xs text-slate-500">{selectedStores.length} unidade(s) · {selectedUsers.length} usuário(s)</p></div><button onClick={openNewUser} disabled={!selectedStores.length} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white disabled:opacity-40"><Plus size={15}/> Novo usuário</button></div>
                <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200"><table className="w-full min-w-[700px]"><thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-[.1em] text-slate-400"><tr><th className="p-3">Pessoa</th><th className="p-3">Perfil</th><th className="p-3">Unidade</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{selectedUsers.map(user=><tr key={user.email}><td className="p-3"><p className="text-sm font-semibold">{user.name}</p><p className="mt-1 text-xs text-slate-500">{user.email}</p></td><td className="p-3 text-xs text-slate-600">{roleLabel(user.role)}</td><td className="p-3 text-xs text-slate-600">{selectedStores.find(store=>store.id===user.storeId)?.name||'Sem unidade'}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${user.status==='active'?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{user.status==='active'?'ATIVO':'INATIVO'}</span></td><td className="p-3 text-right"><div className="flex justify-end gap-2"><button disabled={saving===user.email} onClick={()=>openEditUser(user)} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 px-3 py-2 text-[10px] font-bold text-blue-700"><Pencil size={12}/> Editar</button><button disabled={saving===user.email} onClick={()=>void deleteUser(user)} className="rounded-lg border border-red-100 px-3 py-2 text-[10px] font-bold text-red-600">Excluir</button></div></td></tr>)}{!selectedUsers.length&&<tr><td colSpan={5} className="p-10 text-center text-sm text-slate-500">Nenhum usuário nesta empresa.</td></tr>}</tbody></table></div>
              </>}
            </section>
          </div>
        </>}
      </div>
    </main>

    {newCompanyOpen&&<Modal title="Nova empresa" eyebrow="CLIENTE SaaS" onClose={()=>setNewCompanyOpen(false)}>
      <label className="block"><span className="text-xs font-semibold text-slate-500">Empresa / grupo</span><input value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="Ex.: Grupo Automax" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
      <label className="mt-4 block"><span className="text-xs font-semibold text-slate-500">Plano inicial</span><select value={companyPlan} onChange={e=>setCompanyPlan(e.target.value as CompanyPlan)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="starter">Starter</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></label>
      <button disabled={!companyName.trim()||saving==='company'} onClick={()=>void createCompany()} className="mt-5 h-11 w-full rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-40">{saving==='company'?'Criando...':'Criar empresa'}</button>
    </Modal>}

    {readinessCompany&&<ProductionReadinessPanel open={Boolean(readinessCompany)} onClose={()=>setReadinessCompany(null)} currentUser={currentUser} company={readinessCompany}/>}
    {editingModules&&<Modal title="Módulos do plano" eyebrow={editingModules.name} onClose={()=>setEditingModules(null)}>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">O plano define o padrão. Um checkbox personalizado pode liberar ou bloquear um módulo sem trocar o plano inteiro.</div>
      <div className="mt-4 space-y-2">
        {MODULES.map(module=>{
          const planDefault=defaultModuleEnabled(editingModules.plan,module.id);
          const override=editingModules.moduleOverrides?.[module.id];
          const enabled=typeof override==='boolean'?override:planDefault;
          return <label key={module.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <input type="checkbox" checked={enabled} onChange={event=>{
              const nextOverrides={...(editingModules.moduleOverrides||{}),[module.id]:event.target.checked};
              const next={...editingModules,moduleOverrides:nextOverrides};
              setEditingModules(next);
              void updateCompany(editingModules,{moduleOverrides:nextOverrides});
            }} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600"/>
            <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-800">{module.label}</span><span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{module.description}</span></span>
            <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${typeof override==='boolean'?'bg-violet-50 text-violet-700':'bg-slate-100 text-slate-500'}`}>{typeof override==='boolean'?'PERSONALIZADO':planDefault?'PLANO':'UPGRADE'}</span>
          </label>;
        })}
      </div>
      <button disabled={saving===editingModules.id} onClick={()=>{void updateCompany(editingModules,{moduleOverrides:{}});setEditingModules({...editingModules,moduleOverrides:{}});}} className="mt-4 h-10 w-full rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 disabled:opacity-50">RESTAURAR PADRÃO DO PLANO</button>
    </Modal>}
    <SaasOnboardingWizard open={onboardingOpen} onClose={()=>setOnboardingOpen(false)} currentUser={currentUser} onComplete={load}/>
    {newUserOpen&&selectedCompany&&<Modal title={editingUser?'Editar usuário':'Novo usuário'} eyebrow={selectedCompany.name} onClose={()=>{setNewUserOpen(false);setEditingUser(null);}}>
      <div className="grid gap-4">
        <Field label="Nome completo" value={userForm.name} onChange={value=>setUserForm(prev=>({...prev,name:value}))}/>
        <Field label="E-mail" value={userForm.email} type="email" disabled={Boolean(editingUser)} onChange={value=>setUserForm(prev=>({...prev,email:value}))}/>
        <div className="grid grid-cols-2 gap-3"><label><span className="text-xs font-semibold text-slate-500">Perfil</span><select value={userForm.role} onChange={e=>setUserForm(prev=>({...prev,role:e.target.value as UserRole}))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="manager">Gestor / operacional</option><option value="seller">Vendedor</option><option value="reception">Recepção</option><option value="evaluator">Avaliador</option><option value="director">Diretoria</option></select></label><label><span className="text-xs font-semibold text-slate-500">Status</span><select value={userForm.status} onChange={e=>setUserForm(prev=>({...prev,status:e.target.value as UserStatus}))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label></div>
        {userForm.role==='manager'&&<DmsPermissionEditor profile={userForm.dmsAccessProfile} overrides={userForm.dmsPermissionOverrides} onProfileChange={value=>setUserForm(prev=>({...prev,dmsAccessProfile:value}))} onOverridesChange={value=>setUserForm(prev=>({...prev,dmsPermissionOverrides:value}))}/>} 
        <StoreAccessEditor stores={selectedStores} primaryStoreId={userForm.storeId} storeIds={userForm.storeIds} onChange={(primary,ids)=>setUserForm(prev=>({...prev,storeId:primary,storeIds:ids}))}/>
      </div>
      <button disabled={saving==='user'} onClick={()=>void saveUser()} className="mt-5 h-11 w-full rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-40">{saving==='user'?'Salvando...':editingUser?'Salvar alterações':'Criar usuário'}</button>
    </Modal>}
  </div>;
};

const Stat=({label,value}:{label:string;value:string|number})=><div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div>;
const Field=({label,value,onChange,type='text',disabled=false}:{label:string;value:string;onChange:(value:string)=>void;type?:string;disabled?:boolean})=><label className="block"><span className="text-xs font-semibold text-slate-500">{label}</span><input type={type} value={value} disabled={disabled} onChange={e=>onChange(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm disabled:bg-slate-50 disabled:text-slate-500"/></label>;
const Modal=({title,eyebrow,onClose,children}:{title:string;eyebrow:string;onClose:()=>void;children:React.ReactNode})=><div className="fixed inset-0 z-[900] overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-4" onClick={onClose}><div className="mx-auto my-2 w-full max-w-2xl rounded-[26px] bg-white p-5 shadow-2xl sm:my-6 sm:p-6" onClick={e=>e.stopPropagation()}><div className="sticky top-0 z-10 -mx-1 flex items-start justify-between bg-white/95 px-1 pb-3 backdrop-blur"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-blue-600">{eyebrow}</p><h3 className="mt-1 text-2xl font-semibold">{title}</h3></div><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-500"><X size={17}/></button></div><div className="mt-2">{children}</div></div></div>;

export default AdminControlCenter;
