import React,{useEffect,useMemo,useRef,useState} from 'react';
import { Infinity as InfinityIcon, Keyboard, Mic, MicOff, Send, Settings2, Sparkles, X } from 'lucide-react';
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
  params?:{customerName?:string|null;phone?:string|null;interestModel?:string|null;note?:string|null;followUpAt?:string|null;stage?:string|null;query?:string|null;sellerName?:string|null;category?:string|null;maxPrice?:number|null;maxKm?:number|null;transmission?:string|null;raw?:string;followUpText?:string};
};

const normalize=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const cleanPhone=(value:unknown)=>String(value??'').replace(/\D/g,'').slice(0,20);
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Number(value)||0);
const stageLabel=(value:string)=>({waiting:'Novo lead',in_service:'Em atendimento',proposal:'Proposta',follow_up:'Follow-up'} as Record<string,string>)[value]||value;
const levenshtein=(a:string,b:string)=>{
  const x=normalize(a),y=normalize(b);const dp=Array.from({length:x.length+1},()=>Array(y.length+1).fill(0));
  for(let i=0;i<=x.length;i++)dp[i][0]=i;for(let j=0;j<=y.length;j++)dp[0][j]=j;
  for(let i=1;i<=x.length;i++)for(let j=1;j<=y.length;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(x[i-1]===y[j-1]?0:1));
  return dp[x.length][y.length];
};
const isSimilarName=(candidate:string,target:string)=>{
  const c=normalize(candidate),t=normalize(target);if(!c||!t)return false;
  if(c===t||c.includes(t)||t.includes(c))return true;
  const cf=c.split(/\s+/)[0],tf=t.split(/\s+/)[0];
  if(cf===tf||cf.startsWith(tf)||tf.startsWith(cf))return true;
  return Math.min(levenshtein(cf,tf),levenshtein(c,t))<=1;
};
const SUV_TERMS=['nivus','t-cross','tcross','creta','tracker','kicks','hr-v','hrv','renegade','compass','pulse','fastback','territory','corolla cross','taos','tiggo','song','yuan','dolphin mini','captur','duster','ecosport','2008','3008','c4 cactus','aircross','rav4','santa fe','tucson','sportage','sorento','equinox','trailblazer','commander'];
const looksLikeSuv=(item:GroupStockItem)=>SUV_TERMS.some(term=>normalize(item.model).includes(normalize(term)));


const chooseNaturalPtBrVoice=(preferredName?:string)=>{
  if(typeof window==='undefined'||!('speechSynthesis' in window))return null;
  const voices=window.speechSynthesis.getVoices();
  const pt=voices.filter(voice=>String(voice.lang||'').toLowerCase().startsWith('pt'));
  if(!pt.length)return null;
  if(preferredName){const picked=pt.find(voice=>voice.name===preferredName);if(picked)return picked;}
  const preferred=[
    /francisca/i,/luciana/i,/maria/i,/fernanda/i,/camila/i,/giovanna/i,/leticia/i,
    /google.*portugu/i,/portugu[eê]s.*brasil/i,/brazil.*female/i,/female/i,
  ];
  for(const pattern of preferred){
    const found=pt.find(voice=>pattern.test(String(voice.name||'')));
    if(found)return found;
  }
  return pt.find(voice=>String(voice.lang||'').toLowerCase()==='pt-br')||pt[0]||null;
};

const speak=(text:string,voiceName?:string,onStart?:()=>void,onEnd?:()=>void)=>{
  if(!text||typeof window==='undefined'||!('speechSynthesis' in window)){onEnd?.();return;}
  window.speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  const voice=chooseNaturalPtBrVoice(voiceName);
  if(voice)u.voice=voice;
  u.lang=voice?.lang||'pt-BR';
  u.rate=.96;
  u.pitch=1.04;
  u.volume=1;
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
  const [showVoiceSettings,setShowVoiceSettings]=useState(false);
  const [voiceOptions,setVoiceOptions]=useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName,setSelectedVoiceName]=useState(()=>typeof window!=='undefined'?localStorage.getItem('motyq.voice.name')||'':'');
  const [transcript,setTranscript]=useState('');
  const [answer,setAnswer]=useState('Toque no microfone e fale naturalmente.');
  const [mode,setMode]=useState<'ai'|'basic'|''>('');
  const [lastCustomerName,setLastCustomerName]=useState('');
  const recognitionRef=useRef<any>(null);
  const recognitionBufferRef=useRef('');
  const neuralAudioRef=useRef<HTMLAudioElement|null>(null);
  const neuralAudioUrlRef=useRef('');

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

  useEffect(()=>{
    if(typeof window==='undefined'||!('speechSynthesis' in window))return;
    const loadVoices=()=>{
      const pt=window.speechSynthesis.getVoices()
        .filter(voice=>String(voice.lang||'').toLowerCase().startsWith('pt'))
        .sort((a,b)=>{
          const aBr=String(a.lang||'').toLowerCase()==='pt-br'?0:1;
          const bBr=String(b.lang||'').toLowerCase()==='pt-br'?0:1;
          return aBr-bBr||String(a.name).localeCompare(String(b.name));
        });
      setVoiceOptions(pt);
      if(!selectedVoiceName&&pt.length){
        const suggested=chooseNaturalPtBrVoice();
        const name=suggested?.name||pt[0].name;
        setSelectedVoiceName(name);
        localStorage.setItem('motyq.voice.name',name);
      }
    };
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged',loadVoices);
    return()=>window.speechSynthesis.removeEventListener?.('voiceschanged',loadVoices);
  },[]);

  const supported=useMemo(()=>typeof window!=='undefined'&&Boolean((window as any).SpeechRecognition||(window as any).webkitSpeechRecognition),[]);

  const stopVoicePlayback=()=>{
    try{window.speechSynthesis?.cancel();}catch{}
    try{neuralAudioRef.current?.pause();}catch{}
    neuralAudioRef.current=null;
    if(neuralAudioUrlRef.current){try{URL.revokeObjectURL(neuralAudioUrlRef.current);}catch{}neuralAudioUrlRef.current='';}
  };

  const speakResponse=async(text:string)=>{
    if(!text)return;
    stopVoicePlayback();
    setResponding(true);
    try{
      const token=await auth.currentUser?.getIdToken();
      const response=await fetch('/api/motyq-voice',{
        method:'POST',
        headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},
        body:JSON.stringify({action:'tts',text}),
      });
      if(response.ok){
        const blob=await response.blob();
        if(blob.size>0){
          const url=URL.createObjectURL(blob);
          neuralAudioUrlRef.current=url;
          const audio=new Audio(url);
          neuralAudioRef.current=audio;
          audio.onended=()=>{setResponding(false);stopVoicePlayback();};
          audio.onerror=()=>{setResponding(false);stopVoicePlayback();};
          await audio.play();
          return;
        }
      }
    }catch{}
    speak(text,selectedVoiceName,()=>setResponding(true),()=>setResponding(false));
  };

  const extractCustomerNameFromSpeech=(raw:string)=>{
    const text=String(raw||'').trim();
    const patterns=[
      /(?:cliente|com|para|pro|pra)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]{1,40})(?=\s+(?:e|mas|não|nao|amanhã|amanha|hoje|reagend|agend|retorno|follow|porque|que)|,|$)/i,
      /(?:falar|ligar|liguei|chamei|contato)\s+(?:com|para)?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]{1,40})(?=\s+(?:e|mas|não|nao|amanhã|amanha|hoje|reagend|agend|retorno|follow)|,|$)/i,
      /(?:reagenda|reagende|agenda|agende|retorno|follow[- ]?up)(?:\s+(?:do|da|com|para|pro|pra))?\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]{1,40})(?=\s+(?:para|pra|amanhã|amanha|hoje|às|as|dia)|,|$)/i,
      /(?:procura|procure|buscar|busca|localiza|localize|encontra|encontre)\s+(?:o cliente|a cliente|cliente|lead)?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]{1,40})(?=\s|,|$)/i,
    ];
    for(const pattern of patterns){
      const match=text.match(pattern);
      if(match?.[1])return match[1].trim();
    }
    return '';
  };

  const findLeadLocal=(items:any[],name:string)=>{
    const target=normalize(name);
    if(!target)return null;
    const exact=items.find(item=>normalize(item.customerName)===target);
    if(exact)return exact;
    const contains=items.find(item=>normalize(item.customerName).includes(target)||target.includes(normalize(item.customerName)));
    if(contains)return contains;
    const similar=items.filter(item=>isSimilarName(String(item.customerName||''),target));
    return similar.length?similar[0]:null;
  };
  const findLead=async(name:string)=>{
    const target=String(name||lastCustomerName||'').trim();
    const local=findLeadLocal(leads,target);
    if(local){setLastCustomerName(String(local.customerName||target));return local;}
    const scoped=await showroomFlowService.listStorePassages(scope.companyId,scope.storeId).catch(()=>[]);
    const visible=(user.role==='seller'||user.role==='user')
      ? scoped.filter(item=>normalize(item.assignedSellerEmail)===normalize(user.email))
      : scoped;
    const found=findLeadLocal(visible,target);
    if(found)setLastCustomerName(String(found.customerName||target));
    return found;
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
        return'Você pode dizer: cadastre um lead, agende retorno para o Erick, mostre clientes quentes, me mostre SUVs automáticos até 100 mil, consulte uma placa ou diga qual carro está há mais tempo no estoque.';
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
        const lead=await findLead(String(p.customerName||''));
        if(!lead)throw new Error('Não encontrei esse cliente no seu CRM.');
        const note=String(p.note||'').trim();
        if(!note)throw new Error('Não consegui identificar a observação.');
        const previous=String(lead.notes||'').trim();
        await showroomFlowService.updateCrmLead(lead.id,{notes:[previous,note].filter(Boolean).join('\n')},{email:user.email,name:user.name});
        return`Observação registrada para ${lead.customerName}.`;
      }
      case'crm_schedule_followup':{
        if(!permissions.crmView)throw new Error('Seu perfil não tem acesso ao CRM.');
        const inferredName=String(p.customerName||extractCustomerNameFromSpeech(raw)||lastCustomerName||'');
        const lead=await findLead(inferredName);
        if(!lead)throw new Error(inferredName?`Não encontrei ${inferredName} no CRM desta unidade.`:'Não consegui identificar o nome do cliente.');
        const due=String(p.followUpAt||'').trim()||parseRelativeDate(String(p.followUpText||raw));
        if(Number.isNaN(new Date(due).getTime()))throw new Error('Não consegui entender a data do retorno.');
        await showroomFlowService.updateCrmLead(lead.id,{status:'follow_up',nextFollowUpAt:due},{email:user.email,name:user.name});
        const label=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(due));
        return`Follow-up de ${lead.customerName} agendado para ${label}.`;
      }
      case'crm_contact_note_followup':{
        if(!permissions.crmView)throw new Error('Seu perfil não tem acesso ao CRM.');
        const inferredName=String(p.customerName||extractCustomerNameFromSpeech(raw)||lastCustomerName||'');
        const lead=await findLead(inferredName);
        if(!lead)throw new Error(inferredName?`Encontrei o nome ${inferredName} na sua fala, mas ele não está no CRM desta unidade.`:'Não consegui identificar de qual cliente você está falando. Diga o nome dele uma vez e depois eu mantenho o contexto.');
        const due=String(p.followUpAt||'').trim()||parseRelativeDate(String(p.followUpText||raw));
        if(Number.isNaN(new Date(due).getTime()))throw new Error('Não consegui entender a data do retorno.');
        const previous=String(lead.notes||'').trim();
        const note='Tentativa de contato sem sucesso registrada pelo Motyq Voice.';
        await showroomFlowService.updateCrmLead(lead.id,{status:'follow_up',nextFollowUpAt:due,notes:[previous,note].filter(Boolean).join('\n')},{email:user.email,name:user.name});
        const label=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(due));
        setLastCustomerName(String(lead.customerName||''));
        return`Registrei que você tentou falar com ${lead.customerName} sem sucesso e agendei o retorno para ${label}.`;
      }
      case'crm_move_stage':{
        if(!permissions.crmView)throw new Error('Seu perfil não tem acesso ao CRM.');
        const lead=await findLead(String(p.customerName||''));
        if(!lead)throw new Error('Não encontrei esse cliente no seu CRM.');
        const stage=String(p.stage||'');
        if(!['waiting','in_service','proposal','follow_up'].includes(stage))throw new Error('Essa etapa exige operação manual ou confirmação.');
        await showroomFlowService.updateCrmLead(lead.id,{status:stage as any},{email:user.email,name:user.name});
        return`${lead.customerName} foi movido para ${stageLabel(stage)}.`;
      }
      case'crm_find_customer':{
        const lead=await findLead(String(p.customerName||''));
        if(!lead)return'Não encontrei esse cliente no CRM.';
        return`${lead.customerName}: ${stageLabel(lead.status)}, interesse em ${lead.interestModel||lead.desiredVehicle||'veículo não informado'}${lead.nextFollowUpAt?', com follow-up agendado':''}.`;
      }
      case'crm_hot_leads':{
        const hot=leads.filter(item=>['hot','warm'].includes(String(item.leadTemperature||''))).slice(0,5);
        if(!hot.length)return'Você não tem leads quentes no momento.';
        return`Seus destaques são: ${hot.map(item=>item.customerName+' em '+stageLabel(item.status)).join(', ')}.`;
      }
      case'stock_count':{
        const q=normalize(String(p.query||'')).replace(/\b(carros?|veiculos?|veículos?|modelos?)\b/g,'').trim();
        if(!q)return'O que você quer que eu conte no estoque?';
        const matches=stock.filter(item=>{
          const hay=[item.model,item.brand,item.year,item.transmission,item.fuel].map(normalize).join(' ');
          return hay.includes(q)||q.split(/\s+/).every(token=>token.length<2||hay.includes(token));
        });
        if(!matches.length)return 'Não encontrei '+String(p.query||'esse modelo')+' no estoque atual.';
        const names=[...new Set(matches.map(item=>item.model))].slice(0,6);
        const totalValue=matches.reduce((sum,item)=>sum+(Number(item.suggestedPrice)||0),0);
        const modelsText=names.length?' Modelos: '+names.join(', ')+'.':'';
        const valueText=matches.length>1?' Valor anunciado aproximado do grupo: '+money(totalValue)+'.':'';
        return 'Temos '+matches.length+' '+String(p.query||'veículo')+(matches.length>1?'s':'')+' no estoque.'+modelsText+valueText;
      }
      case'stock_search':{
        const category=normalize(String(p.category||''));
        const transmission=normalize(String(p.transmission||''));
        const maxPrice=Number(p.maxPrice)||0;
        const maxKm=Number(p.maxKm)||0;
        const query=normalize(String(p.query||''));
        let matches=stock.filter(item=>{
          if(category==='suv'&&!looksLikeSuv(item))return false;
          if(transmission&&normalize(item.transmission).indexOf(transmission)<0)return false;
          if(maxPrice&&Number(item.suggestedPrice)>maxPrice)return false;
          if(maxKm&&Number(item.km)>maxKm)return false;
          if(query&&!normalize(item.model).includes(query)&&!normalize(item.brand).includes(query))return false;
          return true;
        });
        matches=[...matches].sort((a,b)=>{
          const ap=Number(a.suggestedPrice)||999999999,bp=Number(b.suggestedPrice)||999999999;
          return ap-bp||Number(a.days)-Number(b.days);
        }).slice(0,5);
        if(!matches.length)return'Não encontrei opções com esses filtros no estoque atual.';
        return`Encontrei ${matches.length} opção${matches.length>1?'ões':''}: ${matches.map(item=>`${item.model}, ${item.year||'ano n/i'}, ${item.km.toLocaleString('pt-BR')} km, ${money(item.suggestedPrice)}`).join('; ')}.`;
      }
      case'stock_find_vehicle':{
        const q=normalize(String(p.query||raw)).replace(/\b(no estoque|do estoque|estoque)\b/g,'').trim();
        const plateQuery=q.replace(/\s/g,'').toUpperCase();
        const exactPlate=stock.find(x=>String(x.plate||'').toUpperCase()===plateQuery);
        if(exactPlate)return `${exactPlate.model}, placa ${exactPlate.plate}: ${exactPlate.days} dias de estoque, ${exactPlate.km.toLocaleString('pt-BR')} km, preço sugerido ${money(exactPlate.suggestedPrice)} e localização ${exactPlate.location||'não informada'}.`;
        const matches=stock.filter(x=>normalize(x.model).includes(q)||normalize(x.brand).includes(q)||q.includes(normalize(x.model)));
        if(!matches.length)return'Não encontrei esse veículo no estoque compartilhado.';
        const top=matches.slice(0,5);
        return `Encontrei ${matches.length} opção${matches.length>1?'ões':''}: ${top.map(item=>`${item.model}, ${item.year||'ano n/i'}, ${item.km.toLocaleString('pt-BR')} km, ${money(item.suggestedPrice)}`).join('; ')}.`;
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
        body:JSON.stringify({transcript:text,now:new Date().toISOString(),contextCustomerName:lastCustomerName}),
      });
      if(!response.ok)throw new Error('Não consegui interpretar o comando agora.');
      const result:VoiceIntent=await response.json();
      setMode(result.mode||'');
      const executed=await execute(result,text);
      setAnswer(executed);void speakResponse(executed);
    }catch(error:any){
      const message=error?.message||'Não consegui executar esse comando.';
      setAnswer(message);void speakResponse(message);
    }finally{setProcessing(false);}
  };

  const start=()=>{
    if(!supported){setOpen(true);setAnswer('Seu navegador não liberou reconhecimento de voz. Você pode digitar o comando abaixo.');return;}
    if(listening)return;
    const Recognition=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    const r=new Recognition();
    recognitionRef.current=r;
    recognitionBufferRef.current='';
    r.lang='pt-BR';
    r.interimResults=true;
    r.continuous=true;
    r.onstart=()=>{setListening(true);setResponding(false);setProcessing(false);setOpen(true);setTranscript('');setAnswer('Estou ouvindo...');};
    r.onresult=(event:any)=>{
      const pieces:string[]=[];
      for(let i=0;i<event.results.length;i++){
        const piece=String(event.results[i]?.[0]?.transcript||'').trim();
        if(piece)pieces.push(piece);
      }
      const text=pieces.join(' ').replace(/\s+/g,' ').trim();
      recognitionBufferRef.current=text;
      if(text)setTranscript(text);
    };
    r.onerror=(event:any)=>{
      setListening(false);
      const code=String(event?.error||'');
      if(code!=='aborted'&&code!=='no-speech')setAnswer('Não consegui ouvir direito. Toque no microfone e tente novamente.');
    };
    r.onend=()=>{
      setListening(false);
      const captured=recognitionBufferRef.current.trim();
      recognitionRef.current=null;
      if(captured&&!processing)void processText(captured);
    };
    r.start();
  };

  const stop=()=>{
    const r=recognitionRef.current;
    if(!r){setListening(false);return;}
    try{r.stop();}catch{}
  };

  const toggleListening=()=>listening?stop():start();

  const closeVoice=()=>{stop();stopVoicePlayback();setOpen(false);setResponding(false);setShowKeyboard(false);setShowVoiceSettings(false);};
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
              <p className="mt-0.5 text-[10px] text-zinc-500">{mode==='ai'?'IA ativa · voz neural':mode==='basic'?'Modo básico · voz neural se disponível':'Assistente de operação'}</p>
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
          {showVoiceSettings&&<div className="mb-4 rounded-2xl border border-white/10 bg-white/[.04] p-3 text-left">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[.12em] text-zinc-500">Voz da assistente</span>
              <span className="text-[10px] text-zinc-600">{voiceOptions.length} voz(es) pt</span>
            </div>
            {voiceOptions.length?<select value={selectedVoiceName} onChange={e=>{setSelectedVoiceName(e.target.value);localStorage.setItem('motyq.voice.name',e.target.value);}} className="h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white outline-none">
              {voiceOptions.map(voice=><option key={voice.name+'-'+voice.lang} value={voice.name}>{voice.name} · {voice.lang}</option>)}
            </select>:<div className="rounded-xl border border-amber-400/15 bg-amber-400/[.05] px-3 py-2 text-xs text-amber-200">Seu navegador está expondo apenas a voz padrão. Nesse caso, para mudar de verdade a voz precisamos usar voz neural por API.</div>}
            <button type="button" onClick={()=>speak('Olá. Eu sou a assistente do Motyq. Esta é a voz selecionada para responder aos seus comandos.',selectedVoiceName)} className="mt-2 h-9 w-full rounded-xl border border-violet-400/20 bg-violet-400/10 text-xs font-bold text-violet-200">TESTAR ESTA VOZ</button>
          </div>}
          {showKeyboard&&<form onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const input=form.elements.namedItem('voiceText') as HTMLInputElement;void processText(input.value);input.value='';}} className="mb-4 flex gap-2">
            <input name="voiceText" autoFocus placeholder="Digite um comando..." className="h-11 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[.06] px-4 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-violet-400/40"/>
            <button disabled={processing} className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-500 text-white transition hover:bg-violet-400 disabled:opacity-40"><Send size={17}/></button>
          </form>}

          <div className="flex items-center justify-center gap-3">
            <button onClick={()=>setShowVoiceSettings(value=>!value)} className="grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[.05] text-zinc-400 transition hover:bg-white/10 hover:text-white" title="Escolher voz"><Settings2 size={18}/></button>
            <button onClick={()=>setShowKeyboard(value=>!value)} className="grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[.05] text-zinc-400 transition hover:bg-white/10 hover:text-white" title="Digitar comando"><Keyboard size={18}/></button>
            <button
              onClick={toggleListening}
              disabled={processing||responding}
              className={`grid h-16 w-16 place-items-center rounded-full border-2 text-white shadow-lg transition-all disabled:opacity-40 ${listening?'border-cyan-200/80 bg-cyan-500 shadow-[0_0_35px_rgba(34,211,238,.35)] scale-105':'border-violet-300/40 bg-violet-600 shadow-[0_0_30px_rgba(124,58,237,.3)] hover:scale-105'}`}
              title={listening?'Toque para enviar':'Toque para falar'}
            >
              {listening?<MicOff size={24}/>:<Mic size={24}/>}
            </button>
            <button onClick={closeVoice} className="h-12 rounded-full border border-red-400/15 bg-red-400/[.06] px-5 text-xs font-bold text-red-300 transition hover:bg-red-400/10">Encerrar</button>
          </div>
          <p className="mt-3 text-center text-[10px] text-zinc-600">Toque para falar · toque novamente para enviar</p>
        </footer>
      </div>
    </div>}

    <button
      onClick={()=>setOpen(true)}
      title="Abrir Motyq Voice"
      className="fixed bottom-24 right-4 z-[9998] flex h-14 items-center gap-2 rounded-full bg-gradient-to-r from-violet-700 to-indigo-700 px-4 font-bold text-white shadow-[0_12px_35px_rgba(76,29,149,.35)] transition hover:scale-105 md:bottom-6 md:right-6">
      <Mic size={20}/><span className="hidden sm:inline">Motyq Voice</span>
    </button>
  </>
};

export default MotyqVoiceAssistant;
