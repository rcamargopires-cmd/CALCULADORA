import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,Mic,MicOff,Search,X} from 'lucide-react';
import MarketIqVoiceHologram from './MarketIqVoiceHologram';
import {
 mobileQuickIntent,mobileFilterModels,mobileYearOptions,
 type MobileFipeOption
} from '../services/marketIqMobileFlow';
import {mobileSpeechToSearch,speechErrorFeedback} from '../services/marketIqMobileVoice';

type Props={
 vehicleType:'car'|'motorcycle';onVehicleType:(type:'car'|'motorcycle')=>void;
 brands:MobileFipeOption[];brand:string;brandCode:string;onBrand:(code:string)=>void;
 models:MobileFipeOption[];model:string;modelCode:string;onModel:(code:string)=>void;
 years:MobileFipeOption[];yearCode:string;onYear:(code:string)=>void;
 plate:string;onPlate:(plate:string)=>void;
 catalogLoading:boolean;catalogError:string;onRetryFipe:()=>void;
 onOpenPricing:()=>void;
};
type Phase='idle'|'listening'|'processing'|'heard'|'fallback';
const platePattern=/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
export default function MarketIqDesktopVoiceSearch(p:Props){
 const [open,setOpen]=useState(false);
 const [phase,setPhase]=useState<Phase>('idle');
 const [speechDetected,setSpeechDetected]=useState(false);
 const [hint,setHint]=useState('');
 const [transcript,setTranscript]=useState('');
 const [searchText,setSearchText]=useState('');
 const [searching,setSearching]=useState(false);
 const [modelFilter,setModelFilter]=useState('');
 const [yearFilter,setYearFilter]=useState(0);
 const [brandFilter,setBrandFilter]=useState('');
 const [brandConfirmed,setBrandConfirmed]=useState(false);
 const [formType,setFormType]=useState<'car'|'motorcycle'>(p.vehicleType);
 const recognitionRef=useRef<any>(null);
 const transcriptRef=useRef('');
 const manualStopRef=useRef(false);
 const startedRef=useRef(false);
 const editingRef=useRef<HTMLInputElement|null>(null);
 const intent=useMemo(()=>mobileQuickIntent(searchText,p.brands),[searchText,p.brands]);
 const showBrandPicker=!p.brandCode||(!intent.brand&&!brandConfirmed);
 const matchedModels=useMemo(()=>mobileFilterModels(p.models,modelFilter,''),
  [p.models,modelFilter]);
 const yearOptions=useMemo(()=>{
  if(!yearFilter)return p.years;
  return mobileYearOptions(p.years,yearFilter,'').choices;
 },[p.years,yearFilter]);
 const stopRecognition=()=>{
  const active=recognitionRef.current;
  recognitionRef.current=null;manualStopRef.current=false;
  try{active?.abort?.();}catch{}
  setSpeechDetected(false);
 };
 const close=()=>{
  stopRecognition();setOpen(false);setPhase('idle');setHint('');
  setSearching(false);setTranscript('');setBrandFilter('');setBrandConfirmed(false);
 };
 useEffect(()=>()=>{
  const active=recognitionRef.current;recognitionRef.current=null;
  try{active?.abort?.();}catch{}
 },[]);
 useEffect(()=>{
  if(!open)return;
  const handler=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};
  window.addEventListener('keydown',handler);
  return()=>window.removeEventListener('keydown',handler);
 },[open]);
 const prepareSearch=(raw:string)=>{
  const normalized=mobileSpeechToSearch(raw);
  if(!normalized){
   setPhase('fallback');setHint('Digite ou fale o veículo antes de pesquisar.');return;
  }
  setTranscript(normalized);setSearchText(normalized);
  if(platePattern.test(normalized)){
   if(p.plate&&p.plate!==normalized&&!window.confirm('Substituir a placa da ficha atual?'))return;
   p.onPlate(normalized);p.onOpenPricing();close();
   window.setTimeout(()=>document.getElementById('motyq-iq-valuation-form')?.scrollIntoView({behavior:'smooth'}),0);
   return;
  }
  const changingType=formType!==p.vehicleType;
  if(changingType&&(p.brandCode||p.modelCode)&&
    !window.confirm('Trocar o tipo de veículo e a ficha FIPE atual?'))return;
  const parsed=mobileQuickIntent(normalized,changingType?[]:p.brands);
  if(changingType)p.onVehicleType(formType);
  setBrandConfirmed(Boolean(parsed.brand));
  setModelFilter(parsed.modelSearch);
  setYearFilter(parsed.hasYear?parsed.year:0);
  setSearching(true);setPhase('heard');
  setHint('Confira a versão e o ano/modelo na FIPE. Nada será salvo automaticamente.');
  p.onOpenPricing();
  if(parsed.brand&&!changingType){
   if(p.modelCode&&p.brandCode!==parsed.brand.code&&
      !window.confirm('A pesquisa vai substituir marca, versão e ano da ficha atual. Continuar?'))return;
   if(p.brandCode!==parsed.brand.code||!p.models.length)p.onBrand(parsed.brand.code);
  }
 };
 const startListening=()=>{
  stopRecognition();
  transcriptRef.current='';manualStopRef.current=false;startedRef.current=false;
  setSearching(false);setTranscript('');setSpeechDetected(false);setHint('');
  setOpen(true);
  const Recognizer=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
  if(!window.isSecureContext||!Recognizer){
   setPhase('fallback');
   setHint('O reconhecimento de voz não está disponível aqui. Use o Google Chrome ou digite sua busca abaixo.');
   return;
  }
  try{
   const r=new Recognizer();r.lang='pt-BR';r.continuous=false;
   r.interimResults=true;r.maxAlternatives=1;
   r.onstart=()=>{
    if(recognitionRef.current!==r)return;
    startedRef.current=true;setPhase('listening');
    setHint('Fale o veículo. Depois toque no holograma para concluir.');
   };
   r.onspeechstart=()=>{if(recognitionRef.current===r)setSpeechDetected(true);};
   r.onspeechend=()=>{if(recognitionRef.current===r)setSpeechDetected(false);};
   r.onresult=(event:any)=>{
    if(recognitionRef.current!==r)return;
    let phrase='';
    for(let i=0;i<(event.results?.length||0);i++)phrase+=' '+String(event.results[i]?.[0]?.transcript||'');
    const normalized=mobileSpeechToSearch(phrase.trim());
    if(!normalized)return;
    transcriptRef.current=normalized;setTranscript(normalized);setSearchText(normalized);
    setSpeechDetected(true);
    setHint('Reconhecido. Toque no holograma para buscar as versões FIPE.');
   };
   r.onerror=(event:any)=>{
    if(recognitionRef.current!==r)return;
    recognitionRef.current=null;
    setSpeechDetected(false);
    try{r.abort();}catch{}
    setPhase('fallback');
    setHint(speechErrorFeedback(event?.error).message);
   };
   r.onend=()=>{
    if(recognitionRef.current!==r)return;
    recognitionRef.current=null;setSpeechDetected(false);
    const heard=transcriptRef.current;
    if(!heard){
     setPhase('fallback');
     setHint(startedRef.current?
      'Nenhuma palavra reconhecida. Tente outra vez ou digite o veículo.':
      'Não foi possível ativar o reconhecimento. Tente novamente ou digite.');
    }else if(manualStopRef.current){
     prepareSearch(heard);
    }else{
     setPhase('heard');
     setHint('Confira a frase reconhecida e clique em Buscar versões FIPE.');
    }
    manualStopRef.current=false;
   };
   recognitionRef.current=r;setPhase('listening');
   setHint('Ativando microfone. Se solicitado, permita o acesso no navegador.');
   r.start();
  }catch{
   recognitionRef.current=null;setPhase('fallback');
   setHint('O microfone não iniciou. Confira as permissões do site ou digite a busca.');
  }
 };
 const onOrb=()=>{
  if(recognitionRef.current){
   manualStopRef.current=true;setPhase('processing');
   setHint('Finalizando reconhecimento...');
   try{recognitionRef.current.stop();}
   catch{
    recognitionRef.current=null;
    if(transcriptRef.current)prepareSearch(transcriptRef.current);
    else{setPhase('fallback');setHint('Não foi possível concluir a fala. Tente novamente.');}
   }
  }else if(!searching&&transcript){prepareSearch(transcript);}
  else startListening();
 };
 const pickBrand=(code:string)=>{
  if(p.modelCode&&p.brandCode!==code&&
   !window.confirm('Trocar a marca e a versão da avaliação atual?'))return;
  p.onBrand(code);setBrandFilter('');setBrandConfirmed(true);
 };
 const pickYear=(code:string)=>{
  p.onYear(code);
  setHint('Versão e ano selecionados. Preencha a quilometragem para consultar a avaliação.');
  p.onOpenPricing();
  close();
  window.setTimeout(()=>document.getElementById('motyq-iq-valuation-form')?.scrollIntoView({behavior:'smooth'}),0);
 };
 return <>
  <button type="button" onClick={startListening}
   className="inline-flex items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-900 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500">
   <Mic size={18}/> Buscar por voz <span className="text-xs font-medium text-sky-700">M.O.T.Y.Q</span>
  </button>
  {open&&<div role="dialog" aria-modal="true" aria-label="M.O.T.Y.Q busca por voz no computador"
   className="fixed inset-0 z-[110] overflow-y-auto bg-[#020a19]/95 p-4 text-white backdrop-blur-lg">
   <div className="relative mx-auto max-w-[850px] space-y-4 py-8">
    <button type="button" onClick={close} aria-label="Fechar busca por voz"
     className="absolute right-0 top-1 rounded-full border border-white/30 bg-white/10 p-3 text-white">
     <X size={22}/></button>
    <header className="text-center">
     <p className="text-xs font-bold uppercase tracking-[.27em] text-cyan-300">Motyq IQ · Desktop</p>
     <h2 className="mt-3 text-2xl font-bold text-white">
      {phase==='listening'?'Estou ouvindo...':phase==='processing'?'Analisando a fala...':
       searching?'Encontrei sua pesquisa':phase==='fallback'?'Busca alternativa':'Buscar veículo por voz'}
     </h2>
    </header>
    <div className={searching?'grid items-start gap-5 md:grid-cols-[280px_1fr]':'mx-auto max-w-[370px]'}>
     <div className="space-y-2 text-center">
      <button type="button" onClick={onOrb} disabled={phase==='processing'}
       aria-label={phase==='listening'?'Parar escuta e buscar':'Iniciar ou repetir busca por voz'}
       className="mx-auto flex w-full max-w-[340px] items-center justify-center rounded-3xl focus-visible:outline focus-visible:outline-4 focus-visible:outline-cyan-400 disabled:opacity-60">
       <MarketIqVoiceHologram listening={phase==='listening'} processing={phase==='processing'}
        heard={phase==='heard'} speechDetected={speechDetected}/>
      </button>
      <p role="status" aria-live="polite" className="text-sm leading-6 text-cyan-100">{hint}</p>
      {transcript&&!searching&&<p className="rounded-xl border border-cyan-500/30 bg-white/10 p-3 font-semibold text-white">
       {transcript}</p>}
      {!searching&&<div className="flex flex-wrap justify-center gap-2">
       <button type="button" onClick={startListening}
        className="rounded-lg border border-cyan-400/50 px-3 py-2 text-sm font-semibold text-cyan-100">
        <Mic size={15} className="mr-1 inline"/> Falar novamente
       </button>
       <button type="button" onClick={()=>{stopRecognition();setPhase('fallback');editingRef.current?.focus();}}
        className="rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold text-white">Digitar</button>
      </div>}
     </div>
     <div className="space-y-3">
      <label className="block text-sm font-semibold text-white">Veículo reconhecido ou digitado
       <input ref={editingRef} value={searchText}
        onChange={e=>{setSearchText(e.target.value);setSearching(false);}}
        onKeyDown={e=>{if(e.key==='Enter')prepareSearch(searchText);}}
        placeholder="Ex.: Compass Longitude 2025 ou ABC1D23"
        className="mt-2 w-full rounded-xl border border-cyan-400/40 bg-white px-4 py-3 text-base text-slate-950 placeholder:text-slate-500"/>
      </label>
      <div className="flex flex-wrap items-center gap-2">
       <label className="text-xs font-semibold text-cyan-100">Tipo de veículo
        <select className="ml-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-900"
         value={formType} onChange={e=>setFormType(e.target.value as 'car'|'motorcycle')}>
         <option value="car">Carro</option><option value="motorcycle">Moto</option>
        </select>
       </label>
       {!searching&&<button type="button" onClick={()=>prepareSearch(searchText)} disabled={!searchText.trim()}
        className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">
        Buscar versões FIPE <ArrowRight size={16} className="ml-1 inline"/></button>}
      </div>
      {searching&&<>
       {intent.brand&&<p className="text-sm font-semibold text-cyan-100">
        Marca reconhecida: {intent.brand.name}{yearFilter?' · '+yearFilter:''}</p>}
       {showBrandPicker&&<div className="rounded-xl border border-cyan-500/30 bg-white/10 p-3">
        <p className="mb-2 text-sm font-bold text-white">Confirme a marca</p>
        <input value={brandFilter} onChange={e=>setBrandFilter(e.target.value)}
         placeholder="Buscar marca" className="mb-2 w-full rounded-lg bg-white p-2 text-slate-950"/>
        <div className="max-h-40 overflow-y-auto">
         {p.brands.filter(b=>b.name.toLowerCase().includes(brandFilter.toLowerCase())).slice(0,30)
          .map(b=><button type="button" key={b.code} onClick={()=>pickBrand(b.code)}
           className="block w-full border-b border-white/10 p-2 text-left text-sm text-white hover:bg-cyan-900">
           {b.name}</button>)}
        </div>
       </div>}
       {!showBrandPicker&&p.brandCode&&<div className="rounded-xl border border-cyan-500/30 bg-white/10 p-3">
        <p className="mb-2 text-sm font-bold text-white">Versões FIPE · {p.brand}</p>
        <input value={modelFilter} onChange={e=>setModelFilter(e.target.value)}
         placeholder="Refinar modelo e versão" aria-label="Refinar modelos na busca por voz"
         className="mb-2 w-full rounded-lg bg-white p-2 text-slate-950"/>
        <div className="max-h-44 overflow-y-auto">
         {matchedModels.slice(0,40).map(m=><button type="button" key={m.code}
          onClick={()=>p.onModel(m.code)}
          className={'block w-full border-b border-white/10 p-2 text-left text-sm hover:bg-cyan-900 '+
           (p.modelCode===m.code?'bg-cyan-900 text-cyan-100':'text-white')}>
          {m.name}{p.modelCode===m.code?' ✓':''}</button>)}
         {p.catalogLoading&&!p.models.length&&<p className="py-2 text-sm text-cyan-100">Consultando catálogo FIPE...</p>}
         {!p.catalogLoading&&matchedModels.length===0&&<p className="py-2 text-sm text-cyan-100">
          Nenhuma versão corresponde. Ajuste a busca ou tente novamente.</p>}
        </div>
       </div>}
       {!showBrandPicker&&p.modelCode&&<div className="rounded-xl border border-cyan-500/30 bg-white/10 p-3">
        <p className="mb-2 text-sm font-bold text-white">Ano/modelo e combustível · {p.model}</p>
        <label className="block text-xs font-semibold text-cyan-100">Ano desejado
         <input type="number" min={1990} max={2100} value={yearFilter||''}
          onChange={e=>setYearFilter(Number(e.target.value)||0)}
          placeholder="Ex.: 2025" className="ml-2 w-28 rounded-lg bg-white p-2 text-slate-950"/>
        </label>
        <div className="mt-2 max-h-44 overflow-y-auto">
         {yearOptions.slice(0,35).map(y=><button type="button" key={y.code}
          onClick={()=>pickYear(y.code)}
          className="block w-full border-b border-white/10 p-2 text-left text-sm text-white hover:bg-cyan-900">
          {y.name}</button>)}
         {p.catalogLoading&&!p.years.length&&<p className="py-2 text-sm text-cyan-100">Consultando anos FIPE...</p>}
         {!p.catalogLoading&&p.years.length>0&&yearOptions.length===0&&
          <p className="py-2 text-sm text-amber-200">Esta versão não tem ano {yearFilter}. Corrija o ano na busca.</p>}
        </div>
       </div>}
       {p.catalogError&&<p role="alert" className="rounded-lg bg-amber-950/50 p-3 text-sm text-amber-100">
        {p.catalogError} <button type="button" onClick={p.onRetryFipe} className="font-bold underline">
        Atualizar FIPE</button></p>}
      </>}
     </div>
    </div>
    <p className="text-center text-xs text-slate-300">
     O reconhecimento depende de um navegador compatível e de permissão do microfone.
     A proposta e a compra não são alteradas nem salvas pela busca por voz.
    </p>
   </div>
  </div>}
 </>;
}
