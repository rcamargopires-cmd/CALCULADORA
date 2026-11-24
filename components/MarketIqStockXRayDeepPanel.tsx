import React,{useMemo,useState} from 'react';
import {ArrowUpRight,BarChart3,Calculator,Clock3,Layers3,ShieldAlert,SlidersHorizontal,TrendingDown} from 'lucide-react';
import type {DealerStockSnapshot} from '../services/marketIqDealerRadar';
import {analyzeDealerStockDeep,xrayCapitalSensitivity,xrayMarkdownSensitivity} from '../services/marketIqStockXRay';

const brl=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(n);
const num=(n:number,digits=1)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:digits}).format(n);
const pct=(n:number)=>num(n*100)+'%';
const compact=(n:number)=>n>=1_000_000?'R$ '+num(n/1_000_000,2)+' mi':n>=1000?'R$ '+num(n/1000,1)+' mil':brl(n);
const className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';
const emphasis='font-black text-slate-950';
const flags:{key:string;label:string;help:string}[]=[
 {key:'review_buy',label:'Reavaliar compra',help:'Volume e envelhecimento sinalizam cautela; não é veto automático'},
 {key:'inspect_price',label:'Revisar preço',help:'Há preço ausente ou abaixo do custo no Dealer'},
 {key:'accelerate',label:'Acelerar giro',help:'Idade e custo envelhecido sugerem ação comercial'},
 {key:'monitor',label:'Acompanhar',help:'Sem alerta destas regras; não prova alta demanda'}
];
type Props={
 snapshot:DealerStockSnapshot;previousSnapshot?:DealerStockSnapshot|null;
 onFamilySelect:(family:string)=>void;
};
export default function MarketIqStockXRayDeepPanel({
 snapshot,previousSnapshot,onFamilySelect
}:Props){
 const metrics=useMemo(()=>analyzeDealerStockDeep(snapshot,previousSnapshot||null),
  [snapshot,previousSnapshot]);
 const [monthlyRate,setMonthlyRate]=useState(1.5);
 const [discount,setDiscount]=useState(5);
 const [focus,setFocus]=useState<'all'|'review_buy'|'inspect_price'|'accelerate'|'monitor'>('all');
 const [viewMode,setViewMode]=useState<'stale'|'capital'|'days'>('stale');
 const [unit,setUnit]=useState('all');
 const unitRows=unit==='all'?snapshot.vehicles:snapshot.vehicles.filter(v=>v.store===unit);
 const capital=unitRows.reduce((s,v)=>s+Math.max(0,v.cost),0);
 const old=unitRows.filter(v=>v.days>90);
 const oldCapital=old.reduce((s,v)=>s+Math.max(0,v.cost),0);
 const scenarios=useMemo(()=>xrayMarkdownSensitivity(old,discount),[old,discount]);
 const currentRelevant=metrics.families.filter(f=>
  (focus==='all'||f.action===focus)&&
  (unit==='all'||f.byUnit.some(v=>v.store===unit)));
 const sorted=[...currentRelevant].sort((a,b)=>viewMode==='days'?
  b.daysWeighted-a.daysWeighted:viewMode==='capital'?
  b.cost-a.cost:b.oldCost-a.oldCost);
 const top=sorted.slice(0,12);
 const max=Math.max(1,...top.map(f=>viewMode==='days'?f.daysWeighted:viewMode==='capital'?f.cost:f.oldCost));
 const panelMini='rounded-xl border border-slate-200 bg-slate-50 p-3';
 return <div className="space-y-4" aria-label="Análise aprofundada do estoque">
  <section className={className}>
   <div className="flex items-start gap-2"><Layers3 className="mt-0.5 text-[#14648b]" size={19}/>
    <div>
     <h4 className="text-lg font-black text-slate-950">Diagnóstico executivo</h4>
     <p className="text-xs text-slate-600">O Raio-X mostra não só quantos carros envelheceram, mas a dimensão financeira, a concentração e onde agir primeiro.</p>
    </div>
   </div>
   <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
    {([
     ['Capital com mais de 90 dias',brl(metrics.cohorts.slice(3).reduce((s,c)=>s+c.cost,0)),pct(metrics.oldCostShare)+' do investimento'],
     ['Idade ponderada pelo capital',num(metrics.averageCapitalDays)+' dias','Pesa mais os veículos de maior custo'],
     ['Top 5 famílias',pct(metrics.top5Share),brl(metrics.top5Cost)+' concentrados'],
     ['Capital acima de 180 dias',brl(metrics.over180Cost),'Faixa de maior permanência'],
     ['Top 5 do capital envelhecido',pct(metrics.top5OldShare),brl(metrics.top5OldCost)+' dessas famílias'],
     ['Quilometragem a conferir',String(metrics.kmUnverified),'Dados inconsistentes no Dealer'],
     ['Veículos com OS',String(metrics.serviceOrderCount),'Exige leitura do detalhe de preparação'],
     ['Custo zerado',String(metrics.noCostCount),'Não permite análise financeira completa']
    ] as const).map(([label,value,detail])=><article key={label} className={panelMini}>
     <p className="text-xs font-semibold text-slate-600">{label}</p>
     <p className="mt-1 break-words text-lg font-black text-slate-950">{value}</p>
     <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </article>)}
   </div>
   <p className="mt-3 text-xs text-slate-600">
    <strong>Leitura executiva:</strong> {metrics.oldCostShare>=0.25?'Uma parcela relevante do capital está acima de 90 dias.':
    'O capital acima de 90 dias representa '+pct(metrics.oldCostShare)+' do custo atual.'}
    {' '}As cinco famílias mais concentradas representam {pct(metrics.top5Share)} do custo total.
    Essa observação não mede vendas ou procura.
   </p>
  </section>

  <section className={className}>
   <div className="flex items-center gap-2"><Clock3 size={19} className="text-[#14648b]"/>
    <h4 className="text-lg font-black text-slate-950">Envelhecimento por capital, não só por quantidade</h4>
   </div>
   <p className="mt-1 text-xs text-slate-600">Cada barra representa a participação de uma faixa no investimento total. O relatório original não contém custos de aquisição do dinheiro nem vendas confirmadas.</p>
   <div className="mt-4 space-y-3">
    {metrics.cohorts.map(c=><div key={c.label} className="grid grid-cols-[60px_1fr_85px] items-center gap-2 sm:grid-cols-[85px_1fr_135px]">
     <span className="text-xs font-bold text-slate-700">{c.label} dias</span>
     <div className="min-w-0">
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
       <div className={'h-full rounded-full '+(c.min>=121?'bg-rose-500':c.min>=91?'bg-amber-500':'bg-sky-600')}
        style={{width:Math.max(0,c.share*100)+'%'}}/>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-500">{c.count} carro(s) · {pct(c.share)}</p>
     </div>
     <strong className="text-right text-xs text-slate-900">{compact(c.cost)}</strong>
    </div>)}
   </div>
  </section>

  <section className={className}>
   <div className="flex flex-wrap items-start justify-between gap-2">
    <div>
     <div className="flex items-center gap-2"><BarChart3 size={19} className="text-[#14648b]"/>
      <h4 className="text-lg font-black text-slate-950">Ranking de prioridade gerencial</h4></div>
     <p className="mt-1 text-xs text-slate-600">Comparação objetiva por família. O botão abre os veículos e as versões no Radar.</p>
    </div>
    <span className="text-xs text-slate-600">{sorted.length} famílias</span>
   </div>
   <div className="mt-3 grid gap-2 sm:grid-cols-3">
    <label className="text-xs font-bold text-slate-700">Critério
     <select className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
      value={viewMode} onChange={e=>setViewMode(e.target.value as typeof viewMode)}>
      <option value="stale">Maior capital há mais de 90 dias</option>
      <option value="capital">Maior capital total</option>
      <option value="days">Maior idade ponderada pelo capital</option>
     </select>
    </label>
    <label className="text-xs font-bold text-slate-700">Ação sugerida
     <select className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
      value={focus} onChange={e=>setFocus(e.target.value as typeof focus)}>
      <option value="all">Todas</option>{flags.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
     </select>
    </label>
    <label className="text-xs font-bold text-slate-700">Unidade
     <select className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
      value={unit} onChange={e=>setUnit(e.target.value)}>
      <option value="all">Todas</option>{metrics.capitalByUnit.map(u=><option key={u.store} value={u.store}>{u.store}</option>)}
     </select>
    </label>
   </div>
   {unit!=='all'&&<p className="mt-2 text-xs text-amber-900">Filtro de unidade: os indicadores e gráficos financeiros abaixo usam essa unidade, mas o ranking de famílias preserva o total corporativo para comparação. Os detalhes mostram a presença por loja.</p>}
   <div className="mt-4 space-y-3">
    {top.length===0&&<p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Nenhuma família encontrada com os filtros escolhidos.</p>}
    {top.map((f,i)=>{
     const amount=viewMode==='days'?f.daysWeighted:viewMode==='capital'?f.cost:f.oldCost;
     const action=flags.find(item=>item.key===f.action);
     return <div key={f.key} className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
       <p className="text-sm font-black text-slate-900">{i+1}. {f.brand} {f.family}</p>
       <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700">{action?.label||'Acompanhar'}</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
       <div className="h-full rounded-full bg-[#177e9d]" style={{width:amount/max*100+'%'}}/>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-700 sm:grid-cols-4">
       <p><strong>{f.count}</strong> em estoque</p>
       <p><strong>{f.oldCount}</strong> acima de 90 dias</p>
       <p><strong>{compact(f.oldCost)}</strong> envelhecidos</p>
       <p><strong>{num(f.daysWeighted)}</strong> dias ponderados</p>
      </div>
      <p className="mt-2 text-xs text-slate-600">
       {f.evidence.length?f.evidence.slice(0,3).join(' · '):'Sem alerta específico pelas regras atuais'}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
       <p className="text-xs text-slate-600">Unidades: {f.byUnit.slice(0,3).map(u=>u.store+' ('+u.count+')').join(', ')}</p>
       <button type="button" onClick={()=>onFamilySelect(f.family)}
        className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-3 py-2 text-xs font-black text-sky-900 hover:bg-sky-100">
        <ArrowUpRight size={14}/> Ver veículos e versões
       </button>
      </div>
     </div>;
    })}
   </div>
  </section>

  <div className="grid gap-4 lg:grid-cols-2">
   <section className={className}>
    <div className="flex items-center gap-2"><Calculator size={18} className="text-[#14648b]"/>
     <h4 className="text-base font-black text-slate-950">Simulador de custo de capital</h4></div>
    <p className="mt-1 text-xs text-slate-600">Cenário de manutenção do capital atual imobilizado. Altere a taxa que deseja utilizar como hipótese.</p>
    <label className="mt-3 block text-xs font-semibold text-slate-700">Taxa de capital ao mês (%)
     <input type="number" min={0} max={6} step={0.25} value={monthlyRate}
      onChange={e=>setMonthlyRate(Math.max(0,Math.min(6,Number(e.target.value)||0)))}
      className="mt-1 w-32 rounded-lg border border-slate-300 p-2 text-sm"/>
    </label>
    <div className="mt-3 grid grid-cols-2 gap-2">
     {[
      ['30 dias',1],['60 dias',2]
     ].map(([label,months])=><div key={label} className={panelMini}>
      <p className="text-xs text-slate-600">{label} · estoque atual</p>
      <p className="mt-1 text-lg font-black text-slate-900">{brl(xrayCapitalSensitivity(capital,monthlyRate,Number(months)))}</p>
     </div>)}
     <div className={panelMini+' col-span-2'}>
      <p className="text-xs text-slate-600">30 dias · somente capital acima de 90 dias</p>
      <p className="mt-1 text-lg font-black text-amber-900">{brl(xrayCapitalSensitivity(oldCapital,monthlyRate,1))}</p>
     </div>
    </div>
    <p className="mt-3 text-xs text-slate-500">Cálculo: custo informado × taxa mensal × período. Não é despesa contabilizada nem prevê que os veículos permanecerão no estoque.</p>
   </section>
   <section className={className}>
    <div className="flex items-center gap-2"><TrendingDown size={18} className="text-[#14648b]"/>
     <h4 className="text-base font-black text-slate-950">Cenário de revisão de anúncios</h4></div>
    <p className="mt-1 text-xs text-slate-600">Simula ajuste uniforme nos preços sugeridos dos veículos com mais de 90 dias, apenas onde há preço e custo válidos.</p>
    <label className="mt-3 block text-xs font-semibold text-slate-700">Redução simulada de preço (%)
     <input type="number" min={0} max={30} step={1} value={discount}
      onChange={e=>setDiscount(Math.max(0,Math.min(30,Number(e.target.value)||0)))}
      className="mt-1 w-32 rounded-lg border border-slate-300 p-2 text-sm"/>
    </label>
    <div className="mt-3 grid grid-cols-2 gap-2">
     <div className={panelMini}><p className="text-xs text-slate-600">Preço sugerido atual</p>
      <p className="mt-1 text-lg font-black text-slate-900">{brl(scenarios.currentAsk)}</p></div>
     <div className={panelMini}><p className="text-xs text-slate-600">Após ajuste hipotético</p>
      <p className="mt-1 text-lg font-black text-slate-900">{brl(scenarios.scenarioAsk)}</p></div>
     <div className={panelMini+' col-span-2'}>
      <p className="text-xs text-slate-600">Diferença bruta do cenário frente ao custo (não é lucro)</p>
      <p className={'mt-1 text-lg font-black '+(scenarios.spread<0?'text-rose-800':'text-slate-900')}>{brl(scenarios.spread)}</p>
      <p className="mt-1 text-xs text-slate-600">{scenarios.count} veículos elegíveis; impostos, negociação, custos futuros e probabilidade de venda não calculados.</p>
     </div>
    </div>
   </section>
  </div>

  <section className={className}>
   <div className="flex items-center gap-2"><SlidersHorizontal size={18} className="text-[#14648b]"/>
    <h4 className="text-base font-black text-slate-950">Evolução entre fotografias</h4>
   </div>
   {metrics.period?<div className="mt-3 space-y-2">
    <p className="text-sm text-slate-700">Comparação de {metrics.period.from.split('-').reverse().join('/')} a {metrics.period.to.split('-').reverse().join('/')} ({metrics.period.days} dia(s)).</p>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
     {([
      ['Variação líquida de veículos',String(metrics.period.netVehicleChange)],
      ['Variação do capital',brl(metrics.period.netCostChange)],
      ['Entradas observadas',String(metrics.period.entriesObserved)],
      ['Saídas observadas',String(metrics.period.exitsObserved)],
      ['Custo nas entradas',brl(metrics.period.entriesCost)],
      ['Custo nas saídas',brl(metrics.period.exitsCost)],
      ['Veículos permanecentes',String(metrics.period.retainedCount)],
      ['Alteração de custo nos permanecentes',brl(metrics.period.retainedCostChange)]
     ] as const).map(([label,value])=><div key={label} className={panelMini}>
      <p className="text-xs text-slate-600">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-900">{value}</p>
     </div>)}
    </div>
    <p className="text-xs text-slate-600">{metrics.period.transfersObserved} mudança(s) de unidade nos veículos que permaneceram cadastrados.</p>
   </div>:<p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
     Só há uma fotografia datada disponível. A próxima importação em outro dia permitirá comparar entradas, saídas e variação de capital, mas não comprova vendas.
   </p>}
   <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
    <ShieldAlert size={17} className="mt-0.5 shrink-0"/>
    <span><strong>Limite dos dados:</strong> saída do estoque não comprova venda; preço anunciado não é preço realizado; diferença entre preço e custo não é margem líquida. Para gerar ranking real de modelos campeões de venda e recomendar aumento de compras, precisamos do relatório de vendas efetivamente concluídas e do tempo desde a entrada.</span>
   </p>
  </section>
 </div>;
}
