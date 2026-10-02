import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDollarSign, Plus, RefreshCw, Search, Trash2, Wrench, X } from 'lucide-react';
import { OperationalStockItem, PrepOrder, PrepOrderStatus, PrepServiceStatus, User, VehicleHistoryEvent } from '../types';
import { prepTrackService } from '../services/prepTrackService';
import { storeScopedOperationalService } from '../services/storeScopedOperationalService';
import { manualStockService } from '../services/manualStockService';
import { useCurrentStock } from '../contexts/CurrentStockContext';
import { prepFinanceService } from '../services/prepFinanceService';

type Props={currentUser:User;companyId:string;storeId:string;storeName:string};
const SERVICE_TYPES=['Troca de óleo','Mecânica','Higienização','Auto elétrica','Funilaria / pintura','Pneus','Estética','Vidros','Acessórios','Outros'];
const ORDER_LABELS:Record<PrepOrderStatus,string>={triage:'Triagem',preparing:'Em preparação',waiting_approval:'Aguardando aprovação',waiting_part:'Aguardando peça',ready:'Pronto',showroom:'Showroom',delivery:'Entrega',delivered:'Entregue'};
const SERVICE_LABELS:Record<PrepServiceStatus,string>={pending:'Aguardando aprovação',approved:'Aprovado',in_service:'No prestador',waiting_part:'Aguardando peça',done:'Concluído',cancelled:'Cancelado'};
const money=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(v||0);
const dateValue=(v?:string)=>v?String(v).slice(0,10):'';
const clean=(v:unknown)=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const isEmptyLookup=(order:PrepOrder)=>!(order.services||[]).length&&!order.sold&&order.status==='triage'&&order.destination==='showroom';

const PrepTrackPanel:React.FC<Props>=({currentUser,companyId,storeId,storeName})=>{
 const sharedStock=useCurrentStock();
 const[open,setOpen]=useState(false);const[loading,setLoading]=useState(false);const[stock,setStock]=useState<OperationalStockItem[]>([]);const[orders,setOrders]=useState<PrepOrder[]>([]);const[selectedId,setSelectedId]=useState('');const[search,setSearch]=useState('');
 const[serviceType,setServiceType]=useState(SERVICE_TYPES[0]);const[provider,setProvider]=useState('');const[estimatedCost,setEstimatedCost]=useState('');const[dueAt,setDueAt]=useState('');const[notes,setNotes]=useState('');
 const[history,setHistory]=useState<VehicleHistoryEvent[]>([]);
 const canApprove=['manager','admin'].includes(String(currentUser.role||''));
 const load=async()=>{
  setLoading(true);
  try{
   const[s,existingOrders]=await Promise.all([storeScopedOperationalService.getLatestStock(storeId,companyId),prepTrackService.getOrders(companyId,storeId)]);
   let nextStock=s;
   const nextOrders=[...existingOrders];

   const missingManual=nextStock.filter(item=>item.source==='manual'&&!nextOrders.some(order=>clean(order.plate)===clean(item.plate)));
   for(const item of missingManual){
    try{
     const created=await prepTrackService.ensureOrder({vehicleId:item.vehicleId,plate:clean(item.plate),vehicle:item.vehicle,companyId,storeId,createdBy:currentUser.email});
     if(!nextOrders.some(order=>order.id===created.id))nextOrders.push(created);
     nextStock=await manualStockService.syncPreparation(created,currentUser,storeId,companyId,nextStock);
    }catch(error){console.warn('Motyq: falha ao integrar estoque manual ao PrepTrack.',error);}
   }
   nextOrders.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
   setStock(nextStock);setOrders(nextOrders);
   if(selectedId&&!nextOrders.some(item=>item.id===selectedId))setSelectedId('');
  }finally{setLoading(false);}
 };
 useEffect(()=>{if(open)load();},[open,companyId,storeId]);
 useEffect(()=>{
  if(!open)return;
  if(sharedStock.companyId!==companyId||sharedStock.storeId!==storeId)return;
  setStock(sharedStock.rows);
 },[open,sharedStock.rows,sharedStock.companyId,sharedStock.storeId,companyId,storeId]);

 useEffect(()=>{
  if(!open)return;
  return prepTrackService.subscribeOrders(
   companyId,
   storeId,
   next=>setOrders(next),
   error=>console.warn('Motyq: ordens do PrepTrack em tempo real indisponíveis.',error),
  );
 },[open,companyId,storeId]);

 useEffect(()=>{
  if(!open)return;
  const missing=stock.filter(item=>{
   const status=String(item.status||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
   const shouldPrepare=item.source==='manual'||status==='em preparacao';
   return shouldPrepare&&!orders.some(order=>clean(order.plate)===clean(item.plate));
  });
  if(!missing.length)return;
  let cancelled=false;
  (async()=>{
   for(const item of missing){
    if(cancelled)break;
    try{
     await prepTrackService.ensureOrder({
      vehicleId:item.vehicleId,
      plate:clean(item.plate),
      vehicle:item.vehicle,
      companyId,
      storeId,
      createdBy:currentUser.email,
     });
    }catch(error){
     console.warn('Motyq: não foi possível criar a ordem automática de preparação.',item.plate,error);
    }
   }
  })();
  return()=>{cancelled=true;};
 },[open,stock,orders,companyId,storeId,currentUser.email]);
 const selected=orders.find(item=>item.id===selectedId)||null;
 useEffect(()=>{
  if(!open||!selected){setHistory([]);return;}
  let active=true;
  const loadHistory=async()=>{
   try{
    const items=await prepFinanceService.getVehicleHistory(companyId,storeId,selected.plate);
    if(active)setHistory(items);
   }catch(error){console.warn('Motyq: histórico do veículo indisponível.',error);}
  };
  void loadHistory();
  const refresh=()=>void loadHistory();
  window.addEventListener('dealmaster:vehicle-history-updated',refresh);
  return()=>{active=false;window.removeEventListener('dealmaster:vehicle-history-updated',refresh);};
 },[open,selectedId,selected?.plate,companyId,storeId]);
 const stockByPlate=useMemo(()=>new Map(stock.map(item=>[clean(item.plate),item])),[stock]);
 const q=search.trim().toLowerCase();
 const visible=useMemo(()=>orders.filter(item=>!q||`${item.plate} ${item.vehicle}`.toLowerCase().includes(q)),[orders,q]);


 const trackedOrders=orders.filter(o=>!isEmptyLookup(o));
 const active=trackedOrders.filter(o=>!['showroom','delivery','delivered'].includes(o.status));
 const pendingApprovals=trackedOrders.reduce((sum,o)=>sum+o.services.filter(service=>service.status==='pending').length,0);
 const overdue=trackedOrders.filter(o=>o.services.some(s=>s.status!=='done'&&s.status!=='cancelled'&&s.status!=='pending'&&s.dueAt&&new Date(`${s.dueAt}T23:59:59`).getTime()<Date.now()));
 const approvedStatuses=['approved','in_service','waiting_part','done'];
 const openCost=active.reduce((sum,o)=>sum+o.services.filter(s=>approvedStatuses.includes(s.status)).reduce((a,s)=>a+(Number(s.finalCost)||Number(s.estimatedCost)||0),0),0);
 const syncStock=async(order:PrepOrder,baseStock=stock)=>{
  const nextStock=await manualStockService.syncPreparation(order,currentUser,storeId,companyId,baseStock);
  setStock(nextStock);
  window.dispatchEvent(new Event('dealmaster:operational-data-updated'));
  return nextStock;
 };
 const save=async(next:PrepOrder)=>{
  const optimistic={...next,updatedAt:new Date().toISOString()};
  setOrders(prev=>prev.map(item=>item.id===optimistic.id?optimistic:item));
  try{
   await prepTrackService.saveOrder(optimistic);
   await syncStock(optimistic);
  }catch(error){console.warn('Motyq: falha ao sincronizar preparação.',error);await load();}
 };
 const createFromStock=async(item:OperationalStockItem)=>{
  const existing=orders.find(o=>clean(o.plate)===clean(item.plate));
  if(existing){setSelectedId(existing.id);setSearch('');return;}
  const created=await prepTrackService.createOrder({vehicleId:item.vehicleId,plate:clean(item.plate),vehicle:item.vehicle,companyId,storeId,createdBy:currentUser.email});
  setOrders(prev=>[created,...prev]);
  await syncStock(created);
  setSelectedId(created.id);setSearch('');
 };
 const changeSearch=(value:string)=>{setSearch(value);if(!selected)return;const nextQ=value.trim().toLowerCase();const matches=!nextQ||`${selected.plate} ${selected.vehicle}`.toLowerCase().includes(nextQ);if(matches)return;const previous=selected;setSelectedId('');if(isEmptyLookup(previous)){setOrders(prev=>prev.filter(item=>item.id!==previous.id));prepTrackService.deleteOrder(previous.id).catch(()=>load());}};
 const addService=async()=>{
  if(!selected)return;
  if(!provider.trim())return alert('Informe o fornecedor/prestador.');
  const amount=Number(String(estimatedCost).replace(',','.'))||0;
  if(amount<=0)return alert('Informe o valor/orçamento da preparação.');
  const stamp=new Date().toISOString();
  const next=await prepTrackService.addService(selected,{
   type:serviceType,
   provider:provider.trim(),
   status:'pending',
   estimatedCost:amount,
   finalCost:0,
   dueAt:dueAt||undefined,
   notes:notes.trim()||undefined,
   requestedAt:stamp,
   requestedBy:currentUser.email,
   requestedByName:currentUser.name,
  });
  const added=next.services[next.services.length-1];
  setOrders(prev=>prev.map(item=>item.id===next.id?next:item));
  if(added)await prepFinanceService.recordRequest(next,added,currentUser);
  await syncStock(next);
  setProvider('');setEstimatedCost('');setDueAt('');setNotes('');
 };
 const approveService=async(id:string)=>{
  if(!selected||!canApprove)return;
  const service=selected.services.find(item=>item.id===id);
  if(!service||service.status!=='pending')return;
  const stamp=new Date().toISOString();
  const approved={...service,status:'approved' as PrepServiceStatus,approvedAt:stamp,approvedBy:currentUser.email,approvedByName:currentUser.name};
  const payable=await prepFinanceService.registerApproval(selected,approved,currentUser);
  const withPayable={...approved,payableId:payable.id,supplierId:payable.partyId};
  const nextServices=selected.services.map(item=>item.id===id?withPayable:item);
  const hasPending=nextServices.some(item=>item.status==='pending');
  const nextOrder={...selected,services:nextServices,status:(hasPending?'waiting_approval':'preparing') as PrepOrderStatus};
  await save(nextOrder);
 };

 const updateService=async(id:string,patch:any)=>{
  if(!selected)return;
  const previous=selected.services.find(service=>service.id===id);
  if(!previous)return;
  if(previous.status==='pending'&&patch.status&&patch.status!=='pending')return;
  let changed:any=null;
  const nextServices=selected.services.map(service=>{
   if(service.id!==id)return service;
   const next:any={...service,...patch};
   if(patch.status==='in_service'&&!service.sentAt)next.sentAt=new Date().toISOString();
   if(patch.status==='done')next.returnedAt=new Date().toISOString();
   if(patch.status&&patch.status!=='done')delete next.returnedAt;
   changed=next;
   return next;
  });
  const hasPending=nextServices.some(service=>service.status==='pending');
  const nextOrder={...selected,services:nextServices,status:(hasPending?'waiting_approval':selected.status==='waiting_approval'?'preparing':selected.status) as PrepOrderStatus};
  await save(nextOrder);
  if(changed&&['approved','in_service','waiting_part','done'].includes(changed.status)){
   await prepFinanceService.syncApprovedPayable(nextOrder,changed);
  }
  if(changed&&patch.status==='done'&&previous.status!=='done'){
   await prepFinanceService.recordCompleted(nextOrder,changed,currentUser);
  }
  if(changed&&patch.status==='cancelled'&&previous.status!=='cancelled'){
   await prepFinanceService.cancel(nextOrder,changed,currentUser);
  }
 };
 const removeService=async(id:string)=>{
  if(!selected)return;
  const next=await prepTrackService.removeService(selected,id);
  setOrders(prev=>prev.map(item=>item.id===next.id?next:item));
  await syncStock(next);
 };
 const candidates=useMemo(()=>stock.filter(item=>!orders.some(o=>clean(o.plate)===clean(item.plate))).filter(item=>!q||`${item.plate} ${item.vehicle}`.toLowerCase().includes(q)).slice(0,q?30:12),[stock,orders,q]);
 const stockMatchCount=useMemo(()=>stock.filter(item=>!q||`${item.plate} ${item.vehicle}`.toLowerCase().includes(q)).length,[stock,q]);
 return <><button onClick={()=>setOpen(true)} title="PrepTrack · preparação" className="fixed right-5 z-[139] grid h-12 w-12 place-items-center rounded-full border border-amber-400/25 bg-zinc-950/95 text-amber-300 shadow-2xl" style={{bottom:380}}><Wrench size={18}/></button>
 {open&&<div className="fixed inset-0 z-[270] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={()=>setOpen(false)}><div className="mx-auto max-w-7xl overflow-hidden rounded-[32px] border border-white/10 bg-zinc-950 shadow-2xl" onClick={e=>e.stopPropagation()}><header className="flex flex-col gap-4 border-b border-white/10 p-5 md:flex-row md:items-center md:justify-between md:p-7"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-amber-300"><Wrench size={15}/> PrepTrack · preparação</div><h3 className="mt-2 text-2xl font-semibold text-white">Do pátio ao showroom, sem carro perdido no caminho.</h3><p className="mt-2 text-sm text-zinc-500">{storeName}. Serviços, prestadores, custos, prazos e destino final por placa.</p></div><div className="flex gap-2"><button onClick={load} className="grid h-10 w-10 place-items-center rounded-full bg-white/[.05] text-zinc-400"><RefreshCw size={16} className={loading?'animate-spin':''}/></button><button onClick={()=>setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[.05] text-zinc-400"><X size={18}/></button></div></header>
 <div className="p-5 md:p-7"><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<Wrench size={16}/>} label="Em preparação" value={`${active.length}`} note={`${trackedOrders.length} ordens no total`}/><Metric icon={<CheckCircle2 size={16}/>} label="Aguardando aprovação" value={`${pendingApprovals}`} note="orçamentos para o gerente" warn={pendingApprovals>0}/><Metric icon={<AlertTriangle size={16}/>} label="Atrasados" value={`${overdue.length}`} note="previsão vencida" danger={overdue.length>0}/><Metric icon={<CircleDollarSign size={16}/>} label="Custo aprovado" value={money(openCost)} note="já impacta o custo do carro"/></section>
 <section className="mt-5 grid gap-4 xl:grid-cols-[.78fr_1.22fr]"><div className="rounded-[26px] border border-white/10 bg-white/[.025] p-4"><div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3"><Search size={14} className="text-zinc-600"/><input value={search} onChange={e=>changeSearch(e.target.value)} placeholder="Buscar placa ou modelo em ordens e estoque" className="h-10 w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-700"/></div><div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto pr-1">{visible.map(order=>{const isLate=order.services.some(s=>s.status!=='done'&&s.status!=='cancelled'&&s.dueAt&&new Date(`${s.dueAt}T23:59:59`).getTime()<Date.now());return <button key={order.id} onClick={()=>setSelectedId(order.id)} className={`w-full rounded-2xl border p-4 text-left ${selectedId===order.id?'border-amber-400/30 bg-amber-400/[.07]':'border-white/10 bg-black/20'}`}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-semibold text-white">{order.plate}</span>{order.sold&&<span className="rounded-full bg-red-400/10 px-2 py-1 text-[10px] font-bold text-red-300">VENDIDO</span>}{isLate&&<span className="rounded-full bg-amber-400/10 px-2 py-1 text-[10px] font-bold text-amber-300">ATRASADO</span>}</div><p className="mt-1 text-sm text-zinc-400">{order.vehicle}</p></div><span className="text-[10px] font-semibold uppercase text-zinc-500">{ORDER_LABELS[order.status]}</span></div><p className="mt-3 text-xs text-zinc-600">{order.services.filter(s=>s.status==='done').length}/{order.services.length} serviços concluídos · {money(order.services.reduce((a,s)=>a+(Number(s.finalCost)||Number(s.estimatedCost)||0),0))}</p></button>})}{!visible.length&&<div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-600">{q?'Nenhuma ordem aberta com essa busca. Veja os carros disponíveis à direita.':'Nenhuma ordem de preparação ainda.'}</div>}</div></div>
 <div className="rounded-[26px] border border-white/10 bg-white/[.025] p-5">{selected?<OrderDetail order={selected} stock={stockByPlate.get(clean(selected.plate))} onSave={save} onAddService={addService} onApproveService={approveService} canApprove={canApprove} history={history} onServiceChange={updateService} onRemoveService={removeService} serviceType={serviceType} setServiceType={setServiceType} provider={provider} setProvider={setProvider} estimatedCost={estimatedCost} setEstimatedCost={setEstimatedCost} dueAt={dueAt} setDueAt={setDueAt} notes={notes} setNotes={setNotes}/>:<><p className="text-xs font-semibold uppercase tracking-[.14em] text-zinc-600">Nova preparação</p><h4 className="mt-1 text-lg font-semibold text-white">Selecione um carro do estoque</h4><p className="mt-2 text-sm text-zinc-500">A busca acima também filtra esta lista. A ordem nasce vinculada à placa.</p>{q&&<p className="mt-2 text-xs text-amber-300">{stockMatchCount?`${stockMatchCount} veículo(s) do estoque correspondem à busca.`:'Placa/modelo não encontrado no estoque atual.'}</p>}<div className="mt-4 grid gap-2 sm:grid-cols-2">{candidates.map(item=><button key={item.id} onClick={()=>createFromStock(item)} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left hover:border-amber-400/30"><div className="flex items-center justify-between"><span className="font-mono text-sm font-semibold text-white">{item.plate}</span><Plus size={15} className="text-amber-300"/></div><p className="mt-1 truncate text-sm text-zinc-400">{item.vehicle}</p><p className="mt-2 text-xs text-zinc-600">{item.stockDays} dias em estoque</p></button>)}</div>{!candidates.length&&<div className="mt-4 rounded-2xl border border-dashed border-white/10 p-6 text-sm text-zinc-600">{q?'Nenhum veículo disponível com essa busca. Se o carro acabou de entrar, confirme se a importação do estoque foi concluída.':'Todos os veículos exibidos já possuem ordem ou não há estoque carregado.'}</div>}</>}</div></section></div></div></div>}</>;
};

const OrderDetail=({order,stock,onSave,onAddService,onApproveService,canApprove,history,onServiceChange,onRemoveService,serviceType,setServiceType,provider,setProvider,estimatedCost,setEstimatedCost,dueAt,setDueAt,notes,setNotes}:any)=>{const approvedStatuses=['approved','in_service','waiting_part','done'];const cost=order.services.filter((s:any)=>approvedStatuses.includes(s.status)).reduce((a:any,s:any)=>a+(Number(s.finalCost)||Number(s.estimatedCost)||0),0);const purchase=Number(stock?.purchaseCost)||Math.max(0,(Number(stock?.cost)||0)-(Number(stock?.prepCost)||0));const prep=Number(stock?.prepCost)||cost;return <><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-lg font-semibold text-white">{order.plate}</span>{order.sold&&<span className="rounded-full bg-red-400/10 px-2 py-1 text-[10px] font-bold text-red-300">VENDIDO · PRIORIDADE</span>}</div><p className="mt-1 text-zinc-400">{order.vehicle}</p><p className="mt-1 text-xs text-zinc-600">{stock?`${stock.stockDays} dias · Compra ${money(purchase)} · Prep. ${money(prep)} · Custo atual ${money(stock.cost)}`:'Veículo não localizado no snapshot atual'}</p></div><div className="grid gap-2 sm:grid-cols-2"><select value={order.status} onChange={e=>onSave({...order,status:e.target.value,completedAt:['ready','showroom','delivery','delivered'].includes(e.target.value)?new Date().toISOString():order.completedAt})} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white">{Object.entries(ORDER_LABELS).map(([k,v])=><option key={k} value={k}>{v as string}</option>)}</select><select value={order.destination} onChange={e=>onSave({...order,destination:e.target.value})} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white"><option value="showroom">Destino: Showroom</option><option value="delivery">Destino: Entrega</option></select><button onClick={()=>onSave({...order,sold:!order.sold,destination:!order.sold?'delivery':order.destination})} className={`h-10 rounded-xl border px-3 text-xs font-semibold ${order.sold?'border-red-400/20 bg-red-400/[.07] text-red-300':'border-white/10 text-zinc-300'}`}>{order.sold?'Vendido ✓':'Marcar como vendido'}</button><div className="flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-zinc-400">Custo prep. <b className="ml-2 text-white">{money(cost)}</b></div></div></div>
 <div className="mt-5 space-y-2">{order.services.map((service:any)=><div key={service.id} className={`rounded-2xl border p-4 ${service.status==='pending'?'border-amber-400/20 bg-amber-400/[.045]':'border-white/10 bg-black/20'}`}><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="min-w-[180px] flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-white">{service.type}</p>{service.status==='pending'&&<span className="rounded-full bg-amber-300/10 px-2 py-1 text-[9px] font-bold text-amber-300">AGUARDANDO GERENTE</span>}{service.payableId&&<span className="rounded-full bg-emerald-300/10 px-2 py-1 text-[9px] font-bold text-emerald-300">CONTAS A PAGAR</span>}</div><input value={service.provider||''} disabled={service.status==='pending'&&canApprove} onChange={e=>onServiceChange(service.id,{provider:e.target.value})} placeholder="Prestador" className="mt-1 w-full bg-transparent text-xs text-zinc-500 outline-none placeholder:text-zinc-700 disabled:opacity-70"/><p className="mt-1 text-[10px] text-zinc-600">Solicitado por {service.requestedByName||service.requestedBy||'—'} · {money(Number(service.finalCost)||Number(service.estimatedCost)||0)}</p></div>{service.status==='pending'?<div className="flex items-center gap-2"><span className="rounded-xl border border-amber-400/15 px-3 py-2 text-xs text-amber-300">Aguardando aprovação</span>{canApprove&&<button onClick={()=>onApproveService(service.id)} className="h-9 rounded-xl bg-emerald-400 px-4 text-xs font-bold text-emerald-950">APROVAR</button>}<button onClick={()=>onRemoveService(service.id)} title="Cancelar solicitação" className="grid h-9 w-9 place-items-center rounded-xl border border-red-400/10 text-red-300"><Trash2 size={14}/></button></div>:<><select value={service.status} onChange={e=>onServiceChange(service.id,{status:e.target.value})} className="h-9 rounded-xl border border-white/10 bg-zinc-900 px-2 text-xs text-white">{Object.entries(SERVICE_LABELS).filter(([k])=>k!=='pending').map(([k,v])=><option key={k} value={k}>{v as string}</option>)}</select><label className="text-[10px] text-zinc-600">Previsão<input type="date" value={dateValue(service.dueAt)} onChange={e=>onServiceChange(service.id,{dueAt:e.target.value})} className="mt-1 block h-9 rounded-xl border border-white/10 bg-zinc-900 px-2 text-xs text-white"/></label><label className="text-[10px] text-zinc-600">Custo final<input type="number" value={service.finalCost||''} onChange={e=>onServiceChange(service.id,{finalCost:Number(e.target.value)||0})} className="mt-1 block h-9 w-28 rounded-xl border border-white/10 bg-zinc-900 px-2 text-xs text-white"/></label></>}</div>{service.notes&&<p className="mt-2 text-xs text-zinc-600">{service.notes}</p>}</div>)}{!order.services.length&&<div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-zinc-600">Nenhum serviço incluído. Esta consulta ainda não conta como preparação ativa.</div>}</div>
 <div className="mt-5 rounded-2xl border border-amber-400/10 bg-amber-400/[.035] p-4"><p className="text-xs font-semibold uppercase tracking-[.13em] text-amber-300">Solicitar preparação</p><div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5"><select value={serviceType} onChange={e=>setServiceType(e.target.value)} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white">{SERVICE_TYPES.map(t=><option key={t}>{t}</option>)}</select><input value={provider} onChange={e=>setProvider(e.target.value)} placeholder="Prestador" className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white outline-none"/><input type="number" value={estimatedCost} onChange={e=>setEstimatedCost(e.target.value)} placeholder="Orçamento R$" className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white outline-none"/><input type="date" value={dueAt} onChange={e=>setDueAt(e.target.value)} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white"/><button onClick={onAddService} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 text-xs font-bold text-black"><Plus size={14}/> Enviar para aprovação</button></div><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Observação do serviço" className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white outline-none"/></div>
 <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-semibold uppercase tracking-[.13em] text-zinc-500">Histórico do veículo</p><div className="mt-3 space-y-2">{(history||[]).slice(0,12).map((event:any)=><div key={event.id} className="flex items-start justify-between gap-4 border-b border-white/5 pb-2 text-xs"><div><p className="font-semibold text-zinc-300">{event.label}</p><p className="mt-1 text-zinc-600">{event.provider||event.details||''}{event.byName?` · ${event.byName}`:''}</p></div><div className="shrink-0 text-right"><p className="font-semibold text-zinc-400">{event.amount?money(event.amount):''}</p><p className="mt-1 text-[10px] text-zinc-600">{event.at?new Date(event.at).toLocaleString('pt-BR'):''}</p></div></div>)}{!(history||[]).length&&<p className="text-xs text-zinc-600">O histórico nasce quando a primeira preparação é solicitada.</p>}</div></div></>};
const Metric=({icon,label,value,note,warn,danger}:{icon:React.ReactNode;label:string;value:string;note:string;warn?:boolean;danger?:boolean})=><div className={`rounded-[22px] border p-4 ${danger?'border-red-400/20 bg-red-400/[.05]':warn?'border-amber-400/20 bg-amber-400/[.05]':'border-white/10 bg-white/[.03]'}`}><div className="flex items-center gap-2 text-zinc-500">{icon}<p className="text-xs">{label}</p></div><p className="mt-2 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-zinc-600">{note}</p></div>;
export default PrepTrackPanel;