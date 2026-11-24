import React,{useMemo,useState} from 'react';
import {AlertTriangle,ArrowLeft,ChartNoAxesCombined,ChevronDown,Flame,Search,ShieldAlert,Warehouse} from 'lucide-react';
import type {DealerStockSnapshot} from '../services/marketIqDealerRadar';
import {analyzeDealerStock,type StockTemperature} from '../services/marketIqStockXRay';
import MarketIqStockXRayDeepPanel from './MarketIqStockXRayDeepPanel';
import './marketIqStockXRayContrast.css';

const money=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(n);
const simple=(n:number)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(n);
const ratio=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(n);
const heat:Record<StockTemperature,{label:string,color:string,bar:string}>={
 critical:{label:'Crítico',color:'bg-rose-50 text-rose-900 border-rose-200',bar:'bg-rose-600'},
 watch:{label:'Atenção',color:'bg-amber-50 text-amber-900 border-amber-200',bar:'bg-amber-500'},
 balanced:{label:'Moderado',color:'bg-sky-50 text-sky-900 border-sky-200',bar:'bg-sky-600'},
 lower:{label:'Menor exposição',color:'bg-emerald-50 text-emerald-900 border-emerald-200',bar:'bg-emerald-600'}
};
type Props={
 snapshot:DealerStockSnapshot;previousSnapshot?:DealerStockSnapshot|null;
 cloudState?:string;onClose:()=>void;
 onFamilySelect:(family:string)=>void;
};
export default function MarketIqStockXRayPanel({
 snapshot,previousSnapshot,cloudState,onClose,onFamilySelect
}:Props){
 const report=useMemo(()=>analyzeDealerStock(snapshot,previousSnapshot||null),
  [snapshot,previousSnapshot]);
 const [query,setQuery]=useState('');
 const [temperature,setTemperature]=useState<'all'|StockTemperature>('all');
 const [sort,setSort]=useState<'risk'|'capital'|'days'|'quantity'>('risk');
 const [unit,setUnit]=useState('all');
 const [analyticalView,setAnalyticalView]=useState<'deep'|'alerts'>('deep');
 // Filtering by store reruns the score against that unit's portfolio.
 const scoped=useMemo(()=>unit==='all'?report:analyzeDealerStock({
  ...snapshot,vehicles:snapshot.vehicles.filter(v=>v.store===unit)
 },previousSnapshot?{...previousSnapshot,
  vehicles:previousSnapshot.vehicles.filter(v=>v.store===unit)}:null),
 [report,unit,snapshot,previousSnapshot]);
 const shown=useMemo(()=>{
  const needle=query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
  const matches=scoped.ranking.filter(v=>
   (temperature==='all'||v.temperature===temperature)&&
   (!needle||(v.brand+' '+v.family).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().includes(needle)));
  return matches.sort((a,b)=>sort==='capital'?b.cost-a.cost:
   sort==='days'?b.daysAverage-a.daysAverage:sort==='quantity'?b.count-a.count:
   b.score-a.score||b.staleCost-a.staleCost);
 },[scoped,query,temperature,sort]);
 const counts=(Object.keys(heat) as StockTemperature[]).map(key=>({
  key,count:scoped.ranking.filter(v=>v.temperature===key).length
 }));
 return <section role="region" aria-label="Raio-X gerencial do estoque"
  className="motyq-iq-xray space-y-4 rounded-2xl border border-cyan-300 bg-[#f1f5f9] p-3 text-slate-950 shadow-sm sm:p-5">
  <div className="motyq-iq-xray-hero rounded-2xl bg-[#10364a] px-4 py-5 text-white sm:px-6">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
     <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-cyan-200">
      <ChartNoAxesCombined size={18}/> Motyq IQ · Raio-X de estoque
     </div>
     <h3 className="mt-2 text-2xl font-black">O que está imobilizando capital?</h3>
     <p className="mt-1 max-w-3xl text-sm text-cyan-50">Mapa de exposição, envelhecimento, concentração e compras a revisar, calculado com a fotografia do Dealer de {snapshot.reportDate.split('-').reverse().join('/')}.</p>
    </div>
    <button type="button" onClick={onClose}
     className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-3 py-2 text-xs font-bold text-white hover:bg-white/10"><ArrowLeft size={15}/> Voltar ao Radar</button>
   </div>
   <p className="mt-3 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-cyan-50">
    {cloudState==='shared'?'Fotografia compartilhada da empresa.':'Atenção: este dispositivo pode estar exibindo somente o cache local.'}
    {' '}A temperatura indica risco relativo de estoque, não procura no mercado nem vendas comprovadas.
   </p>
  </div>
  <nav aria-label="Visões do Raio-X" className="grid grid-cols-2 gap-2">
   <button type="button" aria-pressed={analyticalView==='deep'} onClick={()=>setAnalyticalView('deep')}
    className={'rounded-xl border px-4 py-3 text-sm font-black '+(analyticalView==='deep'?
     'border-[#14648b] bg-[#10364a] text-white':'border-slate-200 bg-white text-slate-700')}>
    Análise gerencial aprofundada
   </button>
   <button type="button" aria-pressed={analyticalView==='alerts'} onClick={()=>setAnalyticalView('alerts')}
    className={'rounded-xl border px-4 py-3 text-sm font-black '+(analyticalView==='alerts'?
     'border-[#14648b] bg-[#10364a] text-white':'border-slate-200 bg-white text-slate-700')}>
    Alertas e temperatura
   </button>
  </nav>
  {analyticalView==='deep'&&<MarketIqStockXRayDeepPanel snapshot={snapshot}
   previousSnapshot={previousSnapshot} onFamilySelect={onFamilySelect}/>}
  {analyticalView==='alerts'&&<>
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
   {([
    ['Veículos',''+scoped.count,scoped.families+' famílias'],
    ['Capital investido',money(scoped.totalCost),'Custo atual do Dealer'],
    ['Capital acima de 90 dias',money(scoped.over90Cost),ratio(scoped.totalCost?scoped.over90Cost/scoped.totalCost:0)+' do custo'],
    ['Acima de 90 dias',''+scoped.over90,simple(scoped.avgDays)+' dias de idade média'],
    ['Acima de 120 dias',''+scoped.over120,'Prioridade de revisão'],
    ['Acima de 180 dias',''+scoped.over180,'Exposição prolongada'],
    ['Sem preço',String(scoped.unknownPrice),'Precificação pendente'],
    ['Preço abaixo do custo',String(scoped.underCost),'Comparação bruta na planilha']
   ] as const).map(([label,value,hint])=>
    <article key={label} className="rounded-xl border border-slate-200 bg-white p-3">
     <p className="text-xs font-bold text-slate-800">{label}</p>
     <p className="mt-1 break-words text-xl font-black text-slate-950 sm:text-2xl">{value}</p>
     <p className="mt-1 text-xs text-slate-700">{hint}</p>
    </article>)}
  </div>
  <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
   <div className="rounded-xl border border-slate-200 bg-white p-4">
    <h4 className="flex items-center gap-2 text-base font-black text-slate-900"><Flame size={18}/> Temperatura por família</h4>
    <p className="mt-1 text-xs text-slate-800">Escala 0–100 ponderada por idade média, proporção acima de 90 dias, quantidade, concentração de capital e problemas de preço.</p>
    <div className="mt-4 grid grid-cols-2 gap-2">
     {counts.map(v=><button key={v.key} type="button" aria-pressed={temperature===v.key}
      onClick={()=>setTemperature(temperature===v.key?'all':v.key)}
      className={'rounded-lg border p-3 text-left '+heat[v.key].color+
       (temperature===v.key?' ring-2 ring-slate-700':'')}>
      <span className="block text-2xl font-black">{v.count}</span>
      <span className="text-xs font-bold">{heat[v.key].label}</span>
     </button>)}
    </div>
    <button type="button" className="mt-3 text-xs font-bold text-sky-800 underline"
     onClick={()=>setTemperature('all')}>Mostrar todas as famílias</button>
   </div>
   <div className="rounded-xl border border-slate-200 bg-white p-4">
    <h4 className="flex items-center gap-2 text-base font-black text-slate-900"><ShieldAlert size={18}/> Plano de ação sugerido</h4>
    <p className="mt-1 text-xs text-slate-800">Recomendações para análise humana, nunca bloqueios automáticos de compra.</p>
    <div className="mt-3 space-y-2">
     {scoped.actions.length===0?<p className="text-sm text-slate-800">Nenhuma das regras de alerta foi acionada.</p>:
     scoped.actions.slice(0,7).map((action,i)=>
      <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
       <p className="text-sm font-black text-slate-900">{action.title}</p>
       <p className="mt-1 text-xs text-slate-700">{action.description}</p>
       <p className="mt-1 text-xs font-bold text-slate-700">{action.count} veículo(s)
        {action.amount>0?' · '+money(action.amount):''}</p>
       {action.familyKey&&<button type="button" onClick={()=>onFamilySelect(action.familyKey!.split('|').slice(1).join('|'))}
        className="mt-2 text-xs font-bold text-sky-800 underline">Ver veículos desta família</button>}
      </div>)}
    </div>
   </div>
  </div>
  <div className="rounded-xl border border-slate-200 bg-white p-4">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div><h4 className="text-base font-black text-slate-900">Famílias que precisam de atenção</h4>
     <p className="mt-1 text-xs text-slate-800">Selecione uma família para abrir os veículos correspondentes no Radar.</p></div>
    <span className="text-xs font-semibold text-slate-800">{shown.length} de {scoped.ranking.length} famílias</span>
   </div>
   <div className="mt-3 grid gap-2 sm:grid-cols-3">
    <label className="text-xs font-bold text-slate-700"><Search size={13} className="inline"/> Buscar família
     <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
      placeholder="Ex.: T-Cross" className="mt-1 w-full rounded-lg border border-slate-400 bg-white p-2 text-sm text-slate-950 font-normal"/></label>
    <label className="text-xs font-bold text-slate-700">Unidade
     <select value={unit} onChange={e=>setUnit(e.target.value)}
      className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm font-normal">
      <option value="all">Todas as unidades</option>
      {report.units.map(v=><option key={v.store} value={v.store}>{v.store}</option>)}
     </select></label>
    <label className="text-xs font-bold text-slate-700">Ordenar
     <select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}
      className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm font-normal">
      <option value="risk">Maior exposição</option><option value="capital">Maior capital</option>
      <option value="days">Mais dias</option><option value="quantity">Maior quantidade</option>
     </select></label>
   </div>
   <div className="mt-3 space-y-2">
    {shown.length===0&&<p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-800">Nenhuma família atende aos filtros.</p>}
    {shown.slice(0,60).map(v=><article key={v.key} className="rounded-lg border border-slate-200 p-3">
     <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
       <p className="text-sm font-black text-slate-950">{v.brand} · {v.family}</p>
       <p className="mt-1 text-xs text-slate-800">{v.count} veículo(s) · {simple(v.daysAverage)} dias em média · {v.over90} acima de 90 dias</p>
      </div>
      <span className={'rounded-full border px-2.5 py-1 text-xs font-black '+heat[v.temperature].color}>
       {heat[v.temperature].label} · {v.score}/100</span>
     </div>
     <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={'h-full '+heat[v.temperature].bar} style={{width:v.score+'%'}}/>
     </div>
     <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <div className="text-xs text-slate-700"><strong>{money(v.cost)}</strong> em custo · {money(v.staleCost)} acima de 90 dias
       {v.signal==='review_pause'&&<span className="ml-2 font-black text-rose-800">Reavaliar nova compra</span>}</div>
      <button type="button" onClick={()=>onFamilySelect(v.family)}
       className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-900 hover:bg-sky-100">Ver veículos</button>
     </div>
     {v.reasons.length>0&&<p className="mt-2 text-xs text-slate-800">{v.reasons.slice(0,3).join(' · ')}</p>}
    </article>)}
    {shown.length>60&&<p className="text-xs font-semibold text-slate-800">Mostrando as primeiras 60 famílias. Refine a busca ou a unidade.</p>}
   </div>
  </div>
  <div className="grid gap-4 lg:grid-cols-2">
   <div className="rounded-xl border border-slate-200 bg-white p-4">
    <h4 className="text-sm font-black text-slate-900">Onde está o capital envelhecido</h4>
    <p className="mt-1 text-xs text-slate-800">Comparação por unidade com base no custo do Dealer.</p>
    <div className="mt-3 space-y-3">{scoped.units.map(u=><div key={u.store}>
     <div className="flex items-center justify-between gap-3 text-xs"><span className="font-bold text-slate-800">{u.store}</span>
      <span className="text-slate-700">{u.over90}/{u.count} · {money(u.staleCost)}</span></div>
     <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-500"
      style={{width:(u.cost?u.staleCost/u.cost*100:0)+'%'}}/></div>
    </div>)}</div>
   </div>
   <div className="rounded-xl border border-slate-200 bg-white p-4">
    <h4 className="text-sm font-black text-slate-900">Entradas, saídas e velocidade real</h4>
    {scoped.hasPrevious?<p className="mt-2 text-sm text-slate-700">
      Entre {scoped.previousReportDate?.split('-').reverse().join('/')} e {scoped.reportDate.split('-').reverse().join('/')},
      o arquivo mostra <strong>{scoped.entriesObserved} entradas</strong> e <strong>{scoped.exitsObserved} saídas</strong> observadas.
      Saídas podem incluir transferências, correções e repasses. Não são vendas confirmadas.
     </p>:<p className="mt-2 text-sm text-slate-700">
      Ainda não existe uma segunda fotografia datada para comparar entradas e saídas.
     </p>}
    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
     <strong>Não disponível:</strong> ranking de modelos mais vendidos, taxa de conversão,
     tempo médio até a venda e demanda externa. Essas métricas precisam de vendas confirmadas
     e, para medir demanda, avaliações/consultas ou dados de mercado.
     O Raio-X não confunde estoque baixo com alta procura.
    </p>
    <details className="mt-3 text-xs text-slate-800">
     <summary className="flex cursor-pointer items-center gap-2 font-bold"><ChevronDown size={14}/> Como funciona a temperatura?</summary>
     <p className="mt-2 leading-5">O índice de 0 a 100 pondera idade média (35 pontos),
      fração de veículos acima de 90 dias (30), quantidade na família (15),
      proporção do capital da empresa (10) e ausência de preço/preço abaixo do custo (10).
      É uma regra de triagem, não previsão estatística. O aviso de reavaliar novas compras
      considera no mínimo três veículos na família, idade média de pelo menos 75 dias
      e 35% acima de 90 dias. Nenhum valor bloqueia uma compra automaticamente.</p>
    </details>
   </div>
  </div>
  </>}
 </section>;
}
