import React,{useEffect,useMemo,useState} from 'react';
import { FileCheck2, Search, X } from 'lucide-react';
import type { User, VehicleDocumentCase, VehicleMaster } from '../types';
import { dmsVehicleService } from '../services/dmsVehicleService';
import { vehicleDocumentService } from '../services/vehicleDocumentService';

type Props={currentUser:User;companyId:string;storeId:string;storeName:string};
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const statusLabel=(v:string)=>v==='ok'?'OK':v==='not_required'?'Não se aplica':v==='blocked'?'Bloqueado':v==='completed'?'Concluído':v==='submitted'?'Protocolado':v==='signed'?'Assinado':v==='ready'?'Pronto':'Pendente';

const VehicleDocumentsPanel:React.FC<Props>=({currentUser,companyId,storeId,storeName})=>{
 const[open,setOpen]=useState(false);
 const[masters,setMasters]=useState<VehicleMaster[]>([]);
 const[cases,setCases]=useState<VehicleDocumentCase[]>([]);
 const[selectedId,setSelectedId]=useState('');
 const[search,setSearch]=useState('');
 const[busy,setBusy]=useState(false);
 const[message,setMessage]=useState('');
 const[error,setError]=useState('');

 const load=async()=>{
  try{
   const [m,c]=await Promise.all([dmsVehicleService.list(companyId,storeId),vehicleDocumentService.list(companyId,storeId)]);
   setMasters(m.filter(item=>item.stage!=='exited'));
   setCases(c);
  }catch(e:any){setError(e?.message||'Falha ao carregar documentos.');}
 };
 useEffect(()=>{if(open)void load();},[open,companyId,storeId]);

 const filtered=useMemo(()=>{
  const q=search.trim().toLowerCase();
  if(!q)return masters;
  return masters.filter(item=>[item.plate,item.model,item.brand,item.year].some(v=>String(v||'').toLowerCase().includes(q)));
 },[masters,search]);

 const master=masters.find(item=>item.vehicleId===selectedId)||null;
 const current=cases.find(item=>item.vehicleId===selectedId)||null;

 const select=async(item:VehicleMaster)=>{
  setSelectedId(item.vehicleId);setMessage('');setError('');
  if(!cases.some(c=>c.vehicleId===item.vehicleId)){
   try{
    const created=await vehicleDocumentService.ensure(item,currentUser);
    setCases(prev=>[created,...prev]);
   }catch(e:any){setError(e?.message||'Não foi possível abrir o dossiê documental.');}
  }
 };

 const patch=(values:Partial<VehicleDocumentCase>)=>{
  if(!current)return;
  setCases(prev=>prev.map(item=>item.vehicleId===current.vehicleId?{...item,...values}:item));
 };
 const save=async()=>{
  const item=cases.find(row=>row.vehicleId===selectedId);
  if(!item)return;
  setBusy(true);setError('');setMessage('');
  try{
    const saved=await vehicleDocumentService.save(item,currentUser);
    setCases(prev=>prev.map(row=>row.id===saved.id?saved:row));
    setMessage('Dossiê documental atualizado.');
  }catch(e:any){setError(e?.message||'Não foi possível salvar o dossiê.');}
  finally{setBusy(false);}
 };

 return <>
  <button title="Documentos do veículo" onClick={()=>setOpen(true)} className="fixed right-5 z-[136] grid h-12 w-12 place-items-center rounded-full border border-violet-400/25 bg-zinc-950/95 text-violet-300 shadow-2xl" style={{bottom:200}}><FileCheck2 size={18}/></button>
  {open&&<div className="fixed inset-0 z-[282] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={()=>setOpen(false)}>
   <div className="mx-auto max-w-7xl overflow-hidden rounded-[30px] border border-white/10 bg-zinc-950 text-white shadow-2xl" onClick={e=>e.stopPropagation()}>
    <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 md:p-7"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-300">DMS · DOCUMENTOS</p><h2 className="mt-2 text-2xl font-semibold">Dossiê documental do veículo.</h2><p className="mt-1 text-sm text-zinc-500">{storeName}. ATPV-e, CRLV, gravame, débitos, multas e despachante.</p></div><button onClick={()=>setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[.05] text-zinc-400"><X size={18}/></button></header>
    <div className="grid gap-4 p-5 lg:grid-cols-[.8fr_1.2fr] md:p-7">
      <section className="rounded-[24px] border border-white/10 bg-white/[.025] p-4"><div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3"><Search size={14} className="text-zinc-600"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Placa ou veículo" className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-zinc-700"/></div><div className="mt-3 max-h-[610px] space-y-2 overflow-y-auto">{filtered.map(item=>{const dc=cases.find(c=>c.vehicleId===item.vehicleId);return <button key={item.vehicleId} onClick={()=>void select(item)} className={`w-full rounded-2xl border p-4 text-left ${selectedId===item.vehicleId?'border-violet-400/30 bg-violet-400/[.06]':'border-white/10 bg-black/20'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-semibold">{item.plate}</p><p className="mt-1 text-sm text-zinc-400">{item.model}</p><p className="mt-1 text-[10px] text-zinc-600">{item.stage}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${dc?.atpvStatus==='completed'&&dc?.crlvStatus==='ok'?'bg-emerald-400/10 text-emerald-300':'bg-amber-400/10 text-amber-300'}`}>{dc?'DOSSIÊ':'ABRIR'}</span></div></button>})}{!filtered.length&&<p className="p-8 text-center text-xs text-zinc-600">Nenhum veículo encontrado.</p>}</div></section>
      <section className="rounded-[24px] border border-white/10 bg-white/[.025] p-5">{!master||!current?<div className="grid min-h-[420px] place-items-center text-center"><div><FileCheck2 size={32} className="mx-auto text-zinc-700"/><p className="mt-3 font-semibold text-zinc-300">Selecione um veículo</p><p className="mt-1 text-sm text-zinc-600">O dossiê documental fica preso ao vehicleId, não à tela.</p></div></div>:<>
        <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-lg font-semibold">{master.plate}</p><p className="mt-1 text-zinc-400">{master.model}</p><p className="mt-1 text-xs text-zinc-600">vehicleId: {master.vehicleId}</p></div><div className="text-right"><p className="text-xs text-zinc-600">Custo documental</p><p className="mt-1 text-xl font-semibold">{money((Number(current.dispatcherCost)||0)+(Number(current.finesAmount)||0)+(Number(current.debtsAmount)||0))}</p></div></div>
        {(message||error)&&<div className={`mt-4 rounded-xl border px-3 py-2 text-xs ${error?'border-red-400/20 bg-red-400/5 text-red-300':'border-emerald-400/20 bg-emerald-400/5 text-emerald-300'}`}>{error||message}</div>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <FieldSelect label="ATPV-e / transferência" value={current.atpvStatus} onChange={v=>patch({atpvStatus:v as any})} options={[['pending','Pendente'],['ready','Pronto'],['signed','Assinado'],['submitted','Protocolado'],['completed','Concluído']]}/>
          <FieldSelect label="CRLV" value={current.crlvStatus} onChange={v=>patch({crlvStatus:v as any})}/>
          <FieldSelect label="Gravame" value={current.lienStatus} onChange={v=>patch({lienStatus:v as any})}/>
          <FieldSelect label="Débitos consultados" value={current.debtsStatus} onChange={v=>patch({debtsStatus:v as any})}/>
          <FieldInput label="Multas R$" type="number" value={String(current.finesAmount||'')} onChange={v=>patch({finesAmount:Number(v)||0})}/>
          <FieldInput label="Outros débitos R$" type="number" value={String(current.debtsAmount||'')} onChange={v=>patch({debtsAmount:Number(v)||0})}/>
          <FieldInput label="Despachante" value={current.dispatcherName||''} onChange={v=>patch({dispatcherName:v})}/>
          <FieldInput label="Custo despachante R$" type="number" value={String(current.dispatcherCost||'')} onChange={v=>patch({dispatcherCost:Number(v)||0})}/>
          <FieldInput label="Prazo da transferência" type="date" value={current.transferDueDate||''} onChange={v=>patch({transferDueDate:v})}/>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] text-zinc-600">Status geral</p><p className="mt-1 text-sm font-semibold text-zinc-300">{statusLabel(current.atpvStatus)} · CRLV {statusLabel(current.crlvStatus)} · Gravame {statusLabel(current.lienStatus)}</p></div>
        </div>
        <label className="mt-3 block text-xs text-zinc-500">Observações<textarea value={current.notes||''} onChange={e=>patch({notes:e.target.value})} rows={4} className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 p-3 text-sm text-white outline-none"/></label>
        <button disabled={busy} onClick={()=>void save()} className="mt-4 h-11 w-full rounded-xl bg-violet-400 text-sm font-bold text-violet-950 disabled:opacity-50">{busy?'SALVANDO...':'SALVAR DOSSIÊ DOCUMENTAL'}</button>
        {current.dispatcherFinanceEntryId&&<p className="mt-2 text-center text-[10px] text-zinc-600">Custo do despachante já enviado ao Contas a Pagar.</p>}
      </>}</section>
    </div>
   </div>
  </div>}
 </>;
};
const FieldInput=({label,value,onChange,type='text'}:{label:string;value:string;onChange:(v:string)=>void;type?:string})=><label className="text-xs text-zinc-500">{label}<input type={type} value={value} onChange={e=>onChange(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white outline-none"/></label>;
const FieldSelect=({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options?:[string,string][]})=>{const opts=options||[['pending','Pendente'],['ok','OK'],['not_required','Não se aplica'],['blocked','Bloqueado']];return <label className="text-xs text-zinc-500">{label}<select value={value} onChange={e=>onChange(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white">{opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>};
export default VehicleDocumentsPanel;
