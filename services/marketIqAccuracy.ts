/**
 * Motyq IQ · performance of original estimates against real desk-approved
 * purchase prices. Does not modify the live buying algorithm.
 *
 * A "hit within 5%" means |original estimate - paid| / paid <= 0.05.
 * Historic duplicate valuations whose payment may relate to a different
 * snapshot are omitted rather than being mistaken for accurate predictions.
 */
import type {LearningHistoryRecord,VehicleKind} from './marketIqLearning';

export type AccuracyCase={
 id:string;kind:VehicleKind;plate:string;vehicle:string;estimated:number;paid:number;
 absoluteDifference:number;relativeDifference:number;provisional:boolean;
};
export type AccuracyStats={
 kind:'all'|VehicleKind;paidCount:number;comparableCount:number;
 withoutEstimateCount:number;ambiguousCount:number;preliminaryCount:number;
 within3Count:number;within5Count:number;within10Count:number;
 within3Percent:number|null;within5Percent:number|null;within10Percent:number|null;
 meanAbsoluteError:number|null;medianAbsolutePercent:number|null;
 meanAbsolutePercent:number|null;meanSignedError:number|null;
 outliers:AccuracyCase[];
};
export type AccuracyReport={
 all:AccuracyStats;cars:AccuracyStats;motorcycles:AccuracyStats;
};

const finitePrice=(v:unknown):v is number=>
 typeof v==='number'&&Number.isFinite(v)&&v>=1000&&v<=2000000;
const asPercent=(count:number,total:number)=>total?Math.round(count/total*1000)/10:null;
const roundMoney=(v:number)=>Math.round(v*100)/100;
const median=(values:number[])=>{
 if(!values.length)return null;
 const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);
 return a.length%2?a[m]:(a[m-1]+a[m])/2;
};
// An immutable field supplied by the API always wins over the editable latest
// snapshot. For earlier deployments that lack it, a revised valuation without
// an original field is NOT eligible for a precision metric.
const estimateFor=(record:LearningHistoryRecord):number|null=>{
 const original=record.originalEstimatedValue;
 const value=original!==undefined?original:Number(record.revisionCount||0)>0?null:record.value;
 return finitePrice(value)?value:null;
};
const paidFor=(record:LearningHistoryRecord):number|null=>{
 const value=finitePrice(record.paidValue)?record.paidValue:record.approvedValue;
 return finitePrice(value)?value:null;
};
const parseDate=(value?:string)=>{
 if(!value)return null;
 const time=new Date(value).getTime();
 return Number.isFinite(time)?time:null;
};
const statsFor=(history:LearningHistoryRecord[],kind:'all'|VehicleKind):AccuracyStats=>{
 let paidCount=0,withoutEstimateCount=0,ambiguousCount=0,preliminaryCount=0;
 const cases:AccuracyCase[]=[];
 for(const r of history){
   if(!r||typeof r.id!=='string')continue;
   const type=r.vehicleType==='motorcycle'?'motorcycle':'car';
   if(kind!=='all'&&type!==kind)continue;
   const paid=paidFor(r);
   if(paid===null)continue;
   paidCount++;
   const estimate=estimateFor(r);
   if(estimate===null){withoutEstimateCount++;continue;}
   const estimateDate=parseDate(r.createdAt||r.date);
   const paymentDate=parseDate(r.paidRecordedAt||r.approvedRecordedAt);
   // Consolidated legacy duplicate rows do not prove the most recent
   // estimation was the one actually used for this approval.
   if(Number(r.groupedRecords||1)>1||
      (estimateDate!==null&&paymentDate!==null&&estimateDate>paymentDate)){
     ambiguousCount++;continue;
   }
   const difference=estimate-paid,relativeDifference=Math.abs(difference)/paid;
   if(r.provisional===true)preliminaryCount++;
   cases.push({
     id:r.id,kind:type,plate:String(r.plate||'').replace(/[^A-Za-z0-9]/g,'').slice(0,7),
     vehicle:[r.brand,r.model].filter(Boolean).join(' ').slice(0,130),
     estimated:estimate,paid,
     absoluteDifference:Math.abs(difference),relativeDifference,
     provisional:r.provisional===true
   });
 }
 const n=cases.length;
 const absSum=cases.reduce((a,r)=>a+r.absoluteDifference,0);
 const signedSum=cases.reduce((a,r)=>a+r.estimated-r.paid,0);
 const percentSum=cases.reduce((a,r)=>a+r.relativeDifference,0);
 const countBelow=(threshold:number)=>cases.filter(r=>r.relativeDifference<=threshold+1e-10).length;
 const within3Count=countBelow(.03),within5Count=countBelow(.05),within10Count=countBelow(.10);
 return {
   kind,paidCount,comparableCount:n,withoutEstimateCount,ambiguousCount,preliminaryCount,
   within3Count,within5Count,within10Count,
   within3Percent:asPercent(within3Count,n),
   within5Percent:asPercent(within5Count,n),
   within10Percent:asPercent(within10Count,n),
   meanAbsoluteError:n?roundMoney(absSum/n):null,
   meanAbsolutePercent:n?Math.round(percentSum/n*10000)/100:null,
   medianAbsolutePercent:n?Math.round(median(cases.map(r=>r.relativeDifference))!*10000)/100:null,
   meanSignedError:n?roundMoney(signedSum/n):null,
   outliers:cases.sort((a,b)=>b.relativeDifference-a.relativeDifference||
     b.absoluteDifference-a.absoluteDifference).slice(0,5)
 };
};
export function buildMarketIqAccuracy(history:LearningHistoryRecord[]):AccuracyReport{
 // API already groups logical per-day evaluations. Defend against accidental
 // duplicate ids in local state without doubling paid outcomes.
 const unique=new Map<string,LearningHistoryRecord>();
 for(const record of history){
   if(record&&typeof record.id==='string')unique.set(record.id,record);
 }
 const clean=[...unique.values()];
 return {all:statsFor(clean,'all'),cars:statsFor(clean,'car'),motorcycles:statsFor(clean,'motorcycle')};
}
