import React from 'react';
import {
 REPASSE_REASONS,type FleetClass,type DestinationOverride,type DirectRepasseReason,
 type FleetDestination,type KmGuideline
} from '../services/marketIqFleetClassification';

type Props={
 km:string;guideline:KmGuideline|null;classification:FleetClass|null;
 destination:FleetDestination;direct:boolean;outOfRange:boolean;
 manualClassification:FleetClass|'';onManualClassification:(v:FleetClass|'')=>void;
 classificationReason:string;onClassificationReason:(v:string)=>void;
 destinationOverride:DestinationOverride;onDestinationOverride:(v:DestinationOverride)=>void;
 directRepasseReason:DirectRepasseReason;onDirectRepasseReason:(v:DirectRepasseReason)=>void;
 goodLiquidity:boolean;onGoodLiquidity:(v:boolean)=>void;
};
const input='mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm font-semibold text-slate-900';
const labels:Record<FleetClass,string>={
 A:'Excelência / Estado de zero',B:'Seminovo selecionado',
 C:'Usado selecionado',D:'Repasse por desgaste',E:'Repasse crítico'
};
export default function MarketIqFleetClassificationPanel(props:Props){
 const {guideline,classification,destination,direct,outOfRange}=props;
 return <section className="rounded-xl border border-sky-200 bg-white p-4 text-slate-950 sm:p-5"
 aria-label="Classificação e destino padronizados Grupo Abrão Reze">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <h2 className="text-lg font-black">Classificação e destino · Grupo Abrão Reze</h2>
    <p className="mt-1 text-sm text-slate-700">
     Padrão da diretoria: a KM sugere a classe inicial. Conservação, documentação, custos e vistoria definem o enquadramento final.
    </p>
   </div>
   <span className={'rounded-lg border px-3 py-2 text-sm font-black '+
    (direct?'border-red-400 bg-red-50 text-red-900':
     destination==='REPASSE'?'border-orange-300 bg-orange-50 text-orange-950':
     'border-sky-200 bg-sky-50 text-sky-950')}>
    {guideline?destination:'Informe a KM'}
   </span>
  </div>
  <div className="mt-4 grid gap-3 md:grid-cols-3">
   <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <p className="text-xs font-bold uppercase text-slate-600">Classe sugerida pela KM</p>
    <p className="mt-1 text-2xl font-black">{guideline?'Classe '+guideline.classification:'Aguardando KM'}</p>
    <p className="mt-1 text-xs text-slate-700">{guideline?.description||'Ex.: 45.000 para aplicar o padrão.'}</p>
   </div>
   <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <p className="text-xs font-bold uppercase text-slate-600">Classe aplicada na avaliação</p>
    <p className="mt-1 text-2xl font-black">{classification?'Classe '+classification:'Não definida'}</p>
    <p className="mt-1 text-xs text-slate-700">{classification?labels[classification]:'Informe a quilometragem do veículo.'}</p>
   </div>
   <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <p className="text-xs font-bold uppercase text-slate-600">Destino da avaliação</p>
    <p className={'mt-1 text-xl font-black '+(direct?'text-red-800':destination==='REPASSE'?'text-orange-900':'text-sky-900')}>
     {guideline?destination:'Pendente'}
    </p>
    <p className="mt-1 text-xs text-slate-700">
     {direct?'Regra obrigatória para histórico desabonador.':
      destination==='REPASSE'?'Destino comercial para lojista/repasse.':'Showroom sujeito à aprovação e vistoria.'}
    </p>
   </div>
  </div>
  {guideline&&<p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
   <strong>Condição esperada da classe sugerida:</strong> {guideline.condition}
  </p>}
  <div className="mt-4 grid gap-4 lg:grid-cols-2">
   <div>
    <label className="block text-sm font-bold text-slate-900">Ajustar classificação pela condição real
     <select className={input} value={props.manualClassification}
      disabled={!guideline}
      onChange={e=>props.onManualClassification(e.target.value as FleetClass|'')}>
      <option value="">Automática pela quilometragem</option>
      {(['A','B','C','D','E'] as FleetClass[]).map(c=>
       <option key={c} value={c}>Classe {c} · {labels[c]}</option>)}
     </select>
    </label>
    {outOfRange&&<div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
     A classe escolhida é diferente da faixa de KM. Justifique a exceção antes de salvar.
     <label className="mt-2 block text-sm font-semibold">Justificativa da reclassificação
      <input maxLength={280} className={input} placeholder="Ex.: veículo com desgaste mecânico acima do esperado"
       value={props.classificationReason} onChange={e=>props.onClassificationReason(e.target.value)}/>
     </label>
    </div>}
   </div>
   <div>
    <label className="block text-sm font-bold text-slate-900">Repasse direto obrigatório, independentemente da KM
     <select className={input} value={props.directRepasseReason}
      onChange={e=>props.onDirectRepasseReason(e.target.value as DirectRepasseReason)}>
      <option value="none">Não há motivo confirmado</option>
      {(Object.entries(REPASSE_REASONS) as [Exclude<DirectRepasseReason,'none'>,string][]).map(([key,value])=>
       <option key={key} value={key}>{value}</option>)}
     </select>
    </label>
    {direct&&<p role="alert" className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-900">
     Repasse direto obrigatório: histórico desabonador informado. A aprovação deve seguir o procedimento da empresa e não dispensa conferência documental.
    </p>}
    {!direct&&classification&&(['A','B','C'] as FleetClass[]).includes(classification)&&
     <label className="mt-3 block text-sm font-bold text-slate-900">Destino comercial
      <select className={input} value={props.destinationOverride}
       onChange={e=>props.onDestinationOverride(e.target.value as DestinationOverride)}>
       <option value="auto">Automático · showroom</option>
       <option value="repasse">Repasse por avaliação comercial</option>
      </select>
     </label>}
   </div>
  </div>
  {classification==='C'&&!direct&&destination==='SHOWROOM'&&
   <label className="mt-3 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
    <input type="checkbox" checked={props.goodLiquidity} onChange={e=>props.onGoodLiquidity(e.target.checked)}
     className="mt-1 h-4 w-4"/>
    <span><strong>Classe C: boa liquidez confirmada.</strong> A diretoria prevê showroom para a classe C somente com boa liquidez. {!props.goodLiquidity&&'Confirme a liquidez antes da decisão ou selecione repasse.'}</span>
   </label>}
  <p className="mt-4 text-xs leading-5 text-slate-600">
   Faixas: A até 20.000 km; B de 20.001 a 50.000; C de 50.001 a 70.000;
   D de 70.001 a 120.000; E acima de 120.000 km.
   Sinistro, leilão, apontamento/dano estrutural ou divergência cautelar exigem repasse direto em qualquer classe.
   Nenhuma classificação substitui a vistoria e nenhuma aprovação é automática.
  </p>
 </section>;
}
