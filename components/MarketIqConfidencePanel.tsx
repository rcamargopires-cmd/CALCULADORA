import React from 'react';
import type {EvidenceResult,EvidenceState} from '../services/marketIqConfidence';

const levels={
 pending:{title:'Aguardando dados do veículo',border:'border-slate-300',bg:'bg-slate-100',text:'text-slate-800',bar:'bg-slate-500'},
 low:{title:'Confiança baixa',border:'border-amber-300',bg:'bg-amber-50',text:'text-amber-950',bar:'bg-amber-600'},
 medium:{title:'Confiança moderada',border:'border-cyan-300',bg:'bg-cyan-50',text:'text-cyan-950',bar:'bg-cyan-700'},
 high:{title:'Confiança alta',border:'border-emerald-300',bg:'bg-emerald-50',text:'text-emerald-950',bar:'bg-emerald-700'}
};
const mark:Record<EvidenceState,string>={good:'✓',limited:'◐',missing:'!'};
const stateTone:Record<EvidenceState,string>={
 good:'text-emerald-800',limited:'text-amber-900',missing:'text-slate-600'
};

export default function MarketIqConfidencePanel({result}:{result:EvidenceResult}){
 const tone=levels[result.level];
 return <section aria-label="Confiança das evidências da avaliação"
  className="rounded-xl border border-slate-200 bg-white p-4 text-slate-950 sm:p-5">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div>
    <h2 className="text-lg font-black">Confiança das evidências · Motyq IQ</h2>
    <p className="mt-1 text-sm text-slate-700">Qualidade das informações usadas para apoiar esta avaliação, não probabilidade de acerto do preço.</p>
   </div>
   <span role="status" className={'rounded-lg border px-4 py-2 text-sm font-black '+tone.border+' '+tone.bg+' '+tone.text}>
    {tone.title}
   </span>
  </div>
  {result.level!=='pending'&&<div className="mt-3">
   <div className="flex flex-wrap items-end justify-between gap-2 text-xs text-slate-700">
    <span className="font-bold">Cobertura dos critérios verificados</span>
    <strong>{result.score} de 100 pontos de evidência</strong>
   </div>
   <div role="progressbar" aria-label="Pontos de evidência, não percentual de acerto" aria-valuemin={0}
    aria-valuemax={100} aria-valuenow={result.score} className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
    <div className={'h-full '+tone.bar} style={{width:result.score+'%'}}/>
   </div>
  </div>}
  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
   {result.checks.map(item=><div key={item.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
    <div className="flex items-start gap-2">
     <span aria-hidden="true" className={'text-lg font-black '+stateTone[item.state]}>{mark[item.state]}</span>
     <div>
      <h3 className="text-sm font-bold">{item.label}</h3>
      <p className="mt-1 text-xs leading-5 text-slate-700">{item.detail}</p>
      <p className="mt-2 text-xs font-semibold text-slate-600">{item.points}/{item.maxPoints} pontos</p>
     </div>
    </div>
   </div>)}
  </div>
  <p className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold text-cyan-950">
   Próxima conferência: {result.nextAction}
  </p>
  {(result.ignoredIndexedCount>0||result.flaggedCount>0)&&<p className="mt-2 text-xs text-amber-900">
   {result.ignoredIndexedCount>0&&result.ignoredIndexedCount+' resultado(s) indexado(s) ou de vitrine não pontuaram como anúncio conferido. '}
   {result.flaggedCount>0&&result.flaggedCount+' anúncio(s) com KM distante ou alerta de risco foram desconsiderados.'}
  </p>}
  <p className="mt-2 text-xs leading-5 text-slate-600">
   Indicador orientativo: sem alteração automática do valor FIPE, do preço-alvo, das margens ou da aprovação.
   O registro de compra só conta quando há valor efetivamente pago no histórico; anúncio conferido pela Mesa não substitui laudo cautelar nem confirmação de procedência.
  </p>
 </section>;
}
