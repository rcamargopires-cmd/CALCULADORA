import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bot, CalendarClock, CarFront, CheckCircle2, Flame, GripVertical, MessageCircle, Plus, Search,
  Snowflake, Sparkles, SunMedium, UserRound, UsersRound, X
} from 'lucide-react';
import { CrmLeadSource, CrmLeadTemperature, ShowroomPassage, ShowroomPassageStatus, User } from '../types';
import { showroomFlowService } from '../services/showroomFlowService';
import { userService } from '../services/userService';
import { companyScopeService, COMPANY_SCOPE_EVENT } from '../services/companyScopeService';
import { storeScopeService, STORE_SCOPE_EVENT } from '../services/storeScopeService';
import { auth } from '../firebase';
import { GroupStockItem, groupStockService } from '../services/groupStockService';
import { CrmStockMatch, matchGroupStock } from '../services/crmStockMatchService';
import CustomerAttendanceDossier from './CustomerAttendanceDossier';
import CrmOpportunityCenter, { QuickContact } from './CrmOpportunityCenter';
import CrmMyPortfolio from './CrmMyPortfolio';

type Props={user:User};
type Column={status:ShowroomPassageStatus;label:string;hint:string};
type WhatsAppStatus={connected:boolean;platformReady:boolean;missing:string[];webhookUrl:string;graphVersion:string;embeddedSignup?:{appId:string;configId:string;featureType:string;sessionInfoVersion:string};connection?:{displayPhoneNumber:string;phoneNumberId:string;wabaId:string;connectedAt:string;sellerName:string}|null};

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
  const[groupStock,setGroupStock]=useState<GroupStockItem[]>([]);
  const[search,setSearch]=useState('');
  const[sourceFilter,setSourceFilter]=useState<'all'|CrmLeadSource>('all');
  const[onlyMine,setOnlyMine]=useState(false);
  const[createOpen,setCreateOpen]=useState(false);
  const[selectedCustomer,setSelectedCustomer]=useState<ShowroomPassage|null>(null);
  const[quickContact,setQuickContact]=useState<ShowroomPassage|null>(null);
  const[showAdvanced,setShowAdvanced]=useState(false);
  const[busyId,setBusyId]=useState('');
  const[draggedLeadId,setDraggedLeadId]=useState('');
  const[dragOverStatus,setDragOverStatus]=useState<ShowroomPassageStatus|null>(null);
  const[message,setMessage]=useState('');
  const[waStatus,setWaStatus]=useState<WhatsAppStatus|null>(null);
  const[waBusy,setWaBusy]=useState(false);
  const[waMessage,setWaMessage]=useState('');
  const[scope,setScope]=useState(()=>({companyId:companyScopeService.get(user),storeId:storeScopeService.get(user)}));
  const[dashboardRequest,setDashboardRequest]=useState<{nonce:number;action?:'lead'|'contact';leadId?:string;tab?:'agenda'|'stock'}|null>(null);
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
    if(!scope.companyId){setGroupStock([]);return;}
    return groupStockService.subscribe(
      scope.companyId,
      snapshot=>setGroupStock(snapshot?.items||[]),
      error=>{console.warn('CRM shared stock unavailable',error);setGroupStock([]);},
    );
  },[scope.companyId]);

  useEffect(()=>{
    const receive=(event:Event)=>{
      const detail=(event as CustomEvent<{action?:'lead'|'contact';leadId?:string;tab?:'agenda'|'stock'}>).detail||{};
      setDashboardRequest({nonce:Date.now(),...detail});
      if(isSeller&&detail.action==='contact'&&detail.leadId){const lead=items.find(item=>item.id===detail.leadId);if(lead)setQuickContact(lead);}
      setOpen(true);
    };
    window.addEventListener('motyq:open-crm',receive);
    return()=>window.removeEventListener('motyq:open-crm',receive);
  },[items,isSeller]);

  useEffect(()=>{
    if(!isSeller||dashboardRequest?.action!=='contact'||!dashboardRequest.leadId)return;
    const customer=items.find(item=>item.id===dashboardRequest.leadId);
    if(!customer)return;
    setQuickContact(customer);
    setDashboardRequest(current=>current?.nonce===dashboardRequest.nonce?{...current,action:undefined}:current);
  },[items,dashboardRequest,isSeller]);

  useEffect(()=>{
    if(dashboardRequest?.action!=='lead'||!dashboardRequest.leadId)return;
    const customer=items.find(item=>item.id===dashboardRequest.leadId);
    if(!customer)return;
    setSelectedCustomer(customer);
    setDashboardRequest(current=>current?.nonce===dashboardRequest.nonce?{...current,action:undefined}:current);
  },[items,dashboardRequest]);

  const loadWhatsAppStatus=async()=>{
    const current=auth.currentUser;
    if(!current)throw new Error('not_authenticated');
    const token=await current.getIdToken();
    const response=await fetch('/api/whatsapp-status',{headers:{authorization:`Bearer ${token}`}});
    if(!response.ok)throw new Error('status_failed');
    const data=await response.json();
    setWaStatus(data);
    return data as WhatsAppStatus;
  };

  useEffect(()=>{
    if(!open)return;
    let alive=true;
    (async()=>{
      try{
        const data=await loadWhatsAppStatus();
        if(!alive)return;
        setWaStatus(data);
      }catch{
        if(alive)setWaStatus(null);
      }
    })();
    return()=>{alive=false;};
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
      return [item.customerName,item.phone,item.interestModel,item.desiredVehicle,item.customerEmail,item.tradeInPlate,item.assignedSellerName,item.notes,SOURCE[sourceOf(item)]]
        .some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(needle));
    });
  },[items,search,sourceFilter,onlyMine,user.email]);

  const opportunityItems=useMemo(()=>items.filter(item=>!onlyMine||String(item.assignedSellerEmail||'').toLowerCase()===String(user.email||'').toLowerCase()),[items,onlyMine,user.email]);

  const metrics=useMemo(()=>{
    const active=items.filter(item=>!['sale','no_deal'].includes(item.status)).length;
    const sales=items.filter(item=>item.status==='sale').length;
    const overdue=items.filter(item=>!['sale','no_deal'].includes(item.status)&&isOverdue(item.nextFollowUpAt)).length;
    const closed=items.filter(item=>['sale','no_deal'].includes(item.status)).length;
    return{active,sales,overdue,conversion:closed?Math.round(sales/closed*100):0};
  },[items]);

  const connectMyWhatsApp=async()=>{
    setWaBusy(true);setWaMessage('');
    let cleanup=()=>{};
    try{
      const status=waStatus||await loadWhatsAppStatus();
      if(!status.platformReady)throw new Error('A integração da Meta ainda não está configurada para liberar conexões.');
      const embedded=status.embeddedSignup;
      if(!embedded?.appId||!embedded?.configId)throw new Error('Configuração do Embedded Signup ainda não disponível.');

      const loadSdk=()=>new Promise<void>((resolve,reject)=>{
        const w=window as any;
        const init=()=>{
          try{
            w.FB.init({appId:embedded.appId,cookie:true,xfbml:true,version:status.graphVersion||'v24.0'});
            resolve();
          }catch(error){reject(error);}
        };
        if(w.FB){init();return;}
        w.fbAsyncInit=init;
        const existing=document.getElementById('facebook-jssdk');
        if(existing){
          const timer=window.setInterval(()=>{if(w.FB){window.clearInterval(timer);init();}},150);
          window.setTimeout(()=>{window.clearInterval(timer);if(!w.FB)reject(new Error('Não consegui carregar a conexão segura da Meta.'));},10000);
          return;
        }
        const script=document.createElement('script');
        script.id='facebook-jssdk';
        script.async=true;
        script.defer=true;
        script.crossOrigin='anonymous';
        script.src='https://connect.facebook.net/pt_BR/sdk.js';
        script.onerror=()=>reject(new Error('Não consegui carregar a conexão segura da Meta.'));
        document.body.appendChild(script);
      });
      await loadSdk();

      let code='';
      let session:any=null;
      let completed=false;
      let failTimer=0;

      const finalize=async()=>{
        if(completed||!code||!session?.waba_id)return;
        completed=true;
        cleanup();
        const current=auth.currentUser;
        if(!current)throw new Error('Sua sessão expirou. Entre novamente no MOTYQ.');
        const token=await current.getIdToken();
        const response=await fetch('/api/whatsapp-connect',{
          method:'POST',
          headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
          body:JSON.stringify({code,wabaId:session.waba_id,phoneNumberId:session.phone_number_id||''}),
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok){
          if(data?.error==='phone_already_connected_to_another_seller')throw new Error('Este número já está vinculado a outro vendedor no MOTYQ.');
          if(data?.error==='multiple_phone_numbers_found')throw new Error('A Meta encontrou mais de um número nessa conta. Vamos selecionar o número em uma próxima etapa.');
          throw new Error(data?.reason||'A Meta não concluiu a conexão do número.');
        }
        setWaStatus(prev=>prev?{...prev,connected:true,connection:data.connection}:prev);
        setWaMessage('WhatsApp conectado ao seu usuário com sucesso.');
        setWaBusy(false);
      };

      const listener=(event:MessageEvent)=>{
        try{
          const origin=new URL(event.origin);
          if(!['www.facebook.com','web.facebook.com','facebook.com'].includes(origin.hostname))return;
          const payload=typeof event.data==='string'?JSON.parse(event.data):event.data;
          if(payload?.type!=='WA_EMBEDDED_SIGNUP')return;
          if(['FINISH','FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING','FINISH_ONLY_WABA'].includes(String(payload?.event||''))){
            session=payload.data||{};
            void finalize().catch(error=>{setWaMessage(error?.message||'Não foi possível concluir a conexão.');setWaBusy(false);});
          }else if(payload?.event==='CANCEL'){
            setWaMessage('Conexão cancelada antes da conclusão.');
            setWaBusy(false);cleanup();
          }else if(payload?.event==='ERROR'){
            setWaMessage(String(payload?.data?.error_message||'A Meta informou um erro durante a conexão.'));
            setWaBusy(false);cleanup();
          }
        }catch{}
      };
      window.addEventListener('message',listener);
      cleanup=()=>{window.removeEventListener('message',listener);if(failTimer)window.clearTimeout(failTimer);};
      failTimer=window.setTimeout(()=>{
        if(!completed){
          cleanup();
          setWaBusy(false);
          setWaMessage('A conexão demorou mais que o esperado. Se você concluiu tudo na Meta, tente novamente para recuperar o vínculo.');
        }
      },120000);

      const extras:any={setup:{}};
      if(embedded.featureType)extras.featureType=embedded.featureType;
      if(embedded.sessionInfoVersion)extras.sessionInfoVersion=embedded.sessionInfoVersion;

      (window as any).FB.login((response:any)=>{
        if(response?.authResponse?.code){
          code=String(response.authResponse.code);
          void finalize().catch(error=>{setWaMessage(error?.message||'Não foi possível concluir a conexão.');setWaBusy(false);});
          return;
        }
        if(!completed){
          cleanup();
          setWaBusy(false);
          setWaMessage('A autorização da Meta não foi concluída.');
        }
      },{
        config_id:embedded.configId,
        auth_type:'rerequest',
        response_type:'code',
        override_default_response_type:true,
        extras,
      });
    }catch(error:any){
      cleanup();
      setWaBusy(false);
      setWaMessage(error?.message||'Não foi possível iniciar a conexão com a Meta.');
    }
  };

  const disconnectMyWhatsApp=async()=>{
    if(!window.confirm('Desconectar seu WhatsApp do MOTYQ? O número continuará funcionando no WhatsApp Business.'))return;
    setWaBusy(true);setWaMessage('');
    try{
      const current=auth.currentUser;
      if(!current)throw new Error('Sua sessão expirou.');
      const token=await current.getIdToken();
      const response=await fetch('/api/whatsapp-disconnect',{method:'POST',headers:{authorization:`Bearer ${token}`}});
      if(!response.ok)throw new Error('Não foi possível desconectar agora.');
      await loadWhatsAppStatus();
      setWaMessage('WhatsApp desconectado do MOTYQ.');
    }catch(error:any){setWaMessage(error?.message||'Não foi possível desconectar agora.');}
    finally{setWaBusy(false);}
  };

  const patch=async(item:ShowroomPassage,data:Parameters<typeof showroomFlowService.updateCrmLead>[1])=>{
    setBusyId(item.id);setMessage('');
    try{await showroomFlowService.updateCrmLead(item.id,data);}
    catch(error:any){setMessage(error?.message||'Não foi possível atualizar o lead.');}
    finally{setBusyId('');}
  };

  const moveLead=async(item:ShowroomPassage,status:ShowroomPassageStatus)=>{
    if(!item||item.status===status||busyId===item.id)return;
    const previousStatus=item.status;
    setBusyId(item.id);setMessage('');
    setItems(current=>current.map(row=>row.id===item.id?{...row,status,updatedAt:new Date().toISOString()}:row));
    try{
      await showroomFlowService.updateCrmLead(item.id,{status});
    }catch(error:any){
      setItems(current=>current.map(row=>row.id===item.id?{...row,status:previousStatus}:row));
      setMessage(error?.message||'Não foi possível mover o lead.');
    }finally{
      setBusyId('');
    }
  };

  const dropLead=(status:ShowroomPassageStatus)=>{
    const lead=items.find(item=>item.id===draggedLeadId);
    setDragOverStatus(null);
    setDraggedLeadId('');
    if(lead)void moveLead(lead,status);
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
          {isSeller&&<CrmMyPortfolio items={items} stock={groupStock}
            onOpen={setSelectedCustomer} onContact={setQuickContact} onAdvanced={()=>setShowAdvanced(true)}/>}
          {(!isSeller||showAdvanced)&&<>
          {isSeller&&<button type="button" onClick={()=>setShowAdvanced(false)} className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-xs font-bold text-emerald-700">← Voltar à minha carteira</button>}
          <section className="grid gap-3 md:grid-cols-4">
            <Metric label="Leads ativos" value={metrics.active} icon={<UsersRound size={17}/>} />
            <Metric label="Follow-ups atrasados" value={metrics.overdue} icon={<CalendarClock size={17}/>} alert={metrics.overdue>0}/>
            <Metric label="Vendas" value={metrics.sales} icon={<CheckCircle2 size={17}/>} />
            <Metric label="Conversão fechados" value={`${metrics.conversion}%`} icon={<Sparkles size={17}/>} />
          </section>

          <CrmOpportunityCenter key={dashboardRequest?.nonce||0} user={user} items={opportunityItems} stock={groupStock} onOpenLead={setSelectedCustomer}
            initialTab={dashboardRequest?.tab||'agenda'} startExpanded={Boolean(dashboardRequest)}
            initialContactLead={dashboardRequest?.action==='contact'?items.find(item=>item.id===dashboardRequest.leadId)||null:null}/>

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
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <div className={`grid h-10 w-10 place-items-center rounded-xl ${waStatus?.connected?'bg-emerald-100 text-emerald-700':'bg-violet-100 text-violet-700'}`}><Bot size={18}/></div>
                <div>
                  <p className={`text-xs font-black uppercase tracking-[.13em] ${waStatus?.connected?'text-emerald-700':'text-violet-700'}`}>MEU WHATSAPP · AGENTE MOTYQ</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {waStatus?.connected
                      ? `Seu WhatsApp ${waStatus.connection?.displayPhoneNumber||''} está vinculado ao seu usuário. As conversas deste número entram somente na sua carteira.`
                      : 'Conecte o seu WhatsApp Business ao seu login. Não existe número central da loja neste fluxo.'}
                  </p>
                  {!waStatus?.connected&&<p className="mt-2 text-xs text-slate-500">A conexão abre uma janela segura da Meta. Sua senha do Facebook não passa pelo MOTYQ.</p>}
                  {waMessage&&<p className={`mt-3 text-xs font-semibold ${waStatus?.connected?'text-emerald-700':'text-violet-700'}`}>{waMessage}</p>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row md:flex-col">
                {waStatus?.connected
                  ? <button type="button" disabled={waBusy} onClick={disconnectMyWhatsApp} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 disabled:opacity-50">DESCONECTAR</button>
                  : <button type="button" disabled={waBusy||!waStatus?.platformReady} onClick={connectMyWhatsApp} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">{waBusy?'CONECTANDO...':'CONECTAR MEU WHATSAPP'}</button>}
                <span className={`w-fit self-end rounded-full border bg-white px-3 py-1.5 text-[10px] font-semibold ${waStatus?.connected?'border-emerald-200 text-emerald-700':'border-violet-200 text-violet-700'}`}>{waStatus?.connected?'MEU NÚMERO CONECTADO':'NÃO CONECTADO'}</span>
              </div>
            </div>
          </section>

          {message&&<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</div>}

          <section className="overflow-x-auto pb-3">
            <div className="grid min-w-[1820px] grid-cols-7 gap-3">
              {COLUMNS.map(column=>{
                const rows=filtered.filter(item=>item.status===column.status);
                const isDropTarget=dragOverStatus===column.status;
                return <div
                  key={column.status}
                  onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect='move';setDragOverStatus(column.status);}}
                  onDragEnter={event=>{event.preventDefault();setDragOverStatus(column.status);}}
                  onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDragOverStatus(current=>current===column.status?null:current);}}
                  onDrop={event=>{event.preventDefault();dropLead(column.status);}}
                  className={`rounded-[24px] border p-3 transition-all ${isDropTarget?'border-emerald-400 bg-emerald-50/80 ring-2 ring-emerald-200':'border-slate-200 bg-slate-100/80'}`}
                >
                  <div className="mb-3 flex items-center justify-between px-1">
                    <div><p className="text-sm font-bold text-slate-800">{column.label}</p><p className="text-[11px] text-slate-400">{isDropTarget?'Solte o cliente aqui':column.hint}</p></div>
                    <span className="grid h-7 min-w-7 place-items-center rounded-full bg-white px-2 text-xs font-bold text-slate-600 shadow-sm">{rows.length}</span>
                  </div>
                  <div className="min-h-24 space-y-3">
                    {rows.map(item=><LeadCard
                      key={item.id}
                      item={item}
                      busy={busyId===item.id}
                      dragging={draggedLeadId===item.id}
                      matches={matchGroupStock(groupStock,item.desiredVehicle||item.interestModel,3)}
                      onOpen={()=>setSelectedCustomer(item)}
                      onPatch={data=>patch(item,data)}
                      onMove={status=>moveLead(item,status)}
                      onDragStart={event=>{
                        if(busyId===item.id){event.preventDefault();return;}
                        setDraggedLeadId(item.id);
                        event.dataTransfer.effectAllowed='move';
                        event.dataTransfer.setData('text/plain',item.id);
                      }}
                      onDragEnd={()=>{setDraggedLeadId('');setDragOverStatus(null);}}
                    />)}
                    {!rows.length&&<div className={`rounded-2xl border border-dashed p-5 text-center text-xs transition ${isDropTarget?'border-emerald-400 bg-emerald-50 text-emerald-700':'border-slate-300 bg-white/60 text-slate-400'}`}>{isDropTarget?'Solte o cliente aqui':'Nenhum lead'}</div>}
                  </div>
                </div>;
              })}
            </div>
          </section>
          </>}
        </div>
      </div>

      {quickContact&&<QuickContact key={quickContact.id} lead={items.find(item=>item.id===quickContact.id)||quickContact} user={user} onClose={()=>setQuickContact(null)} onSaved={msg=>{setQuickContact(null);setMessage(msg);}}/>}
      {createOpen&&<NewLeadModal user={user} companyId={scope.companyId} storeId={scope.storeId} sellers={sellers} stockItems={groupStock} onClose={()=>setCreateOpen(false)} onCreated={()=>{setCreateOpen(false);setMessage('Lead criado e entregue ao vendedor.');}} />}
      {selectedCustomer&&<CustomerAttendanceDossier selected={selectedCustomer} items={items} user={user} stockItems={groupStock} onClose={()=>setSelectedCustomer(null)} onContact={setQuickContact} />}
    </div>}
  </>;
};

const LeadCard=({item,busy,dragging,matches,onOpen,onPatch,onMove,onDragStart,onDragEnd}:{item:ShowroomPassage;busy:boolean;dragging:boolean;matches:CrmStockMatch[];onOpen:()=>void;onPatch:(patch:any)=>void;onMove:(status:ShowroomPassageStatus)=>void;onDragStart:(event:React.DragEvent<HTMLElement>)=>void;onDragEnd:()=>void})=>{
  const source=sourceOf(item),temp=temperatureOf(item),wa=whatsappUrl(item.phone),overdue=isOverdue(item.nextFollowUpAt)&&!['sale','no_deal'].includes(item.status);
  const TempIcon=temp==='hot'?Flame:temp==='cold'?Snowflake:SunMedium;
  return <article draggable={!busy} onDragStart={onDragStart} onDragEnd={onDragEnd} className={`cursor-grab rounded-2xl border bg-white p-3.5 shadow-sm transition active:cursor-grabbing ${dragging?'scale-[.98] opacity-45 shadow-none':overdue?'border-red-200 ring-1 ring-red-100':'border-slate-200'}`}>
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-start gap-2">
        <span title="Arraste para outra etapa" className="mt-0.5 hidden shrink-0 text-slate-300 md:block"><GripVertical size={16}/></span>
        <div className="min-w-0"><button type="button" onClick={event=>{event.stopPropagation();onOpen();}} className="text-left font-semibold text-slate-900 underline decoration-emerald-300/70 underline-offset-4 hover:text-emerald-700">{item.customerName||'Cliente'}</button><p className="mt-0.5 text-[11px] text-slate-400">{ageLabel(item.createdAt)} · {SOURCE[source]}</p><p className="mt-0.5 text-[9px] font-bold uppercase tracking-[.1em] text-emerald-600">Abrir ficha</p></div>
      </div>
      <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${temp==='hot'?'bg-red-50 text-red-700':temp==='cold'?'bg-sky-50 text-sky-700':'bg-amber-50 text-amber-700'}`}><TempIcon size={11}/>{TEMP[temp]}</span>
    </div>
    <div className="mt-3 space-y-2 text-xs text-slate-600">
      <p className="flex items-start gap-2"><CarFront size={13} className="mt-0.5 shrink-0 text-slate-400"/><span>{item.desiredVehicle||item.interestModel||'Interesse não informado'}</span></p>
      <p className="flex items-center gap-2"><UserRound size={13} className="text-slate-400"/><span>{item.assignedSellerName||'Sem vendedor'}</span></p>
      {item.nextFollowUpAt&&<p className={`flex items-center gap-2 ${overdue?'font-semibold text-red-700':''}`}><CalendarClock size={13}/><span>{overdue?'Atrasado · ':''}{new Date(item.nextFollowUpAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span></p>}
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      {wa?<button type="button" onClick={()=>window.open(wa,'_blank','noopener,noreferrer')} className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2 text-[11px] font-bold text-emerald-700"><MessageCircle size={13}/> WhatsApp</button>:<div/>}
      <select disabled={busy} value={item.status} onChange={e=>onMove(e.target.value as ShowroomPassageStatus)} title="Mover etapa" className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-[11px] font-semibold text-slate-700 outline-none md:hidden">
        {COLUMNS.map(col=><option key={col.status} value={col.status}>{col.label}</option>)}
      </select>
      <div className="hidden items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-[10px] font-bold text-slate-400 md:flex"><GripVertical size={12}/> ARRASTE</div>
    </div>
    {!['sale','no_deal'].includes(item.status)&&<div className="mt-2">
      <input type="datetime-local" value={inputDateTime(item.nextFollowUpAt)} onChange={e=>onPatch({nextFollowUpAt:e.target.value?new Date(e.target.value).toISOString():''})} className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-2 text-[11px] text-slate-600 outline-none"/>
    </div>}
    {matches.length>0&&<div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
      <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-[.11em] text-emerald-700">ESTOQUE DO GRUPO</p><span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-emerald-700">{matches.length} opção(ões)</span></div>
      <div className="mt-2 space-y-2">{matches.map(match=><div key={match.item.plate} className="rounded-lg border border-emerald-100 bg-white/80 p-2">
        <div className="flex items-start justify-between gap-2"><div><p className="text-[11px] font-semibold text-slate-800">{match.item.model}</p><p className="mt-0.5 text-[10px] text-slate-500">{match.item.year||'Ano não informado'} · {match.item.km?match.item.km.toLocaleString('pt-BR')+' km · ':''}{match.item.location||match.item.stockOwner||'Local não informado'}</p></div><span className="text-[9px] font-black uppercase text-emerald-700">{match.kind==='exact'?'COMPATÍVEL':'SEMELHANTE'}</span></div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500"><span>{match.item.plate}</span><strong className="text-slate-700">{match.item.suggestedPrice?match.item.suggestedPrice.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Preço não informado'}</strong></div>
      </div>)}</div>
    </div>}
    {item.notes&&<p className="mt-3 line-clamp-3 rounded-xl bg-slate-50 p-2 text-[11px] leading-4 text-slate-500">{item.notes}</p>}
  </article>;
};

const NewLeadModal=({user,companyId,storeId,sellers,stockItems,onClose,onCreated}:{user:User;companyId:string;storeId:string;sellers:User[];stockItems:GroupStockItem[];onClose:()=>void;onCreated:()=>void})=>{
  const[name,setName]=useState('');const[phone,setPhone]=useState('');const[model,setModel]=useState('');const[seller,setSeller]=useState('');const[source,setSource]=useState<CrmLeadSource>('manual');const[temp,setTemp]=useState<CrmLeadTemperature>('warm');const[notes,setNotes]=useState('');const[follow,setFollow]=useState('');const[saving,setSaving]=useState(false);const[error,setError]=useState('');
  const liveMatches=useMemo(()=>matchGroupStock(stockItems,model,4),[stockItems,model]);
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
        <div className="sm:col-span-2">
          <Field label="Veículo de interesse" value={model} onChange={setModel} placeholder="Ex.: Creta até 120 mil"/>
          {model.trim().length>=3&&<div className={`mt-2 rounded-xl border p-3 ${liveMatches.length?'border-emerald-200 bg-emerald-50':'border-amber-200 bg-amber-50'}`}>
            {liveMatches.length?<><p className="text-[10px] font-black uppercase tracking-[.11em] text-emerald-700">JÁ TEMOS OPÇÃO NO ESTOQUE DO GRUPO</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{liveMatches.map(match=><div key={match.item.plate} className="rounded-lg bg-white p-2 text-xs"><p className="font-semibold text-slate-800">{match.item.model}</p><p className="mt-1 text-[10px] text-slate-500">{match.item.year} · {match.item.km?match.item.km.toLocaleString('pt-BR')+' km · ':''}{match.item.location||match.item.stockOwner}</p><p className="mt-1 text-[10px] font-semibold text-emerald-700">{match.item.suggestedPrice?match.item.suggestedPrice.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Preço não informado'}</p></div>)}</div></>:<><p className="text-[10px] font-black uppercase tracking-[.11em] text-amber-700">SEM OPÇÃO AGORA</p><p className="mt-1 text-xs text-amber-800">O interesse ficará no CRM para o MOTYQ cruzar nas próximas atualizações de estoque.</p></>}
          </div>}
        </div>
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
