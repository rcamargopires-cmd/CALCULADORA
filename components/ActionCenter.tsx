import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDollarSign, ListTodo, RefreshCw, Target, TrendingUp, Users, X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { OperationalPerformanceSnapshot, OperationalStockItem, User } from '../types';
import { aggregatePerformanceSnapshot, officialClosingCount } from '../services/performanceMetrics';
import { storeScopedOperationalService } from '../services/storeScopedOperationalService';
import { userService } from '../services/userService';

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

const brl = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
}).format(value || 0);

const normalize = (value: string) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

const toneRank: Record<Tone, number> = { critical: 0, warning: 1, info: 2 };

const ActionCenter: React.FC<Props> = ({ currentUser, companyId, storeId, storeName }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [snapshot, setSnapshot] = useState<OperationalPerformanceSnapshot | null>(null);
  const [stock, setStock] = useState<OperationalStockItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [config, setConfig] = useState<PerformanceConfig>(DEFAULTS);

  const load = async () => {
    setLoading(true);
    try {
      const [performance, stockRows, team, configSnap] = await Promise.all([
        storeScopedOperationalService.getLatestPerformance(storeId, companyId),
        storeScopedOperationalService.getLatestStock(storeId, companyId),
        userService.getAll(companyId, storeId),
        getDoc(doc(db, 'config/performance')),
      ]);
      setSnapshot(performance);
      setStock(stockRows);
      setUsers(team.filter(user => user.status === 'active'));
      if (configSnap.exists()) {
        const raw = configSnap.data() as Partial<PerformanceConfig>;
        setConfig({ ...DEFAULTS, ...raw });
      }
    } catch (error) {
      console.error('Motyq Action Center load error', error);
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
            id: 'projection-gap',
            tone: ratio < 0.85 || projectionGap >= 10 ? 'critical' : 'warning',
            priority: ratio < 0.85 ? 0.4 : 1.4,
            scope: 'Vendas',
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
        title: 'Atualizar fotografia do estoque',
        evidence: 'Nenhum estoque atual foi encontrado para esta unidade.',
        action: 'Importe o estoque para o Motyq identificar capital parado e veículos críticos.',
        metric: 'Sem estoque',
      });
    } else {
      const critical = stock.filter(item => Number(item.stockDays || 0) > 90).sort((a, b) => Number(b.stockDays) - Number(a.stockDays));
      const aged = stock.filter(item => Number(item.stockDays || 0) > 60 && Number(item.stockDays || 0) <= 90).sort((a, b) => Number(b.stockDays) - Number(a.stockDays));

      if (critical.length) {
        const capital = critical.reduce((sum, item) => sum + Number(item.cost || 0), 0);
        const examples = critical.slice(0, 3).map(item => `${item.plate || 's/ placa'} · ${item.vehicle || 'veículo'} · ${Number(item.stockDays || 0)}d`).join(' | ');
        items.push({
          id: 'critical-stock', tone: 'critical', priority: 0.2, scope: 'Estoque',
          title: `${critical.length} veículo(s) acima de 90 dias`,
          evidence: `${brl(capital)} imobilizados na faixa crítica. ${examples}`,
          action: 'Defina hoje uma ação por carro: preço, exposição, reativação de leads ou proposta de giro.',
          metric: brl(capital),
        });
      }

      if (aged.length) {
        const capital = aged.reduce((sum, item) => sum + Number(item.cost || 0), 0);
        items.push({
          id: 'aged-stock', tone: 'warning', priority: 2.2, scope: 'Estoque',
          title: `${aged.length} veículo(s) entrando na zona de risco`,
          evidence: `${brl(capital)} estão entre 61 e 90 dias de estoque.`,
          action: 'Antecipe o plano de giro antes que estes carros entrem na faixa +90.',
          metric: `${aged.length} carros`,
        });
      }
    }

    return items.sort((a, b) => toneRank[a.tone] - toneRank[b.tone] || a.priority - b.priority).slice(0, 8);
  }, [snapshot, stock, users, config]);

  const criticalCount = actions.filter(item => item.tone === 'critical').length;
  const warningCount = actions.filter(item => item.tone === 'warning').length;
  const activeCount = criticalCount + warningCount;
  const total = aggregatePerformanceSnapshot(snapshot);
  const criticalStock = stock.filter(item => Number(item.stockDays || 0) > 90);
  const criticalValue = criticalStock.reduce((sum, item) => sum + Number(item.cost || 0), 0);

  const toneClass: Record<Tone, string> = {
    critical: 'border-red-500/20 bg-red-500/[0.055]',
    warning: 'border-amber-400/20 bg-amber-400/[0.05]',
    info: 'border-sky-400/20 bg-sky-400/[0.05]',
  };
  const dotClass: Record<Tone, string> = { critical: 'bg-red-400', warning: 'bg-amber-300', info: 'bg-sky-300' };

  return <>
    <button
      onClick={() => { setOpen(true); if (!loadedOnce) load(); }}
      className="fixed bottom-36 right-5 z-[140] flex items-center gap-2 rounded-full border border-sky-300/20 bg-[#20242c] px-4 py-3 text-sm font-semibold text-white shadow-2xl shadow-black/40 transition hover:border-sky-300/35 active:scale-95"
      title="Centro de Ação Motyq"
    >
      <ListTodo size={18} className="text-sky-300"/> Centro de Ação
      {activeCount > 0 && <span className={`grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${criticalCount ? 'bg-red-500 text-white' : 'bg-amber-300 text-black'}`}>{activeCount}</span>}
    </button>

    {open && <div className="fixed inset-0 z-[260] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[34px] border border-white/10 bg-[#171a20] shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 md:p-7">
          <div className="flex gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-sky-300/15 bg-sky-300/[0.07] text-sky-200"><ListTodo size={22}/></div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">MOTYQ · CENTRO DE AÇÃO</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">O que precisa acontecer hoje</h2>
              <p className="mt-1 text-sm text-zinc-500">{storeName} · prioridades calculadas pelos dados atuais da operação.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/></button>
            <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400"><X size={18}/></button>
          </div>
        </header>

        <div className="p-5 md:p-7">
          {loading && !loadedOnce ? <div className="grid min-h-80 place-items-center text-zinc-500"><div className="text-center"><RefreshCw className="mx-auto mb-3 animate-spin"/><p>Lendo a operação...</p></div></div> : <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Summary icon={<ListTodo size={16}/>} label="Ações ativas" value={`${activeCount}`} hint={criticalCount ? `${criticalCount} crítica(s)` : 'sem críticos'} />
              <Summary icon={<Target size={16}/>} label="Projeção" value={total ? `${Number(total.projection || 0).toFixed(1)}` : '—'} hint={`meta ${config.monthlyGoal}`} />
              <Summary icon={<TrendingUp size={16}/>} label="Captura / MC" value={total ? `${Number(total.capturePercent || 0).toFixed(1)}% · ${Number(total.marginPercent || 0).toFixed(1)}%` : '—'} hint={`metas ${config.captureGoal}% · ${config.healthyMargin}%`} />
              <Summary icon={<CircleDollarSign size={16}/>} label="Capital +90" value={brl(criticalValue)} hint={`${criticalStock.length} veículo(s)`} />
            </section>

            <div className="mt-6 flex items-end justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-600">Fila priorizada</p><h3 className="mt-1 text-xl font-semibold text-white">Do maior impacto para o menor</h3></div>
              <span className="hidden text-xs text-zinc-600 md:block">motor de regras · sem achismo</span>
            </div>

            <div className="mt-4 space-y-3">
              {!actions.length ? <div className="rounded-[26px] border border-emerald-400/15 bg-emerald-400/[0.045] p-6"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 text-emerald-300"/><div><p className="font-semibold text-emerald-100">Nenhuma prioridade crítica detectada.</p><p className="mt-1 text-sm leading-6 text-emerald-200/60">Os indicadores atuais estão dentro das faixas configuradas. Continue acompanhando ritmo e estoque.</p></div></div></div> : actions.map((item, index) => <article key={item.id} className={`rounded-[24px] border p-4 md:p-5 ${toneClass[item.tone]}`}>
                <div className="flex gap-4">
                  <div className="flex flex-col items-center gap-2 pt-0.5"><span className={`h-2.5 w-2.5 rounded-full ${dotClass[item.tone]}`}/><span className="text-[10px] font-bold text-zinc-700">{String(index + 1).padStart(2, '0')}</span></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-zinc-500">{item.scope}</p><h4 className="mt-1 text-base font-semibold text-white">{item.title}</h4></div>{item.metric && <span className="w-fit rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-zinc-200">{item.metric}</span>}</div>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{item.evidence}</p>
                    <div className="mt-3 rounded-2xl border border-white/[0.07] bg-black/15 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">Próxima ação</p><p className="mt-1 text-sm leading-5 text-zinc-200">{item.action}</p></div>
                  </div>
                </div>
              </article>)}
            </div>

            <div className="mt-6 rounded-[24px] border border-sky-300/10 bg-sky-300/[0.035] p-4 text-sm leading-6 text-zinc-400">
              <div className="flex gap-3"><Users size={17} className="mt-1 shrink-0 text-sky-300"/><p><strong className="text-zinc-200">Objetivo do Centro de Ação:</strong> transformar indicadores em uma fila de decisões. Nas próximas versões, cada ação poderá ser atribuída, marcada como concluída e ter o resultado acompanhado pelo Motyq.</p></div>
            </div>
          </>}
        </div>
      </div>
    </div>}
  </>;
};

const Summary = ({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) => <div className="rounded-[22px] border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center gap-2 text-zinc-600">{icon}<p className="text-[10px] font-bold uppercase tracking-[0.12em]">{label}</p></div><p className="mt-2 text-xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-zinc-600">{hint}</p></div>;

export default ActionCenter;
