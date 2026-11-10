import React,{useMemo,useRef,useState} from 'react';
import './marketIqRadarCompact.css';
import {AlertTriangle,ArrowDownUp,ArrowRight,CarFront,Clock3,FileSpreadsheet,RefreshCw,Search,ShieldCheck,UploadCloud,Warehouse} from 'lucide-react';
import {
 readDealerWorkbook,dealerRadarStats,dealerRiskFlags,dealerSimilarStock,dealerPlateSuggestions,compareDealerSnapshots,
 type DealerStockSnapshot,type DealerStockVehicle
} from '../services/marketIqDealerRadar';
import MarketIqPurchaseSummaryModal from './MarketIqPurchaseSummaryModal';

const brl=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(n);
const dec=(n:number)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(n);
const date=(iso:string)=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return 'Data não identificada';
 const [y,m,d]=iso.split('-');return d+'/'+m+'/'+y;
};
const normal=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const cap=(s:string)=>s.length>48?s.slice(0,48)+'…':s;
type Filter='all'|'aging'|'noPrice'|'belowCost'|'os';
const card='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';
type Props={
 snapshot?:DealerStockSnapshot|null;onSnapshotChange?:(next:DealerStockSnapshot|null)=>void;
 previousSnapshot?:DealerStockSnapshot|null;onPreviousSnapshotChange?:(next:DealerStockSnapshot|null)=>void;
 localArchiveState?:'loading'|'empty'|'restored'|'saving'|'saved'|'error';
 localArchiveWarning?:string;
 onQuoteVehicle?:(vehicle:DealerStockVehicle)=>void;
};
export default function MarketIqDealerRadarPanel(props:Props){
 const fileInput=useRef<HTMLInputElement|null>(null);
 const [localCurrent,setLocalCurrent]=useState<DealerStockSnapshot|null>(null);
 const [localPrevious,setLocalPrevious]=useState<DealerStockSnapshot|null>(null);
 const current=props.snapshot===undefined?localCurrent:props.snapshot;
 const previous=props.previousSnapshot===undefined?localPrevious:props.previousSnapshot;
 const setCurrent=(next:DealerStockSnapshot|null)=>{
  setLocalCurrent(next);props.onSnapshotChange?.(next);
 };
 const setPrevious=(next:DealerStockSnapshot|null)=>{
  setLocalPrevious(next);props.onPreviousSnapshotChange?.(next);
 };
 const [fileName,setFileName]=useState('');
 const savedFileName=current?.sourceFileName||fileName||'Fotografia recuperada do navegador';
 const cacheState=props.localArchiveState||'empty';
 const today=new Date();
 const currentLocalDay=Date.UTC(today.getFullYear(),today.getMonth(),today.getDate());
 const referenceDay=current?.reportDate&&/^\d{4}-\d{2}-\d{2}$/.test(current.reportDate)?
  Date.parse(current.reportDate+'T00:00:00Z'):NaN;
 const snapshotAge=Number.isFinite(referenceDay)?
  Math.floor((currentLocalDay-referenceDay)/86400000):null;
 const snapshotOutdated=snapshotAge===null||snapshotAge>14||snapshotAge<0;
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [search,setSearch]=useState('');
 const [store,setStore]=useState('all');
 const [type,setType]=useState<'all'|'car'|'motorcycle'>('all');
 const [filter,setFilter]=useState<Filter>('all');
 const [selectedKey,setSelectedKey]=useState('');
 const [purchaseSummaryVehicle,setPurchaseSummaryVehicle]=useState<DealerStockVehicle|null>(null);
 const [capitalRate,setCapitalRate]=useState('1.5');
 const [visibleCount,setVisibleCount]=useState(60);
 const vehicles=current?.vehicles||[];
 const selected=useMemo(()=>vehicles.find(v=>v.key===selectedKey)||null,[vehicles,selectedKey]);
 const filtered=useMemo(()=>{
  const term=normal(search.trim());
  const list=vehicles.filter(v=>
   (store==='all'||v.store===store)&&(type==='all'||v.vehicleType===type)&&
   (!term||normal([v.plate,v.chassis,v.brand,v.model,v.year,v.store].join(' ')).includes(term))&&
   (filter==='all'||(filter==='aging'&&v.days>90)||
    (filter==='noPrice'&&v.price<=0)||(filter==='belowCost'&&v.price>0&&v.cost>0&&v.price<v.cost)||
    (filter==='os'&&v.serviceOrders>0)));
  return [...list].sort((a,b)=>b.days-a.days);
 },[vehicles,store,type,search,filter]);
 const plateSuggestions=useMemo(()=>filtered.length===0?
  dealerPlateSuggestions(vehicles,search):[],[vehicles,search,filtered.length]);
 const selectSuggestedPlate=(plate:string)=>{
  // Only act on the operator's explicit click. Reset conflicting filters so
  // the selected, verified Dealer plate really appears in the table.
  setSearch(plate);setStore('all');setType('all');setFilter('all');setVisibleCount(60);
 };
 const monthlyRate=Number(capitalRate.replace(',','.'));
 const rate=Number.isFinite(monthlyRate)?Math.min(6,Math.max(0,monthlyRate)):1.5;
 const stats=useMemo(()=>dealerRadarStats(filtered,rate),[filtered,rate]);
 const allStats=useMemo(()=>dealerRadarStats(vehicles,rate),[vehicles,rate]);
 const similar=useMemo(()=>selected?dealerSimilarStock(vehicles,selected):[],[vehicles,selected]);
 const diff=useMemo(()=>current&&previous?compareDealerSnapshots(previous,current):null,[current,previous]);
 const progressMax=Math.max(1,...stats.ageBuckets.map(x=>x.count));

 const importFile=async(file:File|undefined)=>{
  if(!file)return;
  setLoading(true);setError('');
  try{
   const snapshot={...(await readDealerWorkbook(file)),sourceFileName:file.name.slice(0,140)};
   if(current){
    if(snapshot.reportDate&&current.reportDate&&snapshot.reportDate<current.reportDate){
     setPrevious(snapshot);setError('Você importou um relatório anterior. Ele será usado apenas para comparação com o estoque atual. A última fotografia permanece ativa neste navegador.');
    }else{
     setPrevious(current);setCurrent(snapshot);setSelectedKey('');setFileName(file.name);
    }
   }else{
    setCurrent(snapshot);setSelectedKey('');setFileName(file.name);
   }
   setStore('all');setFilter('all');setSearch('');setType('all');setVisibleCount(60);
  }catch(err){setError(err instanceof Error?err.message:'Não foi possível ler este arquivo do Dealer.');}
  finally{setLoading(false);}
 };
 const clear=()=>{
  if(current&&!window.confirm('Apagar as fotografias do estoque SALVAS NESTE NAVEGADOR? Você precisará importar a planilha novamente. Nenhum registro oficial será afetado.'))return;
  setCurrent(null);setPrevious(null);setSelectedKey('');setError('');setFileName('');
  if(fileInput.current)fileInput.current.value='';
 };
 const exportAlerts=()=>{
  if(!current)return;
  const risky=vehicles.filter(v=>dealerRiskFlags(v).length>0);
  const fields=[
   ['Placa','Marca','Modelo','Ano','Unidade','Dias','KM','Valor Custo','Preco Sugerido','Alertas'],
   ...risky.map(v=>[v.plate,v.brand,v.model,v.year,v.store,String(v.days),
    v.kmValid?String(v.km):'A conferir ('+v.kmOriginal+')',
    String(v.cost),String(v.price),dealerRiskFlags(v).join(' / ')])
  ];
  const csv='\uFEFF'+fields.map(row=>row.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='motyq-radar-alertas-'+(current.reportDate||'estoque')+'.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const showVehicle=(v:DealerStockVehicle)=>{
  setSelectedKey(v.key);
  window.setTimeout(()=>document.getElementById('motyq-radar-details')?.scrollIntoView({behavior:'smooth',block:'center'}),0);
 };
 return <div className="space-y-5">
  <section className="motyq-iq-radar-hero overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-br from-[#0c293d] via-[#123b51] to-[#126083] px-5 py-6 text-white shadow-sm">
   <p className="text-[11px] font-black uppercase tracking-[.2em] text-cyan-200">MOTYQ IQ · INTELIGÊNCIA DE AQUISIÇÕES</p>
   <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Meu estoque <span className="text-cyan-200">· Radar</span></h2>
   <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-100">Encontre um carro, confira o custo e veja o que precisa de atenção.</p>
   <div className="mt-4 flex flex-wrap items-center gap-3">
    <button type="button" disabled={loading} onClick={()=>fileInput.current?.click()}
     className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-extrabold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">
     {loading?<RefreshCw size={18} className="animate-spin"/>:<UploadCloud size={18}/>}
     {loading?'Analisando arquivo…':current?'Importar novo relatório':'Importar estoque do Dealer'}
    </button>
    <input ref={fileInput} type="file" accept=".xlsm,.xlsx" aria-label="Importar planilha de estoque Dealer"
     className="sr-only" onChange={e=>{void importFile(e.target.files?.[0]);e.currentTarget.value='';}}/>
    {current&&<button type="button" onClick={clear}
     className="rounded-lg border border-white/30 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/10">
     Limpar dados locais</button>}
   </div>
   <details className="mt-3 rounded-lg border border-white/20 px-3 py-2 text-xs text-cyan-100">
    <summary className="cursor-pointer font-bold text-cyan-100">Origem dos dados e privacidade</summary>
    <p className="mt-2 leading-5 text-cyan-100">Base importada manualmente do Dealer, salva somente neste navegador e conta. Não há conferência em tempo real. Nenhuma macro é executada e nenhuma avaliação oficial é alterada. Em computador compartilhado, use «Limpar dados locais» ao terminar.</p>
   </details>
  </section>
  {props.localArchiveWarning&&<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">{props.localArchiveWarning}</p>}
  {current&&<div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-950">
   <span>{cacheState==='restored'?'Última fotografia do Dealer recuperada automaticamente neste navegador.':
    cacheState==='saving'?'Salvando a fotografia para os próximos acessos...':
    cacheState==='saved'?'Fotografia salva neste navegador para os próximos acessos.':
    cacheState==='error'?'Fotografia disponível nesta sessão; o armazenamento local falhou.':
    'Fotografia disponível para esta sessão.'}</span>
   <span>{current.reportDate?'Base de '+date(current.reportDate):'Data da base não informada'} · {vehicles.length.toLocaleString('pt-BR')} veículos</span>
  </div>}
  {current&&snapshotOutdated&&<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950">
   Atenção: a fotografia do estoque está {snapshotAge===null?'sem data válida':snapshotAge<0?'com data futura':'com '+snapshotAge+' dias de idade'}.
   Atualize pelo botão «Importar novo relatório» para não usar um estoque antigo como situação atual.
  </p>}
  {error&&<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">{error}</p>}
  {!current?<div className={card}>
   <div className="flex items-start gap-3">
    <FileSpreadsheet size={30} className="shrink-0 text-cyan-700"/>
    <div><h3 className="text-lg font-bold text-slate-950">Pronto para receber o seu relatório V44</h3>
     <p className="mt-1 text-sm leading-6 text-slate-700">Envie o arquivo <strong>ConsultaEstoqueVeiculos_V44.xlsm</strong>. O Radar usa a aba Consulta e identifica ordens de serviço pela placa ou pelo chassi, quando disponíveis.</p>
     <p className="mt-2 text-xs text-slate-600">Não utiliza as abas auxiliares preenchidas com zeros, não soma OS duas vezes ao custo e não inventa dados de vendas.</p>
    </div>
   </div>
  </div>:<>
   <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-700">
    <summary className="cursor-pointer font-bold text-[#153f51]">
     Dados da importação: {date(current.reportDate)} · {current.vehicles.length.toLocaleString('pt-BR')} veículos · {current.warnings.length} alerta(s)
    </summary>
    <p className="mt-2"><strong>Arquivo:</strong> {cap(savedFileName)} · somente leitura · dados informados na planilha, não sincronizados em tempo real</p>
    {current.warnings.length>0&&<p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 font-semibold text-amber-950">
     <strong>Validação do arquivo:</strong> {current.warnings.join(' ')}
    </p>}
   </details>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <article className={card}><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><CarFront size={17}/> Veículos</div>
     <p className="mt-2 text-3xl font-black text-slate-950">{stats.count}</p>
     <p className="mt-1 text-xs text-slate-600">{stats.stores} unidade(s) nos filtros</p></article>
    <article className={card}><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><Warehouse size={17}/> Custo em estoque</div>
     <p className="mt-2 text-2xl font-black text-slate-950">{brl(stats.costTotal)}</p>
     <p className="mt-1 text-xs text-slate-600">Soma do Valor Custo informado</p></article>
    <article className={card}><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><Clock3 size={17}/> Idade do estoque</div>
     <p className="mt-2 text-3xl font-black text-slate-950">{dec(stats.daysAverage)} <span className="text-base">dias</span></p>
     <p className="mt-1 text-xs text-slate-600">Mediana: {dec(stats.daysMedian)} dias</p></article>
    <article className={card}><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><AlertTriangle size={17}/> Mais de 90 dias</div>
     <p className="mt-2 text-3xl font-black text-amber-700">{stats.over90}</p>
     <p className="mt-1 text-xs text-slate-600">Veículos exigindo revisão de giro</p></article>
   </div>
   <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <summary className="cursor-pointer text-sm font-black text-[#153f51]">Análises adicionais: giro, alertas e comparação entre relatórios</summary>
    <div className="mt-4 space-y-4">
   <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
    <section className={card}>
     <h3 className="font-black text-slate-950">Tempo em estoque</h3>
     <p className="mt-1 text-xs text-slate-600">Distribuição dos veículos ainda disponíveis, não tempo médio até vender.</p>
     <div className="mt-4 space-y-3">
      {stats.ageBuckets.map(b=><div key={b.name} className="grid grid-cols-[90px_1fr_38px] items-center gap-3 text-xs">
       <span className="font-semibold text-slate-600">{b.name} dias</span>
       <div className="h-3 rounded-full bg-slate-100"><div className={'h-3 rounded-full '+(b.name==='181+'||b.name.startsWith('121')?'bg-rose-500':b.name.startsWith('91')?'bg-amber-500':'bg-cyan-600')}
        style={{width:(b.count===0?0:Math.max(3,b.count/progressMax*100))+'%'}}/></div>
       <span className="text-right font-black text-slate-900">{b.count}</span>
      </div>)}
     </div>
    </section>
    <section className={card}>
     <h3 className="font-black text-slate-950">Alertas de precificação</h3>
     <div className="mt-4 grid grid-cols-2 gap-3">
      <button type="button" onClick={()=>{setFilter('noPrice');setVisibleCount(60);}}
       className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left hover:bg-amber-100">
       <p className="text-2xl font-black text-amber-900">{stats.priceMissing}</p>
       <p className="mt-1 text-xs font-semibold text-amber-950">Sem preço sugerido</p>
      </button>
      <button type="button" onClick={()=>{setFilter('belowCost');setVisibleCount(60);}}
       className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-left hover:bg-rose-100">
       <p className="text-2xl font-black text-rose-900">{stats.underCost}</p>
       <p className="mt-1 text-xs font-semibold text-rose-950">Preço abaixo do custo</p>
      </button>
     </div>
     <div className="mt-4 border-t border-slate-200 pt-3">
      <label className="text-xs font-bold text-slate-700">Custo de capital hipotético (% ao mês)
       <input aria-label="Taxa de capital mensal" type="number" step=".1" min="0" max="6" value={capitalRate}
        onChange={e=>setCapitalRate(e.target.value)}
        className="ml-2 w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"/>
      </label>
      <p className="mt-2 text-xl font-black text-slate-950">{brl(stats.capitalCostEstimate)}</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">Cenário acumulado: Valor Custo × taxa × (dias/30). Não é despesa confirmada e não foi somado novamente aos custos.</p>
     </div>
    </section>
   </div>
   {diff&&<section className={card}>
    <h3 className="font-black text-slate-950">Mudanças entre fotografias do estoque</h3>
    <p className="mt-1 text-xs text-slate-600">{date(previous?.reportDate||'')} → {date(current.reportDate)}. Saídas não equivalem necessariamente a vendas.</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-4">
     {[
      ['Entradas',diff.entries.length],['Saídas a confirmar',diff.exits.length],
      ['Mudanças de unidade',diff.transfers.length],['Preços alterados',diff.priceChanges.length]
     ].map(([label,n])=><div key={label} className="rounded-xl bg-slate-50 p-3">
      <p className="text-2xl font-black text-slate-900">{n}</p><p className="text-xs font-semibold text-slate-600">{label}</p>
     </div>)}
    </div>
    <p className="mt-2 text-xs text-amber-800">A classificação de venda, repasse, devolução ou transferência exige relatório de movimentação ou vendas.</p>
   </section>}
    </div>
   </details>
   <section className={card}>
    <div className="flex flex-wrap items-start justify-between gap-3">
     <div><h3 className="text-lg font-black text-slate-950">Estoque por veículo</h3>
      <p className="mt-1 text-xs text-slate-600">Clique em um veículo para encontrar semelhantes no grupo e analisar seus custos.</p>
     </div>
     <button type="button" onClick={exportAlerts} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100">
      Exportar alertas CSV
     </button>
    </div>
    <div role="group" aria-label="Filtros rápidos do estoque" className="mt-4 flex flex-wrap gap-2">
     {([
      ['all','Todos'],['aging','Mais de 90 dias'],['noPrice','Sem preço'],['belowCost','Abaixo do custo']
     ] as const).map(([value,title])=><button type="button" key={value} aria-pressed={filter===value}
      onClick={()=>{setFilter(value);setVisibleCount(60);}}
      className={'rounded-full border px-3 py-2 text-xs font-bold '+(filter===value?
       'border-[#153f51] bg-[#153f51] text-white':'border-slate-200 bg-slate-50 text-slate-700 hover:border-cyan-300')}>
      {title}
     </button>)}
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
     <label className="text-xs font-bold text-slate-700"><Search size={13} className="mr-1 inline"/> Buscar placa/modelo
      <input className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm font-normal" value={search}
       placeholder="Ex.: Amarok, Tracker, ABC1D23"
       onChange={e=>{setSearch(e.target.value);setVisibleCount(60);}}/>
     </label>
     <label className="text-xs font-bold text-slate-700">Unidade
      <select value={store} onChange={e=>{setStore(e.target.value);setVisibleCount(60);}}
       className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal">
       <option value="all">Todas as unidades</option>
       {current.stores.map(s=><option key={s} value={s}>{s}</option>)}
      </select>
     </label>
     <details className="col-span-full rounded-lg border border-slate-200 bg-slate-50 p-3">
      <summary className="cursor-pointer text-xs font-bold text-[#153f51]">Mais filtros: categoria e condições</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
     <label className="text-xs font-bold text-slate-700">Tipo
      <select value={type} onChange={e=>{setType(e.target.value as typeof type);setVisibleCount(60);}}
       className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal">
       <option value="all">Carros e motos</option><option value="car">Automóveis</option>
       <option value="motorcycle">Motocicletas (identificação estimada)</option>
      </select>
     </label>
     <label className="text-xs font-bold text-slate-700">Atenção
      <select value={filter} onChange={e=>{setFilter(e.target.value as Filter);setVisibleCount(60);}}
       className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal">
       <option value="all">Todos</option><option value="aging">Mais de 90 dias</option>
       <option value="noPrice">Sem preço sugerido</option><option value="belowCost">Preço abaixo do custo</option>
       <option value="os">Com ordens de serviço</option>
      </select>
     </label>
      </div>
     </details>
    </div>
    {plateSuggestions.length>0&&<div role="status" aria-live="polite"
     className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
     <p className="text-sm font-black">Nenhuma placa exata encontrada. Você quis dizer?</p>
     <p className="mt-1 text-xs">Confira antes de selecionar. O Motyq nunca altera a placa automaticamente.</p>
     <div className="mt-2 flex flex-wrap gap-2">
      {plateSuggestions.map(v=><button type="button" key={v.key}
       onClick={()=>selectSuggestedPlate(v.plate)}
       className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-left hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-800">
       <span className="block text-sm font-black">{v.plate}</span>
       <span className="block text-xs text-slate-700">{v.brand} {v.model} · {v.store}</span>
      </button>)}
     </div>
    </div>}
    <p className="mt-3 text-xs text-slate-600">Exibindo {Math.min(visibleCount,filtered.length)} de {filtered.length} veículos filtrados ({allStats.count} no arquivo).</p>
    <div className="mt-2 overflow-x-auto">
     <table className="w-full min-w-[660px] text-left text-xs">
      <thead className="bg-slate-100 text-slate-700"><tr>
       {['Veículo','Unidade','Dias','Valor custo','Preço da planilha','Ações'].map(h=>
        <th key={h} scope="col" className="whitespace-nowrap px-3 py-3 font-black">{h}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-slate-100">
       {filtered.slice(0,visibleCount).map(v=><tr key={v.key}
        className="cursor-pointer hover:bg-cyan-50" onClick={()=>showVehicle(v)}>
        <td className="min-w-[200px] px-3 py-3">
         <p className="font-bold text-slate-950">{v.brand} {v.model}</p>
         <p className="mt-0.5 text-slate-600">{v.plate||'Sem placa'} · {v.year} · {v.kmValid?v.km.toLocaleString('pt-BR')+' km':'KM a conferir'}</p>
        </td>
        <td className="px-3 py-3 text-slate-700">{v.store}</td>
        <td className={'px-3 py-3 font-black '+(v.days>90?'text-rose-700':'text-slate-800')}>{v.days} d</td>
        <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-900">{brl(v.cost)}</td>
        <td className="whitespace-nowrap px-3 py-3 text-slate-900">
         <p className="font-semibold">{v.price>0?brl(v.price):'Não informado'}</p>
         <p className={'mt-1 text-[11px] '+(v.price>0&&v.price<v.cost?'text-rose-700':'text-slate-500')}>
          {v.price>0?'Diferença bruta: '+brl(v.price-v.cost):'Sem comparação'}
         </p>
        </td>
        <td className="px-3 py-3">
         <div className="flex flex-wrap gap-2">
          <button type="button" onClick={e=>{e.stopPropagation();setPurchaseSummaryVehicle(v);}}
           className="whitespace-nowrap rounded-lg bg-cyan-700 px-3 py-2 text-xs font-black text-white hover:bg-cyan-800">
           Resumo de Compra
          </button>
          {props.onQuoteVehicle&&<button type="button" onClick={e=>{e.stopPropagation();props.onQuoteVehicle?.(v);}}
           className="whitespace-nowrap rounded-lg border border-cyan-300 bg-white px-3 py-2 text-xs font-bold text-cyan-950 hover:bg-cyan-50">
           Cotar na Mesa
          </button>}
         </div>
        </td>
       </tr>)}
       {!filtered.length&&<tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">Nenhum veículo corresponde aos filtros.</td></tr>}
      </tbody>
     </table>
    </div>
    {filtered.length>visibleCount&&<button type="button" onClick={()=>setVisibleCount(n=>n+60)}
     className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-800">
     Mostrar mais veículos <ArrowRight size={14} className="ml-1 inline"/></button>}
   </section>
   {selected&&<section id="motyq-radar-details" className={card}>
    <div className="flex flex-wrap items-start justify-between gap-2">
     <div><p className="text-[11px] font-bold tracking-wide text-cyan-700">FICHA DE INTELIGÊNCIA DE ESTOQUE</p>
      <h3 className="mt-1 text-xl font-black text-slate-950">{selected.brand} {selected.model} · {selected.year}</h3>
      <p className="mt-1 text-sm text-slate-600">{selected.plate||'Sem placa'} · {selected.store} · {selected.days} dias · {selected.kmValid?selected.km.toLocaleString('pt-BR')+' km':'KM a conferir'}</p>
     </div>
     <div className="flex flex-wrap gap-2">
      <button type="button" onClick={()=>setPurchaseSummaryVehicle(selected)}
       className="rounded-lg bg-[#0b7199] px-4 py-2 text-xs font-black text-white hover:bg-[#095b7b]">
       Abrir Resumo de Compra
      </button>
      {props.onQuoteVehicle&&<button type="button" onClick={()=>props.onQuoteVehicle?.(selected)}
       className="rounded-lg border border-cyan-300 bg-cyan-50 px-4 py-2 text-xs font-black text-cyan-950">Cotar na Mesa</button>}
      <button type="button" onClick={()=>setSelectedKey('')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold">Fechar</button>
     </div>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-4">
     {[
      ['Valor compra',brl(selected.purchase)],['Valor custo',brl(selected.cost)],
      ['Preço sugerido',selected.price>0?brl(selected.price):'Sem preço'],
      ['Diferença bruta',selected.price>0?brl(selected.price-selected.cost):'A confirmar']
     ].map(([name,n])=><div key={name} className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-600">{name}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{n}</p>
     </div>)}
    </div>
    <p className="mt-2 text-xs leading-5 text-slate-600">
     A diferença entre preço sugerido e Valor Custo não é lucro líquido comprovado. Confira impostos, desconto, margem desejada e estado do veículo.
     As {selected.serviceOrders} OS vinculadas são informativas e não foram somadas novamente ao custo.
    </p>
    {!selected.kmValid&&<p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-950">
     KM inconsistente no Dealer: {selected.kmOriginal||'não informado'}. O veículo continua nos totais de estoque e custo, mas seu KM não é usado como quilometragem válida.
    </p>}
    {dealerRiskFlags(selected).length>0&&<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
     <p className="font-bold text-amber-950">Pontos de atenção</p>
     {dealerRiskFlags(selected).map(f=><p key={f} className="mt-1 text-xs text-amber-950">• {f}</p>)}
    </div>}
    <details className="mt-4 border-t border-slate-200 pt-4">
     <summary className="cursor-pointer text-sm font-black text-[#153f51]">Ver {similar.length} veículo(s) semelhantes do grupo</summary>
     <div className="mt-3">
     <h4 className="text-xs font-bold text-slate-900">Semelhança por família de modelo</h4>
     <p className="mt-1 text-xs text-slate-600">Comparação por marca e família do modelo. Versões e anos podem diferir e não são tratados como iguais na FIPE.</p>
     {!similar.length?<p className="mt-2 text-sm text-slate-600">Nenhum outro veículo da mesma família aparece neste arquivo.</p>:
      <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs">
       <thead><tr className="bg-slate-100">{['Modelo','Placa','Loja','Dias','Custo','Preço'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead>
       <tbody>{similar.slice(0,15).map(v=><tr key={v.key} className="border-b border-slate-100">
        <td className="p-2">{v.model} · {v.year}</td><td className="p-2">{v.plate}</td>
        <td className="p-2">{v.store}</td><td className="p-2">{v.days}</td>
        <td className="p-2">{brl(v.cost)}</td><td className="p-2">{v.price>0?brl(v.price):'Sem preço'}</td>
       </tr>)}</tbody>
      </table></div>}
    </div>
    </details>
   </section>}
   <MarketIqPurchaseSummaryModal open={Boolean(purchaseSummaryVehicle)}
    onClose={()=>setPurchaseSummaryVehicle(null)} snapshot={current}
    target={{
     brand:purchaseSummaryVehicle?.brand||'',model:purchaseSummaryVehicle?.model||'',
     year:purchaseSummaryVehicle?.year||'',plate:purchaseSummaryVehicle?.plate,
     km:purchaseSummaryVehicle?.km,store:purchaseSummaryVehicle?.store,
     vehicleType:purchaseSummaryVehicle?.vehicleType||'car',
     stockVehicle:purchaseSummaryVehicle,preparation:0
    }}/>
   <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-6 text-slate-700">
    <summary className="cursor-pointer font-bold text-[#153f51]">Limites técnicos e atualização da planilha</summary>
    <p className="mt-2">O Radar não calcula lucratividade líquida nem verifica vendas em tempo real, e não recomenda automaticamente “Comprar”. Saídas da fotografia não comprovam vendas.</p>
    <p className="mt-1">O último relatório e a fotografia anterior são recuperados automaticamente neste navegador. Para atualizar o estoque real, importe um novo V44. Limpar dados do navegador pode apagar a fotografia local.</p>
   </details>
  </>}
 </div>;
}
