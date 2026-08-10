import React, { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, CalendarDays, CarFront, Database, Percent, RefreshCw, Target, TrendingUp, Trophy, Users } from 'lucide-react';
import { eachDayOfInterval, endOfMonth, format, isAfter, isSameDay, parseISO, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { CommissionConfig, OperationalSaleItem, OperationalStockItem, SavedCalculation, User } from '../types';
import { formatCurrency } from '../utils/currency';
import { operationalDataService } from '../services/operationalDataService';

interface DashboardProps { history: SavedCalculation[]; users: User[]; currentUser: User; commissionConfig: CommissionConfig | null; onStartNewCalculation: () => void; onDelete?: (id: string) => void; }
interface PerformanceConfig { monthlyGoal: number; firstHalfPercent: number; captureGoal: number; healthyMargin: number; sellerMonthlyGoal: number; sellerFirstHalfGoal: number; sellerCaptureGoal: number; holidays: string[]; }
const DEFAULT_PERFORMANCE: PerformanceConfig = { monthlyGoal: 70, firstHalfPercent: 40, captureGoal: 60, healthyMargin: 8, sellerMonthlyGoal: 15, sellerFirstHalfGoal: 6, sellerCaptureGoal: 60, holidays: [] };
const isWorkingDay = (date: Date, holidays: string[]) => date.getDay() !== 0 && !holidays.includes(format(date, 'yyyy-MM-dd'));

const Dashboard: React.FC<DashboardProps> = ({ currentUser, onStartNewCalculation }) => {
  const [stock, setStock] = useState<OperationalStockItem[]>([]);
  const [sales, setSales] = useState<OperationalSaleItem[]>([]);
  const [performance, setPerformance] = useState(DEFAULT_PERFORMANCE);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [selectedSeller, setSelectedSeller] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const [stockData, salesData, perfSnap] = await Promise.all([
        operationalDataService.getLatestStock(),
        operationalDataService.getSales(),
        getDoc(doc(db, 'config/performance')),
      ]);
      setStock(stockData);
      setSales(salesData);
      if (perfSnap.exists()) {
        const raw = perfSnap.data() as Partial<PerformanceConfig>;
        setPerformance({ ...DEFAULT_PERFORMANCE, ...raw, holidays: Array.isArray(raw.holidays) ? raw.holidays : [] });
      }
    } catch (e) {
      console.error('Dashboard operacional: erro ao carregar dados', e);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    const refresh = () => loadData();
    window.addEventListener('dealmaster:operational-data-updated', refresh);
    return () => window.removeEventListener('dealmaster:operational-data-updated', refresh);
  }, []);

  const availableMonths = useMemo(() => {
    const set = new Set<string>([format(new Date(), 'yyyy-MM')]);
    sales.forEach(s => s.saleDate && set.add(s.saleDate.slice(0,7)));
    return Array.from(set).sort((a,b)=>b.localeCompare(a));
  }, [sales]);

  const sellers = useMemo(() => Array.from(new Set(sales.map(s => s.seller).filter(Boolean))).sort(), [sales]);
  const monthSales = useMemo(() => sales.filter(s => s.saleDate?.startsWith(selectedMonth)), [sales, selectedMonth]);
  const filteredSales = useMemo(() => selectedSeller === 'all' ? monthSales : monthSales.filter(s => s.seller === selectedSeller), [monthSales, selectedSeller]);

  const timing = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const start = new Date(year, month-1, 1);
    const end = endOfMonth(start);
    const now = new Date();
    const isCurrent = now.getFullYear() === year && now.getMonth() === month-1;
    const reference = isCurrent ? now : end;
    const workDays = eachDayOfInterval({start,end}).filter(d => isWorkingDay(d, performance.holidays));
    const elapsed = workDays.filter(d => !isAfter(d, reference));
    const remaining = workDays.filter(d => isAfter(d, reference));
    return { start, end, workDays, elapsed, remaining, reference, isCurrent };
  }, [selectedMonth, performance.holidays]);

  const monthlyGoal = selectedSeller === 'all' ? performance.monthlyGoal : performance.sellerMonthlyGoal;
  const actual = filteredSales.length;
  const expectedToday = monthlyGoal * (timing.elapsed.length / Math.max(timing.workDays.length,1));
  const projection = Math.round((actual / Math.max(timing.elapsed.length,1)) * Math.max(timing.workDays.length,1));
  const dailyNeeded = Math.max(monthlyGoal-actual,0) / Math.max(timing.remaining.length,1);
  const firstHalfActual = filteredSales.filter(s => Number(s.saleDate?.slice(8,10)) <= 15).length;
  const firstHalfGoal = selectedSeller === 'all' ? Math.ceil(performance.monthlyGoal * performance.firstHalfPercent/100) : performance.sellerFirstHalfGoal;

  const totalInvoice = filteredSales.reduce((s,i)=>s+(Number(i.invoiceValue)||0),0);
  const totalMarginValue = filteredSales.reduce((s,i)=>s+(Number(i.marginValue)||0),0);
  const marginPercent = totalInvoice ? (totalMarginValue/totalInvoice)*100 : (actual ? filteredSales.reduce((s,i)=>s+(Number(i.marginPercent)||0),0)/actual : 0);
  const knownCapture = filteredSales.filter(s => typeof s.hasTradeIn === 'boolean');
  const captureRate = knownCapture.length ? knownCapture.filter(s => s.hasTradeIn).length/knownCapture.length*100 : null;

  const stockBands = useMemo(() => ['0-30','31-60','61-90','91-120','120+'].map(band => {
    const items = stock.filter(i => {
      const d = Number(i.stockDays)||0;
      if (band==='0-30') return d<=30;
      if (band==='31-60') return d>=31&&d<=60;
      if (band==='61-90') return d>=61&&d<=90;
      if (band==='91-120') return d>=91&&d<=120;
      return d>120;
    });
    return {band,items,count:items.length,value:items.reduce((s,i)=>s+(Number(i.cost)||0),0)};
  }), [stock]);

  const filteredStock = stockFilter==='all' ? stock : stockBands.find(b=>b.band===stockFilter)?.items || [];
  const stockValue = stock.reduce((s,i)=>s+(Number(i.cost)||0),0);
  const agedCount = stock.filter(i=>Number(i.stockDays)>60).length;
  const criticalCount = stock.filter(i=>Number(i.stockDays)>90).length;
  const criticalValue = stock.filter(i=>Number(i.stockDays)>90).reduce((s,i)=>s+(Number(i.cost)||0),0);
  const avgStockDays = stock.length ? stock.reduce((s,i)=>s+(Number(i.stockDays)||0),0)/stock.length : 0;
  const snapshotDate = stock[0]?.snapshotDate || '';

  const sellerPerformance = useMemo(() => sellers.map(name => {
    const items = monthSales.filter(s=>s.seller===name);
    const invoice=items.reduce((s,i)=>s+(Number(i.invoiceValue)||0),0);
    const margin=items.reduce((s,i)=>s+(Number(i.marginValue)||0),0);
    const proj=Math.round((items.length/Math.max(timing.elapsed.length,1))*Math.max(timing.workDays.length,1));
    return {name,count:items.length,projection:proj,margin:invoice?(margin/invoice)*100:0,marginValue:margin};
  }).sort((a,b)=>b.count-a.count||b.marginValue-a.marginValue), [sellers,monthSales,timing]);

  const chartData = useMemo(() => {
    let cumulative=0;
    const workIndex = new Map(timing.workDays.map((d,i)=>[format(d,'yyyy-MM-dd'),i+1]));
    return eachDayOfInterval({start:timing.start,end:timing.end}).map(day => {
      cumulative += filteredSales.filter(s => s.saleDate && isSameDay(parseISO(s.saleDate),day)).length;
      const n=workIndex.get(format(day,'yyyy-MM-dd'));
      return {label:format(day,'dd'),real:cumulative,ideal:n?(monthlyGoal*n)/Math.max(timing.workDays.length,1):undefined};
    });
  }, [filteredSales,timing,monthlyGoal]);

  const diagnosis = useMemo(() => {
    if (!sales.length && !stock.length) return {tone:'neutral' as const,title:'Aguardando dados operacionais',text:'Use Dados da Loja para importar o estoque do dia e os faturamentos.'};
    if (projection < monthlyGoal) return {tone:'warning' as const,title:`Projeção de ${projection} para meta ${monthlyGoal}`,text:`Hoje o ritmo necessário é ${dailyNeeded.toFixed(1)} carro(s) por dia trabalhado restante.`};
    if (criticalCount) return {tone:'warning' as const,title:`${criticalCount} carro(s) acima de 90 dias`,text:`Há ${formatCurrency(criticalValue)} de custo nessa faixa de estoque.`};
    if (marginPercent < performance.healthyMargin && actual) return {tone:'warning' as const,title:'Margem real abaixo da referência',text:`A margem faturada está em ${marginPercent.toFixed(1)}%, contra referência de ${performance.healthyMargin}%.`};
    return {tone:'good' as const,title:'Operação em ritmo saudável',text:`Projeção ${projection}, margem ${marginPercent.toFixed(1)}% e ${criticalCount} carros críticos.`};
  }, [sales.length,stock.length,projection,monthlyGoal,dailyNeeded,criticalCount,criticalValue,marginPercent,performance.healthyMargin,actual]);

  const formatMonth = (value:string) => { const [y,m]=value.split('-'); const label=format(new Date(Number(y),Number(m)-1,1),'MMMM yyyy',{locale:ptBR}); return label.charAt(0).toUpperCase()+label.slice(1); };
  const firstName = currentUser.name?.split(' ')[0] || 'Olá';

  return <div className="pb-24 md:pb-12 space-y-6 md:space-y-8 animate-fade-in">
    <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p className="mb-1 text-sm text-zinc-500">{format(new Date(),"EEEE, d 'de' MMMM",{locale:ptBR})}</p><h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Bom dia, {firstName}.</h2><p className="mt-2 text-zinc-400">Agora a gestão usa estoque e faturamentos reais importados.</p></div><div className="flex flex-wrap gap-2"><button onClick={loadData} className="flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-300"><RefreshCw size={16} className={loading?'animate-spin':''}/> Atualizar</button><select value={selectedSeller} onChange={e=>setSelectedSeller(e.target.value)} className="h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-200 outline-none"><option value="all" className="bg-zinc-900">Toda equipe</option>{sellers.map(s=><option key={s} value={s} className="bg-zinc-900">{s}</option>)}</select><select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} className="h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-200 outline-none">{availableMonths.map(m=><option key={m} value={m} className="bg-zinc-900">{formatMonth(m)}</option>)}</select></div></section>

    <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-6 md:p-8"><div className="grid gap-7 lg:grid-cols-[1.25fr_.75fr] lg:items-end"><div><div className="mb-5 flex items-center gap-2 text-sm text-zinc-400"><Target size={16}/> Faturômetro real</div><div className="flex items-end gap-3"><span className="text-6xl font-semibold tracking-[-0.06em] text-white md:text-7xl">{actual}</span><span className="pb-2 text-xl text-zinc-500">de {monthlyGoal}</span></div><div className="mt-6 h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white" style={{width:`${Math.min(actual/Math.max(monthlyGoal,1)*100,100)}%`}}/></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Mini label="Esperado hoje" value={expectedToday.toFixed(1)}/><Mini label="Projeção" value={`${projection}`}/><Mini label="Faltam" value={`${Math.max(monthlyGoal-actual,0)}`}/><Mini label="Ritmo necessário" value={`${dailyNeeded.toFixed(1)}/dia`}/></div></div><button onClick={onStartNewCalculation} className="flex min-h-24 items-center justify-between rounded-[26px] bg-white px-5 py-5 text-left text-black"><div><span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Negociação</span><span className="block text-lg font-semibold">Abrir calculadora</span><span className="mt-1 block text-sm text-zinc-500">Ferramenta separada dos dados gerenciais.</span></div><div className="grid h-11 w-11 place-items-center rounded-full bg-black text-white"><ArrowRight size={20}/></div></button></div></section>

    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Metric icon={<CalendarDays size={18}/>} label="Quinzena" value={`${firstHalfActual} / ${firstHalfGoal}`} hint="Faturamentos até dia 15"/><Metric icon={<TrendingUp size={18}/>} label="Faturamento" value={formatCurrency(totalInvoice)} hint={`${actual} carro(s) faturado(s)`}/><Metric icon={<Percent size={18}/>} label="Margem real" value={`${marginPercent.toFixed(1)}%`} hint={formatCurrency(totalMarginValue)}/><Metric icon={<CarFront size={18}/>} label="Estoque atual" value={`${stock.length} carros`} hint={snapshotDate?`Retrato ${snapshotDate}`:'Sem upload'}/></section>

    <Insight tone={diagnosis.tone} title={diagnosis.title} text={diagnosis.text}/>

    <section className="grid gap-4 xl:grid-cols-[1.45fr_.85fr]"><div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Faturômetro</p><h3 className="mt-1 text-xl font-semibold text-white">Real x ritmo ideal</h3></div><span className="text-xs text-zinc-500">{formatMonth(selectedMonth)}</span></div><div className="h-[285px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:10,right:8,left:-22,bottom:0}}><defs><linearGradient id="operationalArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fff" stopOpacity={0.22}/><stop offset="100%" stopColor="#fff" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#27272a" strokeDasharray="3 6" vertical={false}/><XAxis dataKey="label" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false}/><YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false}/><Tooltip contentStyle={{backgroundColor:'#18181b',border:'1px solid #3f3f46',borderRadius:16}}/><Area type="monotone" dataKey="real" name="Realizado" stroke="#fff" strokeWidth={2.8} fill="url(#operationalArea)"/><Line type="monotone" dataKey="ideal" name="Ideal" stroke="#f59e0b" strokeWidth={1.8} strokeDasharray="6 5" dot={false} connectNulls/></AreaChart></ResponsiveContainer></div></div><div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Estoque real</p><h3 className="mt-1 text-xl font-semibold text-white">Saúde do capital</h3><div className="mt-5 grid grid-cols-2 gap-3"><Small label="Capital" value={formatCurrency(stockValue)}/><Small label="Idade média" value={`${avgStockDays.toFixed(0)} dias`}/><Small label="+60 dias" value={`${agedCount}`}/><Small label="+90 dias" value={`${criticalCount}`}/></div><div className="mt-5 space-y-2">{stockBands.map(b=><button key={b.band} onClick={()=>setStockFilter(stockFilter===b.band?'all':b.band)} className={`flex w-full items-center justify-between rounded-2xl px-3.5 py-3 text-left ${stockFilter===b.band?'bg-white text-black':'bg-black/20 text-white'}`}><span className="text-sm font-medium">{b.band} dias</span><span className={`text-xs ${stockFilter===b.band?'text-zinc-600':'text-zinc-500'}`}>{b.count} · {formatCurrency(b.value)}</span></button>)}</div></div></section>

    <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Estoque</p><h3 className="mt-1 text-xl font-semibold text-white">Veículos por prioridade</h3></div><Database size={20} className="text-zinc-600"/></div><div className="grid gap-3 lg:grid-cols-2">{filteredStock.length===0?<Empty text="Nenhum veículo nesta faixa ou estoque ainda não importado."/>:filteredStock.sort((a,b)=>(Number(b.stockDays)||0)-(Number(a.stockDays)||0)).slice(0,12).map(item=><div key={item.id} className="rounded-[22px] border border-white/10 bg-black/20 p-4"><div className="flex items-start justify-between"><div><p className="font-medium text-white">{item.plate||item.vehicle||'Sem identificação'}</p><p className="mt-1 text-xs text-zinc-500">{item.vehicle}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${Number(item.stockDays)>90?'bg-red-500/10 text-red-400':Number(item.stockDays)>60?'bg-amber-400/10 text-amber-400':'bg-emerald-500/10 text-emerald-400'}`}>{item.stockDays}d</span></div><div className="mt-4 grid grid-cols-3 gap-2"><Small label="Custo" value={formatCurrency(Number(item.cost)||0)}/><Small label="FIPE" value={formatCurrency(Number(item.fipe)||0)}/><Small label="Preço" value={formatCurrency(Number(item.askingPrice)||0)}/></div></div>)}</div></section>

    <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Equipe</p><h3 className="mt-1 text-xl font-semibold text-white">Performance por faturamento</h3></div><Users size={20} className="text-zinc-600"/></div><div className="grid gap-3 lg:grid-cols-2">{sellerPerformance.length===0?<Empty text="Nenhum vendedor encontrado nos faturamentos importados."/>:sellerPerformance.map((s,index)=><button key={s.name} onClick={()=>setSelectedSeller(s.name)} className="rounded-[22px] border border-white/10 bg-black/20 p-4 text-left"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className={`grid h-9 w-9 place-items-center rounded-full ${index===0?'bg-white text-black':'bg-white/[0.06] text-zinc-400'}`}>{index===0?<Trophy size={15}/>:s.name.charAt(0)}</div><div><p className="font-medium text-white">{s.name}</p><p className="text-xs text-zinc-500">{s.count}/{performance.sellerMonthlyGoal} · projeção {s.projection}</p></div></div><span className="text-sm font-semibold text-zinc-300">{s.margin.toFixed(1)}%</span></div></button>)}</div>{captureRate!==null&&<p className="mt-4 text-xs text-zinc-500">Captura informada no arquivo: {captureRate.toFixed(0)}%.</p>}</section>

    <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 md:p-7"><div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Últimos faturamentos</p><h3 className="mt-1 text-xl font-semibold text-white">Vendas importadas</h3></div><div className="grid gap-2 md:grid-cols-2">{[...filteredSales].sort((a,b)=>b.saleDate.localeCompare(a.saleDate)).slice(0,8).map(s=><div key={s.id} className="rounded-2xl bg-black/20 p-4"><div className="flex justify-between gap-3"><div><p className="font-medium text-white">{s.plate||s.vehicle}</p><p className="mt-1 text-xs text-zinc-500">{s.seller||'Sem vendedor'} · {s.saleDate}</p></div><div className="text-right"><p className="text-sm font-semibold text-white">{formatCurrency(Number(s.invoiceValue)||0)}</p><p className="text-xs text-zinc-500">Margem {Number(s.marginPercent||0).toFixed(1)}%</p></div></div></div>)}</div></section>
  </div>;
};

const Mini=({label,value}:{label:string;value:string})=><div className="rounded-2xl bg-white/[0.055] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">{label}</p><p className="mt-1 text-lg font-semibold text-white">{value}</p></div>;
const Metric=({icon,label,value,hint}:{icon:React.ReactNode;label:string;value:string;hint:string})=><div className="min-h-36 rounded-[26px] border border-white/10 bg-white/[0.035] p-4 md:p-5"><div className="mb-5 grid h-9 w-9 place-items-center rounded-2xl bg-white/[0.06] text-zinc-300">{icon}</div><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 truncate text-2xl font-semibold text-white">{value}</p><p className="mt-1 truncate text-[11px] text-zinc-600">{hint}</p></div>;
const Small=({label,value}:{label:string;value:string})=><div className="rounded-xl bg-white/[0.04] p-2.5"><p className="text-[9px] uppercase tracking-wide text-zinc-600">{label}</p><p className="mt-1 truncate text-sm font-semibold text-zinc-200">{value}</p></div>;
const Empty=({text}:{text:string})=><div className="col-span-full rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-600">{text}</div>;
const Insight=({tone,title,text}:{tone:'good'|'warning'|'neutral';title:string;text:string})=><section className={`rounded-[30px] border p-6 ${tone==='good'?'border-emerald-500/20 bg-emerald-500/[0.07]':tone==='warning'?'border-amber-400/20 bg-amber-400/[0.07]':'border-white/10 bg-white/[0.04]'}`}><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Diagnóstico operacional</p><h3 className="mt-2 text-xl font-semibold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{text}</p></section>;
export default Dashboard;
