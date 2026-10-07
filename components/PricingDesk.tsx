import React,{useEffect,useMemo,useState} from 'react';
import { Calculator, Clock3, Gauge, Play, RefreshCw } from 'lucide-react';
import { User } from '../types';
import { companyIdForUser } from '../services/companyService';
import { storeIdForUser } from '../services/storeService';
import { companyScopeService } from '../services/companyScopeService';
import { storeScopeService } from '../services/storeScopeService';
import { EvaluationQueueRequest,evaluationQueueService } from '../services/evaluationQueueService';

const ACTIVE_EVALUATION_REQUEST_KEY='motyq:active-evaluation-request-v2';
const money=(value?:number)=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—';

const PricingDesk:React.FC<{user:User;defaultOpen?:boolean}>=({user,defaultOpen=false})=>{
  const companyId=user.role==='admin'?companyScopeService.get(user):companyIdForUser(user);
  const storeId=user.role==='admin'?storeScopeService.get(user):storeIdForUser(user);
  const[requests,setRequests]=useState<EvaluationQueueRequest[]>([]);
  const[open,setOpen]=useState(defaultOpen);
  const[busyId,setBusyId]=useState('');
  const[error,setError]=useState('');

  useEffect(()=>{
    if(!companyId||!storeId)return;
    return evaluationQueueService.subscribe(user,companyId,storeId,setRequests,()=>setError('Não foi possível carregar a mesa de precificação.'));
  },[user,companyId,storeId]);

  const queue=useMemo(()=>requests.filter(item=>item.status==='awaiting_pricing'||item.status==='pricing'||(item.status==='completed'&&!!item.marketIqEvaluationId&&typeof item.recommendedBuy!=='number')),[requests]);
  const waiting=queue.filter(item=>item.status==='awaiting_pricing'||item.status==='completed').length;
  const active=queue.filter(item=>item.status==='pricing').length;

  const startPricing=async(request:EvaluationQueueRequest)=>{
    if(busyId)return;
    setBusyId(request.id);setError('');
    try{
      if(request.status==='awaiting_pricing'||request.status==='completed')await evaluationQueueService.startPricing(request.id,user);
      const activeRequest:EvaluationQueueRequest={...request,status:'pricing',pricingEmail:user.email.toLowerCase(),pricingName:user.name||user.email};
      window.sessionStorage.setItem(ACTIVE_EVALUATION_REQUEST_KEY,JSON.stringify(activeRequest));
      setOpen(false);
      window.dispatchEvent(new CustomEvent('motyq:marketiq-open-request-v2',{detail:activeRequest}));
    }catch(e){
      console.error('Pricing desk could not open evaluation',e);
      setError('Não foi possível abrir esta avaliação na mesa de precificação.');
    }finally{setBusyId('');}
  };

  if(!['manager','admin'].includes(String(user.role)))return null;

  return <>
    <button onClick={()=>{setOpen(true);setError('');}} title="Mesa de Precificação"
      className="fixed bottom-[322px] right-4 z-[157] flex h-[60px] w-[150px] max-w-[calc(100vw-32px)] items-center gap-2 overflow-hidden rounded-2xl border border-violet-300/25 bg-[#11191b]/95 px-3 py-2 text-left text-white shadow-2xl shadow-black/35 backdrop-blur-xl transition hover:border-violet-300/45 hover:bg-[#161b28] active:scale-[.98]">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-violet-300/20 bg-violet-300/[.08] text-violet-300"><Calculator size={17}/></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[8px] font-black uppercase tracking-[.11em] text-violet-300">MESA DE PREÇO</span><span className="mt-0.5 block truncate text-[12px] font-semibold leading-4">{waiting?waiting+' aguardando':active?active+' em análise':'Fila vazia'}</span></span>
    </button>

    {open&&<div className="fixed inset-0 z-[735] overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-sm md:p-6" onClick={()=>setOpen(false)}>
      <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-[26px] border border-slate-200 bg-white text-slate-800 shadow-2xl" onClick={event=>event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 md:px-7">
          <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-violet-600">MOTYQ IQ · ETAPA 3 DE 3</p><h2 className="mt-1 text-2xl font-semibold">Mesa de Precificação</h2><p className="mt-1 text-sm text-slate-500">Somente veículos já inspecionados entram aqui. FIPE, MarketScan, preparação, Buy Score e decisão final.</p></div>
          <button onClick={()=>setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">×</button>
        </header>

        {error&&<div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 md:mx-7">{error}</div>}

        <div className="p-5 md:p-7">
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs text-amber-700">Aguardando precificação</p><strong className="text-2xl text-amber-800">{waiting}</strong></div>
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4"><p className="text-xs text-violet-700">Em precificação</p><strong className="text-2xl text-violet-800">{active}</strong></div>
          </div>

          {!queue.length?<div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center"><div><RefreshCw size={24} className="mx-auto text-slate-400"/><p className="mt-3 font-semibold">Mesa vazia</p><p className="mt-1 text-sm text-slate-500">Quando o avaliador concluir fotos e inspeção, o veículo aparece aqui.</p></div></div>
          :<div className="space-y-3">{queue.map(item=><article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="font-mono text-lg font-black tracking-wider">{item.plate}</p><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${item.status==='pricing'?'border-violet-200 bg-violet-50 text-violet-700':'border-amber-200 bg-amber-50 text-amber-700'}`}>{item.status==='pricing'?'EM PRECIFICAÇÃO':'AGUARDANDO PREÇO'}</span></div>
                <p className="mt-1 text-sm font-semibold text-slate-700">{item.vehicle||'Veículo a identificar'}{item.year?' · '+item.year:''}{item.km?' · '+item.km+' km':''}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>Vendedor: {item.requesterName}</span><span>Avaliador: {item.evaluatorName||'—'}</span><span>Chave: {item.hasSpareKey==='yes'?'Sim':item.hasSpareKey==='no'?'Não':'—'}</span><span>Manual: {item.hasManual==='yes'?'Sim':item.hasManual==='no'?'Não':'—'}</span></div>
                {typeof item.recommendedBuy==='number'&&<p className="mt-2 text-sm text-emerald-700">Última referência: <strong>{money(item.recommendedBuy)}</strong></p>}
              </div>
              <button disabled={busyId===item.id} onClick={()=>void startPricing(item)} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-50"><Play size={16}/>{busyId===item.id?'ABRINDO...':item.status==='pricing'?'CONTINUAR PRECIFICAÇÃO':'PRECIFICAR'}</button>
            </div>
          </article>)}</div>}
        </div>
      </div>
    </div>}
  </>;
};

export default PricingDesk;
