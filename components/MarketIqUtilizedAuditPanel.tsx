import React,{useMemo,useState} from 'react';
import {type UtilizedAuditRow,countUtilizedByDay} from '../services/marketIqUtilizedAudit';

const number=(value:number)=>new Intl.NumberFormat('pt-BR').format(value);
const amount=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value);
const displayDate=(date:string)=>date==='SEM DATA'?'Sem data':date?date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4):'Sem data';
const exportCsv=(rows:UtilizedAuditRow[])=>{
 const columns=[['Data da compra','Data da avaliação','Placa','Marca','Modelo','Versão','Unidade','Status original','Valor avaliado','Excluído por regra']].concat(
  rows.map(r=>[r.purchaseDate,r.assessmentDate,r.plate,r.brand,r.model,r.version,r.store,r.status,String(r.value),r.excludedByManagementRule?'SIM':'NÃO']));
 const csv='\ufeff'+columns.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='motyq-utilizados-auditoria.csv';a.click();URL.revokeObjectURL(url);
};

export default function MarketIqUtilizedAuditPanel({rows,sourceName}:{rows:UtilizedAuditRow[];sourceName:string}){
 const [basis,setBasis]=useState<'purchase'|'assessment'>('purchase');
 const [day,setDay]=useState('');
 const [search,setSearch]=useState('');
 const daily=useMemo(()=>countUtilizedByDay(rows,basis),[rows,basis]);
 const visible=useMemo(()=>rows.filter(r=>
  (!day||((basis==='purchase'?r.purchaseDate:r.assessmentDate)||'SEM DATA')===day)&&
  (!search||[r.plate,r.brand,r.model,r.version,r.store,r.id].join(' ').toUpperCase().includes(search.trim().toUpperCase()))
 ),[rows,day,search,basis]);
 const excluded=rows.filter(r=>r.excludedByManagementRule).length;
 const withoutPurchaseDate=rows.filter(r=>!r.purchaseDate).length;
 return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Utilizados por dia e placa">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><h3 className="text-base font-black text-slate-900">Utilizados por dia e por placa</h3>
    <p className="mt-1 text-xs leading-5 text-slate-600">Auditoria do relatório {sourceName||'importado'}: placas e dados pessoais são mantidos apenas nesta sessão, sem salvar no navegador nem na nuvem.</p></div>
   <button type="button" onClick={()=>exportCsv(visible)} disabled={!visible.length} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 disabled:opacity-50">Exportar placas filtradas (CSV)</button>
  </div>
  <div className="mt-4 grid gap-2 sm:grid-cols-3">
   <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-600">UTILIZADO no arquivo</p><p className="text-2xl font-black">{number(rows.length)}</p></div>
   <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-900">Excluídos da contagem gerencial</p><p className="text-2xl font-black">{number(excluded)}</p></div>
   <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-600">Sem data de compra</p><p className="text-2xl font-black">{number(withoutPurchaseDate)}</p></div>
  </div>
  <div className="mt-4 flex flex-wrap gap-3">
   <label className="text-xs font-bold text-slate-700">Agrupar por
    <select value={basis} onChange={e=>{setBasis(e.target.value as 'purchase'|'assessment');setDay('');}} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2">
     <option value="purchase">Data da compra</option><option value="assessment">Data da avaliação</option>
    </select>
   </label>
   <label className="text-xs font-bold text-slate-700">Dia
    <select value={day} onChange={e=>setDay(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2">
     <option value="">Todos os dias</option>{daily.map(d=><option key={d.date} value={d.date}>{displayDate(d.date)} ({d.count})</option>)}
    </select>
   </label>
   <label className="min-w-48 flex-1 text-xs font-bold text-slate-700">Buscar placa, modelo ou unidade
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ex.: ABC1D23" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"/>
   </label>
  </div>
  <div className="mt-3 flex flex-wrap gap-2">
   {daily.map(d=><button key={d.date} type="button" onClick={()=>setDay(day===d.date?'':d.date)}
    className={'rounded-lg border px-3 py-2 text-xs font-semibold '+(day===d.date?'border-cyan-700 bg-cyan-50 text-cyan-950':'border-slate-200 bg-white text-slate-700')}>
    {displayDate(d.date)}: {number(d.count)}</button>)}
  </div>
  <p className="mt-3 text-xs text-slate-600">{number(visible.length)} veículo(s) na seleção. “Valor avaliado” não é necessariamente o valor efetivamente pago.</p>
  <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs">
   <thead><tr className="border-b bg-slate-50 text-slate-700">
    <th className="p-2">Data da compra</th><th className="p-2">Data da avaliação</th><th className="p-2">Placa</th><th className="p-2">Veículo</th><th className="p-2">Unidade</th><th className="p-2">Valor avaliado</th><th className="p-2">Regra gerencial</th>
   </tr></thead><tbody>{visible.map((r,i)=><tr key={(r.id||r.plate)+'-'+i} className="border-b text-slate-800">
    <td className="p-2">{displayDate(r.purchaseDate)}</td><td className="p-2">{displayDate(r.assessmentDate)}</td>
    <td className="p-2 font-black">{r.plate||'Não informada'}</td><td className="p-2">{[r.brand,r.model,r.version].filter(Boolean).join(' ')}</td>
    <td className="p-2">{r.store||'Não informada'}</td><td className="p-2">{amount(r.value)}</td>
    <td className="p-2">{r.excludedByManagementRule?<strong className="text-amber-800">EXCLUÍDO (avaliador)</strong>:<span className="text-emerald-800">Incluído</span>}</td>
   </tr>)}</tbody></table>{!visible.length&&<p className="p-4 text-xs text-slate-500">Nenhum utilizado corresponde aos filtros.</p>}</div>
  <p className="mt-3 text-xs text-slate-500">A comparação com os 97 utilizados da tela do AutoAvaliar exige a mesma seleção e o mesmo critério de data. Um veículo comprado neste mês pode ter sido avaliado no mês anterior.</p>
 </section>;
}
