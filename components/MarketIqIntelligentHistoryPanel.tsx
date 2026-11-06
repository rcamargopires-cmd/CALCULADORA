import React,{useEffect,useMemo,useState} from 'react';
import {History,Layers,RefreshCw,ShieldCheck,AlertTriangle} from 'lucide-react';
import {auth} from '../firebase';
import type {MonthlyArchiveRow} from '../services/marketIqMonthlyArchive';
import {
 buildComparableHistory,plateComparable,type ComparableCurrent,type ComparableCloud,
 type ComparableEntry
} from '../services/marketIqComparableHistory';

type ArchiveResponse={plateRecords:MonthlyArchiveRow[];records:MonthlyArchiveRow[];
 comparableTotal:number;truncated:boolean;monthsScanned:number};
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
 entry.grade==='exato'?'Versão equivalente · mesmo ano':
 entry.grade==='equivalente'?'Versão equivalente · ano próximo':'Modelo semelhante (não entra na média)';
export default function MarketIqIntelligentHistoryPanel({
 current,cloudHistory,companyId,verifiedMarketCeiling=0,historicalModelTarget=0,
 onOpenPlateHistory,compact=false
}:Props){
 const [data,setData]=useState<ArchiveResponse>(empty);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [selected,setSelected]=useState<'plate'|'similar'|'paid'>('similar');
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
     monthsScanned:Number(body.monthsScanned)||0
    });
   }catch(e:any){
    if(!cancelled&&e?.name!=='AbortError'){setData(empty);setError(String(e.message||e));}
   }finally{if(!cancelled)setLoading(false);}
  },450);
  return ()=>{cancelled=true;window.clearTimeout(timer);controller.abort();};
 },[identity,ready,reload]);
 const report=useMemo(()=>buildComparableHistory(current,data.plateRecords,data.records,
  cloudHistory,companyId,data.truncated),[identity,current.fipe,data,cloudHistory,companyId]);
 // The verified Webmotors ceiling remains the primary decision. History is a
 // cross-check, never a way to promote an unverified indexed offer.
 const historicalCap=report.paidCount>=3?report.historicalAdjustedMedian:null;
 const base=verifiedMarketCeiling>0?verifiedMarketCeiling:
  historicalModelTarget>0?historicalModelTarget:null;
 const suggestion=base!==null&&historicalCap!==null?Math.min(base,historicalCap):base;
 const sources=verifiedMarketCeiling>0?'Webmotors validada + histórico':
  historicalModelTarget>0?'Modelo estatístico histórico':'Histórico insuficiente';
 const rows=selected==='plate'?report.samePlate:selected==='paid'?
  report.comparables.filter(r=>r.paid!==null):report.comparables;
 const heading=report.samePlate.length+' passagem(ns) desta placa · '+
  report.comparables.length+' comparáveis carregados';
 return <section className={'rounded-2xl border border-sky-200 bg-white text-slate-950 '+(compact?'p-4':'p-5')}
  aria-label="Histórico Inteligente de Avaliações">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800">Motyq IQ · Inteligência de aquisições</p>
    <h3 className="mt-1 flex items-center gap-2 text-lg font-black"><Layers size={20}/> Histórico Inteligente</h3>
    <p className="mt-1 text-xs text-slate-600">Mesma placa, mesmo modelo, ano e KM. Sem misturar versões diferentes na referência de compra.</p>
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
   {error&&<p className="mt-3 text-sm font-bold text-amber-900">Consulta incompleta: a quantidade de avaliações e compras não pôde ser confirmada. Não considere zero como resultado.</p>}
   {!error&&<div className="mt-3 grid grid-cols-3 gap-2">
    <div className="rounded-xl bg-slate-50 p-3 text-center"><strong className="text-xl">{fmtN(report.samePlate.length)}</strong><p className="text-[10px] text-slate-600">Mesma placa</p></div>
    <div className="rounded-xl bg-sky-50 p-3 text-center"><strong className="text-xl">{fmtN(report.exactCount)}</strong><p className="text-[10px] text-sky-900">Mesmo ano/versão</p></div>
    <div className="rounded-xl bg-emerald-50 p-3 text-center"><strong className="text-xl">{fmtN(report.paidCount)}</strong><p className="text-[10px] text-emerald-950">Compras comparáveis</p></div>
   </div>
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
    <p className="mt-2 text-[11px] text-slate-600">A mediana utiliza apenas compras reconhecidas, com versão equivalente e KM até 20 mil da atual. Compras do Motyq têm valor aprovado/pago; outubro/2026 utiliza a regra operacional confirmada da Mesa para status UTILIZADO. Cotações e outros meses não viram valores pagos automaticamente.</p>
   </div>
   <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
    <div className="flex flex-wrap items-center gap-2"><ShieldCheck size={17} className="text-sky-800"/>
     <p className="text-xs font-bold uppercase tracking-wide text-sky-900">Referência para decisão</p></div>
    <strong className="mt-1 block text-2xl text-sky-950">{fmt(suggestion)}</strong>
    <p className="mt-1 text-xs text-sky-950">{suggestion===null?
     'Ainda não há mercado verificado nem modelo histórico suficiente para sugerir compra.':
     historicalCap!==null?'Teto conservador entre '+sources+'.':'Base: '+sources+'. Histórico local ainda não calibra este valor.'}</p>
    <p className="mt-1 text-[11px] text-sky-900">Não substitui laudo, custos, pesquisa Webmotors nem aprovação da Mesa. A sugestão não altera o valor salvo automaticamente.</p>
   </div>
   {!error&&<div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Tipo de histórico">
    {([
     ['plate','Mesma placa ('+report.samePlate.length+')'],
     ['similar','Comparáveis ('+report.comparables.length+')'],
     ['paid','Compras ('+report.comparables.filter(e=>e.paid!==null).length+')']
    ] as const).map(([k,title])=><button key={k} type="button" role="tab" aria-selected={selected===k}
      onClick={()=>setSelected(k)} style={{color:selected===k?'#ffffff':'#334155'}}
      className={'rounded-full border px-3 py-2 text-xs font-bold '+(selected===k?
       'border-sky-700 bg-sky-800 text-white':'border-slate-300 bg-white text-slate-700')}>{title}</button>)}
   </div>
   {!error&&<div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
    {!rows.length?<p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
     {loading?'Buscando avaliações...':'Nenhum registro nesta categoria. Importe os meses no Arquivo Mensal ou registre uma avaliação no Motyq.'}</p>:
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
   </div>
   {!error&&(report.comparables.length>35||report.limited)&&<p className="mt-2 text-xs font-semibold text-amber-900">
    Exibindo parte dos comparáveis. Refine a consulta para avaliar o conjunto completo.</p>}
   {!error&&onOpenPlateHistory&&plateReady&&<button type="button" onClick={onOpenPlateHistory}
    className="mt-3 flex items-center gap-2 text-xs font-bold text-sky-800"><History size={16}/> Abrir linha do tempo completa da placa</button>}
  </>}
 </section>;
}
