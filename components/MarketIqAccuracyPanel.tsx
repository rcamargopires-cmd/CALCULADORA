import React,{useMemo,useState} from 'react';
import type {LearningHistoryRecord} from '../services/marketIqLearning';
import {buildMarketIqAccuracy,type AccuracyCase,type AccuracyStats} from '../services/marketIqAccuracy';

const fmt=(n:number)=>n.toLocaleString('pt-BR');
const brl=(n:number|null)=>n===null?'—':n.toLocaleString('pt-BR',{
 style:'currency',currency:'BRL',maximumFractionDigits:0
});
const pct=(n:number|null)=>n===null?'—':n.toLocaleString('pt-BR',{
 minimumFractionDigits:1,maximumFractionDigits:1
})+'%';
const hitLines=[
 {limit:3,key:'within3Percent' as const,count:'within3Count' as const},
 {limit:5,key:'within5Percent' as const,count:'within5Count' as const},
 {limit:10,key:'within10Percent' as const,count:'within10Count' as const}
];
const KindButton=({
 label,active,onClick
}:{label:string;active:boolean;onClick:()=>void})=><button type="button" onClick={onClick}
 aria-pressed={active}
 className={'rounded-lg border px-4 py-2 text-sm font-bold transition '+(
   active?'border-cyan-800 bg-cyan-900 text-white':'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
 )}>{label}</button>;

export default function MarketIqAccuracyPanel({history}:{history:LearningHistoryRecord[]}){
 const report=useMemo(()=>buildMarketIqAccuracy(history),[history]);
 const [selected,setSelected]=useState<'all'|'car'|'motorcycle'>('all');
 const stats:AccuracyStats=selected==='car'?report.cars:selected==='motorcycle'?report.motorcycles:report.all;
 const label=selected==='car'?'automóveis':selected==='motorcycle'?'motocicletas':'veículos';
 return <section className="rounded-xl border border-slate-200 bg-white p-4 text-slate-950 sm:p-5">
   <div className="flex flex-wrap items-start justify-between gap-3">
     <div className="max-w-3xl">
       <h3 className="text-lg font-black">Precisão real da Mesa</h3>
       <p className="mt-1 text-sm leading-5 text-slate-700">
         Quanto a primeira estimativa do Motyq ficou próxima do valor aprovado e pago.
         O percentual de diferença é calculado sobre o <strong>valor efetivamente pago</strong>.
         Nenhuma fórmula de precificação é modificada aqui.
       </p>
     </div>
     <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar precisão por tipo de veículo">
       <KindButton label="Todos" active={selected==='all'} onClick={()=>setSelected('all')}/>
       <KindButton label="Automóveis" active={selected==='car'} onClick={()=>setSelected('car')}/>
       <KindButton label="Motocicletas" active={selected==='motorcycle'} onClick={()=>setSelected('motorcycle')}/>
     </div>
   </div>
   <div className="mt-4 grid gap-3 sm:grid-cols-3">
     <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
       <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Compras com valor pago</p>
       <p className="mt-1 text-2xl font-black">{fmt(stats.paidCount)}</p>
     </div>
     <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
       <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Comparações válidas</p>
       <p className="mt-1 text-2xl font-black">{fmt(stats.comparableCount)}</p>
     </div>
     <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
       <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Erro médio absoluto</p>
       <p className="mt-1 text-2xl font-black">{brl(stats.meanAbsoluteError)}</p>
     </div>
   </div>
   {stats.comparableCount===0?
     <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
       Ainda não há estimativas originais comparáveis com valores pagos para {label}.
       As compras continuam contabilizadas, mas não vamos fabricar um percentual de acerto.
     </p>:
     <>
       <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)]">
         <div className="space-y-4">
           <h4 className="text-sm font-black">Avaliações dentro da faixa de diferença</h4>
           {hitLines.map(item=>{
             const percent=stats[item.key]||0;
             return <div key={item.limit}>
               <div className="mb-2 flex items-center justify-between text-sm">
                 <span className="font-semibold text-slate-800">Dentro de ±{item.limit}%</span>
                 <strong>{pct(stats[item.key])} <span className="font-normal text-slate-600">({stats[item.count]}/{stats.comparableCount})</span></strong>
               </div>
               <div className="h-3 overflow-hidden rounded-full bg-slate-200"
                 role="progressbar" aria-label={'Avaliações dentro de '+item.limit+' por cento'}
                 aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                 <div className="h-full rounded-full bg-cyan-700" style={{width:percent+'%'}}/>
               </div>
             </div>;
           })}
         </div>
         <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
           <p className="text-xs font-bold uppercase text-slate-600">Erro percentual médio absoluto</p>
           <p className="mt-1 text-2xl font-black">{pct(stats.meanAbsolutePercent)}</p>
           <p className="mt-3 text-xs text-slate-700">Mediana da diferença: <strong>{pct(stats.medianAbsolutePercent)}</strong></p>
           <p className="mt-2 text-xs text-slate-700">Tendência média: <strong>{brl(stats.meanSignedError)}</strong> {stats.meanSignedError!==null?(stats.meanSignedError>=0?'acima do pago':'abaixo do pago'):''}</p>
           <p className="mt-3 text-xs text-slate-600">Acerto considera a diferença absoluta em relação ao preço pago, não ao valor FIPE.</p>
         </div>
       </div>
       {stats.comparableCount<20&&<p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
         <strong>Amostra pequena ({stats.comparableCount}).</strong> Os percentuais mostram somente as avaliações registradas e podem variar muito conforme novas compras são adicionadas.
       </p>}
     </>
   }
   {(stats.withoutEstimateCount>0||stats.ambiguousCount>0||stats.preliminaryCount>0)&&
     <div className="mt-4 space-y-1 rounded-lg border border-slate-200 p-3 text-xs text-slate-700">
       {stats.withoutEstimateCount>0&&<p>{stats.withoutEstimateCount} compra(s) sem estimativa original válida ficaram fora da medição de precisão.</p>}
       {stats.ambiguousCount>0&&<p>{stats.ambiguousCount} compra(s) com avaliação antiga duplicada ou data incompatível também ficaram fora, para não atribuir o pagamento à previsão errada.</p>}
       {stats.preliminaryCount>0&&<p>{stats.preliminaryCount} comparação(ões) usam estimativas preliminares, sem anúncios de mercado suficientemente conferidos.</p>}
     </div>}
   {stats.outliers.length>0&&<div className="mt-5">
     <h4 className="text-sm font-black">Maiores divergências para conferir</h4>
     <p className="mt-1 text-xs text-slate-600">Exibindo até 5 avaliações de {label} com maior diferença percentual, sem ajustar a fórmula automaticamente.</p>
     <div className="mt-2 overflow-x-auto">
       <table className="w-full min-w-[650px] text-left text-xs">
         <thead><tr className="border-b border-slate-300 bg-slate-50 text-slate-800">
           <th className="px-3 py-3">Placa / veículo</th>
           <th className="px-3 py-3 text-right">Estimado</th>
           <th className="px-3 py-3 text-right">Aprovado/pago</th>
           <th className="px-3 py-3 text-right">Diferença</th>
         </tr></thead>
         <tbody>{stats.outliers.map((item:AccuracyCase)=><tr key={item.id} className="border-b border-slate-200">
           <td className="px-3 py-3"><strong>{item.plate||'Sem placa'}</strong><p className="mt-1 max-w-[270px] truncate text-slate-700" title={item.vehicle}>{item.vehicle||'Veículo'}</p></td>
           <td className="px-3 py-3 text-right">{brl(item.estimated)}</td>
           <td className="px-3 py-3 text-right">{brl(item.paid)}</td>
           <td className="px-3 py-3 text-right font-bold">{pct(item.relativeDifference*100)}</td>
         </tr>)}</tbody>
       </table>
     </div>
   </div>}
 </section>;
}
