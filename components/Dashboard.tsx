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
  const day = date.getDay();
  if (day === 0) return false;
  return !holidays.includes(format(date, 'yyyy-MM-dd'));
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
    const unsubscribe = onSnapshot(doc(db, 'config/performance'), snapshot => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as Partial<PerformanceConfig>;
      const merged = { ...DEFAULT_PERFORMANCE, ...data };
      merged.holidays = Array.isArray(data.holidays) ? data.holidays : [];
      setPerformance(merged);
      setDraftPerformance(merged);
      setHolidayDraft(merged.holidays.join(', '));
    });
    return unsubscribe;
  }, []);

  const openSettings = () => {
    setDraftPerformance(performance);
    setHolidayDraft(performance.holidays.join(', '));
    setShowPerformanceSettings(true);
  };

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

  const firstName = currentUser.name?.split(' ')[0] || 'Olá';
  const todayLabel = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    months.add(format(new Date(), 'yyyy-MM'));
    history.forEach(item => {
      if (item.timestamp) months.add(item.timestamp.substring(0, 7));
    });
    return Array.from(months).filter(Boolean).sort((a, b) => b.localeCompare(a));
  }, [history]);

  const availableSellers = useMemo(() => {
    const map = new Map<string, string>();
    history.forEach(item => {
      if (item.userId && item.userName) map.set(item.userId, item.userName);
    });
    users.forEach(user => map.set(user.id, user.name));
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [history, users]);

  const formatMonth = (month: string) => {
    if (month === 'all') return 'Todo período';
    const [year, monthNumber] = month.split('-');
    const value = new Date(Number(year), Number(monthNumber) - 1, 1);
    const label = format(value, 'MMMM yyyy', { locale: ptBR });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const filtered = useMemo(() => {
    let data = history;
    if (selectedMonth !== 'all') data = data.filter(item => item.timestamp.startsWith(selectedMonth));
    if (selectedSeller !== 'all') data = data.filter(item => item.userId === selectedSeller);
    return data;
  }, [history, selectedMonth, selectedSeller]);

  const closedDeals = useMemo(
    () => filtered.filter(item => item.data.dealStatus === 'closed'),
    [filtered]
  );

  const openDeals = useMemo(
    () => filtered.filter(item => item.data.dealStatus !== 'closed'),
    [filtered]
  );

  const getEffectiveProfit = (deal: SavedCalculation) =>
    deal.data.closingType === 'banking'
      ? deal.summary.profit + (Number(deal.data.bankReturn) || 0)
      : deal.summary.profit;

  const getEffectiveMargin = (deal: SavedCalculation) => {
    const invoiceValue = Number(deal.data.invoiceValue) || 0;
    if (!invoiceValue) return Number(deal.summary.marginPercent) || 0;
    return (getEffectiveProfit(deal) / invoiceValue) * 100;
  };

  const stats = useMemo(() => {
    const totalProfit = closedDeals.reduce((sum, deal) => sum + getEffectiveProfit(deal), 0);
    const avgMargin = closedDeals.length
      ? closedDeals.reduce((sum, deal) => sum + getEffectiveMargin(deal), 0) / closedDeals.length
      : 0;
    const capturedDeals = closedDeals.filter(deal => Number(deal.data.payments?.tradeIn) > 0).length;
    const captureRate = closedDeals.length ? (capturedDeals / closedDeals.length) * 100 : 0;

    const totalCommission = closedDeals.reduce((sum, deal) => {
      if (!commissionConfig || deal.userId !== currentUser.id) return sum;
      return sum + calculateCommission(deal.data, getEffectiveProfit(deal), commissionConfig).total;
    }, 0);

    const agedStock = history.filter(
      deal => deal.data.dealStatus !== 'closed' && Number(deal.data.stockDays) >= 60
    );
    const agedStockValue = agedStock.reduce((sum, deal) => sum + (Number(deal.data.vehicleCost) || 0), 0);

    return {
      totalProfit,
      avgMargin,
      captureRate,
      totalCommission,
      agedStockCount: agedStock.length,
      agedStockValue,
    };
  }, [closedDeals, history, commissionConfig, currentUser.id]);

  const meter = useMemo(() => {
    if (selectedMonth === 'all') {
      return {
        workingDays: 0,
        elapsedWorkingDays: 0,
        remainingWorkingDays: 0,
        expectedToday: 0,
        projection: closedDeals.length,
        dailyNeeded: 0,
        firstHalfGoal: Math.ceil((performance.monthlyGoal * performance.firstHalfPercent) / 100),
        firstHalfActual: 0,
        firstHalfExpected: 0,
        isFirstHalf: false,
      };
    }

    const [year, month] = selectedMonth.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = endOfMonth(start);
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month - 1;
    const isPastMonth = isBefore(end, startOfMonth(now));
    const referenceDate = isCurrentMonth ? now : isPastMonth ? end : start;

    const allDays = eachDayOfInterval({ start, end });
    const workDays = allDays.filter(day => isWorkingDay(day, performance.holidays));
    const elapsedDays = workDays.filter(day => !isAfter(day, referenceDate));
    const remainingDays = workDays.filter(day => isAfter(day, referenceDate));

    const firstHalfEnd = new Date(year, month - 1, 15, 23, 59, 59);
    const firstHalfWorkDays = workDays.filter(day => !isAfter(day, firstHalfEnd));
    const firstHalfElapsedDays = firstHalfWorkDays.filter(day => !isAfter(day, referenceDate));
    const firstHalfActual = closedDeals.filter(deal => {
      const date = parseISO(deal.timestamp);
      return date.getDate() <= 15;
    }).length;

    const totalWorkingDays = Math.max(workDays.length, 1);
    const elapsedWorkingDays = Math.max(elapsedDays.length, isCurrentMonth ? 1 : 0);
    const expectedToday = isPastMonth
      ? performance.monthlyGoal
      : (performance.monthlyGoal * elapsedWorkingDays) / totalWorkingDays;
    const projection = elapsedWorkingDays > 0
      ? Math.round((closedDeals.length / elapsedWorkingDays) * totalWorkingDays)
      : 0;
    const remainingGoal = Math.max(performance.monthlyGoal - closedDeals.length, 0);
    const dailyNeeded = remainingDays.length > 0 ? remainingGoal / remainingDays.length : remainingGoal;
    const firstHalfGoal = Math.ceil((performance.monthlyGoal * performance.firstHalfPercent) / 100);
    const firstHalfExpected = firstHalfWorkDays.length
      ? (firstHalfGoal * firstHalfElapsedDays.length) / firstHalfWorkDays.length
      : 0;

    return {
      workingDays: workDays.length,
      elapsedWorkingDays: elapsedDays.length,
      remainingWorkingDays: remainingDays.length,
      expectedToday,
      projection,
      dailyNeeded,
      firstHalfGoal,
      firstHalfActual,
      firstHalfExpected,
      isFirstHalf: referenceDate.getDate() <= 15,
    };
  }, [closedDeals, selectedMonth, performance]);

  const monthlyProgress = Math.min((closedDeals.length / Math.max(performance.monthlyGoal, 1)) * 100, 100);
  const monthlyGap = Math.max(performance.monthlyGoal - closedDeals.length, 0);
  const paceGap = closedDeals.length - meter.expectedToday;

  const chartData = useMemo(() => {
    if (selectedMonth === 'all') {
      return availableMonths
        .slice()
        .reverse()
        .map(month => {
          let deals = history.filter(item => item.timestamp.startsWith(month));
          if (selectedSeller !== 'all') deals = deals.filter(item => item.userId === selectedSeller);
          const closed = deals.filter(item => item.data.dealStatus === 'closed');
          return {
            label: formatMonth(month).split(' ')[0].slice(0, 3),
            vendas: closed.length,
            esperado: undefined,
          };
        });
    }

    const [year, month] = selectedMonth.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const days = eachDayOfInterval({ start, end: endOfMonth(start) });
    const workDays = days.filter(day => isWorkingDay(day, performance.holidays));
    const workDayIndex = new Map(workDays.map((day, index) => [format(day, 'yyyy-MM-dd'), index + 1]));
    let cumulative = 0;

    return days.map(day => {
      const dayDeals = filtered.filter(item => isSameDay(parseISO(item.timestamp), day));
      cumulative += dayDeals.filter(item => item.data.dealStatus === 'closed').length;
      const index = workDayIndex.get(format(day, 'yyyy-MM-dd'));
      return {
        label: format(day, 'dd'),
        vendas: cumulative,
        esperado: index ? (performance.monthlyGoal * index) / Math.max(workDays.length, 1) : undefined,
      };
    });
  }, [availableMonths, filtered, history, selectedMonth, selectedSeller, performance]);

  const stockAlerts = useMemo(() => {
    let data = history.filter(
      item => item.data.dealStatus !== 'closed' && Number(item.data.stockDays) >= 60
    );
    if (selectedSeller !== 'all') data = data.filter(item => item.userId === selectedSeller);
    return data.sort((a, b) => Number(b.data.stockDays) - Number(a.data.stockDays)).slice(0, 4);
  }, [history, selectedSeller]);

  const sellerRanking = useMemo(() => {
    const sellerMap = new Map<string, { name: string; count: number; profit: number; captured: number }>();
    closedDeals.forEach(deal => {
      if (!deal.userId || !deal.userName) return;
      const current = sellerMap.get(deal.userId) || { name: deal.userName, count: 0, profit: 0, captured: 0 };
      current.count += 1;
      current.profit += getEffectiveProfit(deal);
      if (Number(deal.data.payments?.tradeIn) > 0) current.captured += 1;
      sellerMap.set(deal.userId, current);
    });
    return Array.from(sellerMap.values())
      .map(item => ({ ...item, capture: item.count ? (item.captured / item.count) * 100 : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [closedDeals]);

  const aiInsight = useMemo(() => {
    if (closedDeals.length === 0) {
      return {
        tone: 'neutral' as const,
        title: 'Comece registrando as negociações',
        text: 'Assim que houver vendas fechadas, o DealMaster cruza ritmo, margem, captura e estoque para destacar onde agir.',
      };
    }

    if (paceGap < -1) {
      return {
        tone: 'warning' as const,
        title: `${Math.abs(Math.round(paceGap))} carros atrás do ritmo de hoje`,
        text: `Para chegar a ${performance.monthlyGoal}, a operação precisa de ${meter.dailyNeeded.toFixed(1)} carro(s) por dia trabalhado restante. ${stats.agedStockCount ? `Há ${stats.agedStockCount} veículos acima de 60 dias que podem ser priorizados para giro.` : 'Priorize as negociações abertas com maior chance de fechamento.'}`,
      };
    }

    if (stats.captureRate < performance.captureGoal) {
      return {
        tone: 'warning' as const,
        title: 'Volume em ritmo, captura abaixo da meta',
        text: `A captura está em ${stats.captureRate.toFixed(0)}%, contra meta de ${performance.captureGoal}%. Nas próximas vendas, priorize negócios com troca sempre que a margem continuar saudável.`,
      };
    }

    if (stats.avgMargin < performance.healthyMargin) {
      return {
        tone: 'warning' as const,
        title: 'Ritmo bom, margem pede proteção',
        text: `A margem média está em ${stats.avgMargin.toFixed(1)}%. Preserve margem em carros recentes e concentre flexibilização nos veículos envelhecidos.`,
      };
    }

    return {
      tone: 'good' as const,
      title: 'Operação em ritmo saudável',
      text: `Você está ${paceGap >= 0 ? `${paceGap.toFixed(1)} carro(s) à frente` : 'em linha'} do esperado, com projeção de ${meter.projection} vendas e captura de ${stats.captureRate.toFixed(0)}%.`,
    };
  }, [closedDeals.length, paceGap, meter.dailyNeeded, meter.projection, performance, stats]);

  const recentDeals = filtered.slice(0, 4);

  return (
    <div className="pb-24 md:pb-12 space-y-6 md:space-y-8 animate-fade-in">
      {showPerformanceSettings && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl overflow-hidden rounded-[30px] border border-white/10 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-5 md:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Faturômetro</p>
                <h3 className="mt-1 text-xl font-semibold text-white">Configuração da operação</h3>
              </div>
              <button onClick={() => setShowPerformanceSettings(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
              <ConfigField label="Meta mensal" value={draftPerformance.monthlyGoal} onChange={value => setDraftPerformance(p => ({ ...p, monthlyGoal: value }))} />
              <ConfigField label="Quinzena (% da meta)" value={draftPerformance.firstHalfPercent} onChange={value => setDraftPerformance(p => ({ ...p, firstHalfPercent: value }))} />
              <ConfigField label="Meta de captura (%)" value={draftPerformance.captureGoal} onChange={value => setDraftPerformance(p => ({ ...p, captureGoal: value }))} />
              <ConfigField label="Margem saudável (%)" value={draftPerformance.healthyMargin} onChange={value => setDraftPerformance(p => ({ ...p, healthyMargin: value }))} />
              <ConfigField label="Meta vendedor / mês" value={draftPerformance.sellerMonthlyGoal} onChange={value => setDraftPerformance(p => ({ ...p, sellerMonthlyGoal: value }))} />
              <ConfigField label="Meta vendedor / quinzena" value={draftPerformance.sellerFirstHalfGoal} onChange={value => setDraftPerformance(p => ({ ...p, sellerFirstHalfGoal: value }))} />
              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-medium text-zinc-500">Feriados sem expediente</label>
                <input
                  value={holidayDraft}
                  onChange={event => setHolidayDraft(event.target.value)}
                  placeholder="2026-08-15, 2026-09-07"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none focus:border-white/25"
                />
                <p className="mt-2 text-xs text-zinc-600">Use AAAA-MM-DD, separado por vírgulas. Domingos já são excluídos automaticamente.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 p-5 md:p-6">
              <button onClick={() => setShowPerformanceSettings(false)} className="rounded-2xl px-5 py-3 text-sm font-medium text-zinc-400 hover:text-white">Cancelar</button>
              <button onClick={savePerformance} disabled={isSavingPerformance} className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-50">
                {isSavingPerformance ? 'Salvando…' : 'Salvar configuração'}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-1 text-sm capitalize text-zinc-500">{todayLabel}</p>
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Bom dia, {firstName}.</h2>
          <p className="mt-2 max-w-xl text-zinc-400">Veja o ritmo da loja e o que merece sua atenção agora.</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {currentUser.role === 'admin' && (
            <button onClick={openSettings} className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-300">
              <Settings2 size={16} /> Metas
            </button>
          )}
          <select value={selectedSeller} onChange={event => setSelectedSeller(event.target.value)} className="h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-200 outline-none">
            <option value="all" className="bg-zinc-900">Toda equipe</option>
            {availableSellers.map(seller => <option key={seller.id} value={seller.id} className="bg-zinc-900">{seller.name}</option>)}
          </select>
          <select value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} className="h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-200 outline-none">
            <option value="all" className="bg-zinc-900">Todo período</option>
            {availableMonths.map(month => <option key={month} value={month} className="bg-zinc-900">{formatMonth(month)}</option>)}
          </select>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-6 shadow-2xl shadow-black/30 md:p-8">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative grid gap-7 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
          <div>
            <div className="mb-5 flex items-center gap-2 text-sm text-zinc-400"><Target size={16} /> Faturômetro mensal</div>
            <div className="flex items-end gap-3">
              <span className="text-6xl font-semibold tracking-[-0.06em] text-white md:text-7xl">{closedDeals.length}</span>
              <span className="pb-2 text-xl text-zinc-500">de {performance.monthlyGoal}</span>
            </div>
            <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${monthlyProgress}%` }} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniMetric label="Esperado hoje" value={meter.expectedToday.toFixed(1)} state={paceGap >= 0 ? 'good' : 'warning'} />
              <MiniMetric label="Projeção" value={`${meter.projection}`} state={meter.projection >= performance.monthlyGoal ? 'good' : 'warning'} />
              <MiniMetric label="Faltam" value={`${monthlyGap}`} />
              <MiniMetric label="Ritmo necessário" value={`${meter.dailyNeeded.toFixed(1)}/dia`} />
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-500">
              <span>{meter.workingDays} dias de trabalho no mês</span>
              <span>{meter.remainingWorkingDays} restantes</span>
              <span>{performance.holidays.length} feriado(s) configurado(s)</span>
            </div>
          </div>

          <button onClick={onStartNewCalculation} className="group flex min-h-24 items-center justify-between rounded-[26px] bg-white px-5 py-5 text-left text-black transition-transform active:scale-[0.98]">
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Ação rápida</span>
              <span className="block text-lg font-semibold">Nova negociação</span>
              <span className="mt-1 block text-sm text-zinc-500">Calcule margem antes de fechar.</span>
            </div>
            <div className="grid h-11 w-11 place-items-center rounded-full bg-black text-white transition-transform group-hover:translate-x-1"><ArrowRight size={20} /></div>
          </button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<CalendarDays size={18} />} label="Quinzena" value={`${meter.firstHalfActual} / ${meter.firstHalfGoal}`} hint={meter.isFirstHalf ? `Esperado: ${meter.firstHalfExpected.toFixed(1)}` : `Meta: ${performance.firstHalfPercent}% do mês`} state={meter.firstHalfActual >= meter.firstHalfExpected ? 'good' : 'warning'} />
        <MetricCard icon={<Percent size={18} />} label="Margem média" value={`${stats.avgMargin.toFixed(1)}%`} hint={`Saudável ≥ ${performance.healthyMargin}%`} state={stats.avgMargin >= performance.healthyMargin ? 'good' : 'warning'} />
        <MetricCard icon={<CarFront size={18} />} label="Captura" value={`${stats.captureRate.toFixed(0)}%`} hint={`Meta ${performance.captureGoal}%`} state={stats.captureRate >= performance.captureGoal ? 'good' : 'warning'} />
        <MetricCard icon={<Clock3 size={18} />} label="Estoque +60d" value={`${stats.agedStockCount}`} hint={formatCurrency(stats.agedStockValue)} state={stats.agedStockCount > 0 ? 'warning' : 'good'} />
      </section>

      <section className={`rounded-[30px] border p-6 md:p-7 ${aiInsight.tone === 'good' ? 'border-emerald-500/20 bg-emerald-500/[0.07]' : aiInsight.tone === 'warning' ? 'border-amber-400/20 bg-amber-400/[0.07]' : 'border-white/10 bg-white/[0.04]'}`}>
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-black shadow-lg"><Sparkles size={20} /></div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">DealMaster AI</span><span className="h-1 w-1 rounded-full bg-zinc-600" /><span className="text-xs text-zinc-500">Resumo executivo</span></div>
            <h3 className="text-xl font-semibold tracking-tight text-white">{aiInsight.title}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{aiInsight.text}</p>
          </div>
          <BrainCircuit className="hidden text-zinc-700 md:block" size={26} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.55fr_.75fr]">
        <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Faturômetro</p><h3 className="mt-1 text-xl font-semibold text-white">Real x ritmo ideal</h3></div>
            <div className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-zinc-400">{formatMonth(selectedMonth)}</div>
          </div>
          <div className="h-[285px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}>
                <defs><linearGradient id="dealMasterArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffffff" stopOpacity={0.22} /><stop offset="100%" stopColor="#ffffff" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="label" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 16 }} labelStyle={{ color: '#a1a1aa', fontSize: 11 }} itemStyle={{ color: '#ffffff', fontSize: 12 }} />
                <Area type="monotone" dataKey="vendas" name="Realizado" stroke="#ffffff" strokeWidth={2.8} fill="url(#dealMasterArea)" />
                <Line type="monotone" dataKey="esperado" name="Esperado" stroke="#f59e0b" strokeWidth={1.8} strokeDasharray="6 5" dot={false} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex items-center gap-5 text-xs text-zinc-500"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-white" /> Realizado</span><span className="flex items-center gap-2"><span className="h-0.5 w-4 bg-amber-500" /> Ritmo ideal</span></div>
        </div>

        <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7">
          <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Prioridade</p><h3 className="mt-1 text-xl font-semibold text-white">Estoque envelhecido</h3></div><Gauge size={21} className="text-zinc-600" /></div>
          <div className="space-y-2.5">
            {stockAlerts.length === 0 ? <div className="flex min-h-52 flex-col items-center justify-center text-center"><div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-400"><CheckCircle2 size={22} /></div><p className="font-medium text-white">Estoque saudável</p><p className="mt-1 max-w-48 text-sm text-zinc-500">Nenhum negócio aberto acima de 60 dias.</p></div> : stockAlerts.map(item => (
              <div key={item.id} className="flex items-center justify-between rounded-2xl bg-black/20 p-3.5"><div className="min-w-0"><p className="truncate text-sm font-semibold uppercase text-white">{item.data.licensePlate || 'Sem placa'}</p><p className="mt-0.5 text-xs text-zinc-500">{formatCurrency(Number(item.data.vehicleCost) || 0)} de custo</p></div><div className="ml-3 flex items-center gap-2 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400"><AlertCircle size={13} />{Number(item.data.stockDays) || 0}d</div></div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7">
          <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Equipe</p><h3 className="mt-1 text-xl font-semibold text-white">Performance do período</h3></div><Users size={20} className="text-zinc-600" /></div>
          <div className="space-y-2">
            {sellerRanking.length === 0 ? <EmptyState text="Ainda não há vendas fechadas para montar o ranking." /> : sellerRanking.map((seller, index) => (
              <div key={seller.name} className="flex items-center gap-3 rounded-2xl px-2 py-3"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${index === 0 ? 'bg-white text-black' : 'bg-white/[0.06] text-zinc-400'}`}>{index === 0 ? <Trophy size={16} /> : index + 1}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{seller.name}</p><p className="text-xs text-zinc-500">Captura {seller.capture.toFixed(0)}% · {formatCurrency(seller.profit)} lucro</p></div><div className="text-right"><span className="block text-lg font-semibold text-white">{seller.count}</span><span className="text-[10px] text-zinc-600">/{performance.sellerMonthlyGoal}</span></div></div>
            ))}
          </div>
        </div>

        <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7">
          <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Atividade</p><h3 className="mt-1 text-xl font-semibold text-white">Negociações recentes</h3></div><Coins size={20} className="text-zinc-600" /></div>
          <div className="space-y-2">
            {recentDeals.length === 0 ? <EmptyState text="As negociações mais recentes aparecerão aqui." /> : recentDeals.map(item => {
              const isClosed = item.data.dealStatus === 'closed';
              return <div key={item.id} className="flex items-center gap-3 rounded-2xl px-2 py-3"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${isClosed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-400/10 text-amber-400'}`}>{isClosed ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium uppercase text-white">{item.data.licensePlate || 'Negociação sem placa'}</p><p className="text-xs text-zinc-500">{item.userName || 'Sem vendedor'} · {isClosed ? 'Fechada' : 'Em andamento'}</p></div><ChevronRight size={17} className="text-zinc-700" /></div>;
            })}
          </div>
        </div>
      </section>

      {commissionConfig?.enabled && currentUser.role !== 'admin' && (
        <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-400/10 text-amber-400"><Coins size={21} /></div><div><p className="text-sm text-zinc-500">Minha comissão estimada</p><p className="text-2xl font-semibold tracking-tight text-white">{formatCurrency(stats.totalCommission)}</p></div></div><CalcIcon size={20} className="text-zinc-700" /></div></section>
      )}
    </div>
  );
};

const ConfigField = ({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) => (
  <div><label className="mb-2 block text-xs font-medium text-zinc-500">{label}</label><input type="number" value={value} onChange={event => onChange(Number(event.target.value) || 0)} className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none focus:border-white/25" /></div>
);

const MiniMetric = ({ label, value, state = 'neutral' }: { label: string; value: string; state?: 'neutral' | 'good' | 'warning' }) => (
  <div className="rounded-2xl bg-white/[0.055] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">{label}</p><p className={`mt-1 text-lg font-semibold ${state === 'good' ? 'text-emerald-400' : state === 'warning' ? 'text-amber-400' : 'text-white'}`}>{value}</p></div>
);

const MetricCard = ({ icon, label, value, hint, state = 'neutral' }: { icon: React.ReactNode; label: string; value: string; hint: string; state?: 'neutral' | 'good' | 'warning' }) => (
  <div className="min-h-36 rounded-[26px] border border-white/10 bg-white/[0.035] p-4 md:p-5"><div className="mb-5 flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-2xl bg-white/[0.06] text-zinc-300">{icon}</span>{state !== 'neutral' && <span className={`h-2.5 w-2.5 rounded-full ${state === 'good' ? 'bg-emerald-400' : 'bg-amber-400'}`} />}</div><p className="text-xs font-medium text-zinc-500">{label}</p><p className="mt-1 truncate text-2xl font-semibold tracking-tight text-white">{value}</p><p className="mt-1 truncate text-[11px] text-zinc-600">{hint}</p></div>
);

const EmptyState = ({ text }: { text: string }) => (
  <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-4 text-center"><CarFront size={22} className="mb-2 text-zinc-700" /><p className="max-w-52 text-sm text-zinc-600">{text}</p></div>
);

export default Dashboard;