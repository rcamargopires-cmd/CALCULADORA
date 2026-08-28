import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  RefreshCw,
  Repeat2,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { User } from '../types';
import { formatCurrency } from '../utils/currency';
import { aggregatePerformanceSnapshot } from '../services/performanceMetrics';
import { StoreStockHistoryPoint, storeScopedOperationalService } from '../services/storeScopedOperationalService';
import { ActionTask, actionTaskService } from '../services/actionTaskService';

type Props = {
  currentUser: User;
  companyId: string;
  storeId: string;
  storeName: string;
};

type ImpactDelta = {
  label: string;
  current: string;
  baseline?: string;
  delta?: number;
  suffix?: string;
  direction: 'higher' | 'lower';
};

const monthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const deltaText = (value: number, suffix = '') => `${value > 0 ? '+' : ''}${value.toFixed(1)}${suffix}`;

const MotyqImpact: React.FC<Props> = ({ currentUser, companyId, storeId, storeName }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<ActionTask[]>([]);
  const [stockHistory, setStockHistory] = useState<StoreStockHistoryPoint[]>([]);
  const [currentCritical, setCurrentCritical] = useState(0);
  const [currentCriticalValue, setCurrentCriticalValue] = useState(0);
  const [currentPerformance, setCurrentPerformance] = useState<ReturnType<typeof aggregatePerformanceSnapshot>>(null);
  const [performanceHistory, setPerformanceHistory] = useState<Awaited<ReturnType<typeof storeScopedOperationalService.getPerformanceHistory>>>([]);
  const [feedback, setFeedback] = useState('');

  const load = async () => {
    if (!companyId || !storeId) return;
    setLoading(true);
    try {
      const [stock, performance, perfHistory, stockHistoryRows, taskRows] = await Promise.all([
        storeScopedOperationalService.getLatestStock(storeId, companyId),
        storeScopedOperationalService.getLatestPerformance(storeId, companyId),
        storeScopedOperationalService.getPerformanceHistory(storeId, companyId),
        storeScopedOperationalService.getStockHistory(storeId, companyId),
        actionTaskService.list(companyId, storeId),
      ]);
      const critical = stock.filter(item => Number(item.stockDays || 0) > 90);
      setCurrentCritical(critical.length);
      setCurrentCriticalValue(critical.reduce((sum, item) => sum + Number(item.cost || 0), 0));
      setCurrentPerformance(performance ? aggregatePerformanceSnapshot(performance) : null);
      setPerformanceHistory(perfHistory);
      setStockHistory(stockHistoryRows);
      setTasks(taskRows);
      setFeedback('');
    } catch (error) {
      console.error('Motyq impact load error', error);
      setFeedback('Não consegui atualizar o Impacto Motyq agora.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener('motyq:action-task-updated', refresh);
    window.addEventListener('dealmaster:operational-data-updated', refresh);
    window.addEventListener('motyq:operational-data-updated', refresh);
    return () => {
      window.removeEventListener('motyq:action-task-updated', refresh);
      window.removeEventListener('dealmaster:operational-data-updated', refresh);
      window.removeEventListener('motyq:operational-data-updated', refresh);
    };
  }, [companyId, storeId]);

  const month = monthKey();
  const monthTasks = useMemo(() => tasks.filter(task => String(task.sourceDate || '').startsWith(month)), [tasks, month]);
  const doneTasks = useMemo(() => monthTasks.filter(task => task.status === 'done'), [monthTasks]);
  const resultTasks = useMemo(() => doneTasks.filter(task => String(task.result || '').trim()), [doneTasks]);
  const completion = monthTasks.length ? (doneTasks.length / monthTasks.length) * 100 : 0;

  const baselinePerformance = useMemo(() => {
    const rows = performanceHistory
      .filter(item => String(item.referenceDate || '').startsWith(month))
      .sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
    return rows.length ? aggregatePerformanceSnapshot(rows[0]) : null;
  }, [performanceHistory, month]);

  const baselineStock = useMemo(() => stockHistory
    .filter(item => String(item.referenceDate || '').startsWith(month))
    .sort((a, b) => a.referenceDate.localeCompare(b.referenceDate))[0], [stockHistory, month]);

  const deltas: ImpactDelta[] = useMemo(() => {
    const rows: ImpactDelta[] = [];
    if (currentPerformance) {
      const captureNow = Number(currentPerformance.capturePercent || 0);
      const marginNow = Number(currentPerformance.marginPercent || 0);
      const projectionNow = Number(currentPerformance.projection || 0);
      rows.push({
        label: 'Captura', current: `${captureNow.toFixed(1)}%`,
        baseline: baselinePerformance ? `${Number(baselinePerformance.capturePercent || 0).toFixed(1)}%` : undefined,
        delta: baselinePerformance ? captureNow - Number(baselinePerformance.capturePercent || 0) : undefined,
        suffix: ' p.p.', direction: 'higher',
      });
      rows.push({
        label: 'Margem MC', current: `${marginNow.toFixed(1)}%`,
        baseline: baselinePerformance ? `${Number(baselinePerformance.marginPercent || 0).toFixed(1)}%` : undefined,
        delta: baselinePerformance ? marginNow - Number(baselinePerformance.marginPercent || 0) : undefined,
        suffix: ' p.p.', direction: 'higher',
      });
      rows.push({
        label: 'Projeção', current: projectionNow.toFixed(1),
        baseline: baselinePerformance ? Number(baselinePerformance.projection || 0).toFixed(1) : undefined,
        delta: baselinePerformance ? projectionNow - Number(baselinePerformance.projection || 0) : undefined,
        suffix: '', direction: 'higher',
      });
    }
    rows.push({
      label: 'Veículos +90', current: `${currentCritical}`,
      baseline: baselineStock ? `${Number(baselineStock.critical90 || 0)}` : undefined,
      delta: baselineStock ? currentCritical - Number(baselineStock.critical90 || 0) : undefined,
      suffix: '', direction: 'lower',
    });
    return rows;
  }, [currentPerformance, baselinePerformance, currentCritical, baselineStock]);

  const positiveSignals = deltas.filter(item => item.delta !== undefined && (item.direction === 'higher' ? item.delta > 0 : item.delta < 0)).length;
  const stockCapitalDelta = baselineStock ? currentCriticalValue - Number(baselineStock.critical90Value || 0) : undefined;

  return <>
    <button
      onClick={() => { setOpen(true); load(); }}
      title="Impacto Motyq"
      className="fixed right-[22px] top-[170px] z-[141] flex w-[220px] items-center gap-3 rounded-[18px] border border-emerald-300/20 bg-[#1b2425]/95 px-4 py-3 text-left text-white shadow-2xl shadow-black/35 transition hover:border-emerald-300/40 active:scale-[0.99] max-[900px]:right-[12px] max-[900px]:top-[138px] max-[900px]:w-[172px]"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-300"><CircleDollarSign size={18}/></div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-emerald-300">IMPACTO MOTYQ</p>
        <p className="mt-0.5 truncate text-xs font-semibold text-white">{doneTasks.length ? `${doneTasks.length} ação(ões) concluída(s)` : `${currentCritical} veículo(s) +90`}</p>
      </div>
      {(doneTasks.length > 0 || positiveSignals > 0) && <span className="grid min-w-6 place-items-center rounded-full bg-emerald-300 px-1.5 py-1 text-[10px] font-black text-emerald-950">{doneTasks.length || positiveSignals}</span>}
    </button>

    {open && <div className="fixed inset-0 z-[285] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[34px] border border-white/10 bg-[#171a20] shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex flex-col gap-4 border-b border-white/10 p-5 md:flex-row md:items-start md:justify-between md:p-7">
          <div className="flex gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-300"><Activity size={21}/></div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">MOTYQ · IMPACTO</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">O que mudou na operação</h2>
              <p className="mt-1 text-sm text-zinc-500">{storeName} · comparação com a primeira leitura disponível deste mês.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/></button>
            <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400"><X size={18}/></button>
          </div>
        </header>

        <div className="space-y-6 p-5 md:p-7">
          {feedback && <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] px-4 py-3 text-sm text-amber-100">{feedback}</div>}

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ImpactCard icon={<CheckCircle2 size={18}/>} label="Ações concluídas" value={`${doneTasks.length}`} hint={`${monthTasks.length} atribuída(s) no mês`} />
            <ImpactCard icon={<Target size={18}/>} label="Taxa de execução" value={`${completion.toFixed(0)}%`} hint={`${resultTasks.length} com resultado registrado`} />
            <ImpactCard icon={<CircleDollarSign size={18}/>} label="Capital crítico atual" value={formatCurrency(currentCriticalValue)} hint={`${currentCritical} veículo(s) acima de 90 dias`} />
            <ImpactCard icon={<Activity size={18}/>} label="Sinais positivos" value={`${positiveSignals}`} hint="indicadores com evolução favorável" />
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 md:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-600">EVOLUÇÃO OBSERVADA</p>
                <h3 className="mt-1 text-xl font-semibold text-white">Primeira leitura do mês → agora</h3>
              </div>
              {stockCapitalDelta !== undefined && <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${stockCapitalDelta <= 0 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>Capital +90: {stockCapitalDelta > 0 ? '+' : ''}{formatCurrency(stockCapitalDelta)}</span>}
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {deltas.map(item => <DeltaCard key={item.label} item={item}/>)}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 md:p-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-600">PROVA DE EXECUÇÃO</p>
                <h3 className="mt-1 text-xl font-semibold text-white">Resultados registrados pela equipe</h3>
              </div>
              <span className="text-xs text-zinc-600">{resultTasks.length} registro(s)</span>
            </div>
            <div className="mt-4 space-y-3">
              {!resultTasks.length ? <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-600">Quando uma ação for concluída com resultado, ela vira evidência aqui.</div> : resultTasks.slice(0, 8).map(task => <article key={task.id} className="rounded-[20px] border border-white/10 bg-black/15 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-white">{task.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">{task.assignedToName || task.assignedToEmail} · {task.scope}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black text-emerald-300">CONCLUÍDA</span>
                </div>
                <p className="mt-3 rounded-xl bg-white/[0.035] px-3 py-2.5 text-sm leading-6 text-zinc-300">{task.result}</p>
              </article>)}
            </div>
          </section>

          <div className="rounded-2xl border border-sky-300/10 bg-sky-300/[0.035] px-4 py-3 text-xs leading-5 text-sky-100/70">
            O Impacto Motyq mostra evolução operacional e execução registradas no sistema. Ele não atribui causalidade automática ao Motyq, evitando transformar correlação em promessa comercial.
          </div>
        </div>
      </div>
    </div>}
  </>;
};

const ImpactCard = ({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) => <div className="rounded-[22px] border border-white/10 bg-white/[0.035] p-4"><div className="mb-4 grid h-9 w-9 place-items-center rounded-xl bg-white/[0.05] text-zinc-300">{icon}</div><p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-zinc-600">{hint}</p></div>;

const DeltaCard = ({ item }: { item: ImpactDelta }) => {
  const hasDelta = item.delta !== undefined;
  const positive = hasDelta && (item.direction === 'higher' ? Number(item.delta) > 0 : Number(item.delta) < 0);
  const neutral = !hasDelta || Number(item.delta) === 0;
  return <div className="rounded-[20px] border border-white/10 bg-black/15 p-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs text-zinc-500">{item.label}</p>
        <p className="mt-1 text-xl font-semibold text-white">{item.current}</p>
        <p className="mt-1 text-[11px] text-zinc-600">{item.baseline ? `início: ${item.baseline}` : 'sem base histórica suficiente'}</p>
      </div>
      <div className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${neutral ? 'bg-white/[0.05] text-zinc-500' : positive ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>
        {neutral ? <BarChart3 size={13}/> : positive ? <TrendingUp size={13}/> : <TrendingDown size={13}/>}
        {hasDelta ? deltaText(Number(item.delta), item.suffix) : 'base pendente'}
      </div>
    </div>
  </div>;
};

export default MotyqImpact;
