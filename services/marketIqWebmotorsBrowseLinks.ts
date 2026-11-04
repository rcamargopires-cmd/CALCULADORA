/**
 * Webmotors search-page deep links for the currently selected valuation.
 *
 * URLs are constructed from the actual vehicle/region fields, NOT from arbitrary
 * indexed pages which may be in Fortaleza or other unrelated markets.
 * These are browse links, not a live Webmotors listing feed or a verified quote.
 * Supported routing patterns were confirmed against public Webmotors pages.
 */
export type WebmotorsOrder='lowest-price'|'relevance';
/** The Webmotors public search URL uses o=5 for "Menor preço".
 * This helper modifies only a known Webmotors browse URL; it does not
 * fetch the site or claim listings are verified or live. */
export function withWebmotorsOrder(raw:string|null,order:WebmotorsOrder='lowest-price'):string|null{
 if(!raw)return null;
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.hostname!=='www.webmotors.com.br')return null;
  if(!/^\/(carros|motos)\//.test(url.pathname))return null;
  if(order==='lowest-price')url.searchParams.set('o','5');
  else url.searchParams.delete('o');
  return url.toString();
 }catch{return null;}
}
export type WebmotorsRegion='sp'|'sp-sorocaba'|'sp-sao-paulo'|'br';
export type WebmotorsBrowseVehicle={
 brand:string;model:string;year:number;vehicleType:'car'|'motorcycle';
};
export type WebmotorsVersion={slug:string;label:string};
export type WebmotorsBrowseLinks={
 modelUrl:string|null;versionUrl:string|null;
 versionOptions:WebmotorsVersion[];versionMatch:'automatic'|'manual'|'not-mapped';
 brandLabel:string;modelLabel:string;versionLabel:string|null;
 regionLabel:string;year:number;
};
export const WEBMOTORS_REGIONS:{id:WebmotorsRegion;label:string}[]=[
 {id:'sp',label:'Estado de São Paulo (SP)'},
 {id:'sp-sorocaba',label:'Sorocaba / SP'},
 {id:'sp-sao-paulo',label:'São Paulo, capital / SP'},
 {id:'br',label:'Brasil inteiro'}
];
const slug=(x:string)=>String(x||'').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const normalizeBrand=(name:string)=>{
 const last=String(name||'').split(/\s+-\s+/).pop()?.trim()||'';
 const plain=slug(last);
 if(plain==='vw')return 'volkswagen';
 if(plain==='gm')return 'chevrolet';
 if(plain==='mercedes')return 'mercedes-benz';
 return plain;
};
const splitCar=(name:string)=>{
 const value=String(name||'').trim().replace(/\s+/g,' ');
 const parts=value.split(' ').filter(Boolean);
 if(!parts.length)return {family:'',rest:''};
 // Families such as T-Cross and T Cross retain the model name as one unit.
 const t=/^([a-z])[- ](cross|roc|iguan)(?=\s|$)/i.exec(value);
 if(t){
  const prefix=t[0],family=t[1]+'-'+t[2];
  return {family:slug(family),rest:value.slice(prefix.length).trim()};
 }
 const family=parts[0];
 return {family:slug(family),rest:parts.slice(1).join(' ')};
};
// Verified Webmotors URL paths, not guessed slugs. Each list item has been
// checked against a public version-filter page for the corresponding model.
// New brands/trims must be added after checking a live canonical route.
const versionsFor=(brand:string,family:string):WebmotorsVersion[]=>{
 if(brand==='hyundai'&&family==='hb20')return [
  {slug:'10-12v-flex-sense-plus-manual',label:'1.0 12V Flex Sense Plus Manual'},
  {slug:'10-12v-flex-sense-manual',label:'1.0 12V Flex Sense Manual'}
 ];
 if(brand==='jeep'&&family==='compass')return [
  {slug:'13-t270-turbo-flex-longitude-at6',label:'1.3 T270 Turbo Flex Longitude AT6'},
  {slug:'13-t270-turbo-flex-limited-at6',label:'1.3 T270 Turbo Flex Limited AT6'},
  {slug:'13-t270-turbo-flex-sport-at6',label:'1.3 T270 Turbo Flex Sport AT6'},
  {slug:'13-t270-turbo-flex-s-at6',label:'1.3 T270 Turbo Flex S AT6'},
  {slug:'20-td350-turbo-diesel-longitude-at9',label:'2.0 TD350 Turbo Diesel Longitude AT9'},
  {slug:'20-td350-turbo-diesel-limited-at9',label:'2.0 TD350 Turbo Diesel Limited AT9'},
  {slug:'20-td350-turbo-diesel-trailhawk-at9',label:'2.0 TD350 Turbo Diesel Trailhawk AT9'}
 ];
 if(brand==='volkswagen'&&family==='t-cross')return [
  {slug:'10-200-tsi-total-flex-sense-automatico',label:'1.0 200 TSI Total Flex Sense Automático'}
 ];
 return [];
};
const detectVersion=(brand:string,family:string,rest:string,choices:WebmotorsVersion[]):WebmotorsVersion|null=>{
 const normalized=slug(rest);
 const has=(token:string)=>new RegExp('(?:^|-)'+token+'(?:-|$)').test(normalized);
 const find=(slug:string)=>choices.find(v=>v.slug===slug)||null;
 if(brand==='hyundai'&&family==='hb20'){
  const isSensePlus=has('sense')&&has('plus');
  const isSense=has('sense')&&!has('plus');
  // Automatic HB20 variants must never be mistaken for the verified manual path.
  const isManual=has('manual')||has('mec')||has('mt');
  if(!isManual)return null;
  if(isSensePlus&&has('12v'))return find('10-12v-flex-sense-plus-manual');
  if(isSense&&has('12v'))return find('10-12v-flex-sense-manual');
 }
 if(brand==='jeep'&&family==='compass'){
  const longitude=has('long')||has('longitude');
  const limited=has('ltd')||has('limited')||has('limit');
  const trailhawk=has('trail')||has('trailhawk')||has('trailh');
  const sport=has('sport');
  const seriesS=has('s')&&!longitude&&!limited&&!trailhawk&&!sport;
  const matches=[longitude,limited,trailhawk,sport,seriesS].filter(Boolean).length;
  if(matches!==1)return null;
  // Only resolve when the engine type has a unique known Webmotors version.
  // FIPE abbreviations: T270 / 1.3 TB; TD350 / 2.0 diesel.
  const flex=has('t270')||(has('1')&&has('3')&&(has('tb')||has('turbo')));
  const diesel=has('td350')||has('diesel')||(has('2')&&has('0')&&has('td'));
  if(flex===diesel)return null;
  const trim=longitude?'longitude':limited?'limited':trailhawk?'trailhawk':sport?'sport':'s';
  if(diesel&&!['longitude','limited','trailhawk'].includes(trim))return null;
  return find((diesel?'20-td350-turbo-diesel-':'13-t270-turbo-flex-')+trim+(diesel?'-at9':'-at6'));
 }
 if(brand==='volkswagen'&&family==='t-cross'){
  const isSense=has('sense'),is200=has('200')||has('1')&&has('0');
  const automatic=has('aut')||has('automatico')||has('at6');
  if(isSense&&is200&&automatic)return find('10-200-tsi-total-flex-sense-automatico');
 }
 return null;
};
export const getWebmotorsVersionOptions=(brand:string,model:string):WebmotorsVersion[]=>{
 const b=normalizeBrand(brand),c=splitCar(model);
 return versionsFor(b,c.family);
};
export function buildWebmotorsBrowseLinks(
 vehicle:WebmotorsBrowseVehicle,region:WebmotorsRegion='sp',manualVersionSlug?:string|null
):WebmotorsBrowseLinks{
 const chosen=WEBMOTORS_REGIONS.find(x=>x.id===region)||WEBMOTORS_REGIONS[0];
 const brand=normalizeBrand(vehicle.brand);
 const year=Number(vehicle.year);
 const isCar=vehicle.vehicleType!=='motorcycle';
 const car=isCar?splitCar(vehicle.model):null;
 const modelSlug=isCar?car?.family||'':slug(vehicle.model);
 const brandLabel=String(vehicle.brand||'').split(/\s+-\s+/).pop()?.trim()||'';
 const modelLabel=isCar?(car?.family||'').toUpperCase():String(vehicle.model||'').trim();
 const blank:WebmotorsBrowseLinks={
  modelUrl:null,versionUrl:null,brandLabel,modelLabel,versionLabel:null,
  versionOptions:[],versionMatch:'not-mapped',regionLabel:chosen.label,year
 };
 if(!brand||!modelSlug||!Number.isInteger(year)||year<1990||year>2100)return blank;
 if(!/^[a-z0-9-]{2,70}$/.test(brand)||!/^[a-z0-9-]{2,85}$/.test(modelSlug))return blank;
 const type=isCar?'carros':'motos';
 const location=chosen.id==='br'?'estoque':chosen.id;
 const root='https://www.webmotors.com.br/'+[type,location,brand,modelSlug].join('/');
 const suffix='/de.'+year+'/ate.'+year;
 const versionOptions=isCar?versionsFor(brand,modelSlug):[];
 const detected=isCar?detectVersion(brand,modelSlug,car?.rest||'',versionOptions):null;
 const chosenVersion=manualVersionSlug?
   versionOptions.find(v=>v.slug===manualVersionSlug)||null:detected;
 return {
  ...blank,modelUrl:root+suffix,
  versionUrl:chosenVersion?root+'/'+chosenVersion.slug+suffix:null,
  versionLabel:chosenVersion?.label||null,
  versionOptions,versionMatch:chosenVersion?(manualVersionSlug?'manual':'automatic'):'not-mapped'
 };
}
