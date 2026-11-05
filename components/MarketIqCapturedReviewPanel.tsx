import React,{useMemo} from 'react';
import {
 reviewCapturedWebmotors,type CapturedListing,type CapturedReviewTarget
} from '../services/marketIqCapturedReview';
import type {CaptureReviewSelections} from '../services/marketIqCapturedDraftStorage';

const cash=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const num=(n:number)=>n.toLocaleString('pt-BR');
export default function MarketIqCapturedReviewPanel<T extends CapturedListing>({
 ads,target,onImport,notice,readyToImport,review,onReviewChange,importedIds=[]
}:{
 ads:T[];target:CapturedReviewTarget;onImport:(selected:T[])=>void;
 notice?:string;readyToImport:boolean;
 review:CaptureReviewSelections;
 onReviewChange:(state:CaptureReviewSelections)=>void;
 importedIds?:string[];
}){
 const report=useMemo(()=>reviewCapturedWebmotors(ads,target),[
  ads,target.brand,target.model,target.year,target.km,target.vehicleType,
  target.expectedModelUrl,target.expectedVersionUrl,target.fipeValue
 ]);
 const checked=new Set(review.checkedIds);
 const initialSelected=review.selectedIds??report.ready.map(r=>r.id);
 const chosen=new Set(initialSelected);
 const imported=new Set(importedIds);
 const selectedRows=report.rows.filter(r=>r.reviewState!=='blocked'&&chosen.has(r.id)&&
  (r.reviewState==='eligible'||checked.has(r.id)));
 const yetToImport=selectedRows.filter(r=>!imported.has(r.id));
 const toggle=(id:string,selected:boolean)=>{
  const row=report.rows.find(r=>r.id===id);
  if(!row||row.reviewState==='blocked'||(row.reviewState==='review'&&!checked.has(id)))return;
  const next=new Set(initialSelected);
  if(selected)next.add(id);else next.delete(id);
  onReviewChange({...review,selectedIds:[...next]});
 };
 const confirm=(id:string,isChecked:boolean)=>{
  const row=report.rows.find(r=>r.id===id);
  if(!row||row.reviewState==='blocked')return;
  const changed=new Set(review.checkedIds);
  if(isChecked)changed.add(id);else changed.delete(id);
  const selected=new Set(initialSelected);
  // Flagged offers cannot remain selected after confirmation is withdrawn.
  if(!isChecked&&row.reviewState==='review')selected.delete(id);
  onReviewChange({checkedIds:[...changed],selectedIds:[...selected]});
 };
 const activeTopFive=[...selectedRows].sort((a,b)=>a.price-b.price||a.kmDifference-b.kmDifference).slice(0,5);
 const avg=activeTopFive.length>=2?
  Math.round(activeTopFive.reduce((sum,r)=>sum+r.price,0)/activeTopFive.length):null;
 const checkedCount=report.rows.filter(r=>r.reviewState!=='blocked'&&checked.has(r.id)).length;
 return <section className="rounded-xl border-2 border-cyan-300 bg-cyan-50 p-4 text-slate-950 sm:p-5"
  aria-label="Conferência dos anúncios capturados">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <h2 className="text-lg font-black">Conferência dos anúncios capturados</h2>
    <p className="mt-1 text-sm text-slate-700">
     {ads.length} anúncios capturados. Os dados continuam <strong>pendentes de conferência</strong>.
    </p>
   </div>
   <span className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800">
    {report.eligibleCount} sem alertas · {report.reviewCount} revisar · {report.blockedCount} incompatíveis
   </span>
  </div>
  <div className="mt-4 grid gap-3 sm:grid-cols-4">
   <div className="rounded-lg border border-slate-200 bg-white p-3">
    <p className="text-xs font-bold text-slate-600">Menor preço selecionado</p>
    <p className="mt-1 text-xl font-black">{activeTopFive.length?cash(activeTopFive[0].price):'—'}</p>
   </div>
   <div className="rounded-lg border border-slate-200 bg-white p-3">
    <p className="text-xs font-bold text-slate-600">
     Média dos {activeTopFive.length} menores selecionados
    </p>
    <p className="mt-1 text-xl font-black">{avg!==null?cash(avg):'—'}</p>
    <p className="mt-1 text-[11px] text-slate-600">Preliminar; não é preço de compra.</p>
   </div>
   <div className="rounded-lg border border-slate-200 bg-white p-3">
    <p className="text-xs font-bold text-slate-600">Conferidos por você</p>
    <p className="mt-1 text-xl font-black">{checkedCount}</p>
    <p className="mt-1 text-[11px] text-slate-600">Conferência declarada, não automática.</p>
   </div>
   <div className="rounded-lg border border-slate-200 bg-white p-3">
    <p className="text-xs font-bold text-slate-600">A adicionar à comparação</p>
    <p className="mt-1 text-xl font-black">{yetToImport.length}</p>
    <p className="mt-1 text-[11px] text-slate-600">{imported.size} já importado(s).</p>
   </div>
  </div>
  <p className="mt-3 text-xs leading-5 text-slate-700">
   Primeiro abra o anúncio e confira preço, quilometragem, versão e ano. Marque <strong>Conferi os dados</strong>
   somente após essa verificação. Itens com alerta exigem conferência antes de serem selecionados.
   Mesmo conferidos aqui, todos entram na Mesa como <strong>pendentes</strong>, nunca como compra aprovada.
  </p>
  <div className="mt-3 overflow-x-auto rounded-lg border border-slate-300 bg-white">
   <table className="w-full min-w-[930px] text-left text-xs">
    <thead className="bg-slate-100 text-slate-800"><tr>
     <th className="px-3 py-3">Usar</th><th className="px-3 py-3">Anúncio</th>
     <th className="px-3 py-3 text-right">Preço</th><th className="px-3 py-3 text-right">KM</th>
     <th className="px-3 py-3 text-right">Δ FIPE</th><th className="px-3 py-3">Conferência</th>
     <th className="px-3 py-3">Verificação manual</th>
    </tr></thead>
    <tbody>{report.rows.map((r,i)=><tr key={r.id+'-'+i} className="border-t border-slate-200 align-top">
     <td className="px-3 py-3">
      <input type="checkbox" aria-label={'Selecionar anúncio '+(i+1)}
       checked={r.reviewState!=='blocked'&&chosen.has(r.id)&&
         (r.reviewState==='eligible'||checked.has(r.id))}
       disabled={r.reviewState==='blocked'||(r.reviewState==='review'&&!checked.has(r.id))}
       onChange={e=>toggle(r.id,e.target.checked)} className="h-4 w-4 accent-cyan-800"/>
     </td>
     <td className="px-3 py-3">
      <p className="font-bold text-slate-950">Anúncio {i+1} · {r.year}</p>
      {imported.has(r.id)&&<p className="mt-1 font-bold text-cyan-900">Já adicionado à comparação</p>}
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
     <td className="px-3 py-3">
      {r.reviewState!=='blocked'?<label className="flex items-center gap-2 font-semibold text-slate-900">
       <input type="checkbox" aria-label={'Conferi os dados do anúncio '+(i+1)}
        checked={checked.has(r.id)} onChange={e=>confirm(r.id,e.target.checked)}
        className="h-4 w-4 accent-cyan-800"/>
       {checked.has(r.id)?'Conferido por mim':'Conferi os dados'}
      </label>:<span className="text-slate-500">Incompatível</span>}
     </td>
    </tr>)}</tbody>
   </table>
  </div>
  <div className="mt-4 flex flex-wrap items-center gap-3">
   <button type="button" disabled={!readyToImport||yetToImport.length===0}
    onClick={()=>onImport(yetToImport.map(r=>r.item as T))}
    className="rounded-lg bg-cyan-800 px-5 py-3 text-sm font-bold text-white hover:bg-cyan-900 disabled:opacity-50">
    Adicionar {yetToImport.length} anúncio(s) à comparação
   </button>
   {notice&&<p role="status" className="text-sm font-semibold text-amber-900">{notice}</p>}
  </div>
  <p className="mt-3 text-xs leading-5 text-slate-700">
   A média é uma leitura preliminar dos menores anúncios selecionados. A conferência é declarada pelo operador,
   não garante procedência ou disponibilidade e não altera o teto de compra. A fórmula de 14% e o repasse
   permanecem inalterados. A validação definitiva ocorre na Mesa.
  </p>
 </section>;
}
