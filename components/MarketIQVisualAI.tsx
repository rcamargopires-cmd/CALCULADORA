import React,{useEffect,useMemo,useState} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, BrainCircuit, Camera, CheckCircle2, RefreshCw, Sparkles, X } from 'lucide-react';
import { auth } from '../firebase';
import { User } from '../types';
import { marketIqEvaluationService, MarketIQEvaluation } from '../services/marketIqEvaluationService';

type Props={currentUser:User;companyId:string;storeId:string};
type Finding={area:string;finding:string;confidence:'high'|'medium'|'low';severity:'low'|'medium'|'high';action:string};
type Result={
  visualScore:number;overallConfidence:'high'|'medium'|'low';summary:string;findings:Finding[];
  missingViews:string[];photoCoverage:number;estimatedPrepLow:number;estimatedPrepHigh:number;
  impactSuggested:number;pricingNote:string;safetyNote:string;model?:string;
};

const money=(value:number)=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const cleanPlate=(value:string)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const marketRoot=()=>Array.from(document.querySelectorAll('div.fixed.inset-0')).find(el=>String(el.textContent||'').includes('MOTYQ MARKETIQ')) as HTMLElement|undefined;
const currentValue=(label:string)=>{
  const root=marketRoot();if(!root)return'';
  const wanted=label.toLowerCase();
  const node=Array.from(root.querySelectorAll('label')).find(el=>String(el.textContent||'').toLowerCase().includes(wanted));
  const control=node?.querySelector('input,select,textarea') as HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|null;
  if(!control)return'';
  if(control instanceof HTMLSelectElement)return String(control.options[control.selectedIndex]?.text||control.value||'').trim();
  return String(control.value||'').trim();
};
const confidenceLabel=(value:string)=>value==='high'?'ALTA':value==='medium'?'MÉDIA':'BAIXA';
const confidenceClass=(value:string)=>value==='high'?'border-emerald-200 bg-emerald-50 text-emerald-700':value==='medium'?'border-amber-200 bg-amber-50 text-amber-700':'border-rose-200 bg-rose-50 text-rose-700';

const MarketIQVisualAI:React.FC<Props>=({currentUser,companyId,storeId})=>{
  const[portalHost,setPortalHost]=useState<HTMLElement|null>(null);
  const[open,setOpen]=useState(false);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState('');
  const[result,setResult]=useState<Result|null>(null);
  const[evaluation,setEvaluation]=useState<MarketIQEvaluation|null>(null);

  useEffect(()=>{
    if(currentUser.role==='evaluator')return;
    const locate=()=>{
      const root=marketRoot();
      if(!root){setPortalHost(null);return;}
      const title=Array.from(root.querySelectorAll('h3')).find(el=>String(el.textContent||'').includes('Mercado & referências')) as HTMLElement|undefined;
      const header=title?.parentElement as HTMLElement|null;
      if(!header){setPortalHost(null);return;}
      let host=header.querySelector('[data-marketiq-visual-ai-host]') as HTMLElement|null;
      if(!host){host=document.createElement('div');host.setAttribute('data-marketiq-visual-ai-host','true');host.className='ml-2 shrink-0';header.appendChild(host);}
      setPortalHost(host);
    };
    locate();
    const observer=new MutationObserver(locate);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[currentUser.role]);

  const imagePhotos=useMemo(()=>(evaluation?.photos||[]).filter(item=>String(item.contentType||'').startsWith('image/')&&String(item.url||'').startsWith('data:image/')).slice(0,10),[evaluation]);

  const loadEvaluation=async()=>{
    const plate=cleanPlate(currentValue('Placa'));
    if(!plate){setEvaluation(null);return null;}
    const latest=await marketIqEvaluationService.getLatestByPlate(companyId,storeId,plate).catch(()=>null);
    setEvaluation(latest);
    return latest;
  };

  const analyze=async()=>{
    setOpen(true);setLoading(true);setError('');setResult(null);
    try{
      const latest=await loadEvaluation();
      const photos=(latest?.photos||[]).filter(item=>String(item.contentType||'').startsWith('image/')&&String(item.url||'').startsWith('data:image/')).slice(0,10);
      if(!photos.length)throw new Error('Nenhuma foto da inspeção foi encontrada para este veículo. Salve a inspeção com fotos antes de analisar.');
      const token=await auth.currentUser?.getIdToken();
      if(!token)throw new Error('Sua sessão expirou. Entre novamente no Motyq.');
      const response=await fetch('/api/marketiq-market-scan',{
        method:'POST',
        headers:{'content-type':'application/json','authorization':`Bearer ${token}`},
        body:JSON.stringify({
          action:'visual_analysis',
          plate:currentValue('Placa'),
          vehicle:currentValue('Modelo / versão'),
          year:currentValue('Ano/modelo'),
          km:currentValue('KM atual'),
          fipe:currentValue('FIPE'),
          damageTotal:Number(latest?.damageTotal||0),
          photos:photos.map(item=>({category:item.category,url:item.url,name:item.name})),
        }),
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(payload?.error||'Não foi possível analisar as fotos agora.');
      setResult(payload as Result);
    }catch(e:any){setError(e?.message||'Não foi possível analisar as fotos agora.');}
    finally{setLoading(false);}
  };

  if(currentUser.role==='evaluator')return null;

  const trigger=<button onClick={()=>void analyze()} disabled={loading} title="Analisar fotos da inspeção com IA" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 text-[10px] font-black uppercase tracking-[.08em] text-violet-700 transition hover:bg-violet-50 disabled:opacity-60">
    {loading?<RefreshCw size={12} className="animate-spin"/>:<Sparkles size={12}/>}ANÁLISE IA
  </button>;

  return <>
    {portalHost&&createPortal(trigger,portalHost)}
    {open&&<div className="fixed inset-0 z-[725] overflow-y-auto bg-slate-950/40 p-3 backdrop-blur-sm md:p-6" onClick={()=>!loading&&setOpen(false)}>
      <div className="mx-auto my-3 w-full max-w-4xl overflow-hidden rounded-[26px] border border-slate-200 bg-white text-slate-900 shadow-2xl" onClick={e=>e.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 md:px-6">
          <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-violet-700">MOTYQ IQ · VISÃO COMPUTACIONAL</p><h3 className="mt-1 text-xl font-semibold">Análise visual da inspeção</h3><p className="mt-1 text-sm text-slate-500">Apoio à Mesa de Precificação com base nas fotos do avaliador.</p></div>
          <button disabled={loading} onClick={()=>setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"><X size={17}/></button>
        </header>

        <div className="p-4 md:p-6">
          {loading&&<div className="grid min-h-[280px] place-items-center rounded-2xl border border-violet-100 bg-violet-50/50 p-8 text-center"><div><BrainCircuit size={34} className="mx-auto animate-pulse text-violet-600"/><p className="mt-4 font-semibold">Analisando as fotos...</p><p className="mt-1 text-sm text-slate-500">A IA está procurando avarias aparentes, desgaste, cobertura fotográfica e impacto provável de preparação.</p></div></div>}
          {!loading&&error&&<div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">{error}</div>}

          {!loading&&result&&<>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4"><p className="text-[9px] font-black uppercase tracking-[.12em] text-violet-700">SCORE VISUAL</p><p className="mt-1 text-3xl font-semibold">{result.visualScore}/100</p></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">COBERTURA DE FOTOS</p><p className="mt-1 text-3xl font-semibold">{result.photoCoverage}%</p></div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-[9px] font-black uppercase tracking-[.12em] text-amber-700">PREPARAÇÃO VISUAL</p><p className="mt-1 text-lg font-semibold">{money(result.estimatedPrepLow)} a {money(result.estimatedPrepHigh)}</p></div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4"><p className="text-[9px] font-black uppercase tracking-[.12em] text-rose-700">IMPACTO SUGERIDO</p><p className="mt-1 text-2xl font-semibold">{result.impactSuggested?money(result.impactSuggested):'R$ 0'}</p></div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${confidenceClass(result.overallConfidence)}`}>CONFIANÇA {confidenceLabel(result.overallConfidence)}</span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600">{imagePhotos.length||evaluation?.photos?.length||0} foto(s) consideradas</span>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-500">RESUMO DA IA</p><p className="mt-2 text-sm leading-6 text-slate-700">{result.summary}</p></div>

            <div className="mt-5">
              <div className="mb-3 flex items-center gap-2"><Camera size={16} className="text-violet-600"/><h4 className="font-semibold">Achados visuais</h4></div>
              <div className="space-y-2">{result.findings?.length?result.findings.map((item,index)=><div key={index} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{item.area}</strong><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${confidenceClass(item.confidence)}`}>{confidenceLabel(item.confidence)}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${item.severity==='high'?'bg-rose-50 text-rose-700':item.severity==='medium'?'bg-amber-50 text-amber-700':'bg-slate-100 text-slate-600'}`}>RISCO {item.severity==='high'?'ALTO':item.severity==='medium'?'MÉDIO':'BAIXO'}</span></div>
                <p className="mt-2 text-sm text-slate-700">{item.finding}</p><p className="mt-1 text-xs text-slate-500">{item.action}</p>
              </div>):<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"><CheckCircle2 size={17} className="mr-2 inline"/>Nenhum achado visual relevante foi identificado nas fotos fornecidas.</div>}</div>
            </div>

            {!!result.missingViews?.length&&<div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-2"><AlertTriangle size={17} className="mt-0.5 text-amber-600"/><div><p className="text-xs font-black uppercase tracking-[.1em] text-amber-800">FOTOS QUE FALTAM</p><p className="mt-1 text-sm text-amber-900">{result.missingViews.join(', ')}</p></div></div></div>}

            <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4"><p className="text-[10px] font-black uppercase tracking-[.12em] text-violet-700">LEITURA PARA A MESA</p><p className="mt-2 text-sm leading-6 text-violet-950">{result.pricingNote}</p></div>
            <p className="mt-4 text-[11px] leading-5 text-slate-500">{result.safetyNote}</p>
          </>}
        </div>
      </div>
    </div>}
  </>;
};

export default MarketIQVisualAI;
