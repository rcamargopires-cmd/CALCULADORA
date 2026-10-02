import React, { useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, CarFront, CheckCircle2, ClipboardCheck, FileText, Plus, Search, ShieldCheck, X } from 'lucide-react';
import type { User, VehiclePurchase, VehiclePurchaseDocuments, VehiclePurchaseOrigin } from '../types';
import type { EvaluationQueueRequest } from '../services/evaluationQueueService';
import { vehiclePurchaseService } from '../services/vehiclePurchaseService';

type Props={currentUser:User;companyId:string;storeId:string;storeName:string};

const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const cleanPlate=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const statusLabel=(value:string)=>value==='draft'?'Em negociação':value==='approved'?'Aprovada':value==='payment_pending'?'Pagamento pendente':value==='documents'?'Documentos':value==='entered'?'No estoque':'Cancelada';
const originLabel=(value:VehiclePurchaseOrigin)=>value==='trade_in'?'Troca':value==='repasse'?'Repasse':value==='consignment'?'Consignação':'Compra';
const dateLabel=(value:any)=>{
  try{
    if(value?.toDate)return value.toDate().toLocaleDateString('pt-BR');
    if(value?.seconds)return new Date(Number(value.seconds)*1000).toLocaleDateString('pt-BR');
    if(!value)return'—';
    return new Date(value).toLocaleDateString('pt-BR');
  }catch{return'—';}
};
const DOC_LABELS:Array<[keyof VehiclePurchaseDocuments,string]>=[
  ['ownerDocument','Documento do proprietário'],
  ['atpv','ATPV-e / intenção de venda'],
  ['crlv','CRLV / documento do veículo'],
  ['debtsChecked','Débitos e multas conferidos'],
  ['lienChecked','Gravame / financiamento conferido'],
  ['spareKey','Chave reserva'],
  ['manual','Manual'],
];

const VehiclePurchasePanel:React.FC<Props>=({currentUser,companyId,storeId,storeName})=>{
  const[open,setOpen]=useState(false);
  const[items,setItems]=useState<VehiclePurchase[]>([]);
  const[evaluations,setEvaluations]=useState<EvaluationQueueRequest[]>([]);
  const[selectedId,setSelectedId]=useState('');
  const[search,setSearch]=useState('');
  const[busy,setBusy]=useState('');
  const[message,setMessage]=useState('');
  const[error,setError]=useState('');

  const refreshEvaluations=async()=>{
    try{setEvaluations(await vehiclePurchaseService.listCompletedEvaluations(companyId,storeId));}
    catch(cause){console.warn('Motyq: avaliações concluídas indisponíveis.',cause);}
  };

  useEffect(()=>{
    if(!open)return;
    void refreshEvaluations();
    return vehiclePurchaseService.subscribe(companyId,storeId,setItems,cause=>setError(String((cause as any)?.message||'Não foi possível carregar compras.')));
  },[open,companyId,storeId]);

  const selected=items.find(item=>item.id===selectedId)||null;
  const linkedEvaluations=new Set(items.filter(item=>item.status!=='cancelled').map(item=>item.evaluationRequestId).filter(Boolean));
  const availableEvaluations=evaluations.filter(item=>!linkedEvaluations.has(item.id));
  const q=search.trim().toLowerCase();
  const filtered=useMemo(()=>items.filter(item=>{
    if(!q)return true;
    const plate=cleanPlate(search);
    return (plate&&cleanPlate(item.plate).includes(plate)) ||
      [item.vehicle,item.ownerName,item.status,item.origin].some(value=>String(value||'').toLowerCase().includes(q));
  }),[items,q,search]);

  const draft=items.filter(item=>item.status==='draft').length;
  const approved=items.filter(item=>['approved','payment_pending','documents'].includes(item.status)).length;
  const entered=items.filter(item=>item.status==='entered').length;
  const committed=items.filter(item=>!['cancelled'].includes(item.status)).reduce((sum,item)=>sum+Number(item.totalAcquisitionCost||0),0);

  const patchSelected=(patch:Partial<VehiclePurchase>)=>{
    if(!selected)return;
    setItems(prev=>prev.map(item=>item.id===selected.id?{...item,...patch}:item));
  };

  const startFromEvaluation=async(request:EvaluationQueueRequest)=>{
    setBusy('evaluation:'+request.id);setError('');setMessage('');
    try{
      const created=await vehiclePurchaseService.createFromEvaluation(request,currentUser);
      setSelectedId(created.id);
      setItems(prev=>[created,...prev.filter(item=>item.id!==created.id)]);
      setMessage(`Compra iniciada para ${created.plate}. Complete proprietário e condições.`);
    }catch(cause:any){setError(cause?.message||'Não foi possível iniciar a compra.');}
    finally{setBusy('');}
  };

  const save=async()=>{
    if(!selected)return;
    setBusy('save');setError('');setMessage('');
    try{
      const saved=await vehiclePurchaseService.save(selected);
      setItems(prev=>prev.map(item=>item.id===saved.id?saved:item));
      setMessage('Processo de compra atualizado.');
    }catch(cause:any){setError(cause?.message||'Não foi possível salvar.');}
    finally{setBusy('');}
  };

  const approve=async()=>{
    if(!selected)return;
    setBusy('approve');setError('');setMessage('');
    try{
      const saved=await vehiclePurchaseService.approve(selected,currentUser);
      setItems(prev=>prev.map(item=>item.id===saved.id?saved:item));
      setMessage('Compra aprovada. As obrigações financeiras foram geradas no Financeiro.');
    }catch(cause:any){setError(cause?.message||'Não foi possível aprovar a compra.');}
    finally{setBusy('');}
  };

  const enterStock=async()=>{
    if(!selected)return;
    if(!window.confirm(`Confirmar entrada do ${selected.plate} no estoque e enviar para o PrepTrack?`))return;
    setBusy('stock');setError('');setMessage('');
    try{
      const saved=await vehiclePurchaseService.enterStock(selected,currentUser);
      setItems(prev=>prev.map(item=>item.id===saved.id?saved:item));
      setMessage('Veículo incluído no estoque e ordem criada no PrepTrack.');
    }catch(cause:any){setError(cause?.message||'Não foi possível dar entrada no estoque.');}
    finally{setBusy('');}
  };

  const cancel=async()=>{
    if(!selected||!window.confirm('Cancelar este processo de compra?'))return;
    setBusy('cancel');setError('');setMessage('');
    try{
      const saved=await vehiclePurchaseService.cancel(selected,currentUser);
      setItems(prev=>prev.map(item=>item.id===saved.id?saved:item));
      setMessage('Processo de compra cancelado.');
    }catch(cause:any){setError(cause?.message||'Não foi possível cancelar.');}
    finally{setBusy('');}
  };

  return <>
    <button title="Compras de veículos" onClick={()=>setOpen(true)} className="hidden" type="button">Compras de veículos</button>

    {open&&<div className="fixed inset-0 z-[283] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm md:p-6" onClick={()=>setOpen(false)}>
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[30px] border border-slate-200 bg-white text-slate-900 shadow-2xl" onClick={event=>event.stopPropagation()}>
        <header className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between md:p-7">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><CarFront size={22}/></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-700">DMS · COMPRA E ENTRADA</p>
              <h2 className="mt-1 text-2xl font-semibold">Da avaliação ao estoque, sem redigitar o carro.</h2>
              <p className="mt-1 text-sm text-slate-500">{storeName}. Proprietário, valor, quitação, débitos, documentos, financeiro e entrada.</p>
            </div>
          </div>
          <button onClick={()=>setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-500"><X size={18}/></button>
        </header>

        <div className="p-5 md:p-7">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Em negociação" value={String(draft)} note="aguardando aprovação"/>
            <Metric label="Aprovadas" value={String(approved)} note="financeiro/documentos"/>
            <Metric label="Entraram no estoque" value={String(entered)} note="histórico preservado"/>
            <Metric label="Custo de aquisição" value={money(committed)} note="processos não cancelados"/>
          </section>

          {(message||error)&&<div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${error?'border-red-200 bg-red-50 text-red-700':'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error||message}</div>}

          {availableEvaluations.length>0&&<section className="mt-5 rounded-[24px] border border-blue-200 bg-blue-50/50 p-4">
            <div className="flex items-center gap-2"><ClipboardCheck size={17} className="text-blue-700"/><div><p className="text-xs font-bold text-blue-900">Avaliações concluídas prontas para compra</p><p className="text-[11px] text-blue-700/70">O Motyq reaproveita placa, veículo, KM e valor recomendado.</p></div></div>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {availableEvaluations.slice(0,8).map(item=><button key={item.id} disabled={busy==='evaluation:'+item.id} onClick={()=>void startFromEvaluation(item)} className="flex items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-white p-3 text-left hover:border-blue-300 disabled:opacity-50">
                <div><p className="font-mono text-sm font-bold text-slate-900">{item.plate}</p><p className="mt-1 text-xs text-slate-600">{item.vehicle||'Veículo'}{item.year?` · ${item.year}`:''}</p><p className="mt-1 text-[10px] text-slate-400">Avaliado em {dateLabel(item.completedAt||item.updatedAt)}</p></div>
                <div className="text-right"><p className="text-[10px] text-slate-500">Compra recomendada</p><p className="font-semibold text-emerald-700">{money(Number(item.recommendedBuy)||0)}</p><span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-blue-700"><Plus size={11}/> INICIAR COMPRA</span></div>
              </button>)}
            </div>
          </section>}

          <section className="mt-5 grid gap-4 lg:grid-cols-[.82fr_1.18fr]">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Search size={14} className="text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Placa, veículo ou proprietário" className="h-10 w-full bg-transparent text-sm outline-none"/></div>
              <div className="mt-3 max-h-[620px] space-y-2 overflow-y-auto pr-1">
                {filtered.map(item=><button key={item.id} onClick={()=>{setSelectedId(item.id);setError('');setMessage('');}} className={`w-full rounded-2xl border p-4 text-left ${selectedId===item.id?'border-emerald-300 bg-emerald-50':'border-slate-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-bold">{item.plate}</span><Status value={item.status}/></div><p className="mt-1 text-sm font-semibold text-slate-700">{item.vehicle}</p><p className="mt-1 text-xs text-slate-500">{originLabel(item.origin)} · {item.ownerName||'Proprietário não informado'}</p></div><strong className="shrink-0 text-sm">{money(item.totalAcquisitionCost)}</strong></div>
                </button>)}
                {!filtered.length&&<div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Nenhum processo de compra encontrado.</div>}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              {!selected?<div className="grid min-h-[420px] place-items-center text-center"><div><CarFront size={34} className="mx-auto text-slate-300"/><p className="mt-3 font-semibold">Selecione uma compra</p><p className="mt-1 text-sm text-slate-500">Ou inicie uma a partir de uma avaliação concluída.</p></div></div>:<PurchaseDetail purchase={selected} patch={patchSelected} busy={busy} onSave={save} onApprove={approve} onEnterStock={enterStock} onCancel={cancel}/>}
            </div>
          </section>
        </div>
      </div>
    </div>}
  </>;
};

const PurchaseDetail=({purchase,patch,busy,onSave,onApprove,onEnterStock,onCancel}:{purchase:VehiclePurchase;patch:(patch:Partial<VehiclePurchase>)=>void;busy:string;onSave:()=>void;onApprove:()=>void;onEnterStock:()=>void;onCancel:()=>void})=>{
  const financialLocked=purchase.status!=='draft';
  const closed=['entered','cancelled'].includes(purchase.status);
  const docsDone=Object.values(purchase.documents||{}).filter(Boolean).length;
  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
      <div><div className="flex items-center gap-2"><p className="font-mono text-lg font-bold">{purchase.plate}</p><Status value={purchase.status}/></div><h3 className="mt-1 text-xl font-semibold">{purchase.vehicle}</h3><p className="mt-1 text-xs text-slate-500">vehicleId: {purchase.vehicleId||'será criado ao aprovar'} · {originLabel(purchase.origin)}</p></div>
      <div className="text-right"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Custo de aquisição</p><p className="mt-1 text-2xl font-semibold">{money(purchase.totalAcquisitionCost)}</p></div>
    </div>

    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <Field label="Proprietário / vendedor" value={purchase.ownerName} disabled={financialLocked} onChange={value=>patch({ownerName:value})}/>
      <Field label="CPF / CNPJ" value={purchase.ownerDocument||''} disabled={financialLocked} onChange={value=>patch({ownerDocument:value.replace(/\D/g,'').slice(0,14)})}/>
      <Field label="Telefone" value={purchase.ownerPhone||''} disabled={financialLocked} onChange={value=>patch({ownerPhone:value})}/>
      <Field label="Chave Pix" value={purchase.ownerPix||''} disabled={financialLocked} onChange={value=>patch({ownerPix:value})}/>
      <label className="text-xs font-semibold text-slate-500">Origem<select disabled={financialLocked} value={purchase.origin} onChange={e=>patch({origin:e.target.value as VehiclePurchaseOrigin})} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50"><option value="purchase">Compra</option><option value="trade_in">Troca</option><option value="repasse">Repasse</option><option value="consignment">Consignação</option></select></label>
      <label className="text-xs font-semibold text-slate-500">Vencimento do pagamento<input disabled={financialLocked} type="date" value={purchase.paymentDueDate||''} onChange={e=>patch({paymentDueDate:e.target.value})} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50"/></label>
      <MoneyField label="Valor de compra" value={purchase.purchasePrice} disabled={financialLocked} onChange={value=>patch({purchasePrice:value,totalAcquisitionCost:value+purchase.debtsAmount+purchase.acquisitionCosts})}/>
      <MoneyField label="Quitação financeira" value={purchase.payoffAmount} disabled={financialLocked} onChange={value=>patch({payoffAmount:value})}/>
      <MoneyField label="Débitos / multas" value={purchase.debtsAmount} disabled={financialLocked} onChange={value=>patch({debtsAmount:value,totalAcquisitionCost:purchase.purchasePrice+value+purchase.acquisitionCosts})}/>
      <MoneyField label="Outros custos de aquisição" value={purchase.acquisitionCosts} disabled={financialLocked} onChange={value=>patch({acquisitionCosts:value,totalAcquisitionCost:purchase.purchasePrice+purchase.debtsAmount+value})}/>
    </div>

    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-slate-800">Checklist documental</p><p className="mt-1 text-[11px] text-slate-500">Pode continuar sendo atualizado depois da aprovação da compra.</p></div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-600">{docsDone}/{DOC_LABELS.length}</span></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {DOC_LABELS.map(([key,label])=><label key={key} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-700"><input disabled={closed} type="checkbox" checked={Boolean(purchase.documents?.[key])} onChange={e=>patch({documents:{...purchase.documents,[key]:e.target.checked}})}/>{label}</label>)}
      </div>
    </div>

    <label className="mt-4 block text-xs font-semibold text-slate-500">Observações<textarea disabled={closed} value={purchase.notes||''} onChange={e=>patch({notes:e.target.value})} rows={3} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none disabled:bg-slate-50"/></label>

    {!closed&&<div className="mt-5 grid gap-2 sm:grid-cols-2">
      <button disabled={busy!==''} onClick={onSave} className="h-11 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 disabled:opacity-50">SALVAR</button>
      {purchase.status==='draft'?<button disabled={busy!==''} onClick={onApprove} className="h-11 rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50">{busy==='approve'?'APROVANDO...':'APROVAR COMPRA'}</button>:<button disabled={busy!==''} onClick={onEnterStock} className="h-11 rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-50">{busy==='stock'?'DANDO ENTRADA...':'ENTRAR NO ESTOQUE + PREPTRACK'}</button>}
      <button disabled={busy!==''} onClick={onCancel} className="sm:col-span-2 h-10 rounded-xl border border-red-200 text-xs font-bold text-red-600 disabled:opacity-50">CANCELAR PROCESSO</button>
    </div>}

    {purchase.status==='entered'&&<div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={18} className="mt-0.5 shrink-0"/><div><b>Entrada concluída.</b><p className="mt-1">O veículo está no estoque atual e foi enviado ao PrepTrack.</p></div></div>}
    {purchase.payableIds?.length? <div className="mt-4 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-800"><BadgeDollarSign size={17} className="shrink-0"/><div><b>Financeiro integrado</b><p className="mt-1">{purchase.payableIds.length} obrigação(ões) financeira(s) gerada(s) a partir desta compra.</p></div></div>:null}
  </div>;
};

const Field=({label,value,onChange,disabled=false}:{label:string;value:string;onChange:(value:string)=>void;disabled?:boolean})=><label className="text-xs font-semibold text-slate-500">{label}<input disabled={disabled} value={value} onChange={e=>onChange(e.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none disabled:bg-slate-50"/></label>;
const MoneyField=({label,value,onChange,disabled=false}:{label:string;value:number;onChange:(value:number)=>void;disabled?:boolean})=><label className="text-xs font-semibold text-slate-500">{label}<input disabled={disabled} type="number" value={value||''} onChange={e=>onChange(Number(e.target.value)||0)} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none disabled:bg-slate-50"/></label>;
const Metric=({label,value,note}:{label:string;value:string;note:string})=><div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>;
const Status=({value}:{value:string})=>{const cls=value==='entered'?'bg-emerald-100 text-emerald-700':value==='cancelled'?'bg-slate-100 text-slate-500':value==='draft'?'bg-amber-100 text-amber-700':'bg-blue-100 text-blue-700';return <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${cls}`}>{statusLabel(value).toUpperCase()}</span>;};

export default VehiclePurchasePanel;
