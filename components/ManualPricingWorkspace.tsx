import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
type Item={code:string;name:string};
type FipeDetail={value:number;brand:string;model:string;year:number;fuel:string;referenceMonth:string;fipeCode:string;referenceStatus?:'current'|'outdated'|'unverified';referenceSource?:string;expectedReference?:string};
import {User} from '../types';
import {auth} from '../firebase';
import MarketIqManagementDashboard from './MarketIqManagementDashboard';
import MarketIqMobileExperience from './MarketIqMobileExperience';
import MarketIqLearningPanel from './MarketIqLearningPanel';
import MarketIqMonthlyArchivePanel from './MarketIqMonthlyArchivePanel';
import MarketIqPlateHistoryPanel from './MarketIqPlateHistoryPanel';
import MarketIqIntelligentHistoryPanel from './MarketIqIntelligentHistoryPanel';
import {mesaReferenceKey,type MesaPriceReference} from '../services/marketIqMesaPricePattern';
import MarketIqConfidencePanel from './MarketIqConfidencePanel';
import MarketIqFleetClassificationPanel from './MarketIqFleetClassificationPanel';
import {classifyByMileage,resolveFleetPolicy,type FleetClass,type DestinationOverride,type DirectRepasseReason} from '../services/marketIqFleetClassification';
import {assessMarketIqEvidence} from '../services/marketIqConfidence';
import MarketIqConsultedRepasse from './MarketIqConsultedRepasse';
import MarketIqApprovalCenter from './MarketIqApprovalCenter';
import {calculateHistoricalPrice, MOTYQ_HISTORY_MODEL, HistoricalClass} from '../services/marketIqHistoricalPricing';
import {calculateMotorcycleMarketReference,loadMotorcyclesForUser} from '../services/marketIqMotorcycleReference';
import {chooseIndexedMarketSample} from '../services/marketIqIndexedSample';
import {rankWebmotorsCandidates} from '../services/marketIqWebmotorsShortlist';
import MarketIqWebmotorsShortlistPanel from './MarketIqWebmotorsShortlistPanel';
import MarketIqAssistedCapturePanel from './MarketIqAssistedCapturePanel';
import MarketIqCapturedReviewPanel from './MarketIqCapturedReviewPanel';
import {readCaptureReturnContext,writeCaptureReturnContext,capturedOffersFitReturnContext}
 from '../services/marketIqCaptureReturnContext';
import {
 captureDraftKey,readCaptureDraft,writeCaptureDraft,clearCaptureDraft,CAPTURE_DRAFT_DAYS,
 type CaptureReviewSelections
} from '../services/marketIqCapturedDraftStorage';
import type {VisibleOffer} from '../services/marketIqAssistedOffers';
import {buildWebmotorsBrowseLinks,withWebmotorsOrder,WEBMOTORS_REGIONS,type WebmotorsRegion,type WebmotorsOrder}
 from '../services/marketIqWebmotorsBrowseLinks';
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

type NegotiatedProposal={negotiatedOffer:number;baseSuggestion:number;requestedByManager:string;negotiationReason:string};
type Saved={negotiatedOffer?:number|null;baseSuggestion?:number|null;requestedByManager?:string;negotiationReason?:string;negotiationStatus?:string;classificationReason?:string;directRepasseReason?:DirectRepasseReason;goodLiquidity?:boolean;vehicleType?:'car'|'motorcycle';approvedValue?:number;approvedAt?:string;approvedRecordedAt?:string;approvedRecordedBy?:string;approvedRecordedEmail?:string;paidValue?:number;paidAt?:string;paidRecordedAt?:string;paidRecordedBy?:string;paidRecordedEmail?:string;paidFromApproval?:boolean;groupedRecords?:number;valuationVersions?:number;revisionCount?:number;revisedAt?:string;revisedBy?:string;id:string;createdAt?:string;createdByName?:string;createdByEmail?:string;companyId?:string;storeId?:string;date:string;plate?:string;model:string;year:string;km:string;cost:string;repasse:boolean;ads:Ad[];value:number;provisional?:boolean;referenceName?:string;historicalTarget?:number;historicalClass?:HistoricalClass;brand?:string;brandCode?:string;modelCode?:string;yearCode?:string;fipe?:FipeDetail|null};
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
 const [deskSection,setDeskSection]=useState<'dashboard'|'pricing'|'consulted'|'approvals'|'history'|'learning'|'archive'|'plateHistory'>(()=>{
   if(new URLSearchParams(window.location.hash.replace(/^#/,'')).has('motyq-import'))return 'pricing';
   const previous=sessionStorage.getItem('motyq-iq-active-desk-tab');
   return previous==='pricing'||previous==='consulted'||previous==='approvals'||previous==='history'||previous==='learning'||previous==='archive'||previous==='plateHistory'?previous:'dashboard';
 });
 const [selectedPlateForHistory,setSelectedPlateForHistory]=useState('');
 const [mobileFullDesk,setMobileFullDesk]=useState(false);
 const switchDeskSection=(next:'dashboard'|'pricing'|'consulted'|'approvals'|'history'|'learning'|'archive'|'plateHistory')=>{
   setDeskSection(next);try{sessionStorage.setItem('motyq-iq-active-desk-tab',next);}catch{}
 };
 const formKey='motyq-iq-preview-inputs-'+user.email.toLowerCase();
 const captureScope=[user.companyId||'',user.storeId||'',user.email.toLowerCase()].join('|');
 const pendingCaptureKey='__captured_in_another_tab__';
 const [returnSuggestion]=useState(()=>readCaptureReturnContext(window.localStorage,captureScope));
 const savedForm=useMemo(()=>{
   try {const item=sessionStorage.getItem(formKey);return item?JSON.parse(item):{};} catch{return {};}
 },[formKey]);
 const [vehicleType,setVehicleType]=useState<'car'|'motorcycle'>(()=>savedForm.vehicleType==='motorcycle'?'motorcycle':'car');
 const [plate,setPlate]=useState<string>(()=>typeof savedForm.plate==='string'?savedForm.plate:'');const [retryCatalog,setRetryCatalog]=useState(0);const [fipeRefreshKey,setFipeRefreshKey]=useState(0);
 const [model,setModel]=useState<string>(()=>typeof savedForm.model==='string'?savedForm.model:'');const [year,setYear]=useState<string>(()=>typeof savedForm.year==='string'?savedForm.year:'');
 const [brand,setBrand]=useState<string>(()=>typeof savedForm.brand==='string'?savedForm.brand:'');const [brandCode,setBrandCode]=useState<string>(()=>typeof savedForm.brandCode==='string'?savedForm.brandCode:'');const [modelCode,setModelCode]=useState<string>(()=>typeof savedForm.modelCode==='string'?savedForm.modelCode:'');const [yearCode,setYearCode]=useState<string>(()=>typeof savedForm.yearCode==='string'?savedForm.yearCode:'');
 const [brands,setBrands]=useState<Item[]>([]);const [models,setModels]=useState<Item[]>([]);const [years,setYears]=useState<Item[]>([]);
 const [fipe,setFipe]=useState<FipeDetail|null>(null);const [catalogError,setCatalogError]=useState('');const [catalogLoading,setCatalogLoading]=useState(false);const [km,setKm]=useState<string>(()=>typeof savedForm.km==='string'?savedForm.km:'');const [cost,setCost]=useState<string>(()=>typeof savedForm.cost==='string'?savedForm.cost:'0');const [destinationOverride,setDestinationOverride]=useState<DestinationOverride>(()=>
 savedForm.destinationOverride==='repasse'?'repasse':savedForm.destinationOverride==='auto'?'auto':
 savedForm.repasse===true&&['A','B','C'].includes(String(savedForm.classification||classifyByMileage(savedForm.km)?.classification||''))?'repasse':'auto');
 const [ads,setAds]=useState<Ad[]>([]);const [adsVehicleKey,setAdsVehicleKey]=useState('');const [notice,setNotice]=useState('');
 const freshCaptureRef=useRef<CapturedAd[]|null>(decodeExtensionTransfer(window.location.hash));
 const [extensionInbox,setExtensionInbox]=useState<CapturedAd[]>(()=>{
   const fresh=freshCaptureRef.current||[];
   if(fresh.length)return fresh;
   return (readCaptureDraft(window.localStorage,captureScope,pendingCaptureKey)?.captured||[]) as CapturedAd[];
 });
 const [captureReview,setCaptureReview]=useState<CaptureReviewSelections>({selectedIds:null,checkedIds:[]});
 const [captureHydrated,setCaptureHydrated]=useState('');
 const hydratedIdentityRef=useRef('');
 const [captureSavedLocally,setCaptureSavedLocally]=useState(false);
 const [extensionNotice,setExtensionNotice]=useState('');
 useEffect(()=>{
   if(new URLSearchParams(window.location.hash.replace(/^#/,'')).has('motyq-import')){
     window.history.replaceState(null,'',window.location.pathname+window.location.search);
   }
 },[]);

 const [manualClassification,setManualClassification]=useState<FleetClass|''>(()=>{
 const current=String(savedForm.manualClassification||'');
 if(['A','B','C','D','E'].includes(current))return current as FleetClass;
 const old=String(savedForm.classification||'');
 return ['A','B','C','D','E'].includes(old)&&old!==classifyByMileage(savedForm.km)?.classification?old as FleetClass:'';
 });
 const [classificationReason,setClassificationReason]=useState<string>(()=>String(savedForm.classificationReason||'').slice(0,280));
 const [directRepasseReason,setDirectRepasseReason]=useState<DirectRepasseReason>(()=>
 ['sinistro','leilao','estrutura','cautelar'].includes(savedForm.directRepasseReason)?savedForm.directRepasseReason:'none');
 const [goodLiquidity,setGoodLiquidity]=useState<boolean>(()=>savedForm.goodLiquidity===true);
 const fleetPolicy=resolveFleetPolicy({mileage:km,manualClassification,destinationOverride,directRepasseReason});
 const classification:HistoricalClass|''=fleetPolicy.classification||'';
 const repasse=fleetPolicy.destination!=='SHOWROOM';
 const [autoLoading,setAutoLoading]=useState(false);const [autoError,setAutoError]=useState('');
 const [autoSearchedAt,setAutoSearchedAt]=useState('');const [autoSearchKey,setAutoSearchKey]=useState('');
 const [searchDiagnostics,setSearchDiagnostics]=useState('');
 const [indexedBrowsePages,setIndexedBrowsePages]=useState<{title:string;url:string}[]>([]);
 const [webmotorsOrder,setWebmotorsOrder]=useState<WebmotorsOrder>('lowest-price');
 const regionKey='motyq-iq-webmotors-region-'+user.email.toLowerCase();
 const [marketRegion,setMarketRegion]=useState<WebmotorsRegion>(()=>{
   try{
     const value=sessionStorage.getItem(regionKey);
     return WEBMOTORS_REGIONS.some(r=>r.id===value)?value as WebmotorsRegion:'sp';
   }catch{return 'sp';}
 });
 useEffect(()=>{try{sessionStorage.setItem(regionKey,marketRegion);}catch{}},[regionKey,marketRegion]);
 // A provider HTTP 429 is not a vehicle/FIPE failure. Remember a short
 // retry window in this browser tab to avoid hammering a shared free quota.
 const cooldownKey='motyq-iq-market-source-pause-v1';
 const [marketCooldownUntil,setMarketCooldownUntil]=useState<number>(()=>{
   try{
     const value=Number(sessionStorage.getItem(cooldownKey)||0);
     return Number.isFinite(value)&&value>Date.now()?value:0;
   }catch{return 0;}
 });
 const [marketClock,setMarketClock]=useState(()=>Date.now());
 useEffect(()=>{
   if(marketCooldownUntil<=Date.now())return;
   const timer=window.setInterval(()=>setMarketClock(Date.now()),30000);
   return ()=>window.clearInterval(timer);
 },[marketCooldownUntil]);
 const marketCooldownActive=marketCooldownUntil>marketClock;
 const marketCooldownMinutes=marketCooldownActive?Math.ceil((marketCooldownUntil-marketClock)/60000):0;
 const autoAttempted=useRef<Set<string>>(new Set());
 useEffect(()=>{
   try{sessionStorage.setItem(formKey,JSON.stringify({vehicleType,plate,brand,brandCode,model,modelCode,year,yearCode,km,cost,repasse,classification,manualClassification,classificationReason,destinationOverride,directRepasseReason,goodLiquidity}));}catch{}
 },[formKey,vehicleType,plate,brand,brandCode,model,modelCode,year,yearCode,km,cost,repasse,classification,manualClassification,classificationReason,destinationOverride,directRepasseReason,goodLiquidity]);
 const vehicleKey=[vehicleType,brandCode,modelCode,yearCode,km].join('|');
 const autoResultsVisible=autoSearchKey===vehicleKey;
 const currentAds=adsVehicleKey===vehicleKey?ads:[];
 const marketYear=Number(fipe?.year||String(yearCode).match(/^(?:19|20)\d{2}/)?.[0]||String(year).match(/(?:19|20)\d{2}/)?.[0]||0);
 const searchReady=Boolean(brand&&model&&marketYear>=1990&&number(km)>0);
 // An operator's version choice is scoped to the current FIPE vehicle.
 // Switching model/year cannot accidentally reuse a different trim.
 const versionSignature=[vehicleType,brandCode,modelCode,yearCode,brand,model,marketYear].join('|');
 const [webmotorsVersionOverride,setWebmotorsVersionOverride]=useState<{signature:string;slug:string}|null>(null);
 const activeVersionSlug=webmotorsVersionOverride?.signature===versionSignature?
   webmotorsVersionOverride.slug:null;
 const webmotorsBrowse=useMemo(()=>buildWebmotorsBrowseLinks({
   brand,model,year:marketYear,vehicleType
 },marketRegion,activeVersionSlug),[brand,model,marketYear,vehicleType,marketRegion,activeVersionSlug]);
 const orderedWebmotorsVersionUrl=useMemo(()=>withWebmotorsOrder(webmotorsBrowse.versionUrl,webmotorsOrder),
   [webmotorsBrowse.versionUrl,webmotorsOrder]);
 const orderedWebmotorsModelUrl=useMemo(()=>withWebmotorsOrder(webmotorsBrowse.modelUrl,webmotorsOrder),
   [webmotorsBrowse.modelUrl,webmotorsOrder]);

 // Browser-only draft, scoped by current user, company, store, FIPE entry, KM and plate.
 const captureKey=captureDraftKey({vehicleType,brandCode,modelCode,yearCode,km,plate});
 const captureIdentity=captureScope+'|'+captureKey;
 const captureFitsCurrent=searchReady&&capturedOffersFitReturnContext(
  extensionInbox,webmotorsBrowse.modelUrl,marketYear
 );
 const returnBrowse=returnSuggestion?buildWebmotorsBrowseLinks({
  brand:returnSuggestion.brand,model:returnSuggestion.model,year:returnSuggestion.marketYear,
  vehicleType:returnSuggestion.vehicleType
 },'sp').modelUrl:null;
 const canRestoreReturn=Boolean(!searchReady&&returnSuggestion&&
  capturedOffersFitReturnContext(extensionInbox,returnBrowse,returnSuggestion.marketYear));
 const restoreCaptureContext=()=>{
  if(!returnSuggestion||!canRestoreReturn)return;
  setVehicleType(returnSuggestion.vehicleType);
  setPlate(returnSuggestion.plate);
  setBrand(returnSuggestion.brand);setBrandCode(returnSuggestion.brandCode);
  setModel(returnSuggestion.model);setModelCode(returnSuggestion.modelCode);
  setYear(returnSuggestion.year);setYearCode(returnSuggestion.yearCode);
  setKm(returnSuggestion.km);setCost(returnSuggestion.cost);
  setFipe(null);
  setExtensionNotice('Avaliação recuperada. Confira placa, KM e versão antes de importar.');
 };
 // Keep the last complete form available to other tabs. Reuse requires
 // an explicit click and matching captured make, model and year.
 useEffect(()=>{
  if(!searchReady||!brandCode||!modelCode||!yearCode)return;
  writeCaptureReturnContext(window.localStorage,captureScope,{
   vehicleType,plate,brand,brandCode,model,modelCode,year,yearCode,marketYear,km,cost
  });
 },[captureScope,searchReady,vehicleType,plate,brand,brandCode,model,modelCode,year,
    yearCode,marketYear,km,cost]);
 // Store the inbox independently when returning in a tab without the form.
 useEffect(()=>{
  if(!extensionInbox.length)return;
  if(!searchReady||!captureFitsCurrent){
   writeCaptureDraft(window.localStorage,captureScope,pendingCaptureKey,{
    captured:extensionInbox,imported:[],review:{selectedIds:null,checkedIds:[]}
   });
  }
 },[captureScope,searchReady,captureFitsCurrent,extensionInbox]);

 useEffect(()=>{
  if(!searchReady||hydratedIdentityRef.current===captureIdentity)return;
  hydratedIdentityRef.current=captureIdentity;
  const draft=readCaptureDraft(window.localStorage,captureScope,captureKey);
  const pending=readCaptureDraft(window.localStorage,captureScope,pendingCaptureKey);
  const latest=freshCaptureRef.current?.length?freshCaptureRef.current:
   extensionInbox.length?extensionInbox:(pending?.captured||[]) as CapturedAd[];
  freshCaptureRef.current=null;
  const matches=capturedOffersFitReturnContext(latest,webmotorsBrowse.modelUrl,marketYear);
  if(matches){
   const old=new Map((draft?.captured||[]).map(ad=>[ad.url,ad]));
   const unchanged=new Set(latest.filter(ad=>{
    const previous=old.get(ad.url);
    return Boolean(previous&&previous.price===ad.price&&previous.km===ad.km&&previous.year===ad.year);
   }).map(ad=>ad.url));
   setExtensionInbox(latest);
   setCaptureReview({
    checkedIds:(draft?.review.checkedIds||[]).filter(id=>unchanged.has(id)),
    selectedIds:draft?.review.selectedIds===null?null:
     (draft?.review.selectedIds||[]).filter(id=>unchanged.has(id))
   });
  }else{
   setExtensionInbox((draft?.captured?.length?draft.captured:latest) as CapturedAd[]);
   setCaptureReview(draft?.review||{selectedIds:null,checkedIds:[]});
   if(latest.length&&!draft?.captured?.length)
    setExtensionNotice('Captura guardada, mas marca, modelo ou ano não correspondem à avaliação selecionada.');
  }
  if(draft?.imported.length){
   setAdsVehicleKey(vehicleKey);
   setAds(existing=>{
    const prior=adsVehicleKey===vehicleKey?existing:[];
    const urls=new Set(prior.map(ad=>ad.url));
    return [...prior,...draft.imported.filter(ad=>!urls.has(ad.url))].slice(0,50);
   });
  }
  setCaptureSavedLocally(Boolean(draft));
  setCaptureHydrated(captureIdentity);
 },[captureIdentity,searchReady]);
 useEffect(()=>{
  if(!searchReady||!captureFitsCurrent||captureHydrated!==captureIdentity)return;
  const capturedUrls=new Set(extensionInbox.map(ad=>ad.url));
  const imported=(adsVehicleKey===vehicleKey?ads:[]).filter(ad=>
   !ad.auto&&ad.source==='webmotors'&&capturedUrls.has(ad.url)&&validSource(ad));
  const ok=writeCaptureDraft(window.localStorage,captureScope,captureKey,{
   captured:extensionInbox,imported,review:captureReview
  });
  setCaptureSavedLocally(ok);
  if(ok)clearCaptureDraft(window.localStorage,captureScope,pendingCaptureKey);
 },[captureIdentity,captureHydrated,searchReady,captureFitsCurrent,captureScope,captureKey,
    extensionInbox,ads,adsVehicleKey,vehicleKey,captureReview]);
 const clearLocalCapture=()=>{
  if(!window.confirm('Apagar a captura e os anúncios locais desta avaliação? O histórico online não será alterado.'))return;
  clearCaptureDraft(window.localStorage,captureScope,captureKey);
  clearCaptureDraft(window.localStorage,captureScope,pendingCaptureKey);
  const urls=new Set(extensionInbox.map(ad=>ad.url));
  setAds(existing=>existing.filter(ad=>!urls.has(ad.url)));
  hydratedIdentityRef.current='';
  setCaptureHydrated('');
  setCaptureSavedLocally(false);
  setExtensionInbox([]);
  setCaptureReview({selectedIds:null,checkedIds:[]});
  setExtensionNotice('Rascunho local descartado. O histórico online não foi alterado.');
 };

 const applyExtensionCapture=(selectedAds:CapturedAd[])=>{
   if(!searchReady||!captureFitsCurrent){setExtensionNotice('Complete a ficha correta (marca, modelo, ano e KM) antes de importar.');return;}
   if(selectedAds.some(x=>x.year!==marketYear)){
     setExtensionNotice('Os anúncios importados têm ano diferente do veículo selecionado. Confira o ano antes de continuar.');
     return;
   }
   const browseParts=webmotorsBrowse.modelUrl?
    new URL(webmotorsBrowse.modelUrl).pathname.split('/').filter(Boolean):[];
   const expectedBrand=browseParts[2],expectedModel=browseParts[3];
   const validIncoming=selectedAds.filter(x=>{
    if(!validSource(x)||!expectedBrand||!expectedModel)return false;
    try{
      const segments=new URL(x.url).pathname.split('/').filter(Boolean);
      return segments[0]==='comprar'&&segments[1]===expectedBrand&&segments[2]===expectedModel;
    }catch{return false;}
   });
   if(!validIncoming.length){setExtensionNotice('Nenhum link individual da marca e do modelo selecionados foi encontrado. Confira o veículo e a página capturada.');return;}
   setAdsVehicleKey(vehicleKey);
   setAutoSearchKey(vehicleKey);
   autoAttempted.current.add(vehicleKey);
   setAds(existing=>{
     const prior=adsVehicleKey===vehicleKey?existing:[];
     const existingUrls=new Set(prior.map(ad=>ad.url));
     return [...prior,...validIncoming.filter(ad=>!existingUrls.has(ad.url))];
   });
   setExtensionNotice(validIncoming.length+' anúncio(s) incluído(s) como PENDENTES. Confira cada um e marque Válido, conferido antes do cálculo definitivo.');
 };
 const importTextOffers=(offers:VisibleOffer[])=>{
   if(!searchReady)return;
   setAdsVehicleKey(vehicleKey);
   setAds(existing=>{
     const prior=adsVehicleKey===vehicleKey?existing:[];
     const existingDrafts=new Set(prior.filter(x=>!x.url).map(x=>[x.price,x.km,x.title].join('|')));
     const drafts:Ad[]=offers.slice(0,15).map(x=>({
       source:'webmotors',price:String(Math.round(x.price)),km:String(Math.round(x.km)),
       url:'',status:'pending',auto:false,catalog:false,
       title:x.title+' · '+x.version,
       note:'Lista copiada da Webmotors, SEM ANÚNCIO INDIVIDUAL. '+x.location+
         '. Confira versão, preço e KM e preencha o link individual para validar.'
     }));
     return [...prior,...drafts.filter(ad=>{
       const key=[ad.price,ad.km,ad.title].join('|');
       if(existingDrafts.has(key))return false;
       existingDrafts.add(key);return true;
     })].slice(0,50);
   });
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
 const [historyStatus,setHistoryStatus]=useState<'all'|'approved'|'paid'|'reviewed'|'preliminary'|'draft'>('all');
 const [historyMore,setHistoryMore]=useState(false);
 const [migrateBusy,setMigrateBusy]=useState(false);
 const historyRequest=async(action:'list'|'save'|'approved'|'paid',evaluation?:Saved,event?:{evaluationId:string;amount:number;approvedAt?:string;paidAt?:string})=>{
   const currentUser=auth.currentUser;
   if(!currentUser)throw new Error('Sessão encerrada. Entre novamente.');
   const token=await currentUser.getIdToken();
   const response=await fetch('/api/marketiq-market-scan',{
     method:'POST',cache:'no-store',
     headers:{'content-type':'application/json','Authorization':'Bearer '+token},
     body:JSON.stringify({action:'pricing_history_'+action,...(evaluation?{evaluation}:{}),...(event||{})}),
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
     setNotice('Valor aprovado e efetivamente pago registrado. O Aprendizado IQ usará esse valor sem alterar a estimativa original.');
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
   return matches&&(historyStatus==='all'||(historyStatus==='approved'?Number(r.approvedValue)>0||Number(r.paidValue)>0:historyStatus==='paid'?Number(r.paidValue)>0||Number(r.approvedValue)>0:status===historyStatus));
 });

 const catalog=async(action:string,params:Record<string,string>,signal:AbortSignal)=>{const query=new URLSearchParams({action,vehicleType,...params});const cacheKey='motyq-iq-fipe-v2-'+new Date().toISOString().slice(0,7)+'-'+query.toString();const stored=action==='detail'?null:sessionStorage.getItem(cacheKey);if(stored){try{return JSON.parse(stored);}catch{sessionStorage.removeItem(cacheKey);}}let lastError:Error=new Error('FIPE indisponível');for(let attempt=0;attempt<3;attempt++){if(signal.aborted)throw new DOMException('Consulta cancelada','AbortError');try{const response=await fetch('/api/marketiq-fipe?'+query.toString(),{signal,cache:'no-store'});if(!response.ok){lastError=new Error('FIPE HTTP '+response.status);if(response.status<500&&response.status!==429)throw lastError;}else{const data=await response.json();sessionStorage.setItem(cacheKey,JSON.stringify(data));return data;}}catch(e:any){if(e?.name==='AbortError')throw e;lastError=e instanceof Error?e:lastError;}if(attempt<2)await new Promise<void>((resolve,reject)=>{const timer=window.setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},500*(attempt+1));const cancel=()=>{window.clearTimeout(timer);reject(new DOMException('Consulta cancelada','AbortError'));};signal.addEventListener('abort',cancel,{once:true});});}throw lastError;};
 useEffect(()=>{const controller=new AbortController();setCatalogLoading(true);catalog('brands',{},controller.signal).then(v=>setBrands(v.items||[])).catch(e=>{if(e.name!=='AbortError')setCatalogError('Não foi possível carregar as marcas. Use Tentar novamente.');}).finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});return()=>controller.abort();},[retryCatalog,vehicleType]);
 useEffect(()=>{setModels([]);if(!brandCode)return;const controller=new AbortController();setCatalogLoading(true);setCatalogError('');catalog('models',{brandCode},controller.signal).then(v=>setModels(v.items||[])).catch(e=>{if(e.name!=='AbortError')setCatalogError('Não foi possível carregar os modelos. Tente novamente em alguns instantes.');}).finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});return()=>controller.abort();},[brandCode,vehicleType]);
 useEffect(()=>{setYears([]);if(!brandCode||!modelCode)return;const controller=new AbortController();setCatalogLoading(true);setCatalogError('');catalog('years',{brandCode,modelCode},controller.signal).then(v=>setYears(v.items||[])).catch(e=>{if(e.name!=='AbortError')setCatalogError('Não foi possível carregar os anos. Tente novamente em alguns instantes.');}).finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});return()=>controller.abort();},[brandCode,modelCode,vehicleType]);
 useEffect(()=>{setFipe(null);if(!brandCode||!modelCode||!yearCode)return;const controller=new AbortController();setCatalogLoading(true);setCatalogError('');catalog('detail',{brandCode,modelCode,yearCode},controller.signal).then(v=>{if(Number(v.value)>0)setFipe(v);else setCatalogError('Valor FIPE indisponível para esta versão.');}).catch(e=>{if(e.name!=='AbortError')setCatalogError('Não foi possível consultar o valor FIPE. Tente novamente em alguns instantes.');}).finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});return()=>controller.abort();},[brandCode,modelCode,yearCode,vehicleType,fipeRefreshKey]);
 const selectVehicleType=(next:'car'|'motorcycle')=>{
   if(next===vehicleType)return;
   setVehicleType(next);setBrandCode('');setBrand('');setModelCode('');setModel('');
   setYearCode('');setYear('');setFipe(null);setAds([]);setAutoSearchKey('');setKm('');setManualClassification('');setClassificationReason('');setDestinationOverride('auto');setDirectRepasseReason('none');setGoodLiquidity(false);
   setNotice('Tipo de veículo alterado. Selecione a marca, o modelo e o ano novamente.');
 };
 const selectBrand=(code:string)=>{setManualClassification('');setClassificationReason('');setDestinationOverride('auto');setDirectRepasseReason('none');setGoodLiquidity(false);setBrandCode(code);setBrand(brands.find(x=>x.code===code)?.name||'');setModelCode('');setModel('');setYearCode('');setYear('');setFipe(null);};
 const selectModel=(code:string)=>{setManualClassification('');setClassificationReason('');setDestinationOverride('auto');setDirectRepasseReason('none');setGoodLiquidity(false);setModelCode(code);setModel(models.find(x=>x.code===code)?.name||'');setYearCode('');setYear('');setFipe(null);};
 const selectYear=(code:string)=>{setYearCode(code);setYear(years.find(x=>x.code===code)?.name||'');setFipe(null);};
 const change=(index:number,patch:Partial<Ad>)=>setAds(a=>a.map((x,i)=>i===index?{...x,...patch}:x));
 const searchMarket=async()=>{
   if(!searchReady){setAutoError('Informe '+missingMarketDetails+' para pesquisar anúncios.');setAutoSearchKey(vehicleKey);return;}
   if(autoLoading)return;
   if(marketCooldownUntil>Date.now()){
     setAutoError('A fonte gratuita ainda está em pausa por limite de consultas. Use a referência histórica ou anúncios Webmotors conferidos.');
     setAutoSearchKey(vehicleKey);
     return;
   }
   autoAttempted.current.add(vehicleKey);
   setAdsVehicleKey(vehicleKey);
   setAutoSearchKey(vehicleKey);
   setAutoLoading(true);setAutoError('');setAutoSearchedAt('');setSearchDiagnostics('');setIndexedBrowsePages([]);
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
     if(response.status===429&&payload?.code==='MARKET_SOURCE_RATE_LIMIT'){
       const seconds=Math.min(3600,Math.max(60,Number(payload.retryAfterSeconds)||900));
       const until=Date.now()+seconds*1000;
       setMarketCooldownUntil(until);
       setMarketClock(Date.now());
       try{sessionStorage.setItem(cooldownKey,String(until));}catch{}
       setAutoSearchKey(vehicleKey);
       setAutoError('A fonte gratuita atingiu o limite de consultas (HTTP 429). A busca foi pausada para evitar novas tentativas sem resultado. FIPE, classificação e referência histórica continuam disponíveis.');
       return;
     }
     if(!response.ok)throw new Error(payload.error||'Pesquisa automática indisponível.');
     setIndexedBrowsePages((Array.isArray(payload.browsePages)?payload.browsePages:[]).filter((item:any)=>
       item&&isWebmotors(String(item.url||''))).slice(0,4).map((item:any)=>({
         title:String(item.title||'Ofertas Webmotors').slice(0,110),url:String(item.url||'')
       })));
     const found:Ad[]=(Array.isArray(payload.ads)?payload.ads:[]).filter((item:any)=>
       item&&item.source==='webmotors'&&isWebmotors(item.url)&&
       Number(item.price)>0&&Number(item.km)>0&&Number(item.year)===marketYear
     ).map((item:any)=>({
       source:'webmotors',price:String(item.price),km:String(item.km),url:String(item.url),
       status:'pending' as const,auto:true,catalog:Boolean(item.catalog),title:String(item.title||''),
       note:'Índice Webmotors (não confirmado): '+String(item.evidence||'Dados indexados, ainda não conferidos na página.').slice(0,220)
     }));
     setAutoSearchKey(vehicleKey);
     const pages=Number(payload.pagesFound||0),full=Number(payload.sourcePagesWithFullContent||0);
     const parts=(Array.isArray(payload.sourcesChecked)?payload.sourcesChecked:[]).map((source:any)=>
       String(source.source)+': '+(source.available?String(source.pageCount||0)+' página(s)':'indisponível ('+String(source.error||'sem resposta').slice(0,90)+')'));
     const evidence=payload.evidenceSummary||{};
     const fullByPortal=evidence.fullContentByPortal||{};
     setSearchDiagnostics('Páginas localizadas: '+pages+' · texto disponível: '+full+
       ' (Webmotors: '+Number(fullByPortal.webmotors||0)+')'+
       ' · páginas individuais: '+Number(evidence.individualPages||0)+
       ' · trechos com preço + KM + ano + modelo: '+Number(evidence.snippetPriceAndKm||0)+
       ' · '+parts.join(' · '));
     setAutoSearchedAt(String(payload.searchedAt||new Date().toISOString()));
     setAds(existing=>[...found,...(adsVehicleKey===vehicleKey?existing:[]).filter(a=>!a.auto&&(a.price||a.km||a.url||a.note))]);
     if(!found.length)setAutoError('O índice localizou páginas da Webmotors, mas não conseguiu extrair ofertas individuais com ano, versão, preço e KM verificáveis. Isso NÃO significa ausência de veículos à venda. Confira as páginas indicadas ou registre anúncios conferidos.');
   }catch(error:any){
     setAutoSearchKey(vehicleKey);
     setAutoError((error?.name==='TimeoutError'?'A fonte de anúncios demorou demais.':error?.message||'Pesquisa automática indisponível.')+' Use anúncios individuais conferidos quando não houver dados automáticos.');
   }finally{setAutoLoading(false);}
 };
 // Indexed results are optional and not audited; do not run a speculative
 // background lookup for every selected vehicle. The primary workflow is the
 // user-assisted Webmotors extension plus verified individual listings.
 const valid=useMemo(()=>currentAds.filter(a=>!a.auto&&a.source==='webmotors'&&a.status==='valid'&&number(a.price)>0&&number(a.km)>0&&!a.catalog&&validSource(a)),[currentAds]);
 const sortedValid=useMemo(()=>[...valid].sort((a,b)=>number(a.price)-number(b.price)),[valid]);
 const primary=sortedValid.filter(a=>a.source==='webmotors');
 const secondary=sortedValid.filter(a=>a.source==='olx');
 const indexed=autoResultsVisible?currentAds.filter(a=>a.auto&&a.source==='webmotors'&&a.status!=='excluded'&&portalLink(a)&&number(a.price)>0&&number(a.km)>0):[];
 const webmotorsShortlist=useMemo(()=>rankWebmotorsCandidates(indexed,{
   brand,model,year:marketYear,km:number(km),vehicleType,fipe:fipe?.value||null
 }),[indexed,brand,model,marketYear,km,vehicleType,fipe?.value]);
 const compatibleWebmotorsUrls=new Set(webmotorsShortlist.accepted.map(ad=>ad.url));
 const indexedWebmotors=indexed.filter(a=>compatibleWebmotorsUrls.has(String(a.url||'').split('?')[0].replace(/\/$/,'').toLowerCase()));
 // An indexed Webmotors sample whose whole floor is materially above FIPE
 // cannot be presented as the cheapest offers without independent confirmation.
 const webmotorsBaseline=indexedWebmotors.filter(a=>!fipe||number(a.price)<=fipe.value*(vehicleType==='motorcycle'?1.60:1.35));
 const webmotorsAboveReference=indexedWebmotors.length>0&&!webmotorsBaseline.length;
 const indexedOlx:Ad[]=[]; // Never use a non-Webmotors portal in the automated estimate.
 const indexedNapista:Ad[]=[]; // Never use a non-Webmotors portal in the automated estimate.
 // Exclusively Webmotors. One indexed listing cannot produce a credible market average.
 const marketSample=chooseIndexedMarketSample({
   webmotors:webmotorsBaseline,olx:indexedOlx,napista:indexedNapista
 });
 const referenceSource=marketSample.source;
 const referenceName=referenceSource==='webmotors'?'Webmotors (indexado)':'';
 const referenceLowest=marketSample.sample;
 const referenceAvg=marketSample.average;
 const referenceCeiling=referenceAvg>0?Math.max(0,referenceAvg*.86*(repasse?.95:1)-number(cost)):0;
 const confidenceNote=referenceLowest.length>=3?'amostra preliminar não auditada':'amostra pequena, não auditada';
 const lowestIndexedWebmotors=[...webmotorsBaseline].sort((a,b)=>number(a.price)-number(b.price)).slice(0,5);
 const indexedAvg=lowestIndexedWebmotors.length?lowestIndexedWebmotors.reduce((sum,a)=>sum+number(a.price),0)/lowestIndexedWebmotors.length:0;
 const indexedOlxAvg=0;
 const indexedNapistaAvg=0;
 const verifiedWebmotors=[...primary].sort((a,b)=>number(a.price)-number(b.price)).slice(0,5);
 const avg=verifiedWebmotors.length?verifiedWebmotors.reduce((s,a)=>s+number(a.price),0)/verifiedWebmotors.length:0;
 const olxAvg=secondary.length?secondary.reduce((s,a)=>s+number(a.price),0)/secondary.length:0;
 const kmTolerance=vehicleType==='motorcycle'?10000:30000;
 const distantKm=sortedValid.filter(a=>Math.abs(number(a.km)-number(km))>kmTolerance);
 const suspectAds=sortedValid.filter(a=>/leil[aã]o|sinistr|recuperad|batid|restri[cç][aã]o/i.test(a.note));
 const ceiling=Math.max(0,avg*.86*(repasse?.95:1)-number(cost));
 const marketReady=primary.length>=2&&distantKm.length===0&&suspectAds.length===0;
 const motorcycleRows=useMemo(()=>loadMotorcyclesForUser(user.email),[user.email,deskSection]);
 const motorcycleReference=useMemo(()=>vehicleType==='motorcycle'&&fipe?
   calculateMotorcycleMarketReference(motorcycleRows,{
     brand,model,year:fipe.year,km:number(km),fipe:fipe.value
   }):null,[vehicleType,motorcycleRows,fipe,brand,model,km]);
 const historicalEstimate=useMemo(()=>{
   if(vehicleType==='motorcycle'||!fipe||!classification||number(km)<=0)return null;
   return calculateHistoricalPrice({
     fipe:fipe.value,modelYear:fipe.year,km:number(km),preparation:number(cost),
     classification,destination:repasse?'REPASSE':'SHOWROOM'
   });
 },[vehicleType,fipe,classification,km,cost,repasse]);
 const [desktopMesaReference,setDesktopMesaReference]=useState<MesaPriceReference|null>(null);
 const onDesktopMesaReference=useCallback((next:MesaPriceReference|null)=>{
  setDesktopMesaReference(previous=>previous?.key===next?.key&&previous?.value===next?.value&&
   previous?.count===next?.count?previous:next);
 },[]);
 const desktopReferenceKey=mesaReferenceKey({
  plate,brand,model,modelYear:marketYear,km:number(km),
  fipe:fipe?.value||0,vehicleType
 },user.companyId||'abrao-reze');
 const currentDesktopMesa=desktopMesaReference?.key===desktopReferenceKey?desktopMesaReference:null;
 const confidence=useMemo(()=>assessMarketIqEvidence({
  vehicleType,plate,brand,model,brandCode,modelCode,modelYear:marketYear,
  km:number(km),fipe,ads:currentAds,history:saved
 }),[vehicleType,plate,brand,model,brandCode,modelCode,marketYear,km,fipe,currentAds,saved]);
 const save=async(proposal?:NegotiatedProposal,selectedMobileReference?:number,mobileReferenceKind?:'mesa'|'verified'|'historical'|'missing')=>{
   const hasVehicle=/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)&&brandCode&&modelCode&&yearCode&&number(km)>0;
   if(!hasVehicle){
     setNotice('Para salvar, preencha placa, marca, modelo, versão, ano e quilometragem.');
     return;
   }
   if(historyBusy)return;
   if(proposal&&(!Number.isFinite(proposal.negotiatedOffer)||proposal.negotiatedOffer<1500||
      proposal.negotiatedOffer>2000000||!Number.isFinite(proposal.baseSuggestion)||proposal.baseSuggestion<1500||
      proposal.negotiatedOffer===proposal.baseSuggestion||proposal.requestedByManager.trim().length<2||
      proposal.negotiationReason.trim().length<6)){
     setHistoryError('Revise o valor ajustado, o nome do gerente e a justificativa antes de salvar.');
     return;
   }
   if(fleetPolicy.outOfRange&&classificationReason.trim().length<6){
     setHistoryError('Justifique a classe diferente da faixa de quilometragem antes de salvar.');return;
   }
   if(newApprovedValue.trim()&&!approvalInputValid(newApprovedValue)){
     setHistoryError('Corrija o valor aprovado na avaliação antes de salvar.');return;
   }
   if(newApprovedValue.trim()&&(!newApprovedDate||newApprovedDate>localDate())){
     setHistoryError('Informe uma data de aprovação válida, até hoje.');return;
   }
   const selectedMobile=Number.isFinite(selectedMobileReference)&&Number(selectedMobileReference)>0?
     Number(selectedMobileReference):null;
   const provisional=mobileReferenceKind==='mesa'?true:!marketReady;
   const record:Saved={id:String(Date.now()),date:new Date().toISOString(),vehicleType,plate,model,year,km,cost,repasse,classificationReason:fleetPolicy.outOfRange?classificationReason.trim():'',directRepasseReason,goodLiquidity,
     ads:currentAds,value:selectedMobile??(provisional?(vehicleType==='motorcycle'?(motorcycleReference?.medianIndication||0):referenceAvg>0?referenceCeiling:historicalEstimate?.target||0):ceiling),provisional,
     referenceName:mobileReferenceKind==='mesa'?'Mesa · valor recorrente de avaliações':
      provisional?(vehicleType==='motorcycle'?'Histórico preliminar de motocicletas':referenceAvg>0?referenceName:'Histórico de compras'):'Webmotors verificada',
     historicalTarget:vehicleType==='motorcycle'?motorcycleReference?.medianIndication:historicalEstimate?.target,historicalClass:classification||undefined,
     brand,brandCode,modelCode,yearCode,fipe,
     ...(proposal?{negotiatedOffer:proposal.negotiatedOffer,baseSuggestion:proposal.baseSuggestion,
      requestedByManager:proposal.requestedByManager.trim(),negotiationReason:proposal.negotiationReason.trim(),
      negotiationStatus:'manager_requested'}:{})};
   setHistoryBusy(true);setHistoryError('');
   try{
     const result=await historyRequest('save',record);
     if(result.saved!==true)throw new Error('Não foi possível confirmar a gravação.');
     // Always refresh from the server: a second save on the same day revises
     // the existing entry and must never add a second history card.
     const recorded:string[]=[];
     const failures:string[]=[];
     if(newApprovedValue.trim()){
       try{
         const data=await historyRequest('approved',undefined,{
           evaluationId:result.record.id,
           amount:Math.round(number(newApprovedValue)*100)/100,approvedAt:newApprovedDate
         });
         if(data.saved!==true)throw new Error('Gravação não confirmada.');
         setNewApprovedValue('');
         recorded.push('valor aprovado e efetivamente pago');
       }catch(e:any){failures.push('Valor aprovado/pago não registrado: '+(e?.message||'erro de gravação'));}
     }
     await refreshHistory();
     if(failures.length){
       setHistoryError('A avaliação foi salva, mas '+failures.join(' · ')+'. Não salve novamente: complemente no Histórico.');
       setNotice('Avaliação salva. Confirme os eventos pendentes no Histórico de avaliações.');
     }else setNotice((result.updated?'Avaliação de hoje atualizada sem criar duplicidade.':'Avaliação salva no histórico.')+
      (proposal?' Proposta ajustada registrada, ainda não é compra confirmada.':'')+
      (recorded.length?' Valor aprovado/pago confirmado.':'')+' O histórico mantém as versões anteriores para auditoria.');
   }catch(error:any){
     setHistoryError(error?.message||'Não foi possível salvar no histórico online.');
     setNotice('Não foi salva. Seus dados continuam nesta tela. Verifique a mensagem do histórico e tente novamente.');
   }finally{setHistoryBusy(false);}
 };
 const restore=(r:Saved)=>{setVehicleType(r.vehicleType==='motorcycle'?'motorcycle':'car');setPlate(r.plate||'');setBrand(r.brand||'');setBrandCode(r.brandCode||'');setModelCode(r.modelCode||'');setYearCode(r.yearCode||'');setModel(r.model);setYear(r.year);setFipe(r.fipe||null);setKm(r.km);setCost(r.cost);setManualClassification((r.historicalClass&&r.historicalClass!=='SEM CLASSE'&&r.historicalClass!==classifyByMileage(r.km)?.classification?r.historicalClass:'') as FleetClass|'');
 setClassificationReason(r.classificationReason||'');setDirectRepasseReason(r.directRepasseReason||'none');setGoodLiquidity(r.goodLiquidity===true);
 setDestinationOverride(r.repasse&&['A','B','C'].includes(String(r.historicalClass||classifyByMileage(r.km)?.classification||''))&&(!r.directRepasseReason||r.directRepasseReason==='none')?'repasse':'auto');setAds(r.ads);const restoredKey=[r.vehicleType==='motorcycle'?'motorcycle':'car',r.brandCode||'',r.modelCode||'',r.yearCode||'',r.km].join('|');setAdsVehicleKey(restoredKey);setAutoSearchKey(restoredKey);autoAttempted.current.add(restoredKey);setAutoSearchedAt(r.date);switchDeskSection('pricing');setNewApprovedValue('');setNewApprovedDate(localDate());setNotice('Avaliação reaberta. Salvar novamente no mesmo dia atualiza o registro existente e mantém as alterações anteriores para auditoria.');window.scrollTo({top:0,behavior:'smooth'})};
 const beginNewMobileValuation=():boolean=>{
  if((plate||brandCode||modelCode||yearCode||number(km)>0)&&
    !window.confirm('Iniciar nova avaliação? Dados não salvos da ficha atual serão substituídos; o histórico oficial permanece intacto.'))return false;
  setPlate('');setBrand('');setBrandCode('');setModel('');setModelCode('');
  setYear('');setYearCode('');setKm('');setCost('0');setFipe(null);
  setManualClassification('');setClassificationReason('');
  setDestinationOverride('auto');setDirectRepasseReason('none');setGoodLiquidity(false);
  setAds([]);setAdsVehicleKey('');setAutoSearchKey('');setNewApprovedValue('');
  setHistoryError('');setNotice('');setCatalogError('');
  switchDeskSection('pricing');
  return true;
 };
 const input='w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900';
 const mesaActive=deskSection==='pricing'||deskSection==='history'||deskSection==='archive'||deskSection==='plateHistory';
 return <>
 <div className={mobileFullDesk?'hidden':'lg:hidden'}>
  <MarketIqMobileExperience
   user={user}
   vehicleType={vehicleType} onVehicleType={selectVehicleType}
   brands={brands} brand={brand} brandCode={brandCode} onBrand={selectBrand}
   models={models} model={model} modelCode={modelCode} onModel={selectModel}
   years={years} year={year} yearCode={yearCode} onYear={selectYear}
   km={km} onKm={setKm} plate={plate} onPlate={setPlate} cost={cost} onCost={setCost}
   fipe={fipe} catalogLoading={catalogLoading} catalogError={catalogError}
   onRetryFipe={()=>{setCatalogError('');setFipeRefreshKey(n=>n+1);}}
   classification={classification} destination={fleetPolicy.destination}
   history={saved} historyLoading={historyBusy} historyError={historyError}
   onRefreshHistory={()=>void refreshHistory()}
   onRestoreHistory={record=>restore(record as Saved)}
   verifiedCount={primary.length} verifiedAverage={avg}
   verifiedCeiling={marketReady?ceiling:0} indexedAverage={referenceAvg}
   historicalTarget={historicalEstimate?.target||0}
   historicalMin={historicalEstimate?.rangeMin||0}
   historicalMax={historicalEstimate?.rangeMax||0}
   motorcycleReference={motorcycleReference?.medianIndication||0}
   marketBrowseUrl={orderedWebmotorsVersionUrl||orderedWebmotorsModelUrl}
   onSearchMarket={()=>void searchMarket()} marketBusy={autoLoading} marketNotice={marketMessage}
   onSave={(proposal,suggested,source)=>void save(proposal,suggested,source)} saveBusy={historyBusy} saveNotice={notice} saveError={historyError}
   onOpenFullDesk={()=>setMobileFullDesk(true)}
   onOpenPlateHistory={()=>{setSelectedPlateForHistory(plate);switchDeskSection('plateHistory');setMobileFullDesk(true);}}
   onStartNew={beginNewMobileValuation}
   onOpenApprovals={()=>{setMobileFullDesk(true);switchDeskSection('approvals');}}
  />
 </div>
 {mobileFullDesk&&<button type="button" className="mx-4 mt-4 rounded-lg bg-[#008bd0] px-4 py-3 text-sm font-bold text-white lg:hidden"
   onClick={()=>setMobileFullDesk(false)}>Voltar ao Motyq IQ Mobile</button>}
 <main className={'mx-auto max-w-7xl space-y-5 p-5 text-slate-900 '+(mobileFullDesk?'block':'hidden lg:block')}>
 <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
  <nav className="motyq-iq-tabs flex flex-wrap items-center gap-1.5 p-2" aria-label="Áreas principais do Motyq IQ">
  <button type="button" onClick={()=>switchDeskSection('dashboard')} aria-current={deskSection==='dashboard'?'page':undefined}
   className={'rounded-lg px-3.5 py-2.5 text-[13px] font-bold transition-colors '+(deskSection==='dashboard'?'bg-[#153f51] text-white shadow-sm':'text-slate-700 hover:bg-slate-100')}>Painel gerencial</button>
  <button type="button" onClick={()=>switchDeskSection('pricing')} aria-expanded={mesaActive} aria-controls="motyq-iq-mesa-tools"
   className={'rounded-lg px-3.5 py-2.5 text-[13px] font-bold transition-colors '+(mesaActive?'bg-[#153f51] text-white shadow-sm':'text-slate-700 hover:bg-slate-100')}>Mesa de precificação</button>
  <button type="button" onClick={()=>switchDeskSection('consulted')} aria-current={deskSection==='consulted'?'page':undefined}
   className={'rounded-lg px-3.5 py-2.5 text-[13px] font-bold transition-colors '+(deskSection==='consulted'?'bg-[#153f51] text-white shadow-sm':'text-slate-700 hover:bg-slate-100')}>Repasse Sob Consulta</button>
  <button type="button" onClick={()=>switchDeskSection('approvals')} aria-current={deskSection==='approvals'?'page':undefined}
   className={'rounded-lg px-3.5 py-2.5 text-[13px] font-bold transition-colors '+(deskSection==='approvals'?'bg-[#153f51] text-white shadow-sm':'text-slate-700 hover:bg-slate-100')}>Solicitações e aprovações</button>
  <button type="button" onClick={()=>switchDeskSection('learning')} aria-current={deskSection==='learning'?'page':undefined}
   className={'rounded-lg px-3.5 py-2.5 text-[13px] font-bold transition-colors '+(deskSection==='learning'?'bg-[#153f51] text-white shadow-sm':'text-slate-700 hover:bg-slate-100')}>Aprendizado IQ</button>
  </nav>
  {mesaActive&&<nav id="motyq-iq-mesa-tools" aria-label="Ferramentas da Mesa de precificação"
   className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 bg-slate-50/70 px-3 py-2">
   <span className="mr-2 hidden text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:inline">Mesa</span>
   <button type="button" onClick={()=>switchDeskSection('pricing')} aria-current={deskSection==='pricing'?'page':undefined}
    className={'rounded-md px-3 py-2 text-xs font-semibold transition-colors '+(deskSection==='pricing'?'bg-white text-[#153f51] shadow-sm ring-1 ring-slate-200':'text-slate-600 hover:bg-white hover:text-slate-900')}>Nova avaliação</button>
   <button type="button" onClick={()=>switchDeskSection('history')} aria-current={deskSection==='history'?'page':undefined}
    className={'inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors '+(deskSection==='history'?'bg-white text-[#153f51] shadow-sm ring-1 ring-slate-200':'text-slate-600 hover:bg-white hover:text-slate-900')}>
    Histórico <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-700">{saved.length}</span>
   </button>
   <button type="button" onClick={()=>switchDeskSection('archive')} aria-current={deskSection==='archive'?'page':undefined}
    className={'rounded-md px-3 py-2 text-xs font-semibold transition-colors '+(deskSection==='archive'?'bg-white text-[#153f51] shadow-sm ring-1 ring-slate-200':'text-slate-600 hover:bg-white hover:text-slate-900')}>Arquivo mensal</button>
   <button type="button" onClick={()=>switchDeskSection('plateHistory')} aria-current={deskSection==='plateHistory'?'page':undefined}
    className={'rounded-md px-3 py-2 text-xs font-semibold transition-colors '+(deskSection==='plateHistory'?'bg-white text-[#153f51] shadow-sm ring-1 ring-slate-200':'text-slate-600 hover:bg-white hover:text-slate-900')}>Histórico por placa</button>
  </nav>}
 </div>
 {deskSection==='dashboard'?<MarketIqManagementDashboard user={user}/>:
  deskSection==='consulted'?<MarketIqConsultedRepasse user={user}
    vehicleFromDesk={{plate,brand,model,year,km,fipe:fipe?.value||0}}
    onOpenApprovals={()=>switchDeskSection('approvals')}/>:
  deskSection==='approvals'?<MarketIqApprovalCenter user={user}/>:
  deskSection==='learning'?<MarketIqLearningPanel user={user} history={saved} onRefresh={refreshHistory} onOpenArchive={()=>switchDeskSection('archive')}/>:
  deskSection==='archive'?<MarketIqMonthlyArchivePanel user={user}
   onOpenPlateHistory={selected=>{setSelectedPlateForHistory(selected);switchDeskSection('plateHistory');}}/>:
  deskSection==='plateHistory'?<MarketIqPlateHistoryPanel user={user}
   initialPlate={selectedPlateForHistory||plate} onOpenArchive={()=>switchDeskSection('archive')}/>:
  deskSection==='history'?<section className="space-y-4 rounded-xl bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-bold text-slate-900">Histórico de avaliações</h2>
        <p className="mt-1 text-sm text-slate-600">Uma avaliação por placa e dia em cada unidade. Correções atualizam o cartão existente; versões anteriores ficam preservadas para auditoria.</p></div>
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
          <option value="all">Todas</option><option value="approved">Com valor aprovado/pago</option><option value="reviewed">Conferidas</option><option value="preliminary">Preliminares</option><option value="draft">Rascunhos sem valor</option>
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
          {(r.valuationVersions||1)>1&&<p className="mt-1 text-xs font-semibold text-cyan-900">
            {r.valuationVersions} versões registradas neste dia
            {(r.groupedRecords||1)>1?' · '+r.groupedRecords+' avaliações anteriores consolidadas':''}
          </p>}
          {r.revisedAt&&<p className="mt-1 text-xs text-slate-700">Última revisão: {new Date(r.revisedAt).toLocaleString('pt-BR')} · {r.revisedBy||'Mesa'}</p>}
        </div>
        <div className="min-w-[200px] text-right">
          <p className="text-xs text-slate-600">Valor estimado pelo Motyq</p>
          <p className="text-lg font-bold text-slate-950">{money(r.value)}</p>
          {Number(r.negotiatedOffer)>0&&<div className="mt-2 rounded-lg border border-sky-300 bg-sky-50 p-3">
            <p className="text-xs font-bold uppercase text-sky-900">Proposta ajustada a pedido do gerente</p>
            <p className="text-xl font-black text-sky-950">{money(Number(r.negotiatedOffer))}</p>
            <p className="mt-1 text-xs text-sky-900">Base original: {money(Number(r.baseSuggestion||r.value))}</p>
            <p className="mt-1 text-xs text-sky-900">Gerente informado: {r.requestedByManager||'Não informado'}</p>
            <p className="mt-1 text-xs text-sky-900">Motivo: {r.negotiationReason||'Não informado'}</p>
            <p className="mt-1 text-xs font-semibold text-amber-900">Proposta registrada, não equivale a compra confirmada.</p>
          </div>}
          {Number(r.approvedValue)>0?
            <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
              <p className="text-xs font-bold uppercase text-emerald-900">Valor aprovado e pago pela loja</p>
              <p className="text-xl font-black text-emerald-950">{money(Number(r.approvedValue))}</p>
              <p className="text-xs font-semibold text-emerald-900">{Number(r.approvedValue)>r.value?'Acima':Number(r.approvedValue)<r.value?'Abaixo':'Igual à estimativa'}{Number(r.approvedValue)!==r.value?' em '+money(Math.abs(Number(r.approvedValue)-r.value)):''}</p>
              <p className="mt-1 text-xs text-emerald-900">Aprovação: {r.approvedAt?.split('-').reverse().join('/')||'-'} · {r.approvedRecordedBy||'usuário autorizado'}</p>
            </div>:
            <p className="mt-2 text-xs font-semibold text-amber-900">Valor aprovado/pago ainda não informado</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={()=>{setEditingApprovedId(r.id);setEditingApprovedValue((r.paidValue||r.approvedValue)?Number(r.paidValue||r.approvedValue).toFixed(2).replace('.',','):'');setEditingApprovedDate(r.paidAt||r.approvedAt||localDate());setHistoryError('');}}
            className="rounded-lg border border-emerald-700 bg-white px-4 py-2 text-sm font-bold text-emerald-900">{Number(r.approvedValue)>0||Number(r.paidValue)>0?'Corrigir valor aprovado/pago':'Registrar valor aprovado/pago'}</button>
          <button type="button" onClick={()=>restore(r)} className="rounded-lg bg-cyan-800 px-4 py-2 text-sm font-bold text-white">Reabrir avaliação</button>
        </div>
        {editingApprovedId===r.id&&<div className="w-full rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
          <p className="font-bold text-emerald-950">Valor aprovado e pago · {r.plate}</p>
          <p className="mb-3 text-xs text-emerald-900">Informe o valor que a loja efetivamente pagou após a aprovação da Mesa. Ele será contabilizado no Aprendizado IQ; correções preservam os eventos anteriores para auditoria.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-900">Valor aprovado e pago (R$)
              <input className={input+' mt-1'} inputMode="decimal" type="text" placeholder="Ex.: 76.000,00" value={editingApprovedValue} onChange={e=>setEditingApprovedValue(e.target.value)} />
            </label>
            <label className="text-sm font-semibold text-slate-900">Data da aprovação/compra
              <input className={input+' mt-1'} type="date" max={localDate()} value={editingApprovedDate} onChange={e=>setEditingApprovedDate(e.target.value)} />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={historyBusy||!approvalInputValid(editingApprovedValue)||!editingApprovedDate} onClick={()=>void recordApproved(r)}
              className="rounded-lg bg-emerald-800 px-5 py-2 text-sm font-bold text-white disabled:opacity-40">{historyBusy?'Registrando...':'Confirmar valor aprovado e pago'}</button>
            <button type="button" onClick={()=>setEditingApprovedId('')} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">Cancelar</button>
          </div>
        </div>}
      </div>)}</div>}
  </section>:
  <>
 <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><strong>Piloto oficial:</strong> a busca automática usa páginas indexadas e pode ficar sem anúncios quando a fonte gratuita falhar. A estimativa histórica é independente da Webmotors e recalcula com FIPE, KM, classificação, preparo e destino. Anúncios não auditados não autorizam compras. As avaliações salvas no histórico online podem ser reabertas por perfis autorizados da mesma unidade.</div>
 <section id="motyq-iq-valuation-form" className="rounded-xl bg-white p-5"><h2 className="mb-3 text-xl font-semibold">Nova precificação</h2><div className="grid gap-3 md:grid-cols-2"><label>Tipo de veículo<select className={input} value={vehicleType} onChange={e=>selectVehicleType(e.target.value as 'car'|'motorcycle')}><option value="car">Automóvel / utilitário</option><option value="motorcycle">Motocicleta</option></select></label><div className="hidden md:block"/><label>Placa do veículo<input className={input} value={plate} onChange={e=>setPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,7))} placeholder="ABC1D23" maxLength={7}/></label><div className="hidden md:block" /><label>Marca<select className={input} value={brandCode} onChange={e=>selectBrand(e.target.value)}><option value="">Selecione a marca</option>{brands.map(x=><option key={x.code} value={x.code}>{x.name}</option>)}</select></label><label>Modelo e versão<select className={input} value={modelCode} disabled={!brandCode} onChange={e=>selectModel(e.target.value)}><option value="">Selecione modelo e versão</option>{models.map(x=><option key={x.code} value={x.code}>{x.name}</option>)}</select></label><label>Ano/modelo e combustível<select className={input} value={yearCode} disabled={!modelCode} onChange={e=>selectYear(e.target.value)}><option value="">Selecione ano</option>{years.map(x=><option key={x.code} value={x.code}>{x.name}</option>)}</select></label><label>KM do veículo<input className={input} value={km} onChange={e=>setKm(e.target.value)} inputMode="numeric" placeholder="Ex.: 45000"/></label></div><div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">Tabela FIPE · {vehicleType==='motorcycle'?'motocicletas':'automóveis'} · consulta gratuita</p>{catalogLoading?<p>Consultando catálogo FIPE...</p>:fipe?<><p className="text-2xl font-bold text-slate-900">{money(fipe.value)}</p><p className="text-sm text-slate-700">{fipe.brand} · {fipe.model} · {fipe.year} · {fipe.fuel}</p><p className="text-xs text-slate-700">Código FIPE: {fipe.fipeCode} · Referência: <strong>{fipe.referenceMonth}</strong>{fipe.referenceSource?' · Fonte: '+fipe.referenceSource:''}</p>
 <div className="mt-2 flex flex-wrap items-center gap-2">
   {fipe.referenceStatus==='current'?<span className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-900">Referência do mês atual</span>:
    <span className="rounded-lg border border-amber-400 bg-amber-100 px-2 py-1 text-xs font-bold text-amber-950">{fipe.referenceStatus==='outdated'?'Referência desatualizada':'Referência não confirmada'}</span>}
   <button type="button" disabled={catalogLoading} onClick={()=>{setCatalogError('');setFipeRefreshKey(x=>x+1);}}
     className="rounded-lg border border-cyan-700 bg-white px-3 py-1 text-xs font-bold text-cyan-950 disabled:opacity-50">Atualizar FIPE</button>
 </div>
 {fipe.referenceStatus!=='current'&&<p role="alert" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
   Atenção: a referência disponível ({fipe.referenceMonth||'mês não informado'}) não foi confirmada para {fipe.expectedReference||'o mês vigente'}.
   O preço-alvo pode mudar quando a FIPE atualizar. Confira antes de aprovar a compra.
 </p>}
 {fipe.referenceSource==='tabelafipe.info'&&<p className="mt-1 text-xs text-slate-700">Dados via tabelafipe.info (Tabela FIPE). Fonte independente, conferida por código e ano-modelo.</p>}</>:<p className="text-sm text-slate-600">Selecione marca, modelo/versão e ano para consultar o valor automaticamente.</p>}{catalogError&&<div className="mt-2 flex flex-wrap items-center gap-3"><p role="alert" className="text-sm text-red-700">{catalogError}</p><button type="button" onClick={()=>{setCatalogError("");setRetryCatalog(x=>x+1);if(brandCode){const current=brandCode;setBrandCode('');window.setTimeout(()=>setBrandCode(current),0);}}} className="rounded-lg border border-cyan-700 px-3 py-1 text-sm font-semibold text-cyan-900">Tentar novamente</button></div>}</div></section>
 <MarketIqIntelligentHistoryPanel
  companyId={user.companyId||'abrao-reze'}
  current={{plate,brand,model,modelYear:marketYear,km:number(km),fipe:fipe?.value||0,
   fipeCode:fipe?.fipeCode,vehicleType}}
  cloudHistory={saved}
  verifiedMarketCeiling={marketReady?ceiling:0}
  historicalModelTarget={vehicleType==='motorcycle'?motorcycleReference?.medianIndication||0:historicalEstimate?.target||0}
  onOpenPlateHistory={()=>{setSelectedPlateForHistory(plate);switchDeskSection('plateHistory');}}
  onMesaReference={onDesktopMesaReference}/>
 <MarketIqFleetClassificationPanel km={km} guideline={fleetPolicy.guideline}
  classification={fleetPolicy.classification} destination={fleetPolicy.destination}
  direct={fleetPolicy.direct} outOfRange={fleetPolicy.outOfRange}
  manualClassification={manualClassification} onManualClassification={setManualClassification}
  classificationReason={classificationReason} onClassificationReason={setClassificationReason}
  destinationOverride={destinationOverride} onDestinationOverride={setDestinationOverride}
  directRepasseReason={directRepasseReason} onDirectRepasseReason={setDirectRepasseReason}
  goodLiquidity={goodLiquidity} onGoodLiquidity={setGoodLiquidity}/>
 <MarketIqConfidencePanel result={confidence}/>
 {vehicleType==='car'? <section className="rounded-xl border border-indigo-100 bg-white p-5">
  <div className="flex flex-wrap items-start justify-between gap-2">
    <div><h2 className="text-xl font-semibold">Preço-alvo histórico · Motyq IQ</h2>
      <p className="mt-1 text-sm text-slate-600">Estimativa de quanto a empresa costuma pagar por veículos semelhantes, usando FIPE, ano, KM, classe, destino e preparo. Não depende da pesquisa Webmotors.</p></div>
    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">Piloto · {MOTYQ_HISTORY_MODEL.purchases} compras confirmadas</span>
  </div>
  <div className="mt-4 grid gap-3 md:grid-cols-2">
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900">
     <p className="font-bold">Classificação e destinação aplicadas</p>
     <p className="mt-2 text-lg font-black">{classification?'Classe '+classification:'Informe a KM'} · {fleetPolicy.guideline?fleetPolicy.destination:'Pendente'}</p>
     <p className="mt-1 text-xs text-slate-600">Para ajustar a classe, utilize o painel Grupo Abrão Reze acima.</p>
    </div>
    <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <label className="block font-semibold">Custos previstos R$<input className={input} value={cost} onChange={e=>setCost(e.target.value)} inputMode="decimal" placeholder="Ex.: 2500"/></label>
      <p className="mt-2 text-xs font-bold text-slate-800">Destinação: {fleetPolicy.destination}</p>
      <p className="mt-1 text-xs text-slate-600">O repasse mantém o desconto comercial adicional de 5%. Repasse direto exige decisão específica e conferência da documentação.</p>
    </div>
  </div>
  {historicalEstimate?<div className="mt-4 grid gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 md:grid-cols-2">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-indigo-800">{currentDesktopMesa?'Sugestão da Mesa · repetida em veículos distintos':'Modelo estatístico · referência preliminar'}</p>
      <p className="mt-2 text-3xl font-bold text-indigo-950">{money(currentDesktopMesa?.value||historicalEstimate.target)}</p>
      {currentDesktopMesa?<p className="mt-1 text-sm text-indigo-900">
       Encontrado em {currentDesktopMesa.count} avaliações de veículos diferentes da mesma versão, ano e KM próximo.
       Modelo estatístico anterior: {money(historicalEstimate.target)}.
       Preço interno de negociação, não pagamento confirmado nem autorização de compra.
      </p>:<>
       <p className="mt-1 text-sm text-indigo-900">Faixa de incerteza: {money(historicalEstimate.rangeMin)} a {money(historicalEstimate.rangeMax)}</p>
       <p className="mt-1 text-xs text-indigo-700">Equivale a {(historicalEstimate.fipeFraction*100).toFixed(1).replace('.',',')}% da FIPE · estimativa, não compra aprovada.</p>
      </>}
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
   <p className="mt-2 text-sm text-amber-900">A FIPE acima é específica da moto. Os dados históricos de motos não são misturados com o modelo treinado com 223 carros. O indicador abaixo usa registros locais de motocicletas e não comprova o pagamento final.</p>
   {motorcycleReference?<div className="mt-3 grid gap-3 rounded-xl border border-amber-300 bg-white p-4 sm:grid-cols-2">
     <div><p className="text-xs font-bold uppercase text-slate-600">Média de valores avaliados · ajustada à FIPE</p>
       <p className="mt-1 text-2xl font-black text-slate-950">{money(motorcycleReference.meanIndication)}</p>
       <p className="text-xs text-slate-700">Média histórica: {(motorcycleReference.meanRatio*100).toFixed(1).replace('.',',')}% da FIPE</p>
     </div>
     <div><p className="text-xs font-bold uppercase text-slate-600">Mediana histórica · referência preliminar</p>
       <p className="mt-1 text-2xl font-black text-slate-950">{money(motorcycleReference.medianIndication)}</p>
       <p className="text-xs text-slate-700">Mediana: {(motorcycleReference.medianRatio*100).toFixed(1).replace('.',',')}% da FIPE</p>
     </div>
     <p className="text-sm font-semibold text-amber-950 sm:col-span-2">Amostra: {motorcycleReference.sampleSize} registros {motorcycleReference.scope==='model'?'de modelo, ano e KM próximos':motorcycleReference.scope==='brand'?'da mesma marca':'de motos de categorias diferentes'}. Referência exploratória, não preço aprovado de compra.</p>
     {number(cost)>0&&<p className="text-xs text-amber-900 sm:col-span-2">Cenário após subtrair custos previstos de {money(number(cost))}: {money(Math.max(0,motorcycleReference.medianIndication-number(cost)))}. Não contempla negociação, impostos ou avarias não informados.</p>}
   </div>:<p className="mt-3 rounded-lg border border-amber-300 bg-white p-3 text-sm font-semibold text-amber-950">Ainda não há amostra suficiente de motos utilizável neste navegador. Importe novamente a planilha original pelo Painel Gerencial para calcular a média histórica, ou confira ofertas individuais da Webmotors.</p>}
   <p className="mt-2 text-sm font-semibold text-amber-950">{marketReady?'Pelo menos dois anúncios Webmotors foram conferidos.':'Para uma média de mercado verificável, confira pelo menos 2 anúncios Webmotors de versão, ano e KM próximos. O botão abaixo tenta localizar anúncios indexados, mas pode retornar poucos resultados.'}</p>
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
     <label className="text-sm font-bold text-slate-900">Valor aprovado na avaliação (efetivamente pago, R$, opcional)
       <input type="text" inputMode="decimal" className={input+' mt-1'} placeholder="Valor que a loja pagou. Ex.: 24.000,00" value={newApprovedValue} onChange={e=>setNewApprovedValue(e.target.value)}/>
     </label>
     <label className="text-sm font-bold text-slate-900">Data da aprovação
       <input type="date" className={input+' mt-1'} max={localDate()} value={newApprovedDate} onChange={e=>setNewApprovedDate(e.target.value)}/>
     </label>
     <p className="text-xs font-medium text-slate-700 sm:col-span-2">O valor aprovado na Mesa é o valor efetivamente pago pela loja e alimenta automaticamente o Aprendizado IQ. Se ainda não houve compra, deixe vazio. É possível registrar ou corrigir esse valor depois no Histórico de avaliações.</p>
   </div>
   {historyError&&<p role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">{historyError}</p>}
   {notice&&<p role="status" className="mt-2 text-sm font-semibold text-slate-800">{notice}</p>}
 </section>
 {extensionInbox.length>0&&<div className="space-y-2">
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
   <p className="text-xs font-semibold text-slate-700">
    {captureSavedLocally?
      'Rascunho salvo neste navegador por até '+CAPTURE_DRAFT_DAYS+' dias, vinculado à avaliação e à placa.':
      'Rascunho ainda não salvo. Complete a avaliação ou habilite o armazenamento local do navegador.'}
    {' '}Não é backup na nuvem nem valor aprovado.
   </p>
   <button type="button" onClick={clearLocalCapture}
    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-rose-800">
    Descartar captura local
   </button>
  </div>
  {(!searchReady||!captureFitsCurrent)?<section role="status"
   aria-label="Captura aguardando avaliação correta"
   className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
   <p className="font-black">{extensionInbox.length} anúncios capturados e guardados para conferência.</p>
   <p className="mt-2">
    {!searchReady?
     'Esta guia ainda não tem marca, modelo, ano ou KM completos. Isso pode acontecer ao voltar da Webmotors em outra guia. Nenhum anúncio foi reprovado por falta desses dados.':
     'Os anúncios não correspondem à marca, modelo ou ano desta avaliação. A captura não será associada ao veículo errado.'}
   </p>
   {canRestoreReturn&&<button type="button" onClick={restoreCaptureContext}
    className="mt-3 rounded-lg bg-cyan-800 px-4 py-2.5 text-sm font-bold text-white">
    Restaurar avaliação: {returnSuggestion?.brand} {returnSuggestion?.model} {returnSuggestion?.marketYear} · {returnSuggestion?.km} km · {returnSuggestion?.plate||'sem placa'}
   </button>}
   <p className="mt-2 text-xs">
    {canRestoreReturn?'Confira os dados recuperados antes de importar.':
     'Selecione a avaliação correspondente em Nova precificação ou reabra-a no Histórico.'}
   </p>
   <button type="button" onClick={()=>document.getElementById('motyq-iq-valuation-form')?.scrollIntoView({behavior:'smooth'})}
    className="mt-2 rounded-lg border border-amber-600 bg-white px-3 py-2 text-xs font-bold text-amber-950">
    Ir para os dados da avaliação
   </button>
  </section>:  <MarketIqCapturedReviewPanel
   ads={extensionInbox} onImport={applyExtensionCapture} notice={extensionNotice} readyToImport={searchReady}
   review={captureReview} onReviewChange={setCaptureReview}
   importedIds={(adsVehicleKey===vehicleKey?ads:[]).filter(ad=>!ad.auto&&ad.source==='webmotors').map(ad=>ad.url)}
   target={{
    brand,model,year:marketYear,km:number(km),vehicleType,
    expectedModelUrl:webmotorsBrowse.modelUrl,
    expectedVersionUrl:webmotorsBrowse.versionUrl,
    fipeValue:fipe?.value||null
   }}
  />
}
 </div>}
 <section className="rounded-xl bg-white p-5"><div className="mb-3 flex justify-between gap-3"><div><h2 className="text-xl font-semibold">Comparação de anúncios · Webmotors</h2><p className="text-sm text-slate-700">Busque candidatos da Webmotors sem sair do Motyq. O ranking seleciona anúncios individuais com marca, modelo, ano e KM compatíveis. Use a captura assistida para trazer ofertas da página da Webmotors sem depender do índice gratuito. Para torná-los válidos, a conferência humana do anúncio original continua necessária.</p></div><div className="flex shrink-0 flex-wrap gap-2"><button className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={()=>void searchMarket()} disabled={autoLoading||!searchReady||marketCooldownActive}>{autoLoading?'Pesquisando ofertas...':marketCooldownActive?'Busca pausada · '+marketCooldownMinutes+' min':searchReady?(vehicleType==='motorcycle'?'Pesquisar motos na Webmotors':'Busca indexada (opcional)'):'Complete o veículo'}</button><button className="rounded-lg bg-slate-800 px-3 py-2 text-white" onClick={()=>{setAds(a=>[...(adsVehicleKey===vehicleKey?a:[]),blank()]);setAdsVehicleKey(vehicleKey);}}>+ Anúncio</button></div></div>
 <div className="mb-4 rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-slate-950" aria-label="Busca Webmotors com localização, modelo e versão">
  <div className="flex flex-wrap items-end justify-between gap-3">
   <div>
    <p className="text-sm font-black">Busca Webmotors por versão</p>
    <p className="mt-1 text-xs text-slate-700">
     O Motyq usa a versão da avaliação FIPE quando consegue identificá-la.
     Revise a versão antes de abrir a busca, pois Longitude, Limited, Sport e diesel têm mercados diferentes.
    </p>
   </div>
   <div className="flex flex-wrap items-end gap-3">
   <label className="text-xs font-bold text-slate-700">Local da pesquisa
    <select aria-label="Localização da pesquisa Webmotors" className="mt-1 block w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
     value={marketRegion} onChange={e=>setMarketRegion(e.target.value as WebmotorsRegion)}>
     {WEBMOTORS_REGIONS.map(region=><option key={region.id} value={region.id}>{region.label}</option>)}
    </select>
   </label>
   <label className="text-xs font-bold text-slate-700">Ordenar anúncios
    <select aria-label="Ordenação da pesquisa Webmotors"
     className="mt-1 block w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
     value={webmotorsOrder} onChange={e=>setWebmotorsOrder(e.target.value as WebmotorsOrder)}>
     <option value="lowest-price">Menor preço (padrão)</option>
     <option value="relevance">Mais relevantes</option>
    </select>
   </label>
   </div>
  </div>
  <p className="mt-2 text-xs font-semibold text-slate-800">
   {webmotorsBrowse.regionLabel} · {webmotorsBrowse.brandLabel||'Marca pendente'} · {webmotorsBrowse.modelLabel||'Modelo pendente'} · {marketYear||'Ano pendente'}
  </p>
  {webmotorsBrowse.modelUrl?<div className="mt-3 space-y-3">
   {webmotorsBrowse.versionOptions.length>0&&<label className="block max-w-xl text-xs font-bold text-slate-800">
    Versão na Webmotors
    <select aria-label="Selecionar versão da Webmotors" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900"
     value={activeVersionSlug||'auto'}
     onChange={e=>setWebmotorsVersionOverride(e.target.value==='auto'?null:{
       signature:versionSignature,slug:e.target.value
     })}>
     <option value="auto">{webmotorsBrowse.versionMatch==='automatic'?
       'Identificada pela FIPE: '+webmotorsBrowse.versionLabel:'Selecione a versão correta'}</option>
     {webmotorsBrowse.versionOptions.map(v=><option key={v.slug} value={v.slug}>{v.label}</option>)}
    </select>
   </label>}
   {orderedWebmotorsVersionUrl?<a href={orderedWebmotorsVersionUrl} target="_blank" rel="noopener noreferrer"
    className="inline-flex rounded-lg bg-cyan-800 px-4 py-3 text-xs font-black text-white hover:bg-cyan-900">
    Pesquisar {webmotorsBrowse.modelLabel} {webmotorsBrowse.versionLabel} · {marketYear}
   </a>:webmotorsBrowse.versionOptions.length>0?
    <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-950">
     A FIPE não identificou motor e versão com segurança. Escolha a versão acima antes de comparar preços.
    </p>:
    <p className="text-xs text-slate-700">Ainda não temos uma rota de versão confirmada para esta configuração.</p>}
   <div>
    <a href={orderedWebmotorsModelUrl||webmotorsBrowse.modelUrl} target="_blank" rel="noopener noreferrer"
     className="text-xs font-bold text-cyan-900 underline">
     Abrir {webmotorsBrowse.modelLabel} {marketYear} com todas as versões
    </a>
   </div>
   <p className="text-[11px] leading-5 text-slate-700">
    {webmotorsBrowse.versionUrl?'O endereço específico inclui versão e ano-modelo.':
     'O link genérico não restringe a versão: confirme-a no site antes de usar qualquer preço.'}
    {' '}Ordem solicitada: {webmotorsOrder==='lowest-price'?'Menor preço':'Mais relevantes'}.
    Confira na Webmotors se a ordenação foi aplicada corretamente.
    Os anúncios e a KM devem ser conferidos diretamente na Webmotors.
    Nenhum preço é aprovado automaticamente.
   </p>
  </div>:<p className="mt-2 text-xs font-semibold text-amber-900">Selecione marca, modelo e ano para habilitar a busca.</p>}
 </div>
 <MarketIqAssistedCapturePanel target={{
   brand,model,year:marketYear,km:number(km),vehicleType,
   versionLabel:webmotorsBrowse.versionLabel
 }} onImport={importTextOffers}/>
 {!searchReady&&<p className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">
   Para pesquisar, preencha: {missingMarketDetails}. A FIPE não precisa terminar de carregar para liberar a busca.
 </p>}
 {searchReady&&!autoAttempted.current.has(vehicleKey)&&!autoLoading&&<p className="mb-3 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm font-medium text-cyan-950">A busca usa exclusivamente resultados indexados da Webmotors. O sistema organiza as ofertas por preço, ano/modelo e KM, mas anúncios indexados precisam de conferência antes de influenciar o teto definitivo.</p>}
 {autoLoading&&<p role="status" className="mb-3 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold text-cyan-950">Pesquisando anúncios e verificando preço, ano e KM. Esta consulta pode demorar alguns segundos.</p>}
 {marketCooldownActive&&<div role="status" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
   <strong>Pesquisa indexada temporariamente pausada.</strong> O provedor atingiu o limite gratuito de consultas.
   Evitaremos novas solicitações por aproximadamente {marketCooldownMinutes} minuto(s). Isso não significa que o veículo esteja sem anúncios.
   A busca pode continuar indisponível após esse período, dependendo da cota do provedor.
   <div className="mt-2 flex flex-wrap items-center gap-3">
     <a href="https://www.webmotors.com.br" target="_blank" rel="noopener noreferrer" className="font-bold text-cyan-900 underline">Abrir Webmotors para conferência manual</a>
     <span className="text-xs">Use o botão + Anúncio para registrar preços e KM conferidos.</span>
   </div>
 </div>}
 {marketMessage&&<p role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{marketMessage}</p>}{searchDiagnostics&&autoResultsVisible&&<p className="mb-2 text-xs text-slate-600">{searchDiagnostics}</p>}
 {autoResultsVisible&&autoSearchedAt&&<p className="mb-3 text-xs text-slate-600">Última pesquisa: {new Date(autoSearchedAt).toLocaleString('pt-BR')} · {indexed.length} resultado(s) Webmotors indexado(s). A busca não comprova que o anúncio esteja ativo ou que o veículo tenha procedência verificada.</p>}
  {autoResultsVisible&&indexedBrowsePages.length>0&&<p className="mb-3 text-xs text-slate-600">
   O índice encontrou {indexedBrowsePages.length} página(s) da Webmotors, possivelmente de outras cidades.
   Para evitar abrir ofertas fora da região escolhida, use a busca filtrada acima.
  </p>}
  {autoResultsVisible&&indexed.some(item=>item.catalog)&&<details className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
    <summary className="cursor-pointer font-bold text-amber-950">Preços em vitrines indexadas, não confirmados</summary>
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {indexed.filter(item=>item.catalog).sort((a,b)=>number(a.price)-number(b.price)).slice(0,5).map((item,i)=>
        <div key={i} className="rounded-lg border border-amber-200 bg-white px-3 py-2">
          <p className="font-bold">{money(number(item.price))} · {number(item.km).toLocaleString('pt-BR')} km</p>
          <p className="text-xs text-slate-700">Preço encontrado em uma página de resultados, sem anúncio individual confirmado. Não entra no teto da Mesa.</p>
          {portalLink(item)&&<a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-sky-900 underline">Conferir página</a>}
        </div>)}
    </div>
  </details>}
  {autoResultsVisible&&indexed.length>0&&<MarketIqWebmotorsShortlistPanel shortlist={webmotorsShortlist} vehicleKm={number(km)}/>}
 {indexed.length>0&&referenceAvg===0&&<p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
 Foram encontrados {indexed.length} resultados, mas a Webmotors não forneceu uma amostra mínima aproveitável de dois anúncios individuais compatíveis em modelo, ano e KM. Não usamos outros portais para preencher a média. Uma única vitrine não define preço de compra.
 </p>}
 {referenceAvg>0&&<div className="mb-4 rounded-xl border border-cyan-200 bg-cyan-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-cyan-800">Simulação automática preliminar · não aprovada</p><p className="mt-1 text-sm text-slate-700">Base: {referenceName} · {referenceLowest.length} menor(es) preço(s) com até {vehicleType==='motorcycle'?'12 mil':'30 mil'} km de diferença · média {money(referenceAvg)} ({confidenceNote}).</p><p className="mt-1 text-xs text-slate-600">Webmotors: {indexedWebmotors.length} preço(s) Webmotors compatíveis. Outros portais não entram no cálculo.</p>
 {marketSample.fallback&&<p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-950">Webmotors não forneceu uma amostra mínima aproveitável. Não haverá substituição automática por OLX ou outro portal.</p>}
 <p className="mt-2 text-xs font-semibold text-slate-700">Preços selecionados: {referenceLowest.map(ad=>money(number(ad.price))+' ('+number(ad.km).toLocaleString('pt-BR')+' km)').join(' · ')}.</p>
 {marketSample.sampleContainsCatalogPages&&<p className="mt-1 text-xs font-semibold text-amber-900">A amostra inclui vitrines indexadas, sem comprovação de anúncios individuais. Pode conter preços desatualizados e não representa vendas realizadas.</p>}
 {referenceSource==='webmotors'&&referenceLowest.length===2&&<p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-900">Amostra Webmotors limitada a dois registros indexados; não há anúncio individual confirmado nem preço definitivo.</p>}
 {webmotorsAboveReference&&<p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-900">Atenção: as ofertas Webmotors extraídas ficaram {vehicleType==='motorcycle'?'mais de 60%':'mais de 35%'} acima da FIPE. A busca pode ter ignorado os menores preços. {referenceAvg>0?'Esta é apenas uma simulação indexada da Webmotors, nunca uma cotação definitiva.':'Nenhuma média de mercado foi calculada.'}</p>}<p className="mt-2 text-2xl font-bold text-cyan-950">{money(referenceCeiling)}</p><p className="mt-1 text-xs text-cyan-900">Cálculo: média × 0,86 {repasse?'× 0,95 ':''}− custos {money(number(cost))}. Não é teto definitivo nem aprovação de compra. Anúncios, versão e condições ainda não foram auditados.</p></div>}{currentAds.length===0&&<div className="mb-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
  Ainda não há anúncios associados a este veículo. Nenhum preço foi criado artificialmente.
  {historicalEstimate&&<p className="mt-2 font-bold text-indigo-900">Referência histórica disponível: {money(historicalEstimate.target)} (estimativa de compra, não preço anunciado).</p>}
 </div>}<div className="space-y-3">{currentAds.map((ad,i)=><div key={i} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-4"><label>Portal{ad.auto&&<span className="ml-2 text-xs font-semibold text-cyan-700">{ad.catalog?'Vitrine indexada':'Anúncio indexado'}</span>}<select className={input} disabled={Boolean(ad.auto)} value={ad.source||"webmotors"} onChange={e=>change(i,{source:e.target.value as Ad["source"],url:"",status:"pending"})}><option value="webmotors">Webmotors</option><option value="olx">OLX</option><option value="napista">NaPista</option></select></label>{ad.title&&<p className="self-end text-xs font-semibold text-slate-600 md:col-span-3">{ad.title}{ad.catalog&&<span className="ml-2 text-amber-700">· preço da vitrine, sem link individual</span>}</p>}<label>Preço R$<input className={input} readOnly={Boolean(ad.auto)} value={ad.price} onChange={e=>change(i,{price:e.target.value})}/></label><label>KM anúncio<input className={input} readOnly={Boolean(ad.auto)} value={ad.km} onChange={e=>change(i,{km:e.target.value})}/></label><label>Link da fonte<input className={input} readOnly={Boolean(ad.auto)} value={ad.url} onChange={e=>change(i,{url:e.target.value})}/>{ad.url&&!portalLink(ad)&&<small className="text-red-700">Link HTTPS do portal selecionado necessário.</small>}{ad.catalog&&<small className="text-amber-700">Página de resultados, sem anúncio individual comprovado.</small>}</label><label>Classificação<select className={input} value={ad.auto&&ad.status==='valid'?'pending':ad.status} onChange={e=>change(i,{status:e.target.value==='excluded'?'excluded':ad.auto?'pending':e.target.value as Ad['status']})}><option value="pending">{ad.auto?'Indexado, sem auditoria':'Pendente'}</option><option value="valid" disabled={Boolean(ad.auto||ad.catalog||!validSource(ad))}>Válido, conferido</option><option value="excluded">Excluir</option></select></label><label className="md:col-span-3">Observação / suspeita de leilão ou sinistro<input className={input} readOnly={Boolean(ad.auto)} value={ad.note} onChange={e=>change(i,{note:e.target.value})}/></label><div className="flex items-end gap-2">{portalLink(ad)&&<a href={ad.url} target="_blank" rel="noopener noreferrer" className="rounded border p-2 text-sm">{ad.catalog?'Ver fonte':'Abrir anúncio'}</a>}<button className="rounded border p-2 text-sm text-red-700" onClick={()=>setAds(a=>a.filter((_,j)=>j!==i))}>Excluir</button></div></div>)}</div><p className="mt-3 text-xs text-amber-800">Um anúncio indexado não comprova procedência nem ausência de sinistro ou leilão. Confira laudo, versão e condições antes de validar.</p>{distantKm.length>0&&<p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Atenção: {distantKm.length} anúncio(s) marcado(s) válido(s) têm diferença superior a 30.000 km do veículo. Revise ou exclua antes de salvar.</p>}{suspectAds.length>0&&<p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">Atenção: {suspectAds.length} anúncio(s) válido(s) têm observações de possível leilão, sinistro ou restrição. Exclua da média ou revise a classificação.</p>}</section>
 <section className="grid gap-4 rounded-xl bg-white p-5 md:grid-cols-2"><div><h2 className="mb-3 text-xl font-semibold">Cálculo da Mesa</h2><p className="text-sm text-slate-600">Custos informados: <strong>{money(number(cost))}</strong></p><p className="mt-2 text-sm text-slate-600">Destino: <strong>{repasse?'Repasse · 14% + 5%':'Showroom · 14%'}</strong></p><p className="mt-2 text-xs text-slate-500">Para alterar a classificação, o preparo ou o destino, use os campos no início da análise histórica.</p></div><div className="rounded-xl bg-slate-50 p-4"><p>{valid.length} anúncio(s) válido(s) de {currentAds.length}</p><p className="text-sm">Webmotors: {primary.length} válido(s), média {money(avg)} · OLX: {secondary.length} válido(s), média {money(olxAvg)}</p>{primary.length>0&&secondary.length>0&&<p className="text-xs text-slate-600">Diferença OLX x Webmotors: {money(olxAvg-avg)}. Apenas referência, sem ajuste automático.</p>}<p className="text-xs text-slate-600">Anúncios válidos ordenados do menor preço: {sortedValid.length?sortedValid.map(a=>money(number(a.price))).join(" · "):"nenhuma"}</p>{primary.length>0&&<><p>Média dos menores Webmotors conferidos: <strong>{money(avg)}</strong></p><p>Após 14%: {money(avg*.86)}</p>{repasse&&<p>Após 5% adicionais: {money(avg*.86*.95)}</p>}</>}<p>Custos: {money(number(cost))}</p><p className="mt-3 text-lg font-semibold">Precificação da Mesa</p>{marketReady?<><p className="text-xs font-semibold text-emerald-700">Teto com anúncios conferidos</p><p className="text-3xl font-bold text-emerald-700">{money(ceiling)}</p></>:referenceAvg>0?<><p className="text-xs font-semibold text-amber-800">Estimativa automática, não aprovada · {referenceName}</p><p className="text-3xl font-bold text-cyan-800">{money(referenceCeiling)}</p><p className="mt-1 text-xs text-slate-600">Teto definitivo indisponível até conferir 2 anúncios individuais Webmotors. {marketSample.sampleContainsCatalogPages?'Os dados podem reunir preços de vitrines sem anúncios individuais confirmados.':''}</p></>:historicalEstimate?<div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
 <p className="text-xs font-bold uppercase tracking-wider text-indigo-800">Sem anúncios indexados · usando histórico de compras</p>
 <p className="mt-1 text-3xl font-black text-indigo-950">{money(historicalEstimate.target)}</p>
 <p className="mt-1 text-xs text-indigo-900">Faixa estimada {money(historicalEstimate.rangeMin)} a {money(historicalEstimate.rangeMax)}. Ajusta automaticamente com FIPE, KM, classificação, custos e destino. Não é preço de anúncio nem compra aprovada.</p>
 </div>:<p className="text-sm font-semibold text-amber-800">Sem anúncios confiáveis. Para obter o preço histórico, selecione a classificação da avaliação e confira FIPE e KM acima.</p>}</div></section>
 <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">O histórico permanente fica na aba <button type="button" onClick={()=>switchDeskSection('history')} className="font-bold text-cyan-800 underline">Histórico de avaliações</button>. Cada versão salva mantém data, responsável, anúncios, custos e valor registrado.</section>
 </>}
 </main>
 </>;
}
