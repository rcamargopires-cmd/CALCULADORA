import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BarChart3, CarFront, RefreshCw, Target, TrendingUp, Users, WalletCards, Repeat2 } from 'lucide-react';
import { eachDayOfInterval, endOfMonth, format, isAfter } from 'date-fns';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { CommissionConfig, OperationalPerformanceSeller, OperationalPerformanceSnapshot, OperationalStockItem, SavedCalculation, User } from '../types';
import { formatCurrency } from '../utils/currency';
import { normalize, operationalDataService } from '../services/operationalDataService';
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
const pct = (value: number | null | undefined) => `${Number(value || 0).toFixed(1)}%`;

const Dashboard: React.FC<DashboardProps> = (props) => {
  const isSeller = props.currentUser.role === 'seller' || props.currentUser.role === 'user';
  if (isSeller) return <SellerDashboard currentUser={props.currentUser} history={props.history} onStartNewCalculation={props.onStartNewCalculation}/>;
  return <ManagerDashboard {...props}/>;
};

const ManagerDashboard: React.FC<DashboardProps> = ({ history, users, currentUser, onStartNewCalculation }) => {
  const [stock, setStock] = useState<OperationalStockItem[]>([]);
  const [snapshot, setSnapshot] = useState<OperationalPerformanceSnapshot | null>(null);
  const [performance, setPerformance] = useState<PerformanceConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [selectedSeller, setSelectedSeller] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const [stockData, performanceData, perf] = await Promise.all([
        operationalDataService.getLatestStock(),
        operationalDataService.getLatestPerformance(),
        getDoc(doc(db, 'config/performance')),
      ]);
      setStock(stockData);
      setSnapshot(performanceData);
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

  const sellers = snapshot?.sellers || [];
  const selected = selectedSeller === 'all' ? null : sellers.find(s => s.sellerKey === selectedSeller) || null;

  const total = useMemo<OperationalPerformanceSeller | null>(() => {
    if (snapshot?.total) return snapshot.total;
    if (!sellers.length) return null;
    const sum = (key: keyof OperationalPerformanceSeller) => sellers.reduce((acc, item) => acc + Number(item[key] || 0), 0);
    const salesBase = sum('closing');
    return {
      seller: 'TOTAL', sellerKey: 'total', passages: sum('passages'), orders: sum('orders'), flowTotal: sum('flowTotal'), orderPercent: 0,
      workInPeriod: sum('workInPeriod'), avgContactsPerDay: 0, evaluations: sum('evaluations'), evaluationRate: 0, closing: salesBase,
      syonetSales: sum('syonetSales'), closingPercent: 0, marginPerCar: salesBase ? sum('marginTotal') / salesBase : 0, marginTotal: sum('marginTotal'),
      marginPercent: salesBase ? sellers.reduce((acc, item) => acc + item.marginPercent * item.closing, 0) / salesBase : 0,
      captureQty: sum('captureQty'), capturePercent: salesBase ? sum('captureQty') / salesBase * 100 : 0,
      pipeline: sum('pipeline'), projection: sum('projection'), additionalPurchase: sum('additionalPurchase'),
    };
  }, [snapshot, sellers]);

  const current = selected || total;
  const selectedUser = selected ? users.find(u => normalize(u.name || '') === selected.sellerKey) : undefined;
  const goal = selected ? (selectedUser?.goals?.monthly ?? performance.sellerMonthlyGoal) : performance.monthlyGoal;
  const captureGoal = selected ? (selectedUser?.goals?.capture ?? performance.sellerCaptureGoal) : performance.captureGoal;
  const marginGoal = selected ? (selectedUser?.goals?.margin ?? performance.healthyMargin) : performance.healthyMargin;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = endOfMonth(now);
  const workDays = eachDayOfInterval({ start: monthStart, end: monthEnd }).filter(d => isWorkingDay(d, performance.holidays));
  const elapsed = workDays.filter(d => !isAfter(d, now));
  const remaining = workDays.filter(d => isAfter(d, now));

  // REGRA DEALMASTER: o volume oficial de vendas vem da coluna "Fechamento" do Mapa de Indicadores.
  const actual = Number(current?.closing || 0);
  const expected = goal * elapsed.length / Math.max(workDays.length, 1);
  const projection = Number(current?.projection || 0);
  const missing = Math.max(goal - actual, 0);
  const dailyNeeded = missing / Math.max(remaining.length, 1);
  const margin = Number(current?.marginPercent || 0);
  const marginValue = Number(current?.marginTotal || 0);
  const capture = Number(current?.capturePercent || 0);
  const evaluations = Number(current?.evaluations || 0);
  const closingRate = Number(current?.closingPercent || 0);
  const passages = Number(current?.passages || 0);

  const stockValue = stock.reduce((s, i) => s + (Number(i.cost) || 0), 0);
  const aged = stock.filter(i => Number(i.stockDays) > 60);
  const critical = stock.filter(i => Number(i.stockDays) > 90);
  const criticalValue = critical.reduce((s, i) => s + (Number(i.cost) || 0), 0);

  const sellerPerformance = useMemo(() => sellers.map(s => {
    const user = users.find(u => normalize(u.name || '') === s.sellerKey);
    const sellerGoal = user?.goals?.monthly ?? performance.sellerMonthlyGoal;
    const sellerCaptureGoal = user?.goals?.capture ?? performance.sellerCaptureGoal;
    const sellerMarginGoal = user?.goals?.margin ?? performance.healthyMargin;
    const needsAction = s.projection < sellerGoal || s.capturePercent < sellerCaptureGoal || (s.closing > 0 && s.marginPercent < sellerMarginGoal);
    return { ...s, sellerGoal, needsAction };
  }).sort((a, b) => Number(b.needsAction) - Number(a.needsAction) || a.projection - b.projection), [sellers, users, performance]);

  const sellersNeedingAction = sellerPerformance.filter(s => s.needsAction).length;
  const visibleDeals = selected ? history.filter(h => normalize(h.userName || '') === selected.sellerKey) : history;
  const openDeals = visibleDeals.filter(h => h.data.dealStatus !== 'closed');

  const diagnosis = useMemo(() => {
    if (!snapshot && !stock.length) return { tone: 'neutral', title: 'Aguardando dados da loja', text: 'Importe o estoque e o Mapa de Performance para iniciar a leitura operacional.' };
    if (!snapshot) return { tone: 'neutral', title: 'Estoque atualizado. Falta a performance.', text: 'O estoque já está disponível, mas ainda não há um Mapa de Performance reconhecido.' };
    if (projection < goal) return { tone: 'warning', title: `Projeção ${projection.toFixed(1)} para uma meta de ${goal}`, text: `Faltam ${missing.toFixed(0)} venda(s). Ritmo necessário: ${dailyNeeded.toFixed(2)} por dia trabalhado restante.` };
    if (capture < captureGoal) return { tone: 'warning', title: `Captura em ${capture.toFixed(1)}%`, text: `A meta é ${captureGoal}%. Priorize oportunidades com troca para recuperar o indicador.` };
    if (actual > 0 && margin < marginGoal) return { tone: 'warning', title: `Margem em ${margin.toFixed(1)}%`, text: `A meta é ${marginGoal}%. Proteja rentabilidade nas próximas negociações.` };
    if (critical.length) return { tone: 'warning', title: `${critical.length} carro(s) acima de 90 dias`, text: `${formatCurrency(criticalValue)} de capital está na faixa crítica de estoque.` };
    return { tone: 'good', title: 'Operação dentro do ritmo', text: `Projeção ${projection.toFixed(1)}, margem ${margin.toFixed(1)}% e captura ${capture.toFixed(1)}%.` };
  }, [snapshot, stock.length, projection, goal, missing, dailyNeeded, capture, captureGoal, actual, margin, marginGoal, critical.length, criticalValue]);

  return <div className="pb-24 md:pb-12 space-y-6 md:space-y-8 animate-fade-in">
    <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div><p className="text-sm text-zinc-500">Command Center · {snapshot ? `Mapa ${snapshot.sheetName} · ${snapshot.referenceDate}` : 'sem mapa'}</p><h2 className="mt-1 text-3xl font-semibold tracking-tight text-white md:text-4xl">Bom dia, {currentUser.name.split(' ')[0]}.</h2><p className="mt-2 text-zinc-400">Dados reais de performance, equipe e estoque em uma única leitura.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={load} className="flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-300"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/> Atualizar</button><select value={selectedSeller} onChange={e => setSelectedSeller(e.target.value)} className="h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-200 outline-none"><option value="all" className="bg-zinc-900">Toda equipe</option>{sellers.map(s => <option key={s.sellerKey} value={s.sellerKey} className="bg-zinc-900">{s.seller}</option>)}</select></div>
    </section>

    <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-6 md:p-8"><div className="grid gap-7 lg:grid-cols-[1.25fr_.75fr] lg:items-end"><div><div className="mb-5 flex items-center gap-2 text-sm text-zinc-400"><Target size={16}/> {selected ? `GoalTrack · ${selected.seller}` : 'GoalTrack · Loja'}</div><div className="flex items-end gap-3"><span className="text-6xl font-semibold tracking-[-0.06em] text-white md:text-7xl">{actual}</span><span className="pb-2 text-xl text-zinc-500">de {goal}</span></div><div className="mt-6 h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white" style={{ width: `${Math.min(actual / Math.max(goal, 1) * 100, 100)}%` }}/></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Mini label="Esperado hoje" value={expected.toFixed(1)}/><Mini label="Projeção do mapa" value={projection.toFixed(1)}/><Mini label="Faltam" value={missing.toFixed(0)}/><Mini label="Ritmo necessário" value={`${dailyNeeded.toFixed(2)}/dia`}/></div></div><button onClick={onStartNewCalculation} className="flex min-h-24 items-center justify-between rounded-[26px] bg-white px-5 py-5 text-left text-black"><div><span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">DealGuard</span><span className="block text-lg font-semibold">Nova negociação</span><span className="mt-1 block text-sm text-zinc-500">Proteja a margem antes de fechar.</span></div><div className="grid h-11 w-11 place-items-center rounded-full bg-black text-white"><ArrowRight size={20}/></div></button></div></section>

    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Metric icon={<TrendingUp size={18}/>} label="Vendas" value={`${actual}`} hint={`Projeção ${projection.toFixed(1)}`}/><Metric icon={<WalletCards size={18}/>} label="Margem MC" value={pct(margin)} hint={formatCurrency(marginValue)}/><Metric icon={<Repeat2 size={18}/>} label="Captura" value={pct(capture)} hint={`${Number(current?.captureQty || 0)} captura(s)`}/><Metric icon={<CarFront size={18}/>} label="Estoque atual" value={`${stock.length}`} hint={`${aged.length} acima de 60 dias`}/></section>

    <section className={`rounded-[30px] border p-6 ${diagnosis.tone === 'good' ? 'border-emerald-500/20 bg-emerald-500/[0.07]' : diagnosis.tone === 'warning' ? 'border-amber-400/20 bg-amber-400/[0.07]' : 'border-white/10 bg-white/[0.04]'}`}><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Prioridade do gestor</p><h3 className="mt-2 text-xl font-semibold text-white">{diagnosis.title}</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{diagnosis.text}</p></section>

    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Metric icon={<BarChart3 size={18}/>} label="Avaliações" value={`${evaluations}`} hint={`${passages} passagens`}/><Metric icon={<Target size={18}/>} label="Taxa de fechamento" value={pct(closingRate)} hint={`${actual} venda(s)`}/><Metric icon={<Users size={18}/>} label="Equipe em atenção" value={`${sellersNeedingAction}`} hint={`${openDeals.length} negociações abertas`}/><Metric icon={<WalletCards size={18}/>} label="Capital em estoque" value={formatCurrency(stockValue)} hint={`${critical.length} acima de 90 dias`}/></section>

    <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Performance Hub</p><h3 className="mt-1 text-xl font-semibold text-white">Equipe · dados do mapa</h3></div><div className="grid gap-3 lg:grid-cols-2">{sellerPerformance.length === 0 ? <Empty text="Importe o Mapa de Performance para montar a equipe."/> : sellerPerformance.map(s => <button key={s.sellerKey} onClick={() => setSelectedSeller(s.sellerKey)} className="rounded-[22px] border border-white/10 bg-black/20 p-4 text-left"><div className="flex items-center justify-between"><div><p className="font-medium text-white">{s.seller}</p><p className="mt-1 text-xs text-zinc-500">{s.closing}/{s.sellerGoal} vendas · projeção {s.projection.toFixed(1)}</p></div><span className={`h-3 w-3 rounded-full ${s.needsAction ? 'bg-amber-400' : 'bg-emerald-400'}`}/></div><div className="mt-4 grid grid-cols-4 gap-2"><Small label="MC" value={pct(s.marginPercent)}/><Small label="Captura" value={pct(s.capturePercent)}/><Small label="Avaliações" value={`${s.evaluations}`}/><Small label="Fechamento" value={pct(s.closingPercent)}/></div></button>)}</div></section>

    <section className="grid gap-4 xl:grid-cols-2"><div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Stock Intelligence</p><h3 className="mt-1 text-xl font-semibold text-white">Estoque crítico</h3><div className="mt-5 grid grid-cols-2 gap-3"><Small label="Capital total" value={formatCurrency(stockValue)}/><Small label="Capital +90d" value={formatCurrency(criticalValue)}/><Small label="+60 dias" value={`${aged.length}`}/><Small label="+90 dias" value={`${critical.length}`}/></div></div><div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Negociações</p><h3 className="mt-1 text-xl font-semibold text-white">Abertas da equipe</h3><div className="mt-4 space-y-2">{openDeals.length === 0 ? <Empty text="Nenhuma negociação aberta neste filtro."/> : openDeals.slice(0, 8).map(d => <div key={d.id} className="flex items-center justify-between rounded-2xl bg-black/20 p-3"><div><p className="text-sm font-medium text-white">{d.data.licensePlate || 'Sem placa'}</p><p className="mt-1 text-xs text-zinc-500">{d.userName || 'Sem vendedor'}</p></div><span className="text-xs text-amber-400">aberta</span></div>)}</div></div></section>
  </div>;
};

const Mini = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl bg-white/[0.055] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">{label}</p><p className="mt-1 text-lg font-semibold text-white">{value}</p></div>;
const Metric = ({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) => <div className="rounded-[26px] border border-white/10 bg-white/[0.035] p-5"><div className="mb-5 grid h-9 w-9 place-items-center rounded-2xl bg-white/[0.06] text-zinc-300">{icon}</div><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-zinc-600">{hint}</p></div>;
const Small = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl bg-white/[0.045] p-3"><p className="text-[10px] uppercase tracking-[0.1em] text-zinc-600">{label}</p><p className="mt-1 text-sm font-semibold text-zinc-200">{value}</p></div>;
const Empty = ({ text }: { text: string }) => <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-600">{text}</p>;

export default Dashboard;
