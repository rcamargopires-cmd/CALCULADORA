import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleDollarSign, Clock, Search, X } from 'lucide-react';
import type { PrepPayable, User } from '../types';
import { prepFinanceService } from '../services/prepFinanceService';

type Props={currentUser:User;companyId:string;storeId:string;storeName:string};
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const dateBr=(value?:string)=>{
  const raw=String(value||'').slice(0,10);
  if(!raw)return 'Sem vencimento';
  const [y,m,d]=raw.split('-');
  return y&&m&&d?`${d}/${m}/${y}`:raw;
};
const clean=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'');

const PrepPayablesPanel:React.FC<Props>=({currentUser,companyId,storeId,storeName})=>{
  const[open,setOpen]=useState(false);
  const[items,setItems]=useState<PrepPayable[]>([]);
  const[selectedId,setSelectedId]=useState('');
  const[search,setSearch]=useState('');
  const[method,setMethod]=useState('Pix');
  const[reference,setReference]=useState('');
  const[busy,setBusy]=useState('');
  const[message,setMessage]=useState('');
  const[error,setError]=useState('');

  useEffect(()=>{
    if(!open)return;
    return prepFinanceService.subscribePayables(
      companyId,
      storeId,
      next=>setItems(next),
      cause=>setError(String((cause as any)?.message||'Não foi possível carregar as contas a pagar.')),
    );
  },[open,companyId,storeId]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q)return items;
    const plate=clean(search);
    return items.filter(item=>
      (plate&&clean(item.plate).includes(plate)) ||
      [item.vehicle,item.provider,item.serviceType,item.status].some(value=>String(value||'').toLowerCase().includes(q))
    );
  },[items,search]);

  const selected=items.find(item=>item.id===selectedId)||null;
  const pending=items.filter(item=>item.status==='pending');
  const paid=items.filter(item=>item.status==='paid');
  const pendingValue=pending.reduce((sum,item)=>sum+(Number(item.amount)||0),0);
  const overdue=pending.filter(item=>item.dueAt&&new Date(`${item.dueAt}T23:59:59`).getTime()<Date.now());

  const pay=async()=>{
    if(!selected||selected.status!=='pending')return;
    setBusy(selected.id);setMessage('');setError('');
    try{
      await prepFinanceService.markPaid(selected,currentUser,method,reference.trim());
      setMessage(`Pagamento registrado para ${selected.provider}.`);
      setReference('');
    }catch(cause:any){
      setError(cause?.message||'Não foi possível registrar o pagamento.');
    }finally{setBusy('');}
  };

  return <>
    <button
      onClick={()=>setOpen(true)}
      title="Contas a pagar · preparação"
      className="fixed right-5 z-[138] grid h-12 w-12 place-items-center rounded-full border border-emerald-400/25 bg-zinc-950/95 text-emerald-300 shadow-2xl"
      style={{bottom:320}}
    >
      <CircleDollarSign size={18}/>
    </button>

    {open&&<div className="fixed inset-0 z-[275] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={()=>setOpen(false)}>
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[30px] border border-white/10 bg-zinc-950 text-white shadow-2xl" onClick={event=>event.stopPropagation()}>
        <header className="flex flex-col gap-4 border-b border-white/10 p-5 md:flex-row md:items-start md:justify-between md:p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-emerald-300">CONTAS A PAGAR · PREPARAÇÃO</p>
            <h3 className="mt-2 text-2xl font-semibold">Do gerente para o caixa, sem perder a placa.</h3>
            <p className="mt-2 text-sm text-zinc-500">{storeName}. Somente preparações aprovadas entram nesta fila.</p>
          </div>
          <button onClick={()=>setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[.05] text-zinc-400"><X size={18}/></button>
        </header>

        <div className="p-5 md:p-7">
          <section className="grid gap-3 md:grid-cols-4">
            <Metric icon={<Clock size={16}/>} label="Pendentes" value={String(pending.length)} note={money(pendingValue)} warn={pending.length>0}/>
            <Metric icon={<CircleDollarSign size={16}/>} label="Valor em aberto" value={money(pendingValue)} note="aprovado pelo gerente"/>
            <Metric icon={<CheckCircle2 size={16}/>} label="Pagos" value={String(paid.length)} note="histórico preservado"/>
            <Metric icon={<Clock size={16}/>} label="Vencidos" value={String(overdue.length)} note="precisam de atenção" danger={overdue.length>0}/>
          </section>

          {(message||error)&&<div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${error?'border-red-400/20 bg-red-400/[.05] text-red-300':'border-emerald-400/20 bg-emerald-400/[.05] text-emerald-300'}`}>{error||message}</div>}

          <section className="mt-5 grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
            <div className="rounded-[24px] border border-white/10 bg-white/[.025] p-4">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3">
                <Search size={14} className="text-zinc-600"/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Placa, fornecedor ou serviço" className="h-10 w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-700"/>
              </div>
              <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto pr-1">
                {filtered.map(item=>{
                  const late=item.status==='pending'&&item.dueAt&&new Date(`${item.dueAt}T23:59:59`).getTime()<Date.now();
                  return <button key={item.id} onClick={()=>{setSelectedId(item.id);setMessage('');setError('');}} className={`w-full rounded-2xl border p-4 text-left ${selectedId===item.id?'border-emerald-400/30 bg-emerald-400/[.06]':'border-white/10 bg-black/20'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{item.plate}</span>
                          <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${item.status==='paid'?'bg-emerald-400/10 text-emerald-300':item.status==='cancelled'?'bg-zinc-400/10 text-zinc-400':'bg-amber-400/10 text-amber-300'}`}>{item.status==='paid'?'PAGO':item.status==='cancelled'?'CANCELADO':'A PAGAR'}</span>
                          {late&&<span className="rounded-full bg-red-400/10 px-2 py-1 text-[9px] font-bold text-red-300">VENCIDO</span>}
                        </div>
                        <p className="mt-1 text-sm text-zinc-400">{item.provider}</p>
                        <p className="mt-1 text-xs text-zinc-600">{item.serviceType} · {item.vehicle}</p>
                      </div>
                      <strong className="text-sm">{money(item.amount)}</strong>
                    </div>
                  </button>;
                })}
                {!filtered.length&&<div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-600">Nenhuma conta encontrada.</div>}
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/[.025] p-5">
              {!selected?<div className="grid min-h-[300px] place-items-center text-center"><div><CircleDollarSign size={30} className="mx-auto text-zinc-700"/><p className="mt-3 font-semibold text-zinc-300">Selecione uma conta</p><p className="mt-1 text-sm text-zinc-600">O pagamento fica vinculado ao fornecedor e ao histórico do carro.</p></div></div>:<>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-lg font-semibold">{selected.plate}</p>
                    <p className="mt-1 text-zinc-400">{selected.vehicle}</p>
                    <p className="mt-1 text-sm text-zinc-500">{selected.serviceType} · {selected.provider}</p>
                  </div>
                  <div className="text-right"><p className="text-xs text-zinc-600">Valor aprovado</p><p className="mt-1 text-2xl font-semibold">{money(selected.amount)}</p></div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Info label="Vencimento" value={dateBr(selected.dueAt)}/>
                  <Info label="Aprovado por" value={selected.approvedByName||selected.approvedBy||'—'}/>
                  <Info label="Fornecedor" value={selected.provider||'—'}/>
                  <Info label="Situação" value={selected.status==='paid'?'Pago':selected.status==='cancelled'?'Cancelado':'A pagar'}/>
                </div>

                {selected.status==='pending'&&<div className="mt-5 rounded-2xl border border-emerald-400/10 bg-emerald-400/[.035] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[.13em] text-emerald-300">Baixar pagamento</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <select value={method} onChange={e=>setMethod(e.target.value)} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white">
                      <option>Pix</option><option>Transferência</option><option>Boleto</option><option>Dinheiro</option><option>Cartão</option><option>Outro</option>
                    </select>
                    <input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Comprovante / referência" className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white outline-none"/>
                  </div>
                  <button disabled={busy===selected.id} onClick={()=>void pay()} className="mt-3 h-11 w-full rounded-xl bg-emerald-400 text-sm font-bold text-emerald-950 disabled:opacity-50">{busy===selected.id?'Registrando...':'MARCAR COMO PAGO'}</button>
                </div>}

                {selected.status==='paid'&&<div className="mt-5 rounded-2xl border border-emerald-400/15 bg-emerald-400/[.04] p-4 text-sm text-emerald-300">
                  Pago em {selected.paidAt?new Date(selected.paidAt).toLocaleString('pt-BR'):'—'} por {selected.paidByName||selected.paidBy||'—'}.
                  {selected.paymentMethod&&<span> · {selected.paymentMethod}</span>}
                  {selected.paymentReference&&<span> · {selected.paymentReference}</span>}
                </div>}
              </>}
            </div>
          </section>
        </div>
      </div>
    </div>}
  </>;
};

const Metric=({icon,label,value,note,warn,danger}:{icon:React.ReactNode;label:string;value:string;note:string;warn?:boolean;danger?:boolean})=><div className={`rounded-[22px] border p-4 ${danger?'border-red-400/20 bg-red-400/[.05]':warn?'border-amber-400/20 bg-amber-400/[.05]':'border-white/10 bg-white/[.03]'}`}><div className="flex items-center gap-2 text-zinc-500">{icon}<p className="text-xs">{label}</p></div><p className="mt-2 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-zinc-600">{note}</p></div>;
const Info=({label,value}:{label:string;value:string})=><div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-zinc-600">{label}</p><p className="mt-1 text-sm font-semibold text-zinc-300">{value}</p></div>;

export default PrepPayablesPanel;
