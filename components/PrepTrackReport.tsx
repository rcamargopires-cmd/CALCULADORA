import React,{useMemo} from 'react';
import {BarChart3,Clock3,Wrench,X} from 'lucide-react';
import type {PrepOrder,PrepService} from '../types';

type Props={open:boolean;onClose:()=>void;orders:PrepOrder[];storeName:string};
const money=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const cost=(s:PrepService)=>Number(s.finalCost)||Number(s.estimatedCost)||0;
const active=(s:PrepService)=>['approved','in_service','waiting_part','done'].includes(s.status);
const late=(s:PrepService)=>{if(s.status==='done'||s.status==='cancelled'||!s.dueAt)return false;return new Date(String(s.dueAt).slice(0,10)+'T23:59:59').getTime()<Date.now();};
const onTime=(s:PrepService)=>{if(s.status!=='done'||!s.dueAt||!s.returnedAt)return null;return new Date(s.returnedAt).getTime()<=new Date(String(s.dueAt).slice(0,10)+'T23:59:59').getTime();};
const days=(from?:string,to?:string)=>{if(!from||!to)return null;const delta=new Date(to).getTime()-new Date(from).getTime();return Number.isFinite(delta)?Math.max(0,delta/86400000):null;};

const PrepTrackReport:React.FC<Props>=({open,onClose,orders,storeName})=>{
 const data=useMemo(()=>{
  const rows=orders.flatMap(order=>(order.services||[]).map(service=>({order,service}))).filter(row=>active(row.service));
  const suppliers=new Map<string,{name:string;services:number;vehicles:Set<string>;total:number;late:number;done:number;onTime:number;durations:number[]}>();
  for(const {order,service} of rows){
   const key=String(service.provider||'Sem fornecedor').trim().toLowerCase()||'sem-fornecedor';
   const current=suppliers.get(key)||{name:service.provider||'Sem fornecedor',services:0,vehicles:new Set<string>(),total:0,late:0,done:0,onTime:0,durations:[]};
   current.services+=1;current.vehicles.add(order.vehicleId||order.plate);current.total+=cost(service);
   if(late(service))current.late+=1;
   if(service.status==='done'){current.done+=1;if(onTime(service)===true)current.onTime+=1;const duration=days(service.sentAt||service.requestedAt,service.returnedAt);if(duration!==null)current.durations.push(duration);}
   suppliers.set(key,current);
  }
  const supplierRows=Array.from(suppliers.values()).map(item=>({...item,vehicles:item.vehicles.size,avgDays:item.durations.length?item.durations.reduce((a,b)=>a+b,0)/item.durations.length:0,sla:item.done?item.onTime/item.done*100:0})).sort((a,b)=>b.total-a.total);
  const vehicles=orders.map(order=>({id:order.id,plate:order.plate,vehicle:order.vehicle,total:(order.services||[]).filter(active).reduce((sum,s)=>sum+cost(s),0),services:(order.services||[]).filter(active).length,late:(order.services||[]).filter(late).length})).filter(item=>item.services>0).sort((a,b)=>b.total-a.total);
  return{supplierRows,vehicles,total:rows.reduce((sum,row)=>sum+cost(row.service),0),services:rows.length,late:rows.filter(row=>late(row.service)).length,suppliers:supplierRows.length};
 },[orders]);
 if(!open)return null;
 return <div className="fixed inset-0 z-[295] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={onClose}>
  <div className="mx-auto max-w-6xl overflow-hidden rounded-[30px] border border-white/10 bg-zinc-950 text-white shadow-2xl" onClick={event=>event.stopPropagation()}>
   <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 md:p-7"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-amber-300">PREPTRACK · INDICADORES</p><h2 className="mt-2 text-2xl font-semibold">Custo, SLA e fornecedor por veículo.</h2><p className="mt-1 text-sm text-zinc-500">{storeName}. Somente serviços aprovados entram nos números.</p></div><button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/[.05] text-zinc-400"><X size={18}/></button></header>
   <div className="p-5 md:p-7">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
     <Metric icon={<BarChart3 size={16}/>} label="Custo aprovado" value={money(data.total)} note="preparação acumulada"/>
     <Metric icon={<Wrench size={16}/>} label="Serviços" value={String(data.services)} note={String(data.suppliers)+' fornecedor(es)'}/>
     <Metric icon={<Clock3 size={16}/>} label="Atrasados agora" value={String(data.late)} note="prazo vencido"/>
     <Metric icon={<BarChart3 size={16}/>} label="Custo médio" value={money(data.services?data.total/data.services:0)} note="por serviço"/>
    </section>
    <section className="mt-5 grid gap-4 xl:grid-cols-2">
     <div className="rounded-[24px] border border-white/10 bg-white/[.025] p-4"><h3 className="text-sm font-semibold">Por fornecedor</h3><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="border-b border-white/10 text-zinc-600"><tr><th className="p-2">Fornecedor</th><th className="p-2 text-right">Serviços</th><th className="p-2 text-right">Carros</th><th className="p-2 text-right">Custo</th><th className="p-2 text-right">Atrasos</th><th className="p-2 text-right">SLA</th><th className="p-2 text-right">Média</th></tr></thead><tbody>{data.supplierRows.map(item=><tr key={item.name} className="border-b border-white/5"><td className="p-2 font-semibold text-zinc-300">{item.name}</td><td className="p-2 text-right">{item.services}</td><td className="p-2 text-right">{item.vehicles}</td><td className="p-2 text-right">{money(item.total)}</td><td className="p-2 text-right">{item.late}</td><td className="p-2 text-right">{item.done?item.sla.toFixed(0)+'%':'—'}</td><td className="p-2 text-right">{item.avgDays?item.avgDays.toFixed(1)+'d':'—'}</td></tr>)}{!data.supplierRows.length&&<tr><td colSpan={7} className="p-8 text-center text-zinc-600">Sem serviços aprovados ainda.</td></tr>}</tbody></table></div></div>
     <div className="rounded-[24px] border border-white/10 bg-white/[.025] p-4"><h3 className="text-sm font-semibold">Por veículo</h3><div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto">{data.vehicles.map(item=><div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold">{item.plate}</p><p className="mt-1 text-xs text-zinc-500">{item.vehicle}</p></div><b className="text-sm">{money(item.total)}</b></div><p className="mt-2 text-[10px] text-zinc-600">{item.services} serviço(s){item.late?' · '+item.late+' atrasado(s)':''}</p></div>)}{!data.vehicles.length&&<p className="p-8 text-center text-xs text-zinc-600">Sem veículos com custo aprovado.</p>}</div></div>
    </section>
   </div>
  </div>
 </div>;
};
const Metric=({icon,label,value,note}:{icon:React.ReactNode;label:string;value:string;note:string})=><div className="rounded-[22px] border border-white/10 bg-white/[.03] p-4"><div className="flex items-center gap-2 text-zinc-500">{icon}<p className="text-xs">{label}</p></div><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-[11px] text-zinc-600">{note}</p></div>;
export default PrepTrackReport;
