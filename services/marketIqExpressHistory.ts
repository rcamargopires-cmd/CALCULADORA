import type {ExpressVehicleExtract} from './marketIqExpress';

/** Summary of paid history already fetched for the authenticated Mesa.
 * No extra queries; NEVER use unapproved estimates as paid amounts.
 */
export type ExpressHistoryRecord={
 id?:string;plate?:string;brand?:string;model?:string;year?:string;km?:string;
 vehicleType?:'car'|'motorcycle';date?:string;approvedAt?:string;paidAt?:string;
 paidValue?:number|null;approvedValue?:number|null;value?:number|null;
};
export type ExpressHistorySummary={
 matchBy:'plate'|'model'|'none';evaluations:number;paidCount:number;
 minPaid:number|null;maxPaid:number|null;lastPaid:number|null;
 repeatedPaid:number|null;repeatCount:number;lastDate:string;
 matchedModels:string[];incomplete:boolean;
};
const normalize=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toUpperCase().replace(/[^A-Z0-9]/g,'');
const plate=(value:unknown)=>{
 const candidate=normalize(value);
 return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(candidate)?candidate:'';
};
const model=(value:unknown,brand:unknown)=>{
 let name=normalize(value),make=normalize(brand);
 if(make&&name.startsWith(make))name=name.slice(make.length);
 // Short "VW" vs "Volkswagen" may appear in legacy history, so require
 // explicit agreement on full model/version rather than fuzzy assumptions.
 return name;
};
const year=(value:unknown)=>{
 const match=String(value??'').match(/\b(?:19|20)\d{2}\b/);
 return match?Number(match[0]):null;
};
const number=(value:unknown)=>{
 const n=Number(String(value??'').trim());
 return Number.isFinite(n)&&n>0&&n<=2000000?n:0;
};
const km=(value:unknown)=>{
 const n=Number(String(value??'').replace(/[., ]/g,''));
 return Number.isFinite(n)&&n>=0&&n<=999999?n:null;
};
const paid=(row:ExpressHistoryRecord)=>number(row.paidValue)||number(row.approvedValue);
const date=(row:ExpressHistoryRecord)=>String(row.paidAt||row.approvedAt||row.date||'').slice(0,10);
const empty=(incomplete:boolean):ExpressHistorySummary=>({
 matchBy:'none',evaluations:0,paidCount:0,minPaid:null,maxPaid:null,
 lastPaid:null,repeatedPaid:null,repeatCount:0,lastDate:'',matchedModels:[],incomplete
});
export function summarizeExpressHistory(
 captured:ExpressVehicleExtract,history:readonly ExpressHistoryRecord[],incomplete=false
):ExpressHistorySummary{
 if(!Array.isArray(history)||!captured.brand.trim()||!captured.model.trim()||!captured.yearModel)
  return empty(incomplete);
 const capturedPlate=plate(captured.plate);
 const make=normalize(captured.brand),fullModel=model(captured.model,captured.brand),modelYear=year(captured.yearModel);
 if(!make||!fullModel||!modelYear)return empty(incomplete);
 const compatible=(r:ExpressHistoryRecord)=>{
  if(r.vehicleType==='motorcycle')return false;
  const recordMake=normalize(r.brand);
  const recordModel=model(r.model,r.brand);
  if(recordMake&&recordMake!==make)return false;
  if(!recordModel||recordModel!==fullModel)return false;
  const recordYear=year(r.year);
  return recordYear===null||recordYear===modelYear;
 };
 // The same physical car can have a prior paid record at different KM,
 // but never present a different model under an accidentally duplicated plate.
 const plateRows=capturedPlate?history.filter(r=>plate(r.plate)===capturedPlate&&compatible(r)):[];
 const sameModel=history.filter(r=>{
  if(!compatible(r))return false;
  if(year(r.year)!==modelYear)return false;
  const distance=km(r.km);
  return captured.km!==null&&distance!==null&&Math.abs(distance-captured.km)<=30000;
 });
 const matchBy=plateRows.length?'plate':sameModel.length?'model':'none';
 if(matchBy==='none')return empty(incomplete);
 const data=(matchBy==='plate'?plateRows:sameModel)
  .filter(r=>!!r&&typeof r==='object')
  .filter((r,i,all)=>all.findIndex(q=>q.id&&r.id?q.id===r.id:q===r)===i);
 const paidRecords=data.filter(r=>paid(r)>0).sort((a,b)=>date(b).localeCompare(date(a)));
 const amounts=paidRecords.map(r=>Math.round(paid(r)));
 const counts=new Map<number,number>();
 for(const amount of amounts)counts.set(amount,(counts.get(amount)||0)+1);
 const repeated=[...counts.entries()].filter(([_,count])=>count>=2)
  .sort((a,b)=>b[1]-a[1]||b[0]-a[0])[0];
 return {
  matchBy,evaluations:data.length,paidCount:amounts.length,
  minPaid:amounts.length?Math.min(...amounts):null,
  maxPaid:amounts.length?Math.max(...amounts):null,
  lastPaid:amounts.length?amounts[0]:null,
  repeatedPaid:matchBy==='model'&&repeated?repeated[0]:null,
  repeatCount:matchBy==='model'&&repeated?repeated[1]:0,
  lastDate:paidRecords.length?date(paidRecords[0]):'',
  matchedModels:[...new Set(data.map(r=>String(r.model||'').trim()).filter(Boolean))].slice(0,3),
  incomplete
 };
}
