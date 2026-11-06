import React,{useEffect,useMemo,useState} from 'react';
import {History,Layers,RefreshCw,ShieldCheck,AlertTriangle} from 'lucide-react';
import {auth} from '../firebase';
import {alignPurchaseReference} from '../services/marketIqPurchaseAlignment';
import {deriveMesaPricePattern} from '../services/marketIqMesaPricePattern';
import type {MonthlyArchiveRow} from '../services/marketIqMonthlyArchive';
import {
 buildComparableHistory,plateComparable,type ComparableCurrent,type ComparableCloud,
 type ComparableEntry
} from '../services/marketIqComparableHistory';

type ArchiveResponse={plateRecords:MonthlyArchiveRow[];records:MonthlyArchiveRow[];
 comparableTotal:number;truncated:boolean;monthsScanned:number;readOnlyPreview?:boolean};
type Props={
 current:ComparableCurrent;cloudHistory:ComparableCloud[];companyId:string;
 verifiedMarketCeiling?:number;historicalModelTarget?:number;
 onOpenPlateHistory?:()=>void;compact?:boolean;
};
const fmt=(v:number|null|undefined)=>v===null||v===undefined?'—':
 v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const fmtN=(n:number)=>n.toLocaleString('pt-BR');
const empty:ArchiveResponse={plateRecords:[],records:[],comparableTotal:0,truncated:false,monthsScanned:0};
const tag=(entry:ComparableEntry)=>entry.grade==='placa'?'Mesma placa':
 entry.grade==='exato'?'Mesma versão · mesmo ano':
 entry.grade==='equivalente'?'Mesma versão · outro ano (fora da média)':'Outra versão (fora da média)';
export default function MarketIqIntelligentHistoryPanel({
 current,cloudHistory,companyId,verifiedMarketCeiling=0,historicalModelTarget=0,
 onOpenPlateHistory,compact=false
}:Props){
 const [data,setData]=useState<ArchiveResponse>(empty);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [selected,setSelected]=useState<'plate'|'similar'|'paid'|'other'>('similar');
 const [reload,setReload]=useState(0);
 const plate=plateComparable(current.plate);
 const plateReady=/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate);
 const modelReady=Boolean(current.brand.trim()&&current.model.trim()&&current.modelYear>=1990);
 const ready=plateReady||modelReady;
 const identity=[companyId,current.vehicleType,plate,current.brand,current.model,current.modelYear,
  current.km,current.fipeCode||''].join('|');
 useEffect(()=>{
  let cancelled=false;
  const controller=new AbortController();
  if(!ready){setData(empty);setError('');setLoading(false);return;}
  setLoading(true);setError('');
  const timer=window.setTimeout(async()=>{
   try{
    const account=auth.currentUser;
    if(!account)throw Error('Entre novamente no Motyq para consultar o histórico.');
    const token=await account.getIdToken();
    const response=await fetch('/api/marketiq-market-scan',{
     method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},
     cache:'no-store',signal:controller.signal,
     body:JSON.stringify({
      action:'monthly_archive_comparables',plate,brand:current.brand,model:current.model,
      modelYear:modelReady?current.modelYear:null,km:current.km,
      version:current.model,fipeCode:current.fipeCode||'',
      vehicleType:current.vehicleType
     })
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(body.error||'Não foi possível consultar as avaliações importadas.');
    if(!cancelled)setData({
     plateRecords:Array.isArray(body.plateRecords)?body.plateRecords:[],
     records:Array.isArray(body.records)?body.records:[],
     comparableTotal:Number(body.comparableTotal)||0,truncated:body.truncated===true,
     monthsScanned:Number(body.monthsScanned)||0,readOnlyPreview:body.readOnlyPreview===true
    });
   }catch(e:any){
    if(!cancelled&&e?.name!=='AbortError'){setData(empty);setError(String(e.message||e));}
   }finally{if(!cancelled)setLoading(false);}
  },450);
  return ()=>{cancelled=true;window.clearTimeout(timer);controller.abort();};
 },[identity,ready,reload]);
 const report=useMemo(()=>buildComparableHistory(current,data.plateRecords,data.records,
  cloudHistory,companyId,data.truncated),[identity,current.fipe,data,cloudHistory,companyId]);
 // Never display a statistical value as a reliable buying offer when confirmed
 // same-version purchases diverge materially. Small samples trigger review,
 // not an unreviewed automatic reduction or an inflated offer.
 const pattern=deriveMesaPricePattern(report.comparables,current.km);
 const priceSignal=alignPurchaseReference({
  verifiedMarketCeiling,statisticalTarget:historicalModelTarget,
  paidCount:report.paidCount,paidMedian:report.paidMedian,
  paidAdjustedMedian:report.historicalAdjustedMedian,
  incompleteHistory:report.limited,historyUnavailable:Boolean(error)
 });
 const matching=report.comparables.filter(r=>r.grade==='exato');
 const otherVersions=report.comparables.filter(r=>r.grade!=='exato');
 const rows=selected==='plate'?report.samePlate:selected==='paid'?
  matching.filter(r=>r.paid!==null):selected==='other'?otherVersions:matching;
 const heading=report.samePlate.length+' passagem(ns) desta placa · '+
  matching.length+' avaliações da mesma versão/ano ('+pattern.uniqueVehicles+
  ' veículos distintos) · '+otherVersions.length+' outras versões/anos';
 return <section className={'rounded-2xl border border-sky-200 bg-white text-slate-950 '+(compact?'p-4':'p-5')}
  aria-label="Histórico Inteligente de Avaliações">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800">Motyq IQ · Inteligência de aquisições</p>
    <h3 className="mt-1 flex items-center gap-2 text-lg font-black"><Layers size={20}/> Histórico Inteligente</h3>
    <p className="mt-1 text-xs text-slate-600">A recomendação considera somente a mesma versão, motorização, combustível, câmbio e ano/modelo. As demais opções ficam separadas.</p>
   </div>
   <button type="button" onClick={()=>setReload(r=>r+1)} disabled={!ready||loading}
    className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 disabled:opacity-50">
    <RefreshCw size={14}/>{loading?'Consultando...':'Atualizar'}
   </button>
  </div>
  {!ready?<p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Informe uma placa ou selecione marca, modelo e ano para consultar o histórico automaticamente.</p>:
  <>
   {error&&<p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950">
    <AlertTriangle size={14} className="mr-1 inline"/>{error} Os registros salvos no Motyq continuam disponíveis.</p>}
   {!error&&<p className="mt-3 text-xs text-slate-600">{heading} · {fmtN(data.monthsScanned)} mês(es) de arquivo consultados.</p>}
   {!error&&data.readOnlyPreview&&<p className="mt-1 text-xs font-semibold text-emerald-800">Consultado na base oficial da empresa · homologação somente leitura.</p>}
   {error&&<p className="mt-3 text-sm font-bold text-amber-900">Consulta incompleta: a quantidade de avaliações e compras não pôde ser confirmada. Não considere zero como resultado.</p>}
   {!error&&<div className="mt-3 grid grid-cols-3 gap-2">
    <div className="rounded-xl bg-slate-50 p-3 text-center"><strong className="text-xl">{fmtN(report.samePlate.length)}</strong><p className="text-[10px] text-slate-600">Mesma placa</p></div>
    <div className="rounded-xl bg-sky-50 p-3 text-center"><strong className="text-xl">{fmtN(report.exactCount)}</strong><p className="text-[10px] text-sky-900">Mesmo ano/versão</p></div>
    <div className="rounded-xl bg-emerald-50 p-3 text-center"><strong className="text-xl">{fmtN(report.paidCount)}</strong><p className="text-[10px] text-emerald-950">Compras comparáveis</p></div>
   </div>}
   {!error&&<div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div className="flex flex-wrap items-end justify-between gap-2">
     <div><p className="text-xs font-bold text-slate-700">Mediana de compras comparáveis</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{fmt(report.paidMedian)}</p></div>
     <p className="text-xs font-bold text-slate-700">Confiança {report.confidence}</p>
    </div>
    {report.historicalAdjustedMedian!==null&&<p className="mt-2 text-xs text-slate-700">
     Mediana ajustada à FIPE atual: <strong>{fmt(report.historicalAdjustedMedian)}</strong>
     {report.historicalLow!==null&&report.historicalHigh!==null?
      ' · faixa central '+fmt(report.historicalLow)+' a '+fmt(report.historicalHigh):''}
    </p>}
    <p className="mt-2 text-[11px] text-slate-600">A mediana utiliza apenas compras confirmadas da mesma versão e ano/modelo, com KM até 20 mil da atual. Compras do Motyq têm valor aprovado/pago; outubro/2026 utiliza a regra operacional confirmada da Mesa para status UTILIZADO. Cotações e outros meses não viram valores pagos automaticamente.</p>
   </div>}
   {!error&&pattern.operationalSuggestion!==null&&<div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3">
    <p className="text-xs font-black uppercase tracking-wide text-emerald-900">Padrão de negociação da Mesa · mesma versão e ano</p>
    <p className="mt-1 text-3xl font-black text-emerald-950">{fmt(pattern.operationalSuggestion)}</p>
    <p className="mt-1 text-sm font-bold text-emerald-950">
     {pattern.confidence==='baixa'?'Indicação inicial, amostra pequena':'Referência operacional sugerida, sujeita à aprovação'}
    </p>
    <p className="mt-1 text-xs leading-5 text-emerald-950">
     {pattern.quoteVehicles} veículo(s) com preço registrado, em {pattern.assessmentEvents} avaliação(ões).
     {pattern.repeatedPlateEvents>0?' '+pattern.repeatedPlateEvents+' passagem(ns) repetida(s) da mesma placa foram desconsideradas no cálculo.':''}
     {pattern.typicalQuote!==null?' Valor mais recorrente: '+fmt(pattern.typicalQuote)+' em '+pattern.typicalCount+' veículo(s) diferente(s).':''}
    </p>
    <div className="mt-3 grid grid-cols-2 gap-2">
     <div className="rounded-lg bg-white p-2">
      <p className="text-[11px] font-semibold text-slate-700">Mediana efetivamente paga</p>
      <p className="text-lg font-black text-slate-950">{fmt(pattern.confirmedPaidMedian)}</p>
      <p className="text-[11px] text-slate-700">{pattern.paidVehicles} compra(s) de placas distintas</p>
     </div>
     <div className="rounded-lg bg-white p-2">
      <p className="text-[11px] font-semibold text-slate-700">Maior compra confirmada</p>
      <p className="text-lg font-black text-slate-950">{fmt(pattern.maxPaid)}</p>
      <p className="text-[11px] text-slate-700">Máximo observado, não limite automático</p>
     </div>
    </div>
    {pattern.maxPaid!==null&&pattern.maxPaid>pattern.operationalSuggestion*1.05&&
     <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-bold text-amber-950">
      Valor(es) acima do padrão podem ser exceções comerciais. Antes de usar o máximo como teto, confirme a justificativa e a aprovação da direção.
     </p>}
    <p className="mt-2 text-[11px] leading-5 text-emerald-950">
     O padrão combina preços avaliados e pagos sem confundi-los com compras realizadas. Veículos de mesma placa contam somente uma vez;
     custos, preparação, condição, FIPE, Webmotors e decisões excepcionais precisam ser analisados à parte.
    </p>
   </div>}
      <div className={'mt-3 rounded-xl border p-3 '+(priceSignal.status==='review_required'?
    'border-amber-300 bg-amber-50':'border-sky-200 bg-sky-50')}>
    <div className="flex flex-wrap items-center gap-2"><ShieldCheck size={17} className={priceSignal.status==='review_required'?'text-amber-900':'text-sky-800'}/>
     <p className={'text-xs font-bold uppercase tracking-wide '+(priceSignal.status==='review_required'?'text-amber-950':'text-sky-900')}>
      {priceSignal.status==='review_required'?'Atenção · referência acima das compras':priceSignal.status==='unverified'&&priceSignal.evidence==='statistical_model'?'Estimativa estatística não calibrada':'Referência para decisão'}</p></div>
    {priceSignal.status==='review_required'?<>
      <p className="mt-2 text-sm font-bold text-amber-950">Revisão obrigatória antes de definir o valor de compra.</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
       <div><p className="text-xs text-amber-950">Modelo / Webmotors</p>
        <p className="text-lg font-black text-amber-950">{fmt(priceSignal.reference)}</p></div>
       <div><p className="text-xs text-amber-950">Mediana de compras iguais</p>
        <p className="text-lg font-black text-amber-950">{fmt(report.paidMedian)}</p></div>
      </div>
      {priceSignal.difference!==null&&<p className="mt-2 text-sm font-bold text-amber-950">
       Diferença: {fmt(priceSignal.difference)} ({priceSignal.differencePercent?.toLocaleString('pt-BR',{maximumFractionDigits:1})}% acima
       {priceSignal.historyIsFipeAdjusted?' da mediana ajustada à FIPE atual':' da mediana histórica'}).
      </p>}
      <p className="mt-2 text-xs leading-5 text-amber-950">
       Foram identificadas {report.paidCount} compras comparáveis, mas a amostra é pequena. O valor do modelo
       não deve ser tratado como oferta recomendada sem conferir Webmotors, estado do veículo e custos.
       Valores apenas avaliados não foram usados como compras.
      </p>
     </>:<>
      <strong className="mt-1 block text-2xl text-sky-950">
       {priceSignal.suggested!==null?fmt(priceSignal.suggested):'A confirmar'}
      </strong>
      <p className="mt-1 text-xs text-sky-950">
       {priceSignal.status==='history_capped'?
        'Teto conservador calculado com compras da mesma versão e ano/modelo.':
        priceSignal.status==='partial'||priceSignal.status==='unverified'&&Boolean(error)?
         'O histórico não foi confirmado. Não use este painel para definir a oferta.':
         priceSignal.evidence==='statistical_model'?
          'Estimativa do modelo estatístico, ainda sem amostra suficiente de compras para validação.':
          priceSignal.evidence==='verified_webmotors'?
           'Referência baseada em anúncios Webmotors conferidos, sujeita à aprovação da Mesa.':
           'Referência insuficiente. Confira o veículo antes de negociar.'}
      </p>
      {priceSignal.reference!==null&&priceSignal.suggested===null&&
       <p className="mt-1 text-xs text-sky-900">Estimativa não validada: {fmt(priceSignal.reference)}</p>}
     </>}
    <p className={'mt-2 text-[11px] '+(priceSignal.status==='review_required'?'text-amber-950':'text-sky-900')}>
     Não substitui laudo, custos, pesquisa Webmotors nem aprovação da Mesa. A sugestão não altera o valor salvo automaticamente.
    </p>
   </div>
   {!error&&<div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Tipo de histórico">
    {([
     ['plate','Mesma placa ('+report.samePlate.length+')'],
     ['similar','Mesma versão ('+matching.length+')'],
     ['paid','Compras iguais ('+matching.filter(e=>e.paid!==null).length+')'],
     ['other','Outras versões ('+otherVersions.length+')']
    ] as const).map(([k,title])=><button key={k} type="button" role="tab" aria-selected={selected===k}
      onClick={()=>setSelected(k)} style={{color:selected===k?'#ffffff':'#334155'}}
      className={'rounded-full border px-3 py-2 text-xs font-bold '+(selected===k?
       'border-sky-700 bg-sky-800 text-white':'border-slate-300 bg-white text-slate-700')}>{title}</button>)}
   </div>}
   {!error&&selected==='other'&&<p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-950">
    Apenas para consulta. Motorizações, versões e anos diferentes não entram na mediana nem na sugestão de compra.
   </p>}
   {!error&&<div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
    {!rows.length?<p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
     {loading?'Buscando avaliações...':selected==='similar'||selected==='paid'?'Nenhuma avaliação dessa versão e ano/modelo encontrada. Consulte outras versões apenas como contexto, sem usá-las como base para precificar.':'Nenhum registro encontrado nesta categoria.'}</p>:
    rows.slice(0,35).map(e=><article key={e.id} className="rounded-xl border border-slate-200 bg-white p-3">
     <div className="flex flex-wrap justify-between gap-2">
      <div><p className="text-sm font-bold">{e.brand} {e.model} {e.year}</p>
       <p className="text-xs text-slate-600">{e.version||'Versão não informada'} · {e.km===null?'KM não registrada':fmtN(e.km)+' km'}</p>
      </div>
      <div className="text-right">
       <p className="text-sm font-black">{e.paid!==null?fmt(e.paid):fmt(e.assessed)}</p>
       <p className="text-[11px] text-slate-600">{e.paid!==null?
        e.paidBasis==='october_confirmed'?'Pago · regra histórica':'Pago · aprovação Motyq':
        'Valor avaliado, não pago'}</p>
      </div>
     </div>
     <p className="mt-2 text-[11px] text-slate-600">
      {e.date||'Data indisponível'} · {e.plate||'Sem placa'} · {e.source} · {tag(e)}
     </p>
    </article>)}
   </div>}
   {!error&&(rows.length>35||report.limited)&&<p className="mt-2 text-xs font-semibold text-amber-900">
    Exibindo parte dos registros disponíveis. Não use outras versões ou anos como base da mediana.</p>}
   {!error&&onOpenPlateHistory&&plateReady&&<button type="button" onClick={onOpenPlateHistory}
    className="mt-3 flex items-center gap-2 text-xs font-bold text-sky-800"><History size={16}/> Abrir linha do tempo completa da placa</button>}
  </>}
 </section>;
}
