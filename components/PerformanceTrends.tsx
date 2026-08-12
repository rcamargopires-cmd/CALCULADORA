import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, History, Minus } from 'lucide-react';
import { OperationalStockHistoryPoint } from '../services/operationalDataService';

export type PerformanceTrendPoint = {
  date: string;
  sales: number;
  projection: number;
  margin: number;
  capture: number;
  evaluations: number;
  closingRate: number;
};

type MetricKey = 'projection' | 'sales' | 'capture' | 'margin' | 'evaluations' | 'closingRate';

type Metric = {
  key: MetricKey;
  label: string;
  suffix: string;
  decimals: number;
};

type Props = {
  title: string;
  subtitle?: string;
  data: PerformanceTrendPoint[];
  goal?: number;
  stockHistory?: OperationalStockHistoryPoint[];
};

const METRICS: Metric[] = [
  { key: 'projection', label: 'Projeção', suffix: '', decimals: 1 },
  { key: 'sales', label: 'Vendas', suffix: '', decimals: 0 },
  { key: 'capture', label: 'Captura', suffix: '%', decimals: 1 },
  { key: 'margin', label: 'Margem MC', suffix: '%', decimals: 1 },
  { key: 'evaluations', label: 'Avaliações', suffix: '', decimals: 0 },
  { key: 'closingRate', label: 'Fechamento', suffix: '%', decimals: 1 },
];

const dayLabel = (date: string) => {
  const [, month, day] = date.split('-');
  return day && month ? `${day}/${month}` : date;
};

const formatMetric = (value: number, metric: Metric) => `${Number(value || 0).toFixed(metric.decimals)}${metric.suffix}`;

const PerformanceTrends: React.FC<Props> = ({ title, subtitle, data, goal, stockHistory = [] }) => {
  const [metricKey, setMetricKey] = useState<MetricKey>('projection');
  const metric = METRICS.find(item => item.key === metricKey) || METRICS[0];

  const monthData = useMemo(() => {
    if (!data.length) return [];
    const latest = data[data.length - 1]?.date.slice(0, 7);
    return data.filter(item => item.date.startsWith(latest)).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const latest = monthData[monthData.length - 1];
  const previous = monthData.length > 1 ? monthData[monthData.length - 2] : undefined;
  const currentValue = latest ? Number(latest[metric.key] || 0) : 0;
  const previousValue = previous ? Number(previous[metric.key] || 0) : currentValue;
  const delta = currentValue - previousValue;

  const trendText = useMemo(() => {
    if (!latest) return 'O histórico começa na próxima atualização do mapa.';
    if (!previous) return 'Primeiro ponto do histórico salvo. A tendência aparecerá a partir da próxima atualização.';

    const projectionDelta = latest.projection - previous.projection;
    const captureDelta = latest.capture - previous.capture;
    const marginDelta = latest.margin - previous.margin;

    if (projectionDelta >= 1) return `A projeção subiu ${projectionDelta.toFixed(1)} desde o último mapa. O ritmo está ganhando força.`;
    if (projectionDelta <= -1) return `A projeção caiu ${Math.abs(projectionDelta).toFixed(1)} desde o último mapa. Vale atacar geração e fechamento.`;
    if (captureDelta <= -5) return `A captura caiu ${Math.abs(captureDelta).toFixed(1)} p.p. entre as duas últimas atualizações.`;
    if (marginDelta <= -1) return `A margem recuou ${Math.abs(marginDelta).toFixed(1)} p.p. no último movimento. Proteja rentabilidade.`;
    return 'Os principais indicadores estão estáveis entre as últimas atualizações.';
  }, [latest, previous]);

  const latestStock = stockHistory[stockHistory.length - 1];
  const previousStock = stockHistory.length > 1 ? stockHistory[stockHistory.length - 2] : undefined;

  return (
    <section className="rounded-[30px] border border-white/10 bg-gradient-to-br from-white/[0.055] to-white/[0.025] p-5 md:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-zinc-500"><History size={16}/><p className="text-xs font-semibold uppercase tracking-[0.14em]">Trends</p></div>
          <h3 className="mt-1 text-xl font-semibold text-white">{title}</h3>
          {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-black/20 p-1">
          {METRICS.map(item => (
            <button
              key={item.key}
              onClick={() => setMetricKey(item.key)}
              className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-medium transition ${metricKey === item.key ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {!monthData.length ? (
        <div className="mt-6 rounded-[24px] border border-dashed border-white/10 p-8 text-center">
          <Activity className="mx-auto text-zinc-700" size={24}/>
          <p className="mt-3 text-sm text-zinc-500">Ainda não há snapshots suficientes para desenhar a evolução.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 xl:grid-cols-[1.55fr_.45fr]">
          <div className="rounded-[24px] border border-white/10 bg-black/20 p-3 md:p-5">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs text-zinc-600">{metric.label} atual</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-2xl font-semibold text-white">{formatMetric(currentValue, metric)}</span>
                  {previous && <DeltaBadge delta={delta} suffix={metric.suffix}/>} 
                </div>
              </div>
              <p className="text-xs text-zinc-600">{monthData.length} atualização(ões) no mês</p>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthData} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`trend-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ffffff" stopOpacity={0.22}/>
                      <stop offset="95%" stopColor="#ffffff" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false}/>
                  <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={48}/>
                  <Tooltip
                    cursor={{ stroke: 'rgba(255,255,255,0.12)' }}
                    contentStyle={{ background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, color: '#fff' }}
                    labelFormatter={(label) => `Data ${dayLabel(String(label))}`}
                    formatter={(value: number) => [formatMetric(Number(value), metric), metric.label]}
                  />
                  {goal && (metric.key === 'projection' || metric.key === 'sales') && <ReferenceLine y={goal} stroke="rgba(251,191,36,0.7)" strokeDasharray="5 5" label={{ value: `Meta ${goal}`, fill: '#fbbf24', fontSize: 10, position: 'insideTopRight' }}/>} 
                  <Area type="monotone" dataKey={metric.key} stroke="#ffffff" strokeWidth={2.5} fill={`url(#trend-${metric.key})`} activeDot={{ r: 5, fill: '#fff' }}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-[24px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-600">Leitura da tendência</p>
              <p className="mt-3 text-sm leading-6 text-zinc-300">{trendText}</p>
            </div>
            <TrendMini label="Vendas" current={latest.sales} previous={previous?.sales}/>
            <TrendMini label="Projeção" current={latest.projection} previous={previous?.projection} decimals={1}/>
            <TrendMini label="Captura" current={latest.capture} previous={previous?.capture} suffix="%" decimals={1}/>
            <TrendMini label="Margem" current={latest.margin} previous={previous?.margin} suffix="%" decimals={1}/>
          </div>
        </div>
      )}

      {latestStock && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StockMini label="Estoque" value={`${latestStock.stockCount}`} delta={previousStock ? latestStock.stockCount - previousStock.stockCount : undefined}/>
          <StockMini label="Acima de 60 dias" value={`${latestStock.aged60}`} delta={previousStock ? latestStock.aged60 - previousStock.aged60 : undefined}/>
          <StockMini label="Acima de 90 dias" value={`${latestStock.critical90}`} delta={previousStock ? latestStock.critical90 - previousStock.critical90 : undefined}/>
          <StockMini label="Capital +90" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(latestStock.critical90Value)} />
        </div>
      )}
    </section>
  );
};

const DeltaBadge = ({ delta, suffix = '' }: { delta: number; suffix?: string }) => {
  if (Math.abs(delta) < 0.001) return <span className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-1 text-[10px] text-zinc-500"><Minus size={11}/> estável</span>;
  const positive = delta > 0;
  return <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] ${positive ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{positive ? <ArrowUpRight size={11}/> : <ArrowDownRight size={11}/>} {positive ? '+' : ''}{delta.toFixed(1)}{suffix}</span>;
};

const TrendMini = ({ label, current, previous, suffix = '', decimals = 0 }: { label: string; current: number; previous?: number; suffix?: string; decimals?: number }) => {
  const delta = previous === undefined ? 0 : current - previous;
  return <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4"><div className="flex items-center justify-between"><p className="text-xs text-zinc-500">{label}</p><ArrowRight size={13} className="text-zinc-700"/></div><div className="mt-2 flex items-end justify-between gap-3"><span className="text-lg font-semibold text-white">{current.toFixed(decimals)}{suffix}</span>{previous !== undefined && <span className={`text-xs ${delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-zinc-600'}`}>{delta > 0 ? '+' : ''}{delta.toFixed(decimals)}{suffix}</span>}</div></div>;
};

const StockMini = ({ label, value, delta }: { label: string; value: string; delta?: number }) => <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] uppercase tracking-[0.1em] text-zinc-600">{label}</p><div className="mt-2 flex items-end justify-between gap-2"><span className="text-lg font-semibold text-white">{value}</span>{delta !== undefined && <span className={`text-xs ${delta < 0 ? 'text-emerald-400' : delta > 0 ? 'text-amber-300' : 'text-zinc-600'}`}>{delta > 0 ? '+' : ''}{delta}</span>}</div></div>;

export default PerformanceTrends;
