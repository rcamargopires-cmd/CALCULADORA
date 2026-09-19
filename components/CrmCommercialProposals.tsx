import React, {useMemo,useState} from 'react';
import {CarFront, ClipboardList, Plus, Save, Send, X} from 'lucide-react';
import type {CrmProposalSnapshot, CrmProposalStatus, ShowroomPassage, User} from '../types';
import type {GroupStockItem} from '../services/groupStockService';
import {isGroupStockAvailable} from '../services/crmStockMatchService';
import {crmProposalService, proposalMoney, proposalTotals, type ProposalInput} from '../services/crmProposalService';

type Props={lead:ShowroomPassage;user:User;stockItems?:GroupStockItem[]};
const fmt=(value:string)=>String(value||'').replace(/[^a-zA-Z0-9]/g,'').toUpperCase().slice(0,7);
const number=(raw:string)=>Number(raw||0);
const displayDate=(iso:string)=>new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
const statusLabel:Record<CrmProposalStatus,string>={draft:'Rascunho',sent:'Enviada',accepted:'Aceita',rejected:'Recusada'};
const blank=(lead:ShowroomPassage):ProposalInput=>({
  vehicle:lead.desiredVehicle||lead.interestModel||'',plate:'',year:'',km:0,location:'',
  stockPriceAtCreation:0,salePrice:0,discount:0,
  tradeInPlate:lead.tradeInPlate||'',tradeInValue:0,tradeInDebt:0,
  cashEntry:lead.desiredEntry||0,installments:0,estimatedInstallment:0,notes:'',
});
const fieldClass='h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-400';
const Field=({label,value,onChange,placeholder,type='text'}:{label:string;value:string;onChange:(value:string)=>void;placeholder?:string;type?:string})=><label className="block min-w-0"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span><input type={type} min={type==='number'?'0':undefined} step={type==='number'?'0.01':undefined} value={value} onChange={event=>onChange(event.target.value)} placeholder={placeholder} className={fieldClass}/></label>;

const CrmCommercialProposals:React.FC<Props>=({lead,user,stockItems=[]})=>{
  const [editing,setEditing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [feedback,setFeedback]=useState('');
  const [proposalId,setProposalId]=useState('');
  const [expectedVersion,setExpectedVersion]=useState<number|undefined>(undefined);
  const [form,setForm]=useState<ProposalInput>(()=>blank(lead));
  const [showHistory,setShowHistory]=useState(false);
  const [stockFilter,setStockFilter]=useState('');
  const history=Array.isArray(lead.crmProposals)?lead.crmProposals:[];
  const latestById=useMemo(()=>{
    const map=new Map<string,CrmProposalSnapshot>();
    history.forEach(item=>{
      const current=map.get(item.id);
      if(!current||current.version<item.version)map.set(item.id,item);
    });
    return [...map.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  },[history]);
  const stock=useMemo(()=>stockItems.filter(isGroupStockAvailable).filter(item=>{
    const q=stockFilter.trim().toLocaleLowerCase('pt-BR');
    return !q||[item.model,item.plate,item.brand].some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(q));
  }).slice(0,100),[stockItems,stockFilter]);
  const totals=proposalTotals(form);

  const change=(key:keyof ProposalInput,value:string)=>{
    setForm(previous=>({...previous,[key]:[
      'km','stockPriceAtCreation','salePrice','discount','tradeInValue','tradeInDebt','cashEntry','installments','estimatedInstallment'
    ].includes(key)?number(value):value}));
  };
  const start=()=>{
    setForm(blank(lead));setProposalId('');setExpectedVersion(undefined);
    setStockFilter('');setError('');setFeedback('');setEditing(true);
  };
  const revise=(row:CrmProposalSnapshot)=>{
    setForm({
      vehicle:row.vehicle,plate:row.plate,year:row.year,km:row.km,location:row.location,
      stockPriceAtCreation:row.stockPriceAtCreation,salePrice:row.salePrice,discount:row.discount,
      tradeInPlate:row.tradeInPlate,tradeInValue:row.tradeInValue,tradeInDebt:row.tradeInDebt,
      cashEntry:row.cashEntry,installments:row.installments,estimatedInstallment:row.estimatedInstallment,
      notes:row.notes,
    });
    setProposalId(row.id);setExpectedVersion(row.version);setEditing(true);setError('');setFeedback('');
  };
  const pick=(plate:string)=>{
    const vehicle=stock.find(item=>item.plate===plate);
    if(!vehicle)return;
    setForm(previous=>({
      ...previous,vehicle:vehicle.model,plate:vehicle.plate,
      year:vehicle.year,km:vehicle.km,location:vehicle.location||vehicle.stockOwner,
      stockPriceAtCreation:vehicle.suggestedPrice,
      salePrice:vehicle.suggestedPrice||previous.salePrice,
    }));
  };
  const save=async()=>{
    setBusy(true);setError('');setFeedback('');
    try{
      await crmProposalService.save({
        leadId:lead.id,proposalId:proposalId||undefined,expectedVersion,
        proposal:form,actor:{email:user.email,name:user.name},
      });
      setEditing(false);setFeedback('Proposta salva na ficha. Nenhuma mensagem foi enviada ao cliente.');
    }catch(error:any){setError(error?.message||'Não foi possível salvar.');}
    finally{setBusy(false);}
  };
  const updateStatus=async(row:CrmProposalSnapshot,status:'sent'|'accepted'|'rejected')=>{
    setBusy(true);setError('');setFeedback('');
    try{
      await crmProposalService.setStatus({
        leadId:lead.id,proposalId:row.id,expectedVersion:row.version,status,
        actor:{email:user.email,name:user.name},
      });
      setFeedback(status==='sent'?'Envio registrado manualmente na ficha. O MOTYQ não enviou uma mensagem.':status==='accepted'?'Aceite registrado. A venda não foi concluída automaticamente.':'Recusa registrada na ficha.');
    }catch(error:any){setError(error?.message||'Não foi possível atualizar a proposta.');}
    finally{setBusy(false);}
  };
  return <section className="rounded-[26px] border border-emerald-200 bg-white p-5 shadow-sm md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-[.13em] text-emerald-700">NEGOCIAÇÃO · MOTYQ CRM</p><h3 className="mt-1 flex items-center gap-2 font-semibold text-slate-900"><ClipboardList size={19}/> Propostas comerciais</h3><p className="mt-1 text-xs text-slate-500">Salve valores, veículo, troca, entrada e condições. Cada revisão preserva a versão anterior.</p></div>
      <button type="button" onClick={start} disabled={busy} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Plus size={15}/> NOVA PROPOSTA</button>
    </div>
    {error&&<p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {feedback&&<p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{feedback}</p>}
    {editing&&<div className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-2"><p className="font-semibold text-slate-800">{proposalId?'Nova versão da proposta':'Montar proposta'}</p><button type="button" onClick={()=>setEditing(false)} disabled={busy} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500"><X size={15}/></button></div>
      {!!stockItems.length&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <p className="mb-2 text-xs font-bold text-emerald-800">Escolher veículo do estoque compartilhado</p>
        <input value={stockFilter} onChange={e=>setStockFilter(e.target.value)} placeholder="Buscar por modelo ou placa" className={fieldClass}/>
        <select value="" onChange={e=>pick(e.target.value)} className={fieldClass+' mt-2'}>
          <option value="">Selecione um veículo disponível...</option>
          {stock.map(item=><option key={item.plate} value={item.plate}>{item.model} · {item.year} · {item.plate} · {proposalMoney(item.suggestedPrice||0)} · {item.location||item.stockOwner}</option>)}
        </select>
        <p className="mt-1 text-[10px] text-emerald-700">Preço e disponibilidade são uma fotografia da seleção. Confirme com a loja antes de enviar.</p>
      </div>}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Veículo *" value={form.vehicle} onChange={v=>change('vehicle',v)} placeholder="Modelo e versão"/>
        <Field label="Placa" value={form.plate} onChange={v=>change('plate',fmt(v))}/>
        <Field label="Ano / modelo" value={form.year} onChange={v=>change('year',v)}/>
        <Field label="KM" type="number" value={String(form.km)} onChange={v=>change('km',v)}/>
        <Field label="Loja / localização" value={form.location} onChange={v=>change('location',v)}/>
        <Field label="Preço de venda (R$) *" type="number" value={String(form.salePrice)} onChange={v=>change('salePrice',v)}/>
        <Field label="Desconto (R$)" type="number" value={String(form.discount)} onChange={v=>change('discount',v)}/>
        <Field label="Placa da troca" value={form.tradeInPlate} onChange={v=>change('tradeInPlate',fmt(v))}/>
        <Field label="Avaliação da troca (R$)" type="number" value={String(form.tradeInValue)} onChange={v=>change('tradeInValue',v)}/>
        <Field label="Saldo devedor da troca (R$)" type="number" value={String(form.tradeInDebt)} onChange={v=>change('tradeInDebt',v)}/>
        <Field label="Entrada em dinheiro (R$)" type="number" value={String(form.cashEntry)} onChange={v=>change('cashEntry',v)}/>
        <Field label="Prazo em meses (opcional)" type="number" value={String(form.installments)} onChange={v=>change('installments',v)}/>
        <Field label="Parcela estimada informada (R$)" type="number" value={String(form.estimatedInstallment)} onChange={v=>change('estimatedInstallment',v)}/>
        <label className="md:col-span-2"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Condições e observações</span><textarea rows={3} value={form.notes} onChange={e=>change('notes',e.target.value)} placeholder="Banco, prazo, validade, condições de avaliação, pendências..." className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-800"/></label>
      </div>
      <div className="grid gap-2 rounded-xl border border-emerald-200 bg-white p-3 sm:grid-cols-3">
        <div><p className="text-[10px] uppercase text-slate-500">Troca líquida</p><p className="font-semibold text-slate-800">{proposalMoney(totals.netTrade)}</p></div>
        <div><p className="text-[10px] uppercase text-slate-500">Venda após desconto</p><p className="font-semibold text-slate-800">{proposalMoney(Math.max(0,form.salePrice-form.discount))}</p></div>
        <div><p className="text-[10px] uppercase text-slate-500">Saldo a financiar / quitar</p><p className="font-bold text-emerald-800">{proposalMoney(totals.financedAmount)}</p></div>
      </div>
      <p className="text-[11px] leading-5 text-slate-500">O saldo considera eventual diferença negativa na troca. A parcela é registrada conforme simulação externa informada pelo vendedor. Não é calculada nem aprovada pelo MOTYQ. Valores sujeitos à avaliação final, taxas, CET, disponibilidade e aprovação de crédito.</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={()=>setEditing(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600">CANCELAR</button>
        <button type="button" disabled={busy} onClick={save} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Save size={15}/>{busy?'SALVANDO...':'SALVAR PROPOSTA'}</button>
      </div>
    </div>}
    <div className="mt-4 space-y-3">
      {!latestById.length&&<p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Nenhuma proposta registrada para este atendimento.</p>}
      {latestById.map(row=><article key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><p className="font-semibold text-slate-900">{row.vehicle}</p><p className="mt-1 text-xs text-slate-500">{row.plate||'Sem placa'} · {row.year||'Ano n/i'} · v{row.version} · {displayDate(row.updatedAt)}</p></div>
          <span className={'rounded-full px-3 py-1 text-xs font-bold '+(row.status==='accepted'?'bg-emerald-100 text-emerald-800':row.status==='rejected'?'bg-rose-100 text-rose-800':row.status==='sent'?'bg-sky-100 text-sky-800':'bg-amber-100 text-amber-800')}>{statusLabel[row.status]}</span>
        </div>
        <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
          <span>Venda: <strong>{proposalMoney(row.salePrice-row.discount)}</strong></span>
          <span>Troca líquida: <strong>{proposalMoney(row.tradeInValue-row.tradeInDebt)}</strong></span>
          <span>Saldo: <strong>{proposalMoney(row.financedAmount)}</strong></span>
          {!!row.installments&&<span>Prazo: {row.installments} meses</span>}
          {!!row.estimatedInstallment&&<span>Parcela informada: {proposalMoney(row.estimatedInstallment)}</span>}
        </div>
        {row.notes&&<p className="mt-2 whitespace-pre-wrap rounded-xl bg-white p-2 text-xs text-slate-600">{row.notes}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {row.status!=='accepted'&&<button disabled={busy} onClick={()=>revise(row)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">NOVA VERSÃO</button>}
          {row.status==='draft'&&<button disabled={busy} onClick={()=>updateStatus(row,'sent')} className="flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 disabled:opacity-50"><Send size={13}/> REGISTRAR ENVIO</button>}
          {row.status==='sent'&&<><button disabled={busy} onClick={()=>updateStatus(row,'accepted')} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-50">REGISTRAR ACEITE</button><button disabled={busy} onClick={()=>updateStatus(row,'rejected')} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">REGISTRAR RECUSA</button></>}
        </div>
      </article>)}
      {!!history.length&&<div>
        <button type="button" onClick={()=>setShowHistory(value=>!value)} className="text-xs font-bold text-emerald-700">{showHistory?'OCULTAR':'VER'} HISTÓRICO DE VERSÕES ({history.length})</button>
        {showHistory&&<div className="mt-3 space-y-2">{[...history].reverse().map(row=><div key={row.id+'_'+row.version} className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600"><strong>{row.vehicle} · v{row.version} · {statusLabel[row.status]}</strong><p className="mt-1">{displayDate(row.updatedAt)} · {row.updatedByName||row.updatedByEmail||'Usuário'} · {proposalMoney(row.salePrice-row.discount)} · saldo {proposalMoney(row.financedAmount)}</p></div>)}</div>}
      </div>}
    </div>
  </section>;
};
export default CrmCommercialProposals;
