import React,{useEffect,useMemo,useState} from 'react';
type Item={code:string;name:string};
type FipeDetail={value:number;brand:string;model:string;year:number;fuel:string;referenceMonth:string;fipeCode:string};
import {User} from '../types';
import {auth} from '../firebase';
import MarketIqManagementDashboard from './MarketIqManagementDashboard';
import MarketIqConsultedRepasse from './MarketIqConsultedRepasse';
import MarketIqApprovalCenter from './MarketIqApprovalCenter';
import {calculateHistoricalPrice, MOTYQ_HISTORY_MODEL, HistoricalClass} from '../services/marketIqHistoricalPricing';
type Ad={source?:'webmotors'|'olx'|'napista';price:string;km:string;url:string;status:'pending'|'valid'|'excluded';note:string;auto?:boolean;title?:string;catalog?:boolean};
type Saved={id:string;date:string;plate?:string;model:string;year:string;km:string;cost:string;repasse:boolean;ads:Ad[];value:number;provisional?:boolean;referenceName?:string;historicalTarget?:number;historicalClass?:HistoricalClass;brand?:string;brandCode?:string;modelCode?:string;yearCode?:string;fipe?:FipeDetail|null};
const number=(v:string)=>Number(v.replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''))||0;
const money=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const blank=(source:'webmotors'|'olx'='webmotors'):Ad=>({source,price:'',km:'',url:'',status:'pending',note:''});
const isWebmotors=(s:string)=>{try{const u=new URL(s);return u.protocol==='https:'&&(u.hostname==='webmotors.com.br'||u.hostname.endsWith('.webmotors.com.br'));}catch{return false;}};
const isOlx=(s:string)=>{try{const u=new URL(s);return u.protocol==='https:'&&(u.hostname==='olx.com.br'||u.hostname.endsWith('.olx.com.br'));}catch{return false;}};
const isNapista=(s:string)=>{try{const u=new URL(s);return u.protocol==='https:'&&(u.hostname==='napista.com.br'||u.hostname.endsWith('.napista.com.br'));}catch{return false;}};
const portalLink=(a:Ad)=>a.source==='olx'?isOlx(a.url):a.source==='napista'?isNapista(a.url):isWebmotors(a.url);
const validSource=(a:Ad)=>{try{
 const u=new URL(a.url);
 if(!portalLink(a))return false;
 if(a.source==='webmotors')return /^\/comprar\/[^/]+\/[^/]+\/.+\/\d{7,}\/?$/.test(u.pathname);
 if(a.source==='olx')return /(?:-id-|\/item\/|\/d\/)[a-z0-9-]*\d{7,}\/?$/i.test(u.pathname);
 return false;
}catch{return false;}};
export default function ManualPricingWorkspace({user}:{user:User}){
 const key='motyq-iq-local-test-'+user.email.toLowerCase();
 const [deskSection,setDeskSection]=useState<'dashboard'|'pricing'|'consulted'|'approvals'>(()=>{
   const previous=sessionStorage.getItem('motyq-iq-active-desk-tab');
   return previous==='pricing'||previous==='consulted'||previous==='approvals'?previous:'dashboard';
 });
 const switchDeskSection=(next:'dashboard'|'pricing'|'consulted'|'approvals')=>{
   setDeskSection(next);try{sessionStorage.setItem('motyq-iq-active-desk-tab',next);}catch{}
 };
 const formKey='motyq-iq-preview-inputs-'+user.email.toLowerCase();
 const savedForm=useMemo(()=>{
   try {const item=sessionStorage.getItem(formKey);return item?JSON.parse(item):{};} catch{return {};}
 },[formKey]);
 const [plate,setPlate]=useState<string>(()=>typeof savedForm.plate==='string'?savedForm.plate:'');const [retryCatalog,setRetryCatalog]=useState(0);
 const [model,setModel]=useState<string>(()=>typeof savedForm.model==='string'?savedForm.model:'');const [year,setYear]=useState<string>(()=>typeof savedForm.year==='string'?savedForm.year:'');
 const [brand,setBrand]=useState<string>(()=>typeof savedForm.brand==='string'?savedForm.brand:'');const [brandCode,setBrandCode]=useState<string>(()=>typeof savedForm.brandCode==='string'?savedForm.brandCode:'');const [modelCode,setModelCode]=useState<string>(()=>typeof savedForm.modelCode==='string'?savedForm.modelCode:'');const [yearCode,setYearCode]=useState<string>(()=>typeof savedForm.yearCode==='string'?savedForm.yearCode:'');
 const [brands,setBrands]=useState<Item[]>([]);const [models,setModels]=useState<Item[]>([]);const [years,setYears]=useState<Item[]>([]);
 const [fipe,setFipe]=useState<FipeDetail|null>(null);const [catalogError,setCatalogError]=useState('');const [catalogLoading,setCatalogLoading]=useState(false);const [km,setKm]=useState<string>(()=>typeof savedForm.km==='string'?savedForm.km:'');const [cost,setCost]=useState<string>(()=>typeof savedForm.cost==='string'?savedForm.cost:'0');const [repasse,setRepasse]=useState<boolean>(()=>Boolean(savedForm.repasse));
 const [ads,setAds]=useState<Ad[]>([blank(),blank(),blank()]);const [notice,setNotice]=useState('');
 const [classification,setClassification]=useState<HistoricalClass|''>(()=>['A','B','C','D','E','SEM CLASSE'].includes(savedForm.classification)?savedForm.classification:'');
 const [autoLoading,setAutoLoading]=useState(false);const [autoError,setAutoError]=useState('');
 const [autoSearchedAt,setAutoSearchedAt]=useState('');const [autoSearchKey,setAutoSearchKey]=useState('');
 const [searchDiagnostics,setSearchDiagnostics]=useState('');
 useEffect(()=>{
   try{sessionStorage.setItem(formKey,JSON.stringify({plate,brand,brandCode,model,modelCode,year,yearCode,km,cost,repasse,classification}));}catch{}
 },[formKey,plate,brand,brandCode,model,modelCode,year,yearCode,km,cost,repasse,classification]);
 const vehicleKey=[brandCode,modelCode,yearCode,km].join('|');
 const autoResultsVisible=autoSearchKey===vehicleKey;
 const [saved,setSaved]=useState<Saved[]>(()=>{try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[]}catch{return []}});
 const catalog=async(action:string,params:Record<string,string>,signal:AbortSignal)=>{const query=new URLSearchParams({action,...params});const cacheKey='motyq-iq-fipe-'+query.toString();const stored=sessionStorage.getItem(cacheKey);if(stored){try{return JSON.parse(stored);}catch{sessionStorage.removeItem(cacheKey);}}let lastError:Error=new Error('FIPE indisponível');for(let attempt=0;attempt<3;attempt++){if(signal.aborted)throw new DOMException('Consulta cancelada','AbortError');try{const response=await fetch('/api/marketiq-fipe?'+query.toString(),{signal,cache:'no-store'});if(!response.ok){lastError=new Error('FIPE HTTP '+response.status);if(response.status<500&&response.status!==429)throw lastError;}else{const data=await response.json();sessionStorage.setItem(cacheKey,JSON.stringify(data));return data;}}catch(e:any){if(e?.name==='AbortError')throw e;lastError=e instanceof Error?e:lastError;}if(attempt<2)await new Promise<void>((resolve,reject)=>{const timer=window.setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},500*(attempt+1));const cancel=()=>{window.clearTimeout(timer);reject(new DOMException('Consulta cancelada','AbortError'));};signal.addEventListener('abort',cancel,{once:true});});}throw lastError;};
 useEffect(()=>{const controller=new AbortController();setCatalogLoading(true);catalog('brands',{},controller.signal).then(v=>setBrands(v.items||[])).catch(e=>{if(e.name!=='AbortError')setCatalogError('Não foi possível carregar as marcas. Use Tentar novamente.');}).finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});return()=>controller.abort();},[retryCatalog]);
 useEffect(()=>{setModels([]);if(!brandCode)return;const controller=new AbortController();setCatalogLoading(true);setCatalogError('');catalog('models',{brandCode},controller.signal).then(v=>setModels(v.items||[])).catch(e=>{if(e.name!=='AbortError')setCatalogError('Não foi possível carregar os modelos. Tente novamente em alguns instantes.');}).finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});return()=>controller.abort();},[brandCode]);
 useEffect(()=>{setYears([]);if(!brandCode||!modelCode)return;const controller=new AbortController();setCatalogLoading(true);setCatalogError('');catalog('years',{brandCode,modelCode},controller.signal).then(v=>setYears(v.items||[])).catch(e=>{if(e.name!=='AbortError')setCatalogError('Não foi possível carregar os anos. Tente novamente em alguns instantes.');}).finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});return()=>controller.abort();},[brandCode,modelCode]);
 useEffect(()=>{setFipe(null);if(!brandCode||!modelCode||!yearCode)return;const controller=new AbortController();setCatalogLoading(true);setCatalogError('');catalog('detail',{brandCode,modelCode,yearCode},controller.signal).then(v=>{if(Number(v.value)>0)setFipe(v);else setCatalogError('Valor FIPE indisponível para esta versão.');}).catch(e=>{if(e.name!=='AbortError')setCatalogError('Não foi possível consultar o valor FIPE. Tente novamente em alguns instantes.');}).finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});return()=>controller.abort();},[brandCode,modelCode,yearCode]);
 const selectBrand=(code:string)=>{setBrandCode(code);setBrand(brands.find(x=>x.code===code)?.name||'');setModelCode('');setModel('');setYearCode('');setYear('');setFipe(null);};
 const selectModel=(code:string)=>{setModelCode(code);setModel(models.find(x=>x.code===code)?.name||'');setYearCode('');setYear('');setFipe(null);};
 const selectYear=(code:string)=>{setYearCode(code);setYear(years.find(x=>x.code===code)?.name||'');setFipe(null);};
 const change=(index:number,patch:Partial<Ad>)=>setAds(a=>a.map((x,i)=>i===index?{...x,...patch}:x));
 const searchMarket=async()=>{
   if(!brand||!model||!fipe||!yearCode||number(km)<=0){setAutoError('Selecione o veículo, aguarde o valor FIPE e informe a quilometragem.');return;}
   setAutoLoading(true);setAutoError('');setAutoSearchedAt('');setSearchDiagnostics('');
   try{
     const currentUser=auth.currentUser;
     if(!currentUser)throw new Error('Faça login novamente para pesquisar o mercado.');
     const token=await currentUser.getIdToken();
     const response=await fetch('/api/marketiq-market-scan',{
       method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
       body:JSON.stringify({action:'desk_market_search',brand,model,year:fipe.year,km:number(km)}),
       signal:AbortSignal.timeout(55000)
     });
     const payload=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(payload.error||'Pesquisa automática indisponível.');
     const found:Ad[]=(Array.isArray(payload.ads)?payload.ads:[]).filter((item:any)=>
       item&&((item.source==='webmotors'&&isWebmotors(item.url))||(item.source==='olx'&&isOlx(item.url))||(item.source==='napista'&&isNapista(item.url)))&&
       Number(item.price)>0&&Number(item.km)>0&&Number(item.year)===Number(fipe.year)
     ).map((item:any)=>({
       source:item.source,price:String(item.price),km:String(item.km),url:String(item.url),
       status:'pending' as const,auto:true,catalog:Boolean(item.catalog)||item.source==='napista'||item.source==='olx'&&!/\d{7,}/.test(String(item.url||'')),title:String(item.title||''),
       note:'Pesquisa automática (Tavily): '+String(item.evidence||'Dados indexados, ainda não conferidos na página.').slice(0,220)
     }));
     setAutoSearchKey(vehicleKey);
     const pages=Number(payload.pagesFound||0),full=Number(payload.sourcePagesWithFullContent||0);
     const parts=(Array.isArray(payload.sourcesChecked)?payload.sourcesChecked:[]).map((source:any)=>
       String(source.source)+': '+(source.available?String(source.pageCount||0)+' página(s)':'indisponível'));
     const evidence=payload.evidenceSummary||{};
     const fullByPortal=evidence.fullContentByPortal||{};
     setSearchDiagnostics('Páginas localizadas: '+pages+' · texto disponível: '+full+
       ' (Webmotors: '+Number(fullByPortal.webmotors||0)+' / OLX: '+Number(fullByPortal.olx||0)+' / NaPista: '+Number(fullByPortal.napista||0)+')'+
       ' · páginas individuais: '+Number(evidence.individualPages||0)+
       ' · trechos com preço + KM + ano + modelo: '+Number(evidence.snippetPriceAndKm||0)+
       ' · '+parts.join(' · '));
     setAutoSearchedAt(String(payload.searchedAt||new Date().toISOString()));
     setAds(existing=>[...found,...existing.filter(a=>!a.auto&&(a.price||a.km||a.url||a.note)),blank()]);
     if(!found.length)setAutoError('A busca foi realizada, mas não trouxe preços com KM e ano associados ao mesmo anúncio ou bloco público. Veja as fontes pesquisadas abaixo. Nenhum preço foi inventado.');
   }catch(error:any){
     setAutoError(error?.name==='TimeoutError'?'A pesquisa demorou demais. Tente novamente.':error?.message||'Pesquisa automática indisponível.');
   }finally{setAutoLoading(false);}
 };
 const valid=useMemo(()=>ads.filter(a=>!a.auto&&a.status==='valid'&&number(a.price)>0&&number(a.km)>0&&!a.catalog&&validSource(a)),[ads]);
 const sortedValid=useMemo(()=>[...valid].sort((a,b)=>number(a.price)-number(b.price)),[valid]);
 const primary=sortedValid.filter(a=>a.source==='webmotors');
 const secondary=sortedValid.filter(a=>a.source==='olx');
 const indexed=autoResultsVisible?ads.filter(a=>a.auto&&a.status!=='excluded'&&portalLink(a)&&number(a.price)>0&&number(a.km)>0):[];
 const indexedWebmotors=indexed.filter(a=>a.source==='webmotors'&&Math.abs(number(a.km)-number(km))<=30000);
 // An indexed Webmotors sample whose whole floor is materially above FIPE
 // cannot be presented as the cheapest offers without independent confirmation.
 const webmotorsBaseline=indexedWebmotors.filter(a=>!fipe||number(a.price)<=fipe.value*1.05);
 const webmotorsAboveReference=indexedWebmotors.length>0&&!webmotorsBaseline.length;
 const indexedOlx=indexed.filter(a=>a.source==='olx'&&Math.abs(number(a.km)-number(km))<=30000);
 const indexedNapista=indexed.filter(a=>a.source==='napista'&&Math.abs(number(a.km)-number(km))<=30000);
 // Webmotors remains the user's primary source even if only one indexed offer was found.
 // In that situation show a low-confidence indicative price rather than silently switching to another portal.
 const referenceSource=webmotorsBaseline.length?'webmotors':indexedNapista.length?'napista':indexedOlx.length?'olx':'';
 const referencePool=referenceSource==='webmotors'?webmotorsBaseline:referenceSource==='napista'?indexedNapista:indexedOlx;
 const referenceName=referenceSource==='webmotors'?'Webmotors (indexado)':referenceSource==='napista'?'NaPista (apoio)':referenceSource==='olx'?'OLX (apoio)':'';
 const referenceLowest=[...referencePool].sort((a,b)=>number(a.price)-number(b.price)).slice(0,5);
 const referenceAvg=referenceLowest.length?referenceLowest.reduce((sum,a)=>sum+number(a.price),0)/referenceLowest.length:0;
 const referenceCeiling=Math.max(0,referenceAvg*.86*(repasse?.95:1)-number(cost));
 const confidenceNote=referenceLowest.length>=3?'amostra preliminar':referenceLowest.length===2?'amostra pequena':'amostra mínima de um anúncio';
 const lowestIndexedWebmotors=[...webmotorsBaseline].sort((a,b)=>number(a.price)-number(b.price)).slice(0,5);
 const indexedAvg=lowestIndexedWebmotors.length?lowestIndexedWebmotors.reduce((sum,a)=>sum+number(a.price),0)/lowestIndexedWebmotors.length:0;
 const indexedOlxAvg=indexedOlx.length?indexedOlx.reduce((sum,a)=>sum+number(a.price),0)/indexedOlx.length:0;
 const indexedNapistaAvg=indexedNapista.length?indexedNapista.reduce((sum,a)=>sum+number(a.price),0)/indexedNapista.length:0;
 const verifiedWebmotors=[...primary].sort((a,b)=>number(a.price)-number(b.price)).slice(0,5);
 const avg=verifiedWebmotors.length?verifiedWebmotors.reduce((s,a)=>s+number(a.price),0)/verifiedWebmotors.length:0;
 const olxAvg=secondary.length?secondary.reduce((s,a)=>s+number(a.price),0)/secondary.length:0;
 const kmTolerance=30000;
 const distantKm=sortedValid.filter(a=>Math.abs(number(a.km)-number(km))>kmTolerance);
 const suspectAds=sortedValid.filter(a=>/leil[aã]o|sinistr|recuperad|batid|restri[cç][aã]o/i.test(a.note));
 const ceiling=Math.max(0,avg*.86*(repasse?.95:1)-number(cost));
 const marketReady=primary.length>=2&&distantKm.length===0&&suspectAds.length===0;
 const historicalEstimate=useMemo(()=>{
   if(!fipe||!classification||number(km)<=0)return null;
   return calculateHistoricalPrice({
     fipe:fipe.value,modelYear:fipe.year,km:number(km),preparation:number(cost),
     classification,destination:repasse?'REPASSE':'SHOWROOM'
   });
 },[fipe,classification,km,cost,repasse]);
 const save=()=>{
   const hasVehicle=/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)&&brandCode&&modelCode&&yearCode&&fipe&&number(km)>0;
   if(!hasVehicle||(!marketReady&&referenceAvg<=0&&!historicalEstimate)){
     setNotice('Informe placa, veículo e KM válidos e faça a pesquisa. É possível guardar estimativas preliminares, identificadas como não verificadas.');
     return;
   }
   const provisional=!marketReady;
   const next=[{id:String(Date.now()),date:new Date().toISOString(),plate,model,year,km,cost,repasse,
     ads,value:provisional?(referenceAvg>0?referenceCeiling:historicalEstimate?.target||0):ceiling,provisional,
     referenceName:provisional?(referenceAvg>0?referenceName:'Histórico de compras'):'Webmotors verificada',
     historicalTarget:historicalEstimate?.target,historicalClass:classification||undefined,
     brand,brandCode,modelCode,yearCode,fipe},...saved];
   try{localStorage.setItem(key,JSON.stringify(next));setSaved(next);setNotice(provisional?'Estimativa preliminar salva apenas neste navegador. Não representa uma compra aprovada.':'Rascunho conferido salvo apenas neste navegador.');}
   catch{setNotice('Falha ao salvar rascunho.');}
 };
 const restore=(r:Saved)=>{setPlate(r.plate||'');setBrand(r.brand||'');setBrandCode(r.brandCode||'');setModelCode(r.modelCode||'');setYearCode(r.yearCode||'');setModel(r.model);setYear(r.year);setFipe(r.fipe||null);setKm(r.km);setCost(r.cost);setRepasse(r.repasse);setClassification(r.historicalClass||'');setAds(r.ads);setNotice('Rascunho reaberto. Salvar cria uma nova versão.');window.scrollTo({top:0,behavior:'smooth'})};
 const input='w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900';
 return <main className="mx-auto max-w-7xl space-y-5 p-5 text-slate-900">
 <nav className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Áreas do Motyq IQ">
  <button type="button" onClick={()=>switchDeskSection('dashboard')} aria-current={deskSection==='dashboard'?'page':undefined}
    className={'rounded-xl px-5 py-3 text-sm font-black transition '+(deskSection==='dashboard'?'bg-[#153f51] text-white shadow-sm':'text-slate-600 hover:bg-slate-100')}>Painel gerencial</button>
  <button type="button" onClick={()=>switchDeskSection('pricing')} aria-current={deskSection==='pricing'?'page':undefined}
    className={'rounded-xl px-5 py-3 text-sm font-black transition '+(deskSection==='pricing'?'bg-[#153f51] text-white shadow-sm':'text-slate-600 hover:bg-slate-100')}>Mesa de precificação</button>
  <button type="button" onClick={()=>switchDeskSection('consulted')} aria-current={deskSection==='consulted'?'page':undefined}
    className={'rounded-xl px-5 py-3 text-sm font-black transition '+(deskSection==='consulted'?'bg-[#153f51] text-white shadow-sm':'text-slate-600 hover:bg-slate-100')}>Repasse Sob Consulta</button>
  <button type="button" onClick={()=>switchDeskSection('approvals')} aria-current={deskSection==='approvals'?'page':undefined}
    className={'rounded-xl px-5 py-3 text-sm font-black transition '+(deskSection==='approvals'?'bg-[#153f51] text-white shadow-sm':'text-slate-600 hover:bg-slate-100')}>Solicitações e aprovações</button>
  <span className="ml-auto px-2 text-[11px] font-semibold text-slate-400">Motyq IQ · ambiente de testes</span>
 </nav>
 {deskSection==='dashboard'?<MarketIqManagementDashboard user={user}/>:
  deskSection==='consulted'?<MarketIqConsultedRepasse user={user}
    vehicleFromDesk={{plate,brand,model,year,km,fipe:fipe?.value||0}}/>:
  deskSection==='approvals'?<MarketIqApprovalCenter user={user}/>:<>
 <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><strong>Versão de testes:</strong> o MarketScan pesquisa páginas públicas indexadas automaticamente, sem exigir links digitados. Os resultados são candidatos não verificados e não entram no teto definitivo até serem conferidos. Não há comprovação de histórico limpo por anúncio. Histórico apenas neste navegador. Use dados fictícios nos testes.</div>
 <section className="rounded-xl bg-white p-5"><h2 className="mb-3 text-xl font-semibold">Nova precificação</h2><div className="grid gap-3 md:grid-cols-2"><label>Placa do veículo<input className={input} value={plate} onChange={e=>setPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,7))} placeholder="ABC1D23" maxLength={7}/></label><div className="hidden md:block" /><label>Marca<select className={input} value={brandCode} onChange={e=>selectBrand(e.target.value)}><option value="">Selecione a marca</option>{brands.map(x=><option key={x.code} value={x.code}>{x.name}</option>)}</select></label><label>Modelo e versão<select className={input} value={modelCode} disabled={!brandCode} onChange={e=>selectModel(e.target.value)}><option value="">Selecione modelo e versão</option>{models.map(x=><option key={x.code} value={x.code}>{x.name}</option>)}</select></label><label>Ano/modelo e combustível<select className={input} value={yearCode} disabled={!modelCode} onChange={e=>selectYear(e.target.value)}><option value="">Selecione ano</option>{years.map(x=><option key={x.code} value={x.code}>{x.name}</option>)}</select></label><label>KM do veículo<input className={input} value={km} onChange={e=>setKm(e.target.value)} inputMode="numeric" placeholder="Ex.: 45000"/></label></div><div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">Tabela FIPE · consulta gratuita</p>{catalogLoading?<p>Consultando catálogo FIPE...</p>:fipe?<><p className="text-2xl font-bold text-slate-900">{money(fipe.value)}</p><p className="text-sm text-slate-700">{fipe.brand} · {fipe.model} · {fipe.year} · {fipe.fuel}</p><p className="text-xs text-slate-600">Código FIPE: {fipe.fipeCode} · Referência: {fipe.referenceMonth}</p></>:<p className="text-sm text-slate-600">Selecione marca, modelo/versão e ano para consultar o valor automaticamente.</p>}{catalogError&&<div className="mt-2 flex flex-wrap items-center gap-3"><p role="alert" className="text-sm text-red-700">{catalogError}</p><button type="button" onClick={()=>{setCatalogError("");setRetryCatalog(x=>x+1);if(brandCode){const current=brandCode;setBrandCode('');window.setTimeout(()=>setBrandCode(current),0);}}} className="rounded-lg border border-cyan-700 px-3 py-1 text-sm font-semibold text-cyan-900">Tentar novamente</button></div>}</div></section>
 <section className="rounded-xl border border-indigo-100 bg-white p-5">
  <div className="flex flex-wrap items-start justify-between gap-2">
    <div><h2 className="text-xl font-semibold">Preço-alvo histórico · Motyq IQ</h2>
      <p className="mt-1 text-sm text-slate-600">Estimativa de quanto a empresa costuma pagar por veículos semelhantes, usando FIPE, ano, KM, classe, destino e preparo. Não depende da pesquisa Webmotors.</p></div>
    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">Piloto · {MOTYQ_HISTORY_MODEL.purchases} compras confirmadas</span>
  </div>
  <div className="mt-4 grid gap-3 md:grid-cols-2">
    <label className="text-sm font-semibold">Classificação da avaliação
      <select className={input} value={classification} onChange={e=>setClassification(e.target.value as HistoricalClass|'')}>
        <option value="">Selecione classe A, B, C, D ou E</option>
        {(['A','B','C','D','E','SEM CLASSE'] as HistoricalClass[]).map(item=><option key={item} value={item}>{item==='SEM CLASSE'?'Não classificado':`Classe ${item}`}</option>)}
      </select>
    </label>
    <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <label className="block font-semibold">Custos previstos R$<input className={input} value={cost} onChange={e=>setCost(e.target.value)} inputMode="decimal" placeholder="Ex.: 2500"/></label>
      <label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={repasse} onChange={e=>setRepasse(e.target.checked)} className="mt-1"/> <span>Destinação para repasse (5% adicionais no teto de mercado)</span></label>
      <p className="mt-1 text-xs text-slate-500">Sem marcar: showroom/varejo. O valor de preparo entra no modelo histórico uma única vez.</p>
    </div>
  </div>
  {historicalEstimate?<div className="mt-4 grid gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 md:grid-cols-2">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-indigo-800">Preço-alvo estimado · compras reais</p>
      <p className="mt-2 text-3xl font-bold text-indigo-950">{money(historicalEstimate.target)}</p>
      <p className="mt-1 text-sm text-indigo-900">Faixa de incerteza: {money(historicalEstimate.rangeMin)} a {money(historicalEstimate.rangeMax)}</p>
      <p className="mt-1 text-xs text-indigo-700">Equivale a {(historicalEstimate.fipeFraction*100).toFixed(1).replace('.',',')}% da FIPE · estimativa, não compra aprovada.</p>
    </div>
    <div><p className="text-xs font-semibold uppercase tracking-wider text-indigo-800">Qualidade do histórico</p>
      <p className="mt-2 text-sm text-indigo-950">Amostra: {historicalEstimate.sampleSize} compras · classe {classification}: {historicalEstimate.classSampleSize} compras.</p>
      <p className="mt-2 text-sm text-indigo-950">Erro absoluto médio em validação por modelo: {money(MOTYQ_HISTORY_MODEL.crossValidationMae)}. A faixa é aproximada, não garantia para este carro.</p>
      {historicalEstimate.warnings.filter(w=>!w.startsWith('Não identifica')).map((warning,index)=><p key={index} className="mt-1 text-xs font-semibold text-amber-900">{warning}</p>)}
    </div>
    <p className="text-xs text-indigo-800 md:col-span-2">Calibrado somente com status UTILIZADO, não com AVALIADO. A previsão não identifica histórico de sinistro, leilão, avarias ou liquidez. Compare com anúncios verificáveis e faça inspeção presencial.</p>
  </div>:<p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Selecione a classificação, veículo, KM e FIPE para obter o preço-alvo histórico.</p>}
 </section>
 <section className="rounded-xl bg-white p-5"><div className="mb-3 flex justify-between gap-3"><div><h2 className="text-xl font-semibold">Comparação de mercado · Webmotors + OLX</h2><p className="text-sm text-slate-600">O MarketScan busca automaticamente anúncios indexados. Webmotors é a referência principal; OLX e NaPista são apoio quando o portal principal não fornece valores legíveis. Resultados indexados não são anúncios auditados.</p></div><div className="flex shrink-0 flex-wrap gap-2"><button className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={()=>void searchMarket()} disabled={autoLoading||!fipe||number(km)<=0}>{autoLoading?'Pesquisando mercado...':'Pesquisar mercado automaticamente'}</button><button className="rounded-lg bg-slate-800 px-3 py-2 text-white" onClick={()=>setAds(a=>[...a,blank()])}>+ Anúncio</button></div></div>
 {autoError&&<p role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{autoError}</p>}{searchDiagnostics&&autoResultsVisible&&<p className="mb-2 text-xs text-slate-600">{searchDiagnostics}</p>}
 {autoResultsVisible&&autoSearchedAt&&<p className="mb-3 text-xs text-slate-600">Última pesquisa: {new Date(autoSearchedAt).toLocaleString('pt-BR')} · {indexed.length} preço(s) indexado(s) encontrado(s). Os dados indexados são preliminares e não comprovam anúncio ativo, versão ou histórico.</p>}
 {referenceAvg>0&&<div className="mb-4 rounded-xl border border-cyan-200 bg-cyan-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-cyan-800">Simulação automática preliminar · não aprovada</p><p className="mt-1 text-sm text-slate-700">Base: {referenceName} · {referenceLowest.length} menor(es) preço(s) com até 30 mil km de diferença · média {money(referenceAvg)} ({confidenceNote}).</p><p className="mt-1 text-xs text-slate-600">Webmotors: {indexedWebmotors.length} · OLX: {indexedOlx.length} · NaPista: {indexedNapista.length} preço(s) indexado(s) próximos em KM.</p>
 {referenceSource==='webmotors'&&referenceLowest.length<2&&<p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-900">Somente um preço Webmotors indexado: referência muito limitada, sem média representativa. As outras fontes continuam visíveis como apoio, mas não substituem silenciosamente a Webmotors.</p>}
 {webmotorsAboveReference&&<p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-900">Atenção: todas as ofertas Webmotors extraídas estão mais de 5% acima da FIPE. A busca pode ter ignorado os menores preços. A simulação abaixo usa {referenceName} como apoio, não como cotação definitiva da Webmotors.</p>}<p className="mt-2 text-2xl font-bold text-cyan-950">{money(referenceCeiling)}</p><p className="mt-1 text-xs text-cyan-900">Cálculo: média × 0,86 {repasse?'× 0,95 ':''}− custos {money(number(cost))}. Não é teto definitivo nem aprovação de compra. Anúncios, versão e condições ainda não foram auditados.</p></div>}<div className="space-y-3">{ads.map((ad,i)=><div key={i} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-4"><label>Portal{ad.auto&&<span className="ml-2 text-xs font-semibold text-cyan-700">{ad.catalog?'Vitrine indexada':'Anúncio indexado'}</span>}<select className={input} disabled={Boolean(ad.auto)} value={ad.source||"webmotors"} onChange={e=>change(i,{source:e.target.value as Ad["source"],url:"",status:"pending"})}><option value="webmotors">Webmotors</option><option value="olx">OLX</option><option value="napista">NaPista</option></select></label>{ad.title&&<p className="self-end text-xs font-semibold text-slate-600 md:col-span-3">{ad.title}{ad.catalog&&<span className="ml-2 text-amber-700">· preço da vitrine, sem link individual</span>}</p>}<label>Preço R$<input className={input} readOnly={Boolean(ad.auto)} value={ad.price} onChange={e=>change(i,{price:e.target.value})}/></label><label>KM anúncio<input className={input} readOnly={Boolean(ad.auto)} value={ad.km} onChange={e=>change(i,{km:e.target.value})}/></label><label>Link da fonte<input className={input} readOnly={Boolean(ad.auto)} value={ad.url} onChange={e=>change(i,{url:e.target.value})}/>{ad.url&&!portalLink(ad)&&<small className="text-red-700">Link HTTPS do portal selecionado necessário.</small>}{ad.catalog&&<small className="text-amber-700">Página de resultados, sem anúncio individual comprovado.</small>}</label><label>Classificação<select className={input} value={ad.auto&&ad.status==='valid'?'pending':ad.status} onChange={e=>change(i,{status:e.target.value==='excluded'?'excluded':ad.auto?'pending':e.target.value as Ad['status']})}><option value="pending">{ad.auto?'Indexado, sem auditoria':'Pendente'}</option><option value="valid" disabled={Boolean(ad.auto||ad.catalog)}>Válido, conferido</option><option value="excluded">Excluir</option></select></label><label className="md:col-span-3">Observação / suspeita de leilão ou sinistro<input className={input} readOnly={Boolean(ad.auto)} value={ad.note} onChange={e=>change(i,{note:e.target.value})}/></label><div className="flex items-end gap-2">{portalLink(ad)&&<a href={ad.url} target="_blank" rel="noopener noreferrer" className="rounded border p-2 text-sm">{ad.catalog?'Ver fonte':'Abrir anúncio'}</a>}<button className="rounded border p-2 text-sm text-red-700" onClick={()=>setAds(a=>a.filter((_,j)=>j!==i))}>Excluir</button></div></div>)}</div><p className="mt-3 text-xs text-amber-800">A ausência de informação sobre leilão não comprova histórico limpo. O usuário deve verificar cada anúncio.</p>{distantKm.length>0&&<p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Atenção: {distantKm.length} anúncio(s) marcado(s) válido(s) têm diferença superior a 30.000 km do veículo. Revise ou exclua antes de salvar.</p>}{suspectAds.length>0&&<p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">Atenção: {suspectAds.length} anúncio(s) válido(s) têm observações de possível leilão, sinistro ou restrição. Exclua da média ou revise a classificação.</p>}</section>
 <section className="grid gap-4 rounded-xl bg-white p-5 md:grid-cols-2"><div><h2 className="mb-3 text-xl font-semibold">Cálculo da Mesa</h2><p className="text-sm text-slate-600">Custos informados: <strong>{money(number(cost))}</strong></p><p className="mt-2 text-sm text-slate-600">Destino: <strong>{repasse?'Repasse · 14% + 5%':'Showroom · 14%'}</strong></p><p className="mt-2 text-xs text-slate-500">Para alterar a classificação, o preparo ou o destino, use os campos no início da análise histórica.</p></div><div className="rounded-xl bg-slate-50 p-4"><p>{valid.length} anúncio(s) válido(s) de {ads.length}</p><p className="text-sm">Webmotors: {primary.length} válido(s), média {money(avg)} · OLX: {secondary.length} válido(s), média {money(olxAvg)}</p>{primary.length>0&&secondary.length>0&&<p className="text-xs text-slate-600">Diferença OLX x Webmotors: {money(olxAvg-avg)}. Apenas referência, sem ajuste automático.</p>}<p className="text-xs text-slate-600">Anúncios válidos ordenados do menor preço: {sortedValid.length?sortedValid.map(a=>money(number(a.price))).join(" · "):"nenhuma"}</p>{primary.length>0&&<><p>Média dos menores Webmotors conferidos: <strong>{money(avg)}</strong></p><p>Após 14%: {money(avg*.86)}</p>{repasse&&<p>Após 5% adicionais: {money(avg*.86*.95)}</p>}</>}<p>Custos: {money(number(cost))}</p><p className="mt-3 text-lg font-semibold">Precificação da Mesa</p>{marketReady?<><p className="text-xs font-semibold text-emerald-700">Teto com anúncios conferidos</p><p className="text-3xl font-bold text-emerald-700">{money(ceiling)}</p></>:referenceAvg>0?<><p className="text-xs font-semibold text-amber-800">Estimativa automática, não aprovada · {referenceName}</p><p className="text-3xl font-bold text-cyan-800">{money(referenceCeiling)}</p><p className="mt-1 text-xs text-slate-600">Teto definitivo indisponível até conferir 2 anúncios individuais Webmotors. {referenceLowest.length<2?'Atenção: referência baseada em somente uma oferta.':''}</p></>:<p className="text-sm font-semibold text-amber-800">Sem anúncios com preço, ano e KM próximos suficientes para calcular uma referência.</p>}<button onClick={save} disabled={!fipe||(!marketReady&&referenceAvg<=0&&!historicalEstimate)} className="mt-3 w-full rounded-lg bg-cyan-700 p-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Salvar rascunho local</button>{notice&&<p role="status" className="mt-2 text-sm">{notice}</p>}</div></section>
 <section className="rounded-xl bg-white p-5"><h2 className="mb-3 text-xl font-semibold">Histórico local de testes</h2>{saved.length===0?<p>Nenhum rascunho salvo.</p>:saved.map(r=><div key={r.id} className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><strong>{r.plate?`${r.plate} · `:""}{r.model} · {r.year}</strong><p className="text-xs">{new Date(r.date).toLocaleString('pt-BR')} · {r.repasse?'Repasse':'Varejo'} · {r.provisional?'Estimativa não verificada · '+(r.referenceName||'fonte de apoio'):'Conferido'}</p></div><strong>{money(r.value)}</strong><button onClick={()=>restore(r)} className="rounded border px-3 py-2">Reabrir</button></div>)}</section>
 </>}
 </main>;
}
