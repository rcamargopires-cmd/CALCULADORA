import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Bike,CarFront,CheckCircle2,ChevronRight,History,Home,Info,LogOut,Mic,MicOff,RefreshCw,Save,Search,Settings2,Share2,Wallet,ExternalLink,ShieldCheck,X,Volume2} from 'lucide-react';
import {signOut} from 'firebase/auth';
import type {User,OperationalStockItem} from '../types';
import {auth} from '../firebase';
import {companyIdForUser} from '../services/companyService';
import {storeIdForUser} from '../services/storeService';
import {currentStockService} from '../services/currentStockService';
import {dmsPermissions} from '../services/dmsPermissions';
import MarketIqConsultedRepasse from './MarketIqConsultedRepasse';
import MarketIqIntelligentHistoryPanel from './MarketIqIntelligentHistoryPanel';
import {mesaReferenceKey,type MesaPriceReference} from '../services/marketIqMesaPricePattern';
import {mobileHistorySearch,mobileModelYearFromCode,mobilePriceSource,mobileYearOptions,mobileQuickIntent,mobileFilterModels,mobileFuelFromModel,mobileAutoYearChoice,type MobileFuel,type MobileFipeOption} from '../services/marketIqMobileFlow';
import {mobileSpeechToSearch,speechErrorFeedback} from '../services/marketIqMobileVoice';
import MarketIqVoiceHologram from './MarketIqVoiceHologram';
import {canPromptMotyqInstall,isStandaloneMotyq,promptMotyqInstall,subscribeMotyqInstall}
 from '../services/marketIqPwaInstall';
type Vehicle='car'|'motorcycle';
type Fipe={value:number;brand:string;model:string;year:number;fuel:string;referenceMonth:string;referenceStatus?:'current'|'outdated'|'unverified'};
type NegotiatedProposal={negotiatedOffer:number;baseSuggestion:number;requestedByManager:string;negotiationReason:string};
export type MobileHistoryRecord={negotiatedOffer?:number|null;baseSuggestion?:number|null;requestedByManager?:string;negotiationReason?:string;negotiationStatus?:string;id:string;model:string;year:string;km:string;value:number;date:string;plate?:string;brand?:string;provisional?:boolean;approvedValue?:number;paidValue?:number;vehicleType?:Vehicle};
export type Props={
 user:User;vehicleType:Vehicle;onVehicleType:(v:Vehicle)=>void;
 brands:MobileFipeOption[];brand:string;brandCode:string;onBrand:(v:string)=>void;
 models:MobileFipeOption[];model:string;modelCode:string;onModel:(v:string)=>void;
 years:MobileFipeOption[];year:string;yearCode:string;onYear:(v:string)=>void;
 km:string;onKm:(v:string)=>void;plate:string;onPlate:(v:string)=>void;
 cost:string;onCost:(v:string)=>void;
 fipe:Fipe|null;catalogLoading:boolean;catalogError:string;onRetryFipe:()=>void;
 classification:string;destination:string;
 history:MobileHistoryRecord[];historyLoading:boolean;historyError:string;
 onRefreshHistory:()=>void;onRestoreHistory:(r:MobileHistoryRecord)=>void;
 verifiedCount:number;verifiedAverage:number;verifiedCeiling:number;indexedAverage:number;
 historicalTarget:number;historicalMin:number;historicalMax:number;motorcycleReference:number;
 marketBrowseUrl:string|null;onSearchMarket:()=>void;marketBusy:boolean;marketNotice:string;
 onSave:(proposal?:NegotiatedProposal,suggested?:number,source?:'mesa'|'verified'|'historical'|'missing')=>void;saveBusy:boolean;saveNotice:string;saveError:string;onOpenFullDesk:()=>void;
 onStartNew:()=>boolean;onOpenApprovals:()=>void;onQuickQuote:()=>void;onOpenAqua:()=>void;onOpenPlateHistory?:()=>void;
 resetAfterSaveSignal?:number;
};
type Tab='home'|'pricing'|'history'|'stock'|'repasse'|'settings';
const cash=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const number=(v:number)=>v.toLocaleString('pt-BR');
const parseOffer=(v:string)=>Number(v.replace(/R\$|\s/g,'').replace(/\./g,'').replace(',','.'));
const clean=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const input='w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100';
const card='rounded-[24px] border border-slate-200 bg-white shadow-sm';
const action='flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0089cd] px-5 py-4 text-base font-bold text-white disabled:opacity-40';
const row='flex w-full items-center justify-between gap-3 border-b border-slate-100 py-4 text-left last:border-0';
const fuels:MobileFuel[]=['Flex','Gasolina','Diesel','Etanol','Híbrido','Elétrico'];
const thisYear=new Date().getFullYear();
const selectableYears=Array.from({length:32},(_,i)=>thisYear+1-i);
export default function MarketIqMobileExperience(p:Props){
 const [tab,setTab]=useState<Tab>('home'),[step,setStep]=useState(1),[result,setResult]=useState(false);
 const [pickedYear,setPickedYear]=useState(()=>mobileModelYearFromCode(p.yearCode,p.year));
 const [pickedFuel,setPickedFuel]=useState<MobileFuel|''>('');
 const [query,setQuery]=useState(''),[brandSearch,setBrandSearch]=useState(''),[modelSearch,setModelSearch]=useState('');
 const [quickQuery,setQuickQuery]=useState(''),[quickMode,setQuickMode]=useState(false);
 const [quickType,setQuickType]=useState<Vehicle>('car');
 const [quickError,setQuickError]=useState('');
 const [stockQuery,setStockQuery]=useState(''),[message,setMessage]=useState('');
 const [offerEdit,setOfferEdit]=useState(false),[offerAmount,setOfferAmount]=useState('');
 const [offerManager,setOfferManager]=useState(''),[offerReason,setOfferReason]=useState('');
 const [offerVehicleKey,setOfferVehicleKey]=useState(''),[offerError,setOfferError]=useState('');
 const [stock,setStock]=useState<OperationalStockItem[]>([]),[stockBusy,setStockBusy]=useState(false),[stockError,setStockError]=useState('');
 const searchInputRef=useRef<HTMLInputElement|null>(null);
 const quickInputRef=useRef<HTMLInputElement|null>(null);
 const speechRef=useRef<any>(null);
 const speechTranscriptRef=useRef('');
 const voiceManualStopRef=useRef(false);
 const [voiceOpen,setVoiceOpen]=useState(false);
 const [voiceTranscript,setVoiceTranscript]=useState('');
 const [voiceState,setVoiceState]=useState<'idle'|'listening'|'processing'|'fallback'|'heard'>('idle');
 const [voiceHint,setVoiceHint]=useState('');
 const [voiceSpeechDetected,setVoiceSpeechDetected]=useState(false);
 const [pwaInstallAvailable,setPwaInstallAvailable]=useState(canPromptMotyqInstall);
 const [pwaInstalled,setPwaInstalled]=useState(isStandaloneMotyq);
 const [pwaInstallInfo,setPwaInstallInfo]=useState('');
 useEffect(()=>subscribeMotyqInstall(()=>{
  setPwaInstallAvailable(canPromptMotyqInstall());
  setPwaInstalled(isStandaloneMotyq());
 }),[]);
 const installMotyq=async()=>{
  if(isStandaloneMotyq()){setPwaInstallInfo('O Motyq IQ já está instalado neste aparelho.');return;}
  if(!canPromptMotyqInstall()){
   setPwaInstallInfo('No Google Chrome do Android, abra o menu ⋮ e escolha Instalar aplicativo ou Adicionar à tela inicial. Se estiver dentro de outro app, abra este endereço diretamente no Chrome.');
   return;
  }
  const outcome=await promptMotyqInstall();
  setPwaInstallInfo(outcome==='accepted'?
   'Instalação solicitada. Confirme no Android e procure o ícone Motyq IQ na tela inicial.':
   outcome==='dismissed'?
    'Instalação cancelada. Você pode tentar novamente pelo menu ⋮ do Chrome.':
    'Não foi possível exibir a instalação automática. Use o menu ⋮ do Chrome e escolha Instalar aplicativo.');
 };
 useEffect(()=>()=>{try{speechRef.current?.abort?.();}catch{} speechRef.current=null;},[]);
 useEffect(()=>{
  if(!voiceOpen)return;
  const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')closeVoice();};
  window.addEventListener('keydown',closeOnEscape);
  return()=>window.removeEventListener('keydown',closeOnEscape);
 },[voiceOpen]);
 const canStock=dmsPermissions(p.user).stockView;
 const matchingYears=useMemo(()=>mobileYearOptions(p.years,pickedYear,pickedFuel),[p.years,pickedYear,pickedFuel]);
 useEffect(()=>{
  if(tab!=='pricing'||result||!p.modelCode||!p.years.length||!pickedYear||p.yearCode)return;
  const selected=mobileAutoYearChoice(p.years,pickedYear,pickedFuel);
  if(selected)p.onYear(selected.code);
 },[tab,result,p.modelCode,p.years,p.yearCode,pickedYear,pickedFuel,p.onYear]);
 const historyMatches=useMemo(()=>mobileHistorySearch(p.history,query),[p.history,query]);
 const recent=useMemo(()=>[...p.history].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5),[p.history]);
 const brands=useMemo(()=>{
  const priority=['chevrolet','volkswagen','fiat','ford','honda','toyota','peugeot','nissan','hyundai'];
  return [...p.brands].filter(v=>clean(v.name).includes(clean(brandSearch))).sort((a,b)=>{
   const ai=priority.indexOf(clean(a.name)),bi=priority.indexOf(clean(b.name));
   return (ai<0?50:ai)-(bi<0?50:bi)||a.name.localeCompare(b.name,'pt-BR');
  });
 },[p.brands,brandSearch]);
 const quickIntent=useMemo(()=>mobileQuickIntent(quickQuery,p.brands),[quickQuery,p.brands]);
 const models=useMemo(()=>mobileFilterModels(p.models,modelSearch,pickedFuel),
  [p.models,modelSearch,pickedFuel]);
 const possibleYears=useMemo(()=>[...new Set(p.years.map(y=>mobileModelYearFromCode(y.code,y.name)).filter(y=>y>0))]
   .sort((a,b)=>b-a),[p.years]);
 const mileage=Number(p.km.replace(/\D/g,''))||0;
 const validPlate=/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p.plate);
 const currentVehicle={plate:p.plate,brand:p.brand,model:p.model,
  modelYear:Number(p.fipe?.year||String(p.year).match(/(?:19|20)\d{2}/)?.[0]||0),
  km:mileage,fipe:p.fipe?.value||0,vehicleType:p.vehicleType};
 const [mesaReference,setMesaReference]=useState<MesaPriceReference|null>(null);
 const onMesaReference=useCallback((candidate:MesaPriceReference|null)=>{
  setMesaReference(previous=>previous?.key===candidate?.key&&previous?.value===candidate?.value&&
   previous?.count===candidate?.count?previous:candidate);
 },[]);
 const scopedMesa=mesaReference?.key===mesaReferenceKey(currentVehicle,p.user.companyId||'abrao-reze')?
  mesaReference:null;
 const selectedPrice=mobilePriceSource({fipe:p.fipe?.value||0,verifiedCount:p.verifiedCount,
  verifiedCeiling:p.verifiedCeiling,historicalTarget:p.vehicleType==='motorcycle'?p.motorcycleReference:p.historicalTarget,
  indexedReference:p.indexedAverage,mesaReference:scopedMesa?.value||0,mesaCount:scopedMesa?.count||0});
 const baseOfferKey=mesaReferenceKey(currentVehicle,p.user.companyId||'abrao-reze')+'|'+selectedPrice.value;
 const offerActive=offerEdit&&offerVehicleKey===baseOfferKey;
 const proposedAmount=offerActive?parseOffer(offerAmount):selectedPrice.value;
 const startOfferEdit=()=>{
  if(offerActive){setOfferEdit(false);setOfferError('');return;}
  setOfferVehicleKey(baseOfferKey);setOfferAmount(selectedPrice.value.toFixed(2).replace('.',','));
  setOfferManager('');setOfferReason('');setOfferError('');setOfferEdit(true);
 };
 const adjustOfferBy=(difference:number)=>{
  const updated=Math.max(0,Math.round(((Number.isFinite(proposedAmount)?proposedAmount:selectedPrice.value)+difference)*100)/100);
  setOfferAmount(updated.toFixed(2).replace('.',','));setOfferError('');
 };
 const saveProposal=()=>{
  if(!offerActive||proposedAmount===selectedPrice.value){p.onSave(undefined,selectedPrice.value,selectedPrice.kind);return;}
  if(!Number.isFinite(proposedAmount)||proposedAmount<1500||proposedAmount>2000000){
   setOfferError('Informe um valor válido, de R$ 1.500 até R$ 2 milhões.');return;
  }
  if(offerManager.trim().length<2||offerReason.trim().length<6){
   setOfferError('Informe o gerente solicitante e o motivo do ajuste (mínimo 6 caracteres).');return;
  }
  setOfferError('');
  p.onSave({negotiatedOffer:Math.round(proposedAmount*100)/100,
   baseSuggestion:selectedPrice.value,requestedByManager:offerManager.trim(),
   negotiationReason:offerReason.trim()},selectedPrice.value,selectedPrice.kind);
 };
 useEffect(()=>{
  if(tab!=='stock'||!canStock)return;
  let live=true;setStockBusy(true);setStockError('');
  currentStockService.getCurrent(companyIdForUser(p.user),storeIdForUser(p.user))
   .then(rows=>{if(live)setStock(rows);})
   .catch(()=>{if(live)setStockError('Não foi possível abrir o estoque autorizado.');})
   .finally(()=>{if(live)setStockBusy(false);});
  return()=>{live=false;};
 },[tab,canStock,p.user.companyId,p.user.storeId,p.user.email]);
 const changeTab=(v:Tab)=>{
  if(speechRef.current){const active=speechRef.current;speechRef.current=null;try{active.abort();}catch{}}
  voiceManualStopRef.current=false;speechTranscriptRef.current='';
  setVoiceOpen(false);setVoiceTranscript('');setVoiceState('idle');setVoiceSpeechDetected(false);setVoiceHint('');
  setTab(v);setMessage('');window.scrollTo({top:0,behavior:'smooth'});
 };
 const newValuation=()=>{if(!p.onStartNew())return;setResult(false);setQuickMode(false);setStep(1);setPickedYear(0);setPickedFuel('');setBrandSearch('');setModelSearch('');changeTab('pricing');};
 // Parent confirms evaluation and any paid-value event before requesting a
 // fresh mobile sheet. Do not reset here when saving failed or is pending.
 useEffect(()=>{
  if(!p.resetAfterSaveSignal)return;
  setResult(false);setQuickMode(false);setQuickQuery('');setQuickError('');
  setQuickType('car');setStep(1);setPickedYear(0);setPickedFuel('');
  setBrandSearch('');setModelSearch('');setQuery('');
  setOfferEdit(false);setOfferAmount('');setOfferManager('');
  setOfferReason('');setOfferVehicleKey('');setOfferError('');
  changeTab('pricing');
 },[p.resetAfterSaveSignal]);

 const startQuickSearch=(term:string=quickQuery)=>{
  if(!term.trim()){setQuickError('Digite um modelo ou uma versão para buscar.');return;}
  const sameVehicleType=quickType===p.vehicleType;
  const intent=mobileQuickIntent(term,sameVehicleType?p.brands:[]);
  if(!p.onStartNew())return;
  if(!sameVehicleType)p.onVehicleType(quickType);
  setQuickQuery(term);setQuickError('');setResult(false);setQuickMode(true);setStep(5);
  setPickedYear(intent.hasYear?intent.year:0);setPickedFuel('');setModelSearch(intent.modelSearch);
  setBrandSearch('');p.onYear('');
  if(intent.brand)p.onBrand(intent.brand.code);
  changeTab('pricing');
 };
 const selectMobileModel=(item:MobileFipeOption)=>{
  p.onModel(item.code);
  if(quickMode){const detected=mobileFuelFromModel(item.name);if(detected)setPickedFuel(detected);}
 };
 const restore=(r:MobileHistoryRecord)=>{p.onRestoreHistory(r);setPickedYear(mobileModelYearFromCode('',r.year));setQuickMode(false);setStep(5);setResult(true);changeTab('pricing');};
 const closeVoice=()=>{
  const active=speechRef.current;speechRef.current=null;
  try{active?.abort?.();}catch{}
  voiceManualStopRef.current=false;speechTranscriptRef.current='';
  setVoiceOpen(false);setVoiceState('idle');setVoiceSpeechDetected(false);setVoiceHint('');setVoiceTranscript('');
 };
 const useKeyboardDictation=()=>{
  closeVoice();
  setQuickError('Se preferir, use o microfone do teclado para ditar a busca.');
  quickInputRef.current?.focus();
 };
 const runVoiceSearch=(raw:string)=>{
  const transcript=mobileSpeechToSearch(raw);
  if(!transcript){setVoiceState('fallback');setVoiceHint('Não ouvi um veículo. Tente falar novamente.');return;}
  setVoiceTranscript(transcript);setQuickQuery(transcript);
  // A recognized plate opens the history search; a model opens the FIPE catalog.
  if(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(transcript)){
   setQuery(transcript);closeVoice();return;
  }
  startQuickSearch(transcript);
 };
 const voice=()=>{
  // The central orb doubles as the stop/confirm control.
  if(speechRef.current){
   voiceManualStopRef.current=true;
   setVoiceState('processing');
   setVoiceHint('Concluindo o reconhecimento para buscar as versões FIPE...');
   try{speechRef.current.stop();}catch{
    speechRef.current=null;setVoiceState(speechTranscriptRef.current?'heard':'fallback');
   }
   return;
  }
  setVoiceOpen(true);setVoiceTranscript('');setVoiceSpeechDetected(false);speechTranscriptRef.current='';voiceManualStopRef.current=false;
  const Recognizer=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
  if(!window.isSecureContext||!Recognizer){
   setVoiceState('fallback');
   setVoiceHint('Este navegador não permite reconhecimento de voz. Abra no Chrome ou use o microfone do teclado.');
   return;
  }
  try{
   const r=new Recognizer();
   let failed=false;
   r.lang='pt-BR';r.continuous=false;r.interimResults=true;r.maxAlternatives=1;
   r.onstart=()=>{
    if(speechRef.current!==r)return;
    setVoiceState('listening');setVoiceHint('Estou ouvindo. Fale o veículo e toque no círculo para buscar.');
   };
   r.onspeechstart=()=>{
    if(speechRef.current!==r)return;
    setVoiceSpeechDetected(true);
    setVoiceHint('Detectei sua fala. Toque no círculo para fazer a busca.');
   };
   r.onspeechend=()=>{
    if(speechRef.current!==r)return;
    setVoiceSpeechDetected(false);
   };
   r.onresult=(event:any)=>{
    if(speechRef.current!==r)return;
    const results=event?.results;
    if(!results?.length)return;
    const transcript=mobileSpeechToSearch(results[results.length-1]?.[0]?.transcript);
    if(!transcript)return;
    speechTranscriptRef.current=transcript;setVoiceTranscript(transcript);setVoiceSpeechDetected(true);
    if(!voiceManualStopRef.current){
     setVoiceState('listening');setVoiceHint('Entendi. Toque no círculo para buscar.');
    }
   };
   r.onerror=(event:any)=>{
    if(speechRef.current!==r)return;
    failed=true;
    // Release the recognition session promptly, so Retry starts a fresh attempt.
    speechRef.current=null;setVoiceSpeechDetected(false);
    try{r.abort();}catch{}
    const feedback=speechErrorFeedback(event?.error);
    setVoiceState('fallback');setVoiceHint(feedback.message);
   };
   r.onend=()=>{
    if(speechRef.current!==r)return;
    speechRef.current=null;setVoiceSpeechDetected(false);
    if(failed)return;
    const transcript=speechTranscriptRef.current;
    if(!transcript){
     setVoiceState('fallback');setVoiceHint('O reconhecimento terminou sem retornar palavras. Tente novamente falando mais perto do celular ou use o microfone do teclado.');
    }else if(voiceManualStopRef.current){
     runVoiceSearch(transcript);
    }else{
     setVoiceState('heard');
     setVoiceHint('Confirme a busca ou toque novamente para falar.');
    }
    voiceManualStopRef.current=false;
   };
   speechRef.current=r;
   setVoiceState('listening');
   setVoiceHint('Ativando o microfone. Autorize o acesso quando o navegador solicitar.');
   r.start();
  }catch{
   speechRef.current=null;setVoiceSpeechDetected(false);
   setVoiceState('fallback');
   setVoiceHint('Não foi possível iniciar. Tente no Chrome ou use o microfone do teclado.');
  }
 };
 const share=async()=>{
  const info=['Motyq IQ · Prévia de avaliação',p.brand+' '+p.model+' '+(p.fipe?.year||pickedYear),
   number(mileage)+' km',p.fipe?.value?'FIPE: '+cash(p.fipe.value):'FIPE indisponível',
   selectedPrice.value?selectedPrice.label+': '+cash(selectedPrice.value):'Sem referência suficiente',
   'Estimativa sujeita a vistoria, conferência de mercado e aprovação.'].join('\n');
  try{
   if(navigator.share)await navigator.share({title:'Motyq IQ · Avaliação',text:info});
   else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(info);setMessage('Resumo copiado.');}
   else setMessage('Compartilhamento indisponível neste navegador.');
  }catch(e:any){if(e?.name!=='AbortError')setMessage('Não foi possível compartilhar.');}
 };
 const pageTitle=tab==='home'?'Início':tab==='pricing'?'Precificar':tab==='history'?'Histórico':tab==='stock'?'Estoque':tab==='repasse'?'Repasse':'Ajustes';
 return <div className="min-h-[100dvh] bg-[#f6f9fc] font-sans text-[#1f2c42]">
  <div className="mx-auto max-w-[540px] px-4 pb-28 pt-5">
   {tab==='pricing'&&!result?<div className="mb-6 flex items-center justify-between">
    <button type="button" onClick={()=>quickMode?changeTab('home'):step>1?setStep(step-1):changeTab('home')} aria-label="Voltar"
     className="flex h-11 w-11 items-center justify-center rounded-xl bg-white"><ArrowLeft size={20}/></button>
    <div className="text-center"><strong className="text-lg">{quickMode?'Busca rápida':'Nova avaliação'}</strong><p className="text-xs text-slate-500">{quickMode?'Selecione a versão FIPE':'Passo '+step+' de 5'}</p></div>
    <button type="button" onClick={()=>changeTab('home')} aria-label="Fechar" className="h-11 w-11 rounded-xl bg-white text-xl">×</button>
   </div>:<header className="mb-6">
    <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-[#008bd0]">MOTYQ IQ · MOBILE</p>
    <h1 className="mt-1 text-[28px] font-extrabold">{pageTitle}</h1>
   </header>}
   {tab==='home'&&<div className="space-y-6">
    <div><p className="text-sm text-slate-500">Bem-vindo à sua Mesa</p><h2 className="mt-1 text-2xl font-extrabold">O que vamos avaliar hoje?</h2></div>
    <div className={card+' space-y-3 p-4'}>
     <label htmlFor="motyq-quick-search" className="block text-sm font-bold text-slate-800">Busca rápida de veículo</label>
     <p className="text-xs text-slate-600">Digite o modelo, versão e ano. Ex.: Compass Longitude 2025.</p>
     <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de veículo para busca rápida">
      {([['car','Carro'],['motorcycle','Moto']] as const).map(([kind,label])=>
       <button key={kind} type="button" aria-pressed={quickType===kind}
        className={'rounded-xl border px-3 py-3 text-sm font-bold '+(quickType===kind?
         'border-sky-500 bg-sky-50 text-sky-900':'border-slate-200 bg-white text-slate-700')}
        onClick={()=>setQuickType(kind)}>{label}</button>)}
     </div>
     <div className="relative">
      <Search size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#008bd0]"/>
      <input id="motyq-quick-search" ref={quickInputRef} className={input+' pl-11'} value={quickQuery}
       onChange={e=>{setQuickQuery(e.target.value);setQuickError('');}}
       onKeyDown={e=>{if(e.key==='Enter')startQuickSearch();}}
       placeholder="Compass Longitude 2025" autoComplete="off"/>
     </div>
     {quickError&&<p role="alert" className="text-xs font-bold text-rose-700">{quickError}</p>}
     <button type="button" className={action} onClick={()=>startQuickSearch()}
      disabled={!quickQuery.trim()}>Buscar versões FIPE <ArrowRight size={18}/></button>
     <button type="button" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-sky-800"
      onClick={newValuation}>Prefiro escolher passo a passo</button>
    </div>
    <div className={card+' p-4'}>
     <label htmlFor="mobile-history-search" className="block pb-2 text-xs font-bold text-slate-600">Buscar no histórico</label>
     <div className="relative"><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#008bd0]"/>
      <input id="mobile-history-search" ref={searchInputRef} className={input+' pl-11'} value={query} onChange={e=>setQuery(e.target.value)}
       placeholder="Ex.: Tracker 2023 ou ABC1D23"/></div>
     {query.trim()&&<div className="mt-2">{historyMatches.slice(0,5).map(r=><button key={r.id} className={row} onClick={()=>restore(r)}>
      <span className="text-sm font-semibold">{r.brand} {r.model} <small className="block text-xs text-slate-500">{r.plate||'Sem placa'} · {r.year}</small></span><ChevronRight size={17}/></button>)}
      {!historyMatches.length&&<p className="py-3 text-xs text-slate-500">Não encontramos essa avaliação no histórico.</p>}</div>}
     <button className={action+' mt-4'} onClick={newValuation}><CarFront size={20}/> Nova precificação <ArrowRight size={18}/></button>
    </div>
    <div className="grid grid-cols-3 gap-2">
     <button className={card+' flex min-h-[100px] flex-col items-center justify-center gap-2 p-2 text-xs font-bold'} onClick={()=>changeTab('history')}>
      <History size={25} color="#008bd0"/> Buscar por placa</button>
     <button type="button" aria-haspopup="dialog"
      className={card+' flex min-h-[100px] flex-col items-center justify-center gap-2 p-2 text-xs font-bold'} onClick={voice}>
      <Mic size={25} color="#008bd0"/> Buscar por voz</button>
     <button className={card+' flex min-h-[100px] flex-col items-center justify-center gap-2 p-2 text-xs font-bold'} onClick={newValuation}>
      <CarFront size={25} color="#008bd0"/> Escolher na lista</button>
    </div>
    <div><div className="mb-2 flex justify-between"><h2 className="text-base font-extrabold">Últimas avaliações</h2>
      <button className="text-xs font-bold text-[#008bd0]" onClick={()=>changeTab('history')}>Ver todas</button></div>
     {p.historyLoading&&<p className="text-sm text-slate-500">Carregando histórico...</p>}
     {!p.historyLoading&&!recent.length&&<p className={card+' p-4 text-sm text-slate-500'}>Nenhuma avaliação encontrada nesta unidade.</p>}
     {recent.map(r=><button key={r.id} className={row} onClick={()=>restore(r)}>
      <span className="min-w-0"><strong className="block truncate text-sm">{r.brand} {r.model}</strong>
       <span className="text-xs text-slate-500">{r.year} · {r.km} km · {r.plate||'Sem placa'}</span>
       <small className="block text-[11px] text-slate-500">{r.provisional?'Estimativa preliminar':'Avaliação salva'}</small></span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-[#008bd0]">{r.value>0?cash(r.value):'—'}<ChevronRight size={15}/></span>
     </button>)}
    </div>
    <div className="rounded-2xl border border-sky-100 bg-[#e9f5fd] p-4">
     <p className="flex items-center gap-2 text-sm font-extrabold text-[#0078b9]"><ShieldCheck size={18}/> Decisão com histórico</p>
     <p className="mt-2 text-xs leading-5 text-slate-600">FIPE, anúncios conferidos, compras reais registradas e classificação do Grupo Abrão Reze reunidos na mesma Mesa.</p>
    </div>
   </div>}
   {tab==='pricing'&&!result&&<div className="space-y-5">
    {!quickMode&&<div className="grid grid-cols-5 gap-1.5" aria-label={'Passo '+step+' de 5'}>
     {[1,2,3,4,5].map(n=><span key={n} className={'h-1.5 rounded-full '+(n<=step?'bg-[#008bd0]':'bg-slate-200')}/>)}</div>}
    {step>1&&<div className="flex flex-wrap gap-2 text-xs font-semibold">
     <span className="rounded-full bg-white px-3 py-2">{p.vehicleType==='car'?'Carro':'Moto'}</span>
     {p.brand&&<span className="rounded-full bg-white px-3 py-2">{p.brand}</span>}
     {pickedYear>0&&<span className="rounded-full bg-white px-3 py-2">{pickedYear}</span>}
     {pickedFuel&&<span className="rounded-full bg-white px-3 py-2">{pickedFuel}</span>}
    </div>}
    {!quickMode&&step===1&&<><h2 className="text-[26px] font-extrabold">É carro ou moto?</h2>
     <button className={card+' flex min-h-[170px] w-full flex-col items-center justify-center gap-3'} onClick={()=>{p.onVehicleType('motorcycle');setStep(2);}}>
      <Bike size={48} color="#008bd0"/><strong className="text-2xl">Moto</strong><span className="text-sm text-slate-400">Motos e scooters</span></button>
     <button className={card+' flex min-h-[170px] w-full flex-col items-center justify-center gap-3'} onClick={()=>{p.onVehicleType('car');setStep(2);}}>
      <CarFront size={48} color="#008bd0"/><strong className="text-2xl">Carro</strong><span className="text-sm text-slate-400">Inclui picapes e SUVs</span></button></>}
    {!quickMode&&step===2&&<><h2 className="text-[26px] font-extrabold">Qual a marca?</h2>
     <input className={input} value={brandSearch} onChange={e=>setBrandSearch(e.target.value)} placeholder="Buscar marca"/>
     <p className="text-xs text-slate-400">Marcas disponíveis na FIPE</p>
     {p.catalogLoading&&!p.brands.length&&<p className="text-sm text-slate-500">Carregando marcas...</p>}
     <div className={card+' max-h-[58dvh] overflow-y-auto px-4'}>{brands.slice(0,55).map(brand=>
      <button key={brand.code} className={row} onClick={()=>{p.onBrand(brand.code);setStep(3);}}>
       <span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 font-black text-[#008bd0]">{brand.name.slice(0,2).toUpperCase()}</span>
        <strong className="text-base">{brand.name}</strong></span><ChevronRight size={18}/></button>)}</div></>}
    {!quickMode&&step===3&&<><h2 className="text-[26px] font-extrabold">Qual o ano-modelo?</h2>
     <input className={input} inputMode="numeric" placeholder="Ex.: 2023" aria-label="Buscar ano"
      value={pickedYear||''} onChange={e=>setPickedYear(Number(e.target.value.replace(/\D/g,'').slice(0,4))||0)}/>
     <div className="grid grid-cols-3 gap-2">
      {selectableYears.filter(y=>!pickedYear||String(y).includes(String(pickedYear))).slice(0,21).map(y=>
       <button key={y} className="rounded-2xl border border-slate-200 bg-white p-4 text-lg font-bold"
        onClick={()=>{setPickedYear(y);p.onYear('');setStep(4);}}>{y}</button>)}</div>
     {pickedYear>=1990&&pickedYear<=thisYear+2&&<button className={action}
      onClick={()=>{p.onYear('');setStep(4);}}>Continuar com {pickedYear}<ArrowRight size={18}/></button>}
     <p className="text-xs text-slate-500">Use o segundo ano do documento, não o de fabricação.</p></>}
    {!quickMode&&step===4&&<><h2 className="text-[26px] font-extrabold">Qual é o combustível?</h2>
     <p className="text-sm text-slate-500">Selecione o combustível do documento.</p>
     <div className={card+' px-4'}>{fuels.map(f=><button key={f} className={row}
      onClick={()=>{setPickedFuel(f);setStep(5);}}><strong className="text-lg">{f}</strong><ChevronRight size={18}/></button>)}</div></>}
    {(step===5||quickMode)&&<>
     <h2 className="text-[24px] font-extrabold">{quickMode?'Escolha a versão correta':'Qual é o modelo e a versão?'}</h2>
     <p className="text-sm leading-5 text-slate-600">
      {quickMode?'Busca rápida com catálogo FIPE. Confirme a versão e o ano/modelo.':
       'Apenas versões compatíveis com o combustível selecionado.'}
     </p>
     {quickMode&&<div className={card+' flex items-center justify-between gap-3 p-3'}>
      <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{quickQuery}</p>
       <p className="text-xs text-slate-600">
        {p.brand||'Marca a selecionar'} · {pickedYear||'Ano a selecionar'}
       </p></div>
      <button type="button" className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-sky-800"
       onClick={()=>changeTab('home')}>Editar busca</button>
     </div>}
     {quickMode&&!p.brandCode&&<div className={card+' space-y-2 p-4'}>
      <p className="text-sm font-bold">Qual é a marca?</p>
      <input className={input} value={brandSearch} placeholder="Buscar marca" onChange={e=>setBrandSearch(e.target.value)}/>
      <div className="max-h-52 overflow-y-auto">
       {brands.slice(0,45).map(b=><button key={b.code} type="button" className={row}
        onClick={()=>{p.onBrand(b.code);setBrandSearch('');}}>
        <span className="text-sm font-semibold">{b.name}</span><ChevronRight size={17}/></button>)}
      </div>
      {p.catalogLoading&&<p className="text-xs text-slate-600">Carregando marcas FIPE...</p>}
     </div>}
     {quickMode&&p.brandCode&&<button type="button"
      className="text-left text-xs font-bold text-[#0078b9]"
      onClick={()=>{p.onBrand('');setBrandSearch('');}}>
      Trocar marca: {p.brand}
     </button>}
     {(!quickMode||p.brandCode)&&<>
      {!quickMode?
       <input className={input} value={modelSearch} onChange={e=>setModelSearch(e.target.value)}
        placeholder="Buscar modelo e versão" aria-label="Buscar modelo e versão"/>:
       <input className={input} value={modelSearch} onChange={e=>setModelSearch(e.target.value)}
        placeholder="Digite ou ajuste modelo e versão"
        aria-label="Refinar busca rápida de modelo"/>}
      <p className="text-xs font-medium text-slate-600" role="status" aria-live="polite">
       {p.catalogLoading&&!p.models.length?'Consultando versões da FIPE...':
        models.length+' versão(ões) compatíveis na lista'}
       {pickedFuel?' · '+pickedFuel:''}
      </p>
      <div className={card+' max-h-[43dvh] overflow-y-auto px-4'} aria-label="Versões disponíveis na FIPE">
       {models.slice(0,70).map(m=><button type="button" key={m.code}
        className={row+' '+(p.modelCode===m.code?'bg-sky-50':'')}
        onClick={()=>selectMobileModel(m)}>
        <span className="min-w-0 flex-1">
         <strong className="block text-[14px] leading-5 text-slate-900">{m.name}</strong>
         <span className="mt-1 flex flex-wrap gap-1">
          {mobileFuelFromModel(m.name)&&<span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-700">
           {mobileFuelFromModel(m.name)}</span>}
          {/AUT|AT6|AT8|CVT|DSG/i.test(m.name)&&<span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-700">Automático</span>}
          {/MANUAL|MECANICO|MECÂNICO|\bMT\b/i.test(m.name)&&<span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-700">Manual</span>}
          {/4X4/i.test(m.name)&&<span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-700">4x4</span>}
         </span>
        </span>
        {p.modelCode===m.code?<CheckCircle2 size={22} color="#008bd0"/>:<ChevronRight size={20} className="shrink-0 text-slate-500"/>}
       </button>)}
       {!p.models.length&&<div className="space-y-3 py-4">
        <p className="text-sm text-slate-600">
         {p.catalogLoading?'Carregando versões desta marca...':
          'Não foi possível listar as versões desta marca. Tente carregar novamente.'}
        </p>
        {!p.catalogLoading&&<button type="button" onClick={p.onRetryFipe}
         className="rounded-xl border border-sky-600 bg-white px-3 py-3 text-sm font-bold text-sky-800">
         Atualizar catálogo FIPE
        </button>}
       </div>}
       {p.models.length>0&&models.length===0&&<p className="py-4 text-sm text-amber-900">
        Nenhuma versão compatível. Confira a busca e o combustível antes de continuar.
       </p>}
      </div>
     </>}
     {p.modelCode&&<div className={card+' space-y-3 p-4'}>
      <p className="text-sm font-bold text-slate-900">Versão selecionada</p>
      <p className="text-sm leading-5 text-slate-700">{p.model}</p>
      {quickMode&&!pickedYear&&<>
       <p className="text-sm font-bold">Qual o ano/modelo?</p>
       <div className="grid grid-cols-3 gap-2">{possibleYears.slice(0,18).map(y=>
        <button type="button" key={y} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold"
         onClick={()=>{setPickedYear(y);p.onYear('');}}>{y}</button>)}</div>
       {!possibleYears.length&&<p className="text-xs text-slate-600">Carregando anos da FIPE...</p>}
      </>}
      {pickedYear>0&&<>
       <p className="text-sm font-bold text-slate-800">Ano/modelo FIPE: {pickedYear}</p>
       {!p.years.length&&<p className="text-xs text-slate-600">Consultando ano e combustível da versão...</p>}
       {p.years.length>0&&!matchingYears.yearMatched&&<p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
        Essa versão não possui ano/modelo {pickedYear} na FIPE. Selecione outra versão ou confira o ano.
       </p>}
       {matchingYears.yearMatched&&pickedFuel&&!matchingYears.fuelMatched&&<p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900">
        Não foi possível confirmar {pickedFuel} nessa versão. Escolha outra versão ou confira o combustível.
       </p>}
       {matchingYears.yearMatched&&(!pickedFuel||matchingYears.fuelMatched)&&matchingYears.choices.length===1&&
        <p className="rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-900">
         {p.yearCode===matchingYears.choices[0].code?
          'FIPE selecionada automaticamente: '+matchingYears.choices[0].name:
          'Confirmando FIPE: '+matchingYears.choices[0].name+'...'}
        </p>}
       {matchingYears.yearMatched&&(!pickedFuel||matchingYears.fuelMatched)&&matchingYears.choices.length>1&&<>
        <p className="text-xs font-bold text-slate-800">Confirme uma opção da FIPE</p>
        <div className="grid gap-2">{matchingYears.choices.map(y=>
         <button type="button" key={y.code}
          className={'rounded-xl border px-3 py-3 text-left text-sm font-bold '+(p.yearCode===y.code?
           'border-sky-500 bg-sky-50 text-sky-900':'border-slate-300 bg-white text-slate-800')}
          onClick={()=>p.onYear(y.code)}>{y.name} {p.yearCode===y.code?'✓':''}</button>)}</div>
       </>}
      </>}
      {quickMode&&pickedYear>0&&<button type="button" className="text-xs font-bold text-sky-800"
       onClick={()=>{setPickedYear(0);p.onYear('');}}>Alterar ano/modelo</button>}
     </div>}
     <div className={card+' space-y-4 p-4'}>
      <label className="block text-sm font-bold">Quilometragem<input inputMode="numeric"
       className={input+' mt-2'} placeholder="Ex.: 57.000" value={p.km}
       onChange={e=>p.onKm(e.target.value.replace(/[^\d.]/g,'').slice(0,9))}/></label>
      <label className="block text-sm font-bold">Placa<input className={input+' mt-2 uppercase'}
       value={p.plate} placeholder="ABC1D23" maxLength={7}
       onChange={e=>p.onPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7))}/></label>
      <label className="block text-sm font-bold">Preparação prevista (R$)<input
       inputMode="decimal" className={input+' mt-2'} value={p.cost}
       onChange={e=>p.onCost(e.target.value)}/></label>
     </div>
     {p.catalogError&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{p.catalogError}
      <button onClick={p.onRetryFipe} className="ml-2 font-bold underline">Tentar novamente</button></p>}
     <button className={action} disabled={!p.modelCode||!p.yearCode||mileage<=0||p.catalogLoading}
      onClick={()=>{setResult(true);window.scrollTo({top:0,behavior:'smooth'});}}>
      Ver avaliação <ArrowRight size={18}/></button>
    </>}
   </div>}
   {tab==='pricing'&&result&&<div className="space-y-4">
    <button className="flex items-center gap-2 text-xs font-bold text-[#008bd0]"
     onClick={()=>{setResult(false);setStep(5);}}><ArrowLeft size={16}/> Editar dados do veículo</button>
    <h2 className="text-2xl font-extrabold">{p.brand} {p.model}</h2>
    <p className="text-sm text-slate-500">{p.fipe?.year||pickedYear||p.year} · {p.fipe?.fuel||pickedFuel||'Combustível a confirmar'} · {number(mileage)} km</p>
    <div className={card+' divide-y divide-slate-100 overflow-hidden'}>
     <div className="p-4"><div className="flex justify-between gap-3"><strong>Tabela FIPE</strong><strong className="text-xl">
      {p.fipe?.value?cash(p.fipe.value):'Indisponível'}</strong></div>
      <p className="mt-2 text-xs text-slate-500">{p.fipe?.referenceMonth||'Referência não confirmada'}</p>
      {p.fipe?.referenceStatus&&p.fipe.referenceStatus!=='current'&&<p className="mt-1 text-xs font-bold text-amber-800">Confira a referência mensal FIPE.</p>}
     </div>
     <div className="p-4"><div className="flex justify-between gap-3"><strong>Anúncios Webmotors</strong><strong className="text-lg">
      {p.verifiedCount>=2?cash(p.verifiedAverage):'Sem média validada'}</strong></div>
      <p className="mt-2 text-xs text-slate-500">{p.verifiedCount} anúncio(s) individuais conferidos.</p>
      {p.marketBrowseUrl&&<a href={p.marketBrowseUrl} target="_blank" rel="noopener noreferrer"
       className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#008bd0]">Abrir Webmotors <ExternalLink size={13}/></a>}
     </div>
     <div className="p-4"><p className="text-[11px] font-black uppercase tracking-wider text-[#008bd0]">
      {selectedPrice.kind==='mesa'?'Sugestão consolidada da Mesa':selectedPrice.kind==='verified'?'Anúncios conferidos':selectedPrice.kind==='historical'?'Modelo estatístico · não calibrado pela Mesa':'Referência insuficiente'}</p>
      <div className="mt-2 flex justify-between gap-3"><span className="max-w-[160px] text-sm font-extrabold">{selectedPrice.kind==='historical'?'Cálculo estatístico preliminar':selectedPrice.label}</span>
       <strong className="text-[22px] text-[#008bd0]">{selectedPrice.value?cash(selectedPrice.value):'—'}</strong></div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{selectedPrice.disclaimer}</p>
      {selectedPrice.kind==='mesa'&&<p className="mt-1 text-xs font-bold text-emerald-900">
       Referência em {scopedMesa?.count||0} veículos distintos. O modelo estatístico indicava
       {p.historicalTarget>0?' '+cash(p.historicalTarget):' um valor indisponível'}.
       Confira custos, estado do veículo e pagamentos anteriores.
      </p>}
       {selectedPrice.kind==='historical'&&<p className="mt-1 text-xs font-bold text-amber-900">
        Este valor é anterior à análise dos pagamentos e avaliações da loja. Confira a sugestão operacional e o maior valor efetivamente pago no Histórico Inteligente abaixo.
       </p>}
      {selectedPrice.kind==='historical'&&p.historicalMin>0&&p.historicalMax>0&&
       <p className="mt-1 text-xs text-slate-500">Faixa: {cash(p.historicalMin)} a {cash(p.historicalMax)}</p>}
     </div>
     <div className="p-4"><div className="flex items-center justify-between"><strong>Destino sugerido</strong>
      <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-[#008bd0]">{p.destination}</span></div>
      <p className="mt-2 text-xs text-slate-500">Classe {p.classification||'a definir'} por KM, sujeita a laudo, conservação e custos.</p></div>
    </div>
    <MarketIqIntelligentHistoryPanel compact
      companyId={p.user.companyId||'abrao-reze'}
      current={currentVehicle}
      cloudHistory={p.history}
      verifiedMarketCeiling={p.verifiedCeiling}
      historicalModelTarget={p.vehicleType==='motorcycle'?p.motorcycleReference:p.historicalTarget}
      onOpenPlateHistory={p.onOpenPlateHistory}
      onMesaReference={onMesaReference}/>
    <div className={card+' p-4'}><h3 className="text-sm font-bold">Como calculamos?</h3>
     <p className="mt-2 text-xs leading-5 text-slate-600">Tabela FIPE, anúncios individuais conferidos, custos, 14% de desconto e 5% adicionais para repasse.
     Sem amostra validada, mostramos o histórico identificado como estimativa, nunca como oferta real de lojistas.</p></div>
    {p.marketNotice&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{p.marketNotice}</p>}
    <button type="button" onClick={p.onOpenAqua}
      disabled={!p.brand.trim()||!p.model.trim()||!p.year.trim()}
      className="mb-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-700 bg-cyan-50 px-4 py-4 text-base font-black text-cyan-950 disabled:opacity-50">
      Colocar no Aquário</button>
    <button type="button" onClick={p.onQuickQuote}
      disabled={!p.brand.trim()||!p.model.trim()||!p.year.trim()}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-4 text-base font-black text-white disabled:opacity-50">
      Cotar com lojista <Share2 size={18}/></button>
    <div className="grid grid-cols-2 gap-2"><button onClick={p.onSearchMarket} disabled={p.marketBusy}
     className={card+' flex items-center justify-center gap-2 px-2 py-4 text-xs font-bold text-[#008bd0]'}>
     <RefreshCw size={16}/>{p.marketBusy?'Pesquisando...':'Busca indexada'}</button>
     <button onClick={()=>void share()} className={card+' flex items-center justify-center gap-2 px-2 py-4 text-xs font-bold text-[#008bd0]'}>
      <Share2 size={16}/> Compartilhar</button></div>
    {selectedPrice.value>0&&<div className={card+' p-4'}>
     <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-sm font-bold text-slate-950">Proposta de compra</p>
       <p className="mt-1 text-xs text-slate-600">Sugestão original: {cash(selectedPrice.value)}</p></div>
      <button type="button" onClick={startOfferEdit}
       className="rounded-xl border border-sky-600 bg-white px-3 py-2 text-sm font-bold text-sky-800">
       {offerActive?'Cancelar ajuste':'Ajustar proposta'}
      </button>
     </div>
     {offerActive&&<>
      <label className="mt-3 block text-sm font-bold text-slate-800">Nova proposta (R$)
       <input className={input+' mt-1'} inputMode="decimal" type="text" value={offerAmount}
        onChange={e=>{setOfferAmount(e.target.value);setOfferError('');}}
        placeholder="Ex.: 99.000,00"/>
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
       <button type="button" onClick={()=>adjustOfferBy(-1000)}
        className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-800">− R$ 1.000</button>
       <button type="button" onClick={()=>adjustOfferBy(1000)}
        className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-800">+ R$ 1.000</button>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-800">Diferença: {Number.isFinite(proposedAmount)?
       (proposedAmount>=selectedPrice.value?'+ ':'− ')+cash(Math.abs(proposedAmount-selectedPrice.value)):
       'Informe um valor válido'}</p>
      {proposedAmount!==selectedPrice.value&&<>
       <label className="mt-3 block text-xs font-semibold text-slate-700">Gerente solicitante
        <input className={input+' mt-1'} value={offerManager}
         onChange={e=>setOfferManager(e.target.value)} maxLength={100}
         placeholder="Nome do gerente"/>
       </label>
       <label className="mt-3 block text-xs font-semibold text-slate-700">Motivo do ajuste
        <textarea className={input+' mt-1'} value={offerReason}
         onChange={e=>setOfferReason(e.target.value)} maxLength={280} rows={2}
         placeholder="Ex.: Gerente solicitou + R$ 1.000 para viabilizar a negociação."/>
       </label>
       <p className="mt-2 text-xs leading-5 text-amber-900">
        Será salva uma proposta ajustada, não uma compra. O nome do gerente é informado pelo operador,
        sem comprovação de aprovação digital.
       </p>
      </>}
      {offerError&&<p role="alert" className="mt-2 rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-800">{offerError}</p>}
     </>}
    </div>}
    <button className={action} style={{color:'#ffffff'}} onClick={saveProposal} disabled={p.saveBusy||!validPlate||!p.fipe?.value}>
     <Save size={18}/>{p.saveBusy?'Salvando...':offerActive&&proposedAmount!==selectedPrice.value?'Salvar proposta ajustada':'Salvar avaliação no histórico'}</button>
    {!validPlate&&<p className="text-xs text-amber-800">Preencha uma placa válida para salvar.</p>}
    {p.saveError&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800">{p.saveError}</p>}
    {p.saveNotice&&<p role="status" className="rounded-xl bg-sky-50 p-3 text-xs text-sky-900">{p.saveNotice}</p>}
   </div>}
   {tab==='pricing'&&p.saveNotice.includes('Ficha limpa e pronta para a próxima avaliação.')&&
    <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-950">{p.saveNotice}</p>}
   {tab==='history'&&<div className="space-y-3">
    <input className={input} placeholder="Buscar placa, modelo ou ano" value={query} onChange={e=>setQuery(e.target.value)}/>
    <button className="flex items-center gap-2 text-xs font-bold text-[#008bd0]" onClick={p.onRefreshHistory}><RefreshCw size={16}/> Atualizar histórico</button>
    {p.historyError&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{p.historyError}</p>}
    {p.historyLoading&&<p className="text-sm text-slate-500">Carregando avaliações autorizadas...</p>}
    <div className={card+' px-4'}>{historyMatches.slice(0,100).map(r=><button key={r.id} className={row} onClick={()=>restore(r)}>
     <span><strong className="block text-sm">{r.brand} {r.model}</strong><small className="text-slate-500">{r.year} · {r.km} km · {r.plate||'Sem placa'}</small>
     <small className="block text-slate-500">
      {r.negotiatedOffer?'Proposta gerencial · base '+cash(Number(r.baseSuggestion||r.value)):(r.provisional?'Preliminar':'Avaliação')}
      {r.negotiatedOffer?' · '+String(r.requestedByManager||'Gerente não informado'):''}
      {r.negotiatedOffer&&r.negotiationReason?' · Motivo: '+String(r.negotiationReason):''}
      {Number(r.paidValue||r.approvedValue)>0?' · compra registrada':''}
     </small></span>
     <span className="flex items-center gap-1 text-xs font-bold text-[#008bd0]">
      {(r.negotiatedOffer||r.value)?cash(Number(r.negotiatedOffer||r.value)):'—'}<ChevronRight size={15}/></span>
    </button>)}</div>
   </div>}
   {tab==='stock'&&<div className="space-y-4">
    {!canStock?<p className={card+' p-4 text-sm'}>Seu perfil não tem acesso ao estoque. As permissões do Motyq foram preservadas.</p>:<>
     <input className={input} placeholder="Buscar por placa ou veículo" value={stockQuery} onChange={e=>setStockQuery(e.target.value)}/>
     {stockBusy&&<p className="text-sm text-slate-500">Consultando estoque...</p>}
     {stockError&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{stockError}</p>}
     <div className={card+' px-4'}>{stock.filter(r=>clean(r.plate+' '+r.vehicle).includes(clean(stockQuery))).slice(0,100).map(r=>
      <div key={r.id} className={row}><span><strong className="block text-sm">{r.vehicle}</strong>
       <small className="text-slate-500">{r.plate} · {r.stockDays} dias</small></span>
       <strong className="text-xs text-[#008bd0]">{r.askingPrice?cash(r.askingPrice):'—'}</strong></div>)}</div>
    </>}
   </div>}
   {tab==='repasse'&&<div><p className="mb-4 text-sm text-slate-500">Consultas e repasses já existentes na Mesa.</p>
    <MarketIqConsultedRepasse user={p.user} vehicleFromDesk={{
     plate:p.plate,brand:p.brand,model:p.model,year:p.year,km:p.km,fipe:p.fipe?.value||0}}
     onOpenApprovals={p.onOpenApprovals}/></div>}
   {tab==='settings'&&<div className="space-y-4">
    <div className={card+' p-5'}><strong className="block text-lg">{p.user.name}</strong>
     <p className="text-sm text-slate-500">{p.user.email}</p><p className="mt-2 text-xs text-[#008bd0]">Motyq IQ · {p.user.role}</p></div>
    <div className={card+' p-5'}>
     <p className="flex items-center gap-2 text-base font-extrabold">
      <CarFront size={21} color="#008bd0"/> Motyq IQ no seu celular
     </p>
     <p className="mt-2 text-xs leading-5 text-slate-600">
      Instale um ícone na tela inicial e abra o Motyq IQ em tela própria, sem a barra do navegador.
      O aplicativo usa sua conta atual e precisa de internet para trabalhar com dados atualizados.
     </p>
     {pwaInstalled?<p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
      Motyq IQ já está aberto como aplicativo instalado.
     </p>:<button type="button" className={action+' mt-4'} onClick={()=>void installMotyq()}>
      <CarFront size={18}/>{pwaInstallAvailable?'Instalar Motyq IQ':'Como instalar Motyq IQ'}
     </button>}
     {pwaInstallInfo&&<p role="status" className="mt-3 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-slate-700">{pwaInstallInfo}</p>}
     <p className="mt-3 text-[11px] text-slate-500">No Android: Chrome → menu ⋮ → Instalar aplicativo ou Adicionar à tela inicial.</p>
    </div>
    <div className={card+' px-4'}>
     <button className={row} onClick={p.onOpenFullDesk}><span className="font-bold">Abrir Mesa completa</span><ChevronRight size={18}/></button>
     <button className={row} onClick={()=>changeTab('history')}><span className="font-bold">Histórico e consultas</span><ChevronRight size={18}/></button>
     <button className={row} onClick={()=>void signOut(auth)}><span className="flex items-center gap-2 font-bold text-rose-700"><LogOut size={17}/> Sair</span><ChevronRight size={18}/></button>
    </div>
    <p className="rounded-2xl bg-sky-50 p-4 text-xs leading-5 text-slate-600">A versão mobile utiliza o mesmo histórico, FIPE, login e permissões do Motyq. Valores não verificados nunca são apresentados como compras reais.</p>
   </div>}
   {message&&<p role="status" className="mt-4 rounded-2xl bg-sky-50 p-3 text-sm text-sky-900">{message}</p>}
  </div>
  {voiceOpen&&<div role="dialog" aria-modal="true" aria-label="Motyq IQ busca por voz"
   className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#020813]/95 bg-[radial-gradient(circle_at_50%_44%,rgba(7,62,124,0.35),rgba(2,8,19,0.98)_75%)] p-5 text-white backdrop-blur-lg">
   <div className="relative mx-auto flex w-full max-w-[420px] flex-col items-center justify-center gap-3 py-6 text-center">
    <button type="button" aria-label="Fechar busca por voz" onClick={closeVoice}
     className="absolute right-0 top-0 rounded-full border border-white/20 bg-white/10 p-3 text-white"><X size={22}/></button>
    <div className="mt-8 flex items-center gap-2 text-[11px] font-black uppercase tracking-[.27em] text-cyan-300">
     <Volume2 size={16}/> MOTYQ IQ · VOZ
    </div>
    <h2 className="text-2xl font-extrabold text-white">
     {voiceState==='listening'?'Estou ouvindo...':
      voiceState==='processing'?'Analisando sua fala...':
      voiceState==='heard'?'Entendi sua busca':'Busca por voz'}
    </h2>
    <button type="button" aria-label={voiceState==='listening'?'Parar de ouvir e buscar':
      voiceState==='heard'?'Confirmar busca por voz':'Tentar ouvir novamente'}
     onClick={()=>{
      if(voiceState==='listening')voice();
      else if(voiceState==='heard')runVoiceSearch(voiceTranscript);
      else if(voiceState==='fallback')voice();
     }}
     disabled={voiceState==='processing'}
     className="relative my-1 flex w-full max-w-[360px] items-center justify-center rounded-[38px] outline-none focus-visible:ring-4 focus-visible:ring-cyan-300 disabled:opacity-70">
     <MarketIqVoiceHologram listening={voiceState==='listening'}
      processing={voiceState==='processing'} heard={voiceState==='heard'} speechDetected={voiceSpeechDetected}/>
    </button>
    <p className="max-w-[340px] text-sm leading-6 text-cyan-100" role="status" aria-live="polite">{voiceHint}</p>
    {voiceTranscript&&<div className="w-full rounded-2xl border border-cyan-400/30 bg-white/10 p-4">
     <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-cyan-300">Reconhecido</p>
     <p className="text-lg font-bold">{voiceTranscript}</p>
    </div>}
    {voiceState==='listening'&&<p className="text-xs font-semibold text-slate-300">
     Fale: “Compass Longitude 2025” e toque no círculo para pesquisar.
    </p>}
    {voiceState==='heard'&&<div className="w-full space-y-3">
     <button type="button" className="w-full rounded-2xl bg-cyan-500 px-4 py-4 font-bold text-slate-950"
      onClick={()=>runVoiceSearch(voiceTranscript)}>Buscar versões FIPE <ArrowRight size={18} className="ml-1 inline"/></button>
     <button type="button" className="w-full rounded-2xl border border-cyan-300/40 px-4 py-3 font-semibold text-cyan-50"
      onClick={voice}>Falar novamente</button>
    </div>}
    {voiceState==='fallback'&&<div className="w-full space-y-3">
     <button type="button" className="w-full rounded-2xl bg-cyan-500 px-4 py-4 font-bold text-slate-950"
      onClick={useKeyboardDictation}>Usar microfone do teclado</button>
     <button type="button" className="w-full rounded-2xl border border-cyan-300/40 px-4 py-3 font-semibold text-cyan-50"
      onClick={voice}>Tentar novamente</button>
     <p className="text-xs leading-5 text-slate-100">
      Se estiver em navegador integrado, abra o Motyq no Chrome e permita o microfone.
     </p>
    </div>}
   </div>
  </div>}
  <nav aria-label="Navegação principal do Motyq IQ Mobile" style={{paddingBottom:'max(10px,env(safe-area-inset-bottom))'}}
   className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-1 pt-2 shadow-lg backdrop-blur">
   <div className="mx-auto grid max-w-[540px] grid-cols-5">
    {([{id:'home' as const,label:'Início',Icon:Home},
       {id:canStock?'stock' as const:'history' as const,label:canStock?'Estoque':'Histórico',Icon:canStock?CarFront:History},
       {id:'repasse' as const,label:'Repasse',Icon:Wallet},
       {id:'pricing' as const,label:'Precificar',Icon:CarFront},
       {id:'settings' as const,label:'Ajustes',Icon:Settings2}]).map(item=>
     <button key={item.id} aria-current={tab===item.id?'page':undefined}
      className={'flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold '+(tab===item.id?'text-[#008bd0]':'text-slate-500')}
      onClick={()=>item.id==='pricing'?newValuation():changeTab(item.id)}>
      <item.Icon size={22}/>{item.label}</button>)}
   </div>
  </nav>
 </div>;
}
