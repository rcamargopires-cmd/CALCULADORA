import React,{useEffect,useMemo,useRef,useState} from 'react';
type Item={code:string;name:string};
type FipeDetail={value:number;brand:string;model:string;year:number;fuel:string;referenceMonth:string;fipeCode:string};
import {User} from '../types';
import {auth} from '../firebase';
import MarketIqManagementDashboard from './MarketIqManagementDashboard';
import MarketIqLearningPanel from './MarketIqLearningPanel';
import MarketIqConsultedRepasse from './MarketIqConsultedRepasse';
import MarketIqApprovalCenter from './MarketIqApprovalCenter';
import {calculateHistoricalPrice, MOTYQ_HISTORY_MODEL, HistoricalClass} from '../services/marketIqHistoricalPricing';
import {chooseIndexedMarketSample} from '../services/marketIqIndexedSample';
type Ad={source?:'webmotors'|'olx'|'napista';price:string;km:string;url:string;status:'pending'|'valid'|'excluded';note:string;auto?:boolean;title?:string;catalog?:boolean};
type CapturedAd=Ad & {year:number};
const decodeExtensionTransfer=(hash:string):CapturedAd[]=>{
 try{
   const encoded=new URLSearchParams(String(hash||'').replace(/^#/,'')).get('motyq-import');
   if(!encoded||encoded.length>12000||!/^[A-Za-z0-9_-]+$/.test(encoded))return [];
   const binary=atob(encoded.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-encoded.length%4)%4));
   const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0))));
   if(data?.kind!=='motyq-assisted-v1'||!Array.isArray(data.ads)||data.ads.length>12)return [];
   const seen=new Set<string>();
   return data.ads.flatMap((raw:any)=>{
     const price=Number(raw?.price),km=Number(raw?.km),year=Number(raw?.year);
     const url=String(raw?.url||'').trim();
     let link:URL;
     try{link=new URL(url);}catch{return [];}
     if(link.protocol!=='https:'||!['www.webmotors.com.br','webmotors.com.br'].includes(link.hostname.toLowerCase())||
       !/^\/comprar\/[^/]+\/[^/]+\/.+\/\d{7,}\/?$/i.test(link.pathname)||
       !Number.isFinite(price)||price<1000||price>2000000||!Number.isFinite(km)||km<1||km>999999||
       !Number.isInteger(year)||year<1990||year>2100)return [];
     const canonical=link.origin+link.pathname;
     if(seen.has(canonical))return [];
     seen.add(canonical);
     return [{
       source:'webmotors' as const,price:String(Math.round(price)),km:String(Math.round(km)),year,url:canonical,
       title:String(raw.title||'').slice(0,120),status:'pending' as const,auto:false,catalog:false,
       note:'Registrado manualmente pela extensão Motyq. Confira versão, ano, preço, KM e condições no anúncio antes de validar.'
     }];
   });
 }catch{return [];}
};

type Saved={vehicleType?:'car'|'motorcycle';approvedValue?:number;approvedAt?:string;approvedRecordedAt?:string;approvedRecordedBy?:string;approvedRecordedEmail?:string;paidValue?:number;paidAt?:string;paidRecordedAt?:string;paidRecordedBy?:string;paidRecordedEmail?:string;id:string;createdAt?:string;createdByName?:string;createdByEmail?:string;companyId?:string;storeId?:string;date:string;plate?:string;model:string;year:string;km:string;cost:string;repasse:boolean;ads:Ad[];value:number;provisional?:boolean;referenceName?:string;historicalTarget?:number;historicalClass?:HistoricalClass;brand?:string;brandCode?:string;modelCode?:string;yearCode?:string;fipe?:FipeDetail|null};
const number=(v:string)=>Number(v.replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''))||0;
const money=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const localDate=()=>{const now=new Date();return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);};
const approvalInputValid=(v:string)=>v.trim()!==''&&Number.isFinite(number(v))&&number(v)>0&&number(v)<=2000000;
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
 const [deskSection,setDeskSection]=useState<'dashboard'|'pricing'|'consulted'|'approvals'|'history'|'learning'>(()=>{
   if(new URLSearchParams(window.location.hash.replace(/^#/,'')).has('motyq-import'))return 'pricing';
   const previous=sessionStorage.getItem('motyq-iq-active-desk-tab');
   return previous==='pricing'||previous==='consulted'||previous==='approvals'||previous==='history'||previous==='learning'?previous:'dashboard';
 });
 const switchDeskSection=(next:'dashboard'|'pricing'|'consulted'|'approvals'|'history'|'learning')=>{
   setDeskSection(next);try{sessionStorage.setItem('motyq-iq-active-desk-tab',next);}catch{}
 };
 const formKey='motyq-iq-preview-inputs-'+user.email.toLowerCase();
 const savedForm=useMemo(()=>{
   try {const item=sessionStorage.getItem(formKey);return item?JSON.parse(item):{};} catch{return {};}
 },[formKey]);
 const [vehicleType,setVehicleType]=useState<'car'|'motorcycle'>(()=>savedForm.vehicleType==='motorcycle'?'motorcycle':'car');
 const [plate,setPlate]=useState<string>(()=>typeof savedForm.plate==='string'?savedForm.plate:'');const [retryCatalog,setRetryCatalog]=useState(0);
 const [model,setModel]=useState<string>(()=>typeof savedForm.model==='string'?savedForm.model:'');const [year,setYear]=useState<string>(()=>typeof savedForm.year==='string'?savedForm.year:'');
 const [brand,setBrand]=useState<string>(()=>typeof savedForm.brand==='string'?savedForm.brand:'');const [brandCode,setBrandCode]=useState<string>(()=>typeof savedForm.brandCode==='string'?savedForm.brandCode:'');const [modelCode,setModelCode]=useState<string>(()=>typeof savedForm.modelCode==='string'?savedForm.modelCode:'');const [yearCode,setYearCode]=useState<string>(()=>typeof savedForm.yearCode==='string'?savedForm.yearCode:'');
 const [brands,setBrands]=useState<Item[]>([]);const [models,setModels]=useState<Item[]>([]);const [years,setYears]=useState<Item[]>([]);
 const [fipe,setFipe]=useState<FipeDetail|null>(null);const [catalogError,setCatalogError]=useState('');const [catalogLoading,setCatalogLoading]=useState(false);const [km,setKm]=useState<string>(()=>typeof savedForm.km==='string'?savedForm.km:'');const [cost,setCost]=useState<string>(()=>typeof savedForm.cost==='string'?savedForm.cost:'0');const [repasse,setRepasse]=useState<boolean>(()=>Boolean(savedForm.repasse));
 const [ads,setAds]=useState<Ad[]>([]);const [adsVehicleKey,setAdsVehicleKey]=useState('');const [notice,setNotice]=useState('');
 const [extensionInbox,setExtensionInbox]=useState<CapturedAd[]>(()=>decodeExtensionTransfer(window.location.hash));
 const [extensionNotice,setExtensionNotice]=useState('');
 useEffect(()=>{
   if(new URLSearchParams(window.location.hash.replace(/^#/,'')).has('motyq-import')){
     window.history.replaceState(null,'',window.location.pathname+window.location.search);
   }
 },[]);

 const [classification,setClassification]=useState<HistoricalClass|''>(()=>['A','B','C','D','E','SEM CLASSE'].includes(savedForm.classification)?savedForm.classification:'');
 const [autoLoading,setAutoLoading]=useState(false);const [autoError,setAutoError]=useState('');
 const [autoSearchedAt,setAutoSearchedAt]=useState('');const [autoSearchKey,setAutoSearchKey]=useState('');
 const [searchDiagnostics,setSearchDiagnostics]=useState('');
 const autoAttempted=useRef<Set<string>>(new Set());
 useEffect(()=>{
   try{sessionStorage.setItem(formKey,JSON.stringify({vehicleType,plate,brand,brandCode,model,modelCode,year,yearCode,km,cost,repasse,classification}));}catch{}
 },[formKey,vehicleType,plate,brand,brandCode,model,modelCode,year,yearCode,km,cost,repasse,classification]);
 const vehicleKey=[vehicleType,brandCode,modelCode,yearCode,km].join('|');
 const autoResultsVisible=autoSearchKey===vehicleKey;
 const currentAds=adsVehicleKey===vehicleKey?ads:[];
 const marketYear=Number(fipe?.year||String(yearCode).match(/^(?:19|20)\d{2}/)?.[0]||String(year).match(/(?:19|20)\d{2}/)?.[0]||0);
 const searchReady=Boolean(brand&&model&&marketYear>=1990&&number(km)>0);

 const applyExtensionCapture=()=>{
   if(!searchReady){setExtensionNotice('Selecione marca, versão, ano e KM do veículo antes de importar.');return;}
   if(extensionInbox.some(x=>x.year!==marketYear)){
     setExtensionNotice('Os anúncios importados têm ano diferente do veículo selecionado. Confira o ano antes de continuar.');
     return;
   }
   const validIncoming=extensionInbox.filter(x=>validSource(x));
   if(!validIncoming.length){setExtensionNotice('Nenhum link individual válido para importar.');return;}
   setAdsVehicleKey(vehicleKey);
   setAutoSearchKey(vehicleKey);
   autoAttempted.current.add(vehicleKey);
   setAds(existing=>{
     const prior=adsVehicleKey===vehicleKey?existing:[];
     const existingUrls=new Set(prior.map(ad=>ad.url));
     return [...prior,...validIncoming.filter(ad=>!existingUrls.has(ad.url))];
   });
   setExtensionInbox([]);
   setExtensionNotice(validIncoming.length+' anúncio(s) incluído(s) como PENDENTES. Confira cada um e marque Válido, conferido antes do cálculo definitivo.');
 };
 const missingMarketDetails=[
   !brand?'marca':null,!model?'modelo e versão':null,
   !marketYear?'ano/modelo':null,number(km)<=0?'quilometragem':null
 ].filter(Boolean).join(', ');
 const marketMessage=autoSearchKey===vehicleKey?autoError:'';

 const [saved,setSaved]=useState<Saved[]>([]);
 const [legacySaved]=useState<Saved[]>(()=>{
   try{const rows=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(rows)?rows.slice(0,250):[];}catch{return [];}
 });
 const [migratedIds,setMigratedIds]=useState<string[]>(()=>{
   try{const rows=JSON.parse(localStorage.getItem(key+'-cloud-migrated')||'[]');return Array.isArray(rows)?rows:[];}catch{return [];}
 });
 const [historyBusy,setHistoryBusy]=useState(false);
 const [newApprovedValue,setNewApprovedValue]=useState('');
 const [newApprovedDate,setNewApprovedDate]=useState(localDate);
 const [editingApprovedId,setEditingApprovedId]=useState('');
 const [editingApprovedValue,setEditingApprovedValue]=useState('');
 const [editingApprovedDate,setEditingApprovedDate]=useState(localDate);
 const [historyError,setHistoryError]=useState('');
 const [historySearch,setHistorySearch]=useState('');
 const [historyStatus,setHistoryStatus]=useState<'all'|'approved'|'reviewed'|'preliminary'|'draft'>('all');
 const [historyMore,setHistoryMore]=useState(false);
 const [migrateBusy,setMigrateBusy]=useState(false);
 const historyRequest=async(action:'list'|'save'|'approved',evaluation?:Saved,approval?:{evaluationId:string;amount:number;approvedAt:string})=>{
   const currentUser=auth.currentUser;
   if(!currentUser)throw new Error('Sessão encerrada. Entre novamente.');
   const token=await currentUser.getIdToken();
   const response=await fetch('/api/marketiq-market-scan',{
     method:'POST',cache:'no-store',
     headers:{'content-type':'application/json','Authorization':'Bearer '+token},
     body:JSON.stringify({action:'pricing_history_'+action,...(evaluation?{evaluation}:{}),...(approval||{})}),
     signal:AbortSignal.timeout(35000)
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||'Não foi possível acessar o histórico.');
   return result;
 };
 const refreshHistory=async()=>{
   setHistoryBusy(true);setHistoryError('');
   try{
     const data=await historyRequest('list');
     setSaved(Array.isArray(data.records)?data.records:[]);
     setHistoryMore(Boolean(data.hasMore));
   }catch(e:any){
     setHistoryError(e?.message||'Histórico indisponível. Tente novamente.');
   }finally{setHistoryBusy(false);}
 };
 useEffect(()=>{void refreshHistory();},[user.email,user.companyId,user.storeId]);

 const recordApproved=async(record:Saved)=>{
   if(historyBusy)return;
   if(!approvalInputValid(editingApprovedValue)){
     setHistoryError('Informe um valor aprovado válido, maior que zero.');return;
   }
   if(!editingApprovedDate||editingApprovedDate>localDate()){
     setHistoryError('Informe uma data de aprovação válida, até hoje.');return;
   }
   setHistoryBusy(true);setHistoryError('');
   try{
     const data=await historyRequest('approved',undefined,{
       evaluationId:record.id,amount:Math.round(number(editingApprovedValue)*100)/100,
       approvedAt:editingApprovedDate
     });
     if(data.saved!==true)throw new Error('Não foi possível confirmar a aprovação.');
     setEditingApprovedId('');
     await refreshHistory();
     setNotice('Valor aprovado na avaliação registrado no histórico, sem alterar a estimativa original.');
   }catch(e:any){setHistoryError(e?.message||'Não foi possível registrar o valor aprovado.');}
   finally{setHistoryBusy(false);}
 };
 const legacyPending=legacySaved.filter(r=>!migratedIds.includes(r.id));
 const migrateLegacy=async()=>{
   if(migrateBusy||historyBusy||!legacyPending.length)return;
   setMigrateBusy(true);setHistoryError('');
   const copied:string[]=[];
   try{
     for(const record of legacyPending){
       const data=await historyRequest('save',record);
       if(data?.saved!==true)throw new Error('Não foi possível confirmar a gravação.');
       copied.push(record.id);
       const next=[...migratedIds,...copied];
       localStorage.setItem(key+'-cloud-migrated',JSON.stringify(next));
       setMigratedIds(next);
     }
     await refreshHistory();
     setNotice(copied.length+' avaliação(ões) antiga(s) copiadas para o histórico online. As cópias locais foram preservadas.');
   }catch(e:any){
     setHistoryError('Importação parcial: '+copied.length+' salva(s). '+(e?.message||'Falha ao importar.'));
     await refreshHistory();
   }finally{setMigrateBusy(false);}
 };
 const filteredHistory=saved.filter(r=>{
   const query=historySearch.trim().toLowerCase();
   const matches=!query||[r.plate,r.brand,r.model,r.year,r.createdByName].join(' ').toLowerCase().includes(query);
   const status=r.provisional===false?'reviewed':Number(r.value)>0?'preliminary':'draft';
   return matches&&(historyStatus==='all'||(historyStatus==='approved'?Number(r.approvedValue)>0:status===historyStatus));
 });

 const catalog=async(action:string,params:Record<string,string>,signal:AbortSignal)=>{const query=new URLSearchParams({action,vehicleType,...params});const cacheKey='motyq-iq-fipe-'+query.toString();const stored=sessionStorage.getItem(cacheKey);if(stored){try{return JSON.parse(stored);}catch{sessionStorage.removeItem(cacheKey);}}let lastError:Error=new Error('FIPE indisponível');for(let attempt=0;attempt<3;attempt++){if(signal.aborted)throw new DOMException('Consulta cancelada','AbortError');try{const response=await fetch('/api/marketiq-fipe?'+query.toString(),{signal,cache:'no-store'});if(!response.ok){lastError=new Error('FIPE HTTP '+response.status);if(response.status<500&&response.status!==429)throw lastError;}else{const data=await response.json();sessionStorage.setItem(cacheKey,JSON.stringify(data));return data;}}catch(e:any){if(e?.name==='AbortError')throw e;lastError=e instanceof Error?e:lastError;}if(attempt<2)await new Promise<void>((resolve,reject)=>{const timer=window.setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},500*(attempt+1));const cancel=()=>{window.clearTimeout(timer);reject(new DOMException('Consulta cancelada','AbortError'));};signal.addEventListener('abort',cancel,{once:true});});}throw lastError;};
 useEffect(()=>{const controller=new AbortController();setCatalogLoading(true);catalog('brands',{},controller.signal).then(v=>setBrands(v.items||[])).catch(e=>{if(e.name!=='AbortError')setCatalogError('Não foi possível carregar as marcas. Use Tentar novamente.');}).finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});return()=>controller.abort();},[retryCatalog,vehicleType]);
 useEffect(()=>{setModels([]);if(!brandCode)return;const controller=new AbortController();setCatalogLoading(true);setCatalogError('');catalog('models',{brandCode},controller.signal).then(v=>setModels(v.items||[])).catch(e=>{if(e.name!=='AbortError')setCatalogError('Não foi possível carregar os modelos. Tente novamente em alguns instantes.');}).finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});return()=>controller.abort();},[brandCode,vehicleType]);
 useEffect(()=>{setYears([]);if(!brandCode||!modelCode)return;const controller=new AbortController();setCatalogLoading(true);setCatalogError('');catalog('years',{brandCode,modelCode},controller.signal).then(v=>setYears(v.items||[])).catch(e=>{if(e.name!=='AbortError')setCatalogError('Não foi possível carregar os anos. Tente novamente em alguns instantes.');}).finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});return()=>controller.abort();},[brandCode,modelCode,vehicleType]);
 useEffect(()=>{setFipe(null);if(!brandCode||!modelCode||!yearCode)return;const controller=new AbortController();setCatalogLoading(true);setCatalogError('');catalog('detail',{brandCode,modelCode,yearCode},controller.signal).then(v=>{if(Number(v.value)>0)setFipe(v);else setCatalogError('Valor FIPE indisponível para esta versão.');}).catch(e=>{if(e.name!=='AbortError')setCatalogError('Não foi possível consultar o valor FIPE. Tente novamente em alguns instantes.');}).finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});return()=>controller.abort();},[brandCode,modelCode,yearCode,vehicleType]);
 const selectVehicleType=(next:'car'|'motorcycle')=>{
   if(next===vehicleType)return;
   setVehicleType(next);setBrandCode('');setBrand('');setModelCode('');setModel('');
   setYearCode('');setYear('');setFipe(null);setAds([]);setAutoSearchKey('');
   setNotice('Tipo de veículo alterado. Selecione a marca, o modelo e o ano novamente.');
 };
 const selectBrand=(code:string)=>{setBrandCode(code);setBrand(brands.find(x=>x.code===code)?.name||'');setModelCode('');setModel('');setYearCode('');setYear('');setFipe(null);};
 const selectModel=(code:string)=>{setModelCode(code);setModel(models.find(x=>x.code===code)?.name||'');setYearCode('');setYear('');setFipe(null);};
 const selectYear=(code:string)=>{setYearCode(code);setYear(years.find(x=>x.code===code)?.name||'');setFipe(null);};
 const change=(index:number,patch:Partial<Ad>)=>setAds(a=>a.map((x,i)=>i===index?{...x,...patch}:x));
 const searchMarket=async()=>{
   if(vehicleType==='motorcycle'){setAutoError('Para motos, use anúncios individuais conferidos. A busca indexada de carros não é aplicada.');return;}
   if(!searchReady){setAutoError('Informe '+missingMarketDetails+' para pesquisar anúncios.');setAutoSearchKey(vehicleKey);return;}
   if(autoLoading)return;
   autoAttempted.current.add(vehicleKey);
   setAdsVehicleKey(vehicleKey);
   setAutoSearchKey(vehicleKey);
   setAutoLoading(true);setAutoError('');setAutoSearchedAt('');setSearchDiagnostics('');
   try{
     const currentUser=auth.currentUser;
     if(!currentUser)throw new Error('Faça login novamente para pesquisar o mercado.');
     const token=await currentUser.getIdToken();
     const response=await fetch('/api/marketiq-market-scan',{
       method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
       body:JSON.stringify({action:'desk_market_search',vehicleType,brand,model,year:marketYear,km:number(km)}),
       signal:AbortSignal.timeout(55000)
     });
     const payload=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(payload.error||'Pesquisa automática indisponível.');
     const found:Ad[]=(Array.isArray(payload.ads)?payload.ads:[]).filter((item:any)=>
       item&&((item.source==='webmotors'&&isWebmotors(item.url))||(item.source==='olx'&&isOlx(item.url))||(item.source==='napista'&&isNapista(item.url)))&&
       Number(item.price)>0&&Number(item.km)>0&&Number(item.year)===marketYear
     ).map((item:any)=>({
       source:item.source,price:String(item.price),km:String(item.km),url:String(item.url),
       status:'pending' as const,auto:true,catalog:Boolean(item.catalog)||item.source==='napista'||item.source==='olx'&&!/\d{7,}/.test(String(item.url||'')),title:String(item.title||''),
       note:'Pesquisa automática (Tavily): '+String(item.evidence||'Dados indexados, ainda não conferidos na página.').slice(0,220)
     }));
     setAutoSearchKey(vehicleKey);
     const pages=Number(payload.pagesFound||0),full=Number(payload.sourcePagesWithFullContent||0);
     const parts=(Array.isArray(payload.sourcesChecked)?payload.sourcesChecked:[]).map((source:any)=>
       String(source.source)+': '+(source.available?String(source.pageCount||0)+' página(s)':'indisponível ('+String(source.error||'sem resposta').slice(0,90)+')'));
     const evidence=payload.evidenceSummary||{};
     const fullByPortal=evidence.fullContentByPortal||{};
     setSearchDiagnostics('Páginas localizadas: '+pages+' · texto disponível: '+full+
       ' (Webmotors: '+Number(fullByPortal.webmotors||0)+' / OLX: '+Number(fullByPortal.olx||0)+' / NaPista: '+Number(fullByPortal.napista||0)+')'+
       ' · páginas individuais: '+Number(evidence.individualPages||0)+
       ' · trechos com preço + KM + ano + modelo: '+Number(evidence.snippetPriceAndKm||0)+
       ' · '+parts.join(' · '));
     setAutoSearchedAt(String(payload.searchedAt||new Date().toISOString()));
     setAds(existing=>[...found,...(adsVehicleKey===vehicleKey?existing:[]).filter(a=>!a.auto&&(a.price||a.km||a.url||a.note))]);
     if(!found.length)setAutoError('A pesquisa terminou, mas não localizou anúncios com preço, ano e KM confiáveis para este veículo. O preço-alvo histórico continua disponível abaixo. Não inventamos valores de mercado.');
   }catch(error:any){
     setAutoSearchKey(vehicleKey);
     setAutoError((error?.name==='TimeoutError'?'A fonte de anúncios demorou demais.':error?.message||'Pesquisa automática indisponível.')+' O preço-alvo histórico continua disponível e não depende dessa pesquisa.');
   }finally{setAutoLoading(false);}
 };
 // Indexed results are optional and not audited; do not run a speculative
 // background lookup for every selected vehicle. The primary workflow is the
 // user-assisted Webmotors extension plus verified individual listings.
 const valid=useMemo(()=>currentAds.filter(a=>!a.auto&&a.status==='valid'&&number(a.price)>0&&number(a.km)>0&&!a.catalog&&validSource(a)),[currentAds]);
 const sortedValid=useMemo(()=>[...valid].sort((a,b)=>number(a.price)-number(b.price)),[valid]);
 const primary=sortedValid.filter(a=>a.source==='webmotors');
 const secondary=sortedValid.filter(a=>a.source==='olx');
 const indexed=autoResultsVisible?currentAds.filter(a=>a.auto&&a.status!=='excluded'&&portalLink(a)&&number(a.price)>0&&number(a.km)>0):[];
 const indexedWebmotors=indexed.filter(a=>a.source==='webmotors'&&Math.abs(number(a.km)-number(km))<=30000);
 // An indexed Webmotors sample whose whole floor is materially above FIPE
 // cannot be presented as the cheapest offers without independent confirmation.
 const webmotorsBaseline=indexedWebmotors.filter(a=>!fipe||number(a.price)<=fipe.value*1.05);
 const webmotorsAboveReference=indexedWebmotors.length>0&&!webmotorsBaseline.length;
 const indexedOlx=indexed.filter(a=>a.source==='olx'&&Math.abs(number(a.km)-number(km))<=30000);
 const indexedNapista=indexed.filter(a=>a.source==='napista'&&Math.abs(number(a.km)-number(km))<=30000);
 // Prefer a sufficiently sized Webmotors sample. With no reliable Webmotors
 // candidate set, compare multiple OLX observations before trying NaPista.
 // A single indexed price is never enough to calculate a market ceiling.
 const marketSample=chooseIndexedMarketSample({
   webmotors:webmotorsBaseline,olx:indexedOlx,napista:indexedNapista
 });
 const referenceSource=marketSample.source;
 const referenceName=referenceSource==='webmotors'?'Webmotors (indexado)':referenceSource==='olx'?'OLX (apoio)':referenceSource==='napista'?'NaPista (apoio)':'';
 const referenceLowest=marketSample.sample;
 const referenceAvg=marketSample.average;
 const referenceCeiling=referenceAvg>0?Math.max(0,referenceAvg*.86*(repasse?.95:1)-number(cost)):0;
 const confidenceNote=referenceLowest.length>=3?'amostra preliminar não auditada':'amostra pequena, não auditada';
 const lowestIndexedWebmotors=[...webmotorsBaseline].sort((a,b)=>number(a.price)-number(b.price)).slice(0,5);
 const indexedAvg=lowestIndexedWebmotors.length?lowestIndexedWebmotors.reduce((sum,a)=>sum+number(a.price),0)/lowestIndexedWebmotors.length:0;
 const indexedOlxAvg=indexedOlx.length?indexedOlx.reduce((sum,a)=>sum+number(a.price),0)/indexedOlx.length:0;
 const indexedNapistaAvg=indexedNapista.length?indexedNapista.reduce((sum,a)=>sum+number(a.price),0)/indexedNapista.length:0;
 const verifiedWebmotors=[...primary].sort((a,b)=>number(a.price)-number(b.price)).slice(0,5);
 const avg=verifiedWebmotors.length?verifiedWebmotors.reduce((s,a)=>s+number(a.price),0)/verifiedWebmotors.length:0;
 const olxAvg=secondary.length?secondary.reduce((s,a)=>s+number(a.price),0)/secondary.length:0;
 const kmTolerance=vehicleType==='motorcycle'?10000:30000;
 const distantKm=sortedValid.filter(a=>Math.abs(number(a.km)-number(km))>kmTolerance);
 const suspectAds=sortedValid.filter(a=>/leil[aã]o|sinistr|recuperad|batid|restri[cç][aã]o/i.test(a.note));
 const ceiling=Math.max(0,avg*.86*(repasse?.95:1)-number(cost));
 const marketReady=primary.length>=2&&distantKm.length===0&&suspectAds.length===0;
 const historicalEstimate=useMemo(()=>{
   if(vehicleType==='motorcycle'||!fipe||!classification||number(km)<=0)return null;
   return calculateHistoricalPrice({
     fipe:fipe.value,modelYear:fipe.year,km:number(km),preparation:number(cost),
     classification,destination:repasse?'REPASSE':'SHOWROOM'
   });
 },[vehicleType,fipe,classification,km,cost,repasse]);
 const save=async()=>{
   const hasVehicle=/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)&&brandCode&&modelCode&&yearCode&&number(km)>0;
   if(!hasVehicle){
     setNotice('Para salvar, preencha placa, marca, modelo, versão, ano e quilometragem.');
     return;
   }
   if(historyBusy)return;
   if(newApprovedValue.trim()&&!approvalInputValid(newApprovedValue)){
     setHistoryError('Corrija o valor aprovado na avaliação antes de salvar.');return;
   }
   if(newApprovedValue.trim()&&(!newApprovedDate||newApprovedDate>localDate())){
     setHistoryError('Informe uma data de aprovação válida, até hoje.');return;
   }
   const provisional=!marketReady;
   const record:Saved={id:String(Date.now()),date:new Date().toISOString(),vehicleType,plate,model,year,km,cost,repasse,
     ads:currentAds,value:provisional?(vehicleType==='motorcycle'?0:referenceAvg>0?referenceCeiling:historicalEstimate?.target||0):ceiling,provisional,
     referenceName:provisional?(referenceAvg>0?referenceName:'Histórico de compras'):'Webmotors verificada',
     historicalTarget:historicalEstimate?.target,historicalClass:classification||undefined,
     brand,brandCode,modelCode,yearCode,fipe};
   setHistoryBusy(true);setHistoryError('');
   try{
     const result=await historyRequest('save',record);
     if(result.saved!==true)throw new Error('Não foi possível confirmar a gravação.');
     setSaved(rows=>[result.record,...rows]);
     if(newApprovedValue.trim()){
       try{
         const approvedResult=await historyRequest('approved',undefined,{
           evaluationId:result.record.id,
           amount:Math.round(number(newApprovedValue)*100)/100,
           approvedAt:newApprovedDate
         });
         if(approvedResult.saved!==true)throw new Error('Não foi possível confirmar o valor aprovado.');
         setNewApprovedValue('');
         await refreshHistory();
         setNotice('Avaliação e valor aprovado salvos no histórico online.');
       }catch(e:any){
         setHistoryError('A avaliação foi salva, mas o valor aprovado NÃO foi registrado. Abra o histórico e use Registrar valor aprovado. '+(e?.message||''));
         setNotice('Avaliação salva sem a aprovação. Não salve novamente: complemente pelo histórico.');
       }
     }else setNotice('Avaliação salva no histórico. O valor aprovado poderá ser informado depois, sem refazer a avaliação.');
   }catch(error:any){
     setHistoryError(error?.message||'Não foi possível salvar no histórico online.');
     setNotice('Não foi salva. Seus dados continuam nesta tela. Verifique a mensagem do histórico e tente novamente.');
   }finally{setHistoryBusy(false);}
 };
 const restore=(r:Saved)=>{setVehicleType(r.vehicleType==='motorcycle'?'motorcycle':'car');setPlate(r.plate||'');setBrand(r.brand||'');setBrandCode(r.brandCode||'');setModelCode(r.modelCode||'');setYearCode(r.yearCode||'');setModel(r.model);setYear(r.year);setFipe(r.fipe||null);setKm(r.km);setCost(r.cost);setRepasse(r.repasse);setClassification(r.historicalClass||'');setAds(r.ads);const restoredKey=[r.vehicleType==='motorcycle'?'motorcycle':'car',r.brandCode||'',r.modelCode||'',r.yearCode||'',r.km].join('|');setAdsVehicleKey(restoredKey);setAutoSearchKey(restoredKey);autoAttempted.current.add(restoredKey);setAutoSearchedAt(r.date);switchDeskSection('pricing');setNewApprovedValue('');setNewApprovedDate(localDate());setNotice('Avaliação reaberta. Salvar cria nova versão; os valores aprovados anteriormente continuam registrados na avaliação original.');window.scrollTo({top:0,behavior:'smooth'})};
 const input='w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900';
 return <main className="mx-auto max-w-7xl space-y-5 p-5 text-slate-900">
 <nav className="motyq-iq-tabs flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Áreas do Motyq IQ">
  <button type="button" onClick={()=>switchDeskSection('dashboard')} aria-current={deskSection==='dashboard'?'page':undefined}
    className={'rounded-xl px-5 py-3 text-sm font-black transition '+(deskSection==='dashboard'?'bg-[#153f51] text-white shadow-sm':'text-slate-600 hover:bg-slate-100')}>Painel gerencial</button>
  <button type="button" onClick={()=>switchDeskSection('pricing')} aria-current={deskSection==='pricing'?'page':undefined}
    className={'rounded-xl px-5 py-3 text-sm font-black transition '+(deskSection==='pricing'?'bg-[#153f51] text-white shadow-sm':'text-slate-600 hover:bg-slate-100')}>Mesa de precificação</button>
  <button type="button" onClick={()=>switchDeskSection('consulted')} aria-current={deskSection==='consulted'?'page':undefined}
    className={'rounded-xl px-5 py-3 text-sm font-black transition '+(deskSection==='consulted'?'bg-[#153f51] text-white shadow-sm':'text-slate-600 hover:bg-slate-100')}>Repasse Sob Consulta</button>
  <button type="button" onClick={()=>switchDeskSection('approvals')} aria-current={deskSection==='approvals'?'page':undefined}
    className={'rounded-xl px-5 py-3 text-sm font-black transition '+(deskSection==='approvals'?'bg-[#153f51] text-white shadow-sm':'text-slate-600 hover:bg-slate-100')}>Solicitações e aprovações</button>
  <button type="button" onClick={()=>switchDeskSection('history')} aria-current={deskSection==='history'?'page':undefined}
    className={'rounded-xl px-5 py-3 text-sm font-black transition '+(deskSection==='history'?'bg-[#153f51] text-white shadow-sm':'text-slate-600 hover:bg-slate-100')}>Histórico de avaliações ({saved.length})</button>
  <button type="button" onClick={()=>switchDeskSection('learning')} aria-current={deskSection==='learning'?'page':undefined}
    className={'rounded-xl px-5 py-3 text-sm font-black transition '+(deskSection==='learning'?'bg-[#153f51] text-white shadow-sm':'text-slate-600 hover:bg-slate-100')}>Aprendizado IQ</button>
  <span className="motyq-iq-tabs-caption ml-auto px-2 text-[11px] font-semibold text-slate-500">Motyq IQ · histórico online</span>
 </nav>
 {deskSection==='dashboard'?<MarketIqManagementDashboard user={user}/>:
  deskSection==='consulted'?<MarketIqConsultedRepasse user={user}
    vehicleFromDesk={{plate,brand,model,year,km,fipe:fipe?.value||0}}
    onOpenApprovals={()=>switchDeskSection('approvals')}/>:
  deskSection==='approvals'?<MarketIqApprovalCenter user={user}/>:
  deskSection==='learning'?<MarketIqLearningPanel user={user} history={saved} onRefresh={refreshHistory}/>:
  deskSection==='history'?<section className="space-y-4 rounded-xl bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-bold text-slate-900">Histórico de avaliações</h2>
        <p className="mt-1 text-sm text-slate-600">Registros online por empresa e unidade. Cada salvamento cria uma versão que pode ser reaberta.</p></div>
      <button type="button" onClick={()=>void refreshHistory()} disabled={historyBusy||migrateBusy}
        className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{historyBusy?'Atualizando...':'Atualizar histórico'}</button>
    </div>
    {historyError&&<p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">{historyError}</p>}
    {legacyPending.length>0&&<div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-950">{legacyPending.length} avaliação(ões) antiga(s) encontradas neste navegador, ainda não copiadas para o histórico online.</p>
      <button type="button" disabled={historyBusy||migrateBusy} onClick={()=>void migrateLegacy()}
        className="mt-2 rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{migrateBusy?'Importando...':'Copiar avaliações antigas para o histórico'}</button>
      <p className="mt-2 text-xs text-amber-900">As cópias locais não serão apagadas.</p>
    </div>}
    <div className="flex flex-wrap gap-3">
      <label className="flex-1 text-sm font-medium text-slate-700">Buscar por placa, veículo, ano ou responsável
        <input className={input} value={historySearch} onChange={e=>setHistorySearch(e.target.value)} placeholder="Ex.: ABC1D23 ou Titano"/></label>
      <label className="min-w-[180px] text-sm font-medium text-slate-700">Situação
        <select className={input} value={historyStatus} onChange={e=>setHistoryStatus(e.target.value as typeof historyStatus)}>
          <option value="all">Todas</option><option value="approved">Com valor aprovado</option><option value="reviewed">Conferidas</option><option value="preliminary">Preliminares</option><option value="draft">Rascunhos sem valor</option>
        </select></label>
    </div>
    {historyMore&&<p className="text-xs font-semibold text-amber-800">O banco possui mais de 500 registros nesta unidade. A lista mostra os primeiros 500; refine a busca em uma próxima versão.</p>}
    {historyBusy&&saved.length===0?<p className="text-sm text-slate-600">Carregando histórico online...</p>:
      filteredHistory.length===0?<p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">Nenhuma avaliação encontrada neste filtro.</p>:
      <div className="space-y-3">{filteredHistory.map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="min-w-[220px] flex-1">
          <p className="font-bold text-slate-950">{r.plate||'Sem placa'} · {r.brand} {r.model}</p>
          <p className="mt-1 text-sm text-slate-700">{r.vehicleType==='motorcycle'?'Motocicleta':'Automóvel'} · {r.year} · {number(r.km).toLocaleString('pt-BR')} km · {r.repasse?'Repasse':'Varejo'}</p>
          <p className="mt-1 text-xs text-slate-600">{new Date(r.createdAt||r.date).toLocaleString('pt-BR')} · {r.createdByName||'Responsável não registrado'} · {(r.ads||[]).length} anúncio(s)</p>
          <p className="mt-1 text-xs font-semibold text-slate-700">{r.provisional===false?'Anúncios conferidos':number(String(r.value))>0?'Estimativa preliminar':'Rascunho sem valor'}</p>
        </div>
        <div className="min-w-[200px] text-right">
          <p className="text-xs text-slate-600">Valor estimado pelo Motyq</p>
          <p className="text-lg font-bold text-slate-950">{money(r.value)}</p>
          {Number(r.approvedValue)>0?
            <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
              <p className="text-xs font-bold uppercase text-emerald-900">Valor aprovado na avaliação</p>
              <p className="text-xl font-black text-emerald-950">{money(Number(r.approvedValue))}</p>
              <p className="text-xs font-semibold text-emerald-900">{Number(r.approvedValue)>r.value?'Acima':Number(r.approvedValue)<r.value?'Abaixo':'Igual à estimativa'}{Number(r.approvedValue)!==r.value?' em '+money(Math.abs(Number(r.approvedValue)-r.value)):''}</p>
              <p className="mt-1 text-xs text-emerald-900">Aprovação: {r.approvedAt?.split('-').reverse().join('/')||'-'} · {r.approvedRecordedBy||'usuário autorizado'}</p>
            </div>:
            <p className="mt-2 text-xs font-semibold text-amber-900">Valor aprovado ainda não informado</p>}
          {Number(r.paidValue)>0&&<div className="mt-2 rounded-lg border border-slate-300 bg-slate-100 p-2">
            <p className="text-xs font-semibold text-slate-700">Registro anterior de valor realmente pago</p>
            <p className="font-bold text-slate-950">{money(Number(r.paidValue))}</p>
            <p className="text-xs text-slate-600">Compra: {r.paidAt?.split('-').reverse().join('/')||'-'}. Mantido separado, não considerado aprovação.</p>
          </div>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={()=>{setEditingApprovedId(r.id);setEditingApprovedValue(r.approvedValue?Number(r.approvedValue).toFixed(2).replace('.',','):'');setEditingApprovedDate(r.approvedAt||localDate());setHistoryError('');}}
            className="rounded-lg border border-emerald-700 bg-white px-4 py-2 text-sm font-bold text-emerald-900">{Number(r.approvedValue)>0?'Corrigir valor aprovado':'Registrar valor aprovado'}</button>
          <button type="button" onClick={()=>restore(r)} className="rounded-lg bg-cyan-800 px-4 py-2 text-sm font-bold text-white">Reabrir avaliação</button>
        </div>
        {editingApprovedId===r.id&&<div className="w-full rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
          <p className="font-bold text-emerald-950">Valor aprovado na avaliação · {r.plate}</p>
          <p className="mb-3 text-xs text-emerald-900">Informe o valor aprovado pela mesa de avaliação. Não exige que o veículo tenha sido comprado. Correções preservam o registro anterior para auditoria.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-900">Valor aprovado na avaliação (R$)
              <input className={input+' mt-1'} inputMode="decimal" type="text" placeholder="Ex.: 76.000,00" value={editingApprovedValue} onChange={e=>setEditingApprovedValue(e.target.value)} />
            </label>
            <label className="text-sm font-semibold text-slate-900">Data da aprovação
              <input className={input+' mt-1'} type="date" max={localDate()} value={editingApprovedDate} onChange={e=>setEditingApprovedDate(e.target.value)} />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={historyBusy||!approvalInputValid(editingApprovedValue)||!editingApprovedDate} onClick={()=>void recordApproved(r)}
              className="rounded-lg bg-emerald-800 px-5 py-2 text-sm font-bold text-white disabled:opacity-40">{historyBusy?'Registrando...':'Confirmar valor aprovado'}</button>
            <button type="button" onClick={()=>setEditingApprovedId('')} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">Cancelar</button>
          </div>
        </div>}
      </div>)}</div>}
  </section>:
  <>
 <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><strong>Piloto oficial:</strong> a busca automática usa páginas indexadas e pode ficar sem anúncios quando a fonte gratuita falhar. A estimativa histórica é independente da Webmotors e recalcula com FIPE, KM, classificação, preparo e destino. Anúncios não auditados não autorizam compras. As avaliações salvas no histórico online podem ser reabertas por perfis autorizados da mesma unidade.</div>
 <section className="rounded-xl bg-white p-5"><h2 className="mb-3 text-xl font-semibold">Nova precificação</h2><div className="grid gap-3 md:grid-cols-2"><label>Tipo de veículo<select className={input} value={vehicleType} onChange={e=>selectVehicleType(e.target.value as 'car'|'motorcycle')}><option value="car">Automóvel / utilitário</option><option value="motorcycle">Motocicleta</option></select></label><div className="hidden md:block"/><label>Placa do veículo<input className={input} value={plate} onChange={e=>setPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,7))} placeholder="ABC1D23" maxLength={7}/></label><div className="hidden md:block" /><label>Marca<select className={input} value={brandCode} onChange={e=>selectBrand(e.target.value)}><option value="">Selecione a marca</option>{brands.map(x=><option key={x.code} value={x.code}>{x.name}</option>)}</select></label><label>Modelo e versão<select className={input} value={modelCode} disabled={!brandCode} onChange={e=>selectModel(e.target.value)}><option value="">Selecione modelo e versão</option>{models.map(x=><option key={x.code} value={x.code}>{x.name}</option>)}</select></label><label>Ano/modelo e combustível<select className={input} value={yearCode} disabled={!modelCode} onChange={e=>selectYear(e.target.value)}><option value="">Selecione ano</option>{years.map(x=><option key={x.code} value={x.code}>{x.name}</option>)}</select></label><label>KM do veículo<input className={input} value={km} onChange={e=>setKm(e.target.value)} inputMode="numeric" placeholder="Ex.: 45000"/></label></div><div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">Tabela FIPE · {vehicleType==='motorcycle'?'motocicletas':'automóveis'} · consulta gratuita</p>{catalogLoading?<p>Consultando catálogo FIPE...</p>:fipe?<><p className="text-2xl font-bold text-slate-900">{money(fipe.value)}</p><p className="text-sm text-slate-700">{fipe.brand} · {fipe.model} · {fipe.year} · {fipe.fuel}</p><p className="text-xs text-slate-600">Código FIPE: {fipe.fipeCode} · Referência: {fipe.referenceMonth}</p></>:<p className="text-sm text-slate-600">Selecione marca, modelo/versão e ano para consultar o valor automaticamente.</p>}{catalogError&&<div className="mt-2 flex flex-wrap items-center gap-3"><p role="alert" className="text-sm text-red-700">{catalogError}</p><button type="button" onClick={()=>{setCatalogError("");setRetryCatalog(x=>x+1);if(brandCode){const current=brandCode;setBrandCode('');window.setTimeout(()=>setBrandCode(current),0);}}} className="rounded-lg border border-cyan-700 px-3 py-1 text-sm font-semibold text-cyan-900">Tentar novamente</button></div>}</div></section>
 {vehicleType==='car'? <section className="rounded-xl border border-indigo-100 bg-white p-5">
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
 </section>:<section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
   <h2 className="text-xl font-bold text-amber-950">Precificação de motocicletas</h2>
   <p className="mt-2 text-sm text-amber-900">A FIPE da moto aparece acima. O modelo histórico de 223 compras foi treinado somente com automóveis e não será aplicado a motos. Para sugerir compra, confira pelo menos 2 anúncios individuais da mesma versão e ano, com quilometragem comparável, e informe os custos de preparo.</p>
   <p className="mt-2 text-sm font-semibold text-amber-950">{marketReady?'Anúncios conferidos disponíveis: o cálculo da Mesa pode ser analisado.':'Sem anúncios suficientes: nenhuma sugestão automática de compra será inventada.'}</p>
 </section>}


 <section className="rounded-xl border border-cyan-200 bg-white p-4">
   <div className="flex flex-wrap items-center justify-between gap-3">
     <div><h3 className="text-base font-bold text-slate-950">Guardar esta avaliação no histórico</h3>
       <p className="text-sm text-slate-700">Salve o veículo, a FIPE, os custos e os anúncios já conferidos. Mesmo sem anúncios, a estimativa será identificada como preliminar.</p>
       {(!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate))&&<p className="mt-1 text-xs font-semibold text-amber-800">Para salvar, informe uma placa válida no início da avaliação.</p>}
     </div>
     <button type="button" onClick={()=>void save()} disabled={historyBusy||!searchReady||!(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate))}
       className="rounded-lg bg-cyan-800 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
       {historyBusy?'Salvando...':'Salvar avaliação no histórico'}
     </button>
   </div>
   <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
     <label className="text-sm font-bold text-slate-900">Valor aprovado na avaliação (R$, opcional)
       <input type="text" inputMode="decimal" className={input+' mt-1'} placeholder="Valor autorizado pela mesa. Ex.: 76.658,00" value={newApprovedValue} onChange={e=>setNewApprovedValue(e.target.value)}/>
     </label>
     <label className="text-sm font-bold text-slate-900">Data da aprovação
       <input type="date" className={input+' mt-1'} max={localDate()} value={newApprovedDate} onChange={e=>setNewApprovedDate(e.target.value)}/>
     </label>
     <p className="text-xs font-medium text-slate-700 sm:col-span-2">Registre o valor aprovado na avaliação, mesmo que o veículo não seja comprado. A estimativa do Motyq continua preservada para comparação; você também pode registrar a aprovação depois, no Histórico de avaliações.</p>
   </div>
   {historyError&&<p role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">{historyError}</p>}
   {notice&&<p role="status" className="mt-2 text-sm font-semibold text-slate-800">{notice}</p>}
 </section>
 {extensionInbox.length>0&&<section className="rounded-xl border-2 border-cyan-300 bg-cyan-50 p-5">
   <h2 className="text-lg font-bold text-cyan-950">Anúncios recebidos da extensão Motyq</h2>
   <p className="mt-1 text-sm text-slate-800">{extensionInbox.length} anúncio(s) aguardando importação. Selecione acima a versão, o ano e a KM do veículo que você está avaliando.</p>
   <div className="mt-3 space-y-2">{extensionInbox.map((ad,i)=><div key={ad.url} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-200 bg-white p-3 text-sm">
     <div><p className="font-semibold text-slate-900">{i+1}. {ad.title||'Anúncio Webmotors'}</p><p className="text-slate-700">{money(number(ad.price))} · {number(ad.km).toLocaleString('pt-BR')} km · {ad.year}</p></div>
     <a href={ad.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-cyan-800 underline">Conferir anúncio</a>
   </div>)}</div>
   <button type="button" disabled={!searchReady} onClick={applyExtensionCapture} className="mt-4 rounded-lg bg-cyan-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">Adicionar anúncios à comparação</button>
   {extensionNotice&&<p role="status" className="mt-2 text-sm font-semibold text-amber-900">{extensionNotice}</p>}
   <p className="mt-2 text-xs text-slate-700">Dados informados manualmente na extensão, não auditados. Nenhuma cotação de compra é aprovada automaticamente.</p>
 </section>}
 <section className="rounded-xl bg-white p-5"><div className="mb-3 flex justify-between gap-3"><div><h2 className="text-xl font-semibold">Comparação de anúncios · Webmotors</h2><p className="text-sm text-slate-700">Use a extensão Motyq IQ para anotar preços e KM de anúncios individuais da Webmotors e enviar para esta mesa. Confira os anúncios antes de classificá-los como válidos.</p></div><div className="flex shrink-0 flex-wrap gap-2"><button className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={()=>void searchMarket()} disabled={autoLoading||!searchReady}>{autoLoading?'Consultando índice...':searchReady?'Busca indexada (opcional)':'Complete o veículo'}</button><button className="rounded-lg bg-slate-800 px-3 py-2 text-white" onClick={()=>{setAds(a=>[...(adsVehicleKey===vehicleKey?a:[]),blank()]);setAdsVehicleKey(vehicleKey);}}>+ Anúncio</button></div></div>
 {!searchReady&&<p className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">
   Para pesquisar, preencha: {missingMarketDetails}. A FIPE não precisa terminar de carregar para liberar a busca.
 </p>}
 {searchReady&&!autoAttempted.current.has(vehicleKey)&&!autoLoading&&<p className="mb-3 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm font-medium text-cyan-950">Para comparar preços reais, abra anúncios na Webmotors e envie as ofertas pela extensão Motyq IQ. A busca indexada é opcional e pode não localizar anúncios verificáveis.</p>}
 {autoLoading&&<p role="status" className="mb-3 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold text-cyan-950">Pesquisando anúncios e verificando preço, ano e KM. Esta consulta pode demorar alguns segundos.</p>}
 {marketMessage&&<p role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{marketMessage}</p>}{searchDiagnostics&&autoResultsVisible&&<p className="mb-2 text-xs text-slate-600">{searchDiagnostics}</p>}
 {autoResultsVisible&&autoSearchedAt&&<p className="mb-3 text-xs text-slate-600">Última pesquisa: {new Date(autoSearchedAt).toLocaleString('pt-BR')} · {indexed.length} preço(s) indexado(s) encontrado(s). Os dados indexados são preliminares e não comprovam anúncio ativo, versão ou histórico.</p>}
 {indexed.length>0&&referenceAvg===0&&<p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
 Foram encontrados {indexed.length} preços indexados, mas nenhum portal apresentou ao menos dois registros distintos e comparáveis em KM para uma média preliminar. Uma única vitrine não define preço de compra.
 </p>}
 {referenceAvg>0&&<div className="mb-4 rounded-xl border border-cyan-200 bg-cyan-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-cyan-800">Simulação automática preliminar · não aprovada</p><p className="mt-1 text-sm text-slate-700">Base: {referenceName} · {referenceLowest.length} menor(es) preço(s) com até 30 mil km de diferença · média {money(referenceAvg)} ({confidenceNote}).</p><p className="mt-1 text-xs text-slate-600">Webmotors: {indexedWebmotors.length} · OLX: {indexedOlx.length} · NaPista: {indexedNapista.length} preço(s) indexado(s) próximos em KM.</p>
 {marketSample.fallback&&<p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-950">Webmotors não forneceu uma amostra mínima aproveitável. A referência abaixo usa {referenceName} somente como apoio, não como cotação Webmotors.</p>}
 <p className="mt-2 text-xs font-semibold text-slate-700">Preços selecionados: {referenceLowest.map(ad=>money(number(ad.price))+' ('+number(ad.km).toLocaleString('pt-BR')+' km)').join(' · ')}.</p>
 {marketSample.sampleContainsCatalogPages&&<p className="mt-1 text-xs font-semibold text-amber-900">A amostra inclui vitrines indexadas, sem comprovação de anúncios individuais. Pode conter preços desatualizados e não representa vendas realizadas.</p>}
 {referenceSource==='webmotors'&&referenceLowest.length===2&&<p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-900">Amostra Webmotors limitada a dois registros indexados; não há anúncio individual confirmado nem preço definitivo.</p>}
 {webmotorsAboveReference&&<p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-900">Atenção: todas as ofertas Webmotors extraídas estão mais de 5% acima da FIPE. A busca pode ter ignorado os menores preços. {referenceAvg>0?'Esta simulação usa '+referenceName+' como apoio, não como cotação definitiva da Webmotors.':'Nenhuma média de mercado foi calculada.'}</p>}<p className="mt-2 text-2xl font-bold text-cyan-950">{money(referenceCeiling)}</p><p className="mt-1 text-xs text-cyan-900">Cálculo: média × 0,86 {repasse?'× 0,95 ':''}− custos {money(number(cost))}. Não é teto definitivo nem aprovação de compra. Anúncios, versão e condições ainda não foram auditados.</p></div>}{currentAds.length===0&&<div className="mb-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
  Ainda não há anúncios associados a este veículo. Nenhum preço foi criado artificialmente.
  {historicalEstimate&&<p className="mt-2 font-bold text-indigo-900">Referência histórica disponível: {money(historicalEstimate.target)} (estimativa de compra, não preço anunciado).</p>}
 </div>}<div className="space-y-3">{currentAds.map((ad,i)=><div key={i} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-4"><label>Portal{ad.auto&&<span className="ml-2 text-xs font-semibold text-cyan-700">{ad.catalog?'Vitrine indexada':'Anúncio indexado'}</span>}<select className={input} disabled={Boolean(ad.auto)} value={ad.source||"webmotors"} onChange={e=>change(i,{source:e.target.value as Ad["source"],url:"",status:"pending"})}><option value="webmotors">Webmotors</option><option value="olx">OLX</option><option value="napista">NaPista</option></select></label>{ad.title&&<p className="self-end text-xs font-semibold text-slate-600 md:col-span-3">{ad.title}{ad.catalog&&<span className="ml-2 text-amber-700">· preço da vitrine, sem link individual</span>}</p>}<label>Preço R$<input className={input} readOnly={Boolean(ad.auto)} value={ad.price} onChange={e=>change(i,{price:e.target.value})}/></label><label>KM anúncio<input className={input} readOnly={Boolean(ad.auto)} value={ad.km} onChange={e=>change(i,{km:e.target.value})}/></label><label>Link da fonte<input className={input} readOnly={Boolean(ad.auto)} value={ad.url} onChange={e=>change(i,{url:e.target.value})}/>{ad.url&&!portalLink(ad)&&<small className="text-red-700">Link HTTPS do portal selecionado necessário.</small>}{ad.catalog&&<small className="text-amber-700">Página de resultados, sem anúncio individual comprovado.</small>}</label><label>Classificação<select className={input} value={ad.auto&&ad.status==='valid'?'pending':ad.status} onChange={e=>change(i,{status:e.target.value==='excluded'?'excluded':ad.auto?'pending':e.target.value as Ad['status']})}><option value="pending">{ad.auto?'Indexado, sem auditoria':'Pendente'}</option><option value="valid" disabled={Boolean(ad.auto||ad.catalog)}>Válido, conferido</option><option value="excluded">Excluir</option></select></label><label className="md:col-span-3">Observação / suspeita de leilão ou sinistro<input className={input} readOnly={Boolean(ad.auto)} value={ad.note} onChange={e=>change(i,{note:e.target.value})}/></label><div className="flex items-end gap-2">{portalLink(ad)&&<a href={ad.url} target="_blank" rel="noopener noreferrer" className="rounded border p-2 text-sm">{ad.catalog?'Ver fonte':'Abrir anúncio'}</a>}<button className="rounded border p-2 text-sm text-red-700" onClick={()=>setAds(a=>a.filter((_,j)=>j!==i))}>Excluir</button></div></div>)}</div><p className="mt-3 text-xs text-amber-800">A ausência de informação sobre leilão não comprova histórico limpo. O usuário deve verificar cada anúncio.</p>{distantKm.length>0&&<p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Atenção: {distantKm.length} anúncio(s) marcado(s) válido(s) têm diferença superior a 30.000 km do veículo. Revise ou exclua antes de salvar.</p>}{suspectAds.length>0&&<p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">Atenção: {suspectAds.length} anúncio(s) válido(s) têm observações de possível leilão, sinistro ou restrição. Exclua da média ou revise a classificação.</p>}</section>
 <section className="grid gap-4 rounded-xl bg-white p-5 md:grid-cols-2"><div><h2 className="mb-3 text-xl font-semibold">Cálculo da Mesa</h2><p className="text-sm text-slate-600">Custos informados: <strong>{money(number(cost))}</strong></p><p className="mt-2 text-sm text-slate-600">Destino: <strong>{repasse?'Repasse · 14% + 5%':'Showroom · 14%'}</strong></p><p className="mt-2 text-xs text-slate-500">Para alterar a classificação, o preparo ou o destino, use os campos no início da análise histórica.</p></div><div className="rounded-xl bg-slate-50 p-4"><p>{valid.length} anúncio(s) válido(s) de {currentAds.length}</p><p className="text-sm">Webmotors: {primary.length} válido(s), média {money(avg)} · OLX: {secondary.length} válido(s), média {money(olxAvg)}</p>{primary.length>0&&secondary.length>0&&<p className="text-xs text-slate-600">Diferença OLX x Webmotors: {money(olxAvg-avg)}. Apenas referência, sem ajuste automático.</p>}<p className="text-xs text-slate-600">Anúncios válidos ordenados do menor preço: {sortedValid.length?sortedValid.map(a=>money(number(a.price))).join(" · "):"nenhuma"}</p>{primary.length>0&&<><p>Média dos menores Webmotors conferidos: <strong>{money(avg)}</strong></p><p>Após 14%: {money(avg*.86)}</p>{repasse&&<p>Após 5% adicionais: {money(avg*.86*.95)}</p>}</>}<p>Custos: {money(number(cost))}</p><p className="mt-3 text-lg font-semibold">Precificação da Mesa</p>{marketReady?<><p className="text-xs font-semibold text-emerald-700">Teto com anúncios conferidos</p><p className="text-3xl font-bold text-emerald-700">{money(ceiling)}</p></>:referenceAvg>0?<><p className="text-xs font-semibold text-amber-800">Estimativa automática, não aprovada · {referenceName}</p><p className="text-3xl font-bold text-cyan-800">{money(referenceCeiling)}</p><p className="mt-1 text-xs text-slate-600">Teto definitivo indisponível até conferir 2 anúncios individuais Webmotors. {marketSample.sampleContainsCatalogPages?'Os dados podem reunir preços de vitrines sem anúncios individuais confirmados.':''}</p></>:historicalEstimate?<div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
 <p className="text-xs font-bold uppercase tracking-wider text-indigo-800">Sem anúncios indexados · usando histórico de compras</p>
 <p className="mt-1 text-3xl font-black text-indigo-950">{money(historicalEstimate.target)}</p>
 <p className="mt-1 text-xs text-indigo-900">Faixa estimada {money(historicalEstimate.rangeMin)} a {money(historicalEstimate.rangeMax)}. Ajusta automaticamente com FIPE, KM, classificação, custos e destino. Não é preço de anúncio nem compra aprovada.</p>
 </div>:<p className="text-sm font-semibold text-amber-800">Sem anúncios confiáveis. Para obter o preço histórico, selecione a classificação da avaliação e confira FIPE e KM acima.</p>}</div></section>
 <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">O histórico permanente fica na aba <button type="button" onClick={()=>switchDeskSection('history')} className="font-bold text-cyan-800 underline">Histórico de avaliações</button>. Cada versão salva mantém data, responsável, anúncios, custos e valor registrado.</section>
 </>}
 </main>;
}
