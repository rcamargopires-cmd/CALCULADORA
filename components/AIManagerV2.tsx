import React, { useMemo, useState } from 'react';
import { AlertTriangle, BrainCircuit, CheckCircle2, Crosshair, ShieldAlert, Sparkles, X } from 'lucide-react';
import { SavedCalculation, User } from '../types';
import { formatCurrency } from '../utils/currency';

interface PerformanceConfig {
  monthlyGoal: number;
  captureGoal: number;
  healthyMargin: number;
  sellerMonthlyGoal: number;
}

type PriorityLevel = 'critical' | 'warning' | 'good';
type Priority = { id: string; level: PriorityLevel; title: string; reason: string; action: string; metric: string };

interface Props {
  history: SavedCalculation[];
  users: User[];
  performance: PerformanceConfig;
}

const effectiveProfit = (deal: SavedCalculation) => deal.data.closingType === 'banking'
  ? (Number(deal.summary?.profit) || 0) + (Number(deal.data.bankReturn) || 0)
  : Number(deal.summary?.profit) || 0;

const effectiveMargin = (deal: SavedCalculation) => {
  const invoice = Number(deal.data.invoiceValue) || 0;
  return invoice ? (effectiveProfit(deal) / invoice) * 100 : Number(deal.summary?.marginPercent) || 0;
};

const AIManagerV2: React.FC<Props> = ({ history, users, performance }) => {
  const [open, setOpen] = useState(false);

  const data = useMemo(() => {
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = history.filter(d => d.timestamp?.startsWith(prefix));
    const closed = month.filter(d => d.data?.dealStatus === 'closed');
    const openDeals = history.filter(d => d.data?.dealStatus !== 'closed');
    const avgMargin = closed.length ? closed.reduce((s, d) => s + effectiveMargin(d), 0) / closed.length : 0;
    const captured = closed.filter(d => Number(d.data.payments?.tradeIn) > 0).length;
    const capture = closed.length ? (captured / closed.length) * 100 : 0;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const projection = Math.round((closed.length / Math.max(now.getDate(), 1)) * daysInMonth);
    const remainingDays = Math.max(daysInMonth - now.getDate(), 1);
    const dailyNeeded = Math.max(performance.monthlyGoal - closed.length, 0) / remainingDays;
    const expectedToday = (performance.monthlyGoal * now.getDate()) / daysInMonth;
    const aged = openDeals.filter(d => Number(d.data.stockDays) > 60);
    const critical = openDeals.filter(d => Number(d.data.stockDays) > 90);
    const criticalValue = critical.reduce((s, d) => s + (Number(d.data.vehicleCost) || 0), 0);

    const sellerMap = new Map<string, { name: string; count: number; captured: number; marginTotal: number }>();
    closed.forEach(d => {
      const id = d.userId || 'sem-id';
      const current = sellerMap.get(id) || { name: d.userName || 'Sem vendedor', count: 0, captured: 0, marginTotal: 0 };
      current.count += 1;
      if (Number(d.data.payments?.tradeIn) > 0) current.captured += 1;
      current.marginTotal += effectiveMargin(d);
      sellerMap.set(id, current);
    });
    const sellers = Array.from(sellerMap.values()).map(s => ({
      name: s.name,
      count: s.count,
      projection: Math.round((s.count / Math.max(now.getDate(), 1)) * daysInMonth),
      capture: s.count ? (s.captured / s.count) * 100 : 0,
      margin: s.count ? s.marginTotal / s.count : 0,
    }));

    return { actual: closed.length, projection, dailyNeeded, expectedToday, avgMargin, capture, aged, critical, criticalValue, sellers };
  }, [history, performance]);

  const priorities = useMemo<Priority[]>(() => {
    const items: Priority[] = [];
    const paceGap = data.actual - data.expectedToday;

    if (paceGap < -1 || data.projection < performance.monthlyGoal) items.push({
      id: 'volume',
      level: data.projection < performance.monthlyGoal - 5 ? 'critical' : 'warning',
      title: 'Recuperar ritmo de faturamento',
      reason: `Realizado ${data.actual}, esperado ${data.expectedToday.toFixed(1)} e projeção ${data.projection}/${performance.monthlyGoal}.`,
      action: `Concentre o time nas propostas mais maduras. Ritmo necessário: ${data.dailyNeeded.toFixed(1)} carro(s)/dia restante.`,
      metric: `${Math.max(performance.monthlyGoal - data.projection, 0)} abaixo`,
    });

    if (data.critical.length) items.push({
      id: 'stock', level: 'critical', title: 'Destravar estoque crítico',
      reason: `${data.critical.length} veículo(s) acima de 90 dias somam ${formatCurrency(data.criticalValue)} de capital.`,
      action: 'Revisar preço, margem mínima, exposição e clientes aderentes. Flexibilize primeiro nesses carros.',
      metric: `${data.critical.length} críticos`,
    });

    if (data.capture < performance.captureGoal && data.actual > 0) items.push({
      id: 'capture', level: performance.captureGoal - data.capture >= 10 ? 'critical' : 'warning',
      title: 'Elevar captura', reason: `Captura em ${data.capture.toFixed(0)}%, meta ${performance.captureGoal}%.`,
      action: 'Acompanhe a captura por vendedor e priorize negócios com troca quando a margem continuar saudável.',
      metric: `${(performance.captureGoal - data.capture).toFixed(0)} p.p.`,
    });

    if (data.avgMargin < performance.healthyMargin && data.actual > 0) items.push({
      id: 'margin', level: data.avgMargin < performance.healthyMargin - 2 ? 'critical' : 'warning',
      title: 'Proteger margem', reason: `Margem média em ${data.avgMargin.toFixed(1)}%, referência ${performance.healthyMargin}%.`,
      action: 'Preserve margem nos carros novos e concentre concessões no estoque envelhecido.',
      metric: `${(performance.healthyMargin - data.avgMargin).toFixed(1)} p.p.`,
    });

    const weak = data.sellers.filter(s => s.projection < performance.sellerMonthlyGoal || s.capture < performance.captureGoal).sort((a,b) => a.projection - b.projection).slice(0,2);
    if (weak.length) items.push({
      id: 'team', level: 'warning', title: 'Foco individual na equipe',
      reason: weak.map(s => `${s.name}: proj. ${s.projection}, captura ${s.capture.toFixed(0)}%`).join(' • '),
      action: 'Faça um alinhamento curto e defina uma ação objetiva para o próximo bloco do dia.',
      metric: `${weak.length} vendedor(es)`,
    });

    if (!items.length) items.push({ id: 'healthy', level: 'good', title: 'Operação equilibrada', reason: 'Ritmo, captura, margem e estoque estão dentro das referências.', action: 'Mantenha disciplina comercial e preserve margem.', metric: 'Sem alerta' });
    const rank = { critical: 0, warning: 1, good: 2 };
    return items.sort((a,b) => rank[a.level] - rank[b.level]).slice(0,3);
  }, [data, performance]);

  const health = useMemo(() => {
    const criticals = priorities.filter(p => p.level === 'critical').length;
    const warnings = priorities.filter(p => p.level === 'warning').length;
    if (criticals >= 2) return { label: 'Crítico', tone: 'critical' as const };
    if (criticals === 1 || warnings >= 2) return { label: 'Atenção', tone: 'warning' as const };
    return { label: 'Saudável', tone: 'good' as const };
  }, [priorities]);

  return <>
    <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-[140] flex items-center gap-2 rounded-full border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-black shadow-2xl shadow-black/50 transition active:scale-95">
      <BrainCircuit size={18}/> AI Manager
      <span className={`h-2 w-2 rounded-full ${health.tone === 'critical' ? 'bg-red-500' : health.tone === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`}/>
    </button>

    {open && <div className="fixed inset-0 z-[200] bg-black/70 p-3 backdrop-blur-md md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-[32px] border border-white/10 bg-zinc-950 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 p-5 md:p-6">
          <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-black"><BrainCircuit size={21}/></div><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">DealMaster AI Manager</p><h3 className="mt-1 text-xl font-semibold text-white">Plano de ação do dia</h3></div></div>
          <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><X size={18}/></button>
        </div>
        <div className="overflow-y-auto p-5 md:p-6">
          <div className={`rounded-[24px] border p-5 ${health.tone === 'critical' ? 'border-red-500/20 bg-red-500/[0.08]' : health.tone === 'warning' ? 'border-amber-400/20 bg-amber-400/[0.08]' : 'border-emerald-500/20 bg-emerald-500/[0.08]'}`}>
            <div className="flex items-center justify-between"><span className="text-sm text-zinc-400">Saúde da operação</span><span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-semibold text-zinc-200">{health.label}</span></div>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4"><ManagerMetric label="Projeção" value={`${data.projection}/${performance.monthlyGoal}`} ok={data.projection >= performance.monthlyGoal}/><ManagerMetric label="Captura" value={`${data.capture.toFixed(0)}%`} ok={data.capture >= performance.captureGoal}/><ManagerMetric label="Margem" value={`${data.avgMargin.toFixed(1)}%`} ok={data.avgMargin >= performance.healthyMargin}/><ManagerMetric label="Estoque +90d" value={`${data.critical.length}`} ok={!data.critical.length}/></div>
          </div>
          <div className="mt-5 space-y-3">{priorities.map((p,index) => <div key={p.id} className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4 md:p-5"><div className="flex items-start gap-4"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${p.level === 'critical' ? 'bg-red-500/12 text-red-400' : p.level === 'warning' ? 'bg-amber-400/12 text-amber-400' : 'bg-emerald-500/12 text-emerald-400'}`}>{p.level === 'critical' ? <ShieldAlert size={17}/> : p.level === 'warning' ? <AlertTriangle size={17}/> : <CheckCircle2 size={17}/>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium text-white">{index + 1}. {p.title}</h4><span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] text-zinc-400">{p.metric}</span></div><p className="mt-2 text-xs leading-5 text-zinc-500">{p.reason}</p><div className="mt-3 flex items-start gap-2 text-sm leading-5 text-zinc-300"><Crosshair size={15} className="mt-0.5 shrink-0 text-zinc-600"/><span>{p.action}</span></div></div></div></div>)}</div>
          <div className="mt-5 flex items-center gap-2 rounded-2xl bg-white/[0.03] p-4 text-xs leading-5 text-zinc-500"><Sparkles size={15} className="shrink-0"/> O AI Manager usa somente os dados já carregados pelo DealMaster. Nenhuma leitura paralela do Firebase.</div>
        </div>
      </div>
    </div>}
  </>;
};

const ManagerMetric = ({label,value,ok}:{label:string;value:string;ok:boolean}) => <div className="rounded-2xl bg-black/20 p-3"><div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</span><span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`}/></div><p className="mt-1 text-base font-semibold text-zinc-200">{value}</p></div>;

export default AIManagerV2;
