import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, BarChart3, CarFront, CheckCircle2, ChevronRight, CircleAlert, RefreshCw, Target, TrendingUp, Users, WalletCards, Repeat2 } from 'lucide-react';
import { eachDayOfInterval, endOfMonth, format, isAfter } from 'date-fns';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { CommissionConfig, OperationalPerformanceSeller, OperationalPerformanceSnapshot, OperationalStockItem, SavedCalculation, User } from '../types';
import { formatCurrency } from '../utils/currency';
import { normalize, operationalDataService } from '../services/operationalDataService';
import SellerDashboard from './SellerDashboard';
import SellerPerformanceDetail from './SellerPerformanceDetail';

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

type ActionTone = 'critical' | 'attention' | 'good';
type ActionItem = {
  tone: ActionTone;
  title: string;
  text: string;
  metric?: string;
  sellerKey?: string;
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

// O arquivo do mapa calcula % FECHAMENTO = Fechamento / Fluxo Total.
// Esta camada também corrige snapshots antigos gravados quando as duas colunas colidiram.
const officialClosingRate = (item: OperationalPerformanceSeller | null | undefined) => {
  if (!item) return 0;
  const flow = Number(item.flowTotal || 0);
  const rawRate = Number(item.closingPercent || 0);
  const rawClosing = Number(item.closing || 0);

  if (flow > 0 && rawRate > 0 && rawRate <= 2 && Math.abs(rawRate - rawClosing) < 0.000001) {
    return rawRate * 100;
  }
  return rawRate;
};

const officialClosingCount = (item: OperationalPerformanceSeller | null | undefined) => {
  if (!item) return 0;
  const flow = Number(item.flowTotal || 0);
  const rate = officialClosingRate(item);
  if (flow > 0 && Number.isFinite(rate)) {
    const derived = (rate / 100) * flow;
    const rounded = Math.round(derived);
    return Math.abs(derived - rounded) < 0.02 ? rounded : Number(derived.toFixed(2));
  }
  return Number(item.closing || 0);
};

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
  const [focusedSellerKey, setFocusedSellerKey] = useState<string | null>(null);

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
    const closingTotal = sellers.reduce((acc, item) => acc + officialClosingCount(item), 0);
    const flowTotal = sum('flowTotal');
    const marginBase = closingTotal || 1;
    return {
      seller: 'TOTAL', sellerKey: 'total', passages: sum('passages'), orders: sum('orders'), flowTotal, orderPercent: 0,
      workInPeriod: sum('workInPeriod'), avgContactsPerDay: 0, evaluations: sum('evaluations'), evaluationRate: 0, closing: closingTotal,
      syonetSales: sum('syonetSales'), closingPercent: flowTotal ? closingTotal / flowTotal * 100 : 0,
      marginPerCar: sum('marginTotal') / marginBase, marginTotal: sum('marginTotal'),
      marginPercent: closingTotal ? sellers.reduce((acc, item) => acc + item.marginPercent * officialClosingCount(item), 0) / closingTotal : 0,
      captureQty: sum('captureQty'), capturePercent: closingTotal ? sum('captureQty') / closingTotal * 100 : 0,
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

  const actual = officialClosingCount(current);
  const expected = goal * elapsed.length / Math.max(workDays.length, 1);
  const projection = Number(current?.projection || 0);
  const missing = Math.max(goal - actual, 0);
  const dailyNeeded = missing / Math.max(remaining.length, 1);
  const margin = Number(current?.marginPercent || 0);
  const marginValue = Number(current?.marginTotal || 0);
  const capture = Number(current?.capturePercent || 0);
  const evaluations = Number(current?.evaluations || 0);
  const closingRate = officialClosingRate(current);
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
    const sales = officialClosingCount(s);
    const closingRate = officialClosingRate(s);
    const needsAction = s.projection < sellerGoal || s.capturePercent < sellerCaptureGoal || (sales > 0 && s.marginPercent < sellerMarginGoal);
    return { ...s, officialSales: sales, officialClosingRate: closingRate, sellerGoal, sellerCaptureGoal, sellerMarginGoal, needsAction };
  }).sort((a, b) => Number(b.needsAction) - Number(a.needsAction) || a.projection - b.projection), [sellers, users, performance]);

  const sellersNeedingAction = sellerPerformance.filter(s => s.needsAction).length;
  const focusedSeller = focusedSellerKey ? sellerPerformance.find(s => s.sellerKey === focusedSellerKey) || null : null;
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

  const actionItems = useMemo<ActionItem[]>(() => {
    if (!snapshot) return [{ tone: 'attention', title: 'Importar Mapa de Performance', text: 'Sem o mapa, o Action Center não consegue organizar prioridades comerciais.' }];

    const items: ActionItem[] = [];

    if (projection < goal) {
      items.push({ tone: 'critical', title: 'Recuperar o ritmo da loja', text: `Projeção ${projection.toFixed(1)} para meta ${goal}. Faltam ${missing.toFixed(0)} venda(s).`, metric: `${dailyNeeded.toFixed(2)}/dia` });
    }
    if (capture < captureGoal) {
      items.push({ tone: 'attention', title: 'Recuperar captura', text: `A loja está em ${capture.toFixed(1)}% e a meta é ${captureGoal}%. Priorize negócios com troca.`, metric: `${(captureGoal - capture).toFixed(1)} p.p.` });
    }
    if (actual > 0 && margin < marginGoal) {
      items.push({ tone: 'attention', title: 'Proteger margem', text: `MC atual em ${margin.toFixed(1)}% para uma meta de ${marginGoal}%.`, metric: `${(marginGoal - margin).toFixed(1)} p.p.` });
    }
    if (critical.length > 0) {
      items.push({ tone: 'critical', title: 'Atacar estoque +90 dias', text: `${critical.length} veículo(s) somam ${formatCurrency(criticalValue)} na faixa crítica.`, metric: `${critical.length} carros` });
    }

    if (!selected) {
      sellerPerformance.forEach(s => {
        if (s.projection < s.sellerGoal) {
          items.push({ tone: 'critical', title: `${s.seller}: recuperar projeção`, text: `${s.officialSales}/${s.sellerGoal} vendas e projeção ${s.projection.toFixed(1)}.`, metric: `${Math.max(s.sellerGoal - s.officialSales, 0)} faltam`, sellerKey: s.sellerKey });
        } else if (s.capturePercent < s.sellerCaptureGoal) {
          items.push({ tone: 'attention', title: `${s.seller}: aumentar captura`, text: `Captura em ${s.capturePercent.toFixed(1)}% para meta de ${s.sellerCaptureGoal}%.`, metric: `${(s.sellerCaptureGoal - s.capturePercent).toFixed(1)} p.p.`, sellerKey: s.sellerKey });
        } else if (s.officialSales > 0 && s.marginPercent < s.sellerMarginGoal) {
          items.push({ tone: 'attention', title: `${s.seller}: proteger margem`, text: `MC em ${s.marginPercent.toFixed(1)}% para meta de ${s.sellerMarginGoal}%.`, metric: `${(s.sellerMarginGoal - s.marginPercent).toFixed(1)} p.p.`, sellerKey: s.sellerKey });
        } else if (s.flowTotal > 0 && s.evaluations === 0) {
          items.push({ tone: 'attention', title: `${s.seller}: gerar avaliações`, text: `${s.flowTotal} oportunidade(s) no fluxo e nenhuma avaliação registrada.`, metric: '0 avaliações', sellerKey: s.sellerKey });
        }
      });
    }

    if (!items.length) items.push({ tone: 'good', title: 'Operação equilibrada', text: 'Os principais indicadores estão dentro das metas. Mantenha ritmo, margem e disciplina comercial.', metric: 'No ritmo' });

    const priority: Record<ActionTone, number> = { critical: 0, attention: 1, good: 2 };
    return items.sort((a, b) => priority[a.tone] - priority[b.tone]).slice(0, 5);
  }, [snapshot, projection, goal, missing, dailyNeeded, capture, captureGoal, actual, margin, marginGoal, critical.length, criticalValue, selected, sellerPerformance]);

  return <div className="pb-24 md:pb-12 space-y-6 md:space-y-8 animate-fade-in">
    <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div><p className="text-sm text-zinc-500">Command Center · {snapshot ? `Mapa ${snapshot.sheetName} · ${snapshot.referenceDate}` : 'sem mapa'}</p><h2 className="mt-1 text-3xl font-semibold tracking-tight text-white md:text-4xl">Bom dia, {currentUser.name.split(' ')[0]}.</h2><p className="mt-2 text-zinc-400">Dados reais de performance, equipe e estoque em uma única leitura.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={load} className="flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-300"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/> Atualizar</button><select value={selectedSeller} onChange={e => setSelectedSeller(e.target.value)} className="h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-200 outline-none"><option value="all" className="bg-zinc-900">Toda equipe</option>{sellers.map(s => <option key={s.sellerKey} value={s.sellerKey} className="bg-zinc-900">{s.seller}</option>)}</select></div>
    </section>

    <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-6 md:p-8"><div className="grid gap-7 lg:grid-cols-[1.25fr_.75fr] lg:items-end"><div><div className="mb-5 flex items-center gap-2 text-sm text-zinc-400"><Target size={16}/> {selected ? `GoalTrack · ${selected.seller}` : 'GoalTrack · Loja'}</div><div className="flex items-end gap-3"><span className="text-6xl font-semibold tracking-[-0.06em] text-white md:text-7xl">{actual}</span><span className="pb-2 text-xl text-zinc-500">de {goal}</span></div><div className="mt-6 h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white" style={{ width: `${Math.min(actual / Math.max(goal, 1) * 100, 100)}%` }}/></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Mini label="Esperado hoje" value={expected.toFixed(1)}/><Mini label="Projeção do mapa" value={projection.toFixed(1)}/><Mini label="Faltam" value={missing.toFixed(0)}/><Mini label="Ritmo necessário" value={`${dailyNeeded.toFixed(2)}/dia`}/></div></div><button onClick={onStartNewCalculation} className="flex min-h-24 items-center justify-between rounded-[26px] bg-white px-5 py-5 text-left text-black"><div><span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">DealGuard</span><span className="block text-lg font-semibold">Nova negociação</span><span className="mt-1 block text-sm text-zinc-500">Proteja a margem antes de fechar.</span></div><div className="grid h-11 w-11 place-items-center rounded-full bg-black text-white"><ArrowRight size={20}/></div></button></div></section>

    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Metric icon={<TrendingUp size={18}/>} label="Vendas" value={`${actual}`} hint={`Projeção ${projection.toFixed(1)}`}/><Metric icon={<WalletCards size={18}/>} label="Margem MC" value={pct(margin)} hint={formatCurrency(marginValue)}/><Metric icon={<Repeat2 size={18}/>} label="Captura" value={pct(capture)} hint={`${Number(current?.captureQty || 0)} captura(s)`}/><Metric icon={<CarFront size={18}/>} label="Estoque atual" value={`${stock.length}`} hint={`${aged.length} acima de 60 dias`}/></section>

    <section className={`rounded-[30px] border p-6 ${diagnosis.tone === 'good' ? 'border-emerald-500/20 bg-emerald-500/[0.07]' : diagnosis.tone === 'warning' ? 'border-amber-400/20 bg-amber-400/[0.07]' : 'border-white/10 bg-white/[0.04]'}`}><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Prioridade do gestor</p><h3 className="mt-2 text-xl font-semibold text-white">{diagnosis.title}</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{diagnosis.text}</p></section>

    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Metric icon={<BarChart3 size={18}/>} label="Avaliações" value={`${evaluations}`} hint={`${passages} passagens`}/><Metric icon={<Target size={18}/>} label="Taxa de fechamento" value={pct(closingRate)} hint={`${actual} fechamento(s)`}/><Metric icon={<Users size={18}/>} label="Equipe em atenção" value={`${sellersNeedingAction}`} hint={`${openDeals.length} negociações abertas`}/><Metric icon={<WalletCards size={18}/>} label="Capital em estoque" value={formatCurrency(stockValue)} hint={`${critical.length} acima de 90 dias`}/></section>

    <section className="rounded-[30px] border border-white/10 bg-gradient-to-br from-white/[0.055] to-white/[0.025] p-5 md:p-7">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between"><div><div className="flex items-center gap-2 text-zinc-500"><Activity size={16}/><p className="text-xs font-semibold uppercase tracking-[0.14em]">Action Center</p></div><h3 className="mt-1 text-xl font-semibold text-white">O que merece ação hoje</h3></div><p className="text-xs text-zinc-600">Prioridades ordenadas por impacto operacional</p></div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">{actionItems.map((item, index) => <ActionCard key={`${item.title}-${index}`} item={item} onOpenSeller={item.sellerKey ? () => setFocusedSellerKey(item.sellerKey || null) : undefined}/>)}</div>
    </section>

    <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Performance Hub</p><h3 className="mt-1 text-xl font-semibold text-white">Equipe · dados do mapa</h3></div><p className="hidden text-xs text-zinc-600 md:block">Clique no vendedor para abrir a análise completa</p></div><div className="grid gap-3 lg:grid-cols-2">{sellerPerformance.length === 0 ? <Empty text="Importe o Mapa de Performance para montar a equipe."/> : sellerPerformance.map(s => <button key={s.sellerKey} onClick={() => setFocusedSellerKey(s.sellerKey)} className="group rounded-[24px] border border-white/10 bg-black/20 p-4 text-left transition hover:border-white/20 hover:bg-white/[0.045]"><div className="flex items-center justify-between gap-4"><div><div className="flex items-center gap-2"><p className="font-medium text-white">{s.seller}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.needsAction ? 'bg-amber-400/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{s.needsAction ? 'Ação' : 'No ritmo'}</span></div><p className="mt-1 text-xs text-zinc-500">{s.officialSales}/{s.sellerGoal} vendas · projeção {s.projection.toFixed(1)}</p></div><ChevronRight size={18} className="text-zinc-700 transition group-hover:translate-x-0.5 group-hover:text-zinc-400"/></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Small label="MC" value={pct(s.marginPercent)}/><Small label="Captura" value={pct(s.capturePercent)}/><Small label="Avaliações" value={`${s.evaluations}`}/><Small label="Fechamento" value={pct(s.officialClosingRate)}/></div></button>)}</div></section>

    <section className="grid gap-4 xl:grid-cols-2"><div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Stock Intelligence</p><h3 className="mt-1 text-xl font-semibold text-white">Estoque crítico</h3><div className="mt-5 grid grid-cols-2 gap-3"><Small label="Capital total" value={formatCurrency(stockValue)}/><Small label="Capital +90d" value={formatCurrency(criticalValue)}/><Small label="+60 dias" value={`${aged.length}`}/><Small label="+90 dias" value={`${critical.length}`}/></div></div><div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Negociações</p><h3 className="mt-1 text-xl font-semibold text-white">Abertas da equipe</h3><div className="mt-4 space-y-2">{openDeals.length === 0 ? <Empty text="Nenhuma negociação aberta neste filtro."/> : openDeals.slice(0, 8).map(d => <div key={d.id} className="flex items-center justify-between rounded-2xl bg-black/20 p-3"><div><p className="text-sm font-medium text-white">{d.data.licensePlate || 'Sem placa'}</p><p className="mt-1 text-xs text-zinc-500">{d.userName || 'Sem vendedor'}</p></div><span className="text-xs text-amber-400">aberta</span></div>)}</div></div></section>

    {focusedSeller && <SellerPerformanceDetail seller={focusedSeller} officialSales={focusedSeller.officialSales} officialClosingRate={focusedSeller.officialClosingRate} goal={focusedSeller.sellerGoal} captureGoal={focusedSeller.sellerCaptureGoal} marginGoal={focusedSeller.sellerMarginGoal} onClose={() => setFocusedSellerKey(null)}/>}
  </div>;
};

const actionToneClasses: Record<ActionTone, string> = {
  critical: 'border-red-500/20 bg-red-500/[0.065]',
  attention: 'border-amber-400/20 bg-amber-400/[0.06]',
  good: 'border-emerald-500/20 bg-emerald-500/[0.06]',
};

const ActionCard = ({ item, onOpenSeller }: { item: ActionItem; onOpenSeller?: () => void }) => {
  const Wrapper: any = onOpenSeller ? 'button' : 'div';
  return <Wrapper onClick={onOpenSeller} className={`rounded-[22px] border p-4 text-left ${actionToneClasses[item.tone]} ${onOpenSeller ? 'transition hover:border-white/20' : ''}`}><div className="flex items-start justify-between gap-4"><div className="flex gap-3"><div className={`mt-0.5 ${item.tone === 'critical' ? 'text-red-300' : item.tone === 'attention' ? 'text-amber-300' : 'text-emerald-300'}`}>{item.tone === 'good' ? <CheckCircle2 size={18}/> : <CircleAlert size={18}/>}</div><div><p className="font-semibold text-white">{item.title}</p><p className="mt-1 text-sm leading-5 text-zinc-400">{item.text}</p></div></div>{item.metric && <span className="shrink-0 rounded-full bg-black/20 px-3 py-1 text-xs font-semibold text-zinc-200">{item.metric}</span>}</div>{onOpenSeller && <p className="mt-3 flex items-center gap-1 text-xs text-zinc-500">Abrir análise do vendedor <ChevronRight size={13}/></p>}</Wrapper>;
};

const Mini = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl bg-white/[0.055] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">{label}</p><p className="mt-1 text-lg font-semibold text-white">{value}</p></div>;
const Metric = ({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) => <div className="rounded-[26px] border border-white/10 bg-white/[0.035] p-5"><div className="mb-5 grid h-9 w-9 place-items-center rounded-2xl bg-white/[0.06] text-zinc-300">{icon}</div><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-zinc-600">{hint}</p></div>;
const Small = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl bg-white/[0.045] p-3"><p className="text-[10px] uppercase tracking-[0.1em] text-zinc-600">{label}</p><p className="mt-1 text-sm font-semibold text-zinc-200">{value}</p></div>;
const Empty = ({ text }: { text: string }) => <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-600">{text}</p>;

export default Dashboard;
