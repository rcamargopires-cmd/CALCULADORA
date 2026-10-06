import React,{useEffect,useMemo,useRef,useState} from 'react';
import { Infinity as InfinityIcon, Keyboard, Mic, MicOff, Send, Sparkles, X } from 'lucide-react';
import type { User } from '../types';
import { auth } from '../firebase';
import { dmsPermissions } from '../services/dmsPermissions';
import { companyScopeService,COMPANY_SCOPE_EVENT } from '../services/companyScopeService';
import { storeScopeService,STORE_SCOPE_EVENT } from '../services/storeScopeService';
import { showroomFlowService } from '../services/showroomFlowService';
import { groupStockService,GroupStockItem } from '../services/groupStockService';
import { userService } from '../services/userService';

type VoiceIntent={
  intent:string;confidence:number;reply:string;needsConfirmation:boolean;mode?:'ai'|'basic';
  params?:{customerName?:string|null;phone?:string|null;interestModel?:string|null;note?:string|null;followUpAt?:string|null;stage?:string|null;query?:string|null;sellerName?:string|null;raw?:string;followUpText?:string};
};

const normalize=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const cleanPhone=(value:unknown)=>String(value??'').replace(/\D/g,'').slice(0,20);
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Number(value)||0);
const stageLabel=(value:string)=>({waiting:'Novo lead',in_service:'Em atendimento',proposal:'Proposta',follow_up:'Follow-up'} as Record<string,string>)[value]||value;

const speak=(text:string,onStart?:()=>void,onEnd?:()=>void)=>{
  if(!text||typeof window==='undefined'||!('speechSynthesis' in window)){onEnd?.();return;}
  window.speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  u.lang='pt-BR';u.rate=1.03;u.pitch=1;
  u.onstart=()=>onStart?.();
  u.onend=()=>onEnd?.();
  u.onerror=()=>onEnd?.();
  window.speechSynthesis.speak(u);
};

const parseRelativeDate=(text:string)=>{
  const t=normalize(text);
  const now=new Date();
  const target=new Date(now);
  if(t.includes('amanha'))target.setDate(target.getDate()+1);
  else{
    const day=t.match(/\bdia\s+(\d{1,2})\b/);
    if(day){
      const n=Number(day[1]);
      target.setDate(n);
      if(target.getTime()<now.getTime()-86400000)target.setMonth(target.getMonth()+1);
    }
  }
  const hour=t.match(/(?:as|às)\s*(\d{1,2})(?:[:h](\d{2}))?/);
  if(hour)target.setHours(Number(hour[1]),Number(hour[2]||0),0,0);
  else target.setHours(10,0,0,0);
  return target.toISOString();
};

const MotyqVoiceAssistant:React.FC<{user:User}>=({user})=>{
  const permissions=dmsPermissions(user);
  const [scope,setScope]=useState(()=>({companyId:companyScopeService.get(user),storeId:storeScopeService.get(user)}));
  const [leads,setLeads]=useState<any[]>([]);
  const [stock,setStock]=useState<GroupStockItem[]>([]);
  const [open,setOpen]=useState(false);
  const [listening,setListening]=useState(false);
  const [processing,setProcessing]=useState(false);
  const [responding,setResponding]=useState(false);
  const [showKeyboard,setShowKeyboard]=useState(false);
  const [transcript,setTranscript]=useState('');
  const [answer,setAnswer]=useState('Toque no microfone e fale naturalmente.');
  const [mode,setMode]=useState<'ai'|'basic'|''>('');
  const recognitionRef=useRef<any>(null);

  useEffect(()=>{
    const sync=()=>setScope({companyId:companyScopeService.get(user),storeId:storeScopeService.get(user)});
    window.addEventListener(COMPANY_SCOPE_EVENT,sync);window.addEventListener(STORE_SCOPE_EVENT,sync);
    return()=>{window.removeEventListener(COMPANY_SCOPE_EVENT,sync);window.removeEventListener(STORE_SCOPE_EVENT,sync);};
  },[user]);

  useEffect(()=>{
    if(!permissions.crmView)return;
    const onData=(items:any[])=>setLeads(items);
    return user.role==='seller'||user.role==='user'
      ? showroomFlowService.subscribeSellerPassages(scope.companyId,scope.storeId,user.email,onData,()=>setLeads([]))
      : showroomFlowService.subscribeStorePassages(scope.companyId,scope.storeId,onData,()=>setLeads([]));
  },[permissions.crmView,scope.companyId,scope.storeId,user.email,user.role]);

  useEffect(()=>groupStockService.subscribe(scope.companyId,s=>setStock(s?.items||[]),()=>setStock([])),[scope.companyId]);

  const supported=useMemo(()=>typeof window!=='undefined'&&Boolean((window as any).SpeechRecognition||(window as any).webkitSpeechRecognition),[]);

  const findLead=(name:string)=>{
    const target=normalize(name);
    if(!target)return null;
    return leads.find(item=>normalize(item.customerName)===target)
      ||leads.find(item=>normalize(item.customerName).includes(target)||target.includes(normalize(item.customerName)));
  };

  const resolveSeller=async(name?:string|null)=>{
    if(user.role==='seller'||user.role==='user')return user;
    const all=await userService.getAll(scope.companyId,scope.storeId).catch(()=>[]);
    const sellers=all.filter(item=>item.status==='active'&&(item.role==='seller'||item.role==='user'));
    const target=normalize(name||'');
    return (target?sellers.find(item=>normalize(item.name).includes(target)):null)||sellers[0]||null;
  };

  const execute=async(result:VoiceIntent,raw:string)=>{
    const p=result.params||{};
    switch(result.intent){
      case'help':
        return'Você pode dizer: cadastre um lead, anote no cliente, agende um retorno, mova para proposta, mostre clientes quentes, consulte uma placa ou diga qual carro está há mais tempo no estoque.';
      case'open_crm':
        window.dispatchEvent(new CustomEvent('motyq:open-crm',{detail:{action:'lead'}}));
        return'Abrindo o CRM.';
      case'crm_create_lead':{
        if(!permissions.crmView)throw new Error('Seu perfil não tem acesso ao CRM.');
        const customerName=String(p.customerName||'').trim();
        if(!customerName)throw new Error('Não consegui identificar o nome do cliente.');
        const seller=await resolveSeller(p.sellerName);
        if(!seller)throw new Error('Não encontrei um vendedor ativo para receber esse lead.');
        await showroomFlowService.createCrmLead({
          companyId:scope.companyId,storeId:scope.storeId,customerName,phone:cleanPhone(p.phone||raw),
          interestModel:String(p.interestModel||''),assignedSellerId:seller.id,assignedSellerEmail:seller.email,assignedSellerName:seller.name,
          leadSource:'manual',leadTemperature:'warm',notes:'Criado pelo Motyq Voice. '+String(p.note||''),createdBy:user.email,createdByName:user.name,
        });
        return`${customerName} foi cadastrado no CRM e direcionado para ${seller.name}.`;
      }
      case'crm_add_note':{
        if(!permissions.crmView)throw new Error('Seu perfil não tem acesso ao CRM.');
        const lead=findLead(String(p.customerName||''));
        if(!lead)throw new Error('Não encontrei esse cliente no seu CRM.');
        const note=String(p.note||'').trim();
        if(!note)throw new Error('Não consegui identificar a observação.');
        const previous=String(lead.notes||'').trim();
        await showroomFlowService.updateCrmLead(lead.id,{notes:[previous,note].filter(Boolean).join('\n')},{email:user.email,name:user.name});
        return`Observação registrada para ${lead.customerName}.`;
      }
      case'crm_schedule_followup':{
        if(!permissions.crmView)throw new Error('Seu perfil não tem acesso ao CRM.');
        const lead=findLead(String(p.customerName||''));
        if(!lead)throw new Error('Não encontrei esse cliente no seu CRM.');
        const due=String(p.followUpAt||'').trim()||parseRelativeDate(String(p.followUpText||raw));
        if(Number.isNaN(new Date(due).getTime()))throw new Error('Não consegui entender a data do retorno.');
        await showroomFlowService.updateCrmLead(lead.id,{status:'follow_up',nextFollowUpAt:due},{email:user.email,name:user.name});
        const label=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(due));
        return`Follow-up de ${lead.customerName} agendado para ${label}.`;
      }
      case'crm_move_stage':{
        if(!permissions.crmView)throw new Error('Seu perfil não tem acesso ao CRM.');
        const lead=findLead(String(p.customerName||''));
        if(!lead)throw new Error('Não encontrei esse cliente no seu CRM.');
        const stage=String(p.stage||'');
        if(!['waiting','in_service','proposal','follow_up'].includes(stage))throw new Error('Essa etapa exige operação manual ou confirmação.');
        await showroomFlowService.updateCrmLead(lead.id,{status:stage as any},{email:user.email,name:user.name});
        return`${lead.customerName} foi movido para ${stageLabel(stage)}.`;
      }
      case'crm_find_customer':{
        const lead=findLead(String(p.customerName||''));
        if(!lead)return'Não encontrei esse cliente no CRM.';
        return`${lead.customerName}: ${stageLabel(lead.status)}, interesse em ${lead.interestModel||lead.desiredVehicle||'veículo não informado'}${lead.nextFollowUpAt?', com follow-up agendado':''}.`;
      }
      case'crm_hot_leads':{
        const hot=leads.filter(item=>['hot','warm'].includes(String(item.leadTemperature||''))).slice(0,5);
        if(!hot.length)return'Você não tem leads quentes no momento.';
        return`Seus destaques são: ${hot.map(item=>item.customerName+' em '+stageLabel(item.status)).join(', ')}.`;
      }
      case'stock_find_vehicle':{
        const q=normalize(String(p.query||raw));
        const item=stock.find(x=>normalize(x.plate)===q.replace(/\s/g,''))||stock.find(x=>normalize(x.model).includes(q)||q.includes(normalize(x.model)));
        if(!item)return'Não encontrei esse veículo no estoque compartilhado.';
        return`${item.model}, placa ${item.plate}: ${item.days} dias de estoque, ${item.km.toLocaleString('pt-BR')} km, preço sugerido ${money(item.suggestedPrice)} e localização ${item.location||'não informada'}.`;
      }
      case'stock_oldest':{
        if(!stock.length)return'Não há fotografia de estoque carregada.';
        const item=[...stock].sort((a,b)=>Number(b.days)-Number(a.days))[0];
        return`O veículo mais antigo é ${item.model}, placa ${item.plate}, com ${item.days} dias de estoque e preço sugerido ${money(item.suggestedPrice)}.`;
      }
      case'stock_summary':{
        if(!stock.length)return'Não há fotografia de estoque carregada.';
        const old=stock.filter(item=>Number(item.days)>=90).length;
        const total=stock.reduce((sum,item)=>sum+(Number(item.cost)||0),0);
        return`O estoque tem ${stock.length} veículos, ${old} com 90 dias ou mais, e custo aproximado de ${money(total)}.`;
      }
      default:
        return result.reply||'Ainda não executo esse comando por voz. Posso ajudar com CRM e consultas de estoque.';
    }
  };

  const processText=async(raw:string)=>{
    const text=raw.trim();if(!text)return;
    setTranscript(text);setProcessing(true);setAnswer('Entendendo...');
    try{
      const token=await auth.currentUser?.getIdToken();
      const response=await fetch('/api/motyq-voice',{
        method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},
        body:JSON.stringify({transcript:text,now:new Date().toISOString()}),
      });
      if(!response.ok)throw new Error('Não consegui interpretar o comando agora.');
      const result:VoiceIntent=await response.json();
      setMode(result.mode||'');
      const executed=await execute(result,text);
      setAnswer(executed);setResponding(true);speak(executed,()=>setResponding(true),()=>setResponding(false));
    }catch(error:any){
      const message=error?.message||'Não consegui executar esse comando.';
      setAnswer(message);setResponding(true);speak(message,()=>setResponding(true),()=>setResponding(false));
    }finally{setProcessing(false);}
  };

  const start=()=>{
    if(!supported){setOpen(true);setAnswer('Seu navegador não liberou reconhecimento de voz. Você pode digitar o comando abaixo.');return;}
    const Recognition=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    const r=new Recognition();recognitionRef.current=r;r.lang='pt-BR';r.interimResults=false;r.continuous=false;
    r.onstart=()=>{setListening(true);setResponding(false);setProcessing(false);setOpen(true);setAnswer('Estou ouvindo...');};
    r.onresult=(event:any)=>{const text=String(event.results?.[0]?.[0]?.transcript||'');void processText(text);};
    r.onerror=()=>{setListening(false);setAnswer('Não consegui ouvir. Tente novamente mais perto do microfone.');};
    r.onend=()=>setListening(false);
    r.start();
  };

  const stop=()=>{try{recognitionRef.current?.stop();}catch{}setListening(false);};

  const closeVoice=()=>{stop();setOpen(false);setResponding(false);setShowKeyboard(false);try{window.speechSynthesis?.cancel();}catch{}};
  const phase=listening?'Ouvindo...':processing?'Entendendo...':responding?'Respondendo...':transcript?'Pronto':'Como posso ajudar?';
  const phaseHint=listening?'Fale naturalmente. Solte quando terminar.':processing?'Estou interpretando seu comando com segurança.':responding?'Executando e preparando a resposta.':'CRM, estoque e ações seguras por voz.';

  if(!permissions.crmView&&!permissions.stockView&&user.role!=='seller'&&user.role!=='user')return null;

  return <>
    {open&&<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#07070d]/78 p-3 backdrop-blur-xl sm:p-6">
      <div className="relative flex min-h-[560px] w-full max-w-[520px] flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_50%_18%,rgba(99,102,241,.18),transparent_34%),linear-gradient(180deg,#11111b_0%,#09090f_100%)] text-white shadow-[0_30px_100px_rgba(0,0,0,.55)]">
        <div className="pointer-events-none absolute -left-24 top-36 h-60 w-60 rounded-full bg-violet-600/10 blur-3xl"/>
        <div className="pointer-events-none absolute -right-24 top-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl"/>

        <header className="relative flex items-center justify-between border-b border-white/[.07] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-violet-400/20 bg-violet-400/10 text-violet-300"><Sparkles size={17}/></div>
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-violet-200">MOTYQ VOICE</p>
              <p className="mt-0.5 text-[10px] text-zinc-500">{mode==='ai'?'IA ativa':mode==='basic'?'Modo básico':'Assistente de operação'}</p>
            </div>
          </div>
          <button onClick={closeVoice} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[.05] text-zinc-300 transition hover:bg-white/10 hover:text-white"><X size={17}/></button>
        </header>

        <main className="relative flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
          <div className="relative mb-7 grid h-44 w-44 place-items-center">
            <div className={`absolute inset-5 rounded-full blur-2xl transition-all duration-500 ${listening?'bg-cyan-400/35 scale-110':processing?'bg-violet-500/30 animate-pulse':responding?'bg-indigo-400/35 animate-pulse':'bg-violet-600/20'}`}/>
            <div className={`absolute inset-9 rounded-full border transition-all duration-500 ${listening?'border-cyan-300/50 shadow-[0_0_55px_rgba(34,211,238,.3)] animate-ping':processing?'border-violet-300/30 shadow-[0_0_50px_rgba(139,92,246,.25)]':responding?'border-indigo-300/40 shadow-[0_0_55px_rgba(129,140,248,.3)]':'border-violet-300/20'}`}/>
            <div className={`relative grid h-28 w-28 place-items-center rounded-full border border-white/10 bg-black/25 shadow-inner transition-transform duration-500 ${listening?'scale-110':processing||responding?'scale-105':''}`}>
              <InfinityIcon size={78} strokeWidth={1.35} className={`drop-shadow-[0_0_15px_rgba(167,139,250,.85)] transition-colors duration-300 ${listening?'text-cyan-200':processing?'text-violet-200':responding?'text-indigo-200':'text-violet-300'}`}/>
            </div>
          </div>

          <h2 className="text-xl font-semibold tracking-tight text-white">{phase}</h2>
          <p className="mt-2 max-w-[330px] text-xs leading-5 text-zinc-500">{phaseHint}</p>

          {transcript&&<div className="mt-6 max-w-[390px] rounded-2xl border border-white/[.07] bg-white/[.035] px-4 py-3 text-sm text-zinc-300">
            <span className="mr-1 text-[10px] font-black uppercase tracking-[.12em] text-zinc-600">Você</span>
            {transcript}
          </div>}

          {!listening&&!processing&&answer&&answer!=='Estou ouvindo...'&&<div className="mt-3 max-w-[390px] text-sm leading-6 text-zinc-200">
            {answer}
          </div>}
        </main>

        <footer className="relative border-t border-white/[.07] bg-black/20 px-5 py-5">
          {showKeyboard&&<form onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const input=form.elements.namedItem('voiceText') as HTMLInputElement;void processText(input.value);input.value='';}} className="mb-4 flex gap-2">
            <input name="voiceText" autoFocus placeholder="Digite um comando..." className="h-11 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[.06] px-4 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-violet-400/40"/>
            <button disabled={processing} className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-500 text-white transition hover:bg-violet-400 disabled:opacity-40"><Send size={17}/></button>
          </form>}

          <div className="flex items-center justify-center gap-3">
            <button onClick={()=>setShowKeyboard(value=>!value)} className="grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[.05] text-zinc-400 transition hover:bg-white/10 hover:text-white" title="Digitar comando"><Keyboard size={18}/></button>
            <button
              onPointerDown={e=>{e.preventDefault();start();}}
              onPointerUp={e=>{e.preventDefault();stop();}}
              onPointerCancel={stop}
              disabled={processing||responding}
              className={`grid h-16 w-16 place-items-center rounded-full border-2 text-white shadow-lg transition-all disabled:opacity-40 ${listening?'border-cyan-200/80 bg-cyan-500 shadow-[0_0_35px_rgba(34,211,238,.35)] scale-105':'border-violet-300/40 bg-violet-600 shadow-[0_0_30px_rgba(124,58,237,.3)] hover:scale-105'}`}
              title="Segure para falar"
            >
              {listening?<MicOff size={24}/>:<Mic size={24}/>}
            </button>
            <button onClick={closeVoice} className="h-12 rounded-full border border-red-400/15 bg-red-400/[.06] px-5 text-xs font-bold text-red-300 transition hover:bg-red-400/10">Encerrar</button>
          </div>
          <p className="mt-3 text-center text-[10px] text-zinc-600">Segure o microfone para falar · solte para enviar</p>
        </footer>
      </div>
    </div>}

    <button
      onClick={()=>setOpen(true)}
      onPointerDown={e=>{if(e.pointerType!=='mouse'){e.preventDefault();start();}}}
      title="Abrir Motyq Voice"
      className="fixed bottom-24 right-4 z-[9998] flex h-14 items-center gap-2 rounded-full bg-gradient-to-r from-violet-700 to-indigo-700 px-4 font-bold text-white shadow-[0_12px_35px_rgba(76,29,149,.35)] transition hover:scale-105 md:bottom-6 md:right-6">
      <Mic size={20}/><span className="hidden sm:inline">Motyq Voice</span>
    </button>
  </>
};

export default MotyqVoiceAssistant;
