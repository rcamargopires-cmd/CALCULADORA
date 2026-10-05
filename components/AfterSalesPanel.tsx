import React,{useEffect,useMemo,useState} from 'react';
import { HeartHandshake, Plus, Search, X } from 'lucide-react';
import type { AfterSalesCase, AfterSalesCaseStatus, AfterSalesCaseType, SalesOrder, User } from '../types';
import { afterSalesService } from '../services/afterSalesService';
import { salesOrderService } from '../services/salesOrderService';
import { workshopService } from '../services/workshopService';

type Props={currentUser:User;companyId:string;storeId:string;storeName:string};
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const TYPE:Record<AfterSalesCaseType,string>={warranty:'Garantia',complaint:'Reclamação',documentation:'Documentação',return:'Retorno',other:'Outro'};
const STATUS:Record<AfterSalesCaseStatus,string>={open:'Aberto',in_progress:'Em andamento',waiting_supplier:'Aguardando fornecedor',resolved:'Resolvido',closed:'Encerrado'};

const AfterSalesPanel:React.FC<Props>=({currentUser,companyId,storeId,storeName})=>{
 const[open,setOpen]=useState(false);
 const[cases,setCases]=useState<AfterSalesCase[]>([]);
 const[sales,setSales]=useState<SalesOrder[]>([]);
 const[selectedId,setSelectedId]=useState('');
 const[search,setSearch]=useState('');
 const[newOpen,setNewOpen]=useState(false);
 const[saleId,setSaleId]=useState('');
 const[type,setType]=useState<AfterSalesCaseType>('warranty');
 const[title,setTitle]=useState('');
 const[description,setDescription]=useState('');
 const[busy,setBusy]=useState(false);
 const[message,setMessage]=useState('');
 const[error,setError]=useState('');

 useEffect(()=>{
  if(!open)return;
  const unsub=afterSalesService.subscribe(companyId,storeId,setCases,cause=>setError(String((cause as any)?.message||'Falha ao carregar pós-venda.')));
  void salesOrderService.list(companyId,storeId).then(list=>setSales(list.filter(item=>{
    if(!['invoiced','delivered'].includes(item.status))return false;
    const plate=String(item.plate||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    return /^[A-Z0-9]{7}$/.test(plate)&&Boolean(item.vehicleId)&&Boolean(String(item.customerId||'').trim())&&Number(item.netSalePrice||0)>0;
  }))).catch(()=>setSales([]));
  return unsub;
 },[open,companyId,storeId]);

 const filtered=useMemo(()=>{
  const q=search.trim().toLowerCase();
  if(!q)return cases;
  return cases.filter(item=>[item.plate,item.vehicle,item.customerName,item.title,item.supplierName,item.status].some(v=>String(v||'').toLowerCase().includes(q)));
 },[cases,search]);
 const selected=cases.find(item=>item.id===selectedId)||null;
 const selectedSale=sales.find(item=>item.salesOrderId===saleId)||null;
 const openCount=cases.filter(item=>!['resolved','closed'].includes(item.status)).length;
 const warrantyCost=cases.reduce((sum,item)=>sum+Number(item.cost||0),0);

 const create=async()=>{
  if(!selectedSale)return setError('Selecione uma venda faturada/entregue.');
  if(!title.trim())return setError('Informe o motivo do atendimento.');
  setBusy(true);setError('');setMessage('');
  try{
   const item=await afterSalesService.createFromSale({sale:selectedSale,type,title,description,actor:currentUser});
   setSelectedId(item.id);setNewOpen(false);setSaleId('');setTitle('');setDescription('');
   setMessage('Ocorrência pós-venda aberta.');
  }catch(e:any){setError(e?.message||'Não foi possível abrir o pós-venda.');}
  finally{setBusy(false);}
 };
 const patch=(values:Partial<AfterSalesCase>)=>{
  if(!selected)return;
  setCases(prev=>prev.map(item=>item.id===selected.id?{...item,...values}:item));
 };
 const save=async()=>{
  const current=cases.find(item=>item.id===selectedId);if(!current)return;
  setBusy(true);setError('');setMessage('');
  try{
    const saved=await afterSalesService.save(current,currentUser);
    setCases(prev=>prev.map(item=>item.id===saved.id?saved:item));
    setMessage('Pós-venda atualizado.');
  }catch(e:any){setError(e?.message||'Não foi possível salvar o pós-venda.');}
  finally{setBusy(false);}
 };
 const openWorkshopOrder=async()=>{
  const current=cases.find(item=>item.id===selectedId);if(!current)return;
  setBusy(true);setError('');setMessage('');
  try{
    const order=await workshopService.createOrder({
      companyId,storeId,orderType:current.type==='warranty'?'warranty':'customer',
      vehicleId:current.vehicleId,plate:current.plate,vehicle:current.vehicle,
      customerId:current.customerId,customerName:current.customerName,
      afterSalesCaseId:current.id,complaint:current.title+' · '+current.description,
      actor:currentUser,
    });
    setMessage('OS '+order.orderNumber+' aberta na Oficina DMS.');
  }catch(e:any){setError(e?.message||'Não foi possível abrir a ordem de serviço.');}
  finally{setBusy(false);}
 };

 return <>
  <button title="Pós-venda e garantia" onClick={()=>setOpen(true)} className="fixed right-5 z-[135] grid h-12 w-12 place-items-center rounded-full border border-pink-400/25 bg-zinc-950/95 text-pink-300 shadow-2xl" style={{bottom:140}}><HeartHandshake size={18}/></button>
  {open&&<div className="fixed inset-0 z-[283] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={()=>setOpen(false)}>
    <div className="mx-auto max-w-7xl overflow-hidden rounded-[30px] border border-white/10 bg-zinc-950 text-white shadow-2xl" onClick={e=>e.stopPropagation()}>
      <header className="flex flex-col gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-start sm:justify-between md:p-7"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-pink-300">DMS · PÓS-VENDA</p><h2 className="mt-2 text-2xl font-semibold">Garantias, retornos e ocorrências.</h2><p className="mt-1 text-sm text-zinc-500">{storeName}. Todo atendimento fica ligado à venda, cliente e vehicleId.</p></div><div className="flex gap-2"><button onClick={()=>setNewOpen(true)} className="flex h-10 items-center gap-2 rounded-xl bg-pink-400 px-4 text-xs font-bold text-pink-950"><Plus size={14}/> NOVO</button><button onClick={()=>setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[.05] text-zinc-400"><X size={18}/></button></div></header>
      <div className="p-5 md:p-7">
        <section className="grid gap-3 sm:grid-cols-3"><Metric label="Em aberto" value={String(openCount)} note="precisam acompanhamento"/><Metric label="Custo acumulado" value={money(warrantyCost)} note="garantia e pós-venda"/><Metric label="Encerrados" value={String(cases.filter(item=>item.status==='closed').length)} note="histórico preservado"/></section>
        {(message||error)&&<div className={`mt-4 rounded-xl border px-3 py-2 text-xs ${error?'border-red-400/20 bg-red-400/5 text-red-300':'border-emerald-400/20 bg-emerald-400/5 text-emerald-300'}`}>{error||message}</div>}
        <section className="mt-5 grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
          <div className="rounded-[24px] border border-white/10 bg-white/[.025] p-4"><div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3"><Search size={14} className="text-zinc-600"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Placa, cliente ou ocorrência" className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-zinc-700"/></div><div className="mt-3 max-h-[590px] space-y-2 overflow-y-auto">{filtered.map(item=><button key={item.id} onClick={()=>{setSelectedId(item.id);setMessage('');setError('');}} className={`w-full rounded-2xl border p-4 text-left ${selectedId===item.id?'border-pink-400/30 bg-pink-400/[.06]':'border-white/10 bg-black/20'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-semibold">{item.plate}</p><p className="mt-1 text-sm text-zinc-400">{item.title}</p><p className="mt-1 text-[10px] text-zinc-600">{item.customerName} · {TYPE[item.type]}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${['resolved','closed'].includes(item.status)?'bg-emerald-400/10 text-emerald-300':'bg-amber-400/10 text-amber-300'}`}>{STATUS[item.status].toUpperCase()}</span></div></button>)}{!filtered.length&&<p className="p-8 text-center text-xs text-zinc-600">Nenhuma ocorrência.</p>}</div></div>
          <div className="rounded-[24px] border border-white/10 bg-white/[.025] p-5">{!selected?<div className="grid min-h-[360px] place-items-center text-center"><div><HeartHandshake size={32} className="mx-auto text-zinc-700"/><p className="mt-3 font-semibold text-zinc-300">Selecione uma ocorrência</p><p className="mt-1 text-sm text-zinc-600">Aqui ficam status, custo, fornecedor e satisfação.</p></div></div>:<>
            <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-lg font-semibold">{selected.plate}</p><p className="mt-1 text-zinc-400">{selected.vehicle}</p><p className="mt-1 text-xs text-zinc-600">{selected.customerName} · {selected.customerPhone||'sem telefone'}</p></div><div className="text-right"><p className="text-xs text-zinc-600">Custo</p><p className="mt-1 text-xl font-semibold">{money(selected.cost)}</p></div></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <FieldSelect label="Tipo" value={selected.type} onChange={v=>patch({type:v as AfterSalesCaseType})} options={Object.entries(TYPE)}/>
              <FieldSelect label="Status" value={selected.status} onChange={v=>patch({status:v as AfterSalesCaseStatus})} options={Object.entries(STATUS)}/>
              <FieldInput label="Título" value={selected.title} onChange={v=>patch({title:v})}/>
              <FieldInput label="Fornecedor / oficina" value={selected.supplierName||''} onChange={v=>patch({supplierName:v})}/>
              <FieldInput label="Custo R$" type="number" value={String(selected.cost||'')} onChange={v=>patch({cost:Number(v)||0})}/>
              <FieldInput label="Satisfação 0 a 10" type="number" value={selected.satisfactionScore===undefined?'':String(selected.satisfactionScore)} onChange={v=>patch({satisfactionScore:Math.max(0,Math.min(10,Number(v)||0))})}/>
            </div>
            <label className="mt-3 block text-xs text-zinc-500">Descrição<textarea rows={4} value={selected.description} onChange={e=>patch({description:e.target.value})} className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 p-3 text-sm outline-none"/></label>
            <label className="mt-3 block text-xs text-zinc-500">Observação da satisfação<textarea rows={2} value={selected.satisfactionNotes||''} onChange={e=>patch({satisfactionNotes:e.target.value})} className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 p-3 text-sm outline-none"/></label>
            <div className="mt-4 grid gap-2 sm:grid-cols-2"><button disabled={busy} onClick={()=>void openWorkshopOrder()} className="h-11 rounded-xl border border-orange-400/20 bg-orange-400/[.06] text-sm font-bold text-orange-300 disabled:opacity-50">ABRIR / VER OS</button><button disabled={busy} onClick={()=>void save()} className="h-11 rounded-xl bg-pink-400 text-sm font-bold text-pink-950 disabled:opacity-50">{busy?'SALVANDO...':'SALVAR PÓS-VENDA'}</button></div>
            {selected.financeEntryId&&<p className="mt-2 text-center text-[10px] text-zinc-600">Custo enviado automaticamente ao Contas a Pagar.</p>}
          </>}</div>
        </section>
      </div>
    </div>
  </div>}
  {newOpen&&<div className="fixed inset-0 z-[294] overflow-y-auto bg-black/75 p-4 backdrop-blur-sm" onClick={()=>setNewOpen(false)}><div className="mx-auto my-8 w-full max-w-xl rounded-[26px] border border-white/10 bg-zinc-950 p-5 text-white shadow-2xl" onClick={e=>e.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-pink-300">NOVO PÓS-VENDA</p><h3 className="mt-1 text-xl font-semibold">Abrir ocorrência</h3></div><button onClick={()=>setNewOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-white/[.05] text-zinc-400"><X size={17}/></button></div><div className="mt-5 space-y-3"><label className="block text-xs text-zinc-500">Venda<select value={saleId} onChange={e=>setSaleId(e.target.value)} disabled={!sales.length} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white disabled:opacity-50"><option value="">{sales.length?'Selecione...':'Nenhuma venda DMS elegível'}</option>{sales.map(item=><option key={item.salesOrderId} value={item.salesOrderId}>{item.plate} · {item.vehicle} · {item.customerName}</option>)}</select></label>{!sales.length&&<div className="rounded-xl border border-amber-400/15 bg-amber-400/[.05] px-3 py-2 text-xs text-amber-200">O pós-venda só aceita Pedidos de Venda DMS faturados ou entregues, com cliente, veículo e valor válidos. Assim que existir uma venda elegível, ela aparecerá aqui.</div>}<FieldSelect label="Tipo" value={type} onChange={v=>setType(v as AfterSalesCaseType)} options={Object.entries(TYPE)}/><FieldInput label="Título" value={title} onChange={setTitle}/><label className="block text-xs text-zinc-500">Descrição<textarea rows={4} value={description} onChange={e=>setDescription(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 p-3 text-sm outline-none"/></label><button disabled={busy||!sales.length} onClick={()=>void create()} className="h-11 w-full rounded-xl bg-pink-400 text-sm font-bold text-pink-950 disabled:opacity-50">{busy?'ABRINDO...':'ABRIR OCORRÊNCIA'}</button></div></div></div>}
 </>;
};
const Metric=({label,value,note}:{label:string;value:string;note:string})=><div className="rounded-[22px] border border-white/10 bg-white/[.03] p-4"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-zinc-600">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-zinc-600">{note}</p></div>;
const FieldInput=({label,value,onChange,type='text'}:{label:string;value:string;onChange:(v:string)=>void;type?:string})=><label className="text-xs text-zinc-500">{label}<input type={type} value={value} min={type==='number'?0:undefined} max={label.includes('Satisfação')?10:undefined} onChange={e=>onChange(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white outline-none"/></label>;
const FieldSelect=({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:[string,string][]})=><label className="text-xs text-zinc-500">{label}<select value={value} onChange={e=>onChange(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white">{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>;
export default AfterSalesPanel;
