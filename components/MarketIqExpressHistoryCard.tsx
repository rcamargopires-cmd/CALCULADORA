import React,{useMemo} from 'react';
import type {ExpressVehicleExtract} from '../services/marketIqExpress';
import {summarizeExpressHistory,type ExpressHistoryRecord} from '../services/marketIqExpressHistory';

type Props={vehicle:ExpressVehicleExtract;history:readonly ExpressHistoryRecord[];loading?:boolean;incomplete?:boolean;error?:string};
const money=(amount:number)=>amount.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
export default function MarketIqExpressHistoryCard({vehicle,history,loading=false,incomplete=false,error=''}:Props){
 const summary=useMemo(()=>summarizeExpressHistory(vehicle,history,incomplete),[vehicle,history,incomplete]);
 if(error)return <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950">
  Histórico indisponível agora: {error}. Nenhum valor foi presumido; tente atualizar na Mesa.</p>;
 if(loading&&!history.length)return <p role="status" className="rounded-lg border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-700">
  Histórico autorizado da Mesa carregando… A prévia não vai presumir valores.</p>;
 return <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900">
  <p className="text-xs font-black text-slate-900">Histórico rápido · valores efetivamente pagos</p>
  {summary.matchBy==='none'?
   <p className="text-xs text-slate-700">Não encontrei avaliações pagas comparáveis neste histórico carregado.
    Isso não significa que o carro nunca foi comprado.</p>
   :<>
    <p className="text-xs text-slate-700">
     {summary.evaluations} avaliação(ões) {summary.matchBy==='plate'?'da mesma placa':'da mesma versão e ano, com KM próxima'}.
     {' '}{summary.paidCount} com valor aprovado/pago.
    </p>
    {summary.paidCount>0?<div className="flex flex-wrap items-baseline justify-between gap-2">
     <div><p className="text-xs text-slate-600">Último pagamento registrado</p>
      <strong className="text-base text-emerald-950">{money(summary.lastPaid!)}</strong></div>
     <div className="text-right text-xs text-slate-700">Faixa histórica: {money(summary.minPaid!)} a {money(summary.maxPaid!)}
      {summary.lastDate&&<p>Último registro: {summary.lastDate.split('-').reverse().join('/')}</p>}</div>
    </div>:<p className="text-xs font-bold text-amber-900">Há avaliações, mas nenhum pagamento confirmado nestes registros.</p>}
    {summary.repeatedPaid!==null&&<p className="text-xs font-semibold text-emerald-900">
     Valor repetido em {summary.repeatCount} compras comparáveis: {money(summary.repeatedPaid)}.
     Use como referência histórica, não como oferta aprovada.</p>}
   </>}
  {incomplete&&<p className="text-xs text-amber-800">A lista carregada é parcial. Consulte o histórico completo antes de concluir.</p>}
  <p className="text-xs text-slate-600">Sem custo de IA. Não é uma cotação de mercado, nem substitui FIPE vigente, preparo e análise da Mesa.</p>
 </div>;
}
