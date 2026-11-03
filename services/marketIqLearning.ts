/**
 * Motyq IQ Learning · continuous, conservative feedback aggregation.
 *
 * The original Excel is never uploaded to this module or source control.
 * Its local anonymized dashboard entries are evidence of the evaluation
 * funnel; status COMPRA and Valor avaliado are *not* proof of the real paid
 * amount. Approved and actually paid values only come from authenticated
 * saved history events and are not mixed with import proxies.
 */
import type {DashboardRow} from './marketIqManagementData';

export type VehicleKind='car'|'motorcycle';
export type LearningHistoryRecord={
 id?:string; vehicleType?:string; brand?:string; model?:string; plate?:string; provisional?:boolean;
 originalEstimatedValue?:number;revisionCount?:number;groupedRecords?:number;
 paidRecordedAt?:string;approvedRecordedAt?:string;
 value?:number|string; fipe?:{value?:number}|null;
 approvedValue?:number;paidValue?:number;createdAt?:string;date?:string;
};
export type LearningSource='historical_evaluations'|'historical_purchase_proxy'|'approved'|'paid';
export type RatioStats={count:number;median:number|null;p25:number|null;p75:number|null};
export type LearningKindSummary={
 kind:VehicleKind;importedEvaluations:number;importedPurchases:number;
 importedStatusQuotes:number;importedRepasse:number;importedInvalid:number;
 purchaseProxy:RatioStats;approved:RatioStats;paid:RatioStats;
 cloudEvaluations:number;cloudApprovedCount:number;cloudPaidCount:number;
 paidEstimateMae:number|null;paidEstimateBias:number|null;
 paidEstimateComparisonCount:number;paidWithoutEstimateCount:number;
 approvedEstimateMae:number|null;approvedEstimateBias:number|null;
 calibrationCandidate:{percent:number;count:number;models:number}|null;
 readiness:'insufficient'|'collecting'|'validation_ready';
};
export type LearningSummary={
 importedTotal:number;cloudTotal:number;categories:LearningKindSummary[];
 lastRecalculated:string;
};

const valid=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=1000&&v<=2000000;
const ratio=(price:unknown,fipe:unknown):number|null=>
 valid(price)&&valid(fipe)&&Number(price)/Number(fipe)>=.20&&Number(price)/Number(fipe)<=1.70?
 Number(price)/Number(fipe):null;
const quantile=(list:number[],p:number)=>{
 if(!list.length)return null;
 const sorted=[...list].sort((a,b)=>a-b),i=(sorted.length-1)*p;
 const a=Math.floor(i),b=Math.ceil(i);
 return sorted[a]+(sorted[b]-sorted[a])*(i-a);
};
const stats=(samples:Array<number|null>):RatioStats=>{
 const values=samples.filter((v):v is number=>v!==null&&Number.isFinite(v));
 return {count:values.length,median:quantile(values,.5),p25:quantile(values,.25),p75:quantile(values,.75)};
};
const precision=(v:number|null)=>v===null?null:Math.round(v*10000)/10000;
// The dealership records the effective paid price in the Mesa-approved field.
 // Read older approval-only records even when they have not been projected by
 // the server yet. A separately recorded paid amount, if present, wins.
const originalEstimate=(row:LearningHistoryRecord):number|null=>{
 const first=row.originalEstimatedValue!==undefined?row.originalEstimatedValue:
   Number(row.revisionCount||0)>0?null:row.value;
 return valid(first)?Number(first):null;
};
const actualPaidValue=(row:LearningHistoryRecord):number|null=>
 valid(row.paidValue)?Number(row.paidValue):valid(row.approvedValue)?Number(row.approvedValue):null;
const modelKey=(row:{brand?:string;model?:string})=>(

 String(row.brand||'').trim().toUpperCase()+'|'+String(row.model||'').trim().toUpperCase()
);

export function buildMarketIqLearning(rows:DashboardRow[],history:LearningHistoryRecord[],now=new Date()):LearningSummary {
 const validRows=rows.filter(row=>row&&['car','motorcycle'].includes(row.vehicleType));
 const actualHistory=history.filter(row=>row&&typeof row.id==='string'&&
  ['car','motorcycle'].includes(row.vehicleType||'car'));
 const categories:(LearningKindSummary)[]=(['car','motorcycle'] as const).map(kind=>{
   const imported=validRows.filter(r=>r.vehicleType===kind);
   const cloud=actualHistory.filter(r=>(r.vehicleType==='motorcycle'?'motorcycle':'car')===kind);
   const purchaseProxy=stats(imported.filter(r=>r.status==='COMPRA')
     .map(r=>ratio(r.value,r.fipe)));
   const approvals=cloud.filter(r=>valid(r.approvedValue));
   const actualPaid=cloud.filter(r=>actualPaidValue(r)!==null);
   const approved=stats(approvals.map(r=>ratio(r.approvedValue,r.fipe?.value)));
   const paid=stats(actualPaid.map(r=>ratio(actualPaidValue(r),r.fipe?.value)));
   const withEstimator=(items:LearningHistoryRecord[],priceKey:'paidValue'|'approvedValue')=>
     items.filter(r=>originalEstimate(r)!==null&&
       (priceKey==='paidValue'?actualPaidValue(r)!==null:valid(r.approvedValue)))
       .map(r=>(priceKey==='paidValue'?Number(actualPaidValue(r)):Number(r.approvedValue))-Number(originalEstimate(r)));
   const paidErrors=withEstimator(actualPaid,'paidValue');
   const approvalErrors=withEstimator(approvals,'approvedValue');
   const average=(list:number[])=>list.length?list.reduce((a,b)=>a+b,0)/list.length:null;
   const paidBias=average(paidErrors),approvalBias=average(approvalErrors);
   // We only propose a future calibration for review, never silently alter a
   // buying quote. Minimum 30 real paid outcomes, from 5 distinct models.
   const models=new Set(actualPaid.map(modelKey)).size;
   const comparable=actualPaid.filter(r=>originalEstimate(r)!==null&&actualPaidValue(r)!==null&&valid(r.fipe?.value));
   const deviation=comparable.map(r=>(Number(actualPaidValue(r))-Number(originalEstimate(r)))/Number(r.fipe!.value));
   const candidate=deviation.length>=30&&models>=5?quantile(deviation,.5):null;
   const calibrationCandidate=candidate===null?null:{
     percent:Math.round(Math.max(-.05,Math.min(.05,candidate))*10000)/100,
     count:deviation.length,models
   };
   return {
     kind,
     importedEvaluations:imported.length,
     importedPurchases:imported.filter(r=>r.status==='COMPRA').length,
     importedStatusQuotes:imported.filter(r=>r.status==='COTACAO').length,
     importedRepasse:imported.filter(r=>r.status==='REPASSE PENDENTE').length,
     importedInvalid:imported.filter(r=>r.status==='REVISAR').length,
     purchaseProxy,
     approved,paid,
     cloudEvaluations:cloud.length,
     cloudApprovedCount:approvals.length,
     cloudPaidCount:actualPaid.length,
     paidEstimateMae:precision(average(paidErrors.map(Math.abs))),
     paidEstimateComparisonCount:paidErrors.length,
     paidWithoutEstimateCount:actualPaid.length-paidErrors.length,
     paidEstimateBias:precision(paidBias),
     approvedEstimateMae:precision(average(approvalErrors.map(Math.abs))),
     approvedEstimateBias:precision(approvalBias),
     calibrationCandidate,
     readiness:calibrationCandidate?'validation_ready':actualPaid.length||approvals.length?'collecting':'insufficient'
   };
 });
 return {importedTotal:validRows.length,cloudTotal:actualHistory.length,categories,lastRecalculated:now.toISOString()};
}
