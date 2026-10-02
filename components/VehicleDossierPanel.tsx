import React,{useEffect,useMemo,useState} from 'react';
import {CarFront,FileClock,Search,X} from 'lucide-react';
import type {User,VehicleMaster} from '../types';
import {vehicleDossierService} from '../services/vehicleDossierService';

type Props={currentUser:User;companyId:string;storeId:string;storeName:string};
const money=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const date=(v:any)=>{try{return v?new Date(v?.seconds?Number(v.seconds)*1000:v).toLocaleString('pt-BR'):'—'}catch{return'—'}};

const VehicleDossierPanel:React.FC<Props>=({companyId,storeId,storeName})=>{
 const[open,setOpen]=useState(false),[vehicles,setVehicles]=useState<VehicleMaster[]>([]),[search,setSearch]=useState(''),[selected,setSelected]=useState(''),[dossier,setDossier]=useState<any>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(open)vehicleDossierService.listVehicles(companyId,storeId).then(setVehicles).catch(()=>setVehicles([]));},[open,companyId,storeId]);
 const list=useMemo(()=>{const q=search.toLowerCase().trim();return vehicles.filter(v=>!q||[v.plate,v.model,v.brand,v.vehicleId].some(x=>String(x||'').toLowerCase().includes(q))).sort((a,b)=>a.plate.localeCompare(b.plate));},[vehicles,search]);
 const load=async(key:string)=>{setSelected(key);setLoading(true);setError('');try{setDossier(await vehicleDossierService.get(companyId,storeId,key));}catch(e:any){setError(e?.message||'Não foi possível abrir o dossiê.');setDossier(null);}finally{setLoading(false);}};
 return <>
  <button title="Dossiê do veículo" className="hidden" onClick={()=>setOpen(true)}>Dossiê do veículo</button>
  {open&&<div className="fixed inset-0 z-[285] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm md:p-6" onClick={()=>setOpen(false)}>
   <div className="mx-auto max-w-7xl overflow-hidden rounded-[30px] border border-slate-200 bg-white text-slate-900 shadow-2xl" onClick={e=>e.stopPropagation()}>
    <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 md:p-7"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-indigo-700">DMS · DOSSIÊ DO VEÍCULO</p><h2 className="mt-1 text-2xl font-semibold">A história inteira do carro em um lugar.</h2><p className="mt-1 text-sm text-slate-500">{storeName}. Compra, estoque, preparação, financeiro, venda e auditoria.</p></div><button onClick={()=>setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200"><X size={18}/></button></header>
    <div className="grid gap-4 p-5 lg:grid-cols-[.72fr_1.28fr] md:p-7">
     <aside className="rounded-[24px] border border-slate-200 bg-slate-50/60 p-4"><div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Search size={14} className="text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Placa, modelo ou vehicleId" className="h-10 w-full bg-transparent text-sm outline-none"/></div><div className="mt-3 max-h-[650px] space-y-2 overflow-y-auto">{list.map(v=><button key={v.vehicleId} onClick={()=>void load(v.vehicleId)} className={`w-full rounded-2xl border p-3 text-left ${selected===v.vehicleId?'border-indigo-300 bg-indigo-50':'border-slate-200 bg-white'}`}><p className="font-mono text-sm font-bold">{v.plate}</p><p className="mt-1 text-sm font-semibold">{v.model}</p><p className="mt-1 text-[10px] text-slate-500">{v.stage} · {money(v.currentCost||0)}</p></button>)}</div></aside>
     <main className="rounded-[24px] border border-slate-200 bg-white p-5">{loading?<p className="py-16 text-center text-sm text-slate-500">Montando o dossiê...</p>:error?<p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>:!dossier?<div className="grid min-h-[420px] place-items-center text-center"><div><CarFront size={34} className="mx-auto text-slate-300"/><p className="mt-3 text-sm text-slate-500">Selecione um veículo para abrir o dossiê.</p></div></div>:<Dossier data={dossier}/>}</main>
    </div>
   </div>
  </div>}
 </>;
};

const Dossier=({data}:{data:any})=>{
 const m=data.master;
 const approvedPrep=(data.prepOrders||[]).flatMap((o:any)=>o.services||[]).filter((s:any)=>['approved','in_service','waiting_part','done'].includes(s.status));
 const prepTotal=approvedPrep.reduce((sum:number,s:any)=>sum+(Number(s.finalCost)||Number(s.estimatedCost)||0),0);
 const openFinance=(data.finance||[]).filter((f:any)=>f.status==='pending');
 return <div>
  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4"><div><p className="font-mono text-lg font-bold">{m.plate}</p><h3 className="mt-1 text-2xl font-semibold">{m.model}</h3><p className="mt-1 text-xs text-slate-500">{m.year||'Ano n/i'} · {m.km?Number(m.km).toLocaleString('pt-BR')+' km':'KM n/i'} · etapa {m.stage}</p><p className="mt-2 font-mono text-[10px] text-slate-400">{m.vehicleId}</p></div><div className="text-right"><p className="text-[10px] uppercase text-slate-400">Custo atual</p><p className="text-2xl font-semibold">{money(m.currentCost||0)}</p></div></div>
  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card label="Compra" value={money(m.purchaseCost||0)}/><Card label="Preparação" value={money(prepTotal)}/><Card label="Financeiro aberto" value={money(openFinance.reduce((a:number,f:any)=>a+Number(f.amount||0),0))}/><Card label="Movimentos" value={String((data.movements||[]).length)}/></div>
  <Section title="Compra e entrada">{(data.purchases||[]).length?(data.purchases||[]).map((p:any)=><Row key={p.id} main={`${p.ownerName||'Proprietário'} · ${p.origin}`} sub={`${money(p.totalAcquisitionCost)} · ${p.status} · documentos ${Object.values(p.documents||{}).filter(Boolean).length}/7`}/>):<Empty/>}</Section>
  <Section title="Preparação">{(data.prepOrders||[]).length?(data.prepOrders||[]).map((o:any)=><Row key={o.id} main={`${o.services?.length||0} serviço(s) · ${o.status}`} sub={`Custo aprovado ${money((o.services||[]).filter((s:any)=>['approved','in_service','waiting_part','done'].includes(s.status)).reduce((a:number,s:any)=>a+(Number(s.finalCost)||Number(s.estimatedCost)||0),0))}`}/>):<Empty/>}</Section>
  <Section title="Financeiro">{(data.finance||[]).length?(data.finance||[]).map((f:any)=><Row key={f.id} main={`${f.entryType==='payable'?'A pagar':'A receber'} · ${f.description}`} sub={`${f.party} · ${money(f.amount)} · ${f.status}`}/>):<Empty/>}</Section>
  <Section title="Vendas">{(data.sales||[]).length?(data.sales||[]).map((v:any)=><Row key={v.id} main={`${v.customerName} · ${v.status}`} sub={`${money(v.netSalePrice)} · NF ${v.invoiceNumber||'—'}`}/>):<Empty/>}</Section>
  <Section title="Linha do tempo">{[...(data.movements||[]).map((x:any)=>({at:x.at,main:`Estoque · ${x.movementType}`,sub:x.details||`${x.fromStatus||''} → ${x.toStatus||''}`})),...(data.audit||[]).map((x:any)=>({at:x.at,main:x.label,sub:x.details||x.actorName||''})),...(data.history||[]).map((x:any)=>({at:x.at,main:x.label,sub:x.details||x.provider||''}))].sort((a:any,b:any)=>String(b.at).localeCompare(String(a.at))).slice(0,30).map((x:any,i:number)=><Row key={i+'_'+x.at} main={x.main} sub={`${date(x.at)} · ${x.sub}`}/>)}</Section>
 </div>;
};
const Card=({label,value}:{label:string;value:string})=><div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
const Section=({title,children}:{title:string;children:React.ReactNode})=><section className="mt-5"><div className="mb-2 flex items-center gap-2"><FileClock size={15} className="text-indigo-600"/><h4 className="text-xs font-black uppercase tracking-[.1em] text-slate-600">{title}</h4></div><div className="space-y-2">{children}</div></section>;
const Row=({main,sub}:{main:string;sub:string})=><div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3"><p className="text-sm font-semibold text-slate-700">{main}</p><p className="mt-1 text-xs text-slate-500">{sub}</p></div>;
const Empty=()=> <div className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-400">Nenhum registro.</div>;

export default VehicleDossierPanel;
