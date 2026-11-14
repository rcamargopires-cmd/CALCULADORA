import React,{useState} from 'react';
import MarketIqExpressPrintPanel from './MarketIqExpressPrintPanel';
import type {ExpressVehicleExtract,ExpressAssessment} from '../services/marketIqExpress';

/** No privileged data, no Firebase authentication, no live OCR.
 * This standalone walkthrough exists only for testing the proposed commercial decision.
 */
export default function MarketIqExpressDemoRoute(){
 const [open,setOpen]=useState(true);
 const [last,setLast]=useState<{vehicle:ExpressVehicleExtract;assessment:ExpressAssessment}|null>(null);
 return <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
  <div className="mx-auto max-w-xl space-y-4 rounded-2xl bg-white p-6 shadow">
   <p className="text-xs font-black uppercase tracking-widest text-cyan-800">Motyq IQ Express</p>
   <h1 className="text-2xl font-black">Laboratório de classificação</h1>
   <p className="text-sm text-slate-700">Esta página é um teste isolado, sem login, sem leitura de imagens e sem acesso ao histórico real do Motyq.</p>
   <button onClick={()=>setOpen(true)} type="button" className="w-full rounded-xl bg-cyan-800 px-4 py-3 font-black text-white">Abrir teste com o Prisma</button>
   {last&&<section role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">
    <p className="text-sm font-black text-emerald-900">Classificação concluída (somente demonstração)</p>
    <h2 className="mt-2 text-lg font-bold">{last.vehicle.brand} {last.vehicle.model}</h2>
    <p className="mt-2 text-sm">Prioridade: <strong>{last.assessment.priority}</strong></p>
    <p className="text-sm">Diretriz técnica: classe {last.assessment.fleetClass||'a conferir'} · {last.assessment.fleetGuideline||'não definida'}</p>
    <p className="mt-2 text-xs">{last.assessment.reason}</p>
    {last.assessment.policyConflict&&<p className="mt-2 text-xs font-bold text-amber-900">Atenção: requer análise do gestor por conflito com a diretriz técnica.</p>}
   </section>}
   <p className="text-xs text-slate-600">O sistema oficial em app.motyq.com.br não foi alterado.</p>
  </div>
  {open&&<MarketIqExpressPrintPanel demoOnly onClose={()=>setOpen(false)}
   onApply={(vehicle,assessment)=>{setLast({vehicle,assessment});setOpen(false);}}/>}
 </main>;
}
