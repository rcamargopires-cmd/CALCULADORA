import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BrainCircuit, CheckCircle2, Crosshair, Database, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { eachDayOfInterval, endOfMonth, format, isAfter, startOfMonth } from 'date-fns';
import { db } from '../firebase';
import { OperationalSaleItem, OperationalStockItem } from '../types';
import { formatCurrency } from '../utils/currency';
import { operationalDataService } from '../services/operationalDataService';

interface PerformanceConfig { monthlyGoal: number; captureGoal: number; healthyMargin: number; sellerMonthlyGoal: number; holidays: string[]; }
const DEFAULTS: PerformanceConfig = { monthlyGoal: 70, captureGoal: 60, healthyMargin: 8, sellerMonthlyGoal: 15, holidays: [] };
type PriorityLevel = 'critical' | 'warning' | 'good';
type Priority = { id: string; level: PriorityLevel; title: string; reason: string; action: string; metric: string };
const isWorkingDay = (date: Date, holidays: string[]) => date.getDay() !== 0 && !holidays.includes(format(date, 'yyyy-MM-dd'));

const AIManagerV2: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stock, setStock] = useState<OperationalStockItem[]>([]);
  const [sales, setSales] = useState<OperationalSaleItem[]>([]);
  const [performance, setPerformance] = useState<PerformanceConfig>(DEFAULTS);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [stockData, salesData, perfSnap] = await Promise.all([
        operationalDataService.getLatestStock(),
        operationalDataService.getSales(),
        getDoc(doc(db, 'config/performance')),
      ]);
      setStock(stockData);
      setSales(salesData);
      if (perfSnap.exists()) {
        const raw = perfSnap.data() as Partial<PerformanceConfig>;
        setPerformance({ ...DEFAULTS, ...raw, holidays: Array.isArray(raw.holidays) ? raw.holidays : [] });
      }
      setLoadedOnce(true);
    } catch (error) {
      console.error('AI Manager: erro ao carregar dados operacionais', error);
      setLoadedOnce(true);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const refresh = () => load();
    window.addEventListener('dealmaster:operational-data-updated', refresh);
    return () => window.removeEventListener('dealmaster:operational-data-updated', refresh);
  }, []);

  const data = useMemo(() => {
    const now = new Date();
    const prefix = format(now, 'yyyy-MM');
    const monthSales = sales.filter(s => s.saleDate?.startsWith(prefix));
    const actual = monthSales.length;
    const totalInvoice = monthSales.reduce((s, i) => s + (Number(i.invoiceValue) || 0), 0);
    const totalMargin = monthSales.reduce((s, i) => s + (Number(i.marginValue) || 0), 0);
    const weightedMargin = totalInvoice > 0 ? (totalMargin / totalInvoice) * 100 : 0;
    const avgMargin = weightedMargin || (actual ? monthSales.reduce((s,i)=>s+(Number(i.marginPercent)||0),0)/actual : 0);
    const captureCount = monthSales.filter(s => s.hasTradeIn).length;
    const capture = actual ? (captureCount / actual) * 100 : 0;
    const start = startOfMonth(now); const end = endOfMonth(now);
    const workDays = eachDayOfInterval({start,end}).filter(d => isWorkingDay(d, performance.holidays));
    const elapsed = workDays.filter(d => !isAfter(d, now));
    const remaining = workDays.filter(d => isAfter(d, now));
    const expectedToday = performance.monthlyGoal * (elapsed.length / Math.max(workDays.length, 1));
    const projection = Math.round((actual / Math.max(elapsed.length, 1)) * Math.max(workDays.length, 1));
    const dailyNeeded = Math.max(performance.monthlyGoal - actual, 0) / Math.max(remaining.length, 1);
    const aged = stock.filter(i => Number(i.stockDays) > 60);
    const critical = stock.filter(i => Number(i.stockDays) > 90);
    const criticalValue = critical.reduce((s, i) => s + (Number(i.cost) || 0), 0);
    const stockValue = stock.reduce((s, i) => s + (Number(i.cost) || 0), 0);
    const avgStockDays = stock.length ? stock.reduce((s,i)=>s+(Number(i.stockDays)||0),0)/stock.length : 0;
    const sellerMap = new Map<string, { count:number; margin:number; invoice:number; capture:number }>();
    monthSales.forEach(s => {
      const name = s.seller || 'Sem vendedor';
      const current = sellerMap.get(name) || {count:0, margin:0, invoice:0, capture:0};
      current.count += 1; current.margin += Number(s.marginValue)||0; current.invoice += Number(s.invoiceValue)||0; if(s.hasTradeIn) current.capture += 1;
      sellerMap.set(name,current);
    });
    const sellers = Array.from(sellerMap.entries()).map(([name,v]) => ({ name, projection:Math.round((v.count/Math.max(elapsed.length,1))*Math.max(workDays.length,1)) }));
    return { actual, totalInvoice, totalMargin, avgMargin, capture, expectedToday, projection, dailyNeeded, aged, critical, criticalValue, stockValue, avgStockDays, sellers };
  }, [sales, stock, performance]);

  const priorities = useMemo<Priority[]>(() => {
    const items: Priority[] = [];
    if (!stock.length && !sales.length) return [{ id:'data', level:'warning', title:'Atualizar dados da loja', reason:'Ainda não existem dados operacionais importados.', action:'Envie o estoque do dia e o mapa de faturamentos em Dados da Loja.', metric:'Sem dados' }];
    if (data.actual < data.expectedToday - 1 || data.projection < performance.monthlyGoal) items.push({ id:'volume', level:data.projection < performance.monthlyGoal-5?'critical':'warning', title:'Recuperar ritmo de faturamento', reason:`Faturado ${data.actual}, esperado ${data.expectedToday.toFixed(1)} e projeção ${data.projection}/${performance.monthlyGoal}.`, action:`Ritmo necessário: ${data.dailyNeeded.toFixed(1)} carro(s) por dia trabalhado restante.`, metric:`${Math.max(performance.monthlyGoal-data.projection,0)} abaixo` });
    if (data.critical.length) items.push({ id:'stock', level:'critical', title:'Destravar estoque crítico', reason:`${data.critical.length} veículo(s) acima de 90 dias representam ${formatCurrency(data.criticalValue)} de custo.`, action:'Priorize os mais antigos em preço, campanhas, recontato e concessões com margem controlada.', metric:`${data.critical.length} críticos` });
    else if (data.aged.length) items.push({ id:'aged', level:'warning', title:'Antecipar giro do +60 dias', reason:`${data.aged.length} veículo(s) já estão na faixa de atenção.`, action:'Atue antes que entrem em +90 dias.', metric:`${data.aged.length} veículos` });
    if (data.actual && data.capture < performance.captureGoal) items.push({ id:'capture', level:performance.captureGoal-data.capture>=10?'critical':'warning', title:'Elevar captura', reason:`Captura real em ${data.capture.toFixed(0)}%, meta ${performance.captureGoal}%.`, action:'Acompanhe por vendedor e trabalhe negócios com troca sem destruir margem.', metric:`${(performance.captureGoal-data.capture).toFixed(0)} p.p.` });
    if (data.actual && data.avgMargin < performance.healthyMargin) items.push({ id:'margin', level:data.avgMargin<performance.healthyMargin-2?'critical':'warning', title:'Proteger margem real', reason:`Margem faturada está em ${data.avgMargin.toFixed(1)}%, referência ${performance.healthyMargin}%.`, action:'Use o estoque envelhecido para concessões e proteja margem no estoque novo.', metric:`${(performance.healthyMargin-data.avgMargin).toFixed(1)} p.p.` });
    const weak = data.sellers.filter(s=>s.projection<performance.sellerMonthlyGoal).sort((a,b)=>a.projection-b.projection).slice(0,2);
    if (weak.length) items.push({ id:'team', level:'warning', title:'Foco individual na equipe', reason:weak.map(s=>`${s.name}: proj. ${s.projection}`).join(' • '), action:'Defina uma ação objetiva com os vendedores abaixo do ritmo.', metric:`${weak.length} vendedor(es)` });
    if(!items.length)items.push({id:'healthy',level:'good',title:'Operação equilibrada',reason:'Volume, margem, captura e estoque estão dentro das referências.',action:'Mantenha disciplina comercial e preserve margem.',metric:'Sem alerta'});
    const rank={critical:0,warning:1,good:2}; return items.sort((a,b)=>rank[a.level]-rank[b.level]).slice(0,3);
  },[data,performance,stock.length,sales.length]);

  const health = useMemo(()=>{const c=priorities.filter(p=>p.level==='critical').length,w=priorities.filter(p=>p.level==='warning').length;if(c>=2)return{label:'Crítico',tone:'critical' as const};if(c===1||w>=2)return{label:'Atenção',tone:'warning' as const};return{label:'Saudável',tone:'good' as const};},[priorities]);

  return <>
    <button onClick={()=>{setOpen(true);load();}} className="fixed bottom-5 right-5 z-[140] flex items-center gap-2 rounded-full border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-black shadow-2xl shadow-black/50 transition active:scale-95"><BrainCircuit size={18}/> AI Manager<span className={`h-2 w-2 rounded-full ${health.tone==='critical'?'bg-red-500':health.tone==='warning'?'bg-amber-500':'bg-emerald-500'}`}/></button>
    {open&&<div className="fixed inset-0 z-[200] bg-black/75 p-3 backdrop-blur-md md:p-6" onClick={()=>setOpen(false)}><div className="mx-auto flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-[32px] border border-white/10 bg-zinc-950 shadow-2xl" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between border-b border-white/10 p-5 md:p-6"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-black"><BrainCircuit size={21}/></div><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">DealMaster AI Manager</p><h3 className="mt-1 text-xl font-semibold text-white">Plano de ação com dados reais</h3></div></div><div className="flex gap-2"><button onClick={load} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><RefreshCw size={17} className={loading?'animate-spin':''}/></button><button onClick={()=>setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><X size={18}/></button></div></div><div className="overflow-y-auto p-5 md:p-6">
      {!loadedOnce||loading?<div className="grid min-h-64 place-items-center text-zinc-500"><div className="text-center"><RefreshCw className="mx-auto mb-3 animate-spin"/><p>Carregando operação...</p></div></div>:<><div className={`rounded-[24px] border p-5 ${health.tone==='critical'?'border-red-500/20 bg-red-500/[0.08]':health.tone==='warning'?'border-amber-400/20 bg-amber-400/[0.08]':'border-emerald-500/20 bg-emerald-500/[0.08]'}`}><div className="flex items-center justify-between"><span className="text-sm text-zinc-400">Saúde da operação</span><span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-semibold text-zinc-200">{health.label}</span></div><div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4"><ManagerMetric label="Faturado" value={`${data.actual}/${performance.monthlyGoal}`} ok={data.projection>=performance.monthlyGoal}/><ManagerMetric label="Margem real" value={`${data.avgMargin.toFixed(1)}%`} ok={data.avgMargin>=performance.healthyMargin}/><ManagerMetric label="Estoque" value={`${stock.length} carros`} ok={!data.critical.length}/><ManagerMetric label="+90 dias" value={`${data.critical.length}`} ok={!data.critical.length}/></div></div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4"><SecondaryMetric label="Faturamento R$" value={formatCurrency(data.totalInvoice)}/><SecondaryMetric label="Margem R$" value={formatCurrency(data.totalMargin)}/><SecondaryMetric label="Capital estoque" value={formatCurrency(data.stockValue)}/><SecondaryMetric label="Idade média" value={`${data.avgStockDays.toFixed(0)} dias`}/></div>
      <div className="mt-5 space-y-3">{priorities.map((p,index)=><div key={p.id} className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4 md:p-5"><div className="flex items-start gap-4"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${p.level==='critical'?'bg-red-500/12 text-red-400':p.level==='warning'?'bg-amber-400/12 text-amber-400':'bg-emerald-500/12 text-emerald-400'}`}>{p.level==='critical'?<ShieldAlert size={17}/>:p.level==='warning'?<AlertTriangle size={17}/>:<CheckCircle2 size={17}/>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium text-white">{index+1}. {p.title}</h4><span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] text-zinc-400">{p.metric}</span></div><p className="mt-2 text-xs leading-5 text-zinc-500">{p.reason}</p><div className="mt-3 flex items-start gap-2 text-sm leading-5 text-zinc-300"><Crosshair size={15} className="mt-0.5 shrink-0 text-zinc-600"/><span>{p.action}</span></div></div></div></div>)}</div><div className="mt-5 flex items-center gap-2 rounded-2xl bg-white/[0.03] p-4 text-xs leading-5 text-zinc-500"><Database size={15}/> Fonte: estoque e faturamentos importados em Dados da Loja. Negociações da calculadora não entram nesses indicadores.</div></>}
    </div></div></div>}
  </>;
};

const ManagerMetric=({label,value,ok}:{label:string;value:string;ok:boolean})=><div className="rounded-2xl bg-black/20 p-3"><div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</span><span className={`h-2 w-2 rounded-full ${ok?'bg-emerald-400':'bg-amber-400'}`}/></div><p className="mt-1 text-base font-semibold text-zinc-200">{value}</p></div>;
const SecondaryMetric=({label,value}:{label:string;value:string})=><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><p className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</p><p className="mt-1 truncate text-sm font-semibold text-zinc-200">{value}</p></div>;
export default AIManagerV2;
