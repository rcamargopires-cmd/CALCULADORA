/**
 * Webmotors search-page deep links for the currently selected valuation.
 *
 * URLs are constructed from the actual vehicle/region fields, NOT from arbitrary
 * indexed pages which may be in Fortaleza or other unrelated markets.
 * These are browse links, not a live Webmotors listing feed or a verified quote.
 * Supported routing patterns were confirmed against public Webmotors pages.
 */
export type WebmotorsRegion='sp'|'sp-sorocaba'|'sp-sao-paulo'|'br';
export type WebmotorsBrowseVehicle={
 brand:string;model:string;year:number;vehicleType:'car'|'motorcycle';
};
export type WebmotorsBrowseLinks={
 modelUrl:string|null;versionUrl:string|null;
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
// Webmotors has confirmed these canonical version paths. Use a narrow allowlist
// rather than guessing an arbitrary FIPE nomenclature that might not be accepted.
const knownVersion=(brand:string,family:string,rest:string):{slug:string;label:string}|null=>{
 const s=slug(rest);
 if(brand==='hyundai'&&family==='hb20'){
  const candidates:Record<string,string>={
   '1-0-12v-flex-sense-plus-manual':'10-12v-flex-sense-plus-manual',
   '1-0-12v-flex-sense-manual':'10-12v-flex-sense-manual'
  };
  const value=candidates[s];
  return value?{slug:value,label:rest.trim()}:null;
 }
 return null;
};
export function buildWebmotorsBrowseLinks(
 vehicle:WebmotorsBrowseVehicle,region:WebmotorsRegion='sp'
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
  regionLabel:chosen.label,year
 };
 if(!brand||!modelSlug||!Number.isInteger(year)||year<1990||year>2100)return blank;
 if(!/^[a-z0-9-]{2,70}$/.test(brand)||!/^[a-z0-9-]{2,85}$/.test(modelSlug))return blank;
 const type=isCar?'carros':'motos';
 const location=chosen.id==='br'?'estoque':chosen.id;
 const root='https://www.webmotors.com.br/'+[type,location,brand,modelSlug].join('/');
 const suffix='/de.'+year+'/ate.'+year;
 const version=isCar?knownVersion(brand,modelSlug,car?.rest||''):null;
 return {
  ...blank,modelUrl:root+suffix,versionUrl:version?root+'/'+version.slug+suffix:null,
  versionLabel:version?.label||null
 };
}
