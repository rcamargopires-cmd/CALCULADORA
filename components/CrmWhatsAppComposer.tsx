import React,{useEffect,useMemo,useState} from 'react';
import {MessageCircle,X} from 'lucide-react';
import type {GroupStockItem} from '../services/groupStockService';
import type {ShowroomPassage,User} from '../types';

export type CrmWhatsAppReason='auto'|'follow_up'|'today'|'stock'|'proposal';
type Request={lead:ShowroomPassage;reason?:CrmWhatsAppReason;stockItem?:GroupStockItem};
const EVENT='motyq:crm-whatsapp-compose';

const firstName=(value:string)=>String(value||'').trim().split(/\s+/)[0]||'';
const cleanPhone=(value:string)=>{
  let digits=String(value||'').replace(/\D/g,'');
  if(digits.length===10||digits.length===11)digits='55'+digits;
  return digits.length>=12?digits:'';
};
const interestOf=(lead:ShowroomPassage)=>String(lead.desiredVehicle||lead.interestModel||'').trim();
const inferredReason=(lead:ShowroomPassage,reason?:CrmWhatsAppReason):CrmWhatsAppReason=>{
  if(reason&&reason!=='auto')return reason;
  if(lead.status==='proposal')return'proposal';
  if(lead.nextFollowUpAt){
    const due=new Date(lead.nextFollowUpAt).getTime();
    if(Number.isFinite(due))return due<Date.now()?'follow_up':'today';
  }
  return'follow_up';
};

const suggestion=(request:Request,user:User)=>{
  const lead=request.lead;
  const reason=inferredReason(lead,request.reason);
  const customer=firstName(lead.customerName);
  const seller=firstName(user.name||lead.assignedSellerName||'');
  const hello=customer?'Oi, '+customer+'!':'Oi!';
  const intro=seller?' Aqui é o '+seller+'.':'';
  const interest=interestOf(lead);
  if(reason==='stock'&&request.stockItem){
    const car=[request.stockItem.model,request.stockItem.year].filter(Boolean).join(' ');
    return hello+intro+' Tudo bem? Lembrei de você porque apareceu uma opção que combina com o que você estava procurando'+(car?': '+car:'')+'. Quer que eu te envie os detalhes e as fotos?';
  }
  if(reason==='proposal'){
    return hello+intro+' Tudo bem? Queria saber se conseguiu analisar a proposta'+(interest?' sobre '+interest:'')+' que conversamos. Se quiser, posso revisar as condições e verificar outras alternativas para você.';
  }
  if(reason==='today'){
    return hello+intro+' Tudo bem? Como combinamos, estou entrando em contato'+(interest?' sobre '+interest:'')+'. Posso te ajudar a avançar com a escolha ou tirar alguma dúvida?';
  }
  return hello+intro+' Tudo bem? Estou retomando nosso contato'+(interest?' sobre '+interest:'')+'. Você ainda está procurando essa opção? Posso te atualizar sobre o que temos disponível.';
};

export const requestCrmWhatsApp=(lead:ShowroomPassage,reason:CrmWhatsAppReason='auto',stockItem?:GroupStockItem)=>{
  window.dispatchEvent(new CustomEvent<Request>(EVENT,{detail:{lead,reason,stockItem}}));
};

const CrmWhatsAppComposerHost:React.FC<{user:User}>=({user})=>{
  const[request,setRequest]=useState<Request|null>(null);
  const[text,setText]=useState('');
  useEffect(()=>{
    const open=(event:Event)=>{
      const detail=(event as CustomEvent<Request>).detail;
      if(!detail?.lead)return;
      setRequest(detail);
      setText(suggestion(detail,user));
    };
    window.addEventListener(EVENT,open as EventListener);
    return()=>window.removeEventListener(EVENT,open as EventListener);
  },[user.email,user.name]);

  const phone=useMemo(()=>request?cleanPhone(request.lead.phone):'',[request]);
  if(!request)return null;
  const reset=()=>setText(suggestion(request,user));
  const openWhatsApp=()=>{
    if(!phone)return;
    const url='https://wa.me/'+phone+'?text='+encodeURIComponent(text.trim());
    window.open(url,'_blank','noopener,noreferrer');
    setRequest(null);
  };

  return <div className="fixed inset-0 z-[790] grid place-items-center overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm" onClick={()=>setRequest(null)}>
    <div className="w-full max-w-xl rounded-[26px] border border-emerald-200 bg-white p-5 shadow-2xl md:p-6" onClick={event=>event.stopPropagation()}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-700">MOTYQ · MENSAGEM SUGERIDA</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-900">{request.lead.customerName||'Cliente'}</h3>
          <p className="mt-1 text-xs text-slate-500">Revise a mensagem antes de abrir o WhatsApp. O MOTYQ não envia nada sozinho.</p>
        </div>
        <button type="button" onClick={()=>setRequest(null)} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500" aria-label="Fechar"><X size={17}/></button>
      </div>
      <textarea autoFocus value={text} onChange={event=>setText(event.target.value)} rows={7}
        className="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800 outline-none focus:border-emerald-400"/>
      {!phone&&<p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">O telefone deste cliente não é válido para abrir o WhatsApp.</p>}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={reset} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">RECRIAR SUGESTÃO</button>
        <button type="button" onClick={openWhatsApp} disabled={!phone||!text.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"><MessageCircle size={16}/> ABRIR WHATSAPP</button>
      </div>
    </div>
  </div>;
};
export default CrmWhatsAppComposerHost;
