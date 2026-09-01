import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Archive,
  BarChart3,
  CalendarDays,
  ChevronRight,
  RefreshCw,
  Repeat2,
  Target,
  WalletCards,
  X,
} from 'lucide-react';
import { User } from '../types';
import { officialClosingCount, officialClosingRate } from '../services/performanceMetrics';
import { SellerPerformanceRecord, sellerPerformanceService } from '../services/sellerPerformanceService';
import { formatCurrency } from '../utils/currency';

type Props = {
  currentUser: User;
  storeName: string;
};

const MONTHS = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

const monthKey = (date: string) => String(date || '').slice(0, 7);
const currentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (key: string) => {
  const [year, month] = key.split('-');
  const index = Math.max(0, Math.min(11, Number(month) - 1));
  return `${MONTHS[index]} ${year}`;
};
const brDate = (date: string) => {
  const [year, month, day] = String(date || '').split('-');
  return day && month && year ? `${day}/${month}/${year}` : date;
};
const pct = (value: number | undefined | null) => `${Number(value || 0).toFixed(1)}%`;

const SellerClosingHistory: React.FC<Props> = ({ currentUser, storeName }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<SellerPerformanceRecord[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [feedback, setFeedback] = useState('');

  const load = async () => {
    if (!currentUser.email) return;
    setLoading(true);
    try {
      const rows = await sellerPerformanceService.getMyHistoryArchive(currentUser.email, currentUser);
      setRecords(rows);
      setFeedback('');
    } catch (error) {
      console.error('Seller closing history load error', error);
      setFeedback('Não consegui carregar seus fechamentos agora.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, currentUser.email]);

  useEffect(() => {
    const refresh = () => { if (open) load(); };
    window.addEventListener('dealmaster:operational-data-updated', refresh);
    return () => window.removeEventListener('dealmaster:operational-data-updated', refresh);
  }, [open, currentUser.email]);

  const closings = useMemo(() => {
    const latest = new Map<string, SellerPerformanceRecord>();
    records
      .filter(item => item.referenceDate && item.metrics)
      .sort((a, b) => a.referenceDate.localeCompare(b.referenceDate))
      .forEach(item => latest.set(monthKey(item.referenceDate), item));
    return Array.from(latest.entries())
      .map(([month, record]) => ({ month, record }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [records]);

  useEffect(() => {
    if (!closings.length) {
      setSelectedMonth('');
      return;
    }
    if (!selectedMonth || !closings.some(item => item.month === selectedMonth)) setSelectedMonth(closings[0].month);
  }, [closings, selectedMonth]);

  const selected = closings.find(item => item.month === selectedMonth)?.record || null;
  const currentMonth = currentMonthKey();

  return <>
    <button
      onClick={() => setOpen(true)}
      title="Histórico de Fechamentos"
      className="fixed bottom-[88px] left-4 z-[153] flex items-center gap-3 rounded-2xl border border-cyan-300/20 bg-[#121b20]/95 px-4 py-3 text-left text-white shadow-2xl shadow-black/45 backdrop-blur-xl transition hover:border-cyan-300/40 active:scale-[.98]"
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.07] text-cyan-300"><Archive size={19}/></span>
      <span className="hidden sm:block"><span className="block text-[9px] font-black uppercase tracking-[.16em] text-cyan-300">MEUS RESULTADOS</span><span className="mt-0.5 block text-sm font-semibold">Fechamentos</span></span>
    </button>

    {open && <div className="fixed inset-0 z-[575] bg-black/80 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#10151a] text-white md:mx-auto md:my-[3vh] md:h-[94dvh] md:max-w-6xl md:rounded-[30px] md:border md:border-white/10 md:shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex shrink-0 items-start justify-between border-b border-white/10 p-5 md:p-6">
          <div>
            <div className="flex items-center gap-2 text-cyan-300"><Archive size={15}/><p className="text-[10px] font-black uppercase tracking-[.18em]">MOTYQ · HISTÓRICO DE FECHAMENTOS</p></div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Seu resultado, mês a mês.</h2>
            <p className="mt-2 text-sm text-zinc-500">{storeName} · arquivo privado do seu login.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[.04] text-zinc-400"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/></button>
            <button onClick={() => setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[.04] text-zinc-400"><X size={18}/></button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[310px_1fr]">
          <aside className="max-h-[34dvh] overflow-y-auto border-b border-white/10 p-4 md:max-h-none md:border-b-0 md:border-r md:p-5">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[.15em] text-zinc-600">MESES REGISTRADOS</p>
            {feedback && <div className="mb-3 rounded-2xl border border-amber-400/15 bg-amber-400/[.05] p-3 text-xs text-amber-200">{feedback}</div>}
            {!loading && !closings.length && <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm leading-6 text-zinc-500">Ainda não há fechamento arquivado. Quando o gestor importar um mapa com data de referência do mês, ele aparecerá aqui.</div>}
            <div className="space-y-2">
              {closings.map(item => {
                const metrics = item.record.metrics;
                const active = selectedMonth === item.month;
                const inProgress = item.month === currentMonth;
                return <button key={item.month} onClick={() => setSelectedMonth(item.month)} className={`w-full rounded-[20px] border p-4 text-left transition ${active ? 'border-cyan-300/25 bg-cyan-300/[.07]' : 'border-white/10 bg-white/[.025] hover:bg-white/[.045]'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[.13em] text-cyan-300">{inProgress ? 'MÊS EM ANDAMENTO' : 'FECHAMENTO'}</p>
                      <p className="mt-1 font-semibold text-white">{monthLabel(item.month)}</p>
                      <p className="mt-1 text-xs text-zinc-600">Mapa {brDate(item.record.referenceDate)}</p>
                    </div>
                    <ChevronRight size={17} className="mt-1 text-zinc-600"/>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div><p className="text-[9px] uppercase tracking-[.12em] text-zinc-600">Vendas</p><p className="mt-0.5 text-xl font-semibold">{officialClosingCount(metrics)}</p></div>
                    <div className="text-right"><p className="text-[9px] uppercase tracking-[.12em] text-zinc-600">MC Total</p><p className="mt-0.5 text-sm font-semibold text-emerald-300">{formatCurrency(Number(metrics.marginTotal || 0))}</p></div>
                  </div>
                </button>;
              })}
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto p-4 pb-10 md:p-6">
            {!selected ? <div className="grid min-h-72 place-items-center text-center text-sm text-zinc-600"><div><CalendarDays className="mx-auto mb-3"/><p>Selecione um mês para abrir o fechamento.</p></div></div> : (() => {
              const m = selected.metrics;
              const sales = officialClosingCount(m);
              const closingRate = officialClosingRate(m);
              const inProgress = monthKey(selected.referenceDate) === currentMonth;
              return <div className="space-y-5">
                <section className="rounded-[26px] border border-white/10 bg-gradient-to-br from-white/[.055] to-white/[.018] p-5 md:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[.15em] text-cyan-300">{inProgress ? 'PARCIAL DO MÊS' : 'FECHAMENTO MENSAL'}</p>
                      <h3 className="mt-1 text-3xl font-semibold">{monthLabel(monthKey(selected.referenceDate))}</h3>
                      <p className="mt-1 text-sm text-zinc-500">Última fotografia registrada: {brDate(selected.referenceDate)} · aba {selected.sheetName}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[.05] px-4 py-3 sm:text-right">
                      <p className="text-[9px] font-black uppercase tracking-[.13em] text-emerald-300">MC TOTAL</p>
                      <p className="mt-1 text-2xl font-semibold text-emerald-200">{formatCurrency(Number(m.marginTotal || 0))}</p>
                      <p className="mt-1 text-xs text-zinc-600">MC média {formatCurrency(Number(m.marginPerCar || 0))}</p>
                    </div>
                  </div>
                </section>

                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric icon={<Target size={18}/>} label="Vendas" value={`${sales}`} hint={`${Number(m.syonetSales || 0)} venda(s) Syonet`} />
                  <Metric icon={<WalletCards size={18}/>} label="Margem MC" value={pct(m.marginPercent)} hint={formatCurrency(Number(m.marginTotal || 0))} />
                  <Metric icon={<Repeat2 size={18}/>} label="Captura" value={pct(m.capturePercent)} hint={`${Number(m.captureQty || 0)} captura(s)`} />
                  <Metric icon={<BarChart3 size={18}/>} label="Fechamento" value={pct(closingRate)} hint={`${Number(m.flowTotal || 0)} no fluxo`} />
                </section>

                <section className="rounded-[26px] border border-white/10 bg-white/[.025] p-5 md:p-6">
                  <div className="flex items-center gap-2 text-zinc-400"><Activity size={17}/><p className="text-[10px] font-black uppercase tracking-[.14em]">MAPA COMPLETO</p></div>
                  <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                    <Data label="Passagens" value={m.passages} />
                    <Data label="Pedidos" value={m.orders} />
                    <Data label="Fluxo total" value={m.flowTotal} />
                    <Data label="Pedido %" value={pct(m.orderPercent)} />
                    <Data label="Trabalho no período" value={m.workInPeriod} />
                    <Data label="Média contatos/dia" value={Number(m.avgContactsPerDay || 0).toFixed(1)} />
                    <Data label="Avaliações" value={m.evaluations} />
                    <Data label="Taxa avaliação" value={pct(m.evaluationRate)} />
                    <Data label="Vendas / fechamento" value={sales} />
                    <Data label="Vendas Syonet" value={m.syonetSales} />
                    <Data label="Fechamento %" value={pct(closingRate)} />
                    <Data label="MC por carro" value={formatCurrency(Number(m.marginPerCar || 0))} />
                    <Data label="MC total" value={formatCurrency(Number(m.marginTotal || 0))} strong />
                    <Data label="MC %" value={pct(m.marginPercent)} />
                    <Data label="Qtde captura" value={m.captureQty} />
                    <Data label="Captura %" value={pct(m.capturePercent)} />
                    <Data label="Caixa d'água" value={m.pipeline} />
                    <Data label="Projeção" value={Number(m.projection || 0).toFixed(1)} />
                    <Data label="Compra adicional" value={m.additionalPurchase} />
                  </div>
                </section>

                <div className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[.035] px-4 py-3 text-xs leading-5 text-cyan-100/70">O fechamento é sempre a última fotografia registrada para aquele mês. Se um mapa final de 31/08 for importado depois, ele substitui automaticamente a fotografia anterior de agosto neste histórico, sem apagar os pontos diários.</div>
              </div>;
            })()}
          </main>
        </div>
      </div>
    </div>}
  </>;
};

const Metric = ({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) => <div className="rounded-[22px] border border-white/10 bg-white/[.03] p-4"><div className="mb-4 grid h-9 w-9 place-items-center rounded-xl bg-white/[.05] text-zinc-300">{icon}</div><p className="text-[9px] font-black uppercase tracking-[.12em] text-zinc-600">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-zinc-600">{hint}</p></div>;
const Data = ({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) => <div className={`rounded-2xl border p-3.5 ${strong ? 'border-emerald-300/15 bg-emerald-300/[.045]' : 'border-white/10 bg-black/15'}`}><p className="text-[9px] font-black uppercase tracking-[.11em] text-zinc-600">{label}</p><p className={`mt-1.5 text-base font-semibold ${strong ? 'text-emerald-200' : 'text-white'}`}>{value ?? 0}</p></div>;

export default SellerClosingHistory;
