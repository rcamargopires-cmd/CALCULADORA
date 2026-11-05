import React,{useEffect,useMemo,useState} from 'react';
import {
 reviewCapturedWebmotors,type CapturedListing,type CapturedReviewTarget
} from '../services/marketIqCapturedReview';

const cash=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const num=(n:number)=>n.toLocaleString('pt-BR');
export default function MarketIqCapturedReviewPanel<T extends CapturedListing>({
 ads,target,onImport,notice,readyToImport
}:{
 ads:T[];target:CapturedReviewTarget;onImport:(selected:T[])=>void;
 notice?:string;readyToImport:boolean;
}){
 const report=useMemo(()=>reviewCapturedWebmotors(ads,target),[
  ads,target.brand,target.model,target.year,target.km,target.vehicleType,
  target.expectedModelUrl,target.expectedVersionUrl,target.fipeValue
 ]);
 const [manualSelected,setManualSelected]=useState<string[]|null>(null);
 useEffect(()=>setManualSelected(null),[ads,target.expectedModelUrl,target.expectedVersionUrl,target.year,target.km]);
 const selected=useMemo(()=>new Set(manualSelected??report.ready.map(r=>r.id)),[manualSelected,report]);
 const selectedRows=report.rows.filter(r=>r.reviewState!=='blocked'&&selected.has(r.id));
 const toggle=(id:string,checked:boolean)=>{
  const next=new Set(selected);
  checked?next.add(id):next.delete(id);
  setManualSelected([...next]);
 };
 const activeTopFive=[...selectedRows].sort((a,b)=>a.price-b.price||a.kmDifference-b.kmDifference).slice(0,5);
 const avg=activeTopFive.length>=2?
  Math.round(activeTopFive.reduce((sum,r)=>sum+r.price,0)/activeTopFive.length):null;
 return <section className="rounded-xl border-2 border-cyan-300 bg-cyan-50 p-4 text-slate-950 sm:p-5"
  aria-label="Conferência dos anúncios capturados">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <h2 className="text-lg font-black">Conferência dos anúncios capturados</h2>
    <p className="mt-1 text-sm text-slate-700">
     {ads.length} anúncio(s) recebidos. Organizei a lista por preço e compatibilidade, mantendo
     os dados da página como <strong>pendentes de conferência</strong>.
    </p>
   </div>
   <span className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800">
    {report.eligibleCount} sem alertas · {report.reviewCount} revisar · {report.blockedCount} incompatíveis
   </span>
  </div>
  <div className="mt-4 grid gap-3 sm:grid-cols-3">
   <div className="rounded-lg border border-slate-200 bg-white p-3">
    <p className="text-xs font-bold text-slate-600">Menor preço selecionado</p>
    <p className="mt-1 text-xl font-black">{activeTopFive.length?cash(activeTopFive[0].price):'—'}</p>
   </div>
   <div className="rounded-lg border border-slate-200 bg-white p-3">
    <p className="text-xs font-bold text-slate-600">Média dos 5 menores selecionados</p>
    <p className="mt-1 text-xl font-black">{avg!==null?cash(avg):'—'}</p>
    <p className="mt-1 text-[11px] text-slate-600">Amostra de {activeTopFive.length}. Apenas referência preliminar.</p>
   </div>
   <div className="rounded-lg border border-slate-200 bg-white p-3">
    <p className="text-xs font-bold text-slate-600">Anúncios selecionados</p>
    <p className="mt-1 text-xl font-black">{selectedRows.length}</p>
    <p className="mt-1 text-[11px] text-slate-600">Serão importados como pendentes, não aprovados.</p>
   </div>
  </div>
  <p className="mt-3 text-xs leading-5 text-slate-700">
   Itens sem alertas ficam selecionados inicialmente. Quando houver dúvida sobre versão, quilometragem,
   condição ou preço, o anúncio fica <strong>desmarcado</strong> até você conferir. Dados incompatíveis não são importados.
  </p>
  <div className="mt-3 overflow-x-auto rounded-lg border border-slate-300 bg-white">
   <table className="w-full min-w-[840px] text-left text-xs">
    <thead className="bg-slate-100 text-slate-800"><tr>
     <th className="px-3 py-3">Importar</th><th className="px-3 py-3">Anúncio</th>
     <th className="px-3 py-3 text-right">Preço</th><th className="px-3 py-3 text-right">KM</th>
     <th className="px-3 py-3 text-right">Δ FIPE</th><th className="px-3 py-3">Conferência</th>
    </tr></thead>
    <tbody>
     {report.rows.map((r,i)=><tr key={r.id+'-'+i} className="border-t border-slate-200 align-top">
      <td className="px-3 py-3">
       <input type="checkbox" aria-label={'Selecionar anúncio '+(i+1)}
        checked={r.reviewState!=='blocked'&&selected.has(r.id)} disabled={r.reviewState==='blocked'}
        onChange={e=>toggle(r.id,e.target.checked)}
        className="h-4 w-4 accent-cyan-800"/>
      </td>
      <td className="px-3 py-3">
       <p className="font-bold text-slate-950">Anúncio {i+1} · {r.year}</p>
       <p className="mt-1 text-[11px] text-slate-600">Referência individual</p>
       <a href={r.item.url} target="_blank" rel="noopener noreferrer"
        className="mt-1 inline-block font-bold text-cyan-800 underline">Abrir anúncio</a>
      </td>
      <td className="px-3 py-3 text-right font-black">{cash(r.price)}</td>
      <td className="px-3 py-3 text-right">{num(r.km)} km
       <p className="mt-1 text-[11px] text-slate-600">Dif. {num(r.kmDifference)} km</p>
      </td>
      <td className="px-3 py-3 text-right">
       {r.fipeDifferencePct===null?'—':(r.fipeDifferencePct>0?'+':'')+
         r.fipeDifferencePct.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'}
      </td>
      <td className="px-3 py-3">
       <p className={'font-bold '+(r.reviewState==='eligible'?'text-emerald-800':
        r.reviewState==='review'?'text-amber-900':'text-rose-800')}>
        {r.reviewState==='eligible'?'Sem alerta automático':
         r.reviewState==='review'?'Exige conferência':'Não compatível'}
       </p>
       {r.reasons.length>0&&<p className="mt-1 text-[11px] leading-5 text-slate-700">{r.reasons.join(' · ')}</p>}
      </td>
     </tr>)}
    </tbody>
   </table>
  </div>
  <div className="mt-4 flex flex-wrap items-center gap-3">
   <button type="button" disabled={!readyToImport||selectedRows.length===0}
    onClick={()=>onImport(selectedRows.map(r=>r.item as T))}
    className="rounded-lg bg-cyan-800 px-5 py-3 text-sm font-bold text-white hover:bg-cyan-900 disabled:opacity-50">
    Adicionar {selectedRows.length} anúncio(s) à comparação
   </button>
   {notice&&<p role="status" className="text-sm font-semibold text-amber-900">{notice}</p>}
  </div>
  <p className="mt-3 text-xs leading-5 text-slate-700">
   A média exibida é apenas uma leitura do mercado anunciado, não o valor de compra e não uma confirmação
   de procedência. A fórmula de 14% e o repasse continuam inalterados. Cada anúncio precisa ser
   confirmado na página individual antes de influenciar a precificação definitiva.
  </p>
 </section>;
}
