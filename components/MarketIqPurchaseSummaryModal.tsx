import React,{useEffect,useMemo,useState} from 'react';
import {AlertCircle,ArrowRight,BarChart3,CheckCircle2,Clock3,FileSearch,ShieldAlert,Warehouse,X} from 'lucide-react';
import type {DealerStockSnapshot} from '../services/marketIqDealerRadar';
import {buildPurchaseRadar,calculateMesaPurchaseCeiling,modelYear,type PurchaseRadarTarget} from '../services/marketIqPurchaseRadar';
import MarketIqPurchaseSourcesPanel from './MarketIqPurchaseSourcesPanel';
import {summarizeOperatorWebmotors,type RadarFipeQuote,type RadarWebmotorsListing} from '../services/marketIqPurchaseEvidence';
type Props={
 open:boolean;onClose:()=>void;target:PurchaseRadarTarget;
 snapshot:DealerStockSnapshot|null;onOpenRadar?:()=>void;
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
export default function MarketIqPurchaseSummaryModal({open,onClose,target,snapshot,onOpenRadar}:Props){
 const [store,setStore]=useState('');
 const [offer,setOffer]=useState('');
 const [manualSale,setManualSale]=useState('');
 const [details,setDetails]=useState(false);
 const [rate,setRate]=useState('1.5');
 const [scenarioMode,setScenarioMode]=useState<'stock'|'purchase'>('stock');
 const [repasse,setRepasse]=useState(false);
 const [localFipe,setLocalFipe]=useState<RadarFipeQuote|null>(null);
 const [localListings,setLocalListings]=useState<RadarWebmotorsListing[]>([]);
 useEffect(()=>{
  if(!open)return;
  setStore(target.store||'');setOffer(target.offer&&target.offer>0?String(target.offer):'');
  setManualSale('');setDetails(false);setRate('1.5');setRepasse(false);
  setLocalFipe(null);setLocalListings([]);
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
  manualSalePrice:manualSale.trim()?numeric(manualSale):undefined,
  dealerSuggestedSalePrice:newPurchaseMode&&stock&&!manualSale.trim()?stock.price:undefined,
  verifiedMarketPrice:marketReference||0,marketAdsVerified:checkedListings.count
 },store,Number(rate.replace(',','.'))||1.5),
 [snapshot,target,stock,newPurchaseMode,store,offer,manualSale,rate,fipeValue,
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
 const preparation=Math.max(0,target.preparation||0);
 const projectedCost=!newPurchaseMode&&stock?.cost&&stock.cost>0?stock.cost:
  numeric(offer)>0?numeric(offer)+preparation:null;
 const ceilingBenchmark=marketReference||data.referencePrice;
 const ceiling=calculateMesaPurchaseCeiling(ceilingBenchmark,preparation,repasse);
 const ceilingSource=marketReference?'média dos anúncios Webmotors conferidos pela Mesa':
  data.referenceSale==='dealer_suggested'?'preço sugerido no Dealer':
  data.referenceSale==='manual_assumption'?'preço de venda hipotético digitado':'fonte não confirmada';
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
    <section className={'flex flex-wrap items-start justify-between gap-4 rounded-xl border p-4 '+signalTone}>
     <div className="max-w-3xl">
      <p className="text-xs font-black uppercase tracking-wide">Sinal da Mesa · {newPurchaseMode?'Cenário de nova compra':'Situação do veículo em estoque'} · Orientação preliminar</p>
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
      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-700">
       <p>Preparação prevista na ficha: <strong>{money(target.preparation||0)}</strong></p>
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
     quote={localFipe} onQuote={setLocalFipe}
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
