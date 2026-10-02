import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import type { DmsDiagnosticIssue, DmsDiagnosticReport, User } from '../types';
import { dmsIntegrityService } from '../services/dmsIntegrityService';
import { dmsMigrationService } from '../services/dmsMigrationService';

type Props={currentUser:User;companyId:string;storeId:string;storeName:string};

const domainLabel:Record<DmsDiagnosticIssue['domain'],string>={
  stock:'Estoque',
  vehicle:'Veículo mestre',
  prep:'PrepTrack',
  finance:'Financeiro',
  supplier:'Fornecedores',
  customer:'Clientes',
  permissions:'Permissões',
  system:'Sistema',
};

const severityMeta={
  critical:{label:'Crítico',icon:TriangleAlert,cls:'border-red-300 bg-red-50 text-red-800'},
  warning:{label:'Atenção',icon:AlertTriangle,cls:'border-amber-300 bg-amber-50 text-amber-800'},
  info:{label:'Informação',icon:CheckCircle2,cls:'border-sky-200 bg-sky-50 text-sky-800'},
} as const;

const DmsIntegrityPanel:React.FC<Props>=({currentUser,companyId,storeId,storeName})=>{
  const[open,setOpen]=useState(false);
  const[loading,setLoading]=useState(false);
  const[report,setReport]=useState<DmsDiagnosticReport|null>(null);
  const[error,setError]=useState('');
  const[filter,setFilter]=useState<'all'|'critical'|'warning'|'info'>('all');
  const[migrating,setMigrating]=useState(false);
  const[migrationMessage,setMigrationMessage]=useState('');

  const run=async()=>{
    setLoading(true);setError('');
    try{setReport(await dmsIntegrityService.run(companyId,storeId,currentUser));}
    catch(cause:any){setError(cause?.message||'Não foi possível executar o diagnóstico DMS.');}
    finally{setLoading(false);}
  };

  const migrate=async()=>{
    if(!window.confirm('Executar a migração segura dos vínculos antigos desta unidade? O Motyq apenas completa IDs mestres e arquiva cadastros mestres duplicados, sem apagar histórico.'))return;
    setMigrating(true);setError('');setMigrationMessage('');
    try{
      const result=await dmsMigrationService.runSafeMigration(companyId,storeId,currentUser);
      const total=Object.values(result).reduce((sum,value)=>sum+Number(value||0),0);
      setMigrationMessage(total ? 'Migração concluída: '+total+' vínculo(s)/ajuste(s) processado(s).' : 'Migração concluída. Nenhum vínculo antigo precisava de correção.');
      await run();
    }catch(cause:any){setError(cause?.message||'Não foi possível executar a migração segura.');}
    finally{setMigrating(false);}
  };

  useEffect(()=>{if(open)void run();},[open,companyId,storeId]);

  const visible=useMemo(()=>{
    if(!report)return[];
    return filter==='all'?report.issues:report.issues.filter(item=>item.severity===filter);
  },[report,filter]);

  const healthy=Boolean(report&&!report.criticalCount&&!report.warningCount);

  return <>
    <button
      title="Diagnóstico DMS"
      onClick={()=>setOpen(true)}
      className="hidden"
      type="button"
    >Diagnóstico DMS</button>

    {open&&<div className="fixed inset-0 z-[286] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm md:p-6" onClick={()=>setOpen(false)}>
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[30px] border border-slate-200 bg-white text-slate-900 shadow-2xl" onClick={event=>event.stopPropagation()}>
        <header className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between md:p-7">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700"><ShieldCheck size={22}/></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.17em] text-blue-700">MOTYQ · SAÚDE DO DMS</p>
              <h2 className="mt-1 text-2xl font-semibold">Diagnóstico de integridade</h2>
              <p className="mt-1 text-sm text-slate-500">{storeName}. Estoque, veículo mestre, preparação, financeiro, clientes, fornecedores e acessos.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={migrating||loading} onClick={()=>void migrate()} className="flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-bold text-emerald-700 disabled:opacity-50"><RefreshCw size={15} className={migrating?'animate-spin':''}/> {migrating?'MIGRANDO...':'CORRIGIR VÍNCULOS'}</button>
            <button disabled={loading||migrating} onClick={()=>void run()} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={15} className={loading?'animate-spin':''}/> {loading?'VERIFICANDO...':'VERIFICAR AGORA'}</button>
            <button onClick={()=>setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500"><X size={18}/></button>
          </div>
        </header>

        <div className="p-5 md:p-7">
          {error&&<div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {migrationMessage&&<div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{migrationMessage}</div>}

          {report&&<>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Críticos" value={report.criticalCount} note="podem quebrar um fluxo" tone="critical"/>
              <SummaryCard label="Atenções" value={report.warningCount} note="merecem correção" tone="warning"/>
              <SummaryCard label="Informações" value={report.infoCount} note="melhorias de governança" tone="info"/>
              <SummaryCard label="Estoque atual" value={report.stockCount} note={`${report.vehicleMasterCount} veículo(s) no mestre`} tone="neutral"/>
            </section>

            <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Mini label="Ordens PrepTrack" value={report.prepOrderCount}/>
              <Mini label="Compras" value={report.purchaseCount}/>
              <Mini label="Pedidos de Venda" value={report.salesOrderCount}/>
              <Mini label="Lançamentos financeiros" value={report.financeEntryCount}/>
              <Mini label="Fornecedores mestre" value={report.supplierCount}/>
              <Mini label="Clientes mestre" value={report.customerCount}/>
            </section>

            <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${healthy?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-slate-200 bg-slate-50 text-slate-700'}`}>
              {healthy?'Nenhuma inconsistência crítica ou de atenção encontrada nesta unidade.':report.criticalCount?'Há inconsistências críticas que devem ser corrigidas antes de avançar fluxos de venda e financeiro.':'A estrutura principal está íntegra, mas há pontos de atenção para consolidar.'}
              <span className="ml-2 text-xs opacity-70">Verificado em {new Date(report.generatedAt).toLocaleString('pt-BR')}.</span>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Filter active={filter==='all'} onClick={()=>setFilter('all')} label={`Todos (${report.issues.length})`}/>
              <Filter active={filter==='critical'} onClick={()=>setFilter('critical')} label={`Críticos (${report.criticalCount})`}/>
              <Filter active={filter==='warning'} onClick={()=>setFilter('warning')} label={`Atenções (${report.warningCount})`}/>
              <Filter active={filter==='info'} onClick={()=>setFilter('info')} label={`Informações (${report.infoCount})`}/>
            </div>

            <div className="mt-4 space-y-3">
              {visible.map(item=><IssueCard key={item.id} item={item}/>)}
              {!visible.length&&<div className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/50 p-10 text-center"><CheckCircle2 size={30} className="mx-auto text-emerald-600"/><p className="mt-3 font-semibold text-emerald-800">Nada encontrado neste filtro.</p></div>}
            </div>
          </>}

          {!report&&!loading&&!error&&<div className="rounded-3xl border border-dashed border-slate-200 p-12 text-center text-sm text-slate-500">Execute o diagnóstico para conferir a integridade do DMS.</div>}
          {loading&&!report&&<div className="rounded-3xl border border-slate-200 bg-slate-50 p-12 text-center"><RefreshCw size={28} className="mx-auto animate-spin text-blue-600"/><p className="mt-3 text-sm font-semibold text-slate-700">Cruzando os módulos do Motyq...</p></div>}
        </div>
      </div>
    </div>}
  </>;
};

const SummaryCard=({label,value,note,tone}:{label:string;value:number;note:string;tone:'critical'|'warning'|'info'|'neutral'})=>{
  const cls=tone==='critical'?'border-red-200 bg-red-50':tone==='warning'?'border-amber-200 bg-amber-50':tone==='info'?'border-sky-200 bg-sky-50':'border-slate-200 bg-slate-50';
  return <div className={`rounded-[22px] border p-4 ${cls}`}><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-500">{label}</p><p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>;
};
const Mini=({label,value}:{label:string;value:number})=><div className="rounded-2xl border border-slate-200 bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
const Filter=({active,onClick,label}:{active:boolean;onClick:()=>void;label:string})=><button onClick={onClick} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${active?'border-blue-200 bg-blue-50 text-blue-700':'border-slate-200 bg-white text-slate-500'}`}>{label}</button>;
const IssueCard=({item}:{key?:React.Key;item:DmsDiagnosticIssue})=>{
  const meta=severityMeta[item.severity];
  const Icon=meta.icon;
  return <article className={`rounded-2xl border p-4 ${meta.cls}`}>
    <div className="flex items-start gap-3">
      <Icon size={18} className="mt-0.5 shrink-0"/>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="text-[9px] font-black uppercase tracking-[.12em]">{meta.label}</span><span className="rounded-full bg-white/60 px-2 py-0.5 text-[9px] font-bold">{domainLabel[item.domain]}</span>{item.plate&&<span className="font-mono text-[10px] font-bold">{item.plate}</span>}</div>
        <p className="mt-1 font-semibold">{item.title}</p>
        <p className="mt-1 text-sm opacity-80">{item.detail}</p>
        {item.vehicleId&&<p className="mt-2 font-mono text-[10px] opacity-60">vehicleId: {item.vehicleId}</p>}
      </div>
    </div>
  </article>;
};

export default DmsIntegrityPanel;
