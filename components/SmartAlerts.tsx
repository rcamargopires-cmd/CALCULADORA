import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, RefreshCw, ShieldAlert, TrendingDown, TrendingUp, X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../firebase';
import { OperationalPerformanceSeller, OperationalPerformanceSnapshot, User } from '../types';
import { normalize, OperationalStockHistoryPoint, operationalDataService } from '../services/operationalDataService';
import { userService } from '../services/userService';

interface PerformanceConfig {
  monthlyGoal: number;
  captureGoal: number;
  healthyMargin: number;
  sellerMonthlyGoal: number;
  sellerCaptureGoal: number;
  sellerFirstHalfGoal: number;
  holidays: string[];
}

const DEFAULTS: PerformanceConfig = {
  monthlyGoal: 70,
  captureGoal: 60,
  healthyMargin: 8,
  sellerMonthlyGoal: 15,
  sellerCaptureGoal: 60,
  sellerFirstHalfGoal: 6,
  holidays: [],
};

type AlertTone = 'critical' | 'warning' | 'good' | 'info';

type SmartAlert = {
  id: string;
  tone: AlertTone;
  title: string;
  text: string;
  metric?: string;
  scope?: string;
};

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

const totalFromSnapshot = (snapshot: OperationalPerformanceSnapshot): OperationalPerformanceSeller | null => {
  if (snapshot.total) return snapshot.total;
  const sellers = snapshot.sellers || [];
  if (!sellers.length) return null;
  const sum = (key: keyof OperationalPerformanceSeller) => sellers.reduce((acc, item) => acc + Number(item[key] || 0), 0);
  const closingTotal = sellers.reduce((acc, item) => acc + officialClosingCount(item), 0);
  const flowTotal = sum('flowTotal');
  return {
    seller: 'TOTAL', sellerKey: 'total', passages: sum('passages'), orders: sum('orders'), flowTotal, orderPercent: 0,
    workInPeriod: sum('workInPeriod'), avgContactsPerDay: 0, evaluations: sum('evaluations'), evaluationRate: 0,
    closing: closingTotal, syonetSales: sum('syonetSales'), closingPercent: flowTotal ? closingTotal / flowTotal * 100 : 0,
    marginPerCar: closingTotal ? sum('marginTotal') / closingTotal : 0, marginTotal: sum('marginTotal'),
    marginPercent: closingTotal ? sellers.reduce((acc, item) => acc + Number(item.marginPercent || 0) * officialClosingCount(item), 0) / closingTotal : 0,
    captureQty: sum('captureQty'), capturePercent: closingTotal ? sum('captureQty') / closingTotal * 100 : 0,
    pipeline: sum('pipeline'), projection: sum('projection'), additionalPurchase: sum('additionalPurchase'),
  };
};

const dayLabel = (date: string) => {
  const [, month, day] = date.split('-');
  return day && month ? `${day}/${month}` : date;
};

const rank: Record<AlertTone, number> = { critical: 0, warning: 1, info: 2, good: 3 };

const SmartAlerts: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [performanceHistory, setPerformanceHistory] = useState<OperationalPerformanceSnapshot[]>([]);
  const [stockHistory, setStockHistory] = useState<OperationalStockHistoryPoint[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [performance, setPerformance] = useState<PerformanceConfig>(DEFAULTS);

  const load = async () => {
    setLoading(true);
    try {
      const [history, stocks, allUsers, perf] = await Promise.all([
        operationalDataService.getPerformanceHistory(),
        operationalDataService.getStockHistory(),
        userService.getAll(),
        getDoc(doc(db, 'config/performance')),
      ]);
      setPerformanceHistory(history);
      setStockHistory(stocks);
      setUsers(allUsers.filter(user => user.status === 'active'));
      if (perf.exists()) {
        const raw = perf.data() as Partial<PerformanceConfig>;
        setPerformance({ ...DEFAULTS, ...raw, holidays: Array.isArray(raw.holidays) ? raw.holidays : [] });
      }
    } catch (error) {
      console.error('Smart Alerts load error', error);
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
  }, []);

  const alerts = useMemo<SmartAlert[]>(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const validHistory = performanceHistory.filter(item => item.referenceDate && item.referenceDate <= today).sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
    const validStock = stockHistory.filter(item => item.referenceDate && item.referenceDate <= today).sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
    const currentSnapshot = validHistory[validHistory.length - 1];
    const previousSnapshot = validHistory.length > 1 ? validHistory[validHistory.length - 2] : undefined;
    const currentStock = validStock[validStock.length - 1];
    const previousStock = validStock.length > 1 ? validStock[validStock.length - 2] : undefined;
    const items: SmartAlert[] = [];

    if (!currentSnapshot) {
      return [{ id: 'missing-map', tone: 'warning', title: 'Mapa de Performance ainda não disponível', text: 'Importe o mapa do dia para o Smart Alerts começar a comparar a operação.', metric: 'Sem mapa', scope: 'Dados' }];
    }

    if (currentSnapshot.referenceDate < today) {
      items.push({ id: 'stale-map', tone: 'warning', title: 'Mapa ainda não atualizado hoje', text: `O último mapa válido é de ${dayLabel(currentSnapshot.referenceDate)}. Os alertas refletem essa fotografia.`, metric: dayLabel(currentSnapshot.referenceDate), scope: 'Dados' });
    }

    if (!previousSnapshot) {
      items.push({ id: 'first-map', tone: 'info', title: 'Primeiro ponto do histórico', text: 'A partir da próxima atualização diária, o DealMaster começará a apontar mudanças de projeção, captura, margem e vendedores.', metric: 'Histórico iniciado', scope: 'Trends' });
    } else {
      const current = totalFromSnapshot(currentSnapshot);
      const previous = totalFromSnapshot(previousSnapshot);
      if (current && previous) {
        const projectionDelta = Number(current.projection || 0) - Number(previous.projection || 0);
        const captureDelta = Number(current.capturePercent || 0) - Number(previous.capturePercent || 0);
        const marginDelta = Number(current.marginPercent || 0) - Number(previous.marginPercent || 0);
        const currentProjection = Number(current.projection || 0);
        const previousProjection = Number(previous.projection || 0);

        if (previousProjection >= performance.monthlyGoal && currentProjection < performance.monthlyGoal) {
          items.push({ id: 'store-left-goal', tone: 'critical', title: 'Loja saiu da meta projetada', text: `A projeção caiu de ${previousProjection.toFixed(1)} para ${currentProjection.toFixed(1)} e ficou abaixo da meta ${performance.monthlyGoal}.`, metric: `${projectionDelta.toFixed(1)}`, scope: 'Loja' });
        } else if (projectionDelta <= -2) {
          items.push({ id: 'projection-down', tone: 'critical', title: 'Projeção caiu de forma relevante', text: `Entre ${dayLabel(previousSnapshot.referenceDate)} e ${dayLabel(currentSnapshot.referenceDate)}, a projeção da loja caiu ${Math.abs(projectionDelta).toFixed(1)} carro(s).`, metric: `${projectionDelta.toFixed(1)}`, scope: 'Loja' });
        } else if (projectionDelta <= -0.5) {
          items.push({ id: 'projection-soft-down', tone: 'warning', title: 'Projeção perdeu força', text: `A projeção recuou ${Math.abs(projectionDelta).toFixed(1)} desde o último mapa.`, metric: `${projectionDelta.toFixed(1)}`, scope: 'Loja' });
        } else if (projectionDelta >= 2) {
          items.push({ id: 'projection-up', tone: 'good', title: 'Projeção ganhou força', text: `A projeção subiu ${projectionDelta.toFixed(1)} carro(s) desde o último mapa.`, metric: `+${projectionDelta.toFixed(1)}`, scope: 'Loja' });
        }

        if (captureDelta <= -10) {
          items.push({ id: 'capture-critical', tone: 'critical', title: 'Captura despencou', text: `A captura caiu ${Math.abs(captureDelta).toFixed(1)} p.p. desde o último mapa.`, metric: `${captureDelta.toFixed(1)} p.p.`, scope: 'Loja' });
        } else if (captureDelta <= -5) {
          items.push({ id: 'capture-down', tone: 'warning', title: 'Captura caiu', text: `A captura recuou ${Math.abs(captureDelta).toFixed(1)} p.p. entre as últimas atualizações.`, metric: `${captureDelta.toFixed(1)} p.p.`, scope: 'Loja' });
        } else if (captureDelta >= 5) {
          items.push({ id: 'capture-up', tone: 'good', title: 'Captura melhorou', text: `A captura avançou ${captureDelta.toFixed(1)} p.p. desde o último mapa.`, metric: `+${captureDelta.toFixed(1)} p.p.`, scope: 'Loja' });
        }

        if (marginDelta <= -2) {
          items.push({ id: 'margin-critical', tone: 'critical', title: 'Margem perdeu força', text: `A MC caiu ${Math.abs(marginDelta).toFixed(1)} p.p. desde o último mapa.`, metric: `${marginDelta.toFixed(1)} p.p.`, scope: 'Loja' });
        } else if (marginDelta <= -1) {
          items.push({ id: 'margin-down', tone: 'warning', title: 'Margem recuou', text: `A MC caiu ${Math.abs(marginDelta).toFixed(1)} p.p. desde o último mapa.`, metric: `${marginDelta.toFixed(1)} p.p.`, scope: 'Loja' });
        } else if (marginDelta >= 1) {
          items.push({ id: 'margin-up', tone: 'good', title: 'Margem melhorou', text: `A MC avançou ${marginDelta.toFixed(1)} p.p. desde o último mapa.`, metric: `+${marginDelta.toFixed(1)} p.p.`, scope: 'Loja' });
        }
      }

      currentSnapshot.sellers.forEach(currentSeller => {
        const previousSeller = previousSnapshot.sellers.find(item => item.sellerKey === currentSeller.sellerKey);
        if (!previousSeller) return;
        const user = users.find(item => normalize(item.name || '') === currentSeller.sellerKey);
        const sellerGoal = user?.goals?.monthly ?? performance.sellerMonthlyGoal;
        const captureGoal = user?.goals?.capture ?? performance.sellerCaptureGoal;
        const marginGoal = user?.goals?.margin ?? performance.healthyMargin;
        const currentProjection = Number(currentSeller.projection || 0);
        const previousProjection = Number(previousSeller.projection || 0);
        const sellerProjectionDelta = currentProjection - previousProjection;

        if (previousProjection >= sellerGoal && currentProjection < sellerGoal) {
          items.push({ id: `seller-goal-${currentSeller.sellerKey}`, tone: 'critical', title: `${currentSeller.seller} saiu do ritmo`, text: `A projeção passou de ${previousProjection.toFixed(1)} para ${currentProjection.toFixed(1)} e ficou abaixo da meta ${sellerGoal}.`, metric: `${sellerProjectionDelta.toFixed(1)}`, scope: 'Vendedor' });
          return;
        }

        if (sellerProjectionDelta <= -2) {
          items.push({ id: `seller-projection-${currentSeller.sellerKey}`, tone: 'warning', title: `${currentSeller.seller} perdeu projeção`, text: `A projeção caiu ${Math.abs(sellerProjectionDelta).toFixed(1)} carro(s) desde o último mapa.`, metric: `${sellerProjectionDelta.toFixed(1)}`, scope: 'Vendedor' });
          return;
        }

        const previousCapture = Number(previousSeller.capturePercent || 0);
        const currentCapture = Number(currentSeller.capturePercent || 0);
        if (previousCapture >= captureGoal && currentCapture < captureGoal) {
          items.push({ id: `seller-capture-${currentSeller.sellerKey}`, tone: 'warning', title: `${currentSeller.seller} caiu abaixo da meta de captura`, text: `Captura passou de ${previousCapture.toFixed(1)}% para ${currentCapture.toFixed(1)}%. Meta: ${captureGoal}%.`, metric: `${currentCapture.toFixed(1)}%`, scope: 'Vendedor' });
          return;
        }

        const previousMargin = Number(previousSeller.marginPercent || 0);
        const currentMargin = Number(currentSeller.marginPercent || 0);
        if (officialClosingCount(currentSeller) > 0 && previousMargin >= marginGoal && currentMargin < marginGoal) {
          items.push({ id: `seller-margin-${currentSeller.sellerKey}`, tone: 'warning', title: `${currentSeller.seller} caiu abaixo da meta de margem`, text: `MC passou de ${previousMargin.toFixed(1)}% para ${currentMargin.toFixed(1)}%. Meta: ${marginGoal}%.`, metric: `${currentMargin.toFixed(1)}%`, scope: 'Vendedor' });
        }
      });
    }

    if (currentStock && previousStock) {
      const criticalDelta = Number(currentStock.critical90 || 0) - Number(previousStock.critical90 || 0);
      if (criticalDelta > 0) {
        items.push({ id: 'stock90-up', tone: criticalDelta >= 3 ? 'critical' : 'warning', title: 'Mais carros entraram no +90 dias', text: `${criticalDelta} veículo(s) a mais estão agora na faixa crítica de estoque.`, metric: `+${criticalDelta}`, scope: 'Estoque' });
      } else if (criticalDelta < 0) {
        items.push({ id: 'stock90-down', tone: 'good', title: 'Estoque crítico reduziu', text: `${Math.abs(criticalDelta)} veículo(s) saíram da faixa +90 dias desde a última fotografia.`, metric: `${criticalDelta}`, scope: 'Estoque' });
      }
    }

    if (!items.length) {
      items.push({ id: 'stable', tone: 'good', title: 'Sem mudanças críticas detectadas', text: 'Os principais indicadores não tiveram variações relevantes entre as últimas atualizações.', metric: 'Estável', scope: 'Operação' });
    }

    return items.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 8);
  }, [performanceHistory, stockHistory, users, performance]);

  const activeCount = alerts.filter(item => item.tone === 'critical' || item.tone === 'warning').length;
  const criticalCount = alerts.filter(item => item.tone === 'critical').length;

  return <>
    <button
      onClick={() => { setOpen(true); if (!loadedOnce) load(); }}
      className="fixed bottom-20 right-5 z-[139] flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl shadow-black/40 transition active:scale-95"
    >
      <BellRing size={18}/>
      Smart Alerts
      {activeCount > 0 && <span className={`grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${criticalCount ? 'bg-red-500 text-white' : 'bg-amber-400 text-black'}`}>{activeCount}</span>}
    </button>

    {open && <div className="fixed inset-0 z-[210] overflow-y-auto bg-black/75 p-3 backdrop-blur-md md:p-6" onClick={() => setOpen(false)}>
      <div className="mx-auto max-w-4xl overflow-hidden rounded-[32px] border border-white/10 bg-zinc-950 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 p-5 md:p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-black"><BellRing size={21}/></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">DealMaster Smart Alerts</p>
              <h3 className="mt-1 text-xl font-semibold text-white">O que mudou desde a última atualização</h3>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/></button>
            <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-400"><X size={18}/></button>
          </div>
        </div>

        <div className="p-5 md:p-6">
          {loading && !loadedOnce ? <div className="grid min-h-56 place-items-center text-zinc-500"><div className="text-center"><RefreshCw className="mx-auto mb-3 animate-spin"/><p>Comparando snapshots...</p></div></div> : <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Summary label="Alertas ativos" value={`${activeCount}`} tone={activeCount ? 'warning' : 'good'}/>
              <Summary label="Críticos" value={`${criticalCount}`} tone={criticalCount ? 'critical' : 'good'}/>
              <Summary label="Comparações" value={`${Math.max(performanceHistory.filter(item => item.referenceDate <= format(new Date(), 'yyyy-MM-dd')).length - 1, 0)}`} tone="info"/>
            </div>

            <div className="mt-5 space-y-3">
              {alerts.map(alert => <AlertCard key={alert.id} alert={alert}/>) }
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-xs leading-5 text-zinc-500">
              O Smart Alerts compara apenas snapshots válidos até a data de hoje. Ele ignora datas futuras e só sinaliza variações relevantes para evitar ruído.
            </div>
          </>}
        </div>
      </div>
    </div>}
  </>;
};

const toneClasses: Record<AlertTone, string> = {
  critical: 'border-red-500/20 bg-red-500/[0.07]',
  warning: 'border-amber-400/20 bg-amber-400/[0.07]',
  good: 'border-emerald-500/20 bg-emerald-500/[0.07]',
  info: 'border-sky-400/20 bg-sky-400/[0.06]',
};

const iconFor = (tone: AlertTone) => {
  if (tone === 'critical') return <ShieldAlert size={18}/>;
  if (tone === 'warning') return <AlertTriangle size={18}/>;
  if (tone === 'good') return <CheckCircle2 size={18}/>;
  return <BellRing size={18}/>;
};

const AlertCard = ({ alert }: { alert: SmartAlert }) => (
  <div className={`rounded-[22px] border p-4 md:p-5 ${toneClasses[alert.tone]}`}>
    <div className="flex items-start gap-4">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/20 ${alert.tone === 'critical' ? 'text-red-300' : alert.tone === 'warning' ? 'text-amber-300' : alert.tone === 'good' ? 'text-emerald-300' : 'text-sky-300'}`}>{iconFor(alert.tone)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            {alert.scope && <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">{alert.scope}</p>}
            <h4 className="mt-1 font-semibold text-white">{alert.title}</h4>
          </div>
          {alert.metric && <span className="rounded-full bg-black/20 px-3 py-1 text-xs font-semibold text-zinc-300">{alert.metric}</span>}
        </div>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{alert.text}</p>
      </div>
    </div>
  </div>
);

const Summary = ({ label, value, tone }: { label: string; value: string; tone: AlertTone }) => {
  const indicator = tone === 'critical' ? 'bg-red-400' : tone === 'warning' ? 'bg-amber-400' : tone === 'good' ? 'bg-emerald-400' : 'bg-sky-400';
  return <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4"><div className="flex items-center justify-between"><p className="text-xs text-zinc-500">{label}</p><span className={`h-2 w-2 rounded-full ${indicator}`}/></div><p className="mt-2 text-2xl font-semibold text-white">{value}</p></div>;
};

export default SmartAlerts;
