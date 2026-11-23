import React,{useMemo,useState} from 'react';
import {ArrowRight,Clock3,FileSpreadsheet,Warehouse} from 'lucide-react';
import type {DealerStockSnapshot} from '../services/marketIqDealerRadar';
import {findDealerFamilyStock} from '../services/marketIqDealerFamilyStock';

type Props={
 snapshot:DealerStockSnapshot|null;
 loaded:boolean;
 brand:string;model:string;year:string;plate:string;
 vehicleType:'car'|'motorcycle';
 onOpenRadar:()=>void;
};
const currency=(value:number)=>Number.isFinite(value)&&value>0?
 value.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}):
 'Não informado';
const date=(raw:string)=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raw||''))return 'data não informada';
 const [year,month,day]=raw.split('-');
 return day+'/'+month+'/'+year;
};

/** The visible stock is a Dealer snapshot, never a live inventory/API,
 * actual sale, confirmed market price or an input to purchase approval.
 */
export default function MarketIqStockOnDeskPanel({
 snapshot,loaded,brand,model,year,plate,vehicleType,onOpenRadar
}:Props){
 const [showAll,setShowAll]=useState(false);
 const result=useMemo(()=>findDealerFamilyStock(snapshot,brand,model,vehicleType,year,plate),
  [snapshot,brand,model,vehicleType,year,plate]);
 if(!brand.trim()||!model.trim())return null;
 const matching=result?.matches||[];
 const display=showAll?matching:matching.slice(0,6);
 return <section aria-label="Meu estoque neste modelo" className="mt-4 rounded-2xl border-2 border-sky-200 bg-white p-4 text-slate-950 shadow-sm sm:p-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="flex items-start gap-3">
    <span className="rounded-xl bg-cyan-100 p-2.5 text-cyan-900"><Warehouse size={21}/></span>
    <div>
     <p className="text-[11px] font-black uppercase tracking-widest text-cyan-800">Motyq IQ · Dealer V44</p>
     <h2 className="mt-1 text-xl font-black">Meu estoque neste modelo</h2>
     <p className="mt-1 text-sm font-semibold text-slate-800">{brand} · {result?.family||model}</p>
    </div>
   </div>
   <button type="button" onClick={onOpenRadar} className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-950 hover:bg-cyan-100">
    {snapshot?'Abrir Radar':'Importar estoque do Dealer'} <ArrowRight size={14}/>
   </button>
  </div>
  {!loaded?<p role="status" className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Carregando a última fotografia do estoque neste navegador...</p>:
  !snapshot?<div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
   <p className="text-sm font-semibold text-slate-900">Nenhum relatório Dealer importado nesta conta e neste navegador.</p>
   <p className="mt-1 text-xs text-slate-700">Importe o arquivo ConsultaEstoqueVeiculos_V44.xlsm no Radar. A Mesa passará a mostrar os veículos existentes assim que a importação terminar.</p>
  </div>:<>
   <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
    <span className="rounded-lg bg-cyan-100 px-2.5 py-1 font-black text-cyan-950">{result?.count||0} veículo(s) desta família no estoque</span>
    {(result?.oldOver90||0)>0&&<span className="rounded-lg bg-amber-100 px-2.5 py-1 font-bold text-amber-950">{result?.oldOver90} acima de 90 dias</span>}
    <span className="inline-flex items-center gap-1 text-slate-700"><Clock3 size={13}/> Base Dealer: {date(snapshot.reportDate)}</span>
   </div>
   {result?.isOutdated&&<p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs font-semibold text-amber-950">
     Relatório {result.snapshotAgeDays===null?'sem data válida':result.snapshotAgeDays<0?'com data futura':'de '+result.snapshotAgeDays+' dias atrás'}.
     Atualize o Dealer antes de considerar este estoque atual.
    </p>}
   {!matching.length?<p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
      Nenhum veículo desta família aparece na última fotografia do Dealer. Isso não comprova estoque zerado em tempo real.
    </p>:<div className="mt-3 space-y-2.5">
      {display.map(({vehicle:v,samePlate,sameYear,exactDescription})=><div key={v.key} className={'rounded-xl border p-3 '+(samePlate?'border-amber-300 bg-amber-50':'border-slate-200 bg-slate-50')}>
       <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
         <p className="text-sm font-black text-slate-950">{v.brand} · {v.model} {v.year&&'· '+v.year}</p>
         <p className="mt-1 text-xs text-slate-700">Placa {v.plate||'não informada'} · {v.store||'Loja não informada'}{v.kmValid?' · '+v.km.toLocaleString('pt-BR')+' km':''}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
         {samePlate&&<span className="rounded-lg bg-amber-200 px-2 py-1 text-[11px] font-bold text-amber-950">Esta placa já consta no estoque</span>}
         {exactDescription&&<span className="rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-950">Mesma descrição</span>}
         {!exactDescription&&sameYear&&<span className="rounded-lg bg-sky-100 px-2 py-1 text-[11px] font-bold text-sky-950">Mesmo ano-modelo · versão a conferir</span>}
         <span className={'rounded-lg px-2 py-1 text-[11px] font-black '+(v.days>90?'bg-amber-200 text-amber-950':'bg-white text-slate-800')}>{v.days} dias</span>
        </div>
       </div>
       <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-lg bg-white p-2">
         <p className="text-[11px] font-medium text-slate-600">Valor pago · Dealer</p>
         <p className="text-base font-black text-slate-950">{currency(v.purchase)}</p>
        </div>
        <div className="rounded-lg bg-white p-2">
         <p className="text-[11px] font-medium text-slate-600">Custo atual · Dealer</p>
         <p className="text-base font-black text-slate-950">{currency(v.cost)}</p>
        </div>
        <div className="col-span-2 rounded-lg bg-white p-2 sm:col-span-1">
         <p className="text-[11px] font-medium text-slate-600">Preço sugerido de venda</p>
         <p className="text-base font-black text-cyan-900">{currency(v.price)}</p>
        </div>
       </div>
      </div>)}
      {matching.length>6&&<button type="button" className="rounded-lg border border-cyan-300 px-3 py-2 text-xs font-bold text-cyan-950 hover:bg-cyan-50" onClick={()=>setShowAll(old=>!old)}>
       {showAll?'Mostrar menos':'Mostrar todos os '+matching.length+' veículos'}
      </button>}
    </div>}
   <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-4 text-slate-600"><FileSpreadsheet size={14} className="mt-0.5 shrink-0"/>
     Comparação por marca e família de modelo, não necessariamente pela mesma versão. Valor pago, custo e preço sugerido vêm da planilha; preço sugerido não comprova venda. Nenhum desses valores aprova uma compra automaticamente.
   </p>
  </>}
 </section>;
}
