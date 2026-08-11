import React, { useMemo } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Repeat2,
  Target,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react';
import { OperationalPerformanceSeller } from '../types';
import { formatCurrency } from '../utils/currency';

type Props = {
  seller: OperationalPerformanceSeller;
  officialSales: number;
  officialClosingRate: number;
  goal: number;
  captureGoal: number;
  marginGoal: number;
  onClose: () => void;
};

type ActionTone = 'critical' | 'attention' | 'good';

type Action = {
  tone: ActionTone;
  title: string;
  text: string;
};

const pct = (value: number | null | undefined) => `${Number(value || 0).toFixed(1)}%`;

const toneClasses: Record<ActionTone, string> = {
  critical: 'border-red-500/20 bg-red-500/[0.07] text-red-300',
  attention: 'border-amber-400/20 bg-amber-400/[0.07] text-amber-200',
  good: 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300',
};

const SellerPerformanceDetail: React.FC<Props> = ({
  seller,
  officialSales,
  officialClosingRate,
  goal,
  captureGoal,
  marginGoal,
  onClose,
}) => {
  const gap = Math.max(goal - officialSales, 0);

  const actions = useMemo<Action[]>(() => {
    const list: Action[] = [];

    if (seller.projection < goal) {
      list.push({
        tone: 'critical',
        title: 'Recuperar ritmo de vendas',
        text: `A projeção atual é ${seller.projection.toFixed(1)} para uma meta de ${goal}. O gap atual é de ${gap} venda(s).`,
      });
    }

    if (seller.capturePercent < captureGoal) {
      list.push({
        tone: 'attention',
        title: 'Aumentar captura',
        text: `Captura em ${pct(seller.capturePercent)} para uma meta de ${captureGoal}%. Priorize oportunidades com veículo na troca.`,
      });
    }

    if (officialSales > 0 && seller.marginPercent < marginGoal) {
      list.push({
        tone: 'attention',
        title: 'Proteger margem',
        text: `MC em ${pct(seller.marginPercent)} para uma meta de ${marginGoal}%. Evite recuperar volume sacrificando rentabilidade.`,
      });
    }

    if (seller.flowTotal > 0 && seller.evaluations === 0) {
      list.push({
        tone: 'attention',
        title: 'Transformar fluxo em avaliação',
        text: `${seller.flowTotal} oportunidade(s) no fluxo e nenhuma avaliação registrada. Trabalhe a captura antes de mexer em preço.`,
      });
    }

    if (!list.length) {
      list.push({
        tone: 'good',
        title: 'Manter o padrão',
        text: 'Os principais indicadores estão dentro do objetivo. Proteja margem e mantenha consistência de atividade.',
      });
    }

    return list.slice(0, 3);
  }, [seller, officialSales, goal, captureGoal, marginGoal, gap]);

  const principal = actions[0];

  return (
    <div className="fixed inset-0 z-[240] overflow-y-auto bg-black/75 p-3 backdrop-blur-md" onClick={onClose}>
      <div
        className="mx-auto my-5 max-w-5xl overflow-hidden rounded-[34px] border border-white/10 bg-zinc-950 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-white/10 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-6 md:p-8">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Performance Hub · análise individual</p>
              <h3 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">{seller.seller}</h3>
              <p className="mt-2 text-sm text-zinc-400">O que está funcionando, qual é o gargalo e onde agir primeiro.</p>
            </div>
            <button onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/[0.06] text-zinc-400 hover:bg-white/10 hover:text-white">
              <X size={19}/>
            </button>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HeroMetric icon={<TrendingUp size={17}/>} label="Vendas" value={`${officialSales}/${goal}`} hint={`Projeção ${seller.projection.toFixed(1)}`}/>
            <HeroMetric icon={<WalletCards size={17}/>} label="Margem MC" value={pct(seller.marginPercent)} hint={formatCurrency(seller.marginTotal)}/>
            <HeroMetric icon={<Repeat2 size={17}/>} label="Captura" value={pct(seller.capturePercent)} hint={`${seller.captureQty} captura(s)`}/>
            <HeroMetric icon={<Target size={17}/>} label="Fechamento" value={pct(officialClosingRate)} hint={`${officialSales} fechamento(s)`}/>
          </div>
        </div>

        <div className="space-y-6 p-5 md:p-8">
          <section className={`rounded-[26px] border p-5 ${toneClasses[principal.tone]}`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{principal.tone === 'good' ? <CheckCircle2 size={20}/> : <CircleAlert size={20}/>}</div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-70">Principal foco agora</p>
                <h4 className="mt-1 text-lg font-semibold text-white">{principal.title}</h4>
                <p className="mt-2 text-sm leading-6 text-zinc-300">{principal.text}</p>
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5 md:p-6">
              <div className="flex items-center gap-2 text-zinc-400"><Activity size={17}/><p className="text-xs font-semibold uppercase tracking-[0.14em]">Funil comercial</p></div>
              <div className="mt-6 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
                <FunnelStep label="Fluxo" value={`${seller.flowTotal}`}/><ArrowRight size={16} className="text-zinc-700"/>
                <FunnelStep label="Pedidos" value={`${seller.orders}`}/><ArrowRight size={16} className="text-zinc-700"/>
                <FunnelStep label="Vendas" value={`${officialSales}`}/>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Small label="Passagens" value={`${seller.passages}`}/>
                <Small label="Pedido %" value={pct(seller.orderPercent)}/>
                <Small label="Avaliações" value={`${seller.evaluations}`}/>
                <Small label="Taxa avaliação" value={pct(seller.evaluationRate)}/>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5 md:p-6">
              <div className="flex items-center gap-2 text-zinc-400"><BarChart3 size={17}/><p className="text-xs font-semibold uppercase tracking-[0.14em]">Atividade</p></div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Small label="Trab. período" value={`${seller.workInPeriod}`}/>
                <Small label="Contatos/dia" value={seller.avgContactsPerDay.toFixed(2)}/>
                <Small label="Caixa d'água" value={`${seller.pipeline}`}/>
                <Small label="Compra adicional" value={`${seller.additionalPurchase}`}/>
                <Small label="MC por carro" value={formatCurrency(seller.marginPerCar)}/>
                <Small label="Projeção" value={seller.projection.toFixed(1)}/>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5 md:p-6">
            <div className="flex items-center gap-2 text-zinc-400"><ClipboardCheck size={17}/><p className="text-xs font-semibold uppercase tracking-[0.14em]">Plano de ação</p></div>
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {actions.map((action, index) => (
                <div key={`${action.title}-${index}`} className={`rounded-[22px] border p-4 ${toneClasses[action.tone]}`}>
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-black/20 text-xs font-semibold">{index + 1}</span>
                    <p className="font-semibold text-white">{action.title}</p>
                  </div>
                  <p className="mt-3 text-sm leading-5 text-zinc-300">{action.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <Benchmark icon={<TrendingUp size={16}/>} label="Meta mensal" current={`${officialSales}`} target={`${goal}`}/>
            <Benchmark icon={<Repeat2 size={16}/>} label="Meta captura" current={pct(seller.capturePercent)} target={`${captureGoal}%`}/>
            <Benchmark icon={<WalletCards size={16}/>} label="Meta margem" current={pct(seller.marginPercent)} target={`${marginGoal}%`}/>
          </section>
        </div>
      </div>
    </div>
  );
};

const HeroMetric = ({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) => (
  <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
    <div className="flex items-center gap-2 text-zinc-500">{icon}<span className="text-[10px] uppercase tracking-[0.12em]">{label}</span></div>
    <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    <p className="mt-1 text-xs text-zinc-500">{hint}</p>
  </div>
);

const FunnelStep = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-[20px] bg-black/25 p-4 text-center">
    <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">{label}</p>
    <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
  </div>
);

const Small = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl bg-black/20 p-3">
    <p className="text-[10px] uppercase tracking-[0.1em] text-zinc-600">{label}</p>
    <p className="mt-1 text-sm font-semibold text-zinc-200">{value}</p>
  </div>
);

const Benchmark = ({ icon, label, current, target }: { icon: React.ReactNode; label: string; current: string; target: string }) => (
  <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
    <div className="flex items-center gap-2 text-zinc-500">{icon}<span className="text-xs">{label}</span></div>
    <div className="mt-3 flex items-end justify-between gap-3"><span className="text-xl font-semibold text-white">{current}</span><span className="text-xs text-zinc-600">meta {target}</span></div>
  </div>
);

export default SellerPerformanceDetail;
