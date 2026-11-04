import React,{useMemo,useState} from 'react';
import type {LearningHistoryRecord} from '../services/marketIqLearning';
import {buildMarketIqLearningInsights,type InsightGroup,type InsightKind} from '../services/marketIqLearningInsights';

const money=(n:number|null)=>n===null?'—':n.toLocaleString('pt-BR',{
 style:'currency',currency:'BRL',maximumFractionDigits:0
});
const num=(n:number)=>n.toLocaleString('pt-BR');
const pct=(n:number)=>(n>0?'+':'')+n.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
const shortPct=(n:number)=>n.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
const date=(s:string)=>s&&/^\d{4}-\d{2}-\d{2}$/.test(s)?
 s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—';
const groupLabel=(g:InsightGroup)=>g.insight==='descriptive'?'Leitura descritiva':
 g.insight==='exploratory'?'Indício inicial':'Amostra insuficiente';
const deviationLabel=(signed:number)=>signed>1?'Estimativa acima do pago':
 signed< -1?'Estimativa abaixo do pago':'Estimativa próxima do pago';
type Dimension='model'|'class'|'km';

export default function MarketIqLearningInsightsPanel({history}:{history:LearningHistoryRecord[]}){
 const [kind,setKind]=useState<InsightKind>('all');
 const [dimension,setDimension]=useState<Dimension>('model');
 const report=useMemo(()=>buildMarketIqLearningInsights(history,kind),[history,kind]);
 const groups=dimension==='model'?report.groupsByModel:
  dimension==='class'?report.groupsByClass:report.groupsByKm;
 const labeledKind=kind==='car'?'automóveis':kind==='motorcycle'?'motocicletas':'veículos';
 return <section className="rounded-xl border border-slate-200 bg-white p-4 text-slate-950 sm:p-5" aria-label="Aprendizado IQ 2.0">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="max-w-3xl">
    <h3 className="text-lg font-black">Aprendizado IQ 2.0 · Onde acertamos e onde revisar</h3>
    <p className="mt-1 text-sm leading-6 text-slate-700">
     Compara a <strong>estimativa original</strong> com o valor aprovado e efetivamente pago
     registrado na Mesa. Os grupos revelam padrões no histórico, sem modificar nenhum preço.
    </p>
   </div>
   <div role="group" aria-label="Tipo de veículo do aprendizado" className="flex flex-wrap gap-1.5">
    {([['all','Todos'],['car','Carros'],['motorcycle','Motos']] as const).map(([value,label])=>
     <button key={value} type="button" onClick={()=>setKind(value)} aria-pressed={kind===value}
      className={'rounded-lg border px-3 py-2 text-xs font-bold '+(kind===value?
       'border-cyan-800 bg-cyan-900 text-white':'border-slate-300 bg-white text-slate-800 hover:bg-slate-100')}>
      {label}
     </button>)}
   </div>
  </div>
  <div className="mt-4 grid gap-3 sm:grid-cols-3">
   <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
    <p className="text-xs font-bold text-slate-600">Compras registradas</p>
    <p className="mt-1 text-2xl font-black">{num(report.paidRecords)}</p>
   </div>
   <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
    <p className="text-xs font-bold text-slate-600">Estimativa original comparável</p>
    <p className="mt-1 text-2xl font-black">{num(report.comparableCount)}</p>
   </div>
   <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
    <p className="text-xs font-bold text-slate-600">Sem comparação segura</p>
    <p className="mt-1 text-2xl font-black">{num(report.missingOriginal+report.ambiguous)}</p>
   </div>
  </div>
  {report.comparableCount===0?
   <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
    Ainda não há compras de {labeledKind} com estimativa original e valor pago
    comparáveis. Continue registrando o valor final na Mesa. Nenhum acerto foi presumido.
   </p>:
   <>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
     <h4 className="text-sm font-black">Desempenho por grupo</h4>
     <div className="flex flex-wrap gap-1.5" role="group" aria-label="Agrupar aprendizado">
      {([['model','Modelos'],['class','Classe registrada'],['km','Faixa de KM']] as const).map(([value,label])=>
       <button key={value} type="button" onClick={()=>setDimension(value)} aria-pressed={dimension===value}
        className={'rounded-lg px-3 py-2 text-xs font-bold '+(dimension===value?
         'bg-slate-800 text-white':'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50')}>
        {label}
       </button>)}
     </div>
    </div>
    <p className="mt-2 text-xs leading-5 text-slate-600">
     Exibimos até 10 grupos por volume de compras comparáveis. Para leituras mais estáveis,
     procuramos pelo menos 5 casos no mesmo grupo. Com 1 ou 2, o resultado é apenas ilustrativo.
     Na classe, usamos o enquadramento registrado na época e nunca reclassificamos o passado pela KM.
    </p>
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
     <table className="w-full min-w-[710px] text-left text-xs">
      <thead className="bg-slate-50 text-slate-700"><tr>
       <th className="px-3 py-3">Grupo / amostra</th>
       <th className="px-3 py-3 text-right">Comparações</th>
       <th className="px-3 py-3 text-right">Dentro de ±5%</th>
       <th className="px-3 py-3 text-right">Erro médio</th>
       <th className="px-3 py-3 text-right">Tendência</th>
      </tr></thead>
      <tbody>
       {groups.slice(0,10).map(g=><tr key={g.key} className="border-t border-slate-200">
        <td className="px-3 py-3">
         <p className="font-bold text-slate-950">{g.label}</p>
         <p className={'mt-1 text-[11px] '+(g.insight==='insufficient'?'text-amber-900':'text-slate-600')}>{groupLabel(g)}</p>
        </td>
        <td className="px-3 py-3 text-right font-bold">{g.count}</td>
        <td className="px-3 py-3 text-right">{shortPct(g.within5Percent)}</td>
        <td className="px-3 py-3 text-right">
         <span className="font-semibold">{shortPct(g.meanAbsolutePercent)}</span>
         <p className="mt-1 text-[11px] text-slate-600">{money(g.meanAbsoluteError)}</p>
        </td>
        <td className="px-3 py-3 text-right">
         <span className={g.meanSignedPercent>1?'font-bold text-amber-900':
          g.meanSignedPercent< -1?'font-bold text-sky-800':'font-semibold text-slate-800'}>
          {pct(g.meanSignedPercent)}
         </span>
         <p className="mt-1 text-[11px] text-slate-600">{deviationLabel(g.meanSignedPercent)}</p>
        </td>
       </tr>)}
      </tbody>
     </table>
    </div>
    {groups.some(g=>g.count<3)&&<p className="mt-2 text-xs font-semibold text-amber-900">
     Atenção: grupos com menos de 3 comparações não permitem concluir se o sistema acerta ou erra consistentemente.
    </p>}
    <div className="mt-5">
     <h4 className="text-sm font-black">Casos para revisar na Mesa</h4>
     <p className="mt-1 text-xs text-slate-600">
      Cinco maiores diferenças percentuais registradas, incluindo avaliações preliminares quando houver.
      Uma divergência não significa que o preço da compra esteja incorreto.
     </p>
     <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[660px] text-left text-xs">
       <thead className="bg-slate-50 text-slate-700"><tr>
        <th className="px-3 py-3">Veículo / placa</th>
        <th className="px-3 py-3 text-right">Estimativa original</th>
        <th className="px-3 py-3 text-right">Pago</th>
        <th className="px-3 py-3 text-right">Variação</th>
       </tr></thead>
       <tbody>{report.highDivergence.map(r=><tr key={r.id} className="border-t border-slate-200">
        <td className="px-3 py-3 font-semibold">{r.label}
         <p className="mt-1 text-[11px] font-normal text-slate-600">
          {r.plate||'Sem placa'} · {date(r.date)}{r.provisional?' · estimativa preliminar':''}
         </p>
        </td>
        <td className="px-3 py-3 text-right">{money(r.estimated)}</td>
        <td className="px-3 py-3 text-right">{money(r.paid)}</td>
        <td className="px-3 py-3 text-right font-black">{pct(r.signedPercent)}
         <p className="mt-1 text-[11px] font-normal text-slate-600">{deviationLabel(r.signedPercent)}</p>
        </td>
       </tr>)}</tbody>
      </table>
     </div>
    </div>
   </>
  }
  <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
   <strong>Leitura dos sinais:</strong> tendência positiva indica que a estimativa foi maior que o valor pago;
   negativa indica que ficou abaixo. A diferença é medida sobre o preço efetivamente pago.
   {report.provisionalCount>0?' Há '+report.provisionalCount+' estimativa(s) preliminar(es) incluída(s), que exigem interpretação cautelosa.':''}
   {' '}O status COMPRA de uma planilha e valores avaliados importados não entram nesta comparação.
   Este painel não recalibra automaticamente a compra ou a margem.
  </p>
 </section>;
}
