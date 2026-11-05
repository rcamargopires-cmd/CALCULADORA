/**
 * Local browser draft, NOT a financial approval or the online valuation history.
 * Records are scoped to the signed-in company/store/user and evaluation key.
 * Keep at most 20 recent valuations for 14 days; no Webmotors cookies,
 * customer identity, API keys, or approval/paid values are stored here.
 */
export type DraftCapturedAd = {
 source:'webmotors';price:string;km:string;url:string;
 status:'pending';note:string;auto:false;catalog:false;
 title:string;year:number;
};
export type DraftImportedAd = Omit<DraftCapturedAd,'year'>;
export type CaptureReviewSelections = {
 selectedIds:string[]|null;
 checkedIds:string[];
};
export type CaptureDraft={
 captured:DraftCapturedAd[];
 imported:DraftImportedAd[];
 review:CaptureReviewSelections;
 updatedAt:number;
};
type StoredIndex={version:1;entries:Record<string,CaptureDraft>};
type StoragePort=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export const CAPTURE_DRAFT_DAYS=14;
const TTL=CAPTURE_DRAFT_DAYS*24*60*60*1000;
const MAX_EVALUATIONS=20;
const SCHEMA_PREFIX='motyq-iq-private-capture-v1-';
const maxLength=(s:unknown,size:number)=>String(s??'').slice(0,size);
const safeUrl=(raw:unknown):string|null=>{
 try{
  const url=new URL(String(raw||''));
  if(url.protocol!=='https:'||!['webmotors.com.br','www.webmotors.com.br'].includes(url.hostname.toLowerCase()))return null;
  const segments=url.pathname.split('/').filter(Boolean);
  if(segments[0]!=='comprar'||segments.length<6||!/^\d{7,}$/.test(segments[segments.length-1]))return null;
  return url.origin+url.pathname;
 }catch{return null;}
};
const validNumber=(v:unknown,min:number,max:number)=>{
 const n=Number(v);
 return Number.isFinite(n)&&n>=min&&n<=max?n:null;
};
const safeCaptured=(raw:any):DraftCapturedAd|null=>{
 const url=safeUrl(raw?.url),price=validNumber(raw?.price,1000,2000000);
 const km=validNumber(raw?.km,1,999999),year=validNumber(raw?.year,1990,2100);
 if(!url||price===null||km===null||year===null||!Number.isInteger(year))return null;
 return {url,price:String(Math.round(price)),km:String(Math.round(km)),year,
  source:'webmotors',status:'pending',auto:false,catalog:false,
  title:maxLength(raw?.title,120),note:maxLength(raw?.note,280)};
};
const safeImported=(raw:any):DraftImportedAd|null=>{
 const ad=safeCaptured({...raw,year:2025});
 if(!ad)return null;
 const {year,...rest}=ad;
 return rest;
};
const dedup=<T extends {url:string}>(items:T[],cap:number)=>{
 const seen=new Set<string>();
 return items.filter(item=>{if(seen.has(item.url))return false;seen.add(item.url);return true;}).slice(0,cap);
};
const safeIds=(raw:unknown,cap=12)=>
 Array.isArray(raw)?Array.from(new Set(raw.filter((v):v is string=>typeof v==='string'&&v.length<=240))).slice(0,cap):[];
const draftFrom=(raw:any,now:number):CaptureDraft|null=>{
 if(!raw||!Number.isFinite(raw.updatedAt)||raw.updatedAt>now+60*1000||
  now-raw.updatedAt>TTL)return null;
 const captured=dedup((Array.isArray(raw.captured)?raw.captured:[]).map(safeCaptured)
   .filter((x):x is DraftCapturedAd=>Boolean(x)),12);
 const imported=dedup((Array.isArray(raw.imported)?raw.imported:[]).map(safeImported)
   .filter((x):x is DraftImportedAd=>Boolean(x)),50);
 const validIds=new Set(captured.map(a=>a.url));
 const selected=raw.review?.selectedIds===null?null:
  safeIds(raw.review?.selectedIds).filter(id=>validIds.has(id));
 const checked=safeIds(raw.review?.checkedIds).filter(id=>validIds.has(id));
 return {captured,imported,review:{selectedIds:selected,checkedIds:checked},updatedAt:raw.updatedAt};
};
const location=(scope:string)=>SCHEMA_PREFIX+encodeURIComponent(scope.slice(0,200));
const indexFrom=(raw:string|null,now:number):StoredIndex=>{
 let parsed:unknown;
 try{parsed=raw?JSON.parse(raw):null;}catch{return {version:1,entries:{}};}
 if(!parsed||typeof parsed!=='object'||(parsed as any).version!==1)return {version:1,entries:{}};
 const entries:Record<string,CaptureDraft>={};
 const input=(parsed as any).entries;
 if(!input||typeof input!=='object')return {version:1,entries};
 for(const [k,v] of Object.entries(input).slice(0,100)){
  if(!k||k.length>350)continue;
  const draft=draftFrom(v,now);
  if(draft)entries[k]=draft;
 }
 const ordered=Object.entries(entries).sort((a,b)=>b[1].updatedAt-a[1].updatedAt).slice(0,MAX_EVALUATIONS);
 return {version:1,entries:Object.fromEntries(ordered)};
};
export function captureDraftKey(input:{
 vehicleType:string;brandCode:string;modelCode:string;yearCode:string;
 km:string;plate?:string;
}):string{
 const plate=String(input.plate||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
 return [input.vehicleType,input.brandCode,input.modelCode,input.yearCode,
  String(input.km).replace(/[^0-9]/g,''),plate].map(x=>encodeURIComponent(String(x||''))).join('|');
}
export function readCaptureDraft(storage:StoragePort|undefined,scope:string,key:string,now=Date.now()):CaptureDraft|null{
 if(!storage||!key)return null;
 try{return indexFrom(storage.getItem(location(scope)),now).entries[key]||null;}catch{return null;}
}
export function writeCaptureDraft(storage:StoragePort|undefined,scope:string,key:string,data:Omit<CaptureDraft,'updatedAt'>,now=Date.now()):boolean{
 if(!storage||!key)return false;
 try{
  const current=indexFrom(storage.getItem(location(scope)),now);
  const draft=draftFrom({...data,updatedAt:now},now);
  if(!draft)return false;
  current.entries[key]=draft;
  current.entries=Object.fromEntries(Object.entries(current.entries)
   .sort((a,b)=>b[1].updatedAt-a[1].updatedAt).slice(0,MAX_EVALUATIONS));
  storage.setItem(location(scope),JSON.stringify(current));
  return true;
 }catch{return false;}
}
export function clearCaptureDraft(storage:StoragePort|undefined,scope:string,key:string,now=Date.now()):boolean{
 if(!storage||!key)return false;
 try{
  const current=indexFrom(storage.getItem(location(scope)),now);
  delete current.entries[key];
  if(Object.keys(current.entries).length)storage.setItem(location(scope),JSON.stringify(current));
  else storage.removeItem(location(scope));
  return true;
 }catch{return false;}
}
