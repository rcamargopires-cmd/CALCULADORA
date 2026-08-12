import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CarFront, ChevronRight, CircleAlert, RefreshCw, Target, TrendingUp, Users, WalletCards, X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { OperationalPerformanceSeller, OperationalPerformanceSnapshot, OperationalStockItem, Store, User } from '../types';
import { formatCurrency } from '../utils/currency';
import { storeService } from '../services/storeService';
import { storeScopedOperationalService } from '../services/storeScopedOperationalService';
import { storeScopeService } from '../services/storeScopeService';

type PerformanceConfig = {
  monthlyGoal: number;
  captureGoal: number;
  healthyMargin: number;
};

const DEFAULTS: PerformanceConfig = { monthlyGoal: 70, captureGoal: 60, healthyMargin: 8 };

const officialClosingRate = (item: OperationalPerformanceSeller | null | undefined) => {
  if (!item) return 0;
  const flow = Number(item.flowTotal || 0);
  const rawRate = Number(item.closingPercent || 0);
  const rawClosing = Number(item.closing || 0);
  if (flow > 0 && rawRate > 0 && rawRate <= 2 && Math.abs(rawRate - rawClosing) < 0.000001) return rawRate * 100;
  return rawRate;
};

const officialClosingCount = (item: OperationalPerformanceSeller | null | undefined) => {
  if (!item) return 0;
  const flow = Number(item.flowTotal || 0);
  const rate = officialClosingRate(item);
  if (flow > 0 && Number.isFinite(rate)) {
    const derived = (rate / 100) * flow;
    const rounded = Math.round(derived);
    return Math.abs(derived - rounded) < 0.02 ? rounded : Number(derived.toFixed(2));
  }
  return Number(item.closing || 0);
};

const totalFromSnapshot = (snapshot: OperationalPerformanceSnapshot | null): OperationalPerformanceSeller | null => {
  if (!snapshot) return null;
  if (snapshot.total) return snapshot.total;
  const sellers = snapshot.sellers || [];
  if (!sellers.length) return null;
  const sum = (key: keyof OperationalPerformanceSeller) => sellers.reduce((acc, item) => acc + Number(item[key] || 0), 0);
  const closing = sellers.reduce((acc, item) => acc + officialClosingCount(item), 0);
  const flow = sum('flowTotal');
  return {
    seller: 'TOTAL', sellerKey: 'total', passages: sum('passages'), orders: sum('orders'), flowTotal: flow, orderPercent: 0,
    workInPeriod: sum('workInPeriod'), avgContactsPerDay: 0, evaluations: sum('evaluations'), evaluationRate: 0,
    closing, syonetSales: sum('syonetSales'), closingPercent: flow ? closing / flow * 100 : 0,
    marginPerCar: closing ? sum('marginTotal') / closing : 0, marginTotal: sum('marginTotal'),
    marginPercent: closing ? sellers.reduce((acc, item) => acc + Number(item.marginPercent || 0) * officialClosingCount(item), 0) / closing : 0,
    captureQty: sum('captureQty'), capturePercent: closing ? sum('captureQty') / closing * 100 : 0,
    pipeline: sum('pipeline'), projection: sum('projection'), additionalPurchase: sum('additionalPurchase'),
  };
};

type StoreRow = {
  store: Store;
  snapshot: OperationalPerformanceSnapshot | null;
  stock: OperationalStockItem[];
  sales: number;
  projection: number;
  margin: number;
  capture: number;
  evaluations: number;
  closingRate: number;
  stockValue: number;
  aged60: number;
  critical90: number;
  criticalValue: number;
};

const GroupOverview: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [rows, setRows] = useState<StoreRow[]>([]);
  const [performance, setPerformance] = useState<PerformanceConfig>(DEFAULTS);

  const load = async () => {
    setLoading(true);
    try {
      const [storeList, perfSnap] = await Promise.all([storeService.getAll(), getDoc(doc(db, 'config/performance'))]);
      const active = storeList.filter(store => store.active);
      setStores(active);
      if (perfSnap.exists()) setPerformance({ ...DEFAULTS, ...(perfSnap.data() as Partial<PerformanceConfig>) });

      const data = await Promise.all(active.map(async store => {
        const [snapshot, stock] = await Promise.all([
          storeScopedOperationalService.getLatestPerformance(store.id),
          storeScopedOperationalService.getLatestStock(store.id),
        ]);
        const total = totalFromSnapshot(snapshot);
        const sales = officialClosingCount(total);
        const stockValue = stock.reduce((sum, item) => sum + Number(item.cost || 0), 0);
        const aged60 = stock.filter(item => Number(item.stockDays || 0) > 60).length;
        const critical = stock.filter(item => Number(item.stockDays || 0) > 90);
        const criticalValue = critical.reduce((sum, item) => sum + Number(item.cost || 0), 0);
        return {
          store, snapshot, stock, sales,
          projection: Number(total?.projection || 0),
          margin: Number(total?.marginPercent || 0),
          capture: Number(total?.capturePercent || 0),
          evaluations: Number(total?.evaluations || 0),
          closingRate: officialClosingRate(total),
          stockValue, aged60, critical90: critical.length, criticalValue,
        } as StoreRow;
      }));
      setRows(data);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const refresh = () => { if (open) load(); };
    window.addEventListener('dealmaster:operational-data-updated', refresh);
    return () => window.removeEventListener('dealmaster:operational-data-updated', refresh);
  }, [open]);

  const summary = useMemo(() => {
    const withData = rows.filter(row => !!row.snapshot);
    const sales = withData.reduce((sum, row) => sum + row.sales, 0);
    const goal = withData.length * performance.monthlyGoal;
    const projection = withData.reduce((sum, row) => sum + row.projection, 0);
    const captures = withData.reduce((sum, row) => sum + Number(totalFromSnapshot(row.snapshot)?.captureQty || 0), 0);
    const capture = sales ? captures / sales * 100 : 0;
    const marginValue = withData.reduce((sum, row) => sum + Number(totalFromSnapshot(row.snapshot)?.marginTotal || 0), 0);
    const margin = sales ? withData.reduce((sum, row) => sum + row.margin * row.sales, 0) / sales : 0;
    const evaluations = withData.reduce((sum, row) => sum + row.evaluations, 0);
    const stockCount = rows.reduce((sum, row) => sum + row.stock.length, 0);
    const stockValue = rows.reduce((sum, row) => sum + row.stockValue, 0);
    const critical90 = rows.reduce((sum, row) => sum + row.critical90, 0);
    const criticalValue = rows.reduce((sum, row) => sum + row.criticalValue, 0);
    return { withData, sales, goal, projection, capture, margin, marginValue, evaluations, stockCount, stockValue, critical90, criticalValue };
  }, [rows, performance]);

  const ranking = useMemo(() => [...rows].sort((a, b) => {
    if (!!a.snapshot !== !!b.snapshot) return a.snapshot ? -1 : 1;
    const aCoverage = a.snapshot ? a.projection / Math.max(performance.monthlyGoal, 1) : -1;
    const bCoverage = b.snapshot ? b.projection / Math.max(performance.monthlyGoal, 1) : -1;
    return bCoverage - aCoverage;
  }), [rows, performance]);

  const openStore = (storeId: string) => {
    storeScopeService.set(storeId);
    setOpen(false);
  };

  if (currentUser.role !== 'admin') return null;

  return <>
    <button onClick={() => { setOpen(true); load(); }} className="fixed bottom-44 left-5 z-[143] flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl">
      <Building2 size={18}/> Grupo
    </button>

    {open && <div className="fixed inset-0 z-[230] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-[34px] border border-white/10 bg-zinc-950 shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-white/10 p-5 md:p-6">
          <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-black"><Building2 size={21}/></div><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Group Command Center</p><h3 className="mt-1 text-xl font-semibold text-white">Consolidado do grupo</h3><p className="mt-1 text-xs text-zinc-500">Visão executiva das unidades ativas. Lojas sem mapa ficam fora da meta consolidada.</p></div></div>
          <div className="flex gap-2"><button onClick={load} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/></button><button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><X size={18}/></button></div>
        </header>

        <div className="space-y-5 p-5 md:p-6">
          <section className="rounded-[30px] border border-white/10 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-6 md:p-7">
            <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr] lg:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">GoalTrack · Grupo</p><div className="mt-3 flex items-end gap-3"><span className="text-6xl font-semibold tracking-[-0.06em] text-white">{summary.sales}</span><span className="pb-2 text-xl text-zinc-500">de {summary.goal}</span></div><div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white" style={{ width: `${Math.min(summary.sales / Math.max(summary.goal, 1) * 100, 100)}%` }}/></div></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Mini label="Unidades com dados" value={`${summary.withData.length}/${stores.length}`}/><Mini label="Projeção grupo" value={summary.projection.toFixed(1)}/><Mini label="Captura" value={`${summary.capture.toFixed(1)}%`}/><Mini label="Margem MC" value={`${summary.margin.toFixed(1)}%`}/></div></div>
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Metric icon={<TrendingUp size={18}/>} label="Vendas" value={`${summary.sales}`} hint={`Meta consolidada ${summary.goal}`}/><Metric icon={<WalletCards size={18}/>} label="Margem MC" value={`${summary.margin.toFixed(1)}%`} hint={formatCurrency(summary.marginValue)}/><Metric icon={<CarFront size={18}/>} label="Estoque do grupo" value={`${summary.stockCount}`} hint={formatCurrency(summary.stockValue)}/><Metric icon={<CircleAlert size={18}/>} label="Estoque +90" value={`${summary.critical90}`} hint={formatCurrency(summary.criticalValue)}/></section>

          <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-6"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Ranking das unidades</p><h4 className="mt-1 text-xl font-semibold text-white">Ritmo e saúde operacional</h4></div><p className="hidden text-xs text-zinc-600 md:block">Ordenado por cobertura da meta projetada</p></div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">{ranking.map((row, index) => {
              const hasData = !!row.snapshot;
              const coverage = hasData ? row.projection / Math.max(performance.monthlyGoal, 1) * 100 : 0;
              const healthy = hasData && row.projection >= performance.monthlyGoal && row.capture >= performance.captureGoal && (row.sales === 0 || row.margin >= performance.healthyMargin);
              return <button key={row.store.id} onClick={() => openStore(row.store.id)} className="group rounded-[24px] border border-white/10 bg-black/20 p-4 text-left transition hover:border-white/20 hover:bg-white/[0.045]"><div className="flex items-start justify-between gap-4"><div className="flex gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-xs font-bold text-zinc-400">{index + 1}</div><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-white">{row.store.name}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${!hasData ? 'bg-zinc-800 text-zinc-500' : healthy ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>{!hasData ? 'Aguardando dados' : healthy ? 'No ritmo' : 'Atenção'}</span></div><p className="mt-1 text-xs text-zinc-500">{hasData ? `${row.sales}/${performance.monthlyGoal} vendas · projeção ${row.projection.toFixed(1)} · ${coverage.toFixed(0)}% da meta` : 'Importe o Mapa de Performance para incluir no consolidado.'}</p></div></div><ChevronRight size={17} className="mt-2 text-zinc-700 transition group-hover:translate-x-0.5 group-hover:text-zinc-400"/></div>{hasData && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Small label="MC" value={`${row.margin.toFixed(1)}%`}/><Small label="Captura" value={`${row.capture.toFixed(1)}%`}/><Small label="Avaliações" value={`${row.evaluations}`}/><Small label="+90 dias" value={`${row.critical90}`}/></div>}</button>})}</div>
          </section>

          <section className="rounded-[24px] border border-blue-400/15 bg-blue-400/[0.055] p-4"><div className="flex gap-3"><Users size={17} className="mt-0.5 shrink-0 text-blue-300"/><div><p className="text-sm font-medium text-blue-200">Como usar esta visão</p><p className="mt-1 text-xs leading-5 text-blue-200/60">Clique em qualquer unidade para sair do consolidado e abrir o Command Center daquela loja. O Grupo não altera nem mistura os dados individuais.</p></div></div></section>
        </div>
      </div>
    </div>}
  </>;
};

const Mini = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl bg-black/25 p-3"><p className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</p><p className="mt-1 text-sm font-semibold text-zinc-200">{value}</p></div>;
const Small = ({ label, value }: { label: string; value: string }) => <div className="rounded-xl bg-white/[0.04] p-2.5"><p className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</p><p className="mt-1 text-sm font-semibold text-zinc-200">{value}</p></div>;
const Metric = ({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) => <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center gap-2 text-zinc-500">{icon}<span className="text-xs font-semibold uppercase tracking-[0.12em]">{label}</span></div><p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p><p className="mt-1 text-xs text-zinc-600">{hint}</p></div>;

export default GroupOverview;
