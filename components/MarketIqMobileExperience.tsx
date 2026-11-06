import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Bike,CarFront,CheckCircle2,ChevronRight,History,Home,Info,LogOut,Mic,RefreshCw,Save,Search,Settings2,Share2,Wallet,ExternalLink,ShieldCheck} from 'lucide-react';
import {signOut} from 'firebase/auth';
import type {User,OperationalStockItem} from '../types';
import {auth} from '../firebase';
import {companyIdForUser} from '../services/companyService';
import {storeIdForUser} from '../services/storeService';
import {currentStockService} from '../services/currentStockService';
import {dmsPermissions} from '../services/dmsPermissions';
import MarketIqConsultedRepasse from './MarketIqConsultedRepasse';
import MarketIqIntelligentHistoryPanel from './MarketIqIntelligentHistoryPanel';
import {mobileHistorySearch,mobileModelYearFromCode,mobilePriceSource,mobileYearOptions,type MobileFuel,type MobileFipeOption} from '../services/marketIqMobileFlow';
import {mobileSpeechToSearch,speechErrorFeedback} from '../services/marketIqMobileVoice';
import {canPromptMotyqInstall,isStandaloneMotyq,promptMotyqInstall,subscribeMotyqInstall}
 from '../services/marketIqPwaInstall';
type Vehicle='car'|'motorcycle';
type Fipe={value:number;brand:string;model:string;year:number;fuel:string;referenceMonth:string;referenceStatus?:'current'|'outdated'|'unverified'};
export type MobileHistoryRecord={id:string;model:string;year:string;km:string;value:number;date:string;plate?:string;brand?:string;provisional?:boolean;approvedValue?:number;paidValue?:number;vehicleType?:Vehicle};
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
 onSave:()=>void;saveBusy:boolean;saveNotice:string;saveError:string;onOpenFullDesk:()=>void;
 onStartNew:()=>boolean;onOpenApprovals:()=>void;onOpenPlateHistory?:()=>void;
};
type Tab='home'|'pricing'|'history'|'stock'|'repasse'|'settings';
const cash=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const number=(v:number)=>v.toLocaleString('pt-BR');
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
 const [stockQuery,setStockQuery]=useState(''),[message,setMessage]=useState('');
 const [stock,setStock]=useState<OperationalStockItem[]>([]),[stockBusy,setStockBusy]=useState(false),[stockError,setStockError]=useState('');
 const searchInputRef=useRef<HTMLInputElement|null>(null);
 const speechRef=useRef<any>(null);
 const [voiceState,setVoiceState]=useState<'idle'|'listening'|'fallback'|'heard'>('idle');
 const [voiceHint,setVoiceHint]=useState('');
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
 const canStock=dmsPermissions(p.user).stockView;
 const matchingYears=useMemo(()=>mobileYearOptions(p.years,pickedYear,pickedFuel),[p.years,pickedYear,pickedFuel]);
 const historyMatches=useMemo(()=>mobileHistorySearch(p.history,query),[p.history,query]);
 const recent=useMemo(()=>[...p.history].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5),[p.history]);
 const brands=useMemo(()=>{
  const priority=['chevrolet','volkswagen','fiat','ford','honda','toyota','peugeot','nissan','hyundai'];
  return [...p.brands].filter(v=>clean(v.name).includes(clean(brandSearch))).sort((a,b)=>{
   const ai=priority.indexOf(clean(a.name)),bi=priority.indexOf(clean(b.name));
   return (ai<0?50:ai)-(bi<0?50:bi)||a.name.localeCompare(b.name,'pt-BR');
  });
 },[p.brands,brandSearch]);
 const models=useMemo(()=>p.models.filter(v=>clean(v.name).includes(clean(modelSearch))),[p.models,modelSearch]);
 const mileage=Number(p.km.replace(/\D/g,''))||0;
 const validPlate=/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p.plate);
 const selectedPrice=mobilePriceSource({fipe:p.fipe?.value||0,verifiedCount:p.verifiedCount,
  verifiedCeiling:p.verifiedCeiling,historicalTarget:p.vehicleType==='motorcycle'?p.motorcycleReference:p.historicalTarget,
  indexedReference:p.indexedAverage});
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
  setVoiceState('idle');setVoiceHint('');
  setTab(v);setMessage('');window.scrollTo({top:0,behavior:'smooth'});
 };
 const newValuation=()=>{if(!p.onStartNew())return;setResult(false);setStep(1);setPickedYear(0);setPickedFuel('');setBrandSearch('');setModelSearch('');changeTab('pricing');};
 const restore=(r:MobileHistoryRecord)=>{p.onRestoreHistory(r);setPickedYear(mobileModelYearFromCode('',r.year));setStep(5);setResult(true);changeTab('pricing');};
 const useKeyboardDictation=()=>{
  setVoiceState('fallback');
  setVoiceHint('O campo está pronto. No teclado do celular, toque no microfone e diga o modelo ou a placa.');
  searchInputRef.current?.focus();
 };
 const voice=()=>{
  if(speechRef.current){
   const active=speechRef.current;speechRef.current=null;
   try{active.stop();}catch{}
   setVoiceState('idle');setVoiceHint('Escuta encerrada. Você pode tentar novamente.');
   return;
  }
  const Recognizer=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
  if(!window.isSecureContext||!Recognizer){
   setVoiceState('fallback');
   setVoiceHint('Este navegador não permite reconhecimento direto. Use o microfone do teclado, ou abra a prévia no Chrome.');
   searchInputRef.current?.focus();
   return;
  }
  try{
   const r=new Recognizer();
   let heard=false,failed=false;
   r.lang='pt-BR';
   r.continuous=false;
   r.interimResults=false;
   r.maxAlternatives=1;
   r.onstart=()=>{
    if(speechRef.current!==r)return;
    setVoiceState('listening');setVoiceHint('Ouvindo... diga o modelo ou a placa. Toque novamente para encerrar.');
   };
   r.onresult=(e:any)=>{
    if(speechRef.current!==r)return;
    const transcript=mobileSpeechToSearch(e?.results?.[0]?.[0]?.transcript);
    if(!transcript){
     failed=true;setVoiceState('fallback');
     setVoiceHint('Não consegui identificar as palavras. Use o microfone do teclado ou tente novamente.');
     return;
    }
    heard=true;
    setQuery(transcript);
    setVoiceState('heard');
    setVoiceHint('Entendi: '+transcript+'. Resultados do histórico exibidos acima.');
   };
   r.onerror=(e:any)=>{
    if(speechRef.current!==r)return;
    failed=true;
    const feedback=speechErrorFeedback(e?.error);
    setVoiceState('fallback');setVoiceHint(feedback.message);
   };
   r.onend=()=>{
    if(speechRef.current!==r)return;
    speechRef.current=null;
    if(!heard&&!failed){
     setVoiceState('fallback');
     setVoiceHint('A escuta terminou sem texto. Use o microfone do teclado ou tente novamente.');
    }
   };
   speechRef.current=r;
   setVoiceState('listening');
   setVoiceHint('Ativando o microfone... autorize o acesso quando o navegador solicitar.');
   r.start();
  }catch{
   speechRef.current=null;
   setVoiceState('fallback');
   setVoiceHint('Não foi possível iniciar a busca por voz. Abra no Chrome ou use o microfone do teclado.');
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
    <button type="button" onClick={()=>step>1?setStep(step-1):changeTab('home')} aria-label="Voltar"
     className="flex h-11 w-11 items-center justify-center rounded-xl bg-white"><ArrowLeft size={20}/></button>
    <div className="text-center"><strong className="text-lg">Nova avaliação</strong><p className="text-xs text-slate-400">Passo {step} de 5</p></div>
    <button type="button" onClick={()=>changeTab('home')} aria-label="Fechar" className="h-11 w-11 rounded-xl bg-white text-xl">×</button>
   </div>:<header className="mb-6">
    <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-[#008bd0]">MOTYQ IQ · MOBILE</p>
    <h1 className="mt-1 text-[28px] font-extrabold">{pageTitle}</h1>
   </header>}
   {tab==='home'&&<div className="space-y-6">
    <div><p className="text-sm text-slate-500">Bem-vindo à sua Mesa</p><h2 className="mt-1 text-2xl font-extrabold">O que vamos avaliar hoje?</h2></div>
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
     <button type="button" aria-pressed={voiceState==='listening'}
      className={card+' flex min-h-[100px] flex-col items-center justify-center gap-2 p-2 text-xs font-bold'+(voiceState==='listening'?' ring-2 ring-sky-400':'')} onClick={voice}>
      <Mic size={25} color={voiceState==='listening'?'#dc2626':'#008bd0'}/>
      {voiceState==='listening'?'Parar escuta':'Buscar por voz'}</button>
     <button className={card+' flex min-h-[100px] flex-col items-center justify-center gap-2 p-2 text-xs font-bold'} onClick={newValuation}>
      <CarFront size={25} color="#008bd0"/> Escolher na lista</button>
    </div>
    {voiceState!=='idle'&&<section aria-live="polite" role="status"
      className={card+' space-y-2 border-sky-200 bg-sky-50 p-4'}>
     <p className="text-sm font-bold text-sky-900">{voiceHint}</p>
     {voiceState==='listening'&&<p className="text-xs text-sky-700">Reconhecimento de voz em português (Brasil).</p>}
     {voiceState==='fallback'&&<>
      <button type="button" className="rounded-xl bg-[#008bd0] px-4 py-3 text-xs font-bold text-white"
       onClick={useKeyboardDictation}>Usar microfone do teclado</button>
      <p className="text-xs leading-5 text-slate-600">Se estiver dentro de outro aplicativo, abra o endereço no Chrome.
      Se o acesso foi bloqueado, confira a permissão de microfone do site no Chrome.</p>
     </>}
    </section>}
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
    <div className="grid grid-cols-5 gap-1.5" aria-label={'Passo '+step+' de 5'}>
     {[1,2,3,4,5].map(n=><span key={n} className={'h-1.5 rounded-full '+(n<=step?'bg-[#008bd0]':'bg-slate-200')}/>)}</div>
    {step>1&&<div className="flex flex-wrap gap-2 text-xs font-semibold">
     <span className="rounded-full bg-white px-3 py-2">{p.vehicleType==='car'?'Carro':'Moto'}</span>
     {p.brand&&<span className="rounded-full bg-white px-3 py-2">{p.brand}</span>}
     {pickedYear>0&&<span className="rounded-full bg-white px-3 py-2">{pickedYear}</span>}
     {pickedFuel&&<span className="rounded-full bg-white px-3 py-2">{pickedFuel}</span>}
    </div>}
    {step===1&&<><h2 className="text-[26px] font-extrabold">É carro ou moto?</h2>
     <button className={card+' flex min-h-[170px] w-full flex-col items-center justify-center gap-3'} onClick={()=>{p.onVehicleType('motorcycle');setStep(2);}}>
      <Bike size={48} color="#008bd0"/><strong className="text-2xl">Moto</strong><span className="text-sm text-slate-400">Motos e scooters</span></button>
     <button className={card+' flex min-h-[170px] w-full flex-col items-center justify-center gap-3'} onClick={()=>{p.onVehicleType('car');setStep(2);}}>
      <CarFront size={48} color="#008bd0"/><strong className="text-2xl">Carro</strong><span className="text-sm text-slate-400">Inclui picapes e SUVs</span></button></>}
    {step===2&&<><h2 className="text-[26px] font-extrabold">Qual a marca?</h2>
     <input className={input} value={brandSearch} onChange={e=>setBrandSearch(e.target.value)} placeholder="Buscar marca"/>
     <p className="text-xs text-slate-400">Marcas disponíveis na FIPE</p>
     {p.catalogLoading&&!p.brands.length&&<p className="text-sm text-slate-500">Carregando marcas...</p>}
     <div className={card+' max-h-[58dvh] overflow-y-auto px-4'}>{brands.slice(0,55).map(brand=>
      <button key={brand.code} className={row} onClick={()=>{p.onBrand(brand.code);setStep(3);}}>
       <span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 font-black text-[#008bd0]">{brand.name.slice(0,2).toUpperCase()}</span>
        <strong className="text-base">{brand.name}</strong></span><ChevronRight size={18}/></button>)}</div></>}
    {step===3&&<><h2 className="text-[26px] font-extrabold">Qual o ano-modelo?</h2>
     <input className={input} inputMode="numeric" placeholder="Ex.: 2023" aria-label="Buscar ano"
      value={pickedYear||''} onChange={e=>setPickedYear(Number(e.target.value.replace(/\D/g,'').slice(0,4))||0)}/>
     <div className="grid grid-cols-3 gap-2">
      {selectableYears.filter(y=>!pickedYear||String(y).includes(String(pickedYear))).slice(0,21).map(y=>
       <button key={y} className="rounded-2xl border border-slate-200 bg-white p-4 text-lg font-bold"
        onClick={()=>{setPickedYear(y);p.onYear('');setStep(4);}}>{y}</button>)}</div>
     {pickedYear>=1990&&pickedYear<=thisYear+2&&<button className={action}
      onClick={()=>{p.onYear('');setStep(4);}}>Continuar com {pickedYear}<ArrowRight size={18}/></button>}
     <p className="text-xs text-slate-500">Use o segundo ano do documento, não o de fabricação.</p></>}
    {step===4&&<><h2 className="text-[26px] font-extrabold">Qual é o combustível?</h2>
     <p className="text-sm text-slate-500">Selecione o combustível do documento.</p>
     <div className={card+' px-4'}>{fuels.map(f=><button key={f} className={row}
      onClick={()=>{setPickedFuel(f);setStep(5);}}><strong className="text-lg">{f}</strong><ChevronRight size={18}/></button>)}</div></>}
    {step===5&&<><h2 className="text-[26px] font-extrabold">Qual é o modelo e a versão?</h2>
     <p className="text-sm text-slate-500">A seleção abaixo utiliza o mesmo catálogo FIPE da Mesa.</p>
     <input className={input} value={modelSearch} onChange={e=>setModelSearch(e.target.value)}
      placeholder="Buscar modelo e versão"/>
     <div className={card+' max-h-52 overflow-y-auto px-4'}>{models.slice(0,50).map(m=><button
      key={m.code} className={row} onClick={()=>p.onModel(m.code)}>
       <span className="pr-2 text-sm font-semibold">{m.name}</span>{p.modelCode===m.code?<CheckCircle2 size={20} color="#008bd0"/>:<ChevronRight size={18}/>}</button>)}
      {!p.models.length&&<p className="py-4 text-xs text-slate-500">Carregando modelos desta marca...</p>}</div>
     {p.modelCode&&<div className={card+' space-y-2 p-4'}>
      <label className="text-sm font-bold">Ano/combustível da versão na FIPE</label>
      <select className={input} value={matchingYears.choices.some(y=>y.code===p.yearCode)?p.yearCode:''}
       onChange={e=>p.onYear(e.target.value)}>
       <option value="">Selecione a versão correta</option>
       {matchingYears.choices.map(y=><option key={y.code} value={y.code}>{y.name}</option>)}</select>
      {!matchingYears.yearMatched&&<p className="text-xs text-amber-800">Nenhum ano {pickedYear} disponível para essa versão. Confira o ano/modelo.</p>}
      {matchingYears.yearMatched&&pickedFuel&&!matchingYears.fuelMatched&&<p className="text-xs text-amber-800">
       A FIPE pode descrever {pickedFuel} de outro modo. Confira a versão antes de continuar.</p>}
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
     <button className={action} disabled={!p.modelCode||!p.yearCode||mileage<=0}
      onClick={()=>{setResult(true);window.scrollTo({top:0,behavior:'smooth'});}}>Ver avaliação <ArrowRight size={18}/></button>
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
      {selectedPrice.kind==='verified'?'Anúncios conferidos':selectedPrice.kind==='historical'?'Estimativa histórica':'Referência insuficiente'}</p>
      <div className="mt-2 flex justify-between gap-3"><span className="max-w-[160px] text-sm font-extrabold">{selectedPrice.label}</span>
       <strong className="text-[22px] text-[#008bd0]">{selectedPrice.value?cash(selectedPrice.value):'—'}</strong></div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{selectedPrice.disclaimer}</p>
      {selectedPrice.kind==='historical'&&p.historicalMin>0&&p.historicalMax>0&&
       <p className="mt-1 text-xs text-slate-500">Faixa: {cash(p.historicalMin)} a {cash(p.historicalMax)}</p>}
     </div>
     <div className="p-4"><div className="flex items-center justify-between"><strong>Destino sugerido</strong>
      <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-[#008bd0]">{p.destination}</span></div>
      <p className="mt-2 text-xs text-slate-500">Classe {p.classification||'a definir'} por KM, sujeita a laudo, conservação e custos.</p></div>
    </div>
    <MarketIqIntelligentHistoryPanel compact
      companyId={p.user.companyId||'abrao-reze'}
      current={{plate:p.plate,brand:p.brand,model:p.model,
       modelYear:Number(p.fipe?.year||String(p.year).match(/(?:19|20)\d{2}/)?.[0]||0),
       km:mileage,fipe:p.fipe?.value||0,vehicleType:p.vehicleType}}
      cloudHistory={p.history}
      verifiedMarketCeiling={p.verifiedCeiling}
      historicalModelTarget={p.vehicleType==='motorcycle'?p.motorcycleReference:p.historicalTarget}
      onOpenPlateHistory={p.onOpenPlateHistory}/>
    <div className={card+' p-4'}><h3 className="text-sm font-bold">Como calculamos?</h3>
     <p className="mt-2 text-xs leading-5 text-slate-600">Tabela FIPE, anúncios individuais conferidos, custos, 14% de desconto e 5% adicionais para repasse.
     Sem amostra validada, mostramos o histórico identificado como estimativa, nunca como oferta real de lojistas.</p></div>
    {p.marketNotice&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{p.marketNotice}</p>}
    <div className="grid grid-cols-2 gap-2"><button onClick={p.onSearchMarket} disabled={p.marketBusy}
     className={card+' flex items-center justify-center gap-2 px-2 py-4 text-xs font-bold text-[#008bd0]'}>
     <RefreshCw size={16}/>{p.marketBusy?'Pesquisando...':'Busca indexada'}</button>
     <button onClick={()=>void share()} className={card+' flex items-center justify-center gap-2 px-2 py-4 text-xs font-bold text-[#008bd0]'}>
      <Share2 size={16}/> Compartilhar</button></div>
    <button className={action} style={{color:'#ffffff'}} onClick={p.onSave} disabled={p.saveBusy||!validPlate||!p.fipe?.value}>
     <Save size={18}/>{p.saveBusy?'Salvando...':'Salvar avaliação no histórico'}</button>
    {!validPlate&&<p className="text-xs text-amber-800">Preencha uma placa válida para salvar.</p>}
    {p.saveError&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800">{p.saveError}</p>}
    {p.saveNotice&&<p role="status" className="rounded-xl bg-sky-50 p-3 text-xs text-sky-900">{p.saveNotice}</p>}
   </div>}
   {tab==='history'&&<div className="space-y-3">
    <input className={input} placeholder="Buscar placa, modelo ou ano" value={query} onChange={e=>setQuery(e.target.value)}/>
    <button className="flex items-center gap-2 text-xs font-bold text-[#008bd0]" onClick={p.onRefreshHistory}><RefreshCw size={16}/> Atualizar histórico</button>
    {p.historyError&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{p.historyError}</p>}
    {p.historyLoading&&<p className="text-sm text-slate-500">Carregando avaliações autorizadas...</p>}
    <div className={card+' px-4'}>{historyMatches.slice(0,100).map(r=><button key={r.id} className={row} onClick={()=>restore(r)}>
     <span><strong className="block text-sm">{r.brand} {r.model}</strong><small className="text-slate-500">{r.year} · {r.km} km · {r.plate||'Sem placa'}</small>
     <small className="block text-slate-500">{r.provisional?'Preliminar':'Avaliação'}{Number(r.paidValue||r.approvedValue)>0?' · compra registrada':''}</small></span>
     <span className="flex items-center gap-1 text-xs font-bold text-[#008bd0]">{r.value?cash(r.value):'—'}<ChevronRight size={15}/></span>
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
