import React,{useEffect,useMemo,useState} from 'react';
import { CheckCircle2, FileJson2, FileText, RefreshCw, ShieldAlert, X } from 'lucide-react';
import type { FiscalInvoiceRecord, SalesOrder, User } from '../types';
import { fiscalIntegrationService } from '../services/fiscalIntegrationService';

type Props={
  open:boolean;
  onClose:()=>void;
  currentUser:User;
  order:SalesOrder;
};

const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const statusLabel=(value?:string)=>value==='authorized'?'AUTORIZADA':value==='pending'?'PROCESSANDO':value==='rejected'?'REJEITADA':value==='cancelled'?'CANCELADA':value==='error'?'ERRO':'RASCUNHO';
const statusClass=(value?:string)=>value==='authorized'?'bg-emerald-50 text-emerald-700 border-emerald-200':value==='pending'?'bg-amber-50 text-amber-700 border-amber-200':value==='rejected'||value==='error'?'bg-red-50 text-red-700 border-red-200':value==='cancelled'?'bg-slate-100 text-slate-600 border-slate-200':'bg-blue-50 text-blue-700 border-blue-200';

const defaultPayload=(order:SalesOrder)=>({
  natureza_operacao:'Venda de veículo',
  data_emissao:new Date().toISOString(),
  tipo_documento:1,
  local_destino:1,
  finalidade_emissao:1,
  consumidor_final:1,
  presenca_comprador:1,
  nome_destinatario:order.customerName,
  telefone_destinatario:order.customerPhone||'',
  valor_frete:0,
  valor_seguro:0,
  valor_desconto:Number(order.discount)||0,
  valor_outras_despesas:0,
  valor_total:Number(order.netSalePrice)||0,
  valor_produtos:Number(order.netSalePrice)||0,
  modalidade_frete:9,
  items:[
    {
      numero_item:'1',
      descricao:order.vehicle,
      quantidade_comercial:1,
      quantidade_tributavel:1,
      valor_unitario_comercial:Number(order.netSalePrice)||0,
      valor_unitario_tributavel:Number(order.netSalePrice)||0,
      unidade_comercial:'UN',
      unidade_tributavel:'UN',
      observacao:'Complete NCM, CFOP e tributação conforme orientação contábil antes de emitir.',
    },
  ],
});

const FiscalInvoicePanel:React.FC<Props>=({open,onClose,currentUser,order})=>{
  const[configured,setConfigured]=useState<boolean|null>(null);
  const[record,setRecord]=useState<FiscalInvoiceRecord|null>(null);
  const[payload,setPayload]=useState(()=>JSON.stringify(defaultPayload(order),null,2));
  const[busy,setBusy]=useState('');
  const[error,setError]=useState('');
  const[message,setMessage]=useState('');

  useEffect(()=>{
    setPayload(JSON.stringify(defaultPayload(order),null,2));
    setRecord(null);setError('');setMessage('');
  },[order.salesOrderId]);

  const fiscal=currentUser.companyFiscal;
  const environment=fiscal?.environment||'homologacao';
  const provider=fiscal?.provider||'manual';

  useEffect(()=>{
    if(!open)return;
    let active=true;
    void fiscalIntegrationService.status(order.companyId,environment).then(async status=>{
      if(!active)return;
      setConfigured(Boolean(status?.configured));
      if(order.fiscalInvoiceId){
        try{
          const refreshed=await fiscalIntegrationService.query(order,environment);
          if(active)setRecord(refreshed);
        }catch{}
      }
    }).catch(()=>{if(active)setConfigured(false);});
    return()=>{active=false;};
  },[open,order.companyId,order.salesOrderId,order.fiscalInvoiceId,environment]);
  const canIssue=provider==='focus_nfe'&&fiscal?.enabled&&configured===true&&['ready_to_invoice','invoiced'].includes(order.status);
  const effectiveStatus=record?.status||order.fiscalStatus;

  const parsedPayload=useMemo(()=>{
    try{return JSON.parse(payload) as Record<string,unknown>;}catch{return null;}
  },[payload]);

  const issue=async()=>{
    if(!parsedPayload)return setError('O JSON fiscal está inválido.');
    if(!window.confirm(`Emitir NF-e em ${environment==='producao'?'PRODUÇÃO':'HOMOLOGAÇÃO'} para ${money(order.netSalePrice)}?`))return;
    setBusy('issue');setError('');setMessage('');
    try{
      const next=await fiscalIntegrationService.issue(order,environment,parsedPayload);
      setRecord(next);
      setMessage(next.status==='authorized'?'NF-e autorizada.':'Solicitação enviada. Atualize o status até a autorização.');
    }catch(cause:any){setError(cause?.message||'Não foi possível emitir a NF-e.');}
    finally{setBusy('');}
  };

  const refresh=async()=>{
    setBusy('query');setError('');setMessage('');
    try{
      const next=await fiscalIntegrationService.query(order,environment);
      setRecord(next);
      setMessage(next.status==='authorized'?'NF-e autorizada e sincronizada.':`Status fiscal: ${statusLabel(next.status)}.`);
    }catch(cause:any){setError(cause?.message||'Não foi possível consultar a NF-e.');}
    finally{setBusy('');}
  };

  const cancel=async()=>{
    const reason=window.prompt('Justificativa do cancelamento da NF-e (15 a 255 caracteres):','')?.trim()||'';
    if(!reason)return;
    if(reason.length<15)return setError('A justificativa precisa ter pelo menos 15 caracteres.');
    if(!window.confirm('Cancelar esta NF-e autorizada? O cancelamento fiscal é uma ação sensível.'))return;
    setBusy('cancel');setError('');setMessage('');
    try{
      const next=await fiscalIntegrationService.cancel(order,environment,reason);
      setRecord(next);setMessage('Cancelamento fiscal registrado.');
    }catch(cause:any){setError(cause?.message||'Não foi possível cancelar a NF-e.');}
    finally{setBusy('');}
  };

  if(!open)return null;
  return <div className="fixed inset-0 z-[310] overflow-y-auto bg-slate-950/75 p-3 backdrop-blur-sm md:p-6" onClick={onClose}>
    <div className="mx-auto max-w-6xl overflow-hidden rounded-[30px] bg-white text-slate-900 shadow-2xl" onClick={event=>event.stopPropagation()}>
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 md:p-7">
        <div><p className="text-[10px] font-black uppercase tracking-[.15em] text-indigo-700">DMS · FISCAL</p><h2 className="mt-1 text-2xl font-semibold">NF-e da venda · {order.plate}</h2><p className="mt-1 text-sm text-slate-500">{order.vehicle} · {order.customerName} · {money(order.netSalePrice)}</p></div>
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500"><X size={18}/></button>
      </header>
      <div className="grid gap-5 p-5 lg:grid-cols-[.85fr_1.15fr] md:p-7">
        <section>
          <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Integração</p><p className="mt-1 font-semibold">{provider==='focus_nfe'?'Focus NFe':provider==='manual'?'Faturamento manual':provider}</p><p className="mt-1 text-xs text-slate-500">Ambiente: {environment==='producao'?'produção':'homologação'}</p></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${configured?'border-emerald-200 bg-emerald-50 text-emerald-700':'border-amber-200 bg-amber-50 text-amber-700'}`}>{configured?'CREDENCIAL OK':'CREDENCIAL PENDENTE'}</span></div>
            {provider!=='focus_nfe'&&<p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">Configure a empresa com provedor <b>Focus NFe</b> na Central Master para emissão automática.</p>}
            {provider==='focus_nfe'&&configured===false&&<p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">A empresa está apontando para Focus NFe, mas o token ainda não está configurado no ambiente seguro do servidor.</p>}
          </div>

          <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Documento fiscal</p><p className="mt-1 text-sm font-semibold">Referência {record?.reference||order.fiscalExternalId||order.salesOrderId}</p></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(effectiveStatus)}`}>{statusLabel(effectiveStatus)}</span></div>
            {(record?.invoiceNumber||order.invoiceNumber)&&<div className="mt-3 grid gap-2 sm:grid-cols-2"><Info label="Número" value={record?.invoiceNumber||order.invoiceNumber||'—'}/><Info label="Série" value={record?.series||'—'}/><Info label="Chave de acesso" value={record?.accessKey||order.fiscalAccessKey||'—'}/><Info label="Protocolo" value={record?.protocol||'—'}/></div>}
            {!!record?.messages?.length&&<div className="mt-3 space-y-1">{record.messages.map((item,index)=><p key={index} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">{item.code?item.code+' · ':''}{item.message}</p>)}</div>}
            <div className="mt-3 flex flex-wrap gap-2">
              {(record?.danfeUrl||order.fiscalDanfeUrl)&&<a href={record?.danfeUrl||order.fiscalDanfeUrl} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700"><FileText size={14}/> DANFE</a>}
              {(record?.xmlUrl||order.fiscalXmlUrl)&&<a href={record?.xmlUrl||order.fiscalXmlUrl} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700"><FileJson2 size={14}/> XML</a>}
              {order.fiscalInvoiceId&&<button disabled={busy!==''} onClick={()=>void refresh()} className="flex h-9 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 disabled:opacity-50"><RefreshCw size={14} className={busy==='query'?'animate-spin':''}/> CONSULTAR</button>}
            </div>
          </div>

          {effectiveStatus==='authorized'&&<div className="mt-4 rounded-[22px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={18}/><p className="mt-2 font-semibold">NF-e autorizada.</p><p className="mt-1 text-xs leading-5">Volte ao Pedido de Venda e conclua o faturamento financeiro usando o número da nota retornado pelo provedor.</p></div>}
          {effectiveStatus==='authorized'&&<button disabled={busy!==''} onClick={()=>void cancel()} className="mt-3 h-10 w-full rounded-xl border border-red-200 bg-red-50 text-xs font-bold text-red-700 disabled:opacity-50">CANCELAR NF-e</button>}
        </section>

        <section className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3"><ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-600"/><div><p className="text-sm font-semibold">Payload fiscal</p><p className="mt-1 text-xs leading-5 text-slate-500">O Motyq preenche os dados comerciais básicos. <b>NCM, CFOP, CST/CSOSN, ICMS, PIS, COFINS e demais regras tributárias devem vir da parametrização validada pelo contador da empresa.</b> O sistema não inventa tributação.</p></div></div>
          <textarea value={payload} onChange={e=>setPayload(e.target.value)} spellCheck={false} rows={25} className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-[11px] leading-5 text-slate-100 outline-none"/>
          {!parsedPayload&&<p className="mt-2 text-xs font-semibold text-red-600">JSON inválido. Corrija antes de emitir.</p>}
          {(error||message)&&<div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${error?'border-red-200 bg-red-50 text-red-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error||message}</div>}
          <button disabled={busy!==''||!canIssue||!parsedPayload||effectiveStatus==='authorized'} onClick={()=>void issue()} className="mt-4 h-11 w-full rounded-xl bg-indigo-600 text-sm font-bold text-white disabled:opacity-40">{busy==='issue'?'ENVIANDO À SEFAZ...':environment==='producao'?'EMITIR NF-e EM PRODUÇÃO':'EMITIR NF-e EM HOMOLOGAÇÃO'}</button>
          {!canIssue&&provider==='focus_nfe'&&<p className="mt-2 text-center text-[10px] text-slate-500">A emissão exige pedido liberado para faturar, integração ativa e token configurado.</p>}
        </section>
      </div>
    </div>
  </div>;
};

const Info=({label,value}:{label:string;value:string})=><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">{label}</p><p className="mt-1 break-all text-xs font-semibold text-slate-700">{value}</p></div>;

export default FiscalInvoicePanel;
