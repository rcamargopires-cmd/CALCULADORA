import React,{useEffect,useRef,useState} from 'react';
import {ExternalLink,Search,ShieldCheck,AlertTriangle,Plus,Trash2} from 'lucide-react';
import {type RadarFipeQuote,type RadarWebmotorsListing,validatedRadarFipe,radarTrim} from '../services/marketIqPurchaseEvidence';
type Item={code:string;name:string};
type Props={
 vehicle:{brand:string;model:string;year:string;vehicleType:'car'|'motorcycle'};
 quote:RadarFipeQuote|null;onQuote:(value:RadarFipeQuote|null)=>void;
 listings:RadarWebmotorsListing[];onListings:(value:RadarWebmotorsListing[])=>void;
};
const input="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-950";
const empty=():RadarWebmotorsListing=>({url:'',price:0,km:0,title:'',checked:false});
const modelYear=(year:string)=>Number((String(year).match(/(?:19|20)\d{2}/g)||[]).at(-1)||0);
export default function MarketIqPurchaseSourcesPanel({vehicle,quote,onQuote,listings,onListings}:Props){
 const [brands,setBrands]=useState<Item[]>([]);
 const [models,setModels]=useState<Item[]>([]);
 const [years,setYears]=useState<Item[]>([]);
 const [brandCode,setBrandCode]=useState('');
 const [modelCode,setModelCode]=useState('');
 const [yearCode,setYearCode]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const abortRef=useRef<AbortController|null>(null);
 useEffect(()=>()=>abortRef.current?.abort(),[]);
 const request=async(action:string,params:Record<string,string>)=>{
  abortRef.current?.abort();
  const controller=new AbortController();abortRef.current=controller;
  setBusy(true);setError('');
  try{
   const query=new URLSearchParams({action,vehicleType:vehicle.vehicleType,...params});
   const response=await fetch('/api/marketiq-fipe?'+query.toString(),{
    signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw Error(response.status===429?'FIPE temporariamente limitada (429). Evite tentativas repetidas.':
    'Consulta FIPE indisponível (HTTP '+response.status+').');
   return await response.json();
  }catch(e:any){
   if(e?.name!=='AbortError')setError(String(e?.message||'Falha na consulta FIPE.'));
   return null;
  }finally{if(!controller.signal.aborted)setBusy(false);}
 };
 const start=async()=>{
  const response=await request('brands',{});
  if(response?.items&&Array.isArray(response.items))setBrands(response.items);
 };
 const chooseBrand=async(code:string)=>{
  setBrandCode(code);setModelCode('');setYearCode('');setModels([]);setYears([]);onQuote(null);
  if(!code)return;
  const response=await request('models',{brandCode:code});
  if(response?.items&&Array.isArray(response.items))setModels(response.items);
 };
 const chooseModel=async(code:string)=>{
  setModelCode(code);setYearCode('');setYears([]);onQuote(null);
  if(!code)return;
  const response=await request('years',{brandCode,modelCode:code});
  if(response?.items&&Array.isArray(response.items))setYears(response.items);
 };
 const lookup=async()=>{
  if(!brandCode||!modelCode||!yearCode||busy)return;
  const response=await request('detail',{brandCode,modelCode,yearCode});
  if(!response)return;
  const expected=modelYear(vehicle.year);
  const found=validatedRadarFipe(response,expected);
  if(!found){
   onQuote(null);setError('A FIPE retornada não corresponde ao ano-modelo esperado ou possui dados inválidos.');
   return;
  }
  const targetTrim=radarTrim(vehicle.model),actualTrim=radarTrim(found.model);
  if(targetTrim&&targetTrim!==actualTrim){
   onQuote(null);setError('A versão FIPE selecionada ('+found.model+
    ') não corresponde ao acabamento '+targetTrim.toUpperCase()+
    ' identificado no Dealer. Confira a versão antes de continuar.');
   return;
  }
  onQuote(found);
 };
 const setListing=(index:number,change:Partial<RadarWebmotorsListing>)=>{
  onListings(listings.map((item,i)=>i===index?{...item,...change,checked:false}:item));
 };
 return <section className="rounded-xl border border-cyan-200 bg-white p-4 shadow-sm">
  <h3 className="text-base font-black text-slate-950">Fontes para precificação: FIPE e Webmotors</h3>
  <p className="mt-1 text-xs leading-5 text-slate-600">O arquivo Dealer não contém cotação FIPE. Selecione a versão exata e confira anúncios individuais. Nenhum dado digitado aqui é salvo em avaliações ou enviado ao Firestore.</p>
  <div className="mt-4 grid gap-4 lg:grid-cols-2">
   <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <strong className="text-sm text-slate-900">Tabela FIPE · consulta por versão</strong>
     <button type="button" disabled={busy} onClick={()=>void start()}
      className="rounded-lg border border-cyan-600 bg-white px-3 py-2 text-xs font-bold text-cyan-950 disabled:opacity-50">
      {busy?'Consultando...':brands.length?'Atualizar catálogo':'Consultar FIPE'}
     </button>
    </div>
    <p className="mt-1 text-xs text-slate-600">Ano-modelo esperado: <strong>{modelYear(vehicle.year)||'Não identificado'}</strong>. Não selecionaremos uma versão automaticamente.</p>
    {brands.length>0&&<div className="mt-3 space-y-2">
     <label className="block text-xs font-semibold text-slate-700">Marca
      <select className={input} value={brandCode} onChange={e=>void chooseBrand(e.target.value)}>
       <option value="">Selecione a marca</option>
       {brands.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
      </select>
     </label>
     {models.length>0&&<label className="block text-xs font-semibold text-slate-700">Modelo e versão FIPE
      <select className={input} value={modelCode} onChange={e=>void chooseModel(e.target.value)}>
       <option value="">Selecione a versão exata</option>
       {models.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
      </select>
     </label>}
     {years.length>0&&<label className="block text-xs font-semibold text-slate-700">Ano-modelo e combustível
      <select className={input} value={yearCode} onChange={e=>{setYearCode(e.target.value);onQuote(null);}}>
       <option value="">Selecione ano/combustível</option>
       {years.filter(item=>String(item.code).startsWith(modelYear(vehicle.year)+'-')||
        item.name.includes(String(modelYear(vehicle.year)))).map(item=>
        <option key={item.code} value={item.code}>{item.name}</option>)}
      </select>
     </label>}
     <button type="button" disabled={!brandCode||!modelCode||!yearCode||busy}
      onClick={()=>void lookup()} className="rounded-lg bg-cyan-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">
      Consultar valor da versão selecionada
     </button>
    </div>}
    {error&&<p role="alert" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs font-bold text-amber-950">{error}</p>}
    {quote&&<div className="mt-3 rounded-lg border border-cyan-200 bg-white p-3">
     <p className="text-xl font-black text-slate-950">{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(quote.value)}</p>
     <p className="mt-1 text-xs text-slate-700">{quote.brand} · {quote.model} · {quote.year} · {quote.fuel}</p>
     <p className="mt-1 text-xs text-slate-600">FIPE {quote.fipeCode} · {quote.referenceMonth||'Mês não informado'} · {quote.referenceSource}</p>
     <p className={'mt-2 text-xs font-bold '+(quote.referenceStatus==='current'?'text-emerald-800':'text-amber-800')}>
      {quote.referenceStatus==='current'?'Referência do mês atual':
       quote.referenceStatus==='outdated'?'Referência desatualizada':'Referência do mês não confirmada'}
     </p>
    </div>}
   </div>
   <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <strong className="text-sm text-slate-900">Anúncios Webmotors conferidos</strong>
     <button type="button" disabled={listings.length>=8}
      onClick={()=>onListings([...listings,empty()])}
      className="flex items-center gap-1 rounded-lg border border-cyan-600 bg-white px-3 py-2 text-xs font-bold text-cyan-950 disabled:opacity-40">
      <Plus size={14}/> Adicionar anúncio
     </button>
    </div>
    <p className="mt-1 text-xs leading-5 text-slate-600">Informe links individuais com preço e KM e confirme que verificou a versão, ano e condições na página. Uma página de busca não é um anúncio individual.</p>
    {listings.length===0&&<p className="mt-4 text-xs font-semibold text-amber-900">Nenhum anúncio conferido. O teto continua baseado em hipótese do Dealer.</p>}
    <div className="mt-3 max-h-[380px] space-y-3 overflow-y-auto pr-1">
     {listings.map((row,index)=><div key={index} className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex justify-between gap-2">
       <span className="text-xs font-black text-slate-800">Anúncio {index+1}</span>
       <button aria-label={'Remover anúncio '+(index+1)} type="button"
        onClick={()=>onListings(listings.filter((_,i)=>i!==index))}
        className="text-rose-700"><Trash2 size={15}/></button>
      </div>
      <label className="mt-2 block text-xs font-bold text-slate-700">Link individual Webmotors
       <input className={input} type="url" value={row.url} placeholder="https://www.webmotors.com.br/comprar/..."
        onChange={e=>setListing(index,{url:e.target.value.slice(0,500)})}/>
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
       <label className="text-xs font-bold text-slate-700">Preço anunciado (R$)
        <input className={input} type="number" min="1000" max="2000000" value={row.price||''}
         onChange={e=>setListing(index,{price:Number(e.target.value)})}/>
       </label>
       <label className="text-xs font-bold text-slate-700">KM do anúncio
        <input className={input} type="number" min="1" max="999999" value={row.km||''}
         onChange={e=>setListing(index,{km:Number(e.target.value)})}/>
       </label>
      </div>
      <label className="mt-2 block text-xs font-bold text-slate-700">Título/versão anunciada
       <input className={input} value={row.title} placeholder="Versão, motor e câmbio"
        onChange={e=>setListing(index,{title:e.target.value.slice(0,140)})}/>
      </label>
      <label className="mt-2 flex items-start gap-2 text-xs text-slate-700">
       <input type="checkbox" checked={row.checked}
        onChange={e=>onListings(listings.map((item,i)=>i===index?{...item,checked:e.target.checked}:item))}
        className="mt-0.5"/>
       Conferi no anúncio individual: versão, ano-modelo, preço, KM e ausência de informação desabonadora evidente.
      </label>
      {/^https:\/\/(?:www\.)?webmotors\.com\.br\/comprar\//i.test(row.url)&&<a href={row.url} target="_blank"
       rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-cyan-800 underline">
       Abrir anúncio para conferir <ExternalLink size={13}/></a>}
     </div>)}
    </div>
    <p className="mt-2 flex items-start gap-1 text-[11px] leading-5 text-slate-600"><ShieldCheck size={14} className="mt-0.5 shrink-0"/>
     O Motyq valida URL individual, marca, família, ano, KM aproximado, versão e duplicatas. A conferência da condição real continua sendo responsabilidade da Mesa.</p>
   </div>
  </div>
 </section>;
}
