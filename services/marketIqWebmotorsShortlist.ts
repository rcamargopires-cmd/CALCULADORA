/**
 * Webmotors-only comparable shortlist, from publicly indexed candidates.
 *
 * Indexed candidates are NEVER verified advertisements, even when all metadata
 * fits. Used for exploratory market context, NOT for automatically approving a
 * purchase or changing the paid value. Official Webmotors access/partnership
 * is required for a contractually supported live listing feed.
 */
export type ShortlistVehicle={
 brand:string;model:string;year:number;km:number;vehicleType:'car'|'motorcycle';fipe?:number|null;
};
export type ShortlistAd={
 source?:string;price?:string|number;km?:string|number;url?:string;title?:string;
 note?:string;catalog?:boolean;auto?:boolean;status?:string;
};
export type ShortlistEntry={
 id:string;url:string;title:string;price:number;km:number;
 kmDifference:number;year:number;possibleFipePremium:boolean;
};
export type ShortlistResult={
 accepted:ShortlistEntry[];topFive:ShortlistEntry[];
 discarded:{reason:string;count:number}[];
 total:number;sampleAverage:number|null;sampleCount:number;
};
const number=(value:unknown):number=>{
 if(typeof value==='number')return Number.isFinite(value)?value:0;
 const s=String(value??'').trim().replace(/R\$/gi,'').replace(/\s/g,'');
 if(!/^[\d.,]+$/.test(s))return 0;
 const normalized=s.includes(',')?s.replace(/\./g,'').replace(',','.'):
  /^\d{1,3}(?:\.\d{3})+$/.test(s)?s.replace(/\./g,''):s;
 return Number(normalized)||0;
};
const slug=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const code=(s:unknown)=>slug(s).replace(/-/g,'');
const knownBrand=(brand:string)=>{
 const s=String(brand||'').split(/\s+-\s+/).pop()||'';
 const b=code(s);
 return b==='vw'?'volkswagen':b==='gm'?'chevrolet':b==='mercedes'?'mercedesbenz':b;
};
const knownModel=(model:string)=>code(String(model||'').split(/\s+/)[0]);
const risky=/leil[aã]o|sinistr|recuperad[ao]|salvado|sucata|batid[ao]|restri[cç][aã]o|dano estrutural/i;
export function rankWebmotorsCandidates(
 raw:ShortlistAd[],vehicle:ShortlistVehicle
):ShortlistResult {
 const seen=new Set<string>();
 const reasons=new Map<string,number>();
 const accepted:ShortlistEntry[]=[];
 const fail=(reason:string)=>reasons.set(reason,(reasons.get(reason)||0)+1);
 const targetBrand=knownBrand(vehicle.brand);
 const targetModel=knownModel(vehicle.model);
 const tolerance=vehicle.vehicleType==='motorcycle'?10000:30000;
 for(const ad of raw||[]){
  if(ad?.source!=='webmotors'){fail('Outro portal');continue;}
  if(ad?.status==='excluded'){fail('Excluído pelo operador');continue;}
  if(ad?.catalog){fail('Vitrine, não anúncio individual');continue;}
  let url:URL;
  try{url=new URL(String(ad.url||''));}catch{fail('URL do anúncio inválida');continue;}
  if(url.protocol!=='https:'||!['webmotors.com.br','www.webmotors.com.br'].includes(url.hostname.toLowerCase())){
   fail('Fora da Webmotors');continue;
  }
  const parts=url.pathname.split('/').filter(Boolean);
  if(parts.length<5||parts[0].toLowerCase()!=='comprar'||!/^\d{7,}$/.test(parts[parts.length-1])){
   fail('Vitrine ou link sem identificação individual');continue;
  }
  const paired=parts.slice(3,-1).map(p=>p.match(/(?:19|20)\d{2}-((?:19|20)\d{2})/)).find(Boolean);
  const yearText=paired?paired[1]:parts.slice(3,-1).find(p=>/^(?:19|20)\d{2}$/.test(p));
  const year=yearText?Number(yearText):0;
  if(!year||year!==vehicle.year){fail('Ano/modelo diferente ou não identificável');continue;}
  if(!targetBrand||!targetModel||
   knownBrand(parts[1])!==targetBrand||code(parts[2])!==targetModel){
   fail('Marca ou modelo incompatível');continue;
  }
  const price=number(ad.price),km=number(ad.km);
  if(price<1000||price>2000000||!Number.isFinite(km)||km<=0||km>999999){
   fail('Preço ou KM ausente/inválida');continue;
  }
  const kmDifference=Math.abs(km-vehicle.km);
  if(!Number.isFinite(vehicle.km)||vehicle.km<1||kmDifference>tolerance){
   fail('KM fora da faixa comparável');continue;
  }
  if(risky.test(String(ad.title||'')+' '+String(ad.note||''))){
   fail('Indício de leilão, sinistro ou restrição');continue;
  }
  const canonical=(url.origin+url.pathname).replace(/\/$/,'').toLowerCase();
  if(seen.has(canonical)){fail('Anúncio repetido');continue;}
  seen.add(canonical);
  accepted.push({
   id:parts[parts.length-1],url:canonical,title:String(ad.title||'Anúncio Webmotors').slice(0,140),
   price,km,kmDifference,year,
   possibleFipePremium:Boolean(vehicle.fipe&&price>vehicle.fipe*1.35)
  });
 }
 accepted.sort((a,b)=>a.price-b.price||a.kmDifference-b.kmDifference||a.id.localeCompare(b.id));
 const topFive=accepted.slice(0,5);
 return {
  accepted,topFive,total:raw?.length||0,
  discarded:[...reasons].map(([reason,count])=>({reason,count})).sort((a,b)=>b.count-a.count),
  sampleAverage:topFive.length>=2?Math.round(topFive.reduce((sum,a)=>sum+a.price,0)/topFive.length):null,
  sampleCount:topFive.length
 };
}
