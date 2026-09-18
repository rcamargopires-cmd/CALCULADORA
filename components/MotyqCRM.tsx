import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bot, CalendarClock, CarFront, CheckCircle2, Flame, MessageCircle, Plus, Search,
  Snowflake, Sparkles, SunMedium, UserRound, UsersRound, X
} from 'lucide-react';
import { CrmLeadSource, CrmLeadTemperature, ShowroomPassage, ShowroomPassageStatus, User } from '../types';
import { showroomFlowService } from '../services/showroomFlowService';
import { userService } from '../services/userService';
import { companyScopeService, COMPANY_SCOPE_EVENT } from '../services/companyScopeService';
import { storeScopeService, STORE_SCOPE_EVENT } from '../services/storeScopeService';

type Props={user:User};
type Column={status:ShowroomPassageStatus;label:string;hint:string};
type WhatsAppStatus={connected:boolean;missing:string[];webhookUrl:string;graphVersion:string};

const COLUMNS:Column[]=[
  {status:'waiting',label:'Novo lead',hint:'Ainda sem contato'},
  {status:'in_service',label:'Em atendimento',hint:'Contato iniciado'},
  {status:'evaluation',label:'Avaliação',hint:'Troca / avaliação'},
  {status:'proposal',label:'Proposta',hint:'Negociação ativa'},
  {status:'follow_up',label:'Follow-up',hint:'Retorno programado'},
  {status:'sale',label:'Vendido',hint:'Negócio concluído'},
  {status:'no_deal',label:'Perdido',hint:'Sem negócio'},
];

const SOURCE:Record<CrmLeadSource,string>={
  showroom:'Loja',whatsapp:'WhatsApp',web:'Web',instagram:'Instagram',manual:'Manual',other:'Outro',
};
const TEMP:Record<CrmLeadTemperature,string>={hot:'Quente',warm:'Morno',cold:'Frio'};

const phoneDigits=(value:string)=>String(value||'').replace(/\D/g,'').slice(0,15);
const phoneMask=(raw:string)=>{
  const v=phoneDigits(raw).slice(-11);
  if(v.length<=2)return v;
  if(v.length<=6)return `(${v.slice(0,2)}) ${v.slice(2)}`;
  if(v.length<=10)return `(${v.slice(0,2)}) ${v.slice(2,6)}-${v.slice(6)}`;
  return `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
};
const whatsappUrl=(phone:string)=>{
  let digits=phoneDigits(phone);
  if(digits.length===10||digits.length===11)digits=`55${digits}`;
  return digits.length>=10?`https://wa.me/${digits}`:'';
};
const ageLabel=(iso:string)=>{
  const ms=Date.now()-new Date(iso).getTime();
  if(!Number.isFinite(ms)||ms<0)return 'agora';
  const hours=Math.floor(ms/3600000);
  if(hours<1)return 'há poucos min';
  if(hours<24)return `há ${hours}h`;
  const days=Math.floor(hours/24);
  return `há ${days}d`;
};
const inputDateTime=(iso?:string)=>{
  if(!iso)return '';
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))return '';
  const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
};
const isOverdue=(iso?:string)=>{
  if(!iso)return false;
  const time=new Date(iso).getTime();
  return Number.isFinite(time)&&time<Date.now();
};
const sourceOf=(item:ShowroomPassage):CrmLeadSource=>item.leadSource||'showroom';
const temperatureOf=(item:ShowroomPassage):CrmLeadTemperature=>item.leadTemperature||'warm';

const ensureSlot=()=>{
  const id='motyq-crm-nav-slot';
  const existing=document.getElementById(id);
  if(existing)return existing;
  const nav=document.querySelector('#root nav') as HTMLElement|null;
  if(!nav)return null;
  const slot=document.createElement('span');
  slot.id=id;slot.className='contents';nav.appendChild(slot);return slot;
};

const MotyqCRM:React.FC<Props>=({user})=>{
  const[open,setOpen]=useState(false);
  const[slot,setSlot]=useState<HTMLElement|null>(null);
  const[items,setItems]=useState<ShowroomPassage[]>([]);
  const[sellers,setSellers]=useState<User[]>([]);
  const[search,setSearch]=useState('');
  const[sourceFilter,setSourceFilter]=useState<'all'|CrmLeadSource>('all');
  const[onlyMine,setOnlyMine]=useState(false);
  const[createOpen,setCreateOpen]=useState(false);
  const[busyId,setBusyId]=useState('');
  const[message,setMessage]=useState('');
  const[waStatus,setWaStatus]=useState<WhatsAppStatus|null>(null);
  const[scope,setScope]=useState(()=>({companyId:companyScopeService.get(user),storeId:storeScopeService.get(user)}));
  const canManage=user.role==='admin'||user.role==='manager';
  const isSeller=user.role==='seller'||user.role==='user';

  useEffect(()=>{
    const sync=()=>setScope({companyId:companyScopeService.get(user),storeId:storeScopeService.get(user)});
    window.addEventListener(COMPANY_SCOPE_EVENT,sync);
    window.addEventListener(STORE_SCOPE_EVENT,sync);
    return()=>{window.removeEventListener(COMPANY_SCOPE_EVENT,sync);window.removeEventListener(STORE_SCOPE_EVENT,sync);};
  },[user]);

  useEffect(()=>{
    const sync=()=>setSlot(ensureSlot());
    sync();
    const observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    if(!scope.companyId||!scope.storeId)return;
    const onError=(err:any)=>{console.error('CRM subscribe error',err);setMessage('Não foi possível carregar os leads agora.');};
    return isSeller
      ? showroomFlowService.subscribeSellerPassages(scope.companyId,scope.storeId,user.email,setItems,onError)
      : showroomFlowService.subscribeStorePassages(scope.companyId,scope.storeId,setItems,onError);
  },[scope.companyId,scope.storeId,user.email,isSeller]);

  useEffect(()=>{
    if(!open)return;
    fetch('/api/whatsapp-status').then(async response=>{
      if(!response.ok)throw new Error('status_failed');
      return response.json();
    }).then(data=>setWaStatus(data)).catch(()=>setWaStatus(null));
  },[open]);

  useEffect(()=>{
    if(!canManage)return;
    userService.getAll(scope.companyId,scope.storeId)
      .then(rows=>setSellers(rows.filter(item=>item.status==='active'&&(item.role==='seller'||item.role==='user'))))
      .catch(()=>setSellers([]));
  },[scope.companyId,scope.storeId,canManage]);

  const filtered=useMemo(()=>{
    const needle=search.trim().toLocaleLowerCase('pt-BR');
    return items.filter(item=>{
      if(sourceFilter!=='all'&&sourceOf(item)!==sourceFilter)return false;
      if(onlyMine&&String(item.assignedSellerEmail||'').toLowerCase()!==String(user.email||'').toLowerCase())return false;
      if(!needle)return true;
      return [item.customerName,item.phone,item.interestModel,item.assignedSellerName,item.notes,SOURCE[sourceOf(item)]]
        .some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(needle));
    });
  },[items,search,sourceFilter,onlyMine,user.email]);

  const metrics=useMemo(()=>{
    const active=items.filter(item=>!['sale','no_deal'].includes(item.status)).length;
    const sales=items.filter(item=>item.status==='sale').length;
    const overdue=items.filter(item=>!['sale','no_deal'].includes(item.status)&&isOverdue(item.nextFollowUpAt)).length;
    const closed=items.filter(item=>['sale','no_deal'].includes(item.status)).length;
    return{active,sales,overdue,conversion:closed?Math.round(sales/closed*100):0};
  },[items]);

  const patch=async(item:ShowroomPassage,data:Parameters<typeof showroomFlowService.updateCrmLead>[1])=>{
    setBusyId(item.id);setMessage('');
    try{await showroomFlowService.updateCrmLead(item.id,data);}
    catch(error:any){setMessage(error?.message||'Não foi possível atualizar o lead.');}
    finally{setBusyId('');}
  };

  const navButton=slot?createPortal(
    <button type="button" onClick={()=>setOpen(true)} title="MOTYQ CRM"
      className="flex items-center gap-2 whitespace-nowrap rounded-md px-4 py-1.5 text-xs font-bold text-emerald-700 transition-all hover:bg-emerald-50 hover:text-emerald-800">
      <UsersRound size={14}/> CRM
      {metrics.overdue>0&&<span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] text-white">{metrics.overdue}</span>}
    </button>,slot
  ):null;

  if(!['admin','manager','seller','user'].includes(String(user.role)))return null;

  return <>
    {navButton}
    {open&&<div className="fixed inset-0 z-[610] overflow-y-auto bg-slate-950/55 p-2 backdrop-blur-sm md:p-5" onClick={()=>setOpen(false)}>
      <div className="mx-auto min-h-[90vh] max-w-[1780px] overflow-hidden rounded-[30px] border border-slate-200 bg-[#f5f7fb] shadow-2xl" onClick={e=>e.stopPropagation()}>
        <header className="sticky top-0 z-20 flex flex-col gap-4 border-b border-slate-200 bg-white/95 p-5 backdrop-blur md:flex-row md:items-center md:justify-between md:px-7">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><UsersRound size={22}/></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-700">MOTYQ CRM · CENTRAL DE LEADS</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900">Do primeiro contato ao fechamento</h2>
              <p className="mt-1 text-sm text-slate-500">{canManage?'Visão da unidade em tempo real.':'Seus leads e próximos passos em um só lugar.'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canManage&&<button onClick={()=>setCreateOpen(true)} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16}/> Novo lead</button>}
            <button onClick={()=>setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-500"><X size={18}/></button>
          </div>
        </header>

        <div className="space-y-5 p-4 md:p-6">
          <section className="grid gap-3 md:grid-cols-4">
            <Metric label="Leads ativos" value={metrics.active} icon={<UsersRound size={17}/>} />
            <Metric label="Follow-ups atrasados" value={metrics.overdue} icon={<CalendarClock size={17}/>} alert={metrics.overdue>0}/>
            <Metric label="Vendas" value={metrics.sales} icon={<CheckCircle2 size={17}/>} />
            <Metric label="Conversão fechados" value={`${metrics.conversion}%`} icon={<Sparkles size={17}/>} />
          </section>

          <section className="grid gap-3 xl:grid-cols-[1.4fr_.7fr_.7fr]">
            <label className="flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">
              <Search size={16} className="text-slate-400"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar cliente, telefone, veículo, vendedor..." className="w-full bg-transparent text-sm text-slate-800 outline-none"/>
            </label>
            <select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value as any)} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 shadow-sm">
              <option value="all">Todas as origens</option>
              {Object.entries(SOURCE).map(([key,label])=><option key={key} value={key}>{label}</option>)}
            </select>
            {canManage?<label className="flex h-12 items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 shadow-sm">
              <span>Somente meus leads</span><input type="checkbox" checked={onlyMine} onChange={e=>setOnlyMine(e.target.checked)} />
            </label>:<div className="flex h-12 items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm text-emerald-800"><UserRound size={15}/> Carteira de {user.name.split(' ')[0]}</div>}
          </section>

          <section className={`rounded-2xl border p-4 ${waStatus?.connected?'border-emerald-200 bg-gradient-to-r from-emerald-50 to-white':'border-violet-200 bg-gradient-to-r from-violet-50 to-white'}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <div className={`grid h-10 w-10 place-items-center rounded-xl ${waStatus?.connected?'bg-emerald-100 text-emerald-700':'bg-violet-100 text-violet-700'}`}><Bot size={18}/></div>
                <div>
                  <p className={`text-xs font-black uppercase tracking-[.13em] ${waStatus?.connected?'text-emerald-700':'text-violet-700'}`}>AGENTE WHATSAPP</p>
                  <p className="mt-1 text-sm text-slate-700">{waStatus?.connected?'Webhook, CRM e agente de IA estão prontos para receber mensagens da Meta.':'A estrutura do agente está publicada. Falta concluir as credenciais para ligar o número oficial.'}</p>
                  {canManage&&waStatus?.webhookUrl&&<div className="mt-3 flex flex-wrap items-center gap-2"><code className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-600">{waStatus.webhookUrl}</code><button type="button" onClick={()=>navigator.clipboard?.writeText(waStatus.webhookUrl)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600">COPIAR WEBHOOK</button></div>}
                  {canManage&&waStatus&&!waStatus.connected&&<p className="mt-2 text-[11px] text-slate-500">Pendências: {waStatus.missing.join(', ')}</p>}
                </div>
              </div>
              <span className={`w-fit rounded-full border bg-white px-3 py-1.5 text-xs font-semibold ${waStatus?.connected?'border-emerald-200 text-emerald-700':'border-violet-200 text-violet-700'}`}>{waStatus?.connected?'CONECTADO':'CONFIGURAÇÃO PENDENTE'}</span>
            </div>
          </section>

          {message&&<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</div>}

          <section className="overflow-x-auto pb-3">
            <div className="grid min-w-[1820px] grid-cols-7 gap-3">
              {COLUMNS.map(column=>{
                const rows=filtered.filter(item=>item.status===column.status);
                return <div key={column.status} className="rounded-[24px] border border-slate-200 bg-slate-100/80 p-3">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <div><p className="text-sm font-bold text-slate-800">{column.label}</p><p className="text-[11px] text-slate-400">{column.hint}</p></div>
                    <span className="grid h-7 min-w-7 place-items-center rounded-full bg-white px-2 text-xs font-bold text-slate-600 shadow-sm">{rows.length}</span>
                  </div>
                  <div className="space-y-3">
                    {rows.map(item=><LeadCard key={item.id} item={item} busy={busyId===item.id} onPatch={data=>patch(item,data)} />)}
                    {!rows.length&&<div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-5 text-center text-xs text-slate-400">Nenhum lead</div>}
                  </div>
                </div>;
              })}
            </div>
          </section>
        </div>
      </div>

      {createOpen&&<NewLeadModal user={user} companyId={scope.companyId} storeId={scope.storeId} sellers={sellers} onClose={()=>setCreateOpen(false)} onCreated={()=>{setCreateOpen(false);setMessage('Lead criado e entregue ao vendedor.');}} />}
    </div>}
  </>;
};

const LeadCard=({item,busy,onPatch}:{item:ShowroomPassage;busy:boolean;onPatch:(patch:any)=>void})=>{
  const source=sourceOf(item),temp=temperatureOf(item),wa=whatsappUrl(item.phone),overdue=isOverdue(item.nextFollowUpAt)&&!['sale','no_deal'].includes(item.status);
  const TempIcon=temp==='hot'?Flame:temp==='cold'?Snowflake:SunMedium;
  return <article className={`rounded-2xl border bg-white p-3.5 shadow-sm ${overdue?'border-red-200 ring-1 ring-red-100':'border-slate-200'}`}>
    <div className="flex items-start justify-between gap-2">
      <div><h4 className="font-semibold text-slate-900">{item.customerName||'Cliente'}</h4><p className="mt-0.5 text-[11px] text-slate-400">{ageLabel(item.createdAt)} · {SOURCE[source]}</p></div>
      <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${temp==='hot'?'bg-red-50 text-red-700':temp==='cold'?'bg-sky-50 text-sky-700':'bg-amber-50 text-amber-700'}`}><TempIcon size={11}/>{TEMP[temp]}</span>
    </div>
    <div className="mt-3 space-y-2 text-xs text-slate-600">
      <p className="flex items-start gap-2"><CarFront size={13} className="mt-0.5 shrink-0 text-slate-400"/><span>{item.interestModel||'Interesse não informado'}</span></p>
      <p className="flex items-center gap-2"><UserRound size={13} className="text-slate-400"/><span>{item.assignedSellerName||'Sem vendedor'}</span></p>
      {item.nextFollowUpAt&&<p className={`flex items-center gap-2 ${overdue?'font-semibold text-red-700':''}`}><CalendarClock size={13}/><span>{overdue?'Atrasado · ':''}{new Date(item.nextFollowUpAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span></p>}
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      {wa?<button type="button" onClick={()=>window.open(wa,'_blank','noopener,noreferrer')} className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2 text-[11px] font-bold text-emerald-700"><MessageCircle size={13}/> WhatsApp</button>:<div/>}
      <select disabled={busy} value={item.status} onChange={e=>onPatch({status:e.target.value as ShowroomPassageStatus})} className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-[11px] font-semibold text-slate-700 outline-none">
        {COLUMNS.map(col=><option key={col.status} value={col.status}>{col.label}</option>)}
      </select>
    </div>
    {!['sale','no_deal'].includes(item.status)&&<div className="mt-2">
      <input type="datetime-local" value={inputDateTime(item.nextFollowUpAt)} onChange={e=>onPatch({nextFollowUpAt:e.target.value?new Date(e.target.value).toISOString():''})} className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-2 text-[11px] text-slate-600 outline-none"/>
    </div>}
    {item.notes&&<p className="mt-3 line-clamp-3 rounded-xl bg-slate-50 p-2 text-[11px] leading-4 text-slate-500">{item.notes}</p>}
  </article>;
};

const NewLeadModal=({user,companyId,storeId,sellers,onClose,onCreated}:{user:User;companyId:string;storeId:string;sellers:User[];onClose:()=>void;onCreated:()=>void})=>{
  const[name,setName]=useState('');const[phone,setPhone]=useState('');const[model,setModel]=useState('');const[seller,setSeller]=useState('');const[source,setSource]=useState<CrmLeadSource>('manual');const[temp,setTemp]=useState<CrmLeadTemperature>('warm');const[notes,setNotes]=useState('');const[follow,setFollow]=useState('');const[saving,setSaving]=useState(false);const[error,setError]=useState('');
  const save=async()=>{
    const selected=sellers.find(item=>item.email===seller);
    if(!name.trim()||phoneDigits(phone).length<8||!selected){setError('Preencha nome, telefone e vendedor responsável.');return;}
    setSaving(true);setError('');
    try{
      await showroomFlowService.createCrmLead({companyId,storeId,customerName:name,phone,interestModel:model,assignedSellerId:selected.id,assignedSellerEmail:selected.email,assignedSellerName:selected.name,leadSource:source,leadTemperature:temp,notes,nextFollowUpAt:follow?new Date(follow).toISOString():'',createdBy:user.email,createdByName:user.name});
      onCreated();
    }catch(e:any){setError(e?.message||'Não foi possível criar o lead.');}
    finally{setSaving(false);}
  };
  return <div className="fixed inset-0 z-[630] grid place-items-center bg-slate-950/55 p-4" onClick={onClose}>
    <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl md:p-6" onClick={e=>e.stopPropagation()}>
      <div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.15em] text-emerald-700">MOTYQ CRM</p><h3 className="mt-1 text-2xl font-semibold text-slate-900">Novo lead</h3></div><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500"><X size={17}/></button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field label="Nome do cliente" value={name} onChange={setName} placeholder="Nome e sobrenome"/>
        <Field label="Telefone" value={phoneMask(phone)} onChange={v=>setPhone(phoneDigits(v))} placeholder="(15) 99999-9999"/>
        <Field label="Veículo de interesse" value={model} onChange={setModel} placeholder="Ex.: Creta até 120 mil"/>
        <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Vendedor</span><select value={seller} onChange={e=>setSeller(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="">Selecione</option>{sellers.map(item=><option key={item.email} value={item.email}>{item.name}</option>)}</select></label>
        <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Origem</span><select value={source} onChange={e=>setSource(e.target.value as CrmLeadSource)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">{Object.entries(SOURCE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Temperatura</span><select value={temp} onChange={e=>setTemp(e.target.value as CrmLeadTemperature)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="hot">Quente</option><option value="warm">Morno</option><option value="cold">Frio</option></select></label>
        <label className="sm:col-span-2"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Próximo follow-up</span><input type="datetime-local" value={follow} onChange={e=>setFollow(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"/></label>
        <label className="sm:col-span-2"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Observações</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Entrada, parcela, troca, prazo de compra..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"/></label>
      </div>
      {error&&<p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button disabled={saving} onClick={save} className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white disabled:opacity-50">{saving?'Criando lead...':'CRIAR LEAD'}</button>
    </div>
  </div>;
};

const Field=({label,value,onChange,placeholder}:{label:string;value:string;onChange:(value:string)=>void;placeholder?:string})=><label><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">{label}</span><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-400"/></label>;
const Metric=({label,value,icon,alert=false}:{label:string;value:number|string;icon:React.ReactNode;alert?:boolean})=><div className={`rounded-2xl border bg-white p-4 shadow-sm ${alert?'border-red-200':'border-slate-200'}`}><div className={`mb-3 grid h-8 w-8 place-items-center rounded-xl ${alert?'bg-red-50 text-red-600':'bg-slate-100 text-slate-600'}`}>{icon}</div><p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">{label}</p><p className={`mt-1 text-2xl font-semibold ${alert?'text-red-700':'text-slate-900'}`}>{value}</p></div>;

export default MotyqCRM;
