import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2, ChevronRight, LogOut, Plus, RefreshCw,
  UserCog, Users, X
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import type { Company, CompanyPlan, Store as MotyqStore, User, UserRole, UserStatus } from '../types';
import { companyIdForUser, companyService } from '../services/companyService';
import { companyScopeService } from '../services/companyScopeService';
import { storeCompanyId, storeService } from '../services/storeService';
import { storeScopeService } from '../services/storeScopeService';
import { userService } from '../services/userService';
import { PLAN_META } from '../services/planEntitlementService';
import { DEMO_COMPANY_ID, demoSeedService } from '../services/demoSeedService';

type Tab='companies'|'users';
const planLabel:Record<CompanyPlan,string>={starter:'Starter',pro:'Pro',enterprise:'Enterprise'};
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value);
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
  const[newUserOpen,setNewUserOpen]=useState(false);
  const[companyName,setCompanyName]=useState('');
  const[companyPlan,setCompanyPlan]=useState<CompanyPlan>('pro');
  const[userForm,setUserForm]=useState({name:'',email:'',role:'manager' as UserRole,status:'active' as UserStatus,storeId:''});

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
      setMessage('Ambiente demo aberto. Atualizando dados demonstrativos em segundo plano...');
      void demoSeedService.seed(currentUser).catch((cause:any)=>{
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
    const company:Company={id,slug:id,name:cleanName,plan:companyPlan,status:'trial',createdAt:now.toISOString(),trialEndsAt:trial.toISOString()};
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
          companyModuleOverrides:nextCompany.moduleOverrides,
        })));
      }
      setCompanies(updated);
      setUsers(prev=>prev.map(user=>companyIdForUser(user)===company.id&&user.role!=='admin'?{
        ...user,
        companyPlan:nextCompany.plan,
        companyStatus:nextCompany.status,
        companyModuleOverrides:nextCompany.moduleOverrides,
      }:user));
      setMessage(`${company.name}: plano e acessos atualizados.`);
    }catch(cause:any){setError(cause?.message||'Não foi possível atualizar a empresa.');}
    finally{setSaving('');}
  };

  const openNewUser=()=>{
    const storeId=selectedStores[0]?.id||'';
    setUserForm({name:'',email:'',role:'manager',status:'active',storeId});
    setNewUserOpen(true);
  };

  const createUser=async()=>{
    if(!selectedCompany)return;
    const name=userForm.name.trim(),email=userForm.email.trim().toLowerCase();
    if(!name||!email.includes('@')||!userForm.storeId){setError('Informe nome, e-mail e unidade.');return;}
    const next:User={
      id:email,email,name,role:userForm.role,status:userForm.status,
      companyId:selectedCompany.id,storeId:userForm.storeId,
      companyPlan:selectedCompany.plan,companyStatus:selectedCompany.status,
      companyModuleOverrides:selectedCompany.moduleOverrides,
      createdAt:new Date().toISOString(),
    };
    setSaving('user');setError('');
    try{
      await userService.saveManaged(currentUser,next);
      setUsers(prev=>[...prev.filter(user=>user.email!==email),next]);
      setNewUserOpen(false);
      setMessage(`${name} criado em ${selectedCompany.name}.`);
    }catch(cause:any){setError(cause?.message||'Não foi possível criar o usuário.');}
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
            <button onClick={()=>setNewCompanyOpen(true)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white"><Plus size={17}/> Nova empresa</button>
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
              <label><span className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Plano</span><select disabled={saving===company.id} value={company.plan} onChange={e=>void updateCompany(company,{plan:e.target.value as CompanyPlan})} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="starter">Starter</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></label>
              <label><span className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Situação</span><select disabled={saving===company.id} value={company.status} onChange={e=>void updateCompany(company,{status:e.target.value as Company['status']})} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="trial">Avaliação</option><option value="active">Ativa</option><option value="suspended">Suspensa</option></select></label>
            </div>
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
                <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200"><table className="w-full min-w-[700px]"><thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-[.1em] text-slate-400"><tr><th className="p-3">Pessoa</th><th className="p-3">Perfil</th><th className="p-3">Unidade</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{selectedUsers.map(user=><tr key={user.email}><td className="p-3"><p className="text-sm font-semibold">{user.name}</p><p className="mt-1 text-xs text-slate-500">{user.email}</p></td><td className="p-3 text-xs text-slate-600">{roleLabel(user.role)}</td><td className="p-3 text-xs text-slate-600">{selectedStores.find(store=>store.id===user.storeId)?.name||'Sem unidade'}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${user.status==='active'?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{user.status==='active'?'ATIVO':'INATIVO'}</span></td><td className="p-3 text-right"><button disabled={saving===user.email} onClick={()=>void deleteUser(user)} className="rounded-lg border border-red-100 px-3 py-2 text-[10px] font-bold text-red-600">Excluir</button></td></tr>)}{!selectedUsers.length&&<tr><td colSpan={5} className="p-10 text-center text-sm text-slate-500">Nenhum usuário nesta empresa.</td></tr>}</tbody></table></div>
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

    {newUserOpen&&selectedCompany&&<Modal title="Novo usuário" eyebrow={selectedCompany.name} onClose={()=>setNewUserOpen(false)}>
      <div className="grid gap-4">
        <Field label="Nome completo" value={userForm.name} onChange={value=>setUserForm(prev=>({...prev,name:value}))}/>
        <Field label="E-mail" value={userForm.email} type="email" onChange={value=>setUserForm(prev=>({...prev,email:value}))}/>
        <div className="grid grid-cols-2 gap-3"><label><span className="text-xs font-semibold text-slate-500">Perfil</span><select value={userForm.role} onChange={e=>setUserForm(prev=>({...prev,role:e.target.value as UserRole}))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="manager">Gestor</option><option value="seller">Vendedor</option><option value="reception">Recepção</option><option value="evaluator">Avaliador</option><option value="director">Diretoria</option></select></label><label><span className="text-xs font-semibold text-slate-500">Status</span><select value={userForm.status} onChange={e=>setUserForm(prev=>({...prev,status:e.target.value as UserStatus}))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label></div>
        <label><span className="text-xs font-semibold text-slate-500">Unidade</span><select value={userForm.storeId} onChange={e=>setUserForm(prev=>({...prev,storeId:e.target.value}))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Selecione...</option>{selectedStores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      </div>
      <button disabled={saving==='user'} onClick={()=>void createUser()} className="mt-5 h-11 w-full rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-40">{saving==='user'?'Criando...':'Criar usuário'}</button>
    </Modal>}
  </div>;
};

const Stat=({label,value}:{label:string;value:string|number})=><div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div>;
const Field=({label,value,onChange,type='text'}:{label:string;value:string;onChange:(value:string)=>void;type?:string})=><label className="block"><span className="text-xs font-semibold text-slate-500">{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>;
const Modal=({title,eyebrow,onClose,children}:{title:string;eyebrow:string;onClose:()=>void;children:React.ReactNode})=><div className="fixed inset-0 z-[900] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}><div className="w-full max-w-lg rounded-[26px] bg-white p-6 shadow-2xl" onClick={e=>e.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-blue-600">{eyebrow}</p><h3 className="mt-1 text-2xl font-semibold">{title}</h3></div><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500"><X size={17}/></button></div><div className="mt-5">{children}</div></div></div>;

export default AdminControlCenter;
