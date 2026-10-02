import React,{useEffect,useMemo,useState} from 'react';
import { AlertTriangle, BarChart3, CircleDollarSign, RefreshCw, ShoppingCart, TrendingUp, X } from 'lucide-react';
import type { User } from '../types';
import { dmsAnalyticsService, type DmsAnalyticsReport } from '../services/dmsAnalyticsService';

type Props={currentUser:User;companyId:string;storeId:string;storeName:string};
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const pct=(value:number)=>`${(Number(value)||0).toFixed(1).replace('.',',')}%`;

const DmsAnalyticsPanel:React.FC<Props>=({companyId,storeId,storeName})=>{
  const[open,setOpen]=useState(false);
  const[report,setReport]=useState<DmsAnalyticsReport|null>(null);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState('');
  const[tab,setTab]=useState<'overview'|'vehicles'|'sellers'|'suppliers'>('overview');

  const run=async()=>{
    setLoading(true);setError('');
    try{setReport(await dmsAnalyticsService.run(companyId,storeId));}
    catch(cause:any){setError(cause?.message||'Não foi possível montar a visão transacional do DMS.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{if(open)void run();},[open,companyId,storeId]);

  const funnel=useMemo(()=>{
    if(!report)return[];
    return[
      ['Leads',report.funnel.leads],
      ['Propostas',report.funnel.proposals],
      ['Aceites',report.funnel.accepted],
      ['Pedidos',report.funnel.salesOrders],
      ['Entregues',report.funnel.delivered],
    ] as Array<[string,number]>;
  },[report]);

  return <>
    <button title="BI DMS" onClick={()=>setOpen(true)} className="fixed right-5 z-[134] grid h-12 w-12 place-items-center rounded-full border border-cyan-400/25 bg-zinc-950/95 text-cyan-300 shadow-2xl" style={{bottom:80}}><BarChart3 size={18}/></button>
    {open&&<div className="fixed inset-0 z-[284] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={()=>setOpen(false)}>
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[30px] border border-white/10 bg-zinc-950 text-white shadow-2xl" onClick={event=>event.stopPropagation()}>
        <header className="flex flex-col gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-start sm:justify-between md:p-7">
          <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-cyan-300">BI · TRANSAÇÕES REAIS DO DMS</p><h2 className="mt-2 text-2xl font-semibold">Resultado da operação, sem planilha paralela.</h2><p className="mt-1 text-sm text-zinc-500">{storeName}. Estoque, compras, vendas, financeiro, preparação e pós-venda cruzados pelo cadastro mestre.</p></div>
          <div className="flex gap-2"><button disabled={loading} onClick={()=>void run()} className="flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-bold text-zinc-300 disabled:opacity-50"><RefreshCw size={14} className={loading?'animate-spin':''}/> ATUALIZAR</button><button onClick={()=>setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[.05] text-zinc-400"><X size={18}/></button></div>
        </header>
        <div className="p-5 md:p-7">
          {error&&<div className="mb-4 rounded-xl border border-red-400/20 bg-red-400/[.05] px-4 py-3 text-sm text-red-300">{error}</div>}
          {!report&&loading&&<div className="grid min-h-[380px] place-items-center"><div className="text-center"><RefreshCw size={28} className="mx-auto animate-spin text-cyan-300"/><p className="mt-3 text-sm text-zinc-500">Cruzando as transações do DMS...</p></div></div>}
          {report&&<>
            <nav className="flex flex-wrap gap-2">
              <Tab active={tab==='overview'} onClick={()=>setTab('overview')} label="Visão geral"/>
              <Tab active={tab==='vehicles'} onClick={()=>setTab('vehicles')} label="Rentabilidade por carro"/>
              <Tab active={tab==='sellers'} onClick={()=>setTab('sellers')} label="Por vendedor"/>
              <Tab active={tab==='suppliers'} onClick={()=>setTab('suppliers')} label="Preparação / fornecedores"/>
            </nav>

            {tab==='overview'&&<>
              <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric icon={<ShoppingCart size={16}/>} label="Estoque atual" value={String(report.stock.count)} note={money(report.stock.value)}/>
                <Metric icon={<TrendingUp size={16}/>} label="Vendas do mês" value={String(report.sales.month)} note={`${money(report.sales.revenue)} · margem ${pct(report.sales.marginPercent)}`}/>
                <Metric icon={<CircleDollarSign size={16}/>} label="Resultado bruto DMS" value={money(report.sales.profit)} note="venda + retorno - custo - pós-venda" danger={report.sales.profit<0}/>
                <Metric icon={<AlertTriangle size={16}/>} label="Integridade" value={String(report.integrity.critical)} note={`${report.integrity.warning} atenção(ões)`} danger={report.integrity.critical>0}/>
              </section>
              <section className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Contas a pagar" value={money(report.finance.payableOpen)} note="em aberto"/>
                <Metric label="Contas a receber" value={money(report.finance.receivableOpen)} note="em aberto"/>
                <Metric label="Caixa realizado" value={money(report.finance.realizedResult)} note={`+${money(report.finance.realizedIn)} · -${money(report.finance.realizedOut)}`} danger={report.finance.realizedResult<0}/>
                <Metric label="Estoque >90 dias" value={String(report.stock.aged90)} note={money(report.stock.aged90Value)} danger={report.stock.aged90>0}/>
              </section>
              <section className="mt-5 grid gap-4 lg:grid-cols-3">
                <Card title="Funil do mês"><div className="space-y-3">{funnel.map(([label,value],index)=>{const first=Math.max(1,funnel[0]?.[1]||1);const width=Math.max(5,Math.min(100,value/first*100));return <div key={label}><div className="flex items-center justify-between text-xs"><span className="text-zinc-500">{label}</span><b>{value}</b></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-cyan-400" style={{width:`${width}%`,opacity:1-index*.12}}/></div></div>})}</div></Card>
                <Card title="Compras / captação"><Info label="Entraram no mês" value={String(report.purchases.enteredMonth)}/><Info label="Valor adquirido" value={money(report.purchases.valueMonth)}/><Info label="Processos em aberto" value={String(report.purchases.open)}/></Card>
                <Card title="Operação"><Info label="Prep. ativas" value={String(report.prep.activeOrders)}/><Info label="Aguardando aprovação" value={String(report.prep.pendingApproval)}/><Info label="Custo prep. aprovado" value={money(report.prep.approvedCost)}/><Info label="Pós-venda em aberto" value={String(report.afterSales.open)}/><Info label="Custo pós-venda" value={money(report.afterSales.cost)}/></Card>
              </section>
            </>}

            {tab==='vehicles'&&<DataTable headers={['Placa / veículo','Venda','Custo','Retorno','Pós-venda','Resultado','Margem']} rows={report.vehicles.map(row=>[
              <div><b className="font-mono">{row.plate}</b><p className="mt-1 text-[10px] text-zinc-600">{row.vehicle}</p></div>,
              money(row.saleValue),money(row.vehicleCost),money(row.financingReturn),money(row.afterSalesCost),
              <b className={row.profit<0?'text-red-300':'text-emerald-300'}>{money(row.profit)}</b>,pct(row.marginPercent),
            ])}/>}
            {tab==='sellers'&&<DataTable headers={['Vendedor','Vendas','Receita','Resultado','Margem']} rows={report.sellers.map(row=>[
              <b>{row.seller}</b>,String(row.sales),money(row.revenue),
              <b className={row.profit<0?'text-red-300':'text-emerald-300'}>{money(row.profit)}</b>,pct(row.marginPercent),
            ])}/>}
            {tab==='suppliers'&&<DataTable headers={['Fornecedor','Serviços','Valor']} rows={report.suppliers.map(row=>[
              <b>{row.supplier}</b>,String(row.services),money(row.amount),
            ])}/>}
            <p className="mt-4 text-right text-[10px] text-zinc-700">Gerado em {new Date(report.generatedAt).toLocaleString('pt-BR')}</p>
          </>}
        </div>
      </div>
    </div>}
  </>;
};
const Tab=({active,onClick,label}:{active:boolean;onClick:()=>void;label:string})=><button onClick={onClick} className={`rounded-xl border px-4 py-2 text-xs font-semibold ${active?'border-cyan-400/30 bg-cyan-400/[.08] text-cyan-300':'border-white/10 text-zinc-500'}`}>{label}</button>;
const Metric=({icon,label,value,note,danger}:{icon?:React.ReactNode;label:string;value:string;note:string;danger?:boolean})=><div className={`rounded-[22px] border p-4 ${danger?'border-red-400/20 bg-red-400/[.04]':'border-white/10 bg-white/[.025]'}`}><div className="flex items-center gap-2 text-zinc-500">{icon}<p className="text-xs">{label}</p></div><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-[11px] text-zinc-600">{note}</p></div>;
const Card=({title,children}:{title:string;children:React.ReactNode})=><div className="rounded-[22px] border border-white/10 bg-white/[.025] p-4"><p className="text-xs font-bold text-zinc-300">{title}</p><div className="mt-3">{children}</div></div>;
const Info=({label,value}:{label:string;value:string})=><div className="flex items-center justify-between border-b border-white/5 py-2 text-xs"><span className="text-zinc-600">{label}</span><b className="text-zinc-300">{value}</b></div>;
const DataTable=({headers,rows}:{headers:string[];rows:React.ReactNode[][]})=><div className="mt-5 overflow-x-auto rounded-[22px] border border-white/10 bg-white/[.025]"><table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b border-white/10 text-[10px] uppercase tracking-[.08em] text-zinc-600"><tr>{headers.map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i} className="border-b border-white/5">{row.map((cell,j)=><td key={j} className="p-3 text-zinc-400">{cell}</td>)}</tr>)}{!rows.length&&<tr><td colSpan={headers.length} className="p-10 text-center text-zinc-600">Sem dados no período.</td></tr>}</tbody></table></div>;
export default DmsAnalyticsPanel;
