import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Crosshair,
  Repeat2,
  Target,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { eachDayOfInterval, endOfMonth, format, isAfter } from 'date-fns';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { SavedCalculation, User } from '../types';
import { SellerPerformanceRecord, sellerPerformanceService } from '../services/sellerPerformanceService';
import { formatCurrency } from '../utils/currency';
import PerformanceTrends, { PerformanceTrendPoint } from './PerformanceTrends';

type Props = {
  currentUser: User;
  history: SavedCalculation[];
  onStartNewCalculation: () => void;
};

type PerformanceConfig = {
  sellerMonthlyGoal: number;
  sellerFirstHalfGoal: number;
  sellerCaptureGoal: number;
  healthyMargin: number;
  holidays: string[];
};

const DEFAULTS: PerformanceConfig = {
  sellerMonthlyGoal: 15,
  sellerFirstHalfGoal: 6,
  sellerCaptureGoal: 60,
  healthyMargin: 8,
  holidays: [],
};

const isWorkingDay = (date: Date, holidays: string[]) =>
  date.getDay() !== 0 && !holidays.includes(format(date, 'yyyy-MM-dd'));

const pct = (value: number | null | undefined) => `${Number(value || 0).toFixed(1)}%`;

const greetingFor = (date: Date) => {
  const hour = date.getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
};

const SellerDashboard: React.FC<Props> = ({ currentUser, history, onStartNewCalculation }) => {
  const [record, setRecord] = useState<SellerPerformanceRecord | null>(null);
  const [historyRecords, setHistoryRecords] = useState<SellerPerformanceRecord[]>([]);
  const [performance, setPerformance] = useState<PerformanceConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [mine, mineHistory, perf] = await Promise.all([
        sellerPerformanceService.getMine(currentUser.email),
        sellerPerformanceService.getMyHistory(currentUser.email),
        getDoc(doc(db, 'config/performance')),
      ]);
      setRecord(mine);
      setHistoryRecords(mineHistory);
      if (perf.exists()) {
        const raw = perf.data() as Partial<PerformanceConfig>;
        setPerformance({
          ...DEFAULTS,
          ...raw,
          holidays: Array.isArray(raw.holidays) ? raw.holidays : [],
        });
      }
    } catch (error) {
      console.error('My Performance load error', error);
      setRecord(null);
      setHistoryRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [currentUser.email]);

  useEffect(() => {
    const refresh = () => load();
    window.addEventListener('dealmaster:operational-data-updated', refresh);
    return () => window.removeEventListener('dealmaster:operational-data-updated', refresh);
  }, [currentUser.email]);

  const myDeals = useMemo(
    () => history.filter(h => h.userId === currentUser.id || h.userId === currentUser.email),
    [history, currentUser.id, currentUser.email],
  );

  const openDeals = myDeals.filter(h => h.data.dealStatus !== 'closed').length;
  const goals = {
    monthly: currentUser.goals?.monthly ?? performance.sellerMonthlyGoal,
    firstHalf: currentUser.goals?.firstHalf ?? performance.sellerFirstHalfGoal,
    capture: currentUser.goals?.capture ?? performance.sellerCaptureGoal,
    margin: currentUser.goals?.margin ?? performance.healthyMargin,
  };

  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const greeting = greetingFor(now);
  const firstName = currentUser.name?.split(' ')[0] || 'Vendedor';
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = endOfMonth(now);
  const workDays = eachDayOfInterval({ start: monthStart, end: monthEnd }).filter(d =>
    isWorkingDay(d, performance.holidays),
  );
  const elapsed = workDays.filter(d => !isAfter(d, now));
  const remaining = workDays.filter(d => isAfter(d, now));

  const validHistory = historyRecords.filter(item => item.referenceDate <= today).sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
  const effectiveRecord = validHistory[validHistory.length - 1] || (record?.referenceDate && record.referenceDate <= today ? record : record);

  const trendData: PerformanceTrendPoint[] = validHistory.map(item => ({
    date: item.referenceDate,
    sales: Number(item.metrics.closing || 0),
    projection: Number(item.metrics.projection || 0),
    margin: Number(item.metrics.marginPercent || 0),
    capture: Number(item.metrics.capturePercent || 0),
    evaluations: Number(item.metrics.evaluations || 0),
    closingRate: Number(item.metrics.closingPercent || 0),
  }));

  if (loading) {
    return <div className="grid min-h-[50vh] place-items-center text-sm text-zinc-500">Carregando seu My Performance...</div>;
  }

  if (!effectiveRecord) {
    return (
      <div className="pb-24 md:pb-12 space-y-6 animate-fade-in">
        <section>
          <p className="text-sm text-zinc-500">My Performance</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-white md:text-4xl">{greeting}, {firstName}.</h2>
          <p className="mt-2 text-zinc-400">Seu acesso está protegido. Nenhum dado de outros vendedores é exibido aqui.</p>
        </section>
        <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-7 md:p-9">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Aguardando sincronização</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Seu Mapa de Performance ainda não foi vinculado.</h3>
            <p className="mt-3 text-sm leading-6 text-zinc-400">Quando o gestor atualizar o Mapa de Performance, o DealMaster identifica seu usuário e libera somente os seus indicadores neste painel.</p>
            <button onClick={onStartNewCalculation} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black">Abrir DealGuard <ArrowRight size={17}/></button>
          </div>
        </section>
      </div>
    );
  }

  const metrics = effectiveRecord.metrics;
  const actual = Number(metrics.closing || 0);
  const goal = goals.monthly;
  const expectedToday = goal * elapsed.length / Math.max(workDays.length, 1);
  const projection = Number(metrics.projection || 0);
  const missing = Math.max(goal - actual, 0);
  const dailyNeeded = missing / Math.max(remaining.length, 1);
  const capture = Number(metrics.capturePercent || 0);
  const margin = Number(metrics.marginPercent || 0);
  const closingRate = Number(metrics.closingPercent || 0);
  const refDay = Number(effectiveRecord.referenceDate.slice(8, 10));
  const firstHalfActual = refDay <= 15 ? actual : null;

  const actionPlan: string[] = [];
  if (projection < goal) actionPlan.push(`Recupere o ritmo: sua projeção é ${projection.toFixed(1)} para uma meta de ${goal}. Faltam ${missing} venda(s), cerca de ${dailyNeeded.toFixed(2)} por dia trabalhado restante.`);
  if (capture < goals.capture) actionPlan.push(`Captura em ${capture.toFixed(1)}%. Priorize oportunidades com veículo na troca para buscar a meta de ${goals.capture}%.`);
  if (actual > 0 && margin < goals.margin) actionPlan.push(`Margem MC em ${margin.toFixed(1)}%. Proteja rentabilidade nas próximas negociações para voltar à meta de ${goals.margin}%.`);
  if (metrics.flowTotal > 0 && metrics.evaluations === 0) actionPlan.push(`Você tem ${metrics.flowTotal} oportunidade(s) no fluxo e nenhuma avaliação registrada. Transforme fluxo em avaliação antes de mexer em preço.`);
  if (openDeals > 0 && missing > 0) actionPlan.push(`Existem ${openDeals} negociação(ões) suas no DealGuard. Priorize avanço e fechamento das oportunidades mais maduras.`);
  if (!actionPlan.length) actionPlan.push('Você está dentro do ritmo dos principais objetivos. Mantenha atividade, proteja margem e continue alimentando o funil.');

  const visibleActions = actionPlan.slice(0, 4);
  const statusGood = projection >= goal && capture >= goals.capture && (actual === 0 || margin >= goals.margin);

  return (
    <div className="pb-24 md:pb-12 space-y-6 md:space-y-8 animate-fade-in">
      <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-zinc-500">My Performance · mapa {effectiveRecord.sheetName} · {effectiveRecord.referenceDate}</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-white md:text-4xl">{greeting}, {firstName}.</h2>
          <p className="mt-2 text-zinc-400">Seu ritmo, seus indicadores e o que merece sua atenção hoje.</p>
        </div>
        <span className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-500">Dados privados do seu login</span>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-6 md:p-8">
        <div className="grid gap-7 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
          <div>
            <div className="mb-5 flex items-center gap-2 text-sm text-zinc-400"><Target size={16}/> Minha meta individual</div>
            <div className="flex items-end gap-3"><span className="text-6xl font-semibold tracking-[-0.06em] text-white md:text-7xl">{actual}</span><span className="pb-2 text-xl text-zinc-500">de {goal}</span></div>
            <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white" style={{ width: `${Math.min(actual / Math.max(goal, 1) * 100, 100)}%` }}/></div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Mini label="Esperado hoje" value={expectedToday.toFixed(1)}/>
              <Mini label="Projeção" value={projection.toFixed(1)}/>
              <Mini label="Faltam" value={`${missing}`}/>
              <Mini label="Ritmo necessário" value={`${dailyNeeded.toFixed(2)}/dia`}/>
            </div>
          </div>
          <button onClick={onStartNewCalculation} className="flex min-h-24 items-center justify-between rounded-[26px] bg-white px-5 py-5 text-left text-black">
            <div><span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">DealGuard</span><span className="block text-lg font-semibold">Nova negociação</span><span className="mt-1 block text-sm text-zinc-500">Proteja a margem antes de fechar.</span></div>
            <div className="grid h-11 w-11 place-items-center rounded-full bg-black text-white"><ArrowRight size={20}/></div>
          </button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<CalendarDays size={18}/>} label="Quinzena" value={firstHalfActual === null ? `Meta ${goals.firstHalf}` : `${firstHalfActual}/${goals.firstHalf}`} hint={firstHalfActual === null ? 'Mapa atual após o dia 15' : 'Objetivo até dia 15'}/>
        <Metric icon={<Repeat2 size={18}/>} label="Captura" value={pct(capture)} hint={`${metrics.captureQty} captura(s) · meta ${goals.capture}%`}/>
        <Metric icon={<WalletCards size={18}/>} label="Margem MC" value={pct(margin)} hint={`${formatCurrency(metrics.marginTotal)} · meta ${goals.margin}%`}/>
        <Metric icon={<BarChart3 size={18}/>} label="Avaliações" value={`${metrics.evaluations}`} hint={`${pct(metrics.evaluationRate)} de taxa de avaliação`}/>
      </section>

      <PerformanceTrends
        title="Minha evolução no mês"
        subtitle="Cada atualização do mapa vira um ponto da sua trajetória."
        data={trendData}
        goal={goal}
      />

      <section className={`rounded-[30px] border p-6 md:p-7 ${statusGood ? 'border-emerald-500/20 bg-emerald-500/[0.07]' : 'border-amber-400/20 bg-amber-400/[0.07]'}`}>
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-black"><Crosshair size={20}/></div>
          <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Action Center pessoal</p><h3 className="mt-1 text-xl font-semibold text-white">Seu plano de ação de hoje</h3><div className="mt-4 space-y-3">{visibleActions.map((item, index) => <div key={index} className="flex gap-3 text-sm leading-6 text-zinc-300"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white"/><span>{item}</span></div>)}</div></div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7">
          <div className="flex items-center gap-2 text-zinc-400"><Activity size={17}/><p className="text-xs font-semibold uppercase tracking-[0.14em]">Meu funil</p></div>
          <div className="mt-6 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2"><FunnelStep label="Fluxo" value={`${metrics.flowTotal}`}/><ArrowRight size={16} className="text-zinc-700"/><FunnelStep label="Pedidos" value={`${metrics.orders}`}/><ArrowRight size={16} className="text-zinc-700"/><FunnelStep label="Vendas" value={`${actual}`}/></div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Small label="Passagens" value={`${metrics.passages}`}/><Small label="Pedido %" value={pct(metrics.orderPercent)}/><Small label="Fechamento" value={pct(closingRate)}/><Small label="Caixa d'água" value={`${metrics.pipeline}`}/></div>
        </div>
        <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7">
          <div className="flex items-center gap-2 text-zinc-400"><ClipboardCheck size={17}/><p className="text-xs font-semibold uppercase tracking-[0.14em]">Minha atividade</p></div>
          <div className="mt-5 grid grid-cols-2 gap-3"><Small label="Trab. período" value={`${metrics.workInPeriod}`}/><Small label="Contatos/dia" value={Number(metrics.avgContactsPerDay || 0).toFixed(2)}/><Small label="MC por carro" value={formatCurrency(metrics.marginPerCar)}/><Small label="Compra adicional" value={`${metrics.additionalPurchase}`}/><Small label="Negociações DealGuard" value={`${openDeals}`}/><Small label="Projeção" value={projection.toFixed(1)}/></div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Benchmark icon={<TrendingUp size={16}/>} label="Meta mensal" current={`${actual}`} target={`${goal}`}/>
        <Benchmark icon={<Repeat2 size={16}/>} label="Meta captura" current={pct(capture)} target={`${goals.capture}%`}/>
        <Benchmark icon={<WalletCards size={16}/>} label="Meta margem" current={pct(margin)} target={`${goals.margin}%`}/>
      </section>
    </div>
  );
};

const Mini = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl bg-white/[0.055] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">{label}</p><p className="mt-1 text-lg font-semibold text-white">{value}</p></div>;
const Metric = ({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) => <div className="rounded-[26px] border border-white/10 bg-white/[0.035] p-5"><div className="mb-5 grid h-9 w-9 place-items-center rounded-2xl bg-white/[0.06] text-zinc-300">{icon}</div><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-zinc-600">{hint}</p></div>;
const Small = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl bg-black/20 p-3"><p className="text-[10px] uppercase tracking-[0.1em] text-zinc-600">{label}</p><p className="mt-1 text-sm font-semibold text-zinc-200">{value}</p></div>;
const FunnelStep = ({ label, value }: { label: string; value: string }) => <div className="rounded-[20px] bg-black/25 p-4 text-center"><p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">{label}</p><p className="mt-1 text-2xl font-semibold text-white">{value}</p></div>;
const Benchmark = ({ icon, label, current, target }: { icon: React.ReactNode; label: string; current: string; target: string }) => <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4"><div className="flex items-center gap-2 text-zinc-500">{icon}<span className="text-xs">{label}</span></div><div className="mt-3 flex items-end justify-between gap-3"><span className="text-xl font-semibold text-white">{current}</span><span className="text-xs text-zinc-600">meta {target}</span></div></div>;

export default SellerDashboard;
