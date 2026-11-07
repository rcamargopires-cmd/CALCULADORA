import {rankWebmotorsCandidates,type ShortlistVehicle,type ShortlistEntry} from './marketIqWebmotorsShortlist';

export type RadarFipeQuote={
 value:number;brand:string;model:string;year:number;fuel:string;
 fipeCode:string;referenceMonth:string;referenceStatus:'current'|'outdated'|'unverified';
 referenceSource:string;expectedReference?:string;
};
export type RadarWebmotorsListing={
 url:string;price:number;km:number;title:string;checked:boolean;
};
export type RadarWebmotorsEvidence={
 count:number;average:number|null;listings:ShortlistEntry[];
 rejected:{reason:string;count:number}[];
};
const clean=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const trimAliases:{[key:string]:string[]}={
 rs:['rs'],ltz:['ltz'],lt:['lt'],premier:['premier'],highline:['highline'],
 comfortline:['comfortline'],sense:['sense'],limited:['limited','ltd'],
 longitude:['longitude','long'],trailhawk:['trailhawk'],sport:['sport'],
 platinum:['platinum'],extreme:['extreme'],nline:['n line','nline'],
 endurance:['endurance'],ranch:['ranch'],volcano:['volcano'],titanium:['titanium']
};
export const radarTrim=(name:string)=>{
 const words=clean(name).split(' ').filter(Boolean);
 const exact=Object.entries(trimAliases).find(([key])=>{
  if(key==='lt')return words.includes('lt')&&!words.includes('ltz');
  return words.includes(key);
 });
 return exact?.[0]||'';
};
const hasTrim=(label:string,trim:string)=>{
 if(!trim)return false;
 const s=clean(label),words=s.split(' ');
 return (trimAliases[trim]||[trim]).some(alias=>{
  const fragment=alias.split(' ');
  return fragment.length===1?words.includes(fragment[0]):s.includes(alias);
 });
};
export function summarizeOperatorWebmotors(
 rows:RadarWebmotorsListing[],
 target:ShortlistVehicle,
 exactModelLabel:string
):RadarWebmotorsEvidence{
 const discarded=new Map<string,number>();
 const reject=(name:string)=>discarded.set(name,(discarded.get(name)||0)+1);
 const requiredTrim=radarTrim(exactModelLabel);
 const prechecked=rows.filter(x=>{
  if(!x.checked){reject('Pendente de conferência pelo operador');return false;}
  if(!requiredTrim){reject('Versão exata não identificada: selecione FIPE da versão');return false;}
  let u:URL;
  try{u=new URL(x.url);}catch{reject('Link inválido');return false;}
  const identity=u.pathname.replace(/-/g,' ')+' '+x.title;
  if(!hasTrim(identity,requiredTrim)){reject('Versão do anúncio não confere');return false;}
  return true;
 });
 const ranked=rankWebmotorsCandidates(prechecked.map(x=>({
  source:'webmotors',status:'valid',auto:false,catalog:false,
  price:x.price,km:x.km,url:x.url,title:x.title
 })),target);
 for(const {reason,count} of ranked.discarded)discarded.set(reason,(discarded.get(reason)||0)+count);
 const accepted=ranked.accepted.filter(x=>{
  if(x.possibleFipePremium){reject('Preço 35% acima da FIPE: exige revisão');return false;}
  return true;
 }).slice(0,5);
 // Only 2-5 unique individual Webmotors URLs, explicitly checked, with
 // correct vehicle/model year/KM and a recognized matching version.
 const average=accepted.length>=2?Math.round(accepted.reduce((s,x)=>s+x.price,0)/accepted.length):null;
 return {count:accepted.length,average,listings:accepted,
  rejected:[...discarded].map(([reason,count])=>({reason,count}))};
}
export function validatedRadarFipe(detail:any,expectedYear:number):RadarFipeQuote|null{
 const value=Number(detail?.value),year=Number(detail?.year);
 const code=String(detail?.fipeCode||''),model=String(detail?.model||'').trim();
 if(!Number.isFinite(value)||value<1000||value>2000000||year!==expectedYear||
  !/^\d{6}-\d$/.test(code)||!model)return null;
 return {
  value,year,fipeCode:code,model,brand:String(detail?.brand||''),
  fuel:String(detail?.fuel||''),referenceMonth:String(detail?.referenceMonth||''),
  referenceStatus:['current','outdated'].includes(detail?.referenceStatus)?detail.referenceStatus:'unverified',
  referenceSource:String(detail?.referenceSource||'FIPE'),
  expectedReference:String(detail?.expectedReference||'')
 };
}
