import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, CarFront, Crosshair, Percent, Target, TrendingUp } from 'lucide-react';
import { eachDayOfInterval, endOfMonth, format, isAfter } from 'date-fns';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { OperationalSaleItem, SavedCalculation, User } from '../types';
import { operationalDataService } from '../services/operationalDataService';
import { formatCurrency } from '../utils/currency';

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

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const isWorkingDay = (date: Date, holidays: string[]) => date.getDay() !== 0 && !holidays.includes(format(date, 'yyyy-MM-dd'));

const SellerDashboard: React.FC<Props> = ({ currentUser, history, onStartNewCalculation }) => {
  const [sales, setSales] = useState<OperationalSaleItem[]>([]);
  const [performance, setPerformance] = useState<PerformanceConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [allSales, perf] = await Promise.all([
        operationalDataService.getSales(),
        getDoc(doc(db, 'config/performance')),
      ]);
      setSales(allSales);
      if (perf.exists()) {
        const raw = perf.data() as Partial<PerformanceConfig>;
        setPerformance({ ...DEFAULTS, ...raw, holidays: Array.isArray(raw.holidays) ? raw.holidays : [] });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const refresh = () => load();
    window.addEventListener('dealmaster:operational-data-updated', refresh);
    return () => window.removeEventListener('dealmaster:operational-data-updated', refresh);
  }, []);

  const now = new Date();
  const monthPrefix = format(now, 'yyyy-MM');
  const myName = normalize(currentUser.name || '');
  const mySales = useMemo(() => sales.filter(s => s.saleDate?.startsWith(monthPrefix) && normalize(s.seller || '') === myName), [sales, monthPrefix, myName]);
  const myDeals = useMemo(() => history.filter(h => h.userId === currentUser.id), [history, currentUser.id]);
  const openDeals = myDeals.filter(h => h.data.dealStatus !== 'closed').length;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = endOfMonth(now);
  const workDays = eachDayOfInterval({ start: monthStart, end: monthEnd }).filter(d => isWorkingDay(d, performance.holidays));
  const elapsed = workDays.filter(d => !isAfter(d, now));
  const remaining = workDays.filter(d => isAfter(d, now));

  const actual = mySales.length;
  const goal = performance.sellerMonthlyGoal;
  const expectedToday = goal * elapsed.length / Math.max(workDays.length, 1);
  const projection = Math.round(actual / Math.max(elapsed.length, 1) * Math.max(workDays.length, 1));
  const missing = Math.max(goal - actual, 0);
  const dailyNeeded = missing / Math.max(remaining.length, 1);
  const firstHalf = mySales.filter(s => Number(s.saleDate.slice(8, 10)) <= 15).length;

  const totalInvoice = mySales.reduce((s, i) => s + (Number(i.invoiceValue) || 0), 0);
  const totalMargin = mySales.reduce((s, i) => s + (Number(i.marginValue) || 0), 0);
  const margin = totalInvoice ? totalMargin / totalInvoice * 100 : (actual ? mySales.reduce((s, i) => s + (Number(i.marginPercent) || 0), 0) / actual : 0);
  const knownCapture = mySales.filter(s => typeof s.hasTradeIn === 'boolean');
  const capture = knownCapture.length ? knownCapture.filter(s => s.hasTradeIn).length / knownCapture.length * 100 : null;

  const requiredNextMargin = useMemo(() => {
    if (!missing || !actual || !totalInvoice) return performance.healthyMargin;
    const avgTicket = totalInvoice / actual;
    const targetMarginValue = performance.healthyMargin / 100 * (totalInvoice + avgTicket * missing);
    const needed = Math.max(targetMarginValue - totalMargin, 0);
    return needed / Math.max(avgTicket * missing, 1) * 100;
  }, [missing, actual, totalInvoice, totalMargin, performance.healthyMargin]);

  const actionPlan = useMemo(() => {
    const items: string[] = [];
    if (missing > 0) items.push(`Faturar mais ${missing} carro(s) até o fim do mês, ritmo de ${dailyNeeded.toFixed(2)} por dia trabalhado restante.`);
    if (openDeals < missing) items.push(`Você tem ${openDeals} negociação(ões) aberta(s). Mesmo convertendo todas, ainda precisa gerar pelo menos ${missing - openDeals} nova(s) oportunidade(s).`);
    else if (openDeals > 0 && missing > 0) items.push(`Você já tem ${openDeals} negociação(ões) aberta(s), volume suficiente para cobrir a meta se a conversão vier.`);
    if (capture !== null && capture < performance.sellerCaptureGoal) items.push(`Captura em ${capture.toFixed(0)}%. Priorize negócios com troca para recuperar a meta de ${performance.sellerCaptureGoal}%.`);
    if (actual > 0 && margin < performance.healthyMargin) items.push(`Margem média em ${margin.toFixed(1)}%. Para recuperar a média, busque cerca de ${requiredNextMargin.toFixed(1)}% nas próximas vendas.`);
    if (!items.length) items.push('Você está dentro do ritmo. Continue protegendo margem e mantendo geração de oportunidades.');
    return items.slice(0, 4);
  }, [missing, dailyNeeded, openDeals, capture, performance.sellerCaptureGoal, actual, margin, performance.healthyMargin, requiredNextMargin]);

  const status = projection >= goal && (capture === null || capture >= performance.sellerCaptureGoal) && (actual === 0 || margin >= performance.healthyMargin) ? 'good' : projection < goal ? 'warning' : 'attention';
  const firstName = currentUser.name?.split(' ')[0] || 'Vendedor';

  return <div className="pb-24 md:pb-12 space-y-6 md:space-y-8 animate-fade-in">
    <section>
      <p className="text-sm text-zinc-500">{format(now, "dd/MM/yyyy")}</p>
      <h2 className="mt-1 text-3xl font-semibold tracking-tight text-white md:text-4xl">Bom dia, {firstName}.</h2>
      <p className="mt-2 text-zinc-400">Seu painel mostra somente seus resultados, suas negociações e o caminho para a meta.</p>
    </section>

    <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-6 md:p-8">
      <div className="grid gap-7 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
        <div>
          <div className="mb-5 flex items-center gap-2 text-sm text-zinc-400"><Target size={16}/> Minha meta do mês</div>
          <div className="flex items-end gap-3"><span className="text-6xl font-semibold tracking-[-0.06em] text-white md:text-7xl">{actual}</span><span className="pb-2 text-xl text-zinc-500">de {goal}</span></div>
          <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white" style={{ width: `${Math.min(actual / Math.max(goal, 1) * 100, 100)}%` }}/></div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="Esperado hoje" value={expectedToday.toFixed(1)}/><Mini label="Projeção" value={`${projection}`}/><Mini label="Faltam" value={`${missing}`}/><Mini label="Ritmo" value={`${dailyNeeded.toFixed(2)}/dia`}/>
          </div>
        </div>
        <button onClick={onStartNewCalculation} className="flex min-h-24 items-center justify-between rounded-[26px] bg-white px-5 py-5 text-left text-black"><div><span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Ação rápida</span><span className="block text-lg font-semibold">Nova negociação</span><span className="mt-1 block text-sm text-zinc-500">Calcule margem antes de fechar.</span></div><div className="grid h-11 w-11 place-items-center rounded-full bg-black text-white"><ArrowRight size={20}/></div></button>
      </div>
    </section>

    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<CalendarDays size={18}/>} label="Quinzena" value={`${firstHalf}/${performance.sellerFirstHalfGoal}`} hint="Meta até dia 15"/>
      <Metric icon={<Percent size={18}/>} label="Captura" value={capture === null ? 'Não informada' : `${capture.toFixed(0)}%`} hint={`Meta ${performance.sellerCaptureGoal}%`}/>
      <Metric icon={<TrendingUp size={18}/>} label="Margem" value={`${margin.toFixed(1)}%`} hint={`Meta ${performance.healthyMargin}%`}/>
      <Metric icon={<CarFront size={18}/>} label="Negociações abertas" value={`${openDeals}`} hint="Somente as suas"/>
    </section>

    <section className={`rounded-[30px] border p-6 md:p-7 ${status === 'good' ? 'border-emerald-500/20 bg-emerald-500/[0.07]' : 'border-amber-400/20 bg-amber-400/[0.07]'}`}>
      <div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-black"><Crosshair size={20}/></div><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">O que fazer para bater a meta</p><h3 className="mt-1 text-xl font-semibold text-white">Seu plano de ação</h3><div className="mt-4 space-y-3">{actionPlan.map((item, i) => <div key={i} className="flex gap-3 text-sm leading-6 text-zinc-300"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white"/><span>{item}</span></div>)}</div></div></div>
    </section>

    <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7">
      <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Meu resultado</p><h3 className="mt-1 text-xl font-semibold text-white">Vendas faturadas</h3></div><span className="text-sm text-zinc-500">{formatCurrency(totalInvoice)}</span></div>
      <div className="mt-5 space-y-2">{mySales.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-600">Ainda não há faturamentos associados ao seu nome neste mês.</p> : mySales.slice().sort((a,b)=>b.saleDate.localeCompare(a.saleDate)).map(s => <div key={s.id} className="flex items-center justify-between rounded-2xl bg-black/20 p-3"><div><p className="text-sm font-medium text-white">{s.vehicle || s.plate || 'Veículo'}</p><p className="mt-1 text-xs text-zinc-500">{s.saleDate} · {s.plate || 'sem placa'}</p></div><div className="text-right"><p className="text-sm font-semibold text-white">{formatCurrency(s.invoiceValue)}</p><p className="mt-1 text-xs text-zinc-500">margem {s.marginPercent.toFixed(1)}%</p></div></div>)}</div>
    </section>
  </div>;
};

const Mini = ({label,value}:{label:string;value:string}) => <div className="rounded-2xl bg-white/[0.055] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">{label}</p><p className="mt-1 text-lg font-semibold text-white">{value}</p></div>;
const Metric = ({icon,label,value,hint}:{icon:React.ReactNode;label:string;value:string;hint:string}) => <div className="rounded-[26px] border border-white/10 bg-white/[0.035] p-5"><div className="mb-5 grid h-9 w-9 place-items-center rounded-2xl bg-white/[0.06] text-zinc-300">{icon}</div><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-zinc-600">{hint}</p></div>;

export default SellerDashboard;
