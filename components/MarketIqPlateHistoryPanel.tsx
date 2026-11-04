import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ArrowDownRight,ArrowUpRight,History,Search,ShieldAlert} from 'lucide-react';
import {CartesianGrid,Line,LineChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {auth} from '../firebase';
import type {User} from '../types';
import type {MonthlyArchiveRow} from '../services/marketIqMonthlyArchive';
import {buildPlateHistory,normalizePlate,validPlate} from '../services/marketIqPlateHistory';

const money=(value:number|null)=>value===null?'Não informado':
 new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value);
const numeral=(value:number)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(value);
const formatDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?
 value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'—';
const deltaMoney=(value:number|null)=>value===null?'Sem comparação':
 (value>0?'+':'')+money(value);
const deltaKm=(value:number|null)=>value===null?'Sem comparação':
 (value>0?'+':'')+numeral(value)+' km';
const textTone=(value:number|null)=>value===null?'text-slate-600':value>0?'text-blue-800':
 value<0?'text-amber-900':'text-slate-700';
const badge=(value:string)=>value==='UTILIZADO'?'bg-emerald-50 border-emerald-300 text-emerald-950':
 value==='REPASSE'?'bg-amber-50 border-amber-300 text-amber-950':
 'bg-slate-50 border-slate-300 text-slate-800';

async function fetchPlateHistory(plate:string):Promise<{records:MonthlyArchiveRow[];monthsScanned:number;monthsMatched:number}>{
 const current=auth.currentUser;
 if(!current)throw Error('Sessão não encontrada. Entre novamente no Motyq.');
 const token=await current.getIdToken();
 const result=await fetch('/api/marketiq-market-scan',{
  method:'POST',cache:'no-store',
  headers:{'content-type':'application/json',authorization:'Bearer '+token},
  body:JSON.stringify({action:'monthly_archive_plate_history',plate}),
  signal:AbortSignal.timeout(50000)
 });
 const json=await result.json().catch(()=>({}));
 if(!result.ok)throw Error(String(json.error||'Não foi possível consultar o histórico por placa.'));
 return {
  records:Array.isArray(json.records)?json.records:[],
  monthsScanned:Number(json.monthsScanned)||0,
  monthsMatched:Number(json.monthsMatched)||0
 };
}

export default function MarketIqPlateHistoryPanel({
 user,initialPlate='',onOpenArchive
}:{user:User;initialPlate?:string;onOpenArchive?:()=>void}){
 const [plateInput,setPlateInput]=useState(normalizePlate(initialPlate));
 const [searchedPlate,setSearchedPlate]=useState('');
 const [rows,setRows]=useState<MonthlyArchiveRow[]>([]);
 const [monthsScanned,setMonthsScanned]=useState(0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [searched,setSearched]=useState(false);
 const requestSequence=useRef(0);
 const lookup=async(raw:string)=>{
  const plate=normalizePlate(raw);
  if(!validPlate(plate)){
   setError('Informe uma placa brasileira válida, como ABC1234 ou ABC1D23.');
   setSearchedPlate('');setRows([]);setSearched(false);return;
  }
  const seq=++requestSequence.current;
  setError('');setBusy(true);setRows([]);setSearched(false);setSearchedPlate('');
  try{
   const result=await fetchPlateHistory(plate);
   if(seq!==requestSequence.current)return;
   setRows(result.records);setMonthsScanned(result.monthsScanned);
   setSearchedPlate(plate);setSearched(true);
  }catch(e:any){
   if(seq!==requestSequence.current)return;
   setError(String(e?.message||'Falha ao consultar o histórico por placa.'));
  }finally{
   if(seq===requestSequence.current)setBusy(false);
  }
 };
 useEffect(()=>{
  if(validPlate(initialPlate)){
   const normalized=normalizePlate(initialPlate);
   setPlateInput(normalized);
   void lookup(normalized);
  }
  return ()=>{requestSequence.current++;};
 },[initialPlate,user.email]);
 const insight=useMemo(()=>buildPlateHistory(rows,searchedPlate),[rows,searchedPlate]);
 const chart=useMemo(()=>[...insight.entries].reverse()
  .filter(x=>typeof x.record.assessedValue==='number'&&x.record.assessedValue>0)
  .map(x=>({label:formatDate(x.record.evaluationDate).slice(0,5)+'/'+x.record.evaluationDate.slice(2,4),
   assessed:x.record.assessedValue,id:x.record.id})),[insight]);
 const difference=insight.assessedTotalDeltaPct;
 return <section className="space-y-5 text-slate-950" aria-label="Histórico inteligente por placa">
  <div className="rounded-xl border border-sky-200 bg-white p-5">
   <div className="flex flex-wrap items-start justify-between gap-4">
    <div className="max-w-3xl">
     <h2 className="flex items-center gap-2 text-xl font-black"><History size={24} className="text-sky-800"/> Histórico Inteligente por Placa</h2>
     <p className="mt-2 text-sm leading-6 text-slate-700">
      Encontre todas as passagens de um veículo na Mesa, mesmo em meses diferentes. Compare os valores
      avaliados, a quilometragem, a classificação e o destino comercial registrados em cada ocasião.
     </p>
    </div>
    {onOpenArchive&&<button type="button" onClick={onOpenArchive}
     className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800">
     Abrir Arquivo Mensal
    </button>}
   </div>
   <form onSubmit={e=>{e.preventDefault();void lookup(plateInput);}}
    className="mt-5 flex max-w-2xl flex-wrap items-end gap-3">
    <label className="min-w-[205px] flex-1 text-sm font-bold">Placa do veículo
     <input value={plateInput} maxLength={7}
      onChange={e=>{setPlateInput(normalizePlate(e.target.value));setError('');}}
      className="mt-1 w-full rounded-lg border border-slate-400 bg-white px-4 py-3 font-bold uppercase tracking-widest text-slate-950"
      placeholder="ABC1D23" autoComplete="off" aria-label="Placa a pesquisar"/>
    </label>
    <button type="submit" disabled={busy}
     className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-800 px-6 py-3.5 text-sm font-black text-white hover:bg-sky-900 disabled:opacity-50">
     <Search size={17}/>{busy?'Consultando...':'Buscar histórico'}
    </button>
   </form>
   <p className="mt-3 text-xs text-slate-600">
    A busca consulta somente os meses já importados no Arquivo Mensal da sua empresa.
    Ela não consulta bases nacionais de histórico veicular.
   </p>
  </div>
  {error&&<p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">{error}</p>}
  {busy&&<p role="status" className="rounded-lg border border-cyan-200 bg-cyan-50 p-4 text-sm font-bold text-cyan-950">Consultando os arquivos mensais autorizados...</p>}
  {searched&&!busy&&<div className="space-y-5">
   <div className="rounded-xl border border-slate-200 bg-white p-4">
    <p className="text-sm font-bold">Placa {searchedPlate} · {numeral(insight.recordsCount)} avaliação(ões) encontrada(s)</p>
    <p className="mt-1 text-xs text-slate-700">
     {insight.monthsCount} mês(es) com ocorrência em {monthsScanned} arquivo(s) mensal(is) consultado(s).
     A ausência de registro não garante ausência de histórico em outras fontes.
    </p>
   </div>
   {insight.recordsCount===0?<div className="rounded-xl border border-dashed border-slate-300 bg-white p-7">
    <p className="font-bold text-slate-800">Nenhuma avaliação localizada para esta placa.</p>
    <p className="mt-2 text-sm text-slate-600">
     Confira a placa e importe os relatórios mensais disponíveis na aba Arquivo Mensal para ampliar a consulta.
    </p>
   </div>:<>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
     <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-bold text-slate-600">Passagens registradas</p>
      <p className="mt-1 text-2xl font-black">{numeral(insight.recordsCount)}</p>
      <p className="mt-1 text-xs text-slate-600">{insight.monthsCount} mês(es) distintos</p>
     </div>
     <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-bold text-slate-600">Último valor avaliado</p>
      <p className="mt-1 text-2xl font-black">{money(insight.latestAssessedValue)}</p>
      <p className="mt-1 text-xs text-slate-600">Proposta, não valor pago</p>
     </div>
     <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-bold text-slate-600">Mudança entre valores registrados</p>
      <p className={'mt-1 text-2xl font-black '+textTone(insight.assessedTotalDelta)}>
       {deltaMoney(insight.assessedTotalDelta)}
      </p>
      <p className="mt-1 text-xs text-slate-600">
       {difference===null?'Amostra insuficiente':(difference>0?'+':'')+difference.toFixed(1).replace('.',',')+'%'} desde a primeira proposta válida
      </p>
     </div>
     <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-bold text-slate-600">Alertas para conferência</p>
      <p className="mt-1 text-2xl font-black">{numeral(insight.warningCount)}</p>
      <p className="mt-1 text-xs text-slate-600">Possíveis divergências, não laudo ou fraude</p>
     </div>
    </div>
    {insight.recordsCount>1&&<div className="rounded-xl border border-cyan-200 bg-white p-4">
     <h3 className="text-base font-bold">Comparação entre as passagens</h3>
     <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <p className="rounded-lg bg-slate-50 p-3 text-sm"><strong>Primeira:</strong> {formatDate(insight.firstDate)}</p>
      <p className="rounded-lg bg-slate-50 p-3 text-sm"><strong>Mais recente:</strong> {formatDate(insight.latestDate)}</p>
      <p className="rounded-lg bg-slate-50 p-3 text-sm"><strong>Mudança total de KM:</strong> {deltaKm(insight.kmTotalDelta)}</p>
     </div>
    </div>}
    {chart.length>=2&&<div className="rounded-xl border border-slate-200 bg-white p-4">
     <h3 className="text-base font-bold">Evolução do valor avaliado</h3>
     <p className="mt-1 text-xs text-slate-600">Cada ponto representa uma proposta registrada, sem confirmação de compra ou pagamento.</p>
     <div className="mt-4 h-56 w-full" role="img" aria-label="Gráfico das avaliações financeiras registradas ao longo do tempo">
      <ResponsiveContainer width="100%" height="100%">
       <LineChart data={chart} margin={{top:8,right:22,left:8,bottom:6}}>
        <CartesianGrid strokeDasharray="3 3" stroke="#dbe4ec"/>
        <XAxis dataKey="label" tick={{fontSize:11,fill:'#475569'}}/>
        <YAxis width={72} tick={{fontSize:11,fill:'#475569'}}
         tickFormatter={(value:number)=>'R$ '+numeral(value)}/>
        <Tooltip formatter={(value)=>money(Number(value))} labelFormatter={label=>'Avaliação em '+label}/>
        <Line dataKey="assessed" name="Valor avaliado" type="linear"
         stroke="#0e7490" strokeWidth={3} dot={{r:4}} activeDot={{r:6}}/>
       </LineChart>
      </ResponsiveContainer>
     </div>
    </div>}
    <div className="space-y-3">
     <h3 className="text-lg font-black">Linha do tempo da placa {searchedPlate}</h3>
     {insight.entries.map(({record:r,previous,assessedDelta,assessedDeltaPct,kmDelta,alerts})=>
      <article key={r.month+'|'+r.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
       <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div>
         <p className="text-base font-black">{formatDate(r.evaluationDate)} · {r.brand} {r.model}</p>
         <p className="mt-1 text-xs text-slate-600">{r.version||'Versão não informada'} · {r.modelYear||'Ano não informado'} · ID {r.id}</p>
        </div>
        <span className={'rounded-lg border px-3 py-1.5 text-xs font-black '+badge(r.status)}>
         {r.status||'Sem status'}
        </span>
       </div>
       <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div><p className="text-xs font-bold text-slate-600">Valor avaliado</p>
         <p className="mt-1 text-lg font-black">{money(r.assessedValue)}</p>
         {previous&&<p className={'mt-1 text-xs font-semibold '+textTone(assessedDelta)}>
          {deltaMoney(assessedDelta)} {assessedDeltaPct!==null&&'('+((assessedDeltaPct>0?'+':'')+assessedDeltaPct.toFixed(1).replace('.',',')+'%')+')'} frente à anterior
         </p>}
        </div>
        <div><p className="text-xs font-bold text-slate-600">KM informada</p>
         <p className="mt-1 text-lg font-black">{r.km===null?'—':numeral(r.km)+' km'}</p>
         {previous&&<p className={'mt-1 text-xs font-semibold '+(kmDelta!==null&&kmDelta< -500?'text-red-800':'text-slate-600')}>
          {deltaKm(kmDelta)} frente à anterior
         </p>}
        </div>
        <div><p className="text-xs font-bold text-slate-600">Classe registrada</p>
         <p className="mt-1 text-lg font-black">{r.classRecorded||'Não informada'}</p>
         <p className="mt-1 text-xs text-slate-600">Classe atual sugerida pela KM: {r.classSuggested||'—'}</p>
        </div>
        <div><p className="text-xs font-bold text-slate-600">Destino registrado</p>
         <p className="mt-1 text-lg font-black">{r.destination||'Não informado'}</p>
         <p className="mt-1 text-xs text-slate-600">{r.store||'Loja não informada'}</p>
        </div>
       </div>
       {alerts.length>0&&<div className="mx-4 mb-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3">
        {alerts.map(a=><p key={a.kind} className={'flex items-start gap-2 text-xs font-semibold '+(a.severity==='warning'?'text-amber-950':'text-slate-700')}>
         {a.severity==='warning'?<ShieldAlert size={14} className="mt-0.5 shrink-0"/>:
         a.kind==='class_change'?<ArrowUpRight size={14} className="mt-0.5 shrink-0"/>:<ArrowDownRight size={14} className="mt-0.5 shrink-0"/>}
         {a.message}
        </p>)}
       </div>}
       <details className="mx-4 mb-4 rounded-lg border border-slate-200 bg-slate-50">
        <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-sky-900">Mais dados desta avaliação</summary>
        <div className="grid gap-2 border-t border-slate-200 p-4 text-sm text-slate-800 sm:grid-cols-2">
         <p><strong>FIPE:</strong> {money(r.fipe)}</p>
         <p><strong>Referência Web:</strong> {money(r.webReference)}</p>
         <p><strong>Preparo previsto:</strong> {money(r.estimatedCost)}</p>
         <p><strong>Data de compra informada:</strong> {formatDate(r.purchaseDate)}</p>
         <p><strong>Avaliador:</strong> {r.evaluator||'Não informado'}</p>
         <p><strong>Fabricação/modelo:</strong> {r.manufacturingYear||'—'}/{r.modelYear||'—'}</p>
         <p><strong>Cor:</strong> {r.color||'—'}</p>
         <p><strong>Tipo:</strong> {r.vehicleType==='motorcycle'?'Moto':'Automóvel'}</p>
        </div>
       </details>
      </article>
     )}
    </div>
   </>}
  </div>}
  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
   <strong>Interpretação responsável:</strong> diferenças de preço, KM, classe ou destino são sinais para conferir,
   não prova de fraude ou erro. “Valor avaliado” não comprova compra efetiva nem margem.
   A consulta não modifica avaliações históricas e não substitui vistoria cautelar.
  </p>
 </section>;
}
