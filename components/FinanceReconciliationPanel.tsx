import React,{useEffect,useState} from 'react';
import { CheckCircle2, Landmark, RefreshCw, Scale, X } from 'lucide-react';
import type { FinanceAccount, FinanceClosing, FinanceReconciliation, User } from '../types';
import { financeAccountService } from '../services/financeAccountService';
import { financeReconciliationService } from '../services/financeReconciliationService';

type Props={open:boolean;onClose:()=>void;currentUser:User;companyId:string;storeId:string;storeName:string};
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const today=()=>new Date().toISOString().slice(0,10);
const month=()=>today().slice(0,7);

const FinanceReconciliationPanel:React.FC<Props>=({open,onClose,currentUser,companyId,storeId,storeName})=>{
 const[tab,setTab]=useState<'reconcile'|'closing'>('reconcile');
 const[accounts,setAccounts]=useState<FinanceAccount[]>([]);
 const[accountId,setAccountId]=useState('');
 const[startDate,setStartDate]=useState(today().slice(0,8)+'01');
 const[endDate,setEndDate]=useState(today());
 const[statementBalance,setStatementBalance]=useState('');
 const[periodType,setPeriodType]=useState<'daily'|'monthly'>('daily');
 const[referenceDate,setReferenceDate]=useState(today());
 const[declaredBalance,setDeclaredBalance]=useState('');
 const[notes,setNotes]=useState('');
 const[preview,setPreview]=useState<{systemBalance:number;candidates:number}|null>(null);
 const[history,setHistory]=useState<FinanceReconciliation[]>([]);
 const[closings,setClosings]=useState<FinanceClosing[]>([]);
 const[busy,setBusy]=useState(false);
 const[message,setMessage]=useState('');
 const[error,setError]=useState('');

 const load=async()=>{
  try{
   const [acc,recs,cls]=await Promise.all([
    financeAccountService.list(companyId,storeId),
    financeReconciliationService.listReconciliations(companyId,storeId),
    financeReconciliationService.listClosings(companyId,storeId),
   ]);
   setAccounts(acc.filter(item=>item.active));
   setHistory(recs);
   setClosings(cls);
   if(!accountId&&acc[0])setAccountId(acc[0].accountId);
  }catch(e:any){setError(e?.message||'Falha ao carregar conciliação.');}
 };
 useEffect(()=>{if(open)void load();},[open,companyId,storeId]);

 const runPreview=async()=>{
  if(!accountId)return setError('Selecione uma conta.');
  setBusy(true);setError('');setMessage('');
  try{
   const result=await financeReconciliationService.preview(companyId,storeId,accountId,startDate,endDate);
   setPreview({systemBalance:result.systemBalance,candidates:result.candidates.length});
   if(!statementBalance)setStatementBalance(String(result.systemBalance.toFixed(2)));
  }catch(e:any){setError(e?.message||'Não foi possível calcular a conciliação.');}
  finally{setBusy(false);}
 };
 const reconcile=async()=>{
  if(!accountId)return setError('Selecione uma conta.');
  setBusy(true);setError('');setMessage('');
  try{
   const result=await financeReconciliationService.reconcile({
    companyId,storeId,financeAccountId:accountId,startDate,endDate,
    statementBalance:Number(String(statementBalance).replace(',','.'))||0,actor:currentUser,
   });
   setMessage(Math.abs(result.difference)<0.01?'Conciliação fechada sem diferença.':`Conciliação salva com diferença de ${money(result.difference)}.`);
   await load();await runPreview();
  }catch(e:any){setError(e?.message||'Não foi possível salvar a conciliação.');}
  finally{setBusy(false);}
 };
 const closePeriod=async()=>{
  if(!accountId)return setError('Selecione uma conta.');
  setBusy(true);setError('');setMessage('');
  try{
   const ref=periodType==='monthly'?referenceDate.slice(0,7):referenceDate.slice(0,10);
   const result=await financeReconciliationService.closePeriod({
    companyId,storeId,financeAccountId:accountId,periodType,referenceDate:ref,
    declaredBalance:Number(String(declaredBalance).replace(',','.'))||0,notes,actor:currentUser,
   });
   setMessage(Math.abs(result.difference)<0.01?'Fechamento registrado sem diferença.':`Fechamento registrado com diferença de ${money(result.difference)}.`);
   setNotes('');await load();
  }catch(e:any){setError(e?.message||'Não foi possível registrar o fechamento.');}
  finally{setBusy(false);}
 };

 if(!open)return null;
 const selectedAccount=accounts.find(item=>item.accountId===accountId);
 return <div className="fixed inset-0 z-[297] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={onClose}>
  <div className="mx-auto max-w-5xl overflow-hidden rounded-[30px] border border-white/10 bg-zinc-950 text-white shadow-2xl" onClick={e=>e.stopPropagation()}>
   <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 md:p-7"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-sky-300">FINANCEIRO · CONTROLE</p><h2 className="mt-2 text-2xl font-semibold">Conciliação e fechamento.</h2><p className="mt-1 text-sm text-zinc-500">{storeName}. O saldo do sistema é comparado com banco/caixa informado.</p></div><button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/[.05] text-zinc-400"><X size={18}/></button></header>
   <div className="p-5 md:p-7">
    <div className="flex flex-wrap gap-2"><button onClick={()=>setTab('reconcile')} className={`rounded-xl border px-4 py-2 text-xs font-bold ${tab==='reconcile'?'border-sky-400/30 bg-sky-400/10 text-sky-300':'border-white/10 text-zinc-500'}`}><Scale size={14} className="mr-2 inline"/>CONCILIAÇÃO</button><button onClick={()=>setTab('closing')} className={`rounded-xl border px-4 py-2 text-xs font-bold ${tab==='closing'?'border-violet-400/30 bg-violet-400/10 text-violet-300':'border-white/10 text-zinc-500'}`}><Landmark size={14} className="mr-2 inline"/>FECHAMENTO</button></div>
    {(message||error)&&<div className={`mt-4 rounded-xl border px-3 py-2 text-xs ${error?'border-red-400/20 bg-red-400/5 text-red-300':'border-emerald-400/20 bg-emerald-400/5 text-emerald-300'}`}>{error||message}</div>}
    <label className="mt-5 block text-xs text-zinc-500">Banco / caixa<select value={accountId} onChange={e=>{setAccountId(e.target.value);setPreview(null);}} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white"><option value="">Selecione...</option>{accounts.map(item=><option key={item.accountId} value={item.accountId}>{item.accountType==='cash'?'Caixa':'Banco'} · {item.name}</option>)}</select></label>

    {tab==='reconcile'?<div className="mt-5 grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-xs font-bold text-zinc-300">Período e saldo do extrato</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-[10px] text-zinc-600">De<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white"/></label><label className="text-[10px] text-zinc-600">Até<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white"/></label></div><button disabled={busy} onClick={()=>void runPreview()} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-sky-400/20 text-xs font-bold text-sky-300"><RefreshCw size={14}/> CALCULAR SISTEMA</button>{preview&&<div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] text-zinc-600">Saldo calculado</p><p className="mt-1 text-2xl font-semibold">{money(preview.systemBalance)}</p><p className="mt-1 text-[10px] text-zinc-600">{preview.candidates} baixa(s) no período</p></div>}<label className="mt-3 block text-xs text-zinc-500">Saldo no extrato<input value={statementBalance} onChange={e=>setStatementBalance(e.target.value)} placeholder="0,00" className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white outline-none"/></label><button disabled={busy||!preview} onClick={()=>void reconcile()} className="mt-3 h-11 w-full rounded-xl bg-sky-400 text-xs font-bold text-sky-950 disabled:opacity-40">SALVAR CONCILIAÇÃO</button></section>
      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-xs font-bold text-zinc-300">Histórico</p><div className="mt-3 max-h-[430px] space-y-2 overflow-y-auto">{history.map(item=><div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold">{accounts.find(a=>a.accountId===item.financeAccountId)?.name||item.financeAccountId}</p><p className="mt-1 text-[10px] text-zinc-600">{item.startDate} → {item.endDate} · {item.financeEntryIds.length} lançamentos</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${item.status==='balanced'?'bg-emerald-400/10 text-emerald-300':'bg-amber-400/10 text-amber-300'}`}>{item.status==='balanced'?'CONCILIADO':'DIFERENÇA'}</span></div><p className="mt-2 text-xs text-zinc-500">Sistema {money(item.systemBalance)} · Extrato {money(item.statementBalance)} · Dif. <b className={Math.abs(item.difference)<0.01?'text-emerald-300':'text-amber-300'}>{money(item.difference)}</b></p></div>)}{!history.length&&<p className="p-8 text-center text-xs text-zinc-600">Nenhuma conciliação registrada.</p>}</div></section>
    </div>:<div className="mt-5 grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-xs font-bold text-zinc-300">Novo fechamento</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><select value={periodType} onChange={e=>setPeriodType(e.target.value as any)} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white"><option value="daily">Diário</option><option value="monthly">Mensal</option></select>{periodType==='daily'?<input type="date" value={referenceDate.slice(0,10)} onChange={e=>setReferenceDate(e.target.value)} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white"/>:<input type="month" value={referenceDate.slice(0,7)||month()} onChange={e=>setReferenceDate(e.target.value)} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white"/>}</div><label className="mt-3 block text-xs text-zinc-500">Saldo conferido no {selectedAccount?.accountType==='cash'?'caixa':'banco'}<input value={declaredBalance} onChange={e=>setDeclaredBalance(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white"/></label><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Observações do fechamento" rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900 p-3 text-xs text-white outline-none"/><button disabled={busy} onClick={()=>void closePeriod()} className="mt-3 h-11 w-full rounded-xl bg-violet-400 text-xs font-bold text-violet-950">REGISTRAR FECHAMENTO</button></section>
      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-xs font-bold text-zinc-300">Fechamentos anteriores</p><div className="mt-3 max-h-[430px] space-y-2 overflow-y-auto">{closings.map(item=><div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold">{item.periodType==='daily'?'Diário':'Mensal'} · {item.referenceDate}</p><p className="mt-1 text-[10px] text-zinc-600">{accounts.find(a=>a.accountId===item.financeAccountId)?.name||item.financeAccountId}</p></div>{Math.abs(item.difference)<0.01?<CheckCircle2 size={16} className="text-emerald-300"/>:<span className="text-xs font-bold text-amber-300">{money(item.difference)}</span>}</div><p className="mt-2 text-xs text-zinc-500">Sistema {money(item.systemBalance)} · Declarado {money(item.declaredBalance)}</p></div>)}{!closings.length&&<p className="p-8 text-center text-xs text-zinc-600">Nenhum fechamento registrado.</p>}</div></section>
    </div>}
   </div>
  </div>
 </div>;
};
export default FinanceReconciliationPanel;
