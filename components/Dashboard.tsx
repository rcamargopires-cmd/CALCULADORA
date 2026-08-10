import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
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
  CarFront,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coins,
  Gauge,
  Percent,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import { endOfMonth, eachDayOfInterval, format, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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

const MONTHLY_GOAL = 70;
const CAPTURE_GOAL = 60;
const HEALTHY_MARGIN = 8;

const Dashboard: React.FC<DashboardProps> = ({
  history,
  users,
  currentUser,
  commissionConfig,
  onStartNewCalculation,
}) => {
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [selectedSeller, setSelectedSeller] = useState('all');

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

  const getEffectiveProfit = (deal: SavedCalculation) => {
    return deal.data.closingType === 'banking'
      ? deal.summary.profit + (Number(deal.data.bankReturn) || 0)
      : deal.summary.profit;
  };

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

  const goalProgress = Math.min((closedDeals.length / MONTHLY_GOAL) * 100, 100);
  const goalGap = Math.max(MONTHLY_GOAL - closedDeals.length, 0);

  const projection = useMemo(() => {
    if (selectedMonth === 'all') return closedDeals.length;
    const [year, month] = selectedMonth.split('-').map(Number);
    const selectedDate = new Date(year, month - 1, 1);
    const now = new Date();
    const monthEnd = endOfMonth(selectedDate);
    const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month - 1;
    const elapsed = isCurrentMonth ? Math.max(now.getDate(), 1) : monthEnd.getDate();
    return Math.round((closedDeals.length / elapsed) * monthEnd.getDate());
  }, [closedDeals.length, selectedMonth]);

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
            lucro: closed.reduce((sum, item) => sum + getEffectiveProfit(item), 0),
          };
        });
    }

    const [year, month] = selectedMonth.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const days = eachDayOfInterval({ start, end: endOfMonth(start) });
    return days.map(day => {
      const deals = filtered.filter(item => isSameDay(parseISO(item.timestamp), day));
      const closed = deals.filter(item => item.data.dealStatus === 'closed');
      return {
        label: format(day, 'dd'),
        vendas: closed.length,
        lucro: closed.reduce((sum, item) => sum + getEffectiveProfit(item), 0),
      };
    });
  }, [availableMonths, filtered, history, selectedMonth, selectedSeller]);

  const stockAlerts = useMemo(() => {
    let data = history.filter(
      item => item.data.dealStatus !== 'closed' && Number(item.data.stockDays) >= 60
    );
    if (selectedSeller !== 'all') data = data.filter(item => item.userId === selectedSeller);
    return data.sort((a, b) => Number(b.data.stockDays) - Number(a.data.stockDays)).slice(0, 4);
  }, [history, selectedSeller]);

  const sellerRanking = useMemo(() => {
    const sellerMap = new Map<string, { name: string; count: number; profit: number }>();
    closedDeals.forEach(deal => {
      if (!deal.userId || !deal.userName) return;
      const current = sellerMap.get(deal.userId) || { name: deal.userName, count: 0, profit: 0 };
      current.count += 1;
      current.profit += getEffectiveProfit(deal);
      sellerMap.set(deal.userId, current);
    });
    return Array.from(sellerMap.values()).sort((a, b) => b.count - a.count).slice(0, 4);
  }, [closedDeals]);

  const aiInsight = useMemo(() => {
    if (closedDeals.length === 0) {
      return {
        tone: 'neutral',
        title: 'Comece registrando as negociações',
        text: 'Assim que houver vendas fechadas, o DealMaster passa a cruzar margem, captura e ritmo de faturamento para destacar onde agir.',
      };
    }

    if (projection < MONTHLY_GOAL) {
      return {
        tone: 'warning',
        title: `${MONTHLY_GOAL - projection} carros abaixo da projeção da meta`,
        text: stats.agedStockCount > 0
          ? `Há ${stats.agedStockCount} veículos com mais de 60 dias. Eles são a melhor frente para buscar giro sem sacrificar margem nos carros recentes.`
          : `O ritmo atual projeta ${projection} vendas. Priorize propostas abertas e vendedores abaixo da média para recuperar volume.`,
      };
    }

    if (stats.captureRate < CAPTURE_GOAL) {
      return {
        tone: 'warning',
        title: 'Volume saudável, captura pede atenção',
        text: `A projeção está em ${projection} vendas, mas a captura está em ${stats.captureRate.toFixed(0)}%. A meta de referência é ${CAPTURE_GOAL}%.`,
      };
    }

    return {
      tone: 'good',
      title: 'Operação em ritmo saudável',
      text: `A projeção está em ${projection} vendas, captura em ${stats.captureRate.toFixed(0)}% e margem média em ${stats.avgMargin.toFixed(1)}%. Preserve margem nos carros recentes.`,
    };
  }, [closedDeals.length, projection, stats.agedStockCount, stats.captureRate, stats.avgMargin]);

  const recentDeals = filtered.slice(0, 4);

  return (
    <div className="pb-24 md:pb-12 space-y-6 md:space-y-8 animate-fade-in">
      <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-zinc-500 text-sm capitalize mb-1">{todayLabel}</p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
            Bom dia, {firstName}.
          </h2>
          <p className="text-zinc-400 mt-2 max-w-xl">
            Veja o que merece sua atenção na operação agora.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={selectedSeller}
            onChange={event => setSelectedSeller(event.target.value)}
            className="h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-200 outline-none backdrop-blur-xl"
          >
            <option value="all" className="bg-zinc-900">Toda equipe</option>
            {availableSellers.map(seller => (
              <option key={seller.id} value={seller.id} className="bg-zinc-900">{seller.name}</option>
            ))}
          </select>
          <select
            value={selectedMonth}
            onChange={event => setSelectedMonth(event.target.value)}
            className="h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-200 outline-none backdrop-blur-xl"
          >
            <option value="all" className="bg-zinc-900">Todo período</option>
            {availableMonths.map(month => (
              <option key={month} value={month} className="bg-zinc-900">{formatMonth(month)}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-6 md:p-8 shadow-2xl shadow-black/30">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-amber-400/5 blur-3xl" />

        <div className="relative grid gap-7 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
          <div>
            <div className="mb-5 flex items-center gap-2 text-sm text-zinc-400">
              <Target size={16} />
              Meta do mês
            </div>
            <div className="flex items-end gap-3">
              <span className="text-6xl md:text-7xl font-semibold tracking-[-0.06em] text-white">{closedDeals.length}</span>
              <span className="pb-2 text-xl text-zinc-500">de {MONTHLY_GOAL}</span>
            </div>

            <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-white transition-all duration-700"
                style={{ width: `${goalProgress}%` }}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span className="text-zinc-400">Faltam <strong className="text-white">{goalGap}</strong></span>
              <span className="text-zinc-400">Projeção <strong className={projection >= MONTHLY_GOAL ? 'text-emerald-400' : 'text-amber-400'}>{projection}</strong></span>
              <span className="text-zinc-400">Em negociação <strong className="text-white">{openDeals.length}</strong></span>
            </div>
          </div>

          <button
            onClick={onStartNewCalculation}
            className="group flex min-h-24 items-center justify-between rounded-[26px] bg-white px-5 py-5 text-left text-black transition-transform active:scale-[0.98]"
          >
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Ação rápida</span>
              <span className="block text-lg font-semibold">Nova negociação</span>
              <span className="mt-1 block text-sm text-zinc-500">Calcule margem antes de fechar.</span>
            </div>
            <div className="grid h-11 w-11 place-items-center rounded-full bg-black text-white transition-transform group-hover:translate-x-1">
              <ArrowRight size={20} />
            </div>
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon={<Percent size={18} />} label="Margem média" value={`${stats.avgMargin.toFixed(1)}%`} hint={`Saudável ≥ ${HEALTHY_MARGIN}%`} state={stats.avgMargin >= HEALTHY_MARGIN ? 'good' : 'warning'} />
        <MetricCard icon={<CarFront size={18} />} label="Captura" value={`${stats.captureRate.toFixed(0)}%`} hint={`Meta ${CAPTURE_GOAL}%`} state={stats.captureRate >= CAPTURE_GOAL ? 'good' : 'warning'} />
        <MetricCard icon={<TrendingUp size={18} />} label="Lucro" value={formatCurrency(stats.totalProfit)} hint={formatMonth(selectedMonth)} />
        <MetricCard icon={<Clock3 size={18} />} label="Estoque +60d" value={`${stats.agedStockCount}`} hint={formatCurrency(stats.agedStockValue)} state={stats.agedStockCount > 0 ? 'warning' : 'good'} />
      </section>

      <section className={`rounded-[30px] border p-6 md:p-7 ${
        aiInsight.tone === 'good'
          ? 'border-emerald-500/20 bg-emerald-500/[0.07]'
          : aiInsight.tone === 'warning'
            ? 'border-amber-400/20 bg-amber-400/[0.07]'
            : 'border-white/10 bg-white/[0.04]'
      }`}>
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-black shadow-lg">
            <Sparkles size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">DealMaster AI</span>
              <span className="h-1 w-1 rounded-full bg-zinc-600" />
              <span className="text-xs text-zinc-500">Resumo executivo</span>
            </div>
            <h3 className="text-xl font-semibold tracking-tight text-white">{aiInsight.title}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{aiInsight.text}</p>
          </div>
          <BrainCircuit className="hidden text-zinc-700 md:block" size={26} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_.8fr]">
        <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Performance</p>
              <h3 className="mt-1 text-xl font-semibold text-white">Ritmo de vendas</h3>
            </div>
            <div className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-zinc-400">{formatMonth(selectedMonth)}</div>
          </div>

          <div className="h-[270px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 6, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="dealMasterArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="label" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 16 }}
                  labelStyle={{ color: '#a1a1aa', fontSize: 11 }}
                  itemStyle={{ color: '#ffffff', fontSize: 12 }}
                />
                <Area type="monotone" dataKey="vendas" name="Vendas" stroke="#ffffff" strokeWidth={2.5} fill="url(#dealMasterArea)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Prioridade</p>
              <h3 className="mt-1 text-xl font-semibold text-white">Estoque envelhecido</h3>
            </div>
            <Gauge size={21} className="text-zinc-600" />
          </div>

          <div className="space-y-2.5">
            {stockAlerts.length === 0 ? (
              <div className="flex min-h-52 flex-col items-center justify-center text-center">
                <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-400">
                  <CheckCircle2 size={22} />
                </div>
                <p className="font-medium text-white">Estoque saudável</p>
                <p className="mt-1 max-w-48 text-sm text-zinc-500">Nenhum negócio aberto acima de 60 dias.</p>
              </div>
            ) : (
              stockAlerts.map(item => (
                <div key={item.id} className="flex items-center justify-between rounded-2xl bg-black/20 p-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold uppercase text-white">{item.data.licensePlate || 'Sem placa'}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{formatCurrency(Number(item.data.vehicleCost) || 0)} de custo</p>
                  </div>
                  <div className="ml-3 flex items-center gap-2 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400">
                    <AlertCircle size={13} />
                    {Number(item.data.stockDays) || 0}d
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Equipe</p>
              <h3 className="mt-1 text-xl font-semibold text-white">Ranking do período</h3>
            </div>
            <Users size={20} className="text-zinc-600" />
          </div>
          <div className="space-y-2">
            {sellerRanking.length === 0 ? (
              <EmptyState text="Ainda não há vendas fechadas para montar o ranking." />
            ) : sellerRanking.map((seller, index) => (
              <div key={seller.name} className="flex items-center gap-3 rounded-2xl px-2 py-3">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${index === 0 ? 'bg-white text-black' : 'bg-white/[0.06] text-zinc-400'}`}>
                  {index === 0 ? <Trophy size={16} /> : index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{seller.name}</p>
                  <p className="text-xs text-zinc-500">{formatCurrency(seller.profit)} de lucro</p>
                </div>
                <span className="text-lg font-semibold text-white">{seller.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Atividade</p>
              <h3 className="mt-1 text-xl font-semibold text-white">Negociações recentes</h3>
            </div>
            <Coins size={20} className="text-zinc-600" />
          </div>

          <div className="space-y-2">
            {recentDeals.length === 0 ? (
              <EmptyState text="As negociações mais recentes aparecerão aqui." />
            ) : recentDeals.map(item => {
              const isClosed = item.data.dealStatus === 'closed';
              return (
                <div key={item.id} className="flex items-center gap-3 rounded-2xl px-2 py-3">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${isClosed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-400/10 text-amber-400'}`}>
                    {isClosed ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium uppercase text-white">{item.data.licensePlate || 'Negociação sem placa'}</p>
                    <p className="text-xs text-zinc-500">{item.userName || 'Sem vendedor'} · {isClosed ? 'Fechada' : 'Em andamento'}</p>
                  </div>
                  <ChevronRight size={17} className="text-zinc-700" />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {commissionConfig?.enabled && currentUser.role !== 'admin' && (
        <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-400/10 text-amber-400">
                <Coins size={21} />
              </div>
              <div>
                <p className="text-sm text-zinc-500">Minha comissão estimada</p>
                <p className="text-2xl font-semibold tracking-tight text-white">{formatCurrency(stats.totalCommission)}</p>
              </div>
            </div>
            <CalcIcon size={20} className="text-zinc-700" />
          </div>
        </section>
      )}
    </div>
  );
};

const MetricCard = ({
  icon,
  label,
  value,
  hint,
  state = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  state?: 'neutral' | 'good' | 'warning';
}) => (
  <div className="min-h-36 rounded-[26px] border border-white/10 bg-white/[0.035] p-4 md:p-5">
    <div className="mb-5 flex items-center justify-between">
      <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white/[0.06] text-zinc-300">{icon}</span>
      {state !== 'neutral' && <span className={`h-2.5 w-2.5 rounded-full ${state === 'good' ? 'bg-emerald-400' : 'bg-amber-400'}`} />}
    </div>
    <p className="text-xs font-medium text-zinc-500">{label}</p>
    <p className="mt-1 truncate text-2xl font-semibold tracking-tight text-white">{value}</p>
    <p className="mt-1 truncate text-[11px] text-zinc-600">{hint}</p>
  </div>
);

const EmptyState = ({ text }: { text: string }) => (
  <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-4 text-center">
    <CarFront size={22} className="mb-2 text-zinc-700" />
    <p className="max-w-52 text-sm text-zinc-600">{text}</p>
  </div>
);

export default Dashboard;
