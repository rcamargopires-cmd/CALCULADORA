/** Buyer-side discovery preview only. No live lots, identities or bids are exposed.
 * Real subscriptions require an authenticated buyer + server-authorized tenant feed.
 */
export type AquaInterest={
 vehicleType:'car'|'motorcycle'|'both';brands:string;models:string;
 yearFrom:string;yearTo:string;maxKm:string;budgetTo:string;
};
export type AquaBuyerListing={
 id:string;brand:string;model:string;year:string;km:string;
 vehicleType:'car'|'motorcycle';mode:'open'|'sealed';endsAt:string;
 highestBid?:number;buyNowPrice?:number;notes?:string;
};
const normalize=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const tags=(s:string)=>s.split(/[,;\n]+/).map(normalize).filter(Boolean);
const digits=(v:unknown)=>String(v??'').replace(/\D/g,'');
export const aquaInterestKey='motyq-aqua-buyer-preview-interests-v1';
export const defaultAquaInterest=():AquaInterest=>({
 vehicleType:'car',brands:'Jeep, Volkswagen',models:'',yearFrom:'2019',yearTo:'',
 maxKm:'100000',budgetTo:''
});
export function buyerListingMatches(v:AquaBuyerListing,interest:AquaInterest):boolean{
 if(interest.vehicleType!=='both'&&interest.vehicleType!==v.vehicleType)return false;
 const brand=normalize(v.brand),model=normalize(v.model);
 const brands=tags(interest.brands),models=tags(interest.models);
 if(brands.length&&!brands.some(x=>brand===x||brand.startsWith(x+' ')))return false;
 if(models.length&&!models.some(x=>model===x||model.includes(x)||x.includes(model)))return false;
 const year=Number((v.year.match(/(?:19|20)\d{2}/)||[])[0]);
 const from=Number(interest.yearFrom),to=Number(interest.yearTo);
 if(!year)return false;
 if(from&&year<from)return false;
 if(to&&year>to)return false;
 const km=Number(digits(v.km)),maxKm=Number(digits(interest.maxKm));
 if(maxKm&&(!km||km>maxKm))return false;
 // Budget is an alert ceiling for known *public* immediate-buy prices, not an
 // estimated valuation; do not reject a lot without a published price.
 const maxBudget=Number(digits(interest.budgetTo));
 if(maxBudget&&v.buyNowPrice&&v.buyNowPrice>maxBudget)return false;
 return true;
}
export function loadAquaInterest():AquaInterest{
 try{
  const raw=JSON.parse(localStorage.getItem(aquaInterestKey)||'null');
  if(!raw||typeof raw!=='object')return defaultAquaInterest();
  const copy=defaultAquaInterest();
  for(const key of ['brands','models','yearFrom','yearTo','maxKm','budgetTo'] as const)
   if(typeof raw[key]==='string')copy[key]=raw[key].slice(0,400);
  if(['car','motorcycle','both'].includes(raw.vehicleType))copy.vehicleType=raw.vehicleType;
  return copy;
 }catch{return defaultAquaInterest();}
}
export function saveAquaInterest(v:AquaInterest){
 localStorage.setItem(aquaInterestKey,JSON.stringify(v));
}
export function sampleBuyerLots(now=Date.now()):AquaBuyerListing[]{
 return [
  {id:'DEMO-01',brand:'Jeep',model:'Compass Longitude',year:'2022',km:'48000',vehicleType:'car',mode:'open',endsAt:new Date(now+7200000).toISOString(),highestBid:94000,buyNowPrice:98500,notes:'Exemplo fictício de oportunidade'},
  {id:'DEMO-02',brand:'Volkswagen',model:'T-Cross Comfortline',year:'2021',km:'62000',vehicleType:'car',mode:'sealed',endsAt:new Date(now+21600000).toISOString(),buyNowPrice:89500,notes:'Exemplo fictício de proposta fechada'},
  {id:'DEMO-03',brand:'Honda',model:'CG 160 Fan',year:'2023',km:'18000',vehicleType:'motorcycle',mode:'sealed',endsAt:new Date(now+86400000).toISOString(),notes:'Exemplo fictício de motocicleta'}
 ];
}
export function findNewRelevantListings(previousIds:string[],next:AquaBuyerListing[],interest:AquaInterest){
 const known=new Set(previousIds);
 return next.filter(l=>!known.has(l.id)&&buyerListingMatches(l,interest));
}
