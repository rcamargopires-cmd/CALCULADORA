import React,{useEffect,useMemo,useRef,useState} from 'react';
import {auth} from '../firebase';
import {AlertCircle,ArrowRight,BarChart3,CheckCircle2,Clock3,FileSearch,ShieldAlert,Warehouse,X} from 'lucide-react';
import type {DealerStockSnapshot} from '../services/marketIqDealerRadar';
import {buildPurchaseRadar,calculateMesaPurchaseCeiling,modelYear,type PurchaseRadarTarget} from '../services/marketIqPurchaseRadar';
import {buildMesaPurchaseOpinion} from '../services/marketIqPurchaseOpinion';
import MarketIqPurchaseSourcesPanel from './MarketIqPurchaseSourcesPanel';
import {summarizeOperatorWebmotors,type RadarFipeQuote,type RadarWebmotorsListing} from '../services/marketIqPurchaseEvidence';
import {autoFipeForHistoricalTarget} from '../services/marketIqPurchaseAutoContext';
import {buildComparableHistory,type ComparableCloud,type ComparableCurrent} from '../services/marketIqComparableHistory';
import {deriveMesaPricePattern} from '../services/marketIqMesaPricePattern';
import type {MonthlyArchiveRow} from '../services/marketIqMonthlyArchive';
type Props={
 open:boolean;onClose:()=>void;target:PurchaseRadarTarget;
 snapshot:DealerStockSnapshot|null;onOpenRadar?:()=>void;
 cloudHistory?:ComparableCloud[];companyId?:string;
};
type HistoryResult={
 identity:string;records:MonthlyArchiveRow[];plateRecords:MonthlyArchiveRow[];
 limited:boolean;monthsScanned:number;
};
const money=(n:number|null|undefined)=>n===null||n===undefined||!Number.isFinite(n)?
 'A confirmar':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(n);
const fmt=(n:number|null|undefined,digits=0)=>n===null||n===undefined||!Number.isFinite(n)?
 'A confirmar':new Intl.NumberFormat('pt-BR',{maximumFractionDigits:digits}).format(n);
const label='text-[11px] font-bold uppercase tracking-wide text-slate-500';
const cell='rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm';
const sceneTitle='mb-1 text-sm font-black text-slate-900';
function Metric({caption,value,note,accent='normal'}:{
 caption:string;value:string;note:string;accent?:'normal'|'orange'|'cyan'|'dark'
}){
 const style=accent==='orange'?'border-orange-400 bg-orange-500 text-white':
  accent==='cyan'?'border-cyan-500 bg-[#0c7291] text-white':
  accent==='dark'?'border-slate-300 bg-slate-50 text-slate-950':
  'border-slate-200 bg-white text-slate-950';
 return <div className={'flex min-h-[116px] flex-col justify-between rounded-xl border p-4 shadow-sm '+style}>
  <span className={'text-xs font-bold leading-5 '+(accent==='normal'||accent==='dark'?'text-slate-700':'text-white/90')}>{caption}</span>
  <strong className={"my-2 text-2xl font-black leading-tight tabular-nums "+(accent==='orange'||accent==='cyan'?'!text-white':'!text-slate-950')}>{value}</strong>
  <span className={'text-[11px] leading-4 '+(accent==='normal'||accent==='dark'?'text-slate-600':'text-white/85')}>{note}</span>
 </div>;
}
/** Appraisal assistant: a decision aid, not an approval to buy or a sales prediction. */
export default function MarketIqPurchaseSummaryModal({open,onClose,target,snapshot,onOpenRadar,cloudHistory=[],companyId='abrao-reze'}:Props){
 const [store,setStore]=useState('');
 const [offer,setOffer]=useState('');
 const [manualSale,setManualSale]=useState('');
 const [details,setDetails]=useState(false);
 const [rate,setRate]=useState('1.5');
 const [scenarioMode,setScenarioMode]=useState<'stock'|'purchase'>('stock');
 const [repasse,setRepasse]=useState(false);
 const [preparationDraft,setPreparationDraft]=useState(String(target.preparation??0));
 const [preparationConfirmed,setPreparationConfirmed]=useState(false);
 const [localFipe,setLocalFipe]=useState<RadarFipeQuote|null>(null);
 const manuallySelectedFipe=useRef(false);
 const [localListings,setLocalListings]=useState<RadarWebmotorsListing[]>([]);
 const [autoFipeStatus,setAutoFipeStatus]=useState('');
 const [historyStatus,setHistoryStatus]=useState<'idle'|'loading'|'ready'|'error'>('idle');
 const [historyError,setHistoryError]=useState('');
 const [historyData,setHistoryData]=useState<HistoryResult|null>(null);
 const historicalIdentity=[
   target.vehicleType,target.brand,target.model,target.year,target.km??'',
   target.plate||'',target.fipeCode||''
 ].join('|');
 useEffect(()=>{
  if(!open)return;
  setStore(target.store||'');setOffer(target.offer&&target.offer>0?String(target.offer):'');
  setManualSale('');setDetails(false);setRate('1.5');setRepasse(false);
  setPreparationDraft(String(target.preparation??0));setPreparationConfirmed(false);
  manuallySelectedFipe.current=false;
  setLocalFipe(null);setLocalListings([]);setAutoFipeStatus('');
  setScenarioMode(target.stockVehicle?'stock':'purchase');
 },[open,target.brand,target.model,target.year,target.plate,target.stockVehicle?.key]);
 useEffect(()=>{
  if(!open)return;
  const previous=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};
  window.addEventListener('keydown',esc);
  return ()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',esc);};
 },[open,onClose]);
 // An exact historical FIPE code can be refreshed with one read-only call.
 // No broad automatic version guessing, no retry storm when providers are limited.
 useEffect(()=>{
  if(!open||!target.historicalAssessment)return;
  const controller=new AbortController();
  if(target.fipeStatus==='current'){
   setAutoFipeStatus('FIPE do mês vigente já validada para este veículo no Motyq IQ.');
   return;
  }
  if(!/^\d{6}-\d$/.test(String(target.fipeCode||''))){
   setAutoFipeStatus('Sem código FIPE exato no histórico. Confirme a versão no catálogo abaixo.');
   return;
  }
  let active=true;
  setAutoFipeStatus('Consultando FIPE pelo código e ano-modelo do histórico...');
  const query=new URLSearchParams({
   brand:target.brand,model:target.model,year:target.year,
   vehicleType:target.vehicleType,fipeCode:String(target.fipeCode)
  });
  void fetch('/api/marketiq-fipe?'+query.toString(),{
   signal:controller.signal,cache:'no-store'
  }).then(async response=>{
   if(!response.ok)throw new Error(response.status===429?
    'FIPE limitada temporariamente; mantenha a referência como não confirmada.':
    'FIPE indisponível; escolha a versão manualmente quando necessário.');
   return response.json();
  }).then(body=>{
   if(!active)return;
   const exact=autoFipeForHistoricalTarget(target,body);
   if(!exact){
    setAutoFipeStatus('O retorno FIPE não corresponde com segurança ao código, versão, câmbio e ano do histórico. Confirme manualmente.');
    return;
   }
   if(manuallySelectedFipe.current)return;
   setLocalFipe(exact);
   setAutoFipeStatus(exact.referenceStatus==='current'?
    'FIPE atual conferida automaticamente pelo código exato, versão e ano-modelo.':
    'FIPE encontrada por código, mas o mês vigente não foi confirmado. Não tratar como FIPE atual.');
  }).catch(error=>{
   if(!active||controller.signal.aborted)return;
   setAutoFipeStatus(String(error?.message||'FIPE indisponível; confirme manualmente.'));
  });
  return ()=>{active=false;controller.abort();};
 },[open,historicalIdentity,target.historicalAssessment?.date,target.fipeStatus]);

 // Same authenticated archive query as Histórico Inteligente, now scoped to
 // the clicked vehicle rather than to the unrelated current evaluation form.
 useEffect(()=>{
  if(!open||!target.brand.trim()||!target.model.trim())return;
  const controller=new AbortController();let active=true;
  setHistoryData(null);setHistoryError('');setHistoryStatus('loading');
  const run=async()=>{
   try{
    if(!target.brand.trim()||!target.model.trim()||!modelYear(target.year))
     throw new Error('Marca, modelo ou ano-modelo não identificados.');
    const account=auth.currentUser;
    if(!account)throw new Error('Sua sessão expirou. Entre novamente no Motyq IQ.');
    const token=await account.getIdToken();
    const response=await fetch('/api/marketiq-market-scan',{
     method:'POST',cache:'no-store',signal:controller.signal,
     headers:{'content-type':'application/json',authorization:'Bearer '+token},
     body:JSON.stringify({
      action:'monthly_archive_comparables',plate:target.plate||'',
      brand:target.brand,model:target.model,version:target.model,
      modelYear:modelYear(target.year),km:target.km||0,
      vehicleType:target.vehicleType,fipeCode:target.fipeCode||''
     })
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(String(body.error||'Arquivo mensal indisponível.'));
    if(!active)return;
    setHistoryData({
     identity:historicalIdentity,
     records:Array.isArray(body.records)?body.records:[],
     plateRecords:Array.isArray(body.plateRecords)?body.plateRecords:[],
     limited:body.truncated===true,monthsScanned:Number(body.monthsScanned)||0
    });
    setHistoryStatus('ready');
   }catch(error:any){
    if(!active||controller.signal.aborted)return;
    setHistoryError(String(error?.message||'Não foi possível consultar o histórico.'));
    setHistoryStatus('error');
   }
  };
  void run();
  return ()=>{active=false;controller.abort();};
 },[open,historicalIdentity,companyId,Boolean(target.historicalAssessment)]);

 const historicalMetrics=useMemo(()=>{
  if(historyStatus!=='ready'||
   !historyData||historyData.identity!==historicalIdentity)return null;
  const current:ComparableCurrent={
   brand:target.brand,model:target.model,plate:target.plate||'',
   modelYear:modelYear(target.year)||0,vehicleType:target.vehicleType,
   km:target.km||0,
   // FIPE-adjusted medians are not used to approve an offer. The original
   // archived FIPE is never called the current month's reference.
   fipe:localFipe?.referenceStatus==='current'?localFipe.value:
    target.fipeStatus==='current'?(target.fipe||0):0,
   fipeCode:localFipe?.fipeCode||target.fipeCode
  };
  const result=buildComparableHistory(current,historyData.plateRecords,
   historyData.records,cloudHistory,companyId,historyData.limited);
  return {result,pattern:deriveMesaPricePattern(result.comparables,current.km)};
 },[target.brand,target.model,target.year,target.plate,target.vehicleType,target.km,
  target.fipe,target.fipeStatus,target.fipeCode,target.historicalAssessment,
  historicalIdentity,historyStatus,historyData,cloudHistory,companyId,localFipe]);
 const numeric=(value:string)=>{
  const num=Number(value.replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''));
  return Number.isFinite(num)&&num>=0?num:0;
 };
 const stock=target.stockVehicle;
 const newPurchaseMode=!stock||scenarioMode==='purchase';
 const fipeValue=localFipe?.value||target.fipe||0;
 const currentFipeForComparison=localFipe?
  (localFipe.referenceStatus==='current'?localFipe.value:0):
  target.fipeStatus==='current'?(target.fipe||0):0;
 const checkedListings=useMemo(()=>summarizeOperatorWebmotors(
  [...(target.marketListings||[]),...localListings],
  {brand:target.brand,model:target.model,year:modelYear(target.year)||0,
   km:Number(target.km)||0,vehicleType:target.vehicleType,fipe:currentFipeForComparison||undefined},
  localFipe?.model||target.fipeModel||target.model
 ),[target.brand,target.model,target.year,target.km,target.vehicleType,target.marketListings,
    localListings,localFipe?.model,target.fipeModel,currentFipeForComparison]);
 const marketReference=checkedListings.count>=2?checkedListings.average:null;
 const data=useMemo(()=>buildPurchaseRadar(snapshot,{
  ...target,stockVehicle:newPurchaseMode?null:stock,
  fipe:fipeValue,
  offer:newPurchaseMode?numeric(offer):undefined,
  preparation:newPurchaseMode?numeric(preparationDraft):0,
  manualSalePrice:manualSale.trim()?numeric(manualSale):undefined,
  dealerSuggestedSalePrice:newPurchaseMode&&stock&&!manualSale.trim()?stock.price:undefined,
  verifiedMarketPrice:marketReference||0,marketAdsVerified:checkedListings.count
 },store,Number(rate.replace(',','.'))||1.5),
 [snapshot,target,stock,newPurchaseMode,store,offer,preparationDraft,manualSale,rate,fipeValue,
  marketReference,checkedListings.count]);
 if(!open)return null;
 const headline=(target.brand+' '+target.model+' '+target.year).trim();
 const stockDate=snapshot?.reportDate?
  snapshot.reportDate.split('-').reverse().join('/'):'Sem fotografia';
 const hasComparableData=data.yearFamilyRows.length>0;
 const signalTone=data.signal==='favorable'?'border-emerald-300 bg-emerald-50 text-emerald-950':
  data.signal==='negotiate'?'border-rose-300 bg-rose-50 text-rose-950':
  data.signal==='stock_risk'?'border-orange-300 bg-orange-50 text-orange-950':
  'border-amber-200 bg-amber-50 text-amber-950';
 const preparation=newPurchaseMode?numeric(preparationDraft):0;
 const projectedCost=!newPurchaseMode&&stock?.cost&&stock.cost>0?stock.cost:
  numeric(offer)>0?numeric(offer)+preparation:null;
 const ceilingBenchmark=marketReference||data.referencePrice;
 const ceiling=calculateMesaPurchaseCeiling(ceilingBenchmark,preparation,repasse);
 const ceilingSource=marketReference?'média dos anúncios Webmotors conferidos pela Mesa':
  data.referenceSale==='dealer_suggested'?'preço sugerido no Dealer':
  data.referenceSale==='manual_assumption'?'preço de venda hipotético digitado':'fonte não confirmada';
 const opinion=buildMesaPurchaseOpinion({
  mode:newPurchaseMode?'purchase':'stock',
  verifiedMarketPrice:marketReference,verifiedAds:checkedListings.count,
  offer:newPurchaseMode&&numeric(offer)>0?numeric(offer):null,
  dealerCost:!newPurchaseMode&&stock?.cost&&stock.cost>0?stock.cost:null,
  preparation,preparationConfirmed,repasse,
  fipeCurrent:currentFipeForComparison>0,fipeValue:currentFipeForComparison||null,
  snapshotAvailable:Boolean(snapshot),snapshotDate:snapshot?.reportDate||'',
  familyCount:data.familyCount,yearFamilyCount:data.yearFamilyCount,
  over90Count:data.over90Count,
  historyAvailable:historyStatus==='ready'&&Boolean(historicalMetrics),
  historyLimited:historicalMetrics?.result.limited===true,
  paidCount:historicalMetrics?.result.paidCount??null,
  paidMedian:historicalMetrics?.result.paidMedian??null
 });
 const opinionTone=opinion.status==='opportunity'?
  'border-emerald-300 bg-emerald-50 text-emerald-950':
  opinion.status==='avoid'?'border-rose-300 bg-rose-50 text-rose-950':
  opinion.status==='negotiate'?'border-amber-300 bg-amber-50 text-amber-950':
  'border-slate-300 bg-slate-50 text-slate-900';
 const differenceToCeiling=!newPurchaseMode&&stock?.cost&&ceiling!==null?
  stock.cost-ceiling:null;
 return <div className="fixed inset-0 z-[140] overflow-y-auto bg-[#071421]/80 px-2 py-4 backdrop-blur-sm md:p-8"
  role="dialog" aria-modal="true" aria-label="Motyq IQ: Resumo de Inteligência de Compra"
  onMouseDown={e=>{if(e.currentTarget===e.target)onClose();}}>
  <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-2xl bg-[#f4f7fb] shadow-2xl">
   <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 md:px-7">
    <div>
     <p className="text-[11px] font-black uppercase tracking-[.16em] text-cyan-800">MOTYQ IQ · INTELIGÊNCIA DE AQUISIÇÕES</p>
     <h2 className="mt-1 text-2xl font-black text-slate-950">Resumo de Compra</h2>
     <p className="mt-1 text-sm font-semibold text-slate-700">{headline||'Veículo ainda não selecionado'}{target.plate?' · '+target.plate:''}</p>
    </div>
    <button type="button" aria-label="Fechar Resumo de Compra" onClick={onClose}
     className="rounded-full border border-slate-300 bg-slate-50 p-2.5 text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-700"><X size={23}/></button>
   </header>
   <div className="space-y-5 p-4 md:p-6">
    {target.historicalAssessment&&<section className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950" aria-label="Origem histórica da avaliação">
      <p className="text-xs font-black uppercase tracking-wide">Avaliação selecionada no Histórico Inteligente</p>
      <p className="mt-1">{target.historicalAssessment.source} · {target.historicalAssessment.date||'Data não registrada'} · {target.historicalAssessment.status||'Situação não confirmada'}</p>
      <p className="mt-2 font-bold">Valor avaliado: {money(target.historicalAssessment.assessed)}</p>
      <p className="mt-1 font-bold">{target.historicalAssessment.paid===null?
        'Valor avaliado, não pago. Não há compra confirmada neste registro.':
        'Valor pago registrado: '+money(target.historicalAssessment.paid)+
        (target.historicalAssessment.paidBasis==='october_confirmed'?' · conforme regra histórica de outubro.':' · conforme aprovação registrada no Motyq IQ.')}
      </p>
      <p className="mt-2 text-xs leading-5">
       A FIPE arquivada não está confirmada para o mês atual. O valor histórico não foi utilizado automaticamente
       como oferta, custo do Dealer, preço de venda ou anúncio conferido. Confira a versão e informe
       as condições da nova compra antes de tomar uma decisão.
      </p>
    </section>}
    {target.historicalAssessment&&<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Dados aproveitados automaticamente">
      <div className="flex flex-wrap items-start justify-between gap-2">
       <div>
        <p className="text-xs font-black uppercase tracking-wider text-cyan-800">Histórico Inteligente + FIPE + Dealer + Webmotors</p>
        <h3 className="mt-1 text-base font-black text-slate-950">O que já sabemos sobre este veículo</h3>
       </div>
       <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700">Consulta orientativa</span>
      </div>
      <p role="status" className={'mt-3 rounded-lg p-2.5 text-xs leading-5 '+(localFipe?.referenceStatus==='current'||target.fipeStatus==='current'?'bg-emerald-50 text-emerald-950':'bg-amber-50 text-amber-950')}>
       <strong>FIPE:</strong> {autoFipeStatus||'Referência do mês atual não verificada; consulte a versão exata abaixo.'}
      </p>
      {historyStatus==='loading'&&<p role="status" className="mt-3 text-xs font-semibold text-slate-700">Consultando compras e avaliações comparáveis no arquivo autorizado da empresa...</p>}
      {historyStatus==='error'&&<p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs font-semibold text-amber-950">
       Histórico indisponível: {historyError}. Não interprete a ausência de números como zero compras.
      </p>}
      {historicalMetrics&&<div className="mt-3 space-y-2">
       <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
         <p className="text-xs font-bold text-emerald-900">Mediana efetivamente paga</p>
         <p className="mt-1 text-xl font-black text-emerald-950">{money(historicalMetrics.result.paidMedian)}</p>
         <p className="text-[11px] leading-4 text-emerald-900">{historicalMetrics.result.paidCount} compra(s) de mesma versão, ano e KM próximo</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
         <p className="text-xs font-bold text-slate-800">Padrão interno recorrente</p>
         <p className="mt-1 text-xl font-black text-slate-950">{money(historicalMetrics.pattern.operationalSuggestion)}</p>
         <p className="text-[11px] leading-4 text-slate-700">{historicalMetrics.pattern.typicalCount} veículo(s) distintos com o mesmo valor registrado; pode ser cotação</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
         <p className="text-xs font-bold text-slate-800">Maior compra comparável</p>
         <p className="mt-1 text-xl font-black text-slate-950">{money(historicalMetrics.pattern.maxPaid)}</p>
         <p className="text-[11px] leading-4 text-slate-700">Máximo observado, nunca autorização automática de compra</p>
        </div>
       </div>
       <p className="text-xs leading-5 text-slate-700">
        {historicalMetrics.result.exactCount} avaliação(ões) tecnicamente comparável(is), com diferença de KM limitada a 20 mil para preços pagos.
        {historicalMetrics.result.paidCount<3?' Amostra de compras pequena: não determina um teto confiável.':''}
        {historicalMetrics.result.limited?' A consulta histórica foi parcial; não usar os totais como completos.':''}
        {' '}As cotações não entram na mediana paga, e a placa analisada não conta como outra compra independente.
       </p>
       {historicalMetrics.result.historicalAdjustedMedian!==null&&
        (localFipe?.referenceStatus==='current'||target.fipeStatus==='current')&&
        <p className="text-xs font-semibold text-cyan-900">Mediana paga ajustada pela FIPE vigente: {money(historicalMetrics.result.historicalAdjustedMedian)} (referência estatística, sem aprovação automática).</p>}
      </div>}
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
       <p className="rounded-lg bg-slate-50 p-2.5 text-slate-700">
        <strong>Estoque Dealer:</strong> {snapshot?
         data.familyCount+' veículo(s) da família encontrados na fotografia '+stockDate+
         '; versões e anos distintos não são cotação de venda.' :
         'fotografia não importada nesta sessão. Abra o Radar para carregar o estoque.'}
       </p>
       <p className="rounded-lg bg-slate-50 p-2.5 text-slate-700">
        <strong>Mercado Webmotors:</strong> {marketReference?
         money(marketReference)+' em '+checkedListings.count+' anúncios individuais já conferidos.':
         'sem dois anúncios individuais da versão correta já conferidos. Não criamos preço de mercado automaticamente.'}
       </p>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-slate-600">Essas informações são contexto para a Mesa. O teto hipotético abaixo usa somente referência de venda identificada, custos informados e regras de 14% e 5%, quando aplicáveis.</p>
    </section>}
    {stock&&<nav aria-label="Tipo de análise" className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
     <button type="button" aria-pressed={!newPurchaseMode} onClick={()=>setScenarioMode('stock')}
      className={'rounded-lg px-4 py-2 text-sm font-bold '+(!newPurchaseMode?'bg-[#10354f] text-white':'bg-slate-100 text-slate-700 hover:bg-slate-200')}>
      Veículo já no estoque
     </button>
     <button type="button" aria-pressed={newPurchaseMode} onClick={()=>setScenarioMode('purchase')}
      className={'rounded-lg px-4 py-2 text-sm font-bold '+(newPurchaseMode?'bg-[#10354f] text-white':'bg-slate-100 text-slate-700 hover:bg-slate-200')}>
      Simular compra de outro igual
     </button>
    </nav>}
    <section aria-label="Parecer Inteligente da Mesa" className={'rounded-xl border-2 p-4 shadow-sm '+opinionTone}>
     <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
       <p className="text-xs font-black uppercase tracking-wider">Parecer Inteligente da Mesa · {newPurchaseMode?'Nova aquisição':'Estoque existente'}</p>
       <h3 className="mt-1 text-xl font-black md:text-2xl">{opinion.title}</h3>
       <p className="mt-2 max-w-3xl text-sm leading-6">{opinion.rationale}</p>
      </div>
      <span className="rounded-lg border border-current/20 bg-white px-3 py-2 text-xs font-bold text-slate-900">
       Confiança: {opinion.confidence}
      </span>
     </div>
     <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <div className="rounded-lg border border-current/10 bg-white/80 p-3">
       <p className="text-[11px] font-bold text-slate-600">Mercado conferido</p>
       <p className="mt-1 text-base font-black text-slate-900">{opinion.marketSupported?money(marketReference):'A confirmar'}</p>
       <p className="text-[11px] text-slate-600">{checkedListings.count} anúncio(s) individual(is) aceito(s)</p>
      </div>
      <div className="rounded-lg border border-current/10 bg-white/80 p-3">
       <p className="text-[11px] font-bold text-slate-600">Teto pela regra comercial</p>
       <p className="mt-1 text-base font-black text-slate-900">{money(opinion.verifiedCeiling)}</p>
       <p className="text-[11px] text-slate-600">{repasse?'14% + repasse de 5%':'Reserva comercial de 14%'} · preparo {money(preparation)}</p>
      </div>
      <div className="rounded-lg border border-current/10 bg-white/80 p-3">
       <p className="text-[11px] font-bold text-slate-600">Histórico efetivamente pago</p>
       <p className="mt-1 text-base font-black text-slate-900">{historicalMetrics?money(historicalMetrics.result.paidMedian):'A confirmar'}</p>
       <p className="text-[11px] text-slate-600">{historicalMetrics?historicalMetrics.result.paidCount+' compra(s) comparável(is)':historyStatus==='loading'?'Consultando registros...':'Sem confirmação histórica'}</p>
      </div>
     </div>
     {opinion.reasons.length>0&&<div className="mt-3">
      <p className="text-xs font-black">Justificativas verificáveis</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5">
       {opinion.reasons.map((reason,i)=><li key={i}>{reason}</li>)}
      </ul>
     </div>}
     {opinion.missing.length>0&&<div className="mt-3 rounded-lg border border-current/15 bg-white/70 p-3">
      <p className="text-xs font-black">O que falta conferir para aumentar a confiança</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5">
       {opinion.missing.map((item,i)=><li key={i}>{item}</li>)}
      </ul>
     </div>}
     {historyStatus==='error'&&<p role="alert" className="mt-2 text-xs font-semibold">
      Histórico indisponível: {historyError}. Não interpretamos a falha como ausência de compras.
     </p>}
     <p className="mt-3 text-xs font-bold">Próximo passo: {opinion.nextAction}</p>
     <p className="mt-2 border-t border-current/15 pt-2 text-[11px] leading-5">{opinion.warning} Nenhum parecer aprova uma compra automaticamente.</p>
    </section>
    <section className={'flex flex-wrap items-start justify-between gap-4 rounded-xl border p-4 '+signalTone}>
     <div className="max-w-3xl">
      <p className="text-xs font-black uppercase tracking-wide">Indicador operacional do Radar · {newPurchaseMode?'Cenário de nova compra':'Situação do veículo em estoque'} · Não substitui o Parecer Inteligente</p>
      <p className="mt-1 text-xl font-black md:text-2xl">{data.signalTitle}</p>
      <p className="mt-2 text-sm leading-6">
       {data.reasons[0]||'Ainda precisamos conferir os dados para orientar a compra.'}
      </p>
     </div>
     <div className="rounded-lg border border-current/20 bg-white/70 px-3 py-2 text-xs font-bold">
      Sem aprovação automática
     </div>
    </section>
    <section className="rounded-xl border border-cyan-200 bg-white p-4 shadow-sm">
     <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
       <p className="text-xs font-black uppercase tracking-wider text-cyan-800">Até quanto oferecer? · Simulação da Mesa</p>
       <p className="mt-1 text-3xl font-black tracking-tight text-[#0b506c]">{money(ceiling)}</p>
       <p className="mt-1 text-xs leading-5 text-slate-700">
        {ceiling!==null
         ?'Preço de referência × 0,86'+(repasse?' × 0,95':'')+' − preparo '+money(preparation)+'.'
         :'Informe ou confira um preço de venda de referência para calcular um teto hipotético.'}
       </p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Destino do veículo">
       <button type="button" aria-pressed={!repasse} onClick={()=>setRepasse(false)}
        className={'rounded-lg border px-3 py-2 text-xs font-black '+(!repasse?'border-cyan-700 bg-cyan-50 text-cyan-950':'border-slate-300 bg-white text-slate-700')}>
        Showroom · 14%
       </button>
       <button type="button" aria-pressed={repasse} onClick={()=>setRepasse(true)}
        className={'rounded-lg border px-3 py-2 text-xs font-black '+(repasse?'border-cyan-700 bg-cyan-50 text-cyan-950':'border-slate-300 bg-white text-slate-700')}>
        Repasse · +5%
       </button>
      </div>
     </div>
     <p className="mt-2 text-xs leading-5 text-amber-900">
      Base: {ceilingSource}. {!marketReference
        ?'Preço não validado com anúncios individuais Webmotors. O teto é apenas uma hipótese e não autoriza compra.'
        :'Mesmo com anúncios conferidos, exige revisão de versão, custos, laudo e aprovação da Mesa.'}
      {' '}Capital, impostos específicos e outras despesas não informadas podem reduzir esse limite.
     </p>
     {differenceToCeiling!==null&&differenceToCeiling>0&&<p className="mt-2 rounded-lg bg-rose-50 p-2.5 text-xs font-bold text-rose-900">
      O custo atual do estoque está {money(differenceToCeiling)} acima desse teto hipotético para uma nova aquisição.
      Isso não equivale a prejuízo realizado.
     </p>}
    </section>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
     <Metric caption="Fotografia do estoque" value={stockDate} note={snapshot?'Dealer · arquivo importado':'Importe o Dealer no Radar'}/>
     <Metric caption="Família no grupo" value={snapshot?fmt(data.familyCount):'A confirmar'}
      note="Total da família, inclusive outras versões" accent="orange"/>
     <Metric caption="Mesmo ano-modelo no grupo" value={snapshot?fmt(data.yearFamilyCount):'A confirmar'}
      note="Não comprova versão/motor idênticos"/>
     <Metric caption="Estoque da unidade" value={store&&snapshot?fmt(data.storeFamilyCount):'A confirmar'}
      note={store||'Selecione a unidade do Dealer'} accent="dark"/>
     <Metric caption="Idade média em estoque" value={data.ageAverage!==null?fmt(data.ageAverage,1)+' dias':'A confirmar'}
      note="Família/ano ainda disponíveis; não é giro de vendas" accent="cyan"/>
     <Metric caption="Mais de 90 dias" value={hasComparableData?fmt(data.over90Count):'A confirmar'}
      note="Veículos da família e ano-modelo"/>
     <Metric caption="KM médio em estoque" value={data.averageKm!==null?fmt(data.averageKm)+' km':'A confirmar'}
      note="Somente veículos com KM validado"/>
     <Metric caption="Preço sugerido mediano" value={money(data.medianSuggestedPrice)}
      note="Dealer · família e ano, não preço de venda confirmado"/>
     <Metric caption="FIPE do veículo" value={fipeValue>0?money(fipeValue):'A confirmar'}
      note={localFipe?'Mês: '+(localFipe.referenceMonth||'não informado')+
       ' · '+(localFipe.referenceStatus==='current'?'atual':localFipe.referenceStatus==='outdated'?'desatualizada':'não confirmada'):
       target.fipe&&target.fipe>0?'Mês: '+(target.fipeReferenceMonth||'não informado')+
        ' · '+(target.fipeStatus==='current'?'atual':target.fipeStatus==='outdated'?'desatualizada':'não confirmada'):
        'Selecione versão e ano na consulta FIPE abaixo'} accent="dark"/>
     <Metric caption={!newPurchaseMode&&stock?'Custo total no Dealer':'Custo considerado no cenário'}
      value={money(projectedCost)} note={!newPurchaseMode&&stock?'Valor Custo informado; não somar OS novamente':'Compra pretendida + preparação informada'}/>
     <Metric caption="Preço de referência" value={money(data.referencePrice)}
      note={data.referenceSale==='dealer_suggested'?'Preço sugerido no Dealer':
       data.referenceSale==='verified_webmotors'?'Anúncios individuais Webmotors conferidos':
       data.referenceSale==='manual_assumption'?'Simulação digitada, não validada':'Não há preço de venda confiável'} accent="orange"/>
     <Metric caption="Diferença bruta potencial" value={money(data.grossSpread)}
      note={data.grossMarginPercent!==null?fmt(data.grossMarginPercent,1)+'% do preço de referência; não é lucro líquido':'Informe os valores para simular'}/>
    </div>
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
     <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
       <p className="text-xs font-black uppercase tracking-wider text-slate-600">Pesquisa Webmotors conferida pela Mesa</p>
       <p className="mt-1 text-xl font-black text-slate-950">
        {marketReference?money(marketReference):'A confirmar'}
       </p>
       <p className="mt-1 text-xs text-slate-700">
        {checkedListings.count} anúncio(s) único(s), individual(is), conferido(s) pela Mesa · média dos até cinco menores preços aceitos.
        {marketReference?' Este valor é uma referência de anúncio, não preço de venda efetiva.':' Necessários ao menos dois anúncios válidos da mesma versão, ano e KM próximo.'}
       </p>
      </div>
      {marketReference&&<span className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-950">Mercado conferido pelo operador</span>}
     </div>
     {checkedListings.listings.length>0&&<div className="mt-3 flex flex-wrap gap-2">
      {checkedListings.listings.map(ad=><a key={ad.id} href={ad.url} target="_blank" rel="noopener noreferrer"
       className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-cyan-800 underline">
       {money(ad.price)} · {fmt(ad.km)} km · anúncio {ad.id}
      </a>)}
     </div>}
     {checkedListings.rejected.length>0&&<p className="mt-2 text-xs text-amber-900">
      Desconsiderados: {checkedListings.rejected.map(r=>r.count+' '+r.reason).join(' · ')}.
     </p>}
    </section>
    <div className="grid gap-4 lg:grid-cols-[.95fr_1.05fr]">
     <section className={cell}>
      <h3 className={sceneTitle}>Simulação para orientar a compra</h3>
      <p className="mb-3 text-xs leading-5 text-slate-600">
       {!newPurchaseMode&&stock?'Diagnóstico do estoque existente: custo e preço sugerido vêm do Dealer. Mude para Simular compra de outro igual para testar uma nova oferta.':
        'Simule o valor de compra e, opcionalmente, outro preço de venda. O preço sugerido do Dealer é somente uma hipótese, não uma venda realizada.'}
      </p>
      {newPurchaseMode&&<div className="grid gap-3 sm:grid-cols-2">
       <label className="text-xs font-bold text-slate-700">Quanto pretende pagar (R$)
        <input type="text" inputMode="decimal" value={offer} onChange={e=>setOffer(e.target.value)}
         placeholder="Ex.: 65.000" aria-label="Valor de compra pretendido"
         className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-950"/>
       </label>
       <label className="text-xs font-bold text-slate-700">Venda hipotética (R$)
        <input type="text" inputMode="decimal" value={manualSale} onChange={e=>setManualSale(e.target.value)}
         placeholder="Não substitui o mercado" aria-label="Preço de venda hipotético"
         className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-950"/>
       </label>
      </div>}
      {newPurchaseMode&&<div className="mt-3 rounded-xl border border-slate-300 bg-white p-3">
       <label className="block text-xs font-bold text-slate-800">Custo previsto de preparação (R$)
        <input type="text" inputMode="decimal" value={preparationDraft}
         onChange={e=>{setPreparationDraft(e.target.value);setPreparationConfirmed(false);}}
         aria-label="Custo previsto de preparação"
         className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-950"
         placeholder="Ex.: 2.000,00"/>
       </label>
       <label className="mt-2 flex items-start gap-2 text-xs font-semibold text-slate-800">
        <input type="checkbox" checked={preparationConfirmed}
         onChange={e=>setPreparationConfirmed(e.target.checked)}
         className="mt-1 h-4 w-4 shrink-0"/>
        Conferi o custo de preparo desta simulação, mesmo que seja R$ 0. Despesas não informadas podem reduzir o teto.
       </label>
      </div>}
      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-700">
       <p>Preparação {newPurchaseMode?'simulada':'já incorporada ao Valor Custo do Dealer'}: <strong>{money(preparation)}</strong></p>
       <p>Capital em 30 dias ({rate.replace('.',',')}% ao mês): <strong>{money(data.capitalAt30)}</strong></p>
       <p className="mt-1 text-slate-600">A simulação de capital não é despesa comprovada nem foi somada à diferença bruta acima.</p>
      </div>
      <label className="mt-3 block text-xs font-bold text-slate-700">Sua unidade no Dealer
       <select className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"
        value={store} onChange={e=>setStore(e.target.value)}>
        <option value="">Selecione para ver seu estoque</option>
        {(snapshot?.stores||[]).map(s=><option value={s} key={s}>{s}</option>)}
       </select>
      </label>
      {!snapshot&&<button type="button" onClick={()=>{onClose();onOpenRadar?.();}}
       className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-800">
       <Warehouse size={16}/> Importar estoque no Radar <ArrowRight size={14}/>
      </button>}
     </section>
     <section className={cell}>
      <h3 className={sceneTitle}>O que o Motyq está considerando</h3>
      <div className="space-y-2.5">
       {data.reasons.map((reason,i)=><div key={i} className="flex items-start gap-2">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-cyan-700"/>
        <p className="text-xs leading-5 text-slate-700">{reason}</p>
       </div>)}
      </div>
      <div className="mt-4 border-t border-slate-200 pt-3">
       <p className="flex items-center gap-2 text-xs font-black text-amber-900">
        <ShieldAlert size={16}/> Leitura responsável
       </p>
       <p className="mt-1 text-xs leading-5 text-slate-600">O Radar fornece um norte, não aprova compras. Não há MDS regional nem previsão real de giro até integrarmos vendas concluídas e demanda.</p>
      </div>
     </section>
    </div>
    <MarketIqPurchaseSourcesPanel
     vehicle={{brand:target.brand,model:target.model,year:target.year,vehicleType:target.vehicleType}}
     quote={localFipe} onQuote={value=>{manuallySelectedFipe.current=true;setLocalFipe(value);}}
     listings={localListings} onListings={setLocalListings}/>
    <section className={cell}>
     <button type="button" aria-expanded={details} onClick={()=>setDetails(x=>!x)}
      className="flex w-full items-center justify-between gap-3 text-left">
      <span className="flex items-center gap-2 font-black text-slate-950"><BarChart3 size={18} className="text-cyan-700"/> Conferir veículos da família no grupo</span>
      <span className="text-xs font-bold text-cyan-700">{details?'Recolher':'Ver detalhes'} ({fmt(data.familyCount)})</span>
     </button>
     {details&&<div className="mt-3 overflow-x-auto">
      {data.familyRows.length?<table className="w-full min-w-[680px] text-left text-xs">
       <thead className="bg-slate-100"><tr>{['Placa','Modelo informado no Dealer','Ano','Unidade','Dias','Preço sugerido'].map(h=>
        <th key={h} className="px-3 py-2 font-black text-slate-700">{h}</th>)}</tr></thead>
       <tbody>{data.familyRows.slice(0,80).map(v=><tr key={v.key} className="border-b border-slate-100">
        <td className="p-3 font-semibold">{v.plate}</td><td className="p-3">{v.model}</td>
        <td className="p-3">{v.year}</td><td className="p-3">{v.store}</td>
        <td className="p-3">{v.days}</td><td className="p-3">{v.price>0?money(v.price):'Sem preço'}</td>
       </tr>)}</tbody></table>:
       <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Nenhum veículo dessa família foi identificado no arquivo disponível.</p>}
      <p className="mt-2 text-xs text-slate-600">Comparação ampla por família. Confira acabamento, motor, combustível, câmbio, ano e KM antes de considerar preços equivalentes.</p>
     </div>}
    </section>
    <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
     <AlertCircle size={16} className="mt-0.5 shrink-0 text-slate-500"/>
     {data.limits.join(' ')} Nenhum cálculo ou valor deste resumo altera automaticamente a avaliação ou a decisão da Mesa.
    </p>
    <div className="flex flex-wrap items-center justify-end gap-3 pb-1">
     <button type="button" onClick={onClose} className="rounded-lg bg-[#102f46] px-7 py-3 text-sm font-black text-white hover:bg-[#173e5a]">
      Voltar à avaliação
     </button>
    </div>
   </div>
  </div>
 </div>;
}
