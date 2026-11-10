import React,{useEffect,useMemo,useRef,useState} from 'react';
import {auth} from '../firebase';
import type {User} from '../types';
import {archiveMonthlyTotals,parseMonthlyArchive,
 type MonthlyArchiveRow} from '../services/marketIqMonthlyArchive';
import {validPlate} from '../services/marketIqPlateHistory';
import type {MarketIqIncomingFile} from '../services/marketIqSmartImport';

type MonthMeta={month:string;count:number;chunks:number;sourceName:string;importedAt:string;
 withPurchaseDate:number;withWebReference:number;classDifference:number;importedBy:string};
const money=(v:number|null)=>v===null?'—':v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const n=(v:number)=>v.toLocaleString('pt-BR');
const date=(s:string)=>s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—';
const monthName=(s:string)=>{
 if(!/^\d{4}-\d{2}$/.test(s))return s;
 const d=new Date(s+'-01T12:00:00');
 return d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase());
};
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const selectStyle='w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900';
const header='px-3 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600';
const cell='px-3 py-3 text-sm text-slate-800';
const localStatus=(s:string)=>s==='UTILIZADO'?'border-emerald-200 bg-emerald-50 text-emerald-900':
 s==='REPASSE'?'border-amber-300 bg-amber-50 text-amber-950':'border-slate-200 bg-slate-50 text-slate-700';
const limited=(v:string)=>v||'Não informado';

async function archiveRequest(action:string,extra:Record<string,unknown>={},method:'GET'|'POST'='GET'){
 const user=auth.currentUser;
 if(!user)throw Error('Sua sessão expirou. Entre novamente.');
 const token=await user.getIdToken();
 const apiAction='monthly_archive_'+action;
 const url='/api/marketiq-market-scan'+(method==='GET'?'?'+new URLSearchParams({
  action:apiAction,...Object.fromEntries(Object.entries(extra).map(([k,v])=>[k,String(v)]))
 }).toString():'');
 const response=await fetch(url,{
  method,headers:{authorization:'Bearer '+token,...(method==='POST'?{'content-type':'application/json'}:{})},
  ...(method==='POST'?{body:JSON.stringify({action:apiAction,...extra})}:{}),
  cache:'no-store',signal:AbortSignal.timeout(50000)
 });
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(String(payload.error||'Arquivo mensal indisponível.').slice(0,220));
 return payload;
}
export default function MarketIqMonthlyArchivePanel({user,onOpenPlateHistory,incomingFile,onIncomingFileConsumed}:{
 user:User;onOpenPlateHistory?:(plate:string)=>void;
 incomingFile?:MarketIqIncomingFile|null;
 onIncomingFileConsumed?:(token:string)=>void;
}){
 const fileRef=useRef<HTMLInputElement>(null);
 const processedIncomingToken=useRef('');
 const [months,setMonths]=useState<MonthMeta[]>([]);
 const [month,setMonth]=useState('');
 const [rows,setRows]=useState<MonthlyArchiveRow[]>([]);
 const [loading,setLoading]=useState(false);
 const [importing,setImporting]=useState(false);
 const [progress,setProgress]=useState('');
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [search,setSearch]=useState('');
 const [status,setStatus]=useState('');
 const [store,setStore]=useState('');
 const [destination,setDestination]=useState('');
 const [limit,setLimit]=useState(75);
 const [sourceName,setSourceName]=useState('');
 const refreshMonths=async(prefer?:string)=>{
  const info=await archiveRequest('months');
  const list:MonthMeta[]=Array.isArray(info.months)?info.months:[];
  setMonths(list);
  setMonth(prefer||month||list[0]?.month||'');
 };
 const loadMonth=async(selected:string)=>{
  if(!selected){setRows([]);setSourceName('');return;}
  setLoading(true);setError('');
  try{
   const data=await archiveRequest('load',{month:selected});
   setRows(Array.isArray(data.records)?data.records:[]);
   setSourceName(data.manifest?.sourceName||'');
  }catch(e:any){
   setRows([]);setSourceName('');setError(e?.message||'Erro ao carregar o mês.');
  }finally{setLoading(false);}
 };
 useEffect(()=>{refreshMonths().catch(e=>setError(String(e?.message||e)));},[user.email]);
 useEffect(()=>{setSearch('');setStatus('');setStore('');setDestination('');setLimit(75);
  void loadMonth(month);},[month]);
 const importFile=async(file?:File,selectedSheet?:string)=>{
  if(!file||importing)return;
  setError('');setMessage('');setProgress('');
  if(file.size>18*1024*1024){setError('Arquivo acima de 18 MB. Exporte um relatório menor.');return;}
  setImporting(true);
  try{
   setProgress('Lendo as avaliações da planilha...');
   const XLSX=await import('xlsx');
   const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
   const worksheet=book.Sheets[selectedSheet||book.SheetNames[0]];
   if(!worksheet)throw Error('A planilha não contém uma aba de dados.');
   const input=XLSX.utils.sheet_to_json<Record<string,unknown>>(worksheet,{defval:null,raw:true});
   const parsed=parseMonthlyArchive(input);
   if(!parsed.rows.length)throw Error('Nenhuma avaliação válida com ID e data foi encontrada no arquivo.');
   const incomingMonths=Object.keys(parsed.months).sort();
   // Query the authoritative tenant archive immediately before importing.
   // Mount-time month loading may still be pending, so never rely on an empty
   // initial UI state to decide whether an existing month can be replaced.
   const remote=await archiveRequest('months');
   const savedMonths:Array<{month:string}>=Array.isArray(remote.months)?remote.months:[];
   const previous=incomingMonths.filter(m=>savedMonths.some(item=>item.month===m));
   if(previous.length&&
     !window.confirm('Já existe arquivo do(s) mês(es) '+previous.join(', ')+'. Esta importação substituirá a fotografia desse(s) mês(es). Deseja continuar?')){
    setProgress('Importação cancelada. Nenhum arquivo mensal foi alterado.');return;
   }
   const total=parsed.rows.length;
   let saved=0;
   for(const currentMonth of incomingMonths){
    const monthly=parsed.rows.filter(x=>x.month===currentMonth);
    const batchId=crypto.randomUUID();
    const chunks=Math.ceil(monthly.length/150);
    for(let i=0;i<chunks;i++){
     setProgress('Salvando '+monthName(currentMonth)+' · lote '+(i+1)+'/'+chunks+
      ' · '+n(saved)+' de '+n(total)+' avaliações preparadas');
     await archiveRequest('chunk',{
      month:currentMonth,batchId,index:i,rows:monthly.slice(i*150,(i+1)*150)
     },'POST');
     saved+=Math.min(150,monthly.length-i*150);
    }
    setProgress('Validando '+monthName(currentMonth)+' e finalizando a importação...');
    await archiveRequest('commit',{
     month:currentMonth,batchId,chunks,expectedCount:monthly.length,sourceName:file.name
    },'POST');
   }
   await refreshMonths(incomingMonths[incomingMonths.length-1]);
   if(month===incomingMonths[incomingMonths.length-1])await loadMonth(month);
   setMessage(n(total)+' avaliações arquivadas em '+incomingMonths.length+
    ' mês(es). IDs repetidos no Excel: '+parsed.duplicates+
    '. Linhas sem ID/data válidos: '+parsed.invalid+
    '. Valor avaliado não foi tratado como preço efetivamente pago.');
   setProgress('');
  }catch(e:any){
   setError('Importação não concluída: '+String(e?.message||'falha desconhecida')+
    '. O mês anterior permanece acessível quando a finalização não ocorreu.');
   setProgress('');
  }finally{setImporting(false);if(fileRef.current)fileRef.current.value='';}
 };
 useEffect(()=>{
  const file=incomingFile;
  if(!file||file.kind!=='evaluations'||processedIncomingToken.current===file.token)return;
  processedIncomingToken.current=file.token;
  onIncomingFileConsumed?.(file.token);
  void importFile(file.file,file.sheet);
 },[incomingFile?.token]);
 const visible=useMemo(()=>{
  const q=normalize(search.trim());
  return rows.filter(r=>
   (!status||r.status===status)&&(!store||r.store===store)&&
   (!destination||r.destination===destination)&&
   (!q||normalize([r.plate,r.id,r.brand,r.model,r.version,r.evaluator].join(' ')).includes(q))
  );
 },[rows,search,status,store,destination]);
 const stores=useMemo(()=>[...new Set(rows.map(r=>r.store).filter(Boolean))]
  .sort((a,b)=>a.localeCompare(b,'pt-BR')),[rows]);
 const statuses=useMemo(()=>[...new Set(rows.map(r=>r.status).filter(Boolean))].sort(),[rows]);
 const destinations=useMemo(()=>[...new Set(rows.map(r=>r.destination).filter(Boolean))].sort(),[rows]);
 const totals=useMemo(()=>archiveMonthlyTotals(visible),[visible]);
 const download=()=>{
  const headings=['ID','Data avaliação','Data compra','Placa','Marca','Modelo','Versão','Fabricação',
   'Ano-modelo','KM','Classe registrada','Classe pela KM','Destino','Situação','Loja','Avaliador',
   'Valor avaliado','FIPE','Referência Web','Gasto previsto'];
  const fields=(r:MonthlyArchiveRow)=>[r.id,r.evaluationDate,r.purchaseDate,r.plate,r.brand,r.model,r.version,
   r.manufacturingYear,r.modelYear,r.km,r.classRecorded,r.classSuggested,r.destination,r.status,r.store,
   r.evaluator,r.assessedValue,r.fipe,r.webReference,r.estimatedCost];
  const escape=(v:unknown)=>{
   const s=String(v??'');
   const safe=/^[=+\-@\t\r]/.test(s)?"'"+s:s;
   return '"'+safe.replace(/"/g,'""')+'"';
  };
  const csv='\uFEFF'+[headings,...visible.map(fields)].map(line=>line.map(escape).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const a=document.createElement('a');a.href=url;a.download='motyq-iq-avaliacoes-'+month+'.csv';
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 };
 return <section className="space-y-5 text-slate-950">
  <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
   <div>
    <h2 className="text-xl font-black">Arquivo mensal de avaliações</h2>
    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">
     Consulte todas as avaliações históricas por mês, placa, veículo, loja e status.
     Cada mês importado fica disponível na nuvem para usuários autorizados da empresa.
    </p>
   </div>
   <div className="flex flex-wrap gap-2">
    <button type="button" disabled={importing} onClick={()=>fileRef.current?.click()}
     className="rounded-lg bg-cyan-800 px-4 py-3 text-sm font-black text-white hover:bg-cyan-900 disabled:opacity-50">
     {importing?'Importando...':'Importar Excel (.xlsx)'}
    </button>
    <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm"
     className="hidden" disabled={importing}
     onChange={e=>void importFile(e.target.files?.[0])}/>
    <button type="button" disabled={importing||loading||!visible.length}
     onClick={download} className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 disabled:opacity-40">
     Exportar resultado
    </button>
   </div>
  </div>
  {progress&&<p role="status" className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold text-cyan-950">{progress}</p>}
  {message&&<p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-950">{message}</p>}
  {error&&<p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">{error}</p>}
  <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
   <label className="text-xs font-bold text-slate-700">Mês da avaliação
    <select className={selectStyle+' mt-1'} value={month} disabled={loading||importing}
     onChange={e=>setMonth(e.target.value)}>
     {!months.length&&<option value="">Nenhum mês importado</option>}
     {months.map(m=><option key={m.month} value={m.month}>{monthName(m.month)} · {n(m.count)}</option>)}
    </select>
   </label>
   <label className="text-xs font-bold text-slate-700">Situação registrada no arquivo
    <select className={selectStyle+' mt-1'} value={status} onChange={e=>{setStatus(e.target.value);setLimit(75);}}>
     <option value="">Todas as situações</option>{statuses.map(s=><option key={s} value={s}>{s}</option>)}
    </select>
   </label>
   <label className="text-xs font-bold text-slate-700">Loja da avaliação
    <select className={selectStyle+' mt-1'} value={store} onChange={e=>{setStore(e.target.value);setLimit(75);}}>
     <option value="">Todas as lojas</option>{stores.map(s=><option key={s} value={s}>{s}</option>)}
    </select>
   </label>
   <label className="text-xs font-bold text-slate-700">Placa, modelo, versão, avaliador ou ID
    <input value={search} onChange={e=>{setSearch(e.target.value);setLimit(75);}}
     placeholder="Ex.: HB20, GJC3A77 ou 116389084" className={selectStyle+' mt-1'}/>
   </label>
   <label className="text-xs font-bold text-slate-700">Destino registrado
    <select value={destination} onChange={e=>{setDestination(e.target.value);setLimit(75);}}
     className={selectStyle+' mt-1'}>
     <option value="">Todos os destinos</option>
     {destinations.map(d=><option key={d} value={d}>{d}</option>)}
    </select>
   </label>
   <div className="flex items-end">
    <button type="button" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800"
     onClick={()=>{setStatus('');setStore('');setDestination('');setSearch('');setLimit(75);}}>
     Limpar filtros
    </button>
   </div>
  </div>
  {!months.length&&!loading?<div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
   <h3 className="text-lg font-bold">Comece pelo relatório de outubro de 2026</h3>
   <p className="mx-auto mt-2 max-w-lg text-sm text-slate-700">
    Importe o Excel exportado do AutoAvaliar. A importação é organizada pela data da avaliação,
    sem duplicar IDs e sem enviar o arquivo original ou os dados pessoais de clientes.
   </p>
  </div>:<>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {[
     ['Avaliações encontradas',n(totals.evaluations)],
     ['Com data de compra',n(totals.withPurchaseDate)],
     ['Com referência Web',n(totals.withWebReference)],
     ['Classe original diferente da faixa KM',n(totals.classDifference)]
    ].map(([label,value])=><div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
     <p className="text-xs font-bold text-slate-600">{label}</p>
     <p className="mt-1 text-2xl font-black">{value}</p>
    </div>)}
   </div>
   <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
    <strong>Valores sem confusão:</strong> “Valor avaliado” é a proposta registrada, “Referência Web” é preço anunciado
    e “Data de compra” é um evento de histórico. O relatório não informa o preço efetivamente pago,
    portanto não inventamos valor de compra nem margem. A classe original também não é alterada retroativamente.
   </div>
   <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
     <div>
      <p className="text-sm font-bold">{loading?'Carregando mês...':n(visible.length)+' avaliações neste filtro'}</p>
      <p className="text-xs text-slate-600">{sourceName?'Fonte: '+sourceName:'Arquivo mensal'} · {monthName(month)}</p>
     </div>
     <p className="text-xs text-slate-600">Detalhes completos de cada avaliação: abrir “Consultar”</p>
    </div>
    <div className="overflow-x-auto">
     <table className="w-full min-w-[1120px] border-collapse text-left">
      <thead className="bg-slate-50"><tr>
       <th className={header}>Data</th><th className={header}>Veículo / placa</th>
       <th className={header}>Loja</th><th className={header}>Situação</th>
       <th className={header}>KM / classe</th><th className={header+' text-right'}>Valor avaliado</th>
       <th className={header+' text-right'}>FIPE</th><th className={header+' text-right'}>Ref. Web</th>
       <th className={header}>Detalhes</th>
      </tr></thead>
      <tbody>
       {visible.slice(0,limit).map(r=><tr key={r.id} className="border-t border-slate-200 align-top hover:bg-slate-50">
        <td className={cell}>{date(r.evaluationDate)}{r.purchaseDate&&<p className="mt-1 text-xs text-slate-600">Compra: {date(r.purchaseDate)}</p>}</td>
        <td className={cell}><p className="font-bold">{r.brand} {r.model}</p>
         <p className="mt-1 max-w-[255px] truncate text-xs text-slate-600" title={r.version}>{r.version||'Versão não informada'}</p>
         <p className="mt-1 text-xs font-bold">{r.plate||'Sem placa'} · {r.modelYear||'—'}</p></td>
        <td className={cell}>{limited(r.store)}</td>
        <td className={cell}><span className={'inline-flex rounded-md border px-2 py-1 text-xs font-bold '+localStatus(r.status)}>{limited(r.status)}</span>
         <p className="mt-1 text-xs text-slate-600">{limited(r.destination)}</p></td>
        <td className={cell}><strong>{r.km===null?'—':n(r.km)+' km'}</strong>
         <p className="mt-1 text-xs text-slate-700">Original: {r.classRecorded||'—'} · KM: {r.classSuggested||'—'}</p></td>
        <td className={cell+' text-right font-bold'}>{money(r.assessedValue)}</td>
        <td className={cell+' text-right'}>{money(r.fipe)}</td>
        <td className={cell+' text-right'}>{money(r.webReference)}</td>
        <td className={cell}>
         {onOpenPlateHistory&&validPlate(r.plate)&&<button type="button"
          className="mb-2 w-full rounded-lg border border-sky-700 bg-sky-50 px-2 py-2 text-xs font-bold text-sky-950 hover:bg-sky-100"
          onClick={()=>onOpenPlateHistory(r.plate)}>Histórico da placa</button>}
         <details className="group min-w-[75px]"><summary className="cursor-pointer rounded-lg border border-cyan-700 px-3 py-2 text-center text-xs font-bold text-cyan-900">Consultar</summary>
          <div className="mt-3 min-w-[245px] space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800">
           <p><strong>ID:</strong> {r.id}</p>
           <p><strong>Fabricação / modelo:</strong> {r.manufacturingYear||'—'} / {r.modelYear||'—'}</p>
           <p><strong>Destino:</strong> {limited(r.destination)}</p>
           <p><strong>Classe no arquivo:</strong> {r.classRecorded||'—'}</p>
           <p><strong>Classe sugerida hoje pela KM:</strong> {r.classSuggested||'—'}</p>
           <p><strong>Preparo previsto:</strong> {money(r.estimatedCost)}</p>
           <p><strong>Cor:</strong> {r.color||'—'}</p>
           <p><strong>Avaliador:</strong> {r.evaluator||'—'}</p>
           <p><strong>Vendedor:</strong> {r.seller||'—'}</p>
           <p><strong>Código FIPE:</strong> {r.fipeCode||'—'}</p>
           <p><strong>Tipo:</strong> {r.vehicleType==='motorcycle'?'Motocicleta':'Automóvel'}</p>
          </div>
         </details>
        </td>
       </tr>)}
      </tbody>
     </table>
     {!loading&&visible.length===0&&<p className="px-4 py-7 text-center text-sm font-semibold text-slate-600">
      Nenhuma avaliação localizada com estes filtros.
     </p>}
    </div>
    {visible.length>limit&&<div className="flex justify-center border-t border-slate-200 p-4">
     <button type="button" onClick={()=>setLimit(x=>x+75)}
      className="rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white">
      Exibir mais 75 · {n(visible.length-limit)} restantes
     </button>
    </div>}
   </div>
  </>}
  <p className="text-xs leading-5 text-slate-600">
   Arquivo exclusivo para consulta. A importação de um mês completo substitui a fotografia anterior desse mês,
   preservando a separação por empresa. Nunca altera avaliações operacionais, valores aprovados ou o aprendizado de compras pagas.
  </p>
 </section>;
}
