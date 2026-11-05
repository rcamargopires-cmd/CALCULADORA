/**
 * Motyq IQ: non-committal review of user-captured Webmotors cards.
 *
 * All input originates from a user-initiated copy of a publicly visible
 * listing. Review must never approve, price, or purchase the vehicle.
 * Invalid source/model/year rows are excluded; ambiguous listings are
 * visible but must be individually selected before they can be imported
 * as PENDING. No URL is fetched from this module.
 */
export type CapturedListing={
 url:string;title?:string;price:string|number;km:string|number;
 year:number;status?:string;note?:string;
};
export type CapturedReviewTarget={
 brand:string;model:string;year:number;km:number;vehicleType:'car'|'motorcycle';
 expectedModelUrl?:string|null;expectedVersionUrl?:string|null;
 fipeValue?:number|null;
};
export type CapturedReviewRow={
 id:string;item:CapturedListing;price:number;km:number;year:number;
 kmDifference:number;fipeDifferencePct:number|null;
 reviewState:'eligible'|'review'|'blocked';reasons:string[];
};
export type CapturedReviewSummary={
 rows:CapturedReviewRow[];ready:CapturedReviewRow[];
 topFive:CapturedReviewRow[];meanLowestFive:number|null;
 eligibleCount:number;reviewCount:number;blockedCount:number;
};
const safeNumber=(value:string|number):number=>{
 if(typeof value==='number')return Number.isFinite(value)?value:0;
 const txt=String(value||'').trim().replace(/R\$/gi,'').replace(/\s+/g,'');
 const parsed=txt.includes(',')?Number(txt.replace(/\./g,'').replace(',','.')):
  /^\d{1,3}(?:\.\d{3})+$/.test(txt)?Number(txt.replace(/\./g,'')):Number(txt);
 return Number.isFinite(parsed)?parsed:0;
};
const risk=/\b(?:leil[aã]o|sinistr[oa]|recuperad[ao]|sucata|batid[ao]|salvado|dano estrutural)\b/i;
const canonical=(url:string):URL|null=>{
 try{
  const parsed=new URL(url);
  const host=parsed.hostname.toLowerCase();
  if(parsed.protocol!=='https:'||!['webmotors.com.br','www.webmotors.com.br'].includes(host))return null;
  const parts=parsed.pathname.split('/').filter(Boolean);
  if(parts[0]!=='comprar'||parts.length<6||!/^\d{7,}$/.test(parts[parts.length-1]))return null;
  return parsed;
 }catch{return null;}
};
const locationOfModel=(value:string|null|undefined):{brand:string;model:string;version:string|null}|null=>{
 if(!value)return null;
 try{
  const p=new URL(value).pathname.split('/').filter(Boolean);
  return p.length>=4?{brand:p[2],model:p[3],version:p.length>=6&&!p[4].startsWith('de.')?p[4]:null}:null;
 }catch{return null;}
};
export function reviewCapturedWebmotors(
 list:CapturedListing[],target:CapturedReviewTarget
):CapturedReviewSummary{
 const expected=locationOfModel(target.expectedModelUrl);
 const expectedVersion=locationOfModel(target.expectedVersionUrl)?.version||null;
 const used=new Set<string>();
 const kmTolerance=target.vehicleType==='motorcycle'?10000:30000;
 const hasYear=Number.isInteger(target.year)&&target.year>=1990;
 const hasMileage=Number.isFinite(target.km)&&target.km>0;
 const hasVehicleContext=Boolean(expected?.brand&&expected.model&&hasYear&&hasMileage);
 const rows=(list||[]).slice(0,60).map((item,i):CapturedReviewRow=>{
  const price=safeNumber(item.price),km=safeNumber(item.km),year=Number(item.year);
  const reasons:string[]=[];
  let blocked=false;
  const u=canonical(String(item.url||''));
  const id=u?(u.origin+u.pathname).toLowerCase():String(item.url||i);
  if(!u){blocked=true;reasons.push('Link individual inválido');}
  if(used.has(id)){blocked=true;reasons.push('Anúncio repetido');}
  used.add(id);
  const parts=u?.pathname.split('/').filter(Boolean)||[];
  if(expected&&parts.length>=3&&(parts[1]!==expected.brand||parts[2]!==expected.model)){
   blocked=true;reasons.push('Marca ou modelo diferente');
  }
  if(!Number.isInteger(year)||year<1990||year>2100){
   blocked=true;reasons.push('Ano-modelo inválido no anúncio');
  }else if(hasYear&&year!==target.year){
   blocked=true;reasons.push('Ano-modelo diferente');
  }
  if(price<1000||price>2000000||!Number.isInteger(km)||km<1||km>999999){
   blocked=true;reasons.push('Preço ou KM inválidos');
  }
  const kmDifference=hasMileage?Math.abs(km-target.km):0;
  if(!blocked&&!hasVehicleContext)reasons.push('Complete a avaliação para comparar');
  if(!blocked&&hasMileage&&kmDifference>kmTolerance)reasons.push('Quilometragem distante');
  // The exact family and engine/trim slug are necessary when the user has
  // chosen a verified Webmotors version. Don't silently mix diesel/flex.
  if(!blocked&&expectedVersion&&parts[3]!==expectedVersion)
   reasons.push('Versão do anúncio não confirmada');
  if(!blocked&&risk.test(String(item.title||'')+' '+String(item.note||'')))
   reasons.push('Possível leilão, sinistro ou dano');
  const fipe=Number(target.fipeValue||0);
  const fipeDifferencePct=fipe>0&&price>0?Math.round((price/fipe-1)*1000)/10:null;
  if(!blocked&&fipeDifferencePct!==null&&fipeDifferencePct>35)
   reasons.push('Preço muito acima da FIPE');
  const reviewState=blocked?'blocked':reasons.length?'review':'eligible';
  return {id,item,price,km,year,kmDifference,fipeDifferencePct,reviewState,reasons};
 }).sort((a,b)=>{
  const priority={eligible:0,review:1,blocked:2};
  return priority[a.reviewState]-priority[b.reviewState]||a.price-b.price||a.kmDifference-b.kmDifference;
 });
 const ready=rows.filter(r=>r.reviewState==='eligible');
 const topFive=[...ready].sort((a,b)=>a.price-b.price||a.kmDifference-b.kmDifference).slice(0,5);
 const meanLowestFive=topFive.length>=2?
  Math.round(topFive.reduce((sum,r)=>sum+r.price,0)/topFive.length):null;
 return {
  rows,ready,topFive,meanLowestFive,
  eligibleCount:ready.length,
  reviewCount:rows.filter(r=>r.reviewState==='review').length,
  blockedCount:rows.filter(r=>r.reviewState==='blocked').length
 };
}
