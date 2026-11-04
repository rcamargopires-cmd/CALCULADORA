import React from 'react';
import type {ShortlistResult} from '../services/marketIqWebmotorsShortlist';

const cash=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const number=(n:number)=>n.toLocaleString('pt-BR');
export default function MarketIqWebmotorsShortlistPanel({
 shortlist,vehicleKm
}:{shortlist:ShortlistResult;vehicleKm:number}){
 if(!shortlist.total)return null;
 return <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-slate-950"
  aria-label="Menores anúncios indexados compatíveis da Webmotors">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div>
    <h3 className="text-base font-black">Menores candidatos Webmotors · conferência</h3>
    <p className="mt-1 text-xs leading-5 text-slate-700">
     Anúncios individuais indexados, mesmo modelo e ano/modelo, com KM próxima.
     Não há confirmação de que o anúncio esteja ativo ou da condição do veículo.
    </p>
   </div>
   <span className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800">
    {shortlist.accepted.length} compatível(is) de {shortlist.total} encontrado(s)
   </span>
  </div>
  {shortlist.topFive.length>0?<div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
   {shortlist.topFive.map((ad,index)=><div key={ad.id}
     className="rounded-lg border border-slate-200 bg-slate-50 p-3">
     <p className="text-[11px] font-bold text-slate-600">{index+1}º menor valor indexado</p>
     <p className="mt-1 text-lg font-black text-slate-950">{cash(ad.price)}</p>
     <p className="mt-1 text-xs text-slate-700">{number(ad.km)} km · diferença de {number(ad.kmDifference)} km</p>
     <p className="mt-1 text-xs font-semibold text-slate-700">Ano/modelo: {ad.year}</p>
     {ad.possibleFipePremium&&<p className="mt-2 text-xs font-semibold text-amber-900">
      Mais de 35% acima da FIPE, revisar versão/preço
     </p>}
     <a href={ad.url} target="_blank" rel="noopener noreferrer"
      className="mt-2 inline-flex text-xs font-bold text-cyan-800 underline">
      Conferir anúncio original
     </a>
    </div>)}
  </div>:<p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
   Nenhum anúncio individual com ano, modelo e quilometragem compatíveis foi encontrado.
   O sistema não vai apresentar média Webmotors sem amostra.
  </p>}
  {shortlist.sampleAverage!==null&&<p className="mt-3 text-sm font-bold text-slate-800">
   Média indicativa dos {shortlist.sampleCount} menores: {cash(shortlist.sampleAverage)}.
   <span className="font-normal text-slate-600"> Referência preliminar, não preço de compra.</span>
  </p>}
  {shortlist.discarded.length>0&&<details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
   <summary className="cursor-pointer text-xs font-bold text-slate-800">
    Por que {shortlist.discarded.reduce((sum,r)=>sum+r.count,0)} resultado(s) foram desconsiderados?
   </summary>
   <div className="mt-2 flex flex-wrap gap-2">
    {shortlist.discarded.map(reason=><span key={reason.reason}
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
      {reason.reason}: {reason.count}
    </span>)}
   </div>
  </details>}
  <p className="mt-3 text-xs leading-5 text-slate-600">
   Diferença calculada em relação aos {number(vehicleKm)} km do veículo avaliado.
   Apenas anúncios conferidos individualmente pelo operador podem entrar no teto definitivo da Mesa.
  </p>
 </section>;
}
