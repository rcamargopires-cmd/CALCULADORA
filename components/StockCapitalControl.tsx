import React,{useEffect,useMemo,useState} from 'react';
import {ArrowDownUp,CarFront,ChartNoAxesCombined,Clock3,RefreshCw,WalletCards} from 'lucide-react';
import {Area,AreaChart,CartesianGrid,Legend,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import type {OperationalStockItem,User} from '../types';
import type {OperationalStockHistoryPoint} from '../services/operationalDataService';
import {companyScopeService} from '../services/companyScopeService';
import {storeScopeService} from '../services/storeScopeService';
import {groupStockService, type GroupStockSnapshot} from '../services/groupStockService';

type Props={user:User;stock:OperationalStockItem[];history:OperationalStockHistoryPoint[]};
const BRL=(number:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(number);
const number=(n:number)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(n);
const todayLocal=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const dayAfter=(day:string,days:number)=>{const date=new Date(day+'T12:00:00');date.setDate(date.getDate()+days);return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');};

const StockCapitalControl:React.FC<Props>=({user,stock,history})=>{
  const companyId=companyScopeService.get(user);
  const storeId=storeScopeService.get(user);
  const key='motyq:stock-capital-rate:'+companyId+':'+storeId;
  const[rate,setRate]=useState(()=>{try{const v=Number(window.localStorage.getItem(key));return v>0&&v<=100?v:18;}catch{return 18;}});
  const[shared,setShared]=useState<GroupStockSnapshot|null>(null);
  const[sharedLoading,setSharedLoading]=useState(true);
  const[sharedError,setSharedError]=useState('');
  const[source,setSource]=useState<'shared'|'operational'>('shared');
  const[unit,setUnit]=useState(()=>storeId==='outlet-sorocaba'?'OUTLET':'all');
  useEffect(()=>{
    setShared(null);setSharedLoading(true);setSharedError('');
    return groupStockService.subscribe(companyId,
      snapshot=>{setShared(snapshot);setSharedLoading(false);setSharedError('');},
      error=>{console.warn('Capital de Estoque: compartilhado indisponível',error);setSharedLoading(false);setSharedError('Falha ao consultar estoque compartilhado.');});
  },[companyId]);
  const sharedActive=source==='shared'&&!!shared;
  const sharedStock=useMemo<OperationalStockItem[]>(()=>!shared?[]:shared.items.map(item=>({
    id:item.plate,snapshotDate:shared.importedAt.slice(0,10),plate:item.plate,
    vehicle:item.model,stockDays:item.days,cost:item.cost,fipe:0,
    askingPrice:item.suggestedPrice,location:item.location||item.stockOwner,
    status:item.status,companyId:shared.companyId,
  })),[shared]);
  const activeStock=sharedActive?sharedStock:source==='operational'?stock:[];
  const sharedByPlate=useMemo(()=>new Map((shared?.items||[]).map(item=>[item.plate,item])),[shared]);
  const[sort,setSort]=useState<'days'|'cost'|'capital'|'daily'>('capital');
  const[range,setRange]=useState(30);
  const[expanded,setExpanded]=useState(false);
  const[showAll,setShowAll]=useState(false);
  const[search,setSearch]=useState('');
  const safeRate=Math.min(100,Math.max(0,Number(rate)||0));
  const seen=new Set<string>();
  const owned=activeStock.filter(item=>(!item.companyId||item.companyId===companyId)
    &&(sharedActive||user.role==='admin'||!item.storeId||item.storeId===storeId));
  const units=Array.from(new Set(owned.map(item=>item.location||item.storeId||'Sem unidade').filter(Boolean))).sort();
  const filtered=owned.filter(item=>{
    const location=item.location||item.storeId||'Sem unidade';
    return (unit==='all'||location===unit)&&
      (!search.trim()||[item.plate,item.vehicle,location].some(value=>String(value||'').toLowerCase().includes(search.trim().toLowerCase())));
  }).filter(item=>{if(seen.has(item.plate))return false;seen.add(item.plate);return true;});
  const rows=useMemo(()=>filtered.map(item=>{
    const cost=Math.max(0,Number(item.cost)||0);
    const days=Math.max(0,Number(item.stockDays)||0);
    const accumulated=cost*safeRate/100*days/365;
    return {...item,cost,days,accumulated,daily:cost*safeRate/100/365,total:cost+accumulated,
      adjustedMargin:Number(item.askingPrice)>0?(Number(item.askingPrice)-cost-accumulated)/Number(item.askingPrice)*100:null};
  }).sort((a,b)=>sort==='days'?b.days-a.days:sort==='cost'?b.cost-a.cost:sort==='daily'?b.daily-a.daily:b.accumulated-a.accumulated),[filtered,safeRate,sort]);
  const totalCost=rows.reduce((sum,item)=>sum+item.cost,0);
  const totalCapital=rows.reduce((sum,item)=>sum+item.accumulated,0);
  const totalDaily=rows.reduce((sum,item)=>sum+item.daily,0);
  const missing=rows.filter(item=>item.cost<=0).length;
  const today=todayLocal();
  const reference=activeStock[0]?.snapshotDate||'';
  // Only imported points are confirmed: never turn missing-day imports into fictitious transactions.
  const historyPoints=(sharedActive?[]:history).filter(item=>!!item.referenceDate&&item.referenceDate<=today&&(unit==='all'&&!search.trim()))
    .sort((a,b)=>a.referenceDate.localeCompare(b.referenceDate)).slice(-90);
  const latestReference=reference&&reference<=today?reference:today;
  const ageOfSource=reference&&reference<=today?Math.max(0,Math.round((new Date(today+'T12:00:00').getTime()-new Date(reference+'T12:00:00').getTime())/86400000)):0;
  const observed=historyPoints.map(point=>({date:point.referenceDate,imported:point.stockValue,projected:null as number|null}));
  const projection=Array.from({length:range+1},(_,index)=>({date:dayAfter(today,index),imported:null as number|null,
    projected:totalCost+totalCapital+totalDaily*(ageOfSource+index)}));
  const chart=[...observed.filter(item=>item.date<today),...projection];
  const hasActual=observed.length>0;

  if(!['manager','admin'].includes(user.role))return null;
  return <section className="rounded-[30px] border border-sky-200 bg-white p-4 shadow-sm md:p-7 text-slate-900">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-700">MOTYQ · CAPITAL DE ESTOQUE</p>
        <h3 className="mt-1 text-xl font-semibold">Capital, custo financeiro e giro</h3>
        <p className="mt-1 text-xs text-slate-500">Base: última importação de estoque {reference||'não disponível'} · juros simples, taxa anual / 365.</p>
      </div>
      <label className="text-xs font-semibold text-slate-600">Taxa anual (%)
        <input type="number" min="0" max="100" step="0.1" value={rate}
          onChange={event=>{const v=Math.max(0,Math.min(100,Number(event.target.value)||0));setRate(v);try{window.localStorage.setItem(key,String(v));}catch{}}}
          className="ml-2 h-10 w-20 rounded-xl border border-slate-200 bg-white px-2 text-sm font-bold text-slate-900"/>
      </label>
    </div>
    <p className="mt-2 text-[11px] text-slate-500">Taxa guardada neste navegador para esta unidade. O custo financeiro é uma estimativa gerencial, não lançamento contábil.</p>
    <div className="mt-3 flex flex-wrap gap-2 items-center">
      <label className="text-xs text-slate-600">Base de dados
        <select value={source} onChange={e=>setSource(e.target.value as 'shared'|'operational')} className="ml-2 h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900">
          <option value="shared">Estoque compartilhado do grupo</option><option value="operational">Importação operacional anterior</option>
        </select>
      </label>
      {sharedLoading&&source==='shared'&&<span className="text-xs text-slate-500">Carregando base compartilhada...</span>}
      {sharedError&&source==='shared'&&<span className="text-xs text-amber-700">{sharedError}</span>}
    </div>
    {sharedActive&&shared&&<p className="mt-2 rounded-xl bg-cyan-50 p-3 text-xs text-cyan-900">
      Fonte: {shared.sourceFile||'arquivo não informado'} · Atualizado: {shared.sourceUpdatedAt||shared.importedAt||'não informado'} · {shared.items.length} veículos no grupo.
      Os totais abaixo consideram a localização selecionada.</p>}
    {sharedActive&&unit==='OUTLET'&&<p className="mt-2 text-xs text-slate-600">Filtro exato: <strong>Localização = OUTLET</strong>. “Estoque Atual” identifica a empresa detentora (por exemplo, ABRAO REPASSE).</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <label className="flex-1 min-w-[160px] text-xs text-slate-600">Unidade
        <select value={unit} onChange={e=>setUnit(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800">
          <option value="all">Todas as unidades disponíveis</option>
          {units.map(item=><option key={item}>{item}</option>)}
        </select>
      </label>
      <label className="flex-1 min-w-[160px] text-xs text-slate-600">Localizar veículo
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Placa ou modelo"
          className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"/>
      </label>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {[
        {label:'Capital de compra',value:BRL(totalCost),sub:number(rows.length)+' veículo(s)',icon:<WalletCards size={16}/>},
        {label:'Custo acumulado',value:BRL(totalCapital),sub:'Pelos dias informados',icon:<Clock3 size={16}/>},
        {label:'Custo por dia',value:BRL(totalDaily),sub:'Mantido o estoque atual',icon:<CarFront size={16}/>},
        {label:'Custo ajustado',value:BRL(totalCost+totalCapital),sub:'Compra + capital estimado',icon:<ChartNoAxesCombined size={16}/>}
      ].map(card=><div key={card.label} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="text-cyan-700">{card.icon}</div><p className="mt-2 text-[11px] text-slate-600">{card.label}</p>
        <p className="mt-1 break-words text-lg font-black text-slate-900">{card.value}</p>
        <p className="mt-1 text-[10px] text-slate-500">{card.sub}</p>
      </div>)}
    </div>
    {missing>0&&<p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
      {missing} veículo(s) sem custo positivo na fonte. Os totais podem estar subestimados.</p>}
    {!activeStock.length&&!sharedLoading&&<p className="mt-3 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-600">Importe a planilha de estoque para iniciar o controle.</p>}
    <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
      <div><h4 className="font-semibold">Evolução do capital</h4>
        <p className="mt-1 text-xs text-slate-500">Importações observadas e projeção do estoque atual, sem presumir compras ou vendas futuras.</p>
      </div>
      <label className="text-xs text-slate-600">Projetar
        <select value={range} onChange={e=>setRange(Number(e.target.value))} className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs">
          <option value={7}>7 dias</option><option value={30}>30 dias</option><option value={60}>60 dias</option>
        </select>
      </label>
    </div>
    {!search.trim()&&activeStock.length?<div className="mt-3 h-64 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chart} margin={{top:8,right:8,bottom:0,left:0}}>
          <CartesianGrid stroke="#e2e8f0" vertical={false}/>
          <XAxis dataKey="date" tickFormatter={value=>String(value).slice(5).split('-').reverse().join('/')} tick={{fontSize:10,fill:'#64748b'}} minTickGap={25}/>
          <YAxis tick={{fontSize:10,fill:'#64748b'}} width={67} tickFormatter={n=>'R$'+number(Number(n)/1000)+' mil'}/>
          <Tooltip formatter={(value:number,name:string)=>[BRL(Number(value)),name]} labelFormatter={value=>'Data: '+String(value).split('-').reverse().join('/')}/>
          <Legend/>
          {hasActual&&<Area type="monotone" name="Capital importado" dataKey="imported" stroke="#64748b" fill="#94a3b8" fillOpacity={0.13} connectNulls={false}/>}
          <Area type="monotone" name="Custo ajustado projetado" dataKey="projected" stroke="#0891b2" fill="#67e8f9" fillOpacity={0.18} connectNulls={false}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>:<p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{unit!=='all'||search.trim()?'Gráfico consolidado disponível ao selecionar todas as unidades e limpar a busca.':'Aguardando importação de estoque.'}</p>}
    <p className="mt-2 text-[11px] text-slate-500">Estoque compartilhado: projeção financeira da localização selecionada, sem histórico diário confirmado. Histórico operacional só aparece na base operacional. Não é um fechamento diário automático.</p>
    <button type="button" onClick={()=>setExpanded(x=>!x)} className="mt-5 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-bold text-slate-800">
      <span><ArrowDownUp size={15} className="mr-2 inline"/> Custo por placa · {rows.length} veículos</span><span>{expanded?'RECOLHER':'VER DETALHES'}</span>
    </button>
    {expanded&&<div className="mt-3">
      <label className="text-xs text-slate-600">Ordenar
        <select value={sort} onChange={e=>setSort(e.target.value as typeof sort)} className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
          <option value="capital">Maior custo acumulado</option><option value="days">Mais dias em estoque</option>
          <option value="cost">Maior custo de compra</option><option value="daily">Maior custo diário</option>
        </select>
      </label>
      <div className="mt-3 space-y-2">{(showAll?rows:rows.slice(0,12)).map(item=><article key={item.plate} className="rounded-xl border border-slate-200 p-3">
        <div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><p className="font-mono text-sm font-black">{item.plate}</p><p className="text-xs text-slate-600">{item.vehicle} · {item.location||'Local não informado'}</p></div>
          <span className={'h-fit rounded-full px-2 py-1 text-[10px] font-bold '+(item.days>90?'bg-red-50 text-red-700':item.days>30?'bg-amber-50 text-amber-700':'bg-emerald-50 text-emerald-700')}>{item.days} dias</span></div>
        {sharedActive&&(()=>{const original=sharedByPlate.get(item.plate);return original?<div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          {original.status&&<span className="rounded-lg bg-amber-50 px-2 py-1 font-bold text-amber-800">Situação: {original.status}</span>}
          {original.transit&&<span className="rounded-lg bg-sky-50 px-2 py-1 text-sky-800">Trânsito: {original.transit}</span>}
          {original.stockOwner&&<span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-700">Estoque atual: {original.stockOwner}</span>}
          {original.notices?.map((notice,i)=><span key={i} className="rounded-lg bg-amber-50 px-2 py-1 text-amber-900">Aviso {i+1}: {notice}</span>)}
        </div>:null;})()}
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><p>Custo<br/><strong>{BRL(item.cost)}</strong></p><p>Capital até a importação<br/><strong>{BRL(item.accumulated)}</strong></p><p>Capital/dia<br/><strong>{BRL(item.daily)}</strong></p><p>Custo ajustado<br/><strong>{BRL(item.total)}</strong></p></div>
        {item.adjustedMargin!==null&&<p className="mt-2 text-xs text-slate-600">Margem bruta estimada após capital: <strong>{item.adjustedMargin.toFixed(1)}%</strong> (antes de outros custos e impostos)</p>}
      </article>)}</div>
      {rows.length>12&&<button type="button" onClick={()=>setShowAll(x=>!x)} className="mt-3 text-xs font-bold text-cyan-700">{showAll?'Mostrar menos':'Mostrar todos os '+rows.length+' veículos'}</button>}
    </div>}
  </section>;
};
export default StockCapitalControl;
