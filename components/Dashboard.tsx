import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  Calculator as CalcIcon,
  CalendarDays,
  CarFront,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coins,
  Gauge,
  Percent,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfMonth,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { SavedCalculation, User, CommissionConfig } from '../types';
import { formatCurrency } from '../utils/currency';
import { calculateCommission } from '../utils/commission';

interface DashboardProps {
  history: SavedCalculation[];
  users: User[];
  currentUser: User;
  commissionConfig: CommissionConfig | null;
  onStartNewCalculation: () => void;
  onDelete?: (id: string) => void;
}

interface PerformanceConfig {
  monthlyGoal: number;
  firstHalfPercent: number;
  captureGoal: number;
  healthyMargin: number;
  sellerMonthlyGoal: number;
  sellerFirstHalfGoal: number;
  sellerCaptureGoal: number;
  holidays: string[];
}

const DEFAULT_PERFORMANCE: PerformanceConfig = {
  monthlyGoal: 70,
  firstHalfPercent: 40,
  captureGoal: 60,
  healthyMargin: 8,
  sellerMonthlyGoal: 15,
  sellerFirstHalfGoal: 6,
  sellerCaptureGoal: 60,
  holidays: [],
};

const isWorkingDay = (date: Date, holidays: string[]) => {
  if (date.getDay() === 0) return false;
  return !holidays.includes(format(date, 'yyyy-MM-dd'));
};

const effectiveProfit = (deal: SavedCalculation) =>
  deal.data.closingType === 'banking'
    ? deal.summary.profit + (Number(deal.data.bankReturn) || 0)
    : deal.summary.profit;

const effectiveMargin = (deal: SavedCalculation) => {
  const invoiceValue = Number(deal.data.invoiceValue) || 0;
  if (!invoiceValue) return Number(deal.summary.marginPercent) || 0;
  return (effectiveProfit(deal) / invoiceValue) * 100;
};

const Dashboard: React.FC<DashboardProps> = ({
  history,
  users,
  currentUser,
  commissionConfig,
  onStartNewCalculation,
}) => {
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [selectedSeller, setSelectedSeller] = useState('all');
  const [performance, setPerformance] = useState<PerformanceConfig>(DEFAULT_PERFORMANCE);
  const [draftPerformance, setDraftPerformance] = useState<PerformanceConfig>(DEFAULT_PERFORMANCE);
  const [showPerformanceSettings, setShowPerformanceSettings] = useState(false);
  const [holidayDraft, setHolidayDraft] = useState('');
  const [isSavingPerformance, setIsSavingPerformance] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, 'config/performance'), snapshot => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as Partial<PerformanceConfig>;
      const merged = { ...DEFAULT_PERFORMANCE, ...data };
      merged.holidays = Array.isArray(data.holidays) ? data.holidays : [];
      setPerformance(merged);
      setDraftPerformance(merged);
      setHolidayDraft(merged.holidays.join(', '));
    });
  }, []);

  const savePerformance = async () => {
    setIsSavingPerformance(true);
    try {
      const holidays = holidayDraft
        .split(',')
        .map(value => value.trim())
        .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value));
      const next = { ...draftPerformance, holidays };
      await setDoc(doc(db, 'config/performance'), next, { merge: true });
      setPerformance(next);
      setShowPerformanceSettings(false);
    } finally {
      setIsSavingPerformance(false);
    }
  };

  const availableMonths = useMemo(() => {
    const months = new Set<string>([format(new Date(), 'yyyy-MM')]);
    history.forEach(item => item.timestamp && months.add(item.timestamp.substring(0, 7)));
    return Array.from(months).filter(Boolean).sort((a, b) => b.localeCompare(a));
  }, [history]);

  const availableSellers = useMemo(() => {
    const map = new Map<string, string>();
    users.filter(user => user.status === 'active').forEach(user => map.set(user.id, user.name));
    history.forEach(item => item.userId && item.userName && map.set(item.userId, item.userName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [history, users]);

  const formatMonth = (month: string) => {
    if (month === 'all') return 'Todo período';
    const [year, monthNumber] = month.split('-');
    const label = format(new Date(Number(year), Number(monthNumber) - 1, 1), 'MMMM yyyy', { locale: ptBR });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const monthHistory = useMemo(() => {
    if (selectedMonth === 'all') return history;
    return history.filter(item => item.timestamp.startsWith(selectedMonth));
  }, [history, selectedMonth]);

  const filtered = useMemo(() => {
    if (selectedSeller === 'all') return monthHistory;
    return monthHistory.filter(item => item.userId === selectedSeller);
  }, [monthHistory, selectedSeller]);

  const closedDeals = useMemo(() => filtered.filter(item => item.data.dealStatus === 'closed'), [filtered]);
  const openDeals = useMemo(() => filtered.filter(item => item.data.dealStatus !== 'closed'), [filtered]);

  const monthTiming = useMemo(() => {
    if (selectedMonth === 'all') return null;
    const [year, month] = selectedMonth.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = endOfMonth(start);
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month - 1;
    const isPastMonth = isBefore(end, startOfMonth(now));
    const referenceDate = isCurrentMonth ? now : isPastMonth ? end : start;
    const workDays = eachDayOfInterval({ start, end }).filter(day => isWorkingDay(day, performance.holidays));
    const elapsed = workDays.filter(day => !isAfter(day, referenceDate));
    const remaining = workDays.filter(day => isAfter(day, referenceDate));
    const firstHalfEnd = new Date(year, month - 1, 15, 23, 59, 59);
    const firstHalfWorkDays = workDays.filter(day => !isAfter(day, firstHalfEnd));
    const firstHalfElapsed = firstHalfWorkDays.filter(day => !isAfter(day, referenceDate));
    return { year, month, start, end, referenceDate, workDays, elapsed, remaining, firstHalfWorkDays, firstHalfElapsed, isPastMonth };
  }, [selectedMonth, performance.holidays]);

  const meter = useMemo(() => {
    if (!monthTiming) {
      return { expectedToday: 0, projection: closedDeals.length, dailyNeeded: 0, remainingWorkingDays: 0, workingDays: 0, firstHalfGoal: 0, firstHalfActual: 0, firstHalfExpected: 0 };
    }
    const total = Math.max(monthTiming.workDays.length, 1);
    const elapsed = Math.max(monthTiming.elapsed.length, 1);
    const expectedToday = monthTiming.isPastMonth ? performance.monthlyGoal : (performance.monthlyGoal * elapsed) / total;
    const projection = Math.round((closedDeals.length / elapsed) * total);
    const remainingGoal = Math.max(performance.monthlyGoal - closedDeals.length, 0);
    const dailyNeeded = monthTiming.remaining.length ? remainingGoal / monthTiming.remaining.length : remainingGoal;
    const firstHalfGoal = Math.ceil((performance.monthlyGoal * performance.firstHalfPercent) / 100);
    const firstHalfActual = closedDeals.filter(deal => parseISO(deal.timestamp).getDate() <= 15).length;
    const firstHalfExpected = monthTiming.firstHalfWorkDays.length
      ? (firstHalfGoal * monthTiming.firstHalfElapsed.length) / monthTiming.firstHalfWorkDays.length
      : 0;
    return {
      expectedToday,
      projection,
      dailyNeeded,
      remainingWorkingDays: monthTiming.remaining.length,
      workingDays: monthTiming.workDays.length,
      firstHalfGoal,
      firstHalfActual,
      firstHalfExpected,
    };
  }, [closedDeals, monthTiming, performance]);

  const stats = useMemo(() => {
    const totalProfit = closedDeals.reduce((sum, deal) => sum + effectiveProfit(deal), 0);
    const avgMargin = closedDeals.length ? closedDeals.reduce((sum, deal) => sum + effectiveMargin(deal), 0) / closedDeals.length : 0;
    const captured = closedDeals.filter(deal => Number(deal.data.payments?.tradeIn) > 0).length;
    const captureRate = closedDeals.length ? (captured / closedDeals.length) * 100 : 0;
    const totalCommission = closedDeals.reduce((sum, deal) => {
      if (!commissionConfig || deal.userId !== currentUser.id) return sum;
      return sum + calculateCommission(deal.data, effectiveProfit(deal), commissionConfig).total;
    }, 0);
    const agedStock = history.filter(deal => deal.data.dealStatus !== 'closed' && Number(deal.data.stockDays) >= 60);
    return {
      totalProfit,
      avgMargin,
      captureRate,
      totalCommission,
      agedStockCount: agedStock.length,
      agedStockValue: agedStock.reduce((sum, deal) => sum + (Number(deal.data.vehicleCost) || 0), 0),
    };
  }, [closedDeals, history, commissionConfig, currentUser.id]);

  const sellerPerformance = useMemo(() => {
    const elapsedDays = Math.max(monthTiming?.elapsed.length || 1, 1);
    const totalDays = Math.max(monthTiming?.workDays.length || elapsedDays, 1);
    const remainingDays = monthTiming?.remaining.length || 0;

    return availableSellers.map(seller => {
      const deals = monthHistory.filter(item => item.userId === seller.id && item.data.dealStatus === 'closed');
      const count = deals.length;
      const firstHalf = deals.filter(deal => parseISO(deal.timestamp).getDate() <= 15).length;
      const captured = deals.filter(deal => Number(deal.data.payments?.tradeIn) > 0).length;
      const capture = count ? (captured / count) * 100 : 0;
      const margin = count ? deals.reduce((sum, deal) => sum + effectiveMargin(deal), 0) / count : 0;
      const profit = deals.reduce((sum, deal) => sum + effectiveProfit(deal), 0);
      const projection = selectedMonth === 'all' ? count : Math.round((count / elapsedDays) * totalDays);
      const expected = selectedMonth === 'all' ? 0 : (performance.sellerMonthlyGoal * elapsedDays) / totalDays;
      const paceGap = count - expected;
      const missing = Math.max(performance.sellerMonthlyGoal - count, 0);
      const dailyNeeded = remainingDays ? missing / remainingDays : missing;

      let diagnosis = 'Sem vendas fechadas no período.';
      let tone: 'good' | 'warning' | 'neutral' = 'neutral';
      if (count > 0) {
        if (projection < performance.sellerMonthlyGoal) {
          diagnosis = `Projeção de ${projection}. Precisa de ${dailyNeeded.toFixed(1)} carro(s)/dia restante para chegar a ${performance.sellerMonthlyGoal}.`;
          tone = 'warning';
        } else if (capture < performance.sellerCaptureGoal) {
          diagnosis = `Ritmo saudável, mas captura em ${capture.toFixed(0)}%. Meta é ${performance.sellerCaptureGoal}%.`;
          tone = 'warning';
        } else if (margin < performance.healthyMargin) {
          diagnosis = `Volume e captura em linha. Proteja margem, hoje em ${margin.toFixed(1)}%.`;
          tone = 'warning';
        } else {
          diagnosis = `Operação saudável. Projeção ${projection}, captura ${capture.toFixed(0)}% e margem ${margin.toFixed(1)}%.`;
          tone = 'good';
        }
      }

      return { ...seller, count, firstHalf, capture, margin, profit, projection, expected, paceGap, missing, dailyNeeded, diagnosis, tone };
    }).sort((a, b) => b.count - a.count || b.profit - a.profit);
  }, [availableSellers, monthHistory, monthTiming, selectedMonth, performance]);

  const selectedSellerCard = selectedSeller === 'all' ? null : sellerPerformance.find(item => item.id === selectedSeller) || null;

  const chartData = useMemo(() => {
    if (selectedMonth === 'all') {
      return availableMonths.slice().reverse().map(month => {
        let deals = history.filter(item => item.timestamp.startsWith(month));
        if (selectedSeller !== 'all') deals = deals.filter(item => item.userId === selectedSeller);
        return { label: formatMonth(month).split(' ')[0].slice(0, 3), vendas: deals.filter(item => item.data.dealStatus === 'closed').length, esperado: undefined };
      });
    }
    if (!monthTiming) return [];
    const workDayIndex = new Map(monthTiming.workDays.map((day, index) => [format(day, 'yyyy-MM-dd'), index + 1]));
    let cumulative = 0;
    return eachDayOfInterval({ start: monthTiming.start, end: monthTiming.end }).map(day => {
      const dayDeals = filtered.filter(item => isSameDay(parseISO(item.timestamp), day));
      cumulative += dayDeals.filter(item => item.data.dealStatus === 'closed').length;
      const index = workDayIndex.get(format(day, 'yyyy-MM-dd'));
      const goal = selectedSeller === 'all' ? performance.monthlyGoal : performance.sellerMonthlyGoal;
      return { label: format(day, 'dd'), vendas: cumulative, esperado: index ? (goal * index) / Math.max(monthTiming.workDays.length, 1) : undefined };
    });
  }, [availableMonths, filtered, history, selectedMonth, selectedSeller, monthTiming, performance]);

  const stockAlerts = useMemo(() => {
    let data = history.filter(item => item.data.dealStatus !== 'closed' && Number(item.data.stockDays) >= 60);
    if (selectedSeller !== 'all') data = data.filter(item => item.userId === selectedSeller);
    return data.sort((a, b) => Number(b.data.stockDays) - Number(a.data.stockDays)).slice(0, 4);
  }, [history, selectedSeller]);

  const aiInsight = useMemo(() => {
    if (selectedSellerCard) {
      return { tone: selectedSellerCard.tone, title: `Diagnóstico de ${selectedSellerCard.name.split(' ')[0]}`, text: selectedSellerCard.diagnosis };
    }
    if (!closedDeals.length) return { tone: 'neutral' as const, title: 'Comece registrando as negociações', text: 'Assim que houver vendas fechadas, o DealMaster cruza ritmo, margem, captura e estoque para destacar onde agir.' };
    const paceGap = closedDeals.length - meter.expectedToday;
    if (paceGap < -1) return { tone: 'warning' as const, title: `${Math.abs(Math.round(paceGap))} carros atrás do ritmo de hoje`, text: `Para chegar a ${performance.monthlyGoal}, a operação precisa de ${meter.dailyNeeded.toFixed(1)} carro(s) por dia trabalhado restante.` };
    if (stats.captureRate < performance.captureGoal) return { tone: 'warning' as const, title: 'Volume em ritmo, captura abaixo da meta', text: `A captura está em ${stats.captureRate.toFixed(0)}%, contra meta de ${performance.captureGoal}%.` };
    if (stats.avgMargin < performance.healthyMargin) return { tone: 'warning' as const, title: 'Ritmo bom, margem pede proteção', text: `A margem média está em ${stats.avgMargin.toFixed(1)}%. Preserve margem em carros recentes e flexibilize onde o estoque estiver envelhecido.` };
    return { tone: 'good' as const, title: 'Operação em ritmo saudável', text: `Projeção de ${meter.projection} vendas, captura de ${stats.captureRate.toFixed(0)}% e margem média de ${stats.avgMargin.toFixed(1)}%.` };
  }, [selectedSellerCard, closedDeals.length, meter, performance, stats]);

  const recentDeals = filtered.slice(0, 4);
  const firstName = currentUser.name?.split(' ')[0] || 'Olá';
  const todayLabel = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });
  const monthlyGoal = selectedSeller === 'all' ? performance.monthlyGoal : performance.sellerMonthlyGoal;
  const monthlyProgress = Math.min((closedDeals.length / Math.max(monthlyGoal, 1)) * 100, 100);
  const monthlyGap = Math.max(monthlyGoal - closedDeals.length, 0);
  const paceGap = closedDeals.length - (selectedSellerCard ? selectedSellerCard.expected : meter.expectedToday);

  return (
    <div className="pb-24 md:pb-12 space-y-6 md:space-y-8 animate-fade-in">
      {showPerformanceSettings && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl overflow-hidden rounded-[30px] border border-white/10 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-5 md:p-6">
              <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Faturômetro</p><h3 className="mt-1 text-xl font-semibold text-white">Configuração da operação</h3></div>
              <button onClick={() => setShowPerformanceSettings(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><X size={18} /></button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
              <ConfigField label="Meta mensal" value={draftPerformance.monthlyGoal} onChange={value => setDraftPerformance(p => ({ ...p, monthlyGoal: value }))} />
              <ConfigField label="Quinzena (% da meta)" value={draftPerformance.firstHalfPercent} onChange={value => setDraftPerformance(p => ({ ...p, firstHalfPercent: value }))} />
              <ConfigField label="Meta de captura (%)" value={draftPerformance.captureGoal} onChange={value => setDraftPerformance(p => ({ ...p, captureGoal: value }))} />
              <ConfigField label="Margem saudável (%)" value={draftPerformance.healthyMargin} onChange={value => setDraftPerformance(p => ({ ...p, healthyMargin: value }))} />
              <ConfigField label="Meta vendedor / mês" value={draftPerformance.sellerMonthlyGoal} onChange={value => setDraftPerformance(p => ({ ...p, sellerMonthlyGoal: value }))} />
              <ConfigField label="Meta vendedor / quinzena" value={draftPerformance.sellerFirstHalfGoal} onChange={value => setDraftPerformance(p => ({ ...p, sellerFirstHalfGoal: value }))} />
              <ConfigField label="Captura vendedor (%)" value={draftPerformance.sellerCaptureGoal} onChange={value => setDraftPerformance(p => ({ ...p, sellerCaptureGoal: value }))} />
              <div><label className="mb-2 block text-xs font-medium text-zinc-500">Feriados sem expediente</label><input value={holidayDraft} onChange={event => setHolidayDraft(event.target.value)} placeholder="2026-09-07, 2026-10-12" className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none" /></div>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 p-5 md:p-6"><button onClick={() => setShowPerformanceSettings(false)} className="rounded-2xl px-5 py-3 text-sm text-zinc-400">Cancelar</button><button onClick={savePerformance} disabled={isSavingPerformance} className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-50">{isSavingPerformance ? 'Salvando…' : 'Salvar configuração'}</button></div>
          </div>
        </div>
      )}

      <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div><p className="mb-1 text-sm capitalize text-zinc-500">{todayLabel}</p><h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Bom dia, {firstName}.</h2><p className="mt-2 max-w-xl text-zinc-400">Veja o ritmo da loja e da equipe em um só lugar.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {currentUser.role === 'admin' && <button onClick={() => { setDraftPerformance(performance); setHolidayDraft(performance.holidays.join(', ')); setShowPerformanceSettings(true); }} className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-300"><Settings2 size={16} /> Metas</button>}
          <select value={selectedSeller} onChange={event => setSelectedSeller(event.target.value)} className="h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-200 outline-none"><option value="all" className="bg-zinc-900">Toda equipe</option>{availableSellers.map(seller => <option key={seller.id} value={seller.id} className="bg-zinc-900">{seller.name}</option>)}</select>
          <select value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} className="h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-200 outline-none"><option value="all" className="bg-zinc-900">Todo período</option>{availableMonths.map(month => <option key={month} value={month} className="bg-zinc-900">{formatMonth(month)}</option>)}</select>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-6 shadow-2xl shadow-black/30 md:p-8">
        <div className="relative grid gap-7 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
          <div><div className="mb-5 flex items-center gap-2 text-sm text-zinc-400"><Target size={16} /> {selectedSellerCard ? `Meta de ${selectedSellerCard.name}` : 'Faturômetro mensal'}</div><div className="flex items-end gap-3"><span className="text-6xl font-semibold tracking-[-0.06em] text-white md:text-7xl">{closedDeals.length}</span><span className="pb-2 text-xl text-zinc-500">de {monthlyGoal}</span></div><div className="mt-6 h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${monthlyProgress}%` }} /></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><MiniMetric label="Esperado hoje" value={(selectedSellerCard?.expected ?? meter.expectedToday).toFixed(1)} state={paceGap >= 0 ? 'good' : 'warning'} /><MiniMetric label="Projeção" value={`${selectedSellerCard?.projection ?? meter.projection}`} state={(selectedSellerCard?.projection ?? meter.projection) >= monthlyGoal ? 'good' : 'warning'} /><MiniMetric label="Faltam" value={`${monthlyGap}`} /><MiniMetric label="Ritmo necessário" value={`${(selectedSellerCard?.dailyNeeded ?? meter.dailyNeeded).toFixed(1)}/dia`} /></div></div>
          <button onClick={onStartNewCalculation} className="group flex min-h-24 items-center justify-between rounded-[26px] bg-white px-5 py-5 text-left text-black"><div><span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Ação rápida</span><span className="block text-lg font-semibold">Nova negociação</span><span className="mt-1 block text-sm text-zinc-500">Calcule margem antes de fechar.</span></div><div className="grid h-11 w-11 place-items-center rounded-full bg-black text-white"><ArrowRight size={20} /></div></button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<CalendarDays size={18} />} label="Quinzena" value={selectedSellerCard ? `${selectedSellerCard.firstHalf} / ${performance.sellerFirstHalfGoal}` : `${meter.firstHalfActual} / ${meter.firstHalfGoal}`} hint={selectedSellerCard ? 'Meta individual' : `Meta: ${performance.firstHalfPercent}% do mês`} state={(selectedSellerCard ? selectedSellerCard.firstHalf >= performance.sellerFirstHalfGoal : meter.firstHalfActual >= meter.firstHalfExpected) ? 'good' : 'warning'} />
        <MetricCard icon={<Percent size={18} />} label="Margem média" value={`${stats.avgMargin.toFixed(1)}%`} hint={`Saudável ≥ ${performance.healthyMargin}%`} state={stats.avgMargin >= performance.healthyMargin ? 'good' : 'warning'} />
        <MetricCard icon={<CarFront size={18} />} label="Captura" value={`${stats.captureRate.toFixed(0)}%`} hint={`Meta ${selectedSellerCard ? performance.sellerCaptureGoal : performance.captureGoal}%`} state={stats.captureRate >= (selectedSellerCard ? performance.sellerCaptureGoal : performance.captureGoal) ? 'good' : 'warning'} />
        <MetricCard icon={<TrendingUp size={18} />} label="Lucro" value={formatCurrency(stats.totalProfit)} hint={`${openDeals.length} em negociação`} />
      </section>

      <section className={`rounded-[30px] border p-6 md:p-7 ${aiInsight.tone === 'good' ? 'border-emerald-500/20 bg-emerald-500/[0.07]' : aiInsight.tone === 'warning' ? 'border-amber-400/20 bg-amber-400/[0.07]' : 'border-white/10 bg-white/[0.04]'}`}><div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-black"><Sparkles size={20} /></div><div className="min-w-0 flex-1"><div className="mb-1 flex items-center gap-2"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">DealMaster AI</span><span className="h-1 w-1 rounded-full bg-zinc-600" /><span className="text-xs text-zinc-500">Performance</span></div><h3 className="text-xl font-semibold text-white">{aiInsight.title}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{aiInsight.text}</p></div><BrainCircuit className="hidden text-zinc-700 md:block" size={26} /></div></section>

      <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7">
        <div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Equipe</p><h3 className="mt-1 text-xl font-semibold text-white">Performance dos vendedores</h3></div><Users size={21} className="text-zinc-600" /></div>
        <div className="grid gap-3 lg:grid-cols-2">
          {sellerPerformance.map((seller, index) => (
            <button key={seller.id} onClick={() => setSelectedSeller(seller.id)} className="rounded-[24px] border border-white/10 bg-black/20 p-4 text-left transition hover:bg-white/[0.05]">
              <div className="flex items-start gap-3"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${index === 0 && seller.count > 0 ? 'bg-white text-black' : 'bg-white/[0.06] text-zinc-400'}`}>{index === 0 && seller.count > 0 ? <Trophy size={16} /> : seller.name.charAt(0).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="truncate font-medium text-white">{seller.name}</p><span className={`h-2.5 w-2.5 rounded-full ${seller.tone === 'good' ? 'bg-emerald-400' : seller.tone === 'warning' ? 'bg-amber-400' : 'bg-zinc-700'}`} /></div><p className="mt-1 text-xs text-zinc-500">{seller.count}/{performance.sellerMonthlyGoal} vendas · projeção {seller.projection}</p></div></div>
              <div className="mt-4 grid grid-cols-4 gap-2"><SmallStat label="Quinzena" value={`${seller.firstHalf}/${performance.sellerFirstHalfGoal}`} /><SmallStat label="Captura" value={`${seller.capture.toFixed(0)}%`} /><SmallStat label="Margem" value={`${seller.margin.toFixed(1)}%`} /><SmallStat label="Lucro" value={formatCurrency(seller.profit)} /></div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-white" style={{ width: `${Math.min((seller.count / Math.max(performance.sellerMonthlyGoal, 1)) * 100, 100)}%` }} /></div><p className="mt-3 text-xs leading-5 text-zinc-500">{seller.diagnosis}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.55fr_.75fr]">
        <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Faturômetro</p><h3 className="mt-1 text-xl font-semibold text-white">Real x ritmo ideal</h3></div><div className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-zinc-400">{formatMonth(selectedMonth)}</div></div><div className="h-[285px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}><defs><linearGradient id="dealMasterArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffffff" stopOpacity={0.22} /><stop offset="100%" stopColor="#ffffff" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#27272a" strokeDasharray="3 6" vertical={false} /><XAxis dataKey="label" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} /><YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 16 }} /><Area type="monotone" dataKey="vendas" name="Realizado" stroke="#ffffff" strokeWidth={2.8} fill="url(#dealMasterArea)" /><Line type="monotone" dataKey="esperado" name="Esperado" stroke="#f59e0b" strokeWidth={1.8} strokeDasharray="6 5" dot={false} connectNulls /></AreaChart></ResponsiveContainer></div></div>
        <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Prioridade</p><h3 className="mt-1 text-xl font-semibold text-white">Estoque envelhecido</h3></div><Gauge size={21} className="text-zinc-600" /></div><div className="space-y-2.5">{stockAlerts.length === 0 ? <EmptyState text="Nenhum negócio aberto acima de 60 dias." /> : stockAlerts.map(item => <div key={item.id} className="flex items-center justify-between rounded-2xl bg-black/20 p-3.5"><div><p className="text-sm font-semibold uppercase text-white">{item.data.licensePlate || 'Sem placa'}</p><p className="text-xs text-zinc-500">{formatCurrency(Number(item.data.vehicleCost) || 0)}</p></div><div className="flex items-center gap-2 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400"><AlertCircle size={13} />{Number(item.data.stockDays) || 0}d</div></div>)}</div></div>
      </section>

      <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Atividade</p><h3 className="mt-1 text-xl font-semibold text-white">Negociações recentes</h3></div><Coins size={20} className="text-zinc-600" /></div><div className="grid gap-2 md:grid-cols-2">{recentDeals.length === 0 ? <EmptyState text="As negociações mais recentes aparecerão aqui." /> : recentDeals.map(item => { const isClosed = item.data.dealStatus === 'closed'; return <div key={item.id} className="flex items-center gap-3 rounded-2xl px-2 py-3"><div className={`grid h-9 w-9 place-items-center rounded-full ${isClosed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-400/10 text-amber-400'}`}>{isClosed ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium uppercase text-white">{item.data.licensePlate || 'Negociação sem placa'}</p><p className="text-xs text-zinc-500">{item.userName || 'Sem vendedor'} · {isClosed ? 'Fechada' : 'Em andamento'}</p></div><ChevronRight size={17} className="text-zinc-700" /></div>; })}</div></section>

      {commissionConfig?.enabled && currentUser.role !== 'admin' && <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><div className="flex items-center justify-between"><div><p className="text-sm text-zinc-500">Minha comissão estimada</p><p className="text-2xl font-semibold text-white">{formatCurrency(stats.totalCommission)}</p></div><CalcIcon size={20} className="text-zinc-700" /></div></section>}
    </div>
  );
};

const ConfigField = ({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) => <div><label className="mb-2 block text-xs font-medium text-zinc-500">{label}</label><input type="number" value={value} onChange={event => onChange(Number(event.target.value) || 0)} className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none" /></div>;
const MiniMetric = ({ label, value, state = 'neutral' }: { label: string; value: string; state?: 'neutral' | 'good' | 'warning' }) => <div className="rounded-2xl bg-white/[0.055] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">{label}</p><p className={`mt-1 text-lg font-semibold ${state === 'good' ? 'text-emerald-400' : state === 'warning' ? 'text-amber-400' : 'text-white'}`}>{value}</p></div>;
const MetricCard = ({ icon, label, value, hint, state = 'neutral' }: { icon: React.ReactNode; label: string; value: string; hint: string; state?: 'neutral' | 'good' | 'warning' }) => <div className="min-h-36 rounded-[26px] border border-white/10 bg-white/[0.035] p-4 md:p-5"><div className="mb-5 flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-2xl bg-white/[0.06] text-zinc-300">{icon}</span>{state !== 'neutral' && <span className={`h-2.5 w-2.5 rounded-full ${state === 'good' ? 'bg-emerald-400' : 'bg-amber-400'}`} />}</div><p className="text-xs font-medium text-zinc-500">{label}</p><p className="mt-1 truncate text-2xl font-semibold tracking-tight text-white">{value}</p><p className="mt-1 truncate text-[11px] text-zinc-600">{hint}</p></div>;
const SmallStat = ({ label, value }: { label: string; value: string }) => <div className="rounded-xl bg-white/[0.04] p-2.5"><p className="text-[9px] uppercase tracking-wide text-zinc-600">{label}</p><p className="mt-1 truncate text-sm font-semibold text-zinc-200">{value}</p></div>;
const EmptyState = ({ text }: { text: string }) => <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-4 text-center"><CarFront size={22} className="mb-2 text-zinc-700" /><p className="max-w-52 text-sm text-zinc-600">{text}</p></div>;

export default Dashboard;