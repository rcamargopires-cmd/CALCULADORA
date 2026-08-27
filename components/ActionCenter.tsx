import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ListTodo,
  Play,
  Plus,
  RefreshCw,
  Save,
  Target,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { OperationalPerformanceSnapshot, OperationalStockItem, User } from '../types';
import { aggregatePerformanceSnapshot, officialClosingCount } from '../services/performanceMetrics';
import { storeScopedOperationalService } from '../services/storeScopedOperationalService';
import { userService } from '../services/userService';
import { ActionTask, actionTaskService } from '../services/actionTaskService';

type Tone = 'critical' | 'warning' | 'info';
type ActionItem = {
  id: string;
  tone: Tone;
  priority: number;
  scope: string;
  title: string;
  evidence: string;
  action: string;
  metric?: string;
};

type PerformanceConfig = {
  monthlyGoal: number;
  captureGoal: number;
  healthyMargin: number;
  sellerMonthlyGoal: number;
  sellerCaptureGoal: number;
};

type Props = {
  currentUser: User;
  companyId: string;
  storeId: string;
  storeName: string;
};

type Draft = { assignedToEmail: string; dueDate: string };
type View = 'priorities' | 'tasks';

const DEFAULTS: PerformanceConfig = {
  monthlyGoal: 70,
  captureGoal: 60,
  healthyMargin: 8,
  sellerMonthlyGoal: 15,
  sellerCaptureGoal: 60,
};

const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const plusDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const brl = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
}).format(value || 0);

const normalize = (value: string) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

const toneRank: Record<Tone, number> = { critical: 0, warning: 1, info: 2 };

const ActionCenter: React.FC<Props> = ({ currentUser, companyId, storeId, storeName }) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('priorities');
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snapshot, setSnapshot] = useState<OperationalPerformanceSnapshot | null>(null);
  const [stock, setStock] = useState<OperationalStockItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<ActionTask[]>([]);
  const [config, setConfig] = useState<PerformanceConfig>(DEFAULTS);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ assignedToEmail: '', dueDate: plusDays(1) });
  const [results, setResults] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [performance, stockRows, team, configSnap, savedTasks] = await Promise.all([
        storeScopedOperationalService.getLatestPerformance(storeId, companyId),
        storeScopedOperationalService.getLatestStock(storeId, companyId),
        userService.getAll(companyId, storeId),
        getDoc(doc(db, 'config/performance')),
        actionTaskService.list(companyId, storeId),
      ]);
      setSnapshot(performance);
      setStock(stockRows);
      setUsers(team.filter(user => user.status === 'active'));
      setTasks(savedTasks);
      setResults(Object.fromEntries(savedTasks.map(task => [task.id, task.result || ''])));
      if (configSnap.exists()) {
        const raw = configSnap.data() as Partial<PerformanceConfig>;
        setConfig({ ...DEFAULTS, ...raw });
      }
    } catch (error) {
      console.error('Motyq Action Center load error', error);
      setFeedback('Não consegui atualizar o Centro de Ação agora.');
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
  }, [companyId, storeId]);

  const actions = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = [];
    const today = localDate();
    const total = aggregatePerformanceSnapshot(snapshot);

    if (!snapshot) {
      items.push({
        id: 'missing-performance', tone: 'critical', priority: 0, scope: 'Dados',
        title: 'Atualizar o Mapa de Performance',
        evidence: 'Sem o mapa atual, o Motyq não consegue priorizar ritmo, captura, margem e equipe.',
        action: 'Importe o Mapa de Performance antes da reunião diária.',
        metric: 'Sem mapa',
      });
    } else {
      if (snapshot.referenceDate && snapshot.referenceDate < today) {
        items.push({
          id: 'stale-performance', tone: 'warning', priority: 1, scope: 'Dados',
          title: 'Mapa de Performance está desatualizado',
          evidence: `Última fotografia da operação: ${snapshot.referenceDate.split('-').reverse().join('/')}.`,
          action: 'Atualize o mapa para que as prioridades de hoje reflitam a operação real.',
          metric: snapshot.referenceDate.split('-').reverse().slice(0, 2).join('/'),
        });
      }

      if (total) {
        const projection = Number(total.projection || 0);
        const projectionGap = Math.max(config.monthlyGoal - projection, 0);
        if (projectionGap > 0) {
          const ratio = projection / Math.max(config.monthlyGoal, 1);
          items.push({
            id: 'projection-gap', tone: ratio < 0.85 || projectionGap >= 10 ? 'critical' : 'warning',
            priority: ratio < 0.85 ? 0.4 : 1.4, scope: 'Vendas',
            title: `Recuperar ${projectionGap.toFixed(1)} venda(s) de projeção`,
            evidence: `Projeção atual ${projection.toFixed(1)} para meta ${config.monthlyGoal}.`,
            action: 'Atue primeiro em avaliações, propostas abertas e oportunidades com maior chance de fechamento. Evite desconto generalizado.',
            metric: `${projection.toFixed(1)}/${config.monthlyGoal}`,
          });
        }

        const capture = Number(total.capturePercent || 0);
        if (officialClosingCount(total) > 0 && capture < config.captureGoal) {
          const gap = config.captureGoal - capture;
          items.push({
            id: 'capture-gap', tone: gap >= 15 ? 'critical' : 'warning', priority: gap >= 15 ? 0.8 : 1.8, scope: 'Captura',
            title: `Captura está ${gap.toFixed(1)} p.p. abaixo da meta`,
            evidence: `Captura atual ${capture.toFixed(1)}%. Meta da loja: ${config.captureGoal}%.`,
            action: 'Revise negociações sem troca e direcione a equipe para geração e valorização de avaliações.',
            metric: `${capture.toFixed(1)}%`,
          });
        }

        const margin = Number(total.marginPercent || 0);
        if (officialClosingCount(total) > 0 && margin < config.healthyMargin) {
          const gap = config.healthyMargin - margin;
          items.push({
            id: 'margin-gap', tone: gap >= 2 ? 'critical' : 'warning', priority: gap >= 2 ? 0.9 : 1.9, scope: 'Margem',
            title: `Proteger ${gap.toFixed(1)} p.p. de margem`,
            evidence: `MC atual ${margin.toFixed(1)}%. Faixa saudável configurada: ${config.healthyMargin}%.`,
            action: 'Revise as negociações de menor rentabilidade e trabalhe financiamento, troca e custos antes de mexer no preço.',
            metric: `${margin.toFixed(1)}%`,
          });
        }
      }

      const sellerRisks = (snapshot.sellers || []).map(seller => {
        const user = users.find(item => normalize(item.name) === normalize(seller.seller));
        const monthlyGoal = user?.goals?.monthly ?? config.sellerMonthlyGoal;
        const captureGoal = user?.goals?.capture ?? config.sellerCaptureGoal;
        const marginGoal = user?.goals?.margin ?? config.healthyMargin;
        const projection = Number(seller.projection || 0);
        const capture = Number(seller.capturePercent || 0);
        const margin = Number(seller.marginPercent || 0);
        const sales = officialClosingCount(seller);
        const reasons: string[] = [];
        let score = 0;
        if (projection < monthlyGoal * 0.8) { reasons.push(`proj. ${projection.toFixed(1)}/${monthlyGoal}`); score += 3; }
        else if (projection < monthlyGoal) { reasons.push(`proj. ${projection.toFixed(1)}/${monthlyGoal}`); score += 1; }
        if (sales > 0 && capture < captureGoal - 10) { reasons.push(`captura ${capture.toFixed(1)}%`); score += 2; }
        if (sales > 0 && margin < marginGoal - 1) { reasons.push(`MC ${margin.toFixed(1)}%`); score += 2; }
        return { seller: seller.seller, reasons, score };
      }).filter(item => item.score >= 2).sort((a, b) => b.score - a.score);

      if (sellerRisks.length) {
        const focus = sellerRisks.slice(0, 3);
        items.push({
          id: 'seller-focus', tone: focus.some(item => item.score >= 4) ? 'critical' : 'warning', priority: 1.2, scope: 'Equipe',
          title: `${sellerRisks.length} vendedor(es) pedem gestão individual`,
          evidence: focus.map(item => `${item.seller}: ${item.reasons.join(' · ')}`).join(' | '),
          action: 'Faça uma intervenção curta por vendedor: gargalo, próxima oportunidade e ação concreta para hoje.',
          metric: `${sellerRisks.length} em foco`,
        });
      }
    }

    if (!stock.length) {
      items.push({
        id: 'missing-stock', tone: 'warning', priority: 2, scope: 'Estoque',
        title: 'Atualizar fotografia do estoque', evidence: 'Nenhum estoque atual foi encontrado para esta unidade.',
        action: 'Importe o estoque para o Motyq identificar capital parado e veículos críticos.', metric: 'Sem estoque',
      });
    } else {
      const critical = stock.filter(item => Number(item.stockDays || 0) > 90).sort((a, b) => Number(b.stockDays) - Number(a.stockDays));
      const aged = stock.filter(item => Number(item.stockDays || 0) > 60 && Number(item.stockDays || 0) <= 90).sort((a, b) => Number(b.stockDays) - Number(a.stockDays));
      if (critical.length) {
        const capital = critical.reduce((sum, item) => sum + Number(item.cost || 0), 0);
        const examples = critical.slice(0, 3).map(item => `${item.plate || 's/ placa'} · ${item.vehicle || 'veículo'} · ${Number(item.stockDays || 0)}d`).join(' | ');
        items.push({
          id: 'critical-stock', tone: 'critical', priority: 0.2, scope: 'Estoque',
          title: `${critical.length} veículo(s) acima de 90 dias`, evidence: `${brl(capital)} imobilizados na faixa crítica. ${examples}`,
          action: 'Defina hoje uma ação por carro: preço, exposição, reativação de leads ou proposta de giro.', metric: brl(capital),
        });
      }
      if (aged.length) {
        const capital = aged.reduce((sum, item) => sum + Number(item.cost || 0), 0);
        items.push({
          id: 'aged-stock', tone: 'warning', priority: 2.2, scope: 'Estoque',
          title: `${aged.length} veículo(s) entrando na zona de risco`, evidence: `${brl(capital)} estão entre 61 e 90 dias de estoque.`,
          action: 'Antecipe o plano de giro antes que estes carros entrem na faixa +90.', metric: `${aged.length} carros`,
        });
      }
    }

    return items.sort((a, b) => toneRank[a.tone] - toneRank[b.tone] || a.priority - b.priority).slice(0, 8);
  }, [snapshot, stock, users, config]);

  const total = aggregatePerformanceSnapshot(snapshot);
  const criticalStock = stock.filter(item => Number(item.stockDays || 0) > 90);
  const agedStock = stock.filter(item => Number(item.stockDays || 0) > 60 && Number(item.stockDays || 0) <= 90);
  const criticalValue = criticalStock.reduce((sum, item) => sum + Number(item.cost || 0), 0);
  const criticalCount = actions.filter(item => item.tone === 'critical').length;
  const warningCount = actions.filter(item => item.tone === 'warning').length;
  const activeCount = criticalCount + warningCount;
  const openTasks = tasks.filter(task => task.status !== 'done');
  const doneTasks = tasks.filter(task => task.status === 'done');

  const metricMeta = (item: ActionItem) => {
    if (item.id === 'projection-gap') return { metricKey: 'projection' as const, baselineValue: Number(total?.projection || 0), targetValue: config.monthlyGoal };
    if (item.id === 'capture-gap') return { metricKey: 'capture' as const, baselineValue: Number(total?.capturePercent || 0), targetValue: config.captureGoal };
    if (item.id === 'margin-gap') return { metricKey: 'margin' as const, baselineValue: Number(total?.marginPercent || 0), targetValue: config.healthyMargin };
    if (item.id === 'critical-stock') return { metricKey: 'criticalStock' as const, baselineValue: criticalStock.length, targetValue: 0 };
    if (item.id === 'aged-stock') return { metricKey: 'agedStock' as const, baselineValue: agedStock.length, targetValue: 0 };
    if (item.id === 'seller-focus') {
      const quantity = Number(item.metric?.match(/\d+/)?.[0] || 0);
      return { metricKey: 'sellerFocus' as const, baselineValue: quantity, targetValue: 0 };
    }
    return {};
  };

  const currentMetric = (task: ActionTask): number | undefined => {
    if (task.metricKey === 'projection') return Number(total?.projection || 0);
    if (task.metricKey === 'capture') return Number(total?.capturePercent || 0);
    if (task.metricKey === 'margin') return Number(total?.marginPercent || 0);
    if (task.metricKey === 'criticalStock') return criticalStock.length;
    if (task.metricKey === 'agedStock') return agedStock.length;
    if (task.metricKey === 'sellerFocus') {
      const current = actions.find(item => item.id === 'seller-focus');
      return Number(current?.metric?.match(/\d+/)?.[0] || 0);
    }
    return undefined;
  };

  const formatMetric = (task: ActionTask, value: number) => {
    if (task.metricKey === 'capture' || task.metricKey === 'margin') return `${value.toFixed(1)}%`;
    if (task.metricKey === 'projection') return value.toFixed(1);
    return `${Math.round(value)}`;
  };

  const createTask = async (item: ActionItem) => {
    if (!draft.assignedToEmail || !draft.dueDate) {
      setFeedback('Escolha o responsável e o prazo.');
      return;
    }
    const person = users.find(user => user.email === draft.assignedToEmail);
    setSaving(true);
    try {
      await actionTaskService.create({
        companyId, storeId, storeName, sourceActionId: item.id, sourceDate: localDate(),
        scope: item.scope, tone: item.tone, title: item.title, evidence: item.evidence,
        recommendedAction: item.action, metric: item.metric, ...metricMeta(item),
        assignedToEmail: draft.assignedToEmail, assignedToName: person?.name || draft.assignedToEmail,
        dueDate: draft.dueDate, createdByEmail: currentUser.email, createdByName: currentUser.name || currentUser.email,
      });
      setAssigningId(null);
      setDraft({ assignedToEmail: '', dueDate: plusDays(1) });
      setFeedback('Ação atribuída e registrada no Motyq.');
      await load();
      setView('tasks');
    } catch (error) {
      console.error('Create action task error', error);
      setFeedback('Não consegui salvar esta ação.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (task: ActionTask, status: ActionTask['status']) => {
    if (status === 'done' && !String(results[task.id] || '').trim()) {
      setFeedback('Registre o resultado antes de concluir a ação.');
      return;
    }
    setSaving(true);
    try {
      await actionTaskService.update(task.id, { status, result: String(results[task.id] || task.result || '').trim() });
      setFeedback(status === 'done' ? 'Ação concluída. O resultado ficou registrado.' : 'Status da ação atualizado.');
      await load();
    } catch (error) {
      console.error('Update action task error', error);
      setFeedback('Não consegui atualizar esta ação.');
    } finally {
      setSaving(false);
    }
  };

  const saveResult = async (task: ActionTask) => {
    setSaving(true);
    try {
      await actionTaskService.update(task.id, { result: String(results[task.id] || '').trim() });
      setFeedback('Resultado salvo.');
      await load();
    } catch (error) {
      console.error('Save task result error', error);
      setFeedback('Não consegui salvar o resultado.');
    } finally {
      setSaving(false);
    }
  };

  const removeTask = async (task: ActionTask) => {
    if (!window.confirm(`Excluir a ação “${task.title}”?`)) return;
    setSaving(true);
    try {
      await actionTaskService.remove(task.id);
      setFeedback('Ação removida.');
      await load();
    } catch (error) {
      console.error('Remove action task error', error);
      setFeedback('Não consegui remover esta ação.');
    } finally {
      setSaving(false);
    }
  };

  const toneClass: Record<Tone, string> = {
    critical: 'border-red-500/20 bg-red-500/[0.055]', warning: 'border-amber-400/20 bg-amber-400/[0.05]', info: 'border-sky-400/20 bg-sky-400/[0.05]',
  };
  const dotClass: Record<Tone, string> = { critical: 'bg-red-400', warning: 'bg-amber-300', info: 'bg-sky-300' };

  return <>
    <button onClick={() => { setOpen(true); if (!loadedOnce) load(); }} className="fixed bottom-36 right-5 z-[140] flex items-center gap-2 rounded-full border border-sky-300/20 bg-[#20242c] px-4 py-3 text-sm font-semibold text-white shadow-2xl shadow-black/40 transition hover:border-sky-300/35 active:scale-95" title="Centro de Ação Motyq">
      <ListTodo size={18} className="text-sky-300"/> Centro de Ação
      {(openTasks.length || activeCount) > 0 && <span className={`grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${criticalCount ? 'bg-red-500 text-white' : 'bg-amber-300 text-black'}`}>{openTasks.length || activeCount}</span>}
    </button>

    {open && <div className="fixed inset-0 z-[260] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[34px] border border-white/10 bg-[#171a20] shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex flex-col gap-4 border-b border-white/10 p-5 md:p-7 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-sky-300/15 bg-sky-300/[0.07] text-sky-200"><ListTodo size={22}/></div>
            <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">MOTYQ · CENTRO DE AÇÃO</p><h2 className="mt-1 text-2xl font-semibold text-white">Gestão que sai do painel e vira execução</h2><p className="mt-1 text-sm text-zinc-500">{storeName} · detectar → atribuir → executar → medir.</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/></button>
            <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400"><X size={18}/></button>
          </div>
        </header>

        <div className="border-b border-white/10 px-5 pt-4 md:px-7">
          <div className="flex gap-2">
            <Tab active={view === 'priorities'} onClick={() => setView('priorities')} label={`Prioridades (${actions.length})`}/>
            <Tab active={view === 'tasks'} onClick={() => setView('tasks')} label={`Execução (${openTasks.length})`}/>
          </div>
        </div>

        <div className="p-5 md:p-7">
          {feedback && <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-sky-300/15 bg-sky-300/[0.05] px-4 py-3 text-sm text-sky-100"><span>{feedback}</span><button onClick={() => setFeedback('')} className="text-sky-300"><X size={15}/></button></div>}
          {loading && !loadedOnce ? <div className="grid min-h-80 place-items-center text-zinc-500"><div className="text-center"><RefreshCw className="mx-auto mb-3 animate-spin"/><p>Lendo a operação...</p></div></div> : <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Summary icon={<ListTodo size={16}/>} label="Prioridades" value={`${activeCount}`} hint={criticalCount ? `${criticalCount} crítica(s)` : 'sem críticos'} />
              <Summary icon={<UserCheck size={16}/>} label="Em execução" value={`${openTasks.length}`} hint={`${doneTasks.length} concluída(s)`} />
              <Summary icon={<Target size={16}/>} label="Projeção" value={total ? `${Number(total.projection || 0).toFixed(1)}` : '—'} hint={`meta ${config.monthlyGoal}`} />
              <Summary icon={<CircleDollarSign size={16}/>} label="Capital +90" value={brl(criticalValue)} hint={`${criticalStock.length} veículo(s)`} />
            </section>

            {view === 'priorities' ? <>
              <div className="mt-6 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-600">Fila priorizada</p><h3 className="mt-1 text-xl font-semibold text-white">Do maior impacto para o menor</h3></div><span className="hidden text-xs text-zinc-600 md:block">motor de regras · sem achismo</span></div>
              <div className="mt-4 space-y-3">
                {!actions.length ? <EmptyGood/> : actions.map((item, index) => {
                  const alreadyOpen = openTasks.some(task => task.sourceActionId === item.id);
                  return <article key={item.id} className={`rounded-[24px] border p-4 md:p-5 ${toneClass[item.tone]}`}>
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center gap-2 pt-0.5"><span className={`h-2.5 w-2.5 rounded-full ${dotClass[item.tone]}`}/><span className="text-[10px] font-bold text-zinc-700">{String(index + 1).padStart(2, '0')}</span></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-zinc-500">{item.scope}</p><h4 className="mt-1 text-base font-semibold text-white">{item.title}</h4></div>{item.metric && <span className="w-fit rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-zinc-200">{item.metric}</span>}</div>
                        <p className="mt-2 text-sm leading-6 text-zinc-400">{item.evidence}</p>
                        <div className="mt-3 rounded-2xl border border-white/[0.07] bg-black/15 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">Próxima ação</p><p className="mt-1 text-sm leading-5 text-zinc-200">{item.action}</p></div>

                        <div className="mt-4">
                          {alreadyOpen ? <button onClick={() => setView('tasks')} className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-xs font-bold text-emerald-200"><CheckCircle2 size={14} className="mr-1.5 inline"/> JÁ ESTÁ EM EXECUÇÃO</button> : assigningId === item.id ? <div className="grid gap-3 rounded-2xl border border-sky-300/15 bg-sky-300/[0.035] p-4 md:grid-cols-[1fr_190px_auto] md:items-end">
                            <label className="text-xs text-zinc-500">Responsável<select value={draft.assignedToEmail} onChange={event => setDraft(value => ({ ...value, assignedToEmail: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white"><option value="">Selecione...</option>{users.map(user => <option key={user.email} value={user.email}>{user.name || user.email}</option>)}</select></label>
                            <label className="text-xs text-zinc-500">Prazo<input type="date" value={draft.dueDate} min={localDate()} onChange={event => setDraft(value => ({ ...value, dueDate: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white"/></label>
                            <div className="flex gap-2"><button disabled={saving} onClick={() => createTask(item)} className="rounded-xl bg-sky-300 px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-50">ATRIBUIR</button><button onClick={() => setAssigningId(null)} className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-zinc-400">CANCELAR</button></div>
                          </div> : <button onClick={() => { setAssigningId(item.id); setDraft({ assignedToEmail: '', dueDate: plusDays(1) }); }} className="rounded-xl border border-sky-300/20 bg-sky-300/[0.06] px-3 py-2 text-xs font-bold text-sky-200 transition hover:bg-sky-300/[0.10]"><Plus size={14} className="mr-1.5 inline"/> TRANSFORMAR EM AÇÃO</button>}
                        </div>
                      </div>
                    </div>
                  </article>;
                })}
              </div>
            </> : <TaskBoard tasks={tasks} results={results} setResults={setResults} currentMetric={currentMetric} formatMetric={formatMetric} onStatus={changeStatus} onSave={saveResult} onRemove={removeTask} saving={saving}/>}          
          </>}
        </div>
      </div>
    </div>}
  </>;
};

const TaskBoard = ({ tasks, results, setResults, currentMetric, formatMetric, onStatus, onSave, onRemove, saving }: {
  tasks: ActionTask[];
  results: Record<string, string>;
  setResults: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  currentMetric: (task: ActionTask) => number | undefined;
  formatMetric: (task: ActionTask, value: number) => string;
  onStatus: (task: ActionTask, status: ActionTask['status']) => void;
  onSave: (task: ActionTask) => void;
  onRemove: (task: ActionTask) => void;
  saving: boolean;
}) => {
  const today = localDate();
  const ordered = [...tasks].sort((a, b) => {
    const statusRank = (value: ActionTask['status']) => value === 'in_progress' ? 0 : value === 'open' ? 1 : 2;
    return statusRank(a.status) - statusRank(b.status) || String(a.dueDate).localeCompare(String(b.dueDate));
  });
  if (!ordered.length) return <div className="mt-6 rounded-[26px] border border-white/10 bg-white/[0.025] p-7 text-center"><ListTodo className="mx-auto text-zinc-700"/><p className="mt-3 font-semibold text-zinc-300">Nenhuma ação atribuída ainda.</p><p className="mt-1 text-sm text-zinc-600">Volte em Prioridades e transforme uma recomendação em ação executável.</p></div>;
  return <div className="mt-6 space-y-3">
    <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-600">Execução</p><h3 className="mt-1 text-xl font-semibold text-white">Quem faz o quê, até quando e com qual resultado</h3></div>
    {ordered.map(task => {
      const current = currentMetric(task);
      const hasMetric = typeof current === 'number' && typeof task.baselineValue === 'number';
      const delta = hasMetric ? current! - Number(task.baselineValue) : 0;
      const overdue = task.status !== 'done' && task.dueDate < today;
      return <article key={task.id} className={`rounded-[24px] border p-5 ${task.status === 'done' ? 'border-emerald-400/15 bg-emerald-400/[0.035]' : overdue ? 'border-red-400/20 bg-red-400/[0.04]' : 'border-white/10 bg-white/[0.025]'}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><StatusPill status={task.status}/><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">{task.scope}</span>{overdue && <span className="rounded-full bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-300">ATRASADA</span>}</div>
            <h4 className="mt-2 text-base font-semibold text-white">{task.title}</h4>
            <p className="mt-1 text-sm leading-6 text-zinc-500">{task.recommendedAction}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400"><span className="rounded-xl border border-white/10 px-3 py-2"><UserCheck size={13} className="mr-1.5 inline text-sky-300"/>{task.assignedToName}</span><span className="rounded-xl border border-white/10 px-3 py-2"><CalendarDays size={13} className="mr-1.5 inline text-sky-300"/>até {task.dueDate.split('-').reverse().join('/')}</span></div>
            {hasMetric && <div className="mt-3 rounded-2xl border border-white/[0.07] bg-black/15 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">Impacto medido pelo Motyq</p><p className="mt-1 text-sm text-zinc-300">Antes <strong className="text-white">{formatMetric(task, Number(task.baselineValue))}</strong> → Agora <strong className="text-white">{formatMetric(task, current!)}</strong> <span className={delta === 0 ? 'text-zinc-600' : delta > 0 ? 'text-emerald-300' : 'text-amber-300'}>({delta > 0 ? '+' : ''}{task.metricKey === 'capture' || task.metricKey === 'margin' ? `${delta.toFixed(1)} p.p.` : delta.toFixed(1)})</span></p></div>}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {task.status === 'open' && <button disabled={saving} onClick={() => onStatus(task, 'in_progress')} className="rounded-xl border border-sky-300/20 bg-sky-300/[0.05] px-3 py-2 text-xs font-bold text-sky-200"><Play size={13} className="mr-1.5 inline"/> INICIAR</button>}
            {task.status !== 'done' && <button disabled={saving} onClick={() => onStatus(task, 'done')} className="rounded-xl bg-emerald-300 px-3 py-2 text-xs font-black text-emerald-950"><CheckCircle2 size={13} className="mr-1.5 inline"/> CONCLUIR</button>}
            <button disabled={saving} onClick={() => onRemove(task)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-zinc-500"><Trash2 size={13}/></button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]"><textarea value={results[task.id] || ''} onChange={event => setResults(current => ({ ...current, [task.id]: event.target.value }))} placeholder="Registre o resultado: o que foi feito, resposta do cliente/equipe, venda recuperada, carro girado, etc." rows={2} className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-700"/><button disabled={saving} onClick={() => onSave(task)} className="rounded-2xl border border-white/10 px-4 py-3 text-xs font-bold text-zinc-300"><Save size={14} className="mr-1.5 inline"/> SALVAR RESULTADO</button></div>
      </article>;
    })}
  </div>;
};

const StatusPill = ({ status }: { status: ActionTask['status'] }) => {
  const label = status === 'done' ? 'CONCLUÍDA' : status === 'in_progress' ? 'EM ANDAMENTO' : 'ABERTA';
  const cls = status === 'done' ? 'bg-emerald-400/10 text-emerald-300' : status === 'in_progress' ? 'bg-sky-400/10 text-sky-300' : 'bg-amber-400/10 text-amber-300';
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${cls}`}>{label}</span>;
};

const Tab = ({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) => <button onClick={onClick} className={`border-b-2 px-3 pb-3 text-xs font-bold transition ${active ? 'border-sky-300 text-sky-200' : 'border-transparent text-zinc-600 hover:text-zinc-300'}`}>{label}</button>;
const EmptyGood = () => <div className="rounded-[26px] border border-emerald-400/15 bg-emerald-400/[0.045] p-6"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 text-emerald-300"/><div><p className="font-semibold text-emerald-100">Nenhuma prioridade crítica detectada.</p><p className="mt-1 text-sm leading-6 text-emerald-200/60">Os indicadores atuais estão dentro das faixas configuradas. Continue acompanhando ritmo e estoque.</p></div></div></div>;
const Summary = ({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) => <div className="rounded-[22px] border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center gap-2 text-zinc-600">{icon}<p className="text-[10px] font-bold uppercase tracking-[0.12em]">{label}</p></div><p className="mt-2 text-xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-zinc-600">{hint}</p></div>;

export default ActionCenter;
