import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Activity,ArrowDownToLine,BarChart3,Building2,CheckCircle2,Clock3,
  FileSpreadsheet,Filter,Info,Layers3,RefreshCcw,ShieldCheck,TrendingUp,
  Wallet,AlertTriangle,UploadCloud,X,CarFront,HandCoins} from 'lucide-react';
import {Bar,BarChart,CartesianGrid,Cell,Line,LineChart,Pie,PieChart,
  ResponsiveContainer,Tooltip,XAxis,YAxis,Legend} from 'recharts';
import {aggregateDashboard,dashboardOptions,emptyFilters,filterDashboardRows,
  parseDashboardData,type DashboardFilters,type DashboardRow,type DashboardImportResult}
  from '../services/marketIqManagementData';
import {OCT2026_SNAPSHOT} from '../services/marketIqManagementSnapshot';
import {chooseBestConfirmedOffer,calculateConsultedOffer,offerIsEligible,
  loadConsultedCases,exportConsultedLogCsv,exportConsultedReportCsv,moneyNumber,formatReais,consultedFinancialInputsReady,
  type ConsultedCase} from '../services/marketIqConsultedRepasse';
import type {User} from '../types';

const fmtMoney=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(v);
const fmtCompact=(v:number)=>new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(v);
const fmtInt=(v:number)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(v);
const fmtPct=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(v);
const COLORS=['#147d89','#6366f1','#e3a04c','#e36d6d','#94a3b8'];
type Tab='overview'|'stores'|'quality'|'repasses';
const classNameSelect='w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';
const panelClass='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const Header=({title,description}:{title:string;description?:string})=><div className="mb-4">
  <h3 className="text-base font-black tracking-tight text-slate-900">{title}</h3>
  {description&&<p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>}
</div>;
const Metric=({label,value,detail,icon:Icon,tone='cyan'}:{
 label:string;value:string;detail:string;icon:any;tone?:'cyan'|'indigo'|'amber'
})=><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
  <div className="flex items-center justify-between">
    <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{label}</p>
    <span className={'rounded-xl p-2 '+(tone==='indigo'?'bg-indigo-50 text-indigo-600':tone==='amber'?'bg-amber-50 text-amber-700':'bg-cyan-50 text-cyan-700')}><Icon size={18}/></span>
  </div>
  <p className="mt-3 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">{value}</p>
  <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
</div>;
const Pill=({children,tone='neutral'}:{children:React.ReactNode;tone?:'neutral'|'good'|'warn'})=>
<span className={'inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold '+(tone==='good'?'bg-emerald-50 text-emerald-700':tone==='warn'?'bg-amber-50 text-amber-800':'bg-slate-100 text-slate-600')}>{children}</span>;

export default function MarketIqManagementDashboard({user}:{user:User}) {
 const storageKey='motyq-iq-dashboard-local-v1-'+String(user.email||'local').toLowerCase();
 const [records,setRecords]=useState<DashboardRow[]>(()=>{
   try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
     return Array.isArray(saved)&&saved.length<=15000?saved.filter(v=>v&&typeof v==='object'&&typeof v.status==='string'&&typeof v.store==='string'):[];
   }catch{return [];}
 });
 const [importInfo,setImportInfo]=useState<DashboardImportResult|null>(null);
 const [sourceName,setSourceName]=useState(()=>{try{return localStorage.getItem(storageKey+'-name')||''}catch{return ''}});
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [tab,setTab]=useState<Tab>('overview');
 const [consultations,setConsultations]=useState<ConsultedCase[]>(()=>loadConsultedCases(String(user.email||'')));
 useEffect(()=>{
   const refresh=()=>setConsultations(loadConsultedCases(String(user.email||'')));
   const onStorage=(event:StorageEvent)=>{if(event.key?.includes('motyq-iq-repasse-consulta-preview'))refresh();};
   window.addEventListener('motyq:repasse-consulta-saved',refresh);
   window.addEventListener('storage',onStorage);
   return ()=>{window.removeEventListener('motyq:repasse-consulta-saved',refresh);window.removeEventListener('storage',onStorage);};
 },[user.email]);
 const repasseRows=useMemo(()=>consultations.map(item=>{
   const best=chooseBestConfirmedOffer(item.offers,item.costs);
   const selected=consultedFinancialInputsReady(item.costs)?item.offers.find(o=>o.id===item.selectedOfferId&&offerIsEligible(o)):undefined;
   const current=selected?{offer:selected,calculation:calculateConsultedOffer(selected,item.costs)}:best;
   const proposed=moneyNumber(item.proposedBuy);
   return {item,current,proposed,projectedMargin:current&&proposed>0?current.calculation.netBeforeMargin-proposed:null};
 }),[consultations]);
 const repasseEvents=consultations.reduce((n,item)=>n+item.events.length,0);
 const repasseConfirmed=repasseRows.filter(r=>r.current&&r.item.state!=='arquivado').length;
 const repasseOver=repasseRows.filter(r=>r.current&&r.proposed>r.current.calculation.ceiling).length;
 const downloadRepasseReport=(kind:'cases'|'log')=>{
   const csv=kind==='cases'?exportConsultedReportCsv(consultations):exportConsultedLogCsv(consultations);
   const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
   const element=document.createElement('a');element.href=url;
   element.download=kind==='cases'?'motyq-iq-repasses-gerencial.csv':'motyq-iq-repasses-log.csv';
   document.body.appendChild(element);element.click();element.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const [filters,setFilters]=useState<DashboardFilters>({...emptyFilters});
 const inputRef=useRef<HTMLInputElement|null>(null);
 const ready=records.length>0;
 const result=useMemo(()=>ready?filterDashboardRows(records,filters):[],[records,filters,ready]);
 const stats=useMemo(()=>ready?aggregateDashboard(result):null,[result,ready]);
 const metrics=stats||OCT2026_SNAPSHOT;
 const count=metrics.evaluations;
 const purchases=metrics.purchaseCount;
 const ratio=metrics.medianPaidFipe;
 const statusData=metrics.status.map(x=>({name:x.name==='COMPRA'?'Comprados':x.name==='COTACAO'?'Cotações':x.name==='REPASSE PENDENTE'?'Repasse pend.':x.name==='REVISAR'?'Revisar':'Outros',value:x.value}));
 const classes=metrics.classes.filter(x=>x.name!=='NÃO INFORMADA');
 const destination=metrics.destinations.filter(x=>x.name==='SHOWROOM'||x.name==='REPASSE');
 const models=metrics.models.slice(0,10);
 const brands=metrics.brands.slice(0,10);
 const units=metrics.units;
 const timeline=metrics.dates.map(x=>({caption:x.caption,compras:x.purchases,cotacoes:x.quotes}));
 const summaryIndex=purchases+metrics.quoteCount>0?purchases/(purchases+metrics.quoteCount):0;
 const filterActive=ready&&Object.values(filters).some(Boolean);
 const changeFilter=(name:keyof DashboardFilters,value:string)=>setFilters(prev=>({
   ...prev,[name]:value,...(name==='brand'?{model:''}:{})
 }));
 const setFiles=async(file:File|undefined)=>{
   if(!file)return;
   if(file.size>18*1024*1024){setError('Arquivo acima de 18 MB. Exporte a planilha de avaliações em formato XLS/XLSX mais compacto.');return;}
   setError('');setBusy(true);
   try {
     const XLSX=await import('xlsx');
     const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
     const selected=workbook.SheetNames.find(name=>name.trim().toUpperCase()==='BASE')||
       workbook.SheetNames.find(name=>name.trim().toLowerCase()==='worksheet')||workbook.SheetNames[0];
     const worksheet=workbook.Sheets[selected];
     if(!worksheet)throw Error('A planilha não contém uma aba legível.');
     const input=XLSX.utils.sheet_to_json<Record<string,unknown>>(worksheet,{defval:null,raw:true});
     const source=Object.keys(input[0]||{}).some(k=>k.toLowerCase().includes('situação analítica'))?'filtered':'original';
     const parsed=parseDashboardData(input,source);
     if(!parsed.rows.length)throw Error('Nenhuma avaliação de automóvel válida foi identificada no arquivo.');
     // Only de-identified vehicle/financial fields are persisted. Nothing is uploaded.
     const compact=JSON.stringify(parsed.rows);
     if(compact.length>4000000)throw Error('A base ficou grande para o armazenamento local. Divida o período em arquivos menores.');
     localStorage.setItem(storageKey,compact);
     localStorage.setItem(storageKey+'-name',file.name);
     setRecords(parsed.rows);setSourceName(file.name);setImportInfo(parsed);
     setFilters({...emptyFilters});setTab('overview');
   }catch(e:any){setError(e?.message||'Não foi possível ler a planilha.');}
   finally{setBusy(false);if(inputRef.current)inputRef.current.value='';}
 };
 const clear=()=>{
   localStorage.removeItem(storageKey);localStorage.removeItem(storageKey+'-name');
   setRecords([]);setSourceName('');setImportInfo(null);setFilters({...emptyFilters});setError('');setTab('overview');
 };
 const download=()=>{
   if(!ready)return;
   const rows=[['Mês','Loja','Marca','Modelo','Classe','Destino','Situação','Valor avaliado/pago','Preparo previsto','FIPE','Referência Web','KM','Ano-modelo']];
   for(const r of result){
     rows.push([r.month,r.store,r.brand,r.model,r.className,r.destination,r.status,
       String(r.value),String(r.preparation),String(r.fipe),String(r.webReference),String(r.km),String(r.year)]);
   }
   const csv='\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
   const link=document.createElement('a');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
   link.href=url;link.download='motyq-iq-analise-filtrada.csv';link.click();URL.revokeObjectURL(url);
 };
 const chartTooltip=(value:any,name:any)=>[fmtInt(Number(value)||0),String(name)];
 return <div className="space-y-5">
  <div className="relative overflow-hidden rounded-3xl bg-[#132a3a] px-5 py-6 text-white md:px-7 md:py-8">
    <div className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full bg-cyan-500/15 blur-2xl"/>
    <div className="pointer-events-none absolute -bottom-20 right-24 h-44 w-44 rounded-full bg-indigo-400/15 blur-2xl"/>
    <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
      <div>
       <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-cyan-300"><Activity size={15}/> Inteligência de aquisições · Motyq IQ</div>
       <h2 className="text-2xl font-black tracking-tight md:text-3xl">Painel gerencial da Mesa</h2>
       <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Compras efetivas, cotações, capital aplicado e padrões de precificação. Uma leitura da operação para tomar decisões melhores.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black text-slate-900 transition hover:bg-cyan-50">
          <UploadCloud size={17}/>{busy?'Lendo planilha...':ready?'Atualizar planilha':'Importar planilha'}
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm" className="hidden" disabled={busy}
            onChange={e=>void setFiles(e.target.files?.[0])}/>
        </label>
        {ready&&<button onClick={download} className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-3 text-xs font-bold text-white hover:bg-white/10"><ArrowDownToLine size={15}/>Exportar filtro</button>}
      </div>
    </div>
  </div>
  <div className="flex flex-wrap items-center justify-between gap-2">
    <div className="flex flex-wrap items-center gap-2">
      <Pill tone={ready?'good':'neutral'}>{ready?'Base importada neste navegador':'Resumo consolidado · Outubro 2026'}</Pill>
      {ready?<span className="max-w-xs truncate text-xs text-slate-500">{sourceName||'Arquivo local'} · {fmtInt(records.length)} veículos</span>:
      <span className="text-xs text-slate-500">2.252 automóveis após os filtros de qualidade</span>}
    </div>
    {ready&&<button onClick={clear} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-700"><X size={14}/>Limpar importação</button>}
  </div>
  {error&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</div>}
  {importInfo&&<p className="rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-xs leading-5 text-cyan-900">
    Processamento local concluído: {fmtInt(importInfo.inputCount)} linhas de origem · {fmtInt(importInfo.excludedEvaluator)} registros do avaliador excluído · {fmtInt(importInfo.excludedMotorcycles)} motocicletas excluídas · {fmtInt(importInfo.duplicates)} duplicidades removidas.
    {importInfo.invalidPurchases>0&&<> · {fmtInt(importInfo.invalidPurchases)} compra(s) com valor inválido separada(s) para revisão.</>}
  </p>}
  {!ready&&<div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/70 px-4 py-3 text-xs leading-5 text-indigo-900">
    <strong>O resumo de outubro já está disponível.</strong> Para filtrar todas as unidades, modelos e períodos, use <strong>Importar planilha</strong> acima e selecione o relatório original AutoAvaliar (.xls) ou a planilha filtrada (.xlsx). Os dados são lidos no seu navegador, sem envio ao servidor; somente campos de veículos e valores são guardados localmente.
  </div>}
  {ready&&<div className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className="mb-3 flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><Filter size={16}/>Filtros dinâmicos</h3>
      {filterActive&&<button className="text-xs font-bold text-cyan-700 hover:underline" onClick={()=>setFilters({...emptyFilters})}>Limpar filtros</button>}
    </div>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-7">
      {([['month','Período'],['store','Unidade'],['brand','Marca'],['model','Modelo'],['className','Classe'],['destination','Destino'],['status','Situação']] as [keyof DashboardFilters,string][]).map(([key,label])=><label key={key} className="space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
        <select className={classNameSelect} value={filters[key]} onChange={e=>changeFilter(key,e.target.value)}>
          <option value="">Todos</option>
          {dashboardOptions(records.filter(x=>!filters.brand||key==='brand'||x.brand===filters.brand),key).map(v=>
            <option value={v} key={v}>{v==='COMPRA'?'Comprado':v==='COTACAO'?'Cotado':v}</option>)}
        </select>
      </label>)}
    </div>
    {count===0&&<p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Nenhum veículo corresponde aos filtros selecionados.</p>}
  </div>}
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
    <Metric label="Avaliações" value={fmtInt(count)} detail="Automóveis na seleção" icon={CarFront}/>
    <Metric label="Adquiridos" value={fmtInt(purchases)} detail="UTILIZADO + exceções confirmadas" icon={CheckCircle2} tone="indigo"/>
    <Metric label="Cotações" value={fmtInt(metrics.quoteCount)} detail="Não confirmadas como compras" icon={Clock3} tone="amber"/>
    <Metric label="Capital pago" value={fmtCompact(metrics.totalPaid)} detail="Somente aquisições confirmadas" icon={Wallet} tone="indigo"/>
    <Metric label="Preparo previsto" value={fmtCompact(metrics.preparation)} detail="Estimativa, não gasto realizado" icon={Layers3}/>
    <Metric label="Ticket mediano" value={fmtCompact(metrics.medianPaid)} detail="Preço efetivamente pago" icon={TrendingUp}/>
  </div>
  <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
    {([['overview','Visão geral',BarChart3],['stores','Unidades e modelos',Building2],['quality','Qualidade dos dados',ShieldCheck],['repasses','Repasse sob consulta',HandCoins]] as const).map(([id,label,Icon])=>
      <button key={id} onClick={()=>setTab(id)} className={'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black '+(tab===id?'bg-[#153f51] text-white':'bg-white text-slate-600 hover:bg-slate-100')}><Icon size={15}/>{label}</button>)}
  </div>
  {tab==='overview'&&<div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-5">
      <section className={panelClass+' lg:col-span-2'}>
        <Header title="Funil de avaliações" description="Fotografia dos status da exportação. Cotações não são vendas perdidas."/>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart><Pie data={statusData} dataKey="value" nameKey="name" innerRadius={65} outerRadius={94} paddingAngle={2}>
              {statusData.map((d,i)=><Cell key={d.name} fill={COLORS[i%COLORS.length]}/>)}
            </Pie><Tooltip formatter={chartTooltip}/></PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2">{statusData.map((s,i)=><div key={s.name} className="flex items-center gap-2 text-xs text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{background:COLORS[i]}}/>{s.name}: <strong className="ml-auto text-slate-900">{fmtInt(s.value)}</strong></div>)}</div>
      </section>
      <section className={panelClass+' lg:col-span-3'}>
        <Header title="Aquisições por marca" description="Ranking pelo número de veículos efetivamente comprados."/>
        <div className="h-[325px]"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={brands} layout="vertical" margin={{left:8,right:20,top:5,bottom:3}}>
            <CartesianGrid stroke="#e7edf3" horizontal={false}/><XAxis type="number" tick={{fontSize:11}} allowDecimals={false}/>
            <YAxis dataKey="name" type="category" width={100} tick={{fontSize:10}}/>
            <Tooltip formatter={chartTooltip}/><Bar dataKey="count" name="Comprados" fill="#147d89" radius={[0,5,5,0]} barSize={16}/>
          </BarChart>
        </ResponsiveContainer></div>
      </section>
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <section className={panelClass+' lg:col-span-2'}>
        <Header title="Evolução diária" description="Compras confirmadas e cotações registradas por data de avaliação."/>
        <div className="h-[270px]"><ResponsiveContainer width="100%" height="100%">
          <LineChart data={timeline} margin={{top:6,right:10,bottom:8,left:-20}}>
            <CartesianGrid stroke="#e7edf3" strokeDasharray="3 3"/><XAxis dataKey="caption" tick={{fontSize:10}} interval={Math.max(0,Math.floor(timeline.length/8))}/>
            <YAxis tick={{fontSize:11}} allowDecimals={false}/><Tooltip formatter={chartTooltip}/><Legend wrapperStyle={{fontSize:11}}/>
            <Line type="monotone" dataKey="cotacoes" name="Cotações" stroke="#9aaabc" strokeWidth={2} dot={false}/>
            <Line type="monotone" dataKey="compras" name="Compras" stroke="#147d89" strokeWidth={2.5} dot={{r:2.5}}/>
          </LineChart>
        </ResponsiveContainer></div>
      </section>
      <section className={panelClass}>
        <Header title="Perfil de compra" description="Quanto foi pago em relação à FIPE, por destino. Não equivale à margem de lucro."/>
        <div className="space-y-5 pt-4">
          {destination.map(d=><div key={d.name}>
            <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-slate-700">{d.name==='SHOWROOM'?'Showroom':'Repasse'} <span className="font-normal text-slate-500">({d.count})</span></p><strong className="text-lg text-slate-900">{d.medianFipe?fmtPct(d.medianFipe):'N/D'}</strong></div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-600" style={{width:(d.medianFipe*100)+'%'}}/></div>
          </div>)}
          <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-700"><strong>Índice de status:</strong> {fmtPct(summaryIndex)} das avaliações classificadas como compra ou cotação terminaram com status de compra. Não interpretar como conversão comercial.</div>
        </div>
      </section>
    </div>
  </div>}
  {tab==='stores'&&<div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={panelClass}>
        <Header title="Modelos mais adquiridos" description="Compras confirmadas na seleção. Valores agregados, sem identificação de clientes."/>
        <div className="h-[330px]"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={models} layout="vertical" margin={{left:6,right:18,top:5,bottom:6}}>
            <CartesianGrid stroke="#e7edf3" horizontal={false}/><XAxis type="number" allowDecimals={false} tick={{fontSize:11}}/>
            <YAxis dataKey="name" type="category" width={125} tick={{fontSize:10}}/>
            <Tooltip formatter={chartTooltip}/><Bar dataKey="count" name="Compras" fill="#6366f1" radius={[0,5,5,0]} barSize={16}/>
          </BarChart>
        </ResponsiveContainer></div>
      </section>
      <section className={panelClass}>
        <Header title="Classes de aquisição" description="Comparação da mediana do preço pago sobre a FIPE. Classes com poucos casos precisam de cautela."/>
        <div className="space-y-5 pt-3">{classes.map(x=><div key={x.name}>
          <div className="flex items-center justify-between text-sm"><span className="font-bold text-slate-700">Classe {x.name} <span className="text-xs font-normal text-slate-500">({x.count} compras)</span></span><strong className="text-slate-900">{x.medianFipe?fmtPct(x.medianFipe):'N/D'}</strong></div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{width:(x.medianFipe*100)+'%'}}/></div>
        </div>)}</div>
      </section>
    </div>
    <section className={panelClass}>
      <Header title="Desempenho por unidade" description="Múltiplas unidades no relatório. Índice = compras / (compras + cotações), não taxa de vendas."/>
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] border-collapse text-left text-xs">
        <thead><tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
          <th className="rounded-l-lg px-3 py-3">Unidade</th><th className="px-3 py-3 text-right">Avaliações</th>
          <th className="px-3 py-3 text-right">Compras</th><th className="px-3 py-3 text-right">Cotações</th>
          <th className="px-3 py-3 text-right">Índice status</th><th className="rounded-r-lg px-3 py-3 text-right">Capital pago</th></tr></thead>
        <tbody>{units.slice(0,ready?60:10).map(u=><tr key={u.name} className="border-t border-slate-100 text-slate-700 hover:bg-slate-50">
          <td className="max-w-[250px] px-3 py-3 font-bold text-slate-900">{u.name}</td>
          <td className="px-3 py-3 text-right">{fmtInt(u.evaluations)}</td><td className="px-3 py-3 text-right font-bold text-cyan-800">{fmtInt(u.purchases)}</td>
          <td className="px-3 py-3 text-right">{ready?fmtInt(u.quotes):u.quotes?fmtInt(u.quotes):'—'}</td>
          <td className="px-3 py-3 text-right">{ready?fmtPct(u.index):u.quotes?fmtPct(u.purchases/(u.purchases+u.quotes)):'—'}</td>
          <td className="px-3 py-3 text-right font-semibold">{fmtMoney(u.totalPaid)}</td>
        </tr>)}</tbody>
      </table></div>
      {!ready&&<p className="mt-3 text-[11px] text-slate-500">Resumo de destaque: para o quadro completo de unidades, períodos e modelos, importe a planilha.</p>}
    </section>
  </div>}
  {tab==='quality'&&<div className="space-y-4">
    <div className="grid gap-3 md:grid-cols-3">
      <Metric label="Sem referência Web" value={fmtInt(metrics.missingWeb)} detail="Compras sem comparação Web no arquivo" icon={AlertTriangle} tone="amber"/>
      <Metric label="Preparo zerado" value={fmtInt(metrics.noPreparation)} detail="Compras sem custo previsto registrado" icon={Info} tone="amber"/>
      <Metric label="Repasse pendente" value={fmtInt(metrics.status.find(x=>x.name==='REPASSE PENDENTE')?.value||0)} detail="Status REPASSE não confirma compra" icon={Clock3} tone="indigo"/>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={panelClass}><Header title="O que merece atenção" description="Prioridades para melhorar a qualidade das análises da Mesa."/>
        <div className="space-y-3 text-xs leading-5 text-slate-700">
          <p className="rounded-lg bg-amber-50 p-3"><strong>Referência de mercado:</strong> sem referência Web registrada, não se deve atribuir precisão de anúncio ao teto de compra.</p>
          <p className="rounded-lg bg-amber-50 p-3"><strong>Custos previstos:</strong> valores zerados podem representar ausência de preenchimento, não ausência real de custos.</p>
          <p className="rounded-lg bg-indigo-50 p-3"><strong>Compras fora do status:</strong> a Toro e o Commander são duas compras confirmadas em conversa, embora na exportação apareçam AVALIADO. Revise a atualização do status na origem.</p>
          <p className="rounded-lg bg-slate-50 p-3"><strong>Repasse:</strong> destinação REPASSE e status REPASSE são conceitos diferentes. O status, sozinho, não comprova aquisição.</p>
        </div>
      </section>
      <section className={panelClass}><Header title="Metodologia do painel" description="Regras aplicadas antes de qualquer comparação financeira."/>
        <div className="space-y-3 text-xs leading-5 text-slate-700">
          <p><strong>UTILIZADO:</strong> valor avaliado é o desembolso efetivo, conforme sua confirmação.</p>
          <p><strong>AVALIADO:</strong> cotação, sem compra confirmada.</p>
          <p><strong>Exclusão:</strong> registros do avaliador Daniel Barruchelli da Silva; motocicletas e duplicidades são separados.</p>
          <p><strong>Exceções:</strong> Toro e Commander confirmados manualmente como comprados, apesar do status AVALIADO.</p>
          <p><strong>FIPE:</strong> a razão preço pago/FIPE mede deságio de aquisição. Não revela lucro, custo final ou preço de venda.</p>
          <p><strong>Privacidade:</strong> nenhuma coluna de cliente, telefone, e-mail, placa, documento, chassi ou nome de avaliador é persistida no painel.</p>
          <p><strong>Atualização:</strong> o resumo integrado cobre outubro de 2026; importar um novo arquivo substitui os registros locais.</p>
        </div>
      </section>
    </div>
  </div>}
  {tab==='repasses'&&<div className="space-y-4">
    <div className="grid gap-3 md:grid-cols-4">
      <Metric label="Consultas salvas" value={fmtInt(consultations.length)} detail="Casos locais, não compras efetivadas" icon={HandCoins}/>
      <Metric label="Ofertas confirmadas" value={fmtInt(repasseConfirmed)} detail="Casos com ao menos uma oferta válida" icon={CheckCircle2} tone="indigo"/>
      <Metric label="Propostas acima do teto" value={fmtInt(repasseOver)} detail="Casos para revisão da Mesa" icon={AlertTriangle} tone="amber"/>
      <Metric label="Eventos registrados" value={fmtInt(repasseEvents)} detail="Versões e alterações locais" icon={FileSpreadsheet}/>
    </div>
    <section className={panelClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Header title="Registro gerencial de repasses sob consulta" description="Ofertas obtidas por telefone/WhatsApp, margens variáveis, revisões e teto líquido previsto. Não confundir com repasse efetivado."/>
        <div className="flex flex-wrap gap-2">
          <button disabled={!consultations.length} onClick={()=>downloadRepasseReport('cases')}
           className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40">Exportar resumo CSV</button>
          <button disabled={!consultations.length} onClick={()=>downloadRepasseReport('log')}
           className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40">Exportar log CSV</button>
        </div>
      </div>
      {!consultations.length?<p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        Nenhum repasse sob consulta registrado neste navegador. Abra a aba “Repasse Sob Consulta”, informe as ofertas e salve a negociação.</p>:
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs">
        <thead><tr className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
          <th className="px-3 py-3">Veículo</th><th className="px-3 py-3">Situação</th>
          <th className="px-3 py-3 text-right">Melhor oferta</th><th className="px-3 py-3 text-right">Teto líquido</th>
          <th className="px-3 py-3 text-right">Proposta Mesa</th><th className="px-3 py-3 text-right">Resultado previsto</th><th className="px-3 py-3">Histórico</th>
        </tr></thead>
        <tbody>{repasseRows.map(({item,current,proposed,projectedMargin})=>
          <tr key={item.id} className="border-b border-slate-100 text-slate-700">
            <td className="px-3 py-3"><strong>{item.vehicle.brand} {item.vehicle.model}</strong><p className="mt-1 text-[10px] text-slate-500">{item.vehicle.year} · {item.vehicle.km} km</p></td>
            <td className="px-3 py-3">{item.state==='arquivado'?'Arquivado':current?'Oferta confirmada':'Em consulta'}</td>
            <td className="px-3 py-3 text-right">{current?formatReais(current.calculation.sale):'—'}</td>
            <td className="px-3 py-3 text-right font-bold">{current?formatReais(current.calculation.ceiling):'—'}</td>
            <td className="px-3 py-3 text-right">{proposed?formatReais(proposed):'—'}</td>
            <td className={'px-3 py-3 text-right font-bold '+(projectedMargin!==null&&projectedMargin<0?'text-red-700':'text-slate-900')}>{projectedMargin!==null?formatReais(projectedMargin):'—'}</td>
            <td className="px-3 py-3"><details><summary className="cursor-pointer font-semibold text-cyan-800">v{item.version} · {item.events.length} eventos</summary>
               <div className="mt-2 w-56 space-y-2 rounded-lg bg-slate-50 p-2">
                 {item.events.slice().reverse().slice(0,8).map(e=><div key={e.id} className="border-b border-slate-200 pb-1">
                   <p className="text-[10px] font-bold">{new Date(e.at).toLocaleString('pt-BR')} · {e.action}</p>
                   <p className="text-[10px] text-slate-500">{e.actor}</p>
                   <p className="text-[10px] text-slate-600">{e.changes.join('; ')}</p>
                 </div>)}
               </div>
             </details></td>
          </tr>)}</tbody>
      </table></div>}
      <p className="mt-3 text-[11px] leading-5 text-slate-500">Estes dados são armazenados apenas no navegador deste usuário. Não constituem trilha auditável de servidor, autorização de gerência, compra concluída ou validação fiscal.</p>
    </section>
  </div>}
  <footer className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-cyan-700"/>
    <span>Uso gerencial interno. Base importada processada somente neste dispositivo, sem upload para Vercel, GitHub ou outro servidor. Os números não representam margem de venda, lucro nem conversão comercial. Importações posteriores podem alterar o período e a distribuição por unidade.</span>
  </footer>
 </div>;
}
