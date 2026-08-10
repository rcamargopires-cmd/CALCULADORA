import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CarFront, RefreshCw, Target, TrendingUp, Users, WalletCards } from 'lucide-react';
import { eachDayOfInterval, endOfMonth, format, isAfter } from 'date-fns';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { CommissionConfig, OperationalSaleItem, OperationalStockItem, SavedCalculation, User } from '../types';
import { formatCurrency } from '../utils/currency';
import { operationalDataService } from '../services/operationalDataService';
import SellerDashboard from './SellerDashboard';

interface DashboardProps {
  history: SavedCalculation[];
  users: User[];
  currentUser: User;
  commissionConfig: CommissionConfig | null;
  onStartNewCalculation: () => void;
  onDelete?: (id: string) => void;
}

type PerformanceConfig = {
  monthlyGoal: number;
  firstHalfPercent: number;
  captureGoal: number;
  healthyMargin: number;
  sellerMonthlyGoal: number;
  sellerFirstHalfGoal: number;
  sellerCaptureGoal: number;
  holidays: string[];
};

const DEFAULTS: PerformanceConfig = {
  monthlyGoal: 70,
  firstHalfPercent: 40,
  captureGoal: 60,
  healthyMargin: 8,
  sellerMonthlyGoal: 15,
  sellerFirstHalfGoal: 6,
  sellerCaptureGoal: 60,
  holidays: [],
};

const isWorkingDay = (date: Date, holidays: string[]) => date.getDay() !== 0 && !holidays.includes(format(date, 'yyyy-MM-dd'));

const Dashboard: React.FC<DashboardProps> = (props) => {
  const { currentUser } = props;
  const isSeller = currentUser.role === 'seller' || currentUser.role === 'user';
  if (isSeller) {
    return <SellerDashboard currentUser={currentUser} history={props.history} onStartNewCalculation={props.onStartNewCalculation}/>;
  }
  return <ManagerDashboard {...props}/>;
};

const ManagerDashboard: React.FC<DashboardProps> = ({ history, currentUser, onStartNewCalculation }) => {
  const [stock, setStock] = useState<OperationalStockItem[]>([]);
  const [sales, setSales] = useState<OperationalSaleItem[]>([]);
  const [performance, setPerformance] = useState<PerformanceConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [selectedSeller, setSelectedSeller] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const [stockData, salesData, perf] = await Promise.all([
        operationalDataService.getLatestStock(),
        operationalDataService.getSales(),
        getDoc(doc(db, 'config/performance')),
      ]);
      setStock(stockData);
      setSales(salesData);
      if (perf.exists()) {
        const raw = perf.data() as Partial<PerformanceConfig>;
        setPerformance({ ...DEFAULTS, ...raw, holidays: Array.isArray(raw.holidays) ? raw.holidays : [] });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const refresh = () => load();
    window.addEventListener('dealmaster:operational-data-updated', refresh);
    return () => window.removeEventListener('dealmaster:operational-data-updated', refresh);
  }, []);

  const now = new Date();
  const prefix = format(now, 'yyyy-MM');
  const monthSales = useMemo(() => sales.filter(s => s.saleDate?.startsWith(prefix)), [sales, prefix]);
  const sellerNames = useMemo(() => Array.from(new Set(monthSales.map(s => s.seller).filter(Boolean))).sort(), [monthSales]);
  const visibleSales = selectedSeller === 'all' ? monthSales : monthSales.filter(s => s.seller === selectedSeller);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = endOfMonth(now);
  const workDays = eachDayOfInterval({ start: monthStart, end: monthEnd }).filter(d => isWorkingDay(d, performance.holidays));
  const elapsed = workDays.filter(d => !isAfter(d, now));
  const remaining = workDays.filter(d => isAfter(d, now));
  const goal = selectedSeller === 'all' ? performance.monthlyGoal : performance.sellerMonthlyGoal;
  const actual = visibleSales.length;
  const expected = goal * elapsed.length / Math.max(workDays.length, 1);
  const projection = Math.round(actual / Math.max(elapsed.length, 1) * Math.max(workDays.length, 1));
  const missing = Math.max(goal - actual, 0);
  const dailyNeeded = missing / Math.max(remaining.length, 1);

  const invoice = visibleSales.reduce((s, i) => s + (Number(i.invoiceValue) || 0), 0);
  const marginValue = visibleSales.reduce((s, i) => s + (Number(i.marginValue) || 0), 0);
  const margin = invoice ? marginValue / invoice * 100 : 0;
  const captureKnown = visibleSales.filter(s => typeof s.hasTradeIn === 'boolean');
  const capture = captureKnown.length ? captureKnown.filter(s => s.hasTradeIn).length / captureKnown.length * 100 : null;

  const stockValue = stock.reduce((s, i) => s + (Number(i.cost) || 0), 0);
  const aged = stock.filter(i => Number(i.stockDays) > 60);
  const critical = stock.filter(i => Number(i.stockDays) > 90);
  const criticalValue = critical.reduce((s, i) => s + (Number(i.cost) || 0), 0);

  const sellerPerformance = useMemo(() => sellerNames.map(name => {
    const items = monthSales.filter(s => s.seller === name);
    const sellerInvoice = items.reduce((s, i) => s + (Number(i.invoiceValue) || 0), 0);
    const sellerMarginValue = items.reduce((s, i) => s + (Number(i.marginValue) || 0), 0);
    const known = items.filter(s => typeof s.hasTradeIn === 'boolean');
    const sellerCapture = known.length ? known.filter(s => s.hasTradeIn).length / known.length * 100 : null;
    const sellerProjection = Math.round(items.length / Math.max(elapsed.length, 1) * Math.max(workDays.length, 1));
    const sellerMargin = sellerInvoice ? sellerMarginValue / sellerInvoice * 100 : 0;
    const needsAction = sellerProjection < performance.sellerMonthlyGoal || (sellerCapture !== null && sellerCapture < performance.sellerCaptureGoal) || (items.length > 0 && sellerMargin < performance.healthyMargin);
    return { name, count: items.length, projection: sellerProjection, margin: sellerMargin, capture: sellerCapture, needsAction };
  }).sort((a,b) => Number(b.needsAction)-Number(a.needsAction) || a.projection-b.projection), [sellerNames, monthSales, elapsed.length, workDays.length, performance]);

  const sellersNeedingAction = sellerPerformance.filter(s => s.needsAction).length;
  const visibleDeals = selectedSeller === 'all' ? history : history.filter(h => h.userName === selectedSeller);
  const openDeals = visibleDeals.filter(h => h.data.dealStatus !== 'closed');

  const diagnosis = useMemo(() => {
    if (!monthSales.length && !stock.length) return { tone: 'neutral', title: 'Aguardando dados da loja', text: 'Importe estoque e faturamentos para iniciar a gestão operacional.' };
    if (projection < goal) return { tone: 'warning', title: `${Math.max(Math.round(expected-actual),0)} carro(s) atrás do ritmo`, text: `Projeção ${projection}/${goal}. A operação precisa de ${dailyNeeded.toFixed(1)} carro(s) por dia trabalhado restante.` };
    if (sellersNeedingAction > 0) return { tone: 'warning', title: `${sellersNeedingAction} vendedor(es) precisam de ação`, text: 'Abra a performance individual e ataque primeiro quem está abaixo da projeção, captura ou margem.' };
    if (critical.length) return { tone: 'warning', title: `${critical.length} carro(s) acima de 90 dias`, text: `${formatCurrency(criticalValue)} de capital está na faixa crítica de estoque.` };
    return { tone: 'good', title: 'Operação dentro do ritmo', text: `Projeção ${projection}, margem ${margin.toFixed(1)}% e equipe acompanhada.` };
  }, [monthSales.length, stock.length, projection, goal, expected, actual, dailyNeeded, sellersNeedingAction, critical.length, criticalValue, margin]);

  return <div className="pb-24 md:pb-12 space-y-6 md:space-y-8 animate-fade-in">
    <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div><p className="text-sm text-zinc-500">Visão do gestor</p><h2 className="mt-1 text-3xl font-semibold tracking-tight text-white md:text-4xl">Bom dia, {currentUser.name.split(' ')[0]}.</h2><p className="mt-2 text-zinc-400">Loja, equipe, margem, negociações e estoque em uma única leitura.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={load} className="flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-300"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/> Atualizar</button><select value={selectedSeller} onChange={e=>setSelectedSeller(e.target.value)} className="h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-200 outline-none"><option value="all" className="bg-zinc-900">Toda equipe</option>{sellerNames.map(name=><option key={name} value={name} className="bg-zinc-900">{name}</option>)}</select></div>
    </section>

    <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-6 md:p-8"><div className="grid gap-7 lg:grid-cols-[1.25fr_.75fr] lg:items-end"><div><div className="mb-5 flex items-center gap-2 text-sm text-zinc-400"><Target size={16}/> {selectedSeller==='all'?'Faturômetro da loja':`Meta de ${selectedSeller}`}</div><div className="flex items-end gap-3"><span className="text-6xl font-semibold tracking-[-0.06em] text-white md:text-7xl">{actual}</span><span className="pb-2 text-xl text-zinc-500">de {goal}</span></div><div className="mt-6 h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white" style={{width:`${Math.min(actual/Math.max(goal,1)*100,100)}%`}}/></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Mini label="Esperado hoje" value={expected.toFixed(1)}/><Mini label="Projeção" value={`${projection}`}/><Mini label="Faltam" value={`${missing}`}/><Mini label="Ritmo necessário" value={`${dailyNeeded.toFixed(1)}/dia`}/></div></div><button onClick={onStartNewCalculation} className="flex min-h-24 items-center justify-between rounded-[26px] bg-white px-5 py-5 text-left text-black"><div><span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Negociação</span><span className="block text-lg font-semibold">Abrir calculadora</span><span className="mt-1 block text-sm text-zinc-500">Apoio comercial separado do resultado oficial.</span></div><div className="grid h-11 w-11 place-items-center rounded-full bg-black text-white"><ArrowRight size={20}/></div></button></div></section>

    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Metric icon={<TrendingUp size={18}/>} label="Faturamento" value={formatCurrency(invoice)} hint={`${actual} veículo(s)`}/><Metric icon={<WalletCards size={18}/>} label="Margem real" value={`${margin.toFixed(1)}%`} hint={formatCurrency(marginValue)}/><Metric icon={<CarFront size={18}/>} label="Estoque" value={`${stock.length}`} hint={`${aged.length} acima de 60 dias`}/><Metric icon={<Users size={18}/>} label="Equipe em atenção" value={`${sellersNeedingAction}`} hint={`${openDeals.length} negociações abertas`}/></section>

    <section className={`rounded-[30px] border p-6 ${diagnosis.tone==='good'?'border-emerald-500/20 bg-emerald-500/[0.07]':diagnosis.tone==='warning'?'border-amber-400/20 bg-amber-400/[0.07]':'border-white/10 bg-white/[0.04]'}`}><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Prioridade do gestor</p><h3 className="mt-2 text-xl font-semibold text-white">{diagnosis.title}</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{diagnosis.text}</p></section>

    <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Equipe</p><h3 className="mt-1 text-xl font-semibold text-white">Quem precisa de ação hoje</h3></div><div className="grid gap-3 lg:grid-cols-2">{sellerPerformance.length===0?<Empty text="Importe os faturamentos para montar a performance da equipe."/>:sellerPerformance.map(s=><button key={s.name} onClick={()=>setSelectedSeller(s.name)} className="rounded-[22px] border border-white/10 bg-black/20 p-4 text-left"><div className="flex items-center justify-between"><div><p className="font-medium text-white">{s.name}</p><p className="mt-1 text-xs text-zinc-500">{s.count}/{performance.sellerMonthlyGoal} · projeção {s.projection}</p></div><span className={`h-3 w-3 rounded-full ${s.needsAction?'bg-amber-400':'bg-emerald-400'}`}/></div><div className="mt-4 grid grid-cols-2 gap-2"><Small label="Margem" value={`${s.margin.toFixed(1)}%`}/><Small label="Captura" value={s.capture===null?'Não informada':`${s.capture.toFixed(0)}%`}/></div></button>)}</div></section>

    <section className="grid gap-4 xl:grid-cols-2"><div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Capital</p><h3 className="mt-1 text-xl font-semibold text-white">Estoque crítico</h3><div className="mt-5 grid grid-cols-2 gap-3"><Small label="Capital total" value={formatCurrency(stockValue)}/><Small label="Capital +90d" value={formatCurrency(criticalValue)}/><Small label="+60 dias" value={`${aged.length}`}/><Small label="+90 dias" value={`${critical.length}`}/></div></div><div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Negociações</p><h3 className="mt-1 text-xl font-semibold text-white">Abertas da equipe</h3><div className="mt-4 space-y-2">{openDeals.length===0?<Empty text="Nenhuma negociação aberta neste filtro."/>:openDeals.slice(0,8).map(d=><div key={d.id} className="flex items-center justify-between rounded-2xl bg-black/20 p-3"><div><p className="text-sm font-medium text-white">{d.data.licensePlate || 'Sem placa'}</p><p className="mt-1 text-xs text-zinc-500">{d.userName || 'Sem vendedor'}</p></div><span className="text-xs text-amber-400">aberta</span></div>)}</div></div></section>

    {capture!==null && <p className="text-xs text-zinc-600">Captura do filtro atual: {capture.toFixed(0)}%.</p>}
  </div>;
};

const Mini=({label,value}:{label:string;value:string})=><div className="rounded-2xl bg-white/[0.055] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">{label}</p><p className="mt-1 text-lg font-semibold text-white">{value}</p></div>;
const Metric=({icon,label,value,hint}:{icon:React.ReactNode;label:string;value:string;hint:string})=><div className="min-h-36 rounded-[26px] border border-white/10 bg-white/[0.035] p-5"><div className="mb-5 grid h-9 w-9 place-items-center rounded-2xl bg-white/[0.06] text-zinc-300">{icon}</div><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-zinc-600">{hint}</p></div>;
const Small=({label,value}:{label:string;value:string})=><div className="rounded-xl bg-white/[0.04] p-2.5"><p className="text-[9px] uppercase tracking-wide text-zinc-600">{label}</p><p className="mt-1 truncate text-sm font-semibold text-zinc-200">{value}</p></div>;
const Empty=({text}:{text:string})=><div className="col-span-full rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-600">{text}</div>;

export default Dashboard;
