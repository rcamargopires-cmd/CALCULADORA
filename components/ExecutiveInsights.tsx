import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, BriefcaseBusiness, Check, Clipboard, FileText, RefreshCw, Target, TrendingDown, TrendingUp, Users, WalletCards, X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { format, startOfMonth, subDays } from 'date-fns';
import { db } from '../firebase';
import { OperationalPerformanceSeller, OperationalPerformanceSnapshot, User } from '../types';
import { formatCurrency } from '../utils/currency';
import { normalize, OperationalStockHistoryPoint, operationalDataService } from '../services/operationalDataService';
import { userService } from '../services/userService';

type Period = 'day' | 'week' | 'half' | 'month';

type PerformanceConfig = {
  monthlyGoal: number;
  captureGoal: number;
  healthyMargin: number;
  sellerMonthlyGoal: number;
  sellerCaptureGoal: number;
  holidays: string[];
};

const DEFAULTS: PerformanceConfig = {
  monthlyGoal: 70,
  captureGoal: 60,
  healthyMargin: 8,
  sellerMonthlyGoal: 15,
  sellerCaptureGoal: 60,
  holidays: [],
};

const pct = (value: number) => `${Number(value || 0).toFixed(1)}%`;
const dayLabel = (date: string) => {
  const [, month, day] = date.split('-');
  return day && month ? `${day}/${month}` : date;
};

const officialClosingRate = (item: OperationalPerformanceSeller | null | undefined) => {
  if (!item) return 0;
  const flow = Number(item.flowTotal || 0);
  const rawRate = Number(item.closingPercent || 0);
  const rawClosing = Number(item.closing || 0);
  if (flow > 0 && rawRate > 0 && rawRate <= 2 && Math.abs(rawRate - rawClosing) < 0.000001) return rawRate * 100;
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

const totalFromSnapshot = (snapshot: OperationalPerformanceSnapshot): OperationalPerformanceSeller | null => {
  if (snapshot.total) return snapshot.total;
  const sellers = snapshot.sellers || [];
  if (!sellers.length) return null;
  const sum = (key: keyof OperationalPerformanceSeller) => sellers.reduce((acc, item) => acc + Number(item[key] || 0), 0);
  const closingTotal = sellers.reduce((acc, item) => acc + officialClosingCount(item), 0);
  const flowTotal = sum('flowTotal');
  return {
    seller: 'TOTAL', sellerKey: 'total', passages: sum('passages'), orders: sum('orders'), flowTotal, orderPercent: 0,
    workInPeriod: sum('workInPeriod'), avgContactsPerDay: 0, evaluations: sum('evaluations'), evaluationRate: 0,
    closing: closingTotal, syonetSales: sum('syonetSales'), closingPercent: flowTotal ? closingTotal / flowTotal * 100 : 0,
    marginPerCar: closingTotal ? sum('marginTotal') / closingTotal : 0, marginTotal: sum('marginTotal'),
    marginPercent: closingTotal ? sellers.reduce((acc, item) => acc + Number(item.marginPercent || 0) * officialClosingCount(item), 0) / closingTotal : 0,
    captureQty: sum('captureQty'), capturePercent: closingTotal ? sum('captureQty') / closingTotal * 100 : 0,
    pipeline: sum('pipeline'), projection: sum('projection'), additionalPurchase: sum('additionalPurchase'),
  };
};

const getPeriodStart = (period: Period, latestDate: string) => {
  const base = new Date(`${latestDate}T12:00:00`);
  if (period === 'week') return format(subDays(base, 6), 'yyyy-MM-dd');
  if (period === 'month') return format(startOfMonth(base), 'yyyy-MM-dd');
  if (period === 'half') {
    const day = base.getDate();
    return `${latestDate.slice(0, 7)}-${day <= 15 ? '01' : '16'}`;
  }
  return latestDate;
};

const PERIOD_LABELS: Record<Period, string> = {
  day: 'Hoje',
  week: '7 dias',
  half: 'Quinzena',
  month: 'Mês',
};

const ExecutiveInsights: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [period, setPeriod] = useState<Period>('day');
  const [performanceHistory, setPerformanceHistory] = useState<OperationalPerformanceSnapshot[]>([]);
  const [stockHistory, setStockHistory] = useState<OperationalStockHistoryPoint[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [performance, setPerformance] = useState<PerformanceConfig>(DEFAULTS);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [history, stocks, allUsers, perf] = await Promise.all([
        operationalDataService.getPerformanceHistory(),
        operationalDataService.getStockHistory(),
        userService.getAll(),
        getDoc(doc(db, 'config/performance')),
      ]);
      setPerformanceHistory(history);
      setStockHistory(stocks);
      setUsers(allUsers.filter(user => user.status === 'active'));
      if (perf.exists()) {
        const raw = perf.data() as Partial<PerformanceConfig>;
        setPerformance({ ...DEFAULTS, ...raw, holidays: Array.isArray(raw.holidays) ? raw.holidays : [] });
      }
    } catch (error) {
      console.error('Executive Insights load error', error);
    } finally {
      setLoadedOnce(true);
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener('dealmaster:operational-data-updated', refresh);
    return () => window.removeEventListener('dealmaster:operational-data-updated', refresh);
  }, []);

  const report = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const validHistory = performanceHistory
      .filter(item => item.referenceDate && item.referenceDate <= today)
      .sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
    const validStock = stockHistory
      .filter(item => item.referenceDate && item.referenceDate <= today)
      .sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));

    const currentSnapshot = validHistory[validHistory.length - 1];
    if (!currentSnapshot) return null;
    const current = totalFromSnapshot(currentSnapshot);
    if (!current) return null;

    const periodStart = getPeriodStart(period, currentSnapshot.referenceDate);
    const periodSnapshots = validHistory.filter(item => item.referenceDate >= periodStart && item.referenceDate <= currentSnapshot.referenceDate);
    const baselineSnapshot = period === 'day'
      ? validHistory.length > 1 ? validHistory[validHistory.length - 2] : currentSnapshot
      : periodSnapshots[0] || currentSnapshot;
    const baseline = totalFromSnapshot(baselineSnapshot) || current;

    const currentStock = validStock[validStock.length - 1];
    const periodStocks = validStock.filter(item => item.referenceDate >= periodStart && (!currentStock || item.referenceDate <= currentStock.referenceDate));
    const baselineStock = period === 'day'
      ? validStock.length > 1 ? validStock[validStock.length - 2] : currentStock
      : periodStocks[0] || currentStock;

    const sales = officialClosingCount(current);
    const baselineSales = officialClosingCount(baseline);
    const salesDelta = sales - baselineSales;
    const projection = Number(current.projection || 0);
    const projectionDelta = projection - Number(baseline.projection || 0);
    const margin = Number(current.marginPercent || 0);
    const marginDelta = margin - Number(baseline.marginPercent || 0);
    const capture = Number(current.capturePercent || 0);
    const captureDelta = capture - Number(baseline.capturePercent || 0);
    const evaluations = Number(current.evaluations || 0);
    const closingRate = officialClosingRate(current);

    const team = currentSnapshot.sellers.map(seller => {
      const user = users.find(item => normalize(item.name || '') === seller.sellerKey);
      const goal = user?.goals?.monthly ?? performance.sellerMonthlyGoal;
      const captureGoal = user?.goals?.capture ?? performance.sellerCaptureGoal;
      const marginGoal = user?.goals?.margin ?? performance.healthyMargin;
      const officialSales = officialClosingCount(seller);
      const projectionCoverage = goal ? Number(seller.projection || 0) / goal : 0;
      const needsAction = Number(seller.projection || 0) < goal || Number(seller.capturePercent || 0) < captureGoal || (officialSales > 0 && Number(seller.marginPercent || 0) < marginGoal);
      return { seller, goal, officialSales, projectionCoverage, needsAction };
    });
    const topSeller = [...team].sort((a, b) => b.projectionCoverage - a.projectionCoverage)[0];
    const attention = team.filter(item => item.needsAction).sort((a, b) => a.projectionCoverage - b.projectionCoverage);

    const critical90 = Number(currentStock?.critical90 || 0);
    const critical90Value = Number(currentStock?.critical90Value || 0);
    const stockCount = Number(currentStock?.stockCount || 0);
    const aged60 = Number(currentStock?.aged60 || 0);
    const criticalDelta = currentStock && baselineStock ? critical90 - Number(baselineStock.critical90 || 0) : 0;

    const priorities: string[] = [];
    if (projection < performance.monthlyGoal) priorities.push(`Recuperar volume: projeção ${projection.toFixed(1)} para meta ${performance.monthlyGoal}.`);
    if (capture < performance.captureGoal) priorities.push(`Elevar captura: ${capture.toFixed(1)}% para meta ${performance.captureGoal}%.`);
    if (sales > 0 && margin < performance.healthyMargin) priorities.push(`Proteger margem: MC ${margin.toFixed(1)}% para referência ${performance.healthyMargin}%.`);
    if (critical90 > 0) priorities.push(`Atacar estoque crítico: ${critical90} carro(s) +90, ${formatCurrency(critical90Value)} de capital.`);
    if (attention.length) priorities.push(`Acompanhar equipe: ${attention.length} vendedor(es) com pelo menos um indicador abaixo da meta.`);
    if (!priorities.length) priorities.push('Manter disciplina comercial: operação equilibrada nos principais indicadores.');

    let headline = 'Operação estável';
    let headlineTone: 'good' | 'warning' | 'critical' = 'good';
    if (projection < performance.monthlyGoal - 5 || critical90 >= 5) { headline = 'Operação exige ação imediata'; headlineTone = 'critical'; }
    else if (projection < performance.monthlyGoal || capture < performance.captureGoal || margin < performance.healthyMargin || critical90 > 0) { headline = 'Operação em atenção'; headlineTone = 'warning'; }

    const narrative = [
      `DealMaster Executive Insights · ${PERIOD_LABELS[period]} · referência ${dayLabel(currentSnapshot.referenceDate)}`,
      `Vendas: ${sales}/${performance.monthlyGoal} · Projeção: ${projection.toFixed(1)} · MC: ${margin.toFixed(1)}% · Captura: ${capture.toFixed(1)}% · Fechamento: ${closingRate.toFixed(1)}%.`,
      `Movimento do período: vendas ${salesDelta >= 0 ? '+' : ''}${salesDelta.toFixed(0)}, projeção ${projectionDelta >= 0 ? '+' : ''}${projectionDelta.toFixed(1)}, margem ${marginDelta >= 0 ? '+' : ''}${marginDelta.toFixed(1)} p.p., captura ${captureDelta >= 0 ? '+' : ''}${captureDelta.toFixed(1)} p.p.`,
      currentStock ? `Estoque: ${stockCount} carros · ${aged60} acima de 60 dias · ${critical90} acima de 90 dias · capital +90 ${formatCurrency(critical90Value)}.` : 'Estoque: sem fotografia histórica disponível.',
      topSeller ? `Destaque de ritmo: ${topSeller.seller.seller}, projeção ${Number(topSeller.seller.projection || 0).toFixed(1)} para meta ${topSeller.goal}.` : '',
      `Prioridades: ${priorities.slice(0, 3).join(' ')}`,
    ].filter(Boolean).join('\n');

    return {
      currentSnapshot,
      current,
      headline,
      headlineTone,
      sales,
      salesDelta,
      projection,
      projectionDelta,
      margin,
      marginDelta,
      capture,
      captureDelta,
      evaluations,
      closingRate,
      stockCount,
      aged60,
      critical90,
      critical90Value,
      criticalDelta,
      topSeller,
      attention,
      priorities,
      narrative,
      periodStart,
      baselineDate: baselineSnapshot.referenceDate,
    };
  }, [performanceHistory, stockHistory, users, performance, period]);

  const copyReport = async () => {
    if (!report?.narrative) return;
    await navigator.clipboard.writeText(report.narrative);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return <>
    <button
      onClick={() => { setOpen(true); if (!loadedOnce) load(); }}
      className="fixed bottom-32 right-5 z-[138] flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl shadow-black/40 transition active:scale-95"
    >
      <BriefcaseBusiness size={18}/>
      Executive
    </button>

    {open && <div className="fixed inset-0 z-[205] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/10 bg-zinc-950 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex flex-col gap-4 border-b border-white/10 p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-black"><BriefcaseBusiness size={21}/></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Executive Insights</p><h3 className="mt-1 text-xl font-semibold text-white">Resumo executivo da operação</h3></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={copyReport} disabled={!report} className="flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-zinc-300 disabled:opacity-30">{copied ? <Check size={15}/> : <Clipboard size={15}/>} {copied ? 'Copiado' : 'Copiar resumo'}</button>
            <button onClick={load} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/></button>
            <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><X size={18}/></button>
          </div>
        </div>

        <div className="p-5 md:p-6">
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-black/20 p-1">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(item => <button key={item} onClick={() => setPeriod(item)} className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${period === item ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}>{PERIOD_LABELS[item]}</button>)}
          </div>

          {loading && !loadedOnce ? <div className="grid min-h-72 place-items-center text-zinc-500"><RefreshCw className="animate-spin"/></div> : !report ? (
            <div className="mt-6 rounded-[26px] border border-dashed border-white/10 p-10 text-center text-sm text-zinc-500">Importe o Mapa de Performance para gerar o Executive Insights.</div>
          ) : <>
            <section className={`mt-5 rounded-[28px] border p-5 md:p-6 ${report.headlineTone === 'critical' ? 'border-red-500/20 bg-red-500/[0.07]' : report.headlineTone === 'warning' ? 'border-amber-400/20 bg-amber-400/[0.07]' : 'border-emerald-500/20 bg-emerald-500/[0.07]'}`}>
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Leitura executiva</p><h4 className="mt-2 text-2xl font-semibold text-white">{report.headline}</h4><p className="mt-2 text-sm text-zinc-400">Mapa {dayLabel(report.currentSnapshot.referenceDate)} · comparação a partir de {dayLabel(report.baselineDate)}</p></div>
                <div className="rounded-2xl bg-black/20 px-4 py-3 text-right"><p className="text-[10px] uppercase tracking-wide text-zinc-600">Projeção x meta</p><p className="mt-1 text-2xl font-semibold text-white">{report.projection.toFixed(1)} <span className="text-sm font-normal text-zinc-500">/ {performance.monthlyGoal}</span></p></div>
              </div>
            </section>

            <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ExecutiveMetric icon={<Target size={17}/>} label="Vendas" value={`${report.sales}/${performance.monthlyGoal}`} delta={report.salesDelta} suffix=""/>
              <ExecutiveMetric icon={<BarChart3 size={17}/>} label="Projeção" value={report.projection.toFixed(1)} delta={report.projectionDelta} suffix=""/>
              <ExecutiveMetric icon={<WalletCards size={17}/>} label="Margem MC" value={pct(report.margin)} delta={report.marginDelta} suffix=" p.p."/>
              <ExecutiveMetric icon={<Users size={17}/>} label="Captura" value={pct(report.capture)} delta={report.captureDelta} suffix=" p.p."/>
            </section>

            <section className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
              <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5 md:p-6">
                <div className="flex items-center gap-2 text-zinc-500"><FileText size={16}/><p className="text-xs font-semibold uppercase tracking-[0.14em]">Resumo para diretoria</p></div>
                <div className="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-300">{report.narrative}</div>
              </div>
              <div className="space-y-4">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Estoque</p>
                  <div className="mt-4 grid grid-cols-2 gap-3"><Mini label="Atual" value={`${report.stockCount}`}/><Mini label="+60 dias" value={`${report.aged60}`}/><Mini label="+90 dias" value={`${report.critical90}`}/><Mini label="Capital +90" value={formatCurrency(report.critical90Value)}/></div>
                  {report.criticalDelta !== 0 && <p className={`mt-3 text-xs ${report.criticalDelta < 0 ? 'text-emerald-400' : 'text-amber-300'}`}>{report.criticalDelta > 0 ? '+' : ''}{report.criticalDelta} carro(s) na faixa +90 no período.</p>}
                </div>
                <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Equipe</p>
                  {report.topSeller && <div className="mt-4 rounded-2xl bg-black/20 p-4"><p className="text-xs text-zinc-600">Destaque de ritmo</p><p className="mt-1 font-semibold text-white">{report.topSeller.seller.seller}</p><p className="mt-1 text-xs text-zinc-500">{report.topSeller.officialSales}/{report.topSeller.goal} vendas · projeção {Number(report.topSeller.seller.projection || 0).toFixed(1)}</p></div>}
                  <p className="mt-3 text-sm text-zinc-400"><span className="font-semibold text-white">{report.attention.length}</span> vendedor(es) com indicador em atenção.</p>
                </div>
              </div>
            </section>

            <section className="mt-4 rounded-[28px] border border-white/10 bg-gradient-to-br from-white/[0.055] to-white/[0.025] p-5 md:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Agenda de gestão</p>
              <h4 className="mt-1 text-lg font-semibold text-white">Prioridades recomendadas</h4>
              <div className="mt-4 grid gap-3 md:grid-cols-2">{report.priorities.slice(0, 4).map((item, index) => <div key={index} className="flex gap-3 rounded-2xl bg-black/20 p-4 text-sm leading-6 text-zinc-300"><span className="grid h-6 min-w-6 place-items-center rounded-full bg-white text-[10px] font-bold text-black">{index + 1}</span><span>{item}</span></div>)}</div>
            </section>
          </>}
        </div>
      </div>
    </div>}
  </>;
};

const ExecutiveMetric = ({ icon, label, value, delta, suffix }: { icon: React.ReactNode; label: string; value: string; delta: number; suffix: string }) => {
  const positive = delta > 0;
  const negative = delta < 0;
  return <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5"><div className="flex items-center justify-between"><div className="text-zinc-500">{icon}</div>{Math.abs(delta) > 0.001 && <span className={`flex items-center gap-1 text-[10px] ${positive ? 'text-emerald-400' : 'text-red-400'}`}>{positive ? <TrendingUp size={12}/> : <TrendingDown size={12}/>} {positive ? '+' : ''}{delta.toFixed(label === 'Vendas' ? 0 : 1)}{suffix}</span>}</div><p className="mt-4 text-xs text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold text-white">{value}</p></div>;
};

const Mini = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl bg-black/20 p-3"><p className="text-[10px] uppercase tracking-[0.1em] text-zinc-600">{label}</p><p className="mt-1 truncate text-sm font-semibold text-zinc-200">{value}</p></div>;

export default ExecutiveInsights;
