import React, { useEffect, useMemo, useState } from 'react';
import {
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  buildManagerIntelligence,
  generateManagerAiBrief,
  ManagerAiContext,
  ManagerAiSignal,
} from '../services/managerAiService';

type Props = {
  context: ManagerAiContext;
  onOpenSeller?: (sellerKey: string) => void;
};

const toneClasses = {
  critical: 'border-red-500/20 bg-red-500/[0.065]',
  attention: 'border-amber-400/20 bg-amber-400/[0.06]',
  positive: 'border-emerald-500/20 bg-emerald-500/[0.06]',
};

const DealMasterAI: React.FC<Props> = ({ context, onOpenSeller }) => {
  const brief = useMemo(() => buildManagerIntelligence(context), [context]);
  const [aiText, setAiText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Quando os dados mudarem, invalida o briefing anterior para não mostrar uma leitura velha.
  useEffect(() => {
    setAiText('');
    setError('');
  }, [context.snapshot?.referenceDate, context.stock[0]?.snapshotDate]);

  const runAi = async () => {
    setLoading(true);
    setError('');
    try {
      const text = await generateManagerAiBrief(brief);
      setAiText(text);
    } catch (err: any) {
      console.error('MOTYQ AI V3 error', err);
      setError(err?.message?.includes('GEMINI_API_KEY')
        ? 'A IA generativa ainda não está configurada neste ambiente. O diagnóstico do motor MOTYQ continua disponível acima.'
        : 'Não consegui gerar o briefing agora. O diagnóstico do motor MOTYQ continua válido.');
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = brief.status === 'critical' ? 'Ação imediata' : brief.status === 'attention' ? 'Atenção' : 'Saudável';
  const statusClass = brief.status === 'critical'
    ? 'bg-red-500/10 text-red-300'
    : brief.status === 'attention'
      ? 'bg-amber-400/10 text-amber-300'
      : 'bg-emerald-500/10 text-emerald-300';

  return (
    <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black">
      <div className="border-b border-white/10 p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-zinc-500">
              <BrainCircuit size={17}/>
              <p className="text-xs font-semibold uppercase tracking-[0.16em]">MOTYQ AI · V3</p>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass}`}>{statusLabel}</span>
            </div>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">{brief.headline}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{brief.summary}</p>
          </div>
          <button
            onClick={runAi}
            disabled={loading || !context.snapshot}
            className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? <RefreshCw size={16} className="animate-spin"/> : <Sparkles size={16}/>} 
            {loading ? 'Analisando...' : aiText ? 'Atualizar briefing IA' : 'Gerar briefing IA'}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AiMetric label="Projeção" value={brief.metrics.projection.toFixed(1)} delta={brief.metrics.projectionDelta} />
          <AiMetric label="Captura" value={`${brief.metrics.capture.toFixed(1)}%`} delta={brief.metrics.captureDelta} suffix=" p.p."/>
          <AiMetric label="Margem MC" value={`${brief.metrics.margin.toFixed(1)}%`} delta={brief.metrics.marginDelta} suffix=" p.p."/>
          <AiMetric label="Estoque +90" value={`${brief.metrics.criticalStock}`} hint={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(brief.metrics.criticalStockValue)}/>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[1.15fr_.85fr]">
        <div className="p-5 md:p-7 xl:border-r xl:border-white/10">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600">Motor de decisão</p>
              <h4 className="mt-1 text-lg font-semibold text-white">Sinais priorizados</h4>
            </div>
            <span className="text-xs text-zinc-600">dados + regras + tendência</span>
          </div>
          <div className="space-y-3">
            {brief.signals.slice(0, 5).map((signal, index) => <SignalCard key={`${signal.title}-${index}`} signal={signal}/>) }
          </div>
        </div>

        <div className="p-5 md:p-7">
          <div className="flex items-center gap-2 text-zinc-600"><Users size={15}/><p className="text-xs font-semibold uppercase tracking-[0.14em]">Foco da equipe</p></div>
          <h4 className="mt-1 text-lg font-semibold text-white">Quem merece atenção agora</h4>
          <div className="mt-4 space-y-2">
            {!brief.sellerFocus.length ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 text-sm text-emerald-200">Nenhum vendedor aparece como prioridade crítica pelos indicadores atuais.</div>
            ) : brief.sellerFocus.map(item => (
              <button
                key={item.sellerKey}
                onClick={() => onOpenSeller?.(item.sellerKey)}
                className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.055]"
              >
                <div>
                  <p className="font-medium text-white">{item.seller}</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">{item.reason}</p>
                </div>
                <ChevronRight size={17} className="shrink-0 text-zinc-700 transition group-hover:translate-x-0.5 group-hover:text-zinc-400"/>
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-[24px] border border-violet-400/15 bg-violet-400/[0.055] p-5">
            <div className="flex items-center gap-2 text-violet-300"><Sparkles size={15}/><p className="text-xs font-semibold uppercase tracking-[0.14em]">Briefing executivo IA</p></div>
            {aiText ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-200">{aiText}</p>
            ) : error ? (
              <p className="mt-3 text-sm leading-6 text-amber-200">{error}</p>
            ) : (
              <p className="mt-3 text-sm leading-6 text-zinc-500">Clique em “Gerar briefing IA”. A IA recebe somente o resumo analítico do MOTYQ e transforma os sinais em uma leitura executiva para a reunião diária.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

const SignalCard = ({ signal }: { signal: ManagerAiSignal }) => (
  <div className={`rounded-[22px] border p-4 ${toneClasses[signal.tone]}`}>
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

const AiMetric = ({ label, value, delta, suffix = '', hint }: { label: string; value: string; delta?: number; suffix?: string; hint?: string }) => {
  const hasDelta = delta !== undefined && Math.abs(delta) > 0.001;
  const positive = Number(delta || 0) > 0;
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.035] p-4">
      <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-xl font-semibold text-white">{value}</span>
        {hasDelta && <span className={`flex items-center gap-1 text-xs ${positive ? 'text-emerald-400' : 'text-red-400'}`}>{positive ? <TrendingUp size={13}/> : <TrendingDown size={13}/>} {positive ? '+' : ''}{Number(delta).toFixed(1)}{suffix}</span>}
      </div>
      {hint && <p className="mt-1 text-[11px] text-zinc-600">{hint}</p>}
    </div>
  );
};

export default DealMasterAI;
