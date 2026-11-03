/**
 * Motorcycles must never reuse the car-only regression.
 * These observations come from the user's existing local AutoAvaliar import,
 * with no customer identifiers or source spreadsheet uploaded to the server.
 * "COMPRA" in AutoAvaliar is a purchase-status proxy; its "Valor avaliado"
 * field is not proven to be the final amount effectively paid.
 */
import type {DashboardRow} from './marketIqManagementData';

export interface MotorcycleMarketReference {
  scope:'model'|'brand'|'motorcycles';
  sampleSize:number;
  medianRatio:number;
  meanRatio:number;
  medianIndication:number;
  meanIndication:number;
  minRatio:number;
  maxRatio:number;
  sameModelCount:number;
  sameBrandCount:number;
  calibrated:false;
}
const canonical=(v:string)=>String(v||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/g,' ').trim();
const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:NaN;
const median=(items:number[])=>{const a=[...items].sort((x,y)=>x-y);return a.length?(a.length%2?a[Math.floor(a.length/2)]:(a[a.length/2-1]+a[a.length/2])/2):0;};

export function calculateMotorcycleMarketReference(
 rows:DashboardRow[],input:{brand:string;model:string;year:number;km:number;fipe:number}
):MotorcycleMarketReference|null {
 if(!Number.isFinite(input.fipe)||input.fipe<1000||input.fipe>300000||
   !Number.isFinite(input.year)||input.year<1980||input.year>2100||
   !Number.isFinite(input.km)||input.km<0)return null;
 const brand=canonical(input.brand),model=canonical(input.model),modelKey=model.split(' ').slice(0,2).join(' ');
 const valid=rows.filter(r=>r.vehicleType==='motorcycle'&&r.status==='COMPRA'&&
   finite(r.value)>=1000&&finite(r.fipe)>=1000&&r.value/r.fipe>=.35&&r.value/r.fipe<=1.25&&
   finite(r.year)>=1980&&finite(r.km)>=0
 );
 const sameBrand=valid.filter(r=>canonical(r.brand)===brand);
 const sameModel=sameBrand.filter(r=>canonical(r.model).startsWith(modelKey)&&
   Math.abs(r.year-input.year)<=2&&Math.abs(r.km-input.km)<=20000);
 // At least three similar examples for a model-specific/brand reference.
 // Otherwise, at least five valid motorcycle transactions to get an exploratory
 // cross-category benchmark. Never silently manufacture a sample.
 const sample=sameModel.length>=3?sameModel:sameBrand.length>=3?sameBrand:valid.length>=5?valid:[];
 if(!sample.length)return null;
 const ratios=sample.map(r=>r.value/r.fipe).sort((a,b)=>a-b);
 const med=median(ratios),mean=ratios.reduce((sum,v)=>sum+v,0)/ratios.length;
 return {
   scope:sample===sameModel?'model':sample===sameBrand?'brand':'motorcycles',
   sampleSize:ratios.length,medianRatio:med,meanRatio:mean,
   medianIndication:Math.round(input.fipe*med/50)*50,
   meanIndication:Math.round(input.fipe*mean/50)*50,
   minRatio:ratios[0],maxRatio:ratios[ratios.length-1],
   sameModelCount:sameModel.length,sameBrandCount:sameBrand.length,calibrated:false,
 };
}
export const loadMotorcyclesForUser=(email:string):DashboardRow[]=>{
 try{
   const key='motyq-iq-dashboard-local-v2-all-vehicles-'+email.trim().toLowerCase();
   const raw=localStorage.getItem(key),rows=raw?JSON.parse(raw):[];
   return Array.isArray(rows)?rows.filter((r:any)=>r&&r.vehicleType==='motorcycle'&&
     typeof r.status==='string'&&Number.isFinite(r.value)&&Number.isFinite(r.fipe)).slice(0,15000):[];
 }catch{return [];}
};
