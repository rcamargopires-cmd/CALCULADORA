import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, History, RefreshCw, Search } from 'lucide-react';
import { MarketIQEvaluation, marketIqEvaluationService } from '../services/marketIqEvaluationService';

type Props={companyId:string;storeId:string};
const money=(value?:number)=>typeof value==='number'&&Number.isFinite(value)
  ? value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Não informado';
const when=(value:any)=>{
  const date=value?.toDate?.() || (value?.seconds?new Date(value.seconds*1000):value?new Date(value):null);
  return date&&Number.isFinite(date.getTime())?date.toLocaleString('pt-BR'):'Data indisponível';
};
const status=(value:MarketIQEvaluation['status'])=>value==='approved'?'Aprovada':value==='rejected'?'Recusada':'Rascunho';

const EvaluatorHistory:React.FC<Props>=({companyId,storeId})=>{
  const[items,setItems]=useState<MarketIQEvaluation[]>([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const[search,setSearch]=useState('');
  const[filter,setFilter]=useState<'all'|'draft'|'approved'|'rejected'>('all');
  const[expanded,setExpanded]=useState<string|null>(null);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{setItems(await marketIqEvaluationService.listByStore(companyId,storeId));}
    catch(err){console.error('Histórico do avaliador:',err);setError('Não foi possível carregar as avaliações salvas. Verifique a conexão e as permissões da unidade.');}
    finally{setLoading(false);}
  },[companyId,storeId]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    const updated=()=>{void load();};
    window.addEventListener('motyq:marketiq-history-updated',updated);
    window.addEventListener('focus',updated);
    return()=>{window.removeEventListener('motyq:marketiq-history-updated',updated);window.removeEventListener('focus',updated);};
  },[load]);
  const results=useMemo(()=>{
    const needle=search.trim().toLocaleLowerCase('pt-BR');
    return items.filter(row=>(filter==='all'||row.status===filter)&&(!needle||[row.plate,row.vehicle,row.createdByName,row.sellerName,row.customerName]
      .some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(needle))));
  },[items,search,filter]);
  return <section className="mt-4 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 sm:p-6">
      <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-700">MARKETIQ · ARQUIVO</p>
        <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-900"><History size={20}/> Histórico de avaliações</h2>
        <p className="mt-1 text-xs text-slate-500">Avaliações registradas na sua unidade, inclusive as já concluídas.</p>
      </div>
      <button type="button" onClick={()=>void load()} disabled={loading}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 disabled:opacity-50">
        <RefreshCw size={15} className={loading?'animate-spin':''}/> ATUALIZAR
      </button>
    </div>
    <div className="space-y-3 p-4 sm:p-6">
      <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3">
        <Search size={16} className="text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Buscar placa, modelo ou avaliador" aria-label="Buscar avaliações"
          className="w-full min-w-0 bg-transparent text-sm text-slate-800 outline-none"/>
      </label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar situação das avaliações">
        {([['all','Todas'],['draft','Em andamento'],['approved','Aprovadas'],['rejected','Recusadas']] as const).map(([value,label])=>
          <button key={value} type="button" aria-pressed={filter===value} onClick={()=>setFilter(value)}
            className={'rounded-xl border px-3 py-2 text-xs font-bold '+(filter===value?'border-cyan-700 bg-cyan-700 text-white':'border-slate-200 bg-white text-slate-600')}>
            {label}
          </button>)}
      </div>
      {loading&&<p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Carregando histórico...</p>}
      {error&&<p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{error}</p>}
      {!loading&&!error&&!results.length&&<p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
        {items.length?'Nenhuma avaliação corresponde à busca.':'Ainda não há avaliações salvas no MarketIQ desta unidade.'}
      </p>}
      {!loading&&!error&&results.map(item=><article key={item.id} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
        <button type="button" onClick={()=>setExpanded(old=>old===item.id?null:item.id)}
          aria-expanded={expanded===item.id} className="flex w-full min-w-0 items-start justify-between gap-3 text-left">
          <div className="min-w-0">
            <p className="font-mono text-base font-black tracking-wide text-slate-900">{item.plate||'SEM PLACA'}</p>
            <p className="mt-1 break-words text-sm font-semibold text-slate-700">{item.vehicle||'Veículo não informado'}{item.year?' · '+item.year:''}</p>
            <p className="mt-1 text-xs text-slate-500">{when(item.createdAt)}</p>
          </div>
          <span className={'shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold '+(item.status==='approved'?'border-emerald-200 bg-emerald-50 text-emerald-700':item.status==='rejected'?'border-red-200 bg-red-50 text-red-700':'border-amber-200 bg-amber-50 text-amber-800')}>{status(item.status)}</span>
        </button>
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-slate-600">
          <span>Compra recomendada: <strong className="text-slate-800">{money(item.recommendedBuy)}</strong></span>
          <span>Avaliador: {item.createdByName||'Não informado'}</span>
        </div>
        {expanded===item.id&&<div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-xs text-slate-600">
          <span>Quilometragem: <strong>{item.km||'—'}</strong></span>
          <span>FIPE: <strong>{item.fipe||'—'}</strong></span>
          <span>Destino: <strong>{item.commercialDestination||'—'}</strong></span>
          <span>Classificação: <strong>{item.commercialClass||'—'}</strong></span>
          <span>Fotos: <strong>{item.photos?.length||0}</strong></span>
          <span>Apontamentos: <strong>{item.damages?.length||0}</strong></span>
          {!!item.previousEvaluationId&&<p className="col-span-2 text-xs text-slate-500">Nova avaliação vinculada à anterior. Registros anteriores preservados.</p>}
          <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-3">
            <strong className="text-xs text-slate-800">Ver evolução</strong>
            {(item.revisionHistory||[]).length?
              <ol className="mt-2 space-y-2">{item.revisionHistory!.map(entry=><li key={entry.id} className="border-l-2 border-cyan-200 pl-3">
                <span className="font-semibold text-slate-700">{entry.type==='created'?'Rascunho criado':entry.type==='draft_updated'?'Rascunho atualizado':entry.type==='approved'?'Avaliação aprovada':'Avaliação recusada'}</span>
                <span className="block text-slate-500">{when(entry.at)} · {entry.byName||entry.byEmail||'Avaliador'}{typeof entry.recommendedBuy==='number'?' · '+money(entry.recommendedBuy):''}</span>
                <span className="block break-words text-slate-500">{entry.km?entry.km+' km · ':''}{entry.notes||''}</span>
              </li>)}</ol>
              :<p className="mt-1 text-xs text-slate-500">Registro anterior ao controle de versões. Nenhuma etapa foi inventada.</p>}
          </div>
          {!!item.notes&&<p className="col-span-2 whitespace-pre-wrap break-words rounded-xl bg-white p-3">{item.notes}</p>}
        </div>}
      </article>)}
      {!loading&&!error&&items.length>0&&<p className="text-xs text-slate-500">{results.length} de {items.length} avaliações da unidade. Toque em um registro para ver mais detalhes.</p>}
    </div>
  </section>;
};
export default EvaluatorHistory;
