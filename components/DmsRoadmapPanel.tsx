import React, { useMemo, useState } from 'react';
import { CheckCircle2, Circle, ClipboardCheck, ChevronDown, ChevronUp, X } from 'lucide-react';
import { DMS_ROADMAP_PHASES, dmsRoadmapSummary } from '../services/dmsRoadmap';

const DmsRoadmapPanel:React.FC=()=>{
  const[open,setOpen]=useState(false);
  const[expanded,setExpanded]=useState<Record<string,boolean>>({F1:true,F2:true,F3:true});
  const summary=useMemo(()=>dmsRoadmapSummary(),[]);
  const toggle=(id:string)=>setExpanded(current=>({...current,[id]:!current[id]}));

  return <>
    <button type="button" title="Roadmap DMS" className="hidden" onClick={()=>setOpen(true)}>Roadmap DMS</button>
    {open&&<div className="fixed inset-0 z-[288] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm md:p-6" onClick={()=>setOpen(false)}>
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[30px] border border-slate-200 bg-white text-slate-900 shadow-2xl" onClick={event=>event.stopPropagation()}>
        <header className="sticky top-0 z-20 flex flex-col gap-4 border-b border-slate-200 bg-white/95 p-5 backdrop-blur sm:flex-row sm:items-start sm:justify-between md:p-7">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-blue-700">MOTYQ · CONSTRUÇÃO DO DMS</p>
            <h2 className="mt-1 text-2xl font-semibold">Roadmap mestre</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">Este é o nosso checklist oficial. Item concluído fica marcado. Mudanças futuras entram aqui antes de serem consideradas encerradas.</p>
          </div>
          <button onClick={()=>setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-500"><X size={18}/></button>
        </header>

        <div className="p-5 md:p-7">
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-4"><p className="text-[10px] font-black uppercase tracking-[.12em] text-emerald-700">Implementado</p><p className="mt-1 text-3xl font-semibold">{summary.done}</p><p className="mt-1 text-xs text-emerald-700/70">itens concluídos</p></div>
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-500">Total planejado</p><p className="mt-1 text-3xl font-semibold">{summary.total}</p><p className="mt-1 text-xs text-slate-500">itens no roadmap</p></div>
            <div className="rounded-[22px] border border-blue-200 bg-blue-50 p-4"><p className="text-[10px] font-black uppercase tracking-[.12em] text-blue-700">Progresso</p><p className="mt-1 text-3xl font-semibold">{summary.percent}%</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600" style={{width:`${summary.percent}%`}}/></div></div>
          </section>

          <div className="mt-6 space-y-4">
            {DMS_ROADMAP_PHASES.map(phase=>{
              const done=phase.items.filter(item=>item.done).length;
              const percent=Math.round(done/phase.items.length*100);
              const isOpen=Boolean(expanded[phase.id]);
              return <section key={phase.id} className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                <button onClick={()=>toggle(phase.id)} className="flex w-full items-start justify-between gap-4 p-5 text-left hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-black text-blue-700">{phase.id}</span><h3 className="font-semibold">{phase.title.replace(`${phase.id} · `,'')}</h3></div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{phase.goal}</p>
                    <div className="mt-3 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{width:`${percent}%`}}/></div><span className="shrink-0 text-xs font-semibold text-slate-500">{done}/{phase.items.length}</span></div>
                  </div>
                  {isOpen?<ChevronUp size={18} className="mt-1 shrink-0 text-slate-400"/>:<ChevronDown size={18} className="mt-1 shrink-0 text-slate-400"/>}
                </button>
                {isOpen&&<div className="border-t border-slate-100 p-4 sm:p-5">
                  <div className="grid gap-2 lg:grid-cols-2">
                    {phase.items.map(item=><div key={item.id} className={`flex items-start gap-3 rounded-xl border p-3 ${item.done?'border-emerald-100 bg-emerald-50/60':'border-slate-200 bg-white'}`}>
                      {item.done?<CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600"/>:<Circle size={18} className="mt-0.5 shrink-0 text-slate-300"/>}
                      <div><div className="flex items-center gap-2"><span className="font-mono text-[10px] font-bold text-slate-400">{item.id}</span>{item.done&&<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">FEITO</span>}</div><p className={`mt-1 text-sm ${item.done?'font-semibold text-slate-700':'text-slate-600'}`}>{item.label}</p>{item.note&&<p className="mt-1 text-[11px] text-slate-500">{item.note}</p>}</div>
                    </div>)}
                  </div>
                </div>}
              </section>;
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="flex items-start gap-3"><ClipboardCheck size={18} className="mt-0.5 shrink-0"/><p><b>Regra do projeto:</b> daqui para frente, nenhuma melhoria entra como “concluída” sem o respectivo checkbox deste roadmap ser atualizado.</p></div>
          </div>
        </div>
      </div>
    </div>}
  </>;
};

export default DmsRoadmapPanel;
