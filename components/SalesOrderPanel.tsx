import React, { useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, Building2, CarFront, CheckCircle2, FileCheck2, ReceiptText, Search, ShoppingCart, X } from 'lucide-react';
import type { SalesOrder, User } from '../types';
import { salesOrderService } from '../services/salesOrderService';
import FiscalInvoicePanel from './FiscalInvoicePanel';

type Props={currentUser:User;companyId:string;storeId:string;storeName:string};
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const statusLabel=(status:SalesOrder['status'])=>status==='draft'?'Aguardando aprovação':status==='approved'?'Aprovado':status==='credit_pending'?'Crédito pendente':status==='ready_to_invoice'?'Liberado p/ faturar':status==='invoiced'?'Faturado':status==='delivered'?'Entregue':'Cancelado';
const statusClass=(status:SalesOrder['status'])=>status==='delivered'?'bg-emerald-100 text-emerald-700':status==='cancelled'?'bg-slate-100 text-slate-500':status==='invoiced'||status==='ready_to_invoice'?'bg-blue-100 text-blue-700':status==='credit_pending'?'bg-amber-100 text-amber-700':'bg-violet-100 text-violet-700';

const SalesOrderPanel:React.FC<Props>=({currentUser,companyId,storeId,storeName})=>{
  const[open,setOpen]=useState(false);
  const[items,setItems]=useState<SalesOrder[]>([]);
  const[selectedId,setSelectedId]=useState('');
  const[search,setSearch]=useState('');
  const[bankName,setBankName]=useState('');
  const[creditReference,setCreditReference]=useState('');
  const[financingReturn,setFinancingReturn]=useState('');
  const[invoiceNumber,setInvoiceNumber]=useState('');
  const[fiscalOpen,setFiscalOpen]=useState(false);
  const[busy,setBusy]=useState('');
  const[message,setMessage]=useState('');
  const[error,setError]=useState('');

  useEffect(()=>{
    if(!open)return;
    return salesOrderService.subscribe(companyId,storeId,setItems,cause=>setError(String((cause as any)?.message||'Não foi possível carregar os pedidos de venda.')));
  },[open,companyId,storeId]);

  const selected=items.find(item=>item.id===selectedId)||null;
  useEffect(()=>{
    setBankName(selected?.bankName||'');
    setCreditReference(selected?.creditReference||'');
    setFinancingReturn(selected?.financingReturn?String(selected.financingReturn):'');
    setInvoiceNumber(selected?.invoiceNumber||'');
  },[selectedId,selected?.bankName,selected?.creditReference,selected?.financingReturn,selected?.invoiceNumber]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q)return items;
    return items.filter(item=>[item.plate,item.vehicle,item.customerName,item.status,item.bankName].some(value=>String(value||'').toLowerCase().includes(q)));
  },[items,search]);

  const metrics={
    approval:items.filter(item=>item.status==='draft').length,
    credit:items.filter(item=>item.status==='credit_pending').length,
    invoice:items.filter(item=>item.status==='ready_to_invoice').length,
    delivered:items.filter(item=>item.status==='delivered').length,
  };

  const act=async(key:string,fn:()=>Promise<SalesOrder>,success:string)=>{
    if(!selected)return;
    setBusy(key);setError('');setMessage('');
    try{
      const next=await fn();
      setItems(prev=>prev.map(item=>item.id===next.id?next:item));
      setMessage(success);
    }catch(cause:any){setError(cause?.message||'Não foi possível concluir a ação.');}
    finally{setBusy('');}
  };

  const updateChecklist=async(key:keyof SalesOrder['deliveryChecklist'],value:boolean)=>{
    if(!selected)return;
    const checklist={financialReleased:false,documentsReady:false,vehicleReady:false,customerConfirmed:false,...(selected.deliveryChecklist||{}),[key]:value};
    setBusy('checklist');setError('');
    try{
      const next=await salesOrderService.updateDeliveryChecklist(selected,checklist);
      setItems(prev=>prev.map(item=>item.id===next.id?next:item));
    }catch(cause:any){setError(cause?.message||'Não foi possível atualizar o checklist.');}
    finally{setBusy('');}
  };

  return <>
    <button type="button" title="Pedidos de venda" className="hidden" onClick={()=>setOpen(true)}>Pedidos de venda</button>

    {open&&<div className="fixed inset-0 z-[284] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm md:p-6" onClick={()=>setOpen(false)}>
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[30px] border border-slate-200 bg-white text-slate-900 shadow-2xl" onClick={event=>event.stopPropagation()}>
        <header className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between md:p-7">
          <div className="flex items-start gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-700"><ShoppingCart size={22}/></div><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-violet-700">DMS · PEDIDO DE VENDA</p><h2 className="mt-1 text-2xl font-semibold">Da proposta aceita à entrega.</h2><p className="mt-1 text-sm text-slate-500">{storeName}. Reserva, aprovação, crédito, faturamento, recebíveis e saída do estoque.</p></div></div>
          <button onClick={()=>setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-500"><X size={18}/></button>
        </header>

        <div className="p-5 md:p-7">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Aguardando gestor" value={metrics.approval} note="pedidos criados pelo aceite"/>
            <Metric label="Crédito pendente" value={metrics.credit} note="financiamentos"/>
            <Metric label="Liberados p/ faturar" value={metrics.invoice} note="prontos para NF"/>
            <Metric label="Entregues" value={metrics.delivered} note="saíram do estoque"/>
          </section>

          {(message||error)&&<div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${error?'border-red-200 bg-red-50 text-red-700':'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error||message}</div>}

          <section className="mt-5 grid gap-4 lg:grid-cols-[.82fr_1.18fr]">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Search size={14} className="text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Placa, cliente, veículo ou status" className="h-10 w-full bg-transparent text-sm outline-none"/></div>
              <div className="mt-3 max-h-[620px] space-y-2 overflow-y-auto pr-1">
                {filtered.map(item=><button key={item.id} onClick={()=>{setSelectedId(item.id);setError('');setMessage('');}} className={`w-full rounded-2xl border p-4 text-left ${selectedId===item.id?'border-violet-300 bg-violet-50':'border-slate-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-bold">{item.plate}</span><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${statusClass(item.status)}`}>{statusLabel(item.status).toUpperCase()}</span></div><p className="mt-1 text-sm font-semibold">{item.vehicle}</p><p className="mt-1 text-xs text-slate-500">{item.customerName}</p></div><strong className="shrink-0 text-sm">{money(item.netSalePrice)}</strong></div>
                </button>)}
                {!filtered.length&&<div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Nenhum Pedido de Venda. Um pedido nasce automaticamente quando uma proposta é marcada como aceita.</div>}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              {!selected?<div className="grid min-h-[420px] place-items-center text-center"><div><ShoppingCart size={34} className="mx-auto text-slate-300"/><p className="mt-3 font-semibold">Selecione um Pedido de Venda</p><p className="mt-1 text-sm text-slate-500">O fluxo nasce no CRM quando o cliente aceita a proposta.</p></div></div>:<div>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-lg font-bold">{selected.plate}</p><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${statusClass(selected.status)}`}>{statusLabel(selected.status).toUpperCase()}</span></div><h3 className="mt-1 text-xl font-semibold">{selected.vehicle}</h3><p className="mt-1 text-sm text-slate-500">{selected.customerName} · {selected.customerPhone}</p><p className="mt-1 font-mono text-[10px] text-slate-400">Pedido {selected.salesOrderId}</p></div>
                  <div className="text-right"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Venda líquida</p><p className="mt-1 text-2xl font-semibold">{money(selected.netSalePrice)}</p></div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <Info label="Preço" value={money(selected.salePrice)}/>
                  <Info label="Desconto" value={money(selected.discount)}/>
                  <Info label="Entrada" value={money(selected.cashEntry)}/>
                  <Info label="Financiamento" value={money(selected.financedAmount)}/>
                  <Info label="Troca" value={money(selected.tradeInValue)}/>
                  <Info label="Saldo troca" value={money(selected.tradeInDebt)}/>
                </div>
                {(selected.bankName||selected.creditReference||Number(selected.financingReturn)>0)&&<div className="mt-3 grid gap-3 sm:grid-cols-3"><Info label="Banco" value={selected.bankName||'—'}/><Info label="Proposta banco" value={selected.creditReference||'—'}/><Info label="Retorno estimado" value={money(Number(selected.financingReturn)||0)}/></div>}
                {selected.status!=='draft'&&selected.cashEntry>0&&<div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-800"><BadgeDollarSign size={17} className="mb-2"/><b>Sinal integrado ao financeiro.</b><p className="mt-1">Ao aprovar o pedido, a entrada de {money(selected.cashEntry)} já nasce em Contas a Receber, antes do faturamento.</p></div>}

                {selected.tradeInPurchaseId&&<div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800"><CarFront size={16} className="mb-2"/><b>Troca vinculada à Compra.</b><p className="mt-1">O veículo {selected.tradeInPlate} já possui processo de entrada criado no módulo Compras.</p></div>}

                {selected.status==='draft'&&<ActionBox title="Aprovação gerencial" icon={<CheckCircle2 size={17}/>}>
                  <p className="text-xs text-slate-600">Aprovar reserva e condições comerciais. Se houver financiamento, o pedido segue para crédito.</p>
                  <button disabled={busy!==''} onClick={()=>void act('approve',()=>salesOrderService.approve(selected,currentUser),'Pedido aprovado.')} className="mt-3 h-11 w-full rounded-xl bg-violet-600 text-sm font-bold text-white disabled:opacity-50">{busy==='approve'?'APROVANDO...':'APROVAR PEDIDO'}</button>
                </ActionBox>}

                {selected.status==='credit_pending'&&<ActionBox title="Crédito / financiamento" icon={<Building2 size={17}/>}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-semibold text-slate-500">Banco / financeira<input value={bankName} onChange={e=>setBankName(e.target.value)} placeholder="Ex.: Banco Volkswagen" className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none"/></label>
                    <label className="block text-xs font-semibold text-slate-500">Proposta / referência<input value={creditReference} onChange={e=>setCreditReference(e.target.value)} placeholder="Nº da proposta no banco" className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none"/></label>
                    <label className="block text-xs font-semibold text-slate-500 sm:col-span-2">Retorno financeiro estimado<input type="number" value={financingReturn} onChange={e=>setFinancingReturn(e.target.value)} placeholder="R$ 0,00" className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none"/></label>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2"><button disabled={busy!==''||!bankName.trim()} onClick={()=>void act('credit-ok',()=>salesOrderService.setCredit(selected,'approved',bankName,currentUser,creditReference,Number(financingReturn)||0),'Crédito aprovado. Pedido liberado para faturamento.')} className="h-10 rounded-xl bg-emerald-600 text-xs font-bold text-white disabled:opacity-50">CRÉDITO APROVADO</button><button disabled={busy!==''} onClick={()=>void act('credit-no',()=>salesOrderService.setCredit(selected,'rejected',bankName,currentUser,creditReference,Number(financingReturn)||0),'Crédito recusado registrado.')} className="h-10 rounded-xl border border-red-200 text-xs font-bold text-red-600 disabled:opacity-50">CRÉDITO RECUSADO</button></div>
                </ActionBox>}

                {selected.status==='ready_to_invoice'&&<ActionBox title="Faturamento" icon={<FileCheck2 size={17}/>}>
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-800"><b>Fiscal integrado.</b><p className="mt-1">Emita ou consulte a NF-e antes de concluir o faturamento financeiro. Em faturamento manual, informe o número abaixo.</p></div>
                  <button disabled={busy!==''} onClick={()=>setFiscalOpen(true)} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white text-xs font-bold text-indigo-700"><ReceiptText size={15}/> ABRIR FISCAL / NF-e</button>
                  <label className="mt-3 block text-xs font-semibold text-slate-500">Número da nota / faturamento<input value={invoiceNumber} onChange={e=>setInvoiceNumber(e.target.value)} placeholder="NF / referência" className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none"/></label>
                  {selected.fiscalStatus&&<p className="mt-2 text-[10px] text-slate-500">Status fiscal: <b>{String(selected.fiscalStatus).toUpperCase()}</b>{selected.fiscalAccessKey?' · chave '+selected.fiscalAccessKey:''}</p>}
                  <button disabled={busy!==''} onClick={()=>void act('invoice',()=>salesOrderService.invoice(selected,invoiceNumber,currentUser),'Venda faturada. Contas a receber geradas.')} className="mt-3 h-11 w-full rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-50">{busy==='invoice'?'FATURANDO...':'FATURAR E GERAR RECEBÍVEIS'}</button>
                </ActionBox>}

                {selected.status==='invoiced'&&<ActionBox title="Checklist e entrega" icon={<CarFront size={17}/>}>
                  <p className="text-xs text-slate-600">A entrega só é liberada depois que os quatro pontos essenciais forem confirmados.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {([
                      ['financialReleased','Financeiro liberado'],
                      ['documentsReady','Documentos prontos'],
                      ['vehicleReady','Veículo conferido'],
                      ['customerConfirmed','Cliente confirmou a entrega'],
                    ] as Array<[keyof SalesOrder['deliveryChecklist'],string]>).map(([key,label])=><label key={key} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-700"><input type="checkbox" disabled={busy==='checklist'} checked={Boolean(selected.deliveryChecklist?.[key])} onChange={e=>void updateChecklist(key,e.target.checked)}/>{label}</label>)}
                  </div>
                  <button disabled={busy!==''||!Object.values({financialReleased:false,documentsReady:false,vehicleReady:false,customerConfirmed:false,...(selected.deliveryChecklist||{})}).every(Boolean)} onClick={()=>void act('deliver',()=>salesOrderService.deliver(selected,currentUser),'Veículo entregue e retirado do estoque atual.')} className="mt-3 h-11 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50">{busy==='deliver'?'ENTREGANDO...':'CONFIRMAR ENTREGA'}</button>
                </ActionBox>}

                {selected.receivableIds?.length?<div className="mt-4 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-800"><BadgeDollarSign size={17} className="shrink-0"/><div><b>Financeiro integrado</b><p className="mt-1">{selected.receivableIds.length} conta(s) a receber vinculada(s) a esta venda.</p></div></div>:null}
                {Number(selected.commissionAmount)>0&&<div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800"><BadgeDollarSign size={17} className="shrink-0"/><div><b>Comissão integrada</b><p className="mt-1">{selected.sellerName||'Vendedor'} · {money(Number(selected.commissionAmount)||0)} em Contas a Pagar.</p></div></div>}

                {selected.status==='delivered'&&<div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={18} className="shrink-0"/><div><b>Venda concluída.</b><p className="mt-1">Entrega registrada e veículo fora do estoque atual.</p></div></div>}
                {selected.status==='cancelled'&&<div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800"><b>Venda cancelada.</b><p className="mt-1">{selected.cancellationReason||'Sem motivo informado.'}</p>{selected.cancelledAt&&<p className="mt-1 text-red-600">Em {new Date(selected.cancelledAt).toLocaleString('pt-BR')} · {selected.cancelledByName||selected.cancelledBy||'—'}{selected.reversedFinanceIds?.length?` · ${selected.reversedFinanceIds.length} baixa(s) financeira(s) revertida(s)`:''}</p>}</div>}

                {!['delivered','cancelled'].includes(selected.status)&&<button disabled={busy!==''} onClick={()=>{const reason=window.prompt('Motivo do cancelamento da venda:','')?.trim()||'';if(!reason)return;void act('cancel',()=>salesOrderService.cancel(selected,currentUser,reason),'Pedido cancelado, financeiro revertido e estoque liberado.');}} className="mt-5 h-10 w-full rounded-xl border border-red-200 text-xs font-bold text-red-600 disabled:opacity-50">CANCELAR PEDIDO E LIBERAR ESTOQUE</button>}
              </div>}
            </div>
          </section>
        </div>
      </div>
    </div>}
    {selected&&<FiscalInvoicePanel open={fiscalOpen} onClose={()=>setFiscalOpen(false)} currentUser={currentUser} order={selected}/>}
  </>;
};

const Metric=({label,value,note}:{label:string;value:number;note:string})=><div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>;
const Info=({label,value}:{label:string;value:string})=><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-700">{value}</p></div>;
const ActionBox=({title,icon,children}:{title:string;icon:React.ReactNode;children:React.ReactNode})=><div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4"><div className="flex items-center gap-2 text-slate-800">{icon}<p className="text-xs font-bold uppercase tracking-[.1em]">{title}</p></div><div className="mt-3">{children}</div></div>;

export default SalesOrderPanel;
