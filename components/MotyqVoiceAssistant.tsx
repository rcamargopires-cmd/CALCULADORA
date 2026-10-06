import React,{useEffect,useMemo,useRef,useState} from 'react';
import { Mic,MicOff,Send,Volume2,X,Sparkles } from 'lucide-react';
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

const speak=(text:string)=>{
  if(!text||typeof window==='undefined'||!('speechSynthesis' in window))return;
  window.speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  u.lang='pt-BR';u.rate=1.03;u.pitch=1;
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
      setAnswer(executed);speak(executed);
    }catch(error:any){
      const message=error?.message||'Não consegui executar esse comando.';
      setAnswer(message);speak(message);
    }finally{setProcessing(false);}
  };

  const start=()=>{
    if(!supported){setOpen(true);setAnswer('Seu navegador não liberou reconhecimento de voz. Você pode digitar o comando abaixo.');return;}
    const Recognition=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    const r=new Recognition();recognitionRef.current=r;r.lang='pt-BR';r.interimResults=false;r.continuous=false;
    r.onstart=()=>{setListening(true);setOpen(true);setAnswer('Estou ouvindo...');};
    r.onresult=(event:any)=>{const text=String(event.results?.[0]?.[0]?.transcript||'');void processText(text);};
    r.onerror=()=>{setListening(false);setAnswer('Não consegui ouvir. Tente novamente mais perto do microfone.');};
    r.onend=()=>setListening(false);
    r.start();
  };

  const stop=()=>{try{recognitionRef.current?.stop();}catch{}setListening(false);};

  if(!permissions.crmView&&!permissions.stockView&&user.role!=='seller'&&user.role!=='user')return null;

  return <div className="fixed bottom-24 right-4 z-[9998] md:bottom-6 md:right-6">
    {open&&<div className="mb-3 w-[min(92vw,360px)] overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-gradient-to-r from-violet-700 to-indigo-700 px-4 py-3 text-white">
        <div className="flex items-center gap-2"><Sparkles size={17}/><div><p className="text-xs font-black uppercase tracking-[.14em]">MOTYQ VOICE</p><p className="text-[10px] text-violet-100">{mode==='ai'?'IA ativa':mode==='basic'?'modo básico':''}</p></div></div>
        <button onClick={()=>setOpen(false)} className="grid h-8 w-8 place-items-center rounded-full bg-white/10"><X size={16}/></button>
      </div>
      <div className="space-y-3 p-4">
        {transcript&&<div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-500"><b>Você:</b> {transcript}</div>}
        <div className="rounded-2xl bg-violet-50 p-3 text-sm leading-5 text-violet-950"><b>Motyq:</b> {answer}</div>
        <form onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const input=form.elements.namedItem('voiceText') as HTMLInputElement;void processText(input.value);input.value='';}} className="flex gap-2">
          <input name="voiceText" placeholder="Ou digite um comando..." className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-violet-400"/>
          <button disabled={processing} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white disabled:opacity-50"><Send size={16}/></button>
        </form>
        <div className="flex items-center justify-between text-[10px] text-slate-400"><span>CRM e estoque · ações seguras</span><Volume2 size={13}/></div>
      </div>
    </div>}
    <button
      onPointerDown={e=>{e.preventDefault();start();}}
      onPointerUp={e=>{e.preventDefault();stop();}}
      onPointerCancel={stop}
      title="Segure para falar com o Motyq"
      className={`group flex h-14 items-center gap-2 rounded-full px-4 font-bold text-white shadow-xl transition ${listening?'bg-red-500 scale-105':'bg-gradient-to-r from-violet-700 to-indigo-700 hover:scale-105'}`}>
      {listening?<MicOff size={20}/>:<Mic size={20}/>}<span className="hidden sm:inline">{listening?'Ouvindo...':'Motyq Voice'}</span>
    </button>
  </div>;
};

export default MotyqVoiceAssistant;
