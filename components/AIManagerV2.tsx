import React, { useEffect, useMemo, useState } from 'react';
import {
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Database,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { OperationalPerformanceSnapshot, OperationalStockItem, User } from '../types';
import { normalize, OperationalStockHistoryPoint, operationalDataService } from '../services/operationalDataService';
import { userService } from '../services/userService';
import {
  buildManagerIntelligence,
  generateManagerAiBrief,
  ManagerAiBrief,
  ManagerAiContext,
  ManagerAiSignal,
  SellerGoalMap,
} from '../services/managerAiService';

interface PerformanceConfig {
  monthlyGoal: number;
  captureGoal: number;
  healthyMargin: number;
  sellerMonthlyGoal: number;
  sellerCaptureGoal: number;
  holidays: string[];
}

const DEFAULTS: PerformanceConfig = {
  monthlyGoal: 70,
  captureGoal: 60,
  healthyMargin: 8,
  sellerMonthlyGoal: 15,
  sellerCaptureGoal: 60,
  holidays: [],
};

const AIManagerV2: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [stock, setStock] = useState<OperationalStockItem[]>([]);
  const [snapshot, setSnapshot] = useState<OperationalPerformanceSnapshot | null>(null);
  const [performanceHistory, setPerformanceHistory] = useState<OperationalPerformanceSnapshot[]>([]);
  const [stockHistory, setStockHistory] = useState<OperationalStockHistoryPoint[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [performance, setPerformance] = useState<PerformanceConfig>(DEFAULTS);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [stockData, performanceData, historyData, stockHistoryData, userData, perfSnap] = await Promise.all([
        operationalDataService.getLatestStock(),
        operationalDataService.getLatestPerformance(),
        operationalDataService.getPerformanceHistory(),
        operationalDataService.getStockHistory(),
        userService.getAll(),
        getDoc(doc(db, 'config/performance')),
      ]);
      setStock(stockData);
      setSnapshot(performanceData);
      setPerformanceHistory(historyData);
      setStockHistory(stockHistoryData);
      setUsers(userData.filter(user => user.status === 'active'));
      if (perfSnap.exists()) {
        const raw = perfSnap.data() as Partial<PerformanceConfig>;
        setPerformance({
          ...DEFAULTS,
          ...raw,
          holidays: Array.isArray(raw.holidays) ? raw.holidays : [],
        });
      }
      setLoadedOnce(true);
    } catch (error) {
      console.error('DealMaster AI V3: erro ao carregar dados', error);
      setLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const refresh = () => {
      setAiText('');
      setAiError('');
      load();
    };
    window.addEventListener('dealmaster:operational-data-updated', refresh);
    return () => window.removeEventListener('dealmaster:operational-data-updated', refresh);
  }, []);

  const sellerGoals = useMemo<SellerGoalMap>(() => {
    const result: SellerGoalMap = {};
    (snapshot?.sellers || []).forEach(seller => {
      const user = users.find(item => normalize(item.name || '') === seller.sellerKey);
      result[seller.sellerKey] = {
        monthly: user?.goals?.monthly ?? performance.sellerMonthlyGoal,
        capture: user?.goals?.capture ?? performance.sellerCaptureGoal,
        margin: user?.goals?.margin ?? performance.healthyMargin,
      };
    });
    return result;
  }, [snapshot, users, performance]);

  const context = useMemo<ManagerAiContext>(() => ({
    snapshot,
    performanceHistory,
    stock,
    stockHistory,
    goals: {
      monthlyGoal: performance.monthlyGoal,
      captureGoal: performance.captureGoal,
      marginGoal: performance.healthyMargin,
      sellerMonthlyGoal: performance.sellerMonthlyGoal,
      sellerCaptureGoal: performance.sellerCaptureGoal,
      sellerMarginGoal: performance.healthyMargin,
    },
    sellerGoals,
  }), [snapshot, performanceHistory, stock, stockHistory, performance, sellerGoals]);

  const brief = useMemo<ManagerAiBrief>(() => buildManagerIntelligence(context), [context]);

  const runAi = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      setAiText(await generateManagerAiBrief(brief));
    } catch (error: any) {
      console.error('DealMaster AI V3 briefing error', error);
      setAiError(error?.message?.includes('GEMINI_API_KEY')
        ? 'A IA generativa ainda não está configurada neste ambiente. O motor analítico do DealMaster continua funcionando normalmente.'
        : 'Não consegui gerar o briefing agora. Os sinais e recomendações do motor DealMaster continuam válidos.');
    } finally {
      setAiLoading(false);
    }
  };

  const health = brief.status === 'critical'
    ? { label: 'Crítico', dot: 'bg-red-500', chip: 'bg-red-500/10 text-red-300' }
    : brief.status === 'attention'
      ? { label: 'Atenção', dot: 'bg-amber-400', chip: 'bg-amber-400/10 text-amber-300' }
      : { label: 'Saudável', dot: 'bg-emerald-400', chip: 'bg-emerald-500/10 text-emerald-300' };

  return <>
    <button
      onClick={() => { setOpen(true); load(); }}
      className="fixed bottom-5 right-5 z-[140] flex items-center gap-2 rounded-full border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-black shadow-2xl shadow-black/50 transition active:scale-95"
    >
      <BrainCircuit size={18}/>
      DealMaster AI
      <span className={`h-2 w-2 rounded-full ${health.dot}`}/>
    </button>

    {open && <div className="fixed inset-0 z-[240] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto flex min-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[34px] border border-white/10 bg-zinc-950 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 p-5 md:p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-black"><BrainCircuit size={21}/></div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">DealMaster AI · V3</p>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${health.chip}`}>{health.label}</span>
              </div>
              <h3 className="mt-1 text-xl font-semibold text-white">Copiloto da operação</h3>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/></button>
            <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><X size={18}/></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 md:p-6">
          {!loadedOnce || loading ? (
            <div className="grid min-h-[60vh] place-items-center text-zinc-500"><div className="text-center"><RefreshCw className="mx-auto mb-3 animate-spin"/><p>Interpretando a operação...</p></div></div>
          ) : <>
            <section className="rounded-[28px] border border-white/10 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-5 md:p-7">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Leitura executiva do motor DealMaster</p>
                  <h4 className="mt-2 text-2xl font-semibold tracking-tight text-white">{brief.headline}</h4>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">{brief.summary}</p>
                </div>
                <button
                  onClick={runAi}
                  disabled={aiLoading || !snapshot}
                  className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {aiLoading ? <RefreshCw size={16} className="animate-spin"/> : <Sparkles size={16}/>} 
                  {aiLoading ? 'Analisando...' : aiText ? 'Atualizar briefing IA' : 'Gerar briefing IA'}
                </button>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <AiMetric label="Vendas" value={`${brief.metrics.sales}`} />
                <AiMetric label="Projeção" value={brief.metrics.projection.toFixed(1)} delta={brief.metrics.projectionDelta}/>
                <AiMetric label="Captura" value={`${brief.metrics.capture.toFixed(1)}%`} delta={brief.metrics.captureDelta} suffix=" p.p."/>
                <AiMetric label="Margem MC" value={`${brief.metrics.margin.toFixed(1)}%`} delta={brief.metrics.marginDelta} suffix=" p.p."/>
              </div>
            </section>

            <div className="mt-5 grid gap-5 xl:grid-cols-[1.12fr_.88fr]">
              <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 md:p-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600">Motor de decisão</p>
                    <h4 className="mt-1 text-lg font-semibold text-white">O que merece ação agora</h4>
                  </div>
                  <span className="text-xs text-zinc-600">priorizado por impacto</span>
                </div>
                <div className="mt-4 space-y-3">
                  {brief.signals.slice(0, 6).map((signal, index) => <SignalCard key={`${signal.title}-${index}`} signal={signal}/>) }
                </div>
              </section>

              <div className="space-y-5">
                <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 md:p-6">
                  <div className="flex items-center gap-2 text-zinc-600"><Users size={15}/><p className="text-xs font-semibold uppercase tracking-[0.14em]">Foco da equipe</p></div>
                  <h4 className="mt-1 text-lg font-semibold text-white">Quem precisa de atenção</h4>
                  <div className="mt-4 space-y-2">
                    {!brief.sellerFocus.length ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 text-sm text-emerald-200">Nenhum vendedor aparece como prioridade pelos indicadores atuais.</div> : brief.sellerFocus.map(item => (
                      <div key={item.sellerKey} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex items-center justify-between gap-4"><div><p className="font-medium text-white">{item.seller}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{item.reason}</p></div><ChevronRight size={16} className="text-zinc-700"/></div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-[28px] border border-violet-400/15 bg-violet-400/[0.055] p-5 md:p-6">
                  <div className="flex items-center gap-2 text-violet-300"><Sparkles size={15}/><p className="text-xs font-semibold uppercase tracking-[0.14em]">Briefing executivo IA</p></div>
                  {aiText ? <p className="mt-4 whitespace-pre-line text-sm leading-6 text-zinc-200">{aiText}</p> : aiError ? <p className="mt-4 text-sm leading-6 text-amber-200">{aiError}</p> : <p className="mt-4 text-sm leading-6 text-zinc-500">O motor DealMaster já fez o diagnóstico. Clique em “Gerar briefing IA” para transformar os sinais em uma leitura curta para a reunião diária.</p>}
                </section>
              </div>
            </div>

            <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SecondaryMetric label="Estoque atual" value={`${stock.length} carros`} />
              <SecondaryMetric label="+60 dias" value={`${brief.metrics.agedStock}`} />
              <SecondaryMetric label="+90 dias" value={`${brief.metrics.criticalStock}`} />
              <SecondaryMetric label="Capital +90" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(brief.metrics.criticalStockValue)} />
            </section>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-xs leading-5 text-zinc-600">
              <span className="flex items-center gap-2"><Database size={14}/> Mapa: {snapshot ? `${snapshot.sheetName} · ${snapshot.referenceDate}` : 'não importado'}</span>
              <span>Histórico: {performanceHistory.length} snapshot(s)</span>
              <span>Estoque: {stock[0]?.snapshotDate || 'sem data'}</span>
              <span>Histórico estoque: {stockHistory.length} snapshot(s)</span>
            </div>
          </>}
        </div>
      </div>
    </div>}
  </>;
};

const signalToneClasses = {
  critical: 'border-red-500/20 bg-red-500/[0.065]',
  attention: 'border-amber-400/20 bg-amber-400/[0.06]',
  positive: 'border-emerald-500/20 bg-emerald-500/[0.06]',
};

const SignalCard = ({ signal }: { signal: ManagerAiSignal }) => (
  <div className={`rounded-[22px] border p-4 ${signalToneClasses[signal.tone]}`}>
    <div className="flex gap-3">
      <div className={`mt-0.5 ${signal.tone === 'critical' ? 'text-red-300' : signal.tone === 'attention' ? 'text-amber-300' : 'text-emerald-300'}`}>
        {signal.tone === 'positive' ? <CheckCircle2 size={18}/> : <CircleAlert size={18}/>} 
      </div>
      <div>
        <p className="font-semibold text-white">{signal.title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-400">{signal.evidence}</p>
        <p className="mt-2 text-sm leading-5 text-zinc-200"><span className="text-zinc-500">Ação:</span> {signal.action}</p>
      </div>
    </div>
  </div>
);

const AiMetric = ({ label, value, delta, suffix = '' }: { label: string; value: string; delta?: number; suffix?: string }) => {
  const hasDelta = delta !== undefined && Math.abs(delta) > 0.001;
  const positive = Number(delta || 0) > 0;
  return <div className="rounded-[20px] border border-white/10 bg-black/20 p-4">
    <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">{label}</p>
    <div className="mt-2 flex items-end justify-between gap-2">
      <span className="text-xl font-semibold text-white">{value}</span>
      {hasDelta && <span className={`flex items-center gap-1 text-xs ${positive ? 'text-emerald-400' : 'text-red-400'}`}>{positive ? <TrendingUp size={13}/> : <TrendingDown size={13}/>} {positive ? '+' : ''}{Number(delta).toFixed(1)}{suffix}</span>}
    </div>
  </div>;
};

const SecondaryMetric = ({ label, value }: { label: string; value: string }) => <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] uppercase tracking-[0.1em] text-zinc-600">{label}</p><p className="mt-2 text-lg font-semibold text-white">{value}</p></div>;

export default AIManagerV2;
