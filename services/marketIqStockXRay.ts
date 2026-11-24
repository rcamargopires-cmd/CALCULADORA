/**
 * Raio-X do estoque: descriptive, explainable purchasing signals from a Dealer
 * inventory snapshot. No sales, conversion, market demand or profit claims.
 * "Saída entre fotografias" is NOT a confirmed retail sale (could be transfer,
 * reversal or inventory correction). An automated buying block is never made.
 */
import type {DealerStockSnapshot,DealerStockVehicle} from './marketIqDealerRadar';
import {dealerCanonicalBrand,dealerModelFamily} from './marketIqDealerModelIdentity';

export type StockTemperature='critical'|'watch'|'balanced'|'lower';
export type StockBuyingSignal='review_pause'|'caution'|'monitor';
export type StockRiskMetric={
 key:string;brand:string;family:string;count:number;cost:number;costShare:number;
 daysAverage:number;daysMedian:number;over60:number;over90:number;over120:number;
 over180:number;staleCost:number;missingPrice:number;underCost:number;
 operationalIssues:number;lowKmQuality:number;grossSpread:number|null;
 pricedCount:number;score:number;temperature:StockTemperature;
 signal:StockBuyingSignal;reasons:string[];entriesObserved:number;exitsObserved:number;
};
export type StockUnitMetric={
 store:string;count:number;cost:number;over90:number;staleCost:number;
 missingPrice:number;daysAverage:number;
};
export type StockAction={
 type:'renew'|'reprice'|'audit'|'buy_review';priority:number;title:string;
 description:string;count:number;amount:number;familyKey?:string;
};
export type DealerStockXRay={
 reportDate:string;previousReportDate:string|null;hasPrevious:boolean;
 count:number;totalCost:number;avgDays:number;medianDays:number;
 over90:number;over120:number;over180:number;over90Cost:number;
 unknownPrice:number;underCost:number;stores:number;families:number;
 grossSpread:number|null;pricedCount:number;
 entriesObserved:number;exitsObserved:number;
 ranking:StockRiskMetric[];units:StockUnitMetric[];actions:StockAction[];
};

const sum=<T,>(rows:readonly T[],selector:(row:T)=>number)=>
 rows.reduce((acc,v)=>acc+selector(v),0);
const average=(nums:number[])=>nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:0;
const median=(nums:number[])=>{
 if(!nums.length)return 0;
 const sorted=[...nums].sort((a,b)=>a-b),index=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[index]:(sorted[index-1]+sorted[index])/2;
};
const bounded=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const asNonnegative=(n:number)=>Number.isFinite(n)&&n>0?n:0;
const familyOf=(row:DealerStockVehicle)=>{
 const make=dealerCanonicalBrand(row.brand);
 const family=dealerModelFamily(row.brand,row.model)||'MODELO A CONFERIR';
 return {brand:make||'MARCA A CONFERIR',family,key:make+'|'+family};
};
const groupBy=<T,>(items:T[],key:(item:T)=>string):Map<string,T[]>=>{
 const out=new Map<string,T[]>();
 for(const item of items){const id=key(item);const rows=out.get(id)||[];rows.push(item);out.set(id,rows);}
 return out;
};
const collect=(rows:DealerStockVehicle[])=>{
 const days=rows.map(v=>Math.max(0,v.days));
 const priced=rows.filter(v=>v.price>0&&v.cost>0);
 return {
  count:rows.length,cost:sum(rows,v=>asNonnegative(v.cost)),
  daysAverage:average(days),daysMedian:median(days),
  over60:rows.filter(v=>v.days>60).length,over90:rows.filter(v=>v.days>90).length,
  over120:rows.filter(v=>v.days>120).length,over180:rows.filter(v=>v.days>180).length,
  staleCost:sum(rows.filter(v=>v.days>90),v=>asNonnegative(v.cost)),
  missingPrice:rows.filter(v=>v.price<=0).length,
  underCost:rows.filter(v=>v.price>0&&v.cost>0&&v.price<v.cost).length,
  operationalIssues:rows.filter(v=>v.serviceOrders>0).length,
  lowKmQuality:rows.filter(v=>!v.kmValid).length,
  grossSpread:priced.length?sum(priced,v=>v.price-v.cost):null,
  pricedCount:priced.length
 };
};

/** Higher temperature means more exposure to immobilized capital, not popularity. */
export function scoreStockFamily(input:{
 count:number;daysAverage:number;over90:number;costShare:number;
 missingPrice:number;underCost:number
}):{score:number;temperature:StockTemperature;signal:StockBuyingSignal;reasons:string[]}{
 const agePts=bounded(input.daysAverage/120,0,1)*35;
 const oldRatio=input.count?input.over90/input.count:0;
 const age90Pts=oldRatio*30;
 const qtyPts=bounded((input.count-1)/7,0,1)*15;
 const capitalPts=bounded(input.costShare/.20,0,1)*10;
 const pricePts=input.count?bounded((input.missingPrice+input.underCost)/input.count,0,1)*10:0;
 const score=Math.round(agePts+age90Pts+qtyPts+capitalPts+pricePts);
 const temperature:StockTemperature=score>=75?'critical':score>=50?'watch':
  score>=25?'balanced':'lower';
 const reasons:string[]=[];
 if(input.daysAverage>90)reasons.push('Idade média acima de 90 dias');
 if(input.over90>0)reasons.push(input.over90+' unidade(s) há mais de 90 dias');
 if(input.count>=4)reasons.push(input.count+' veículos da mesma família');
 if(input.costShare>=.1)reasons.push('Alta concentração de capital nesta família');
 if(input.underCost>0)reasons.push(input.underCost+' preço(s) abaixo do custo');
 if(input.missingPrice>0)reasons.push(input.missingPrice+' unidade(s) sem preço');
 const signal:StockBuyingSignal=input.count>=3&&input.daysAverage>=75&&
  oldRatio>=.35?'review_pause':score>=50?'caution':'monitor';
 return {score,temperature,signal,reasons};
}

export function analyzeDealerStock(
 current:DealerStockSnapshot,
 previous:DealerStockSnapshot|null=null
):DealerStockXRay{
 const rows=current.vehicles||[];
 const total=collect(rows);
 const hasPrevious=Boolean(previous&&previous.reportDate<current.reportDate);
 // A missing plate from a later report is merely an observed exit, not proof
 // of a retail sale. A same-day reimport does not count as a period.
 const previousKeys=new Set(hasPrevious?previous!.vehicles.map(v=>v.key):[]);
 const currentKeys=new Set(rows.map(v=>v.key));
 const incoming=hasPrevious?rows.filter(v=>!previousKeys.has(v.key)):[];
 const outgoing=hasPrevious?previous!.vehicles.filter(v=>!currentKeys.has(v.key)):[];
 const entering=groupBy(incoming,v=>familyOf(v).key);
 const exiting=groupBy(outgoing,v=>familyOf(v).key);
 const ranking=[...groupBy(rows,v=>familyOf(v).key)].map(([key,group])=>{
  const grouped=collect(group);
  const {brand,family}=familyOf(group[0]);
  const costShare=total.cost?grouped.cost/total.cost:0;
  const {score,temperature,signal,reasons}=scoreStockFamily({
   count:grouped.count,daysAverage:grouped.daysAverage,over90:grouped.over90,
   costShare,missingPrice:grouped.missingPrice,underCost:grouped.underCost
  });
  return {...grouped,key,brand,family,costShare,score,temperature,signal,reasons,
   entriesObserved:entering.get(key)?.length||0,exitsObserved:exiting.get(key)?.length||0};
 }).sort((a,b)=>b.score-a.score||b.staleCost-a.staleCost||b.count-a.count||
  a.key.localeCompare(b.key));
 const units=[...groupBy(rows,v=>v.store||'UNIDADE NÃO INFORMADA')].map(([store,group])=>{
  const data=collect(group);
  return {store,count:data.count,cost:data.cost,over90:data.over90,
   staleCost:data.staleCost,missingPrice:data.missingPrice,daysAverage:data.daysAverage};
 }).sort((a,b)=>b.staleCost-a.staleCost||b.cost-a.cost||a.store.localeCompare(b.store));
 const actions:StockAction[]=[];
 if(total.over90)actions.push({type:'renew',priority:1,title:'Renovar estoque envelhecido',
  description:'Revisar preço, exposição e alternativas comerciais das unidades acima de 90 dias.',
  count:total.over90,amount:total.staleCost});
 if(total.underCost)actions.push({type:'reprice',priority:1,title:'Conferir anúncios abaixo do custo',
  description:'Preço sugerido na planilha abaixo do custo atual: validar dados e estratégia antes de alterar.',
  count:total.underCost,amount:0});
 if(total.missingPrice)actions.push({type:'audit',priority:2,title:'Completar precificação pendente',
  description:'Veículos sem preço sugerido no relatório Dealer.',
  count:total.missingPrice,amount:0});
 for(const fam of ranking.filter(f=>f.signal==='review_pause').slice(0,8)){
  actions.push({type:'buy_review',priority:2,
   title:'Reavaliar novas compras: '+fam.brand+' '+fam.family,
   description:'Família com volume e envelhecimento elevados. Conferir versão, ano e vendas reais antes de aprovar outra entrada.',
   count:fam.count,amount:fam.cost,familyKey:fam.key});
 }
 return {
  reportDate:current.reportDate,previousReportDate:hasPrevious?previous!.reportDate:null,
  hasPrevious,count:total.count,totalCost:total.cost,avgDays:total.daysAverage,
  medianDays:total.daysMedian,over90:total.over90,over120:total.over120,
  over180:total.over180,over90Cost:total.staleCost,unknownPrice:total.missingPrice,
  underCost:total.underCost,stores:units.length,families:ranking.length,
  grossSpread:total.grossSpread,pricedCount:total.pricedCount,
  entriesObserved:incoming.length,exitsObserved:outgoing.length,
  ranking,units,actions:actions.sort((a,b)=>a.priority-b.priority||b.amount-a.amount)
 };
}


/**
 * Analytical second layer. All scenarios are deterministic sensitivities and
 * NOT forecasts of sales, price realization, profitability or market demand.
 */
export type XRayAgingCohort={
 label:string;min:number;max:number;count:number;cost:number;share:number;
};
export type XRayFamilyDeep={
 key:string;brand:string;family:string;count:number;cost:number;oldCost:number;
 oldCount:number;oldShare:number;costShare:number;daysAverage:number;
 daysWeighted:number;daysMedian:number;daysMax:number;
 missingPrice:number;underCost:number;kmUnverified:number;serviceOrderCount:number;
 grossPriceDelta:number|null;pricedCount:number;
 byUnit:{store:string;count:number;cost:number;oldCount:number}[];
 action:'review_buy'|'inspect_price'|'accelerate'|'monitor';
 evidence:string[];score:number;
};
export type XRayDeepAnalytics={
 cohorts:XRayAgingCohort[];
 averageCapitalDays:number;
 oldCostShare:number;over120Cost:number;over180Cost:number;
 top3Cost:number;top5Cost:number;top5Share:number;
 top5OldCost:number;top5OldShare:number;
 noCostCount:number;kmUnverified:number;serviceOrderCount:number;
 grossPriceDelta:number|null;pricedCount:number;
 benchmarkDayMedian:number;
 families:XRayFamilyDeep[];
 capitalByUnit:{store:string;count:number;cost:number;oldCost:number;oldShare:number;daysWeighted:number}[];
 period:null|{
  from:string;to:string;days:number;currentCost:number;previousCost:number;
  netCostChange:number;netVehicleChange:number;
  entriesObserved:number;exitsObserved:number;
  entriesCost:number;exitsCost:number;
  retainedCount:number;retainedCostChange:number;
  transfersObserved:number;
 };
};
const deepCohortDefinitions=[
 ['0–30',0,30],['31–60',31,60],['61–90',61,90],
 ['91–120',91,120],['121–180',121,180],['181+',181,Number.MAX_SAFE_INTEGER]
] as const;
const weightedDays=(rows:readonly DealerStockVehicle[])=>{
 const total=sum(rows,v=>asNonnegative(v.cost));
 return total?sum(rows,v=>asNonnegative(v.cost)*Math.max(0,v.days))/total:0;
};
const identifiedKey=(row:DealerStockVehicle):string=>row.key;
export function analyzeDealerStockDeep(
 current:DealerStockSnapshot,
 previous:DealerStockSnapshot|null=null
):XRayDeepAnalytics{
 const rows=current.vehicles||[];
 const totalCost=sum(rows,v=>asNonnegative(v.cost));
 const oldRows=rows.filter(v=>v.days>90);
 const oldCost=sum(oldRows,v=>asNonnegative(v.cost));
 const prior90=rows.filter(v=>v.days>120);
 const prior180=rows.filter(v=>v.days>180);
 const grand=analyzeDealerStock(current,previous);
 const cohorts=deepCohortDefinitions.map(([label,min,max])=>{
  const subset=rows.filter(v=>v.days>=min&&v.days<=max);
  const cost=sum(subset,v=>asNonnegative(v.cost));
  return {label,min,max,count:subset.length,cost,share:totalCost?cost/totalCost:0};
 });
 const families=grand.ranking.map(f=>{
  const group=rows.filter(v=>familyOf(v).key===f.key);
  const old=group.filter(v=>v.days>90);
  const priced=group.filter(v=>v.price>0&&v.cost>0);
  const data=collect(group);
  const oldCost=sum(old,v=>asNonnegative(v.cost));
  const detailUnits=[...groupBy(group,v=>v.store||'UNIDADE NÃO INFORMADA')].map(([store,unitRows])=>({
   store,count:unitRows.length,cost:sum(unitRows,v=>asNonnegative(v.cost)),
   oldCount:unitRows.filter(v=>v.days>90).length
  })).sort((a,b)=>b.oldCount-a.oldCount||b.cost-a.cost);
  const evidence:string[]=[];
  if(f.count>=4)evidence.push('Concentração: '+f.count+' unidades');
  if(f.over90>0)evidence.push('Envelhecidos: '+f.over90+' veículo(s), '+Math.round(f.over90/f.count*100)+'% da família');
  if(f.staleCost>0)evidence.push('Capital >90 dias: '+Math.round(f.staleCost).toLocaleString('pt-BR')+' reais');
  if(f.missingPrice>0)evidence.push('Sem preço: '+f.missingPrice);
  if(f.underCost>0)evidence.push('Preço abaixo do custo: '+f.underCost);
  if(f.operationalIssues>0)evidence.push('Com OS: '+f.operationalIssues);
  const action:XRayFamilyDeep['action']=f.signal==='review_pause'?'review_buy':
   f.underCost>0||f.missingPrice>0?'inspect_price':
   f.over90>0&&f.daysAverage>=75?'accelerate':'monitor';
  return {
   key:f.key,brand:f.brand,family:f.family,count:f.count,
   cost:data.cost,oldCost,oldCount:old.length,oldShare:data.cost?oldCost/data.cost:0,
   costShare:totalCost?data.cost/totalCost:0,
   daysAverage:data.daysAverage,daysMedian:data.daysMedian,daysWeighted:weightedDays(group),
   daysMax:Math.max(0,...group.map(v=>v.days)),
   missingPrice:data.missingPrice,underCost:data.underCost,
   kmUnverified:data.lowKmQuality,serviceOrderCount:data.operationalIssues,
   grossPriceDelta:priced.length?sum(priced,v=>v.price-v.cost):null,
   pricedCount:priced.length,byUnit:detailUnits,action,evidence,score:f.score
  };
 }).sort((a,b)=>b.oldCost-a.oldCost||b.score-a.score||b.cost-a.cost);
 const biggest=[...families].sort((a,b)=>b.cost-a.cost);
 const oldBiggest=[...families].sort((a,b)=>b.oldCost-a.oldCost);
 const unitRows=[...groupBy(rows,v=>v.store||'UNIDADE NÃO INFORMADA')].map(([store,items])=>{
  const cost=sum(items,v=>asNonnegative(v.cost));
  const oldCost=sum(items.filter(v=>v.days>90),v=>asNonnegative(v.cost));
  return {store,count:items.length,cost,oldCost,oldShare:cost?oldCost/cost:0,
   daysWeighted:weightedDays(items)};
 }).sort((a,b)=>b.oldCost-a.oldCost);
 let period:XRayDeepAnalytics['period']=null;
 const priorDate=previous?.reportDate||'';
 const datesAreValid=/^\d{4}-\d{2}-\d{2}$/.test(priorDate)&&
  /^\d{4}-\d{2}-\d{2}$/.test(current.reportDate);
 const days=datesAreValid?Math.round((Date.parse(current.reportDate+'T00:00:00Z')-
  Date.parse(priorDate+'T00:00:00Z'))/86400000):0;
 if(previous&&days>0&&Number.isFinite(days)){
  const oldMap=new Map(previous.vehicles.map(v=>[identifiedKey(v),v]));
  const newMap=new Map(rows.map(v=>[identifiedKey(v),v]));
  const entrants=rows.filter(v=>!oldMap.has(identifiedKey(v)));
  const leavers=previous.vehicles.filter(v=>!newMap.has(identifiedKey(v)));
  const retained=rows.filter(v=>oldMap.has(identifiedKey(v)));
  const oldTotal=sum(previous.vehicles,v=>asNonnegative(v.cost));
  const retainedCostChange=sum(retained,v=>asNonnegative(v.cost)-
   asNonnegative(oldMap.get(identifiedKey(v))!.cost));
  const transfersObserved=retained.filter(v=>
   oldMap.get(identifiedKey(v))?.store!==v.store).length;
  const entriesCost=sum(entrants,v=>asNonnegative(v.cost));
  const exitsCost=sum(leavers,v=>asNonnegative(v.cost));
  period={
   from:priorDate,to:current.reportDate,days,currentCost:totalCost,
   previousCost:oldTotal,netCostChange:totalCost-oldTotal,
   netVehicleChange:rows.length-previous.vehicles.length,
   entriesObserved:entrants.length,exitsObserved:leavers.length,
   entriesCost,exitsCost,retainedCount:retained.length,retainedCostChange,
   transfersObserved
  };
 }
 const priced=rows.filter(v=>v.price>0&&v.cost>0);
 return {
  cohorts,averageCapitalDays:weightedDays(rows),
  oldCostShare:totalCost?oldCost/totalCost:0,
  over120Cost:sum(prior90,v=>asNonnegative(v.cost)),
  over180Cost:sum(prior180,v=>asNonnegative(v.cost)),
  top3Cost:sum(biggest.slice(0,3),v=>v.cost),
  top5Cost:sum(biggest.slice(0,5),v=>v.cost),
  top5Share:totalCost?sum(biggest.slice(0,5),v=>v.cost)/totalCost:0,
  top5OldCost:sum(oldBiggest.slice(0,5),v=>v.oldCost),
  top5OldShare:oldCost?sum(oldBiggest.slice(0,5),v=>v.oldCost)/oldCost:0,
  noCostCount:rows.filter(v=>v.cost<=0).length,
  kmUnverified:rows.filter(v=>!v.kmValid).length,
  serviceOrderCount:rows.filter(v=>v.serviceOrders>0).length,
  grossPriceDelta:priced.length?sum(priced,v=>v.price-v.cost):null,
  pricedCount:priced.length,benchmarkDayMedian:grand.medianDays,
  families,capitalByUnit:unitRows,period
 };
}
/** Conditional cost-of-capital exposure: 30-day simple-rate sensitivity, not a P&L. */
export function xrayCapitalSensitivity(
 capital:number,monthlyRatePercent:number,months:number
):number{
 if(!Number.isFinite(capital)||!Number.isFinite(monthlyRatePercent)||
  !Number.isFinite(months)||months<0)return 0;
 return Math.max(0,capital)*bounded(monthlyRatePercent,0,6)/100*months;
}
/** Seller price-markdown scenario only for already-priced vehicles, not a forecast. */
export function xrayMarkdownSensitivity(
 rows:DealerStockVehicle[],markdownPercent:number
):{count:number;currentAsk:number;scenarioAsk:number;cost:number;spread:number}{
 const eligible=rows.filter(v=>v.price>0&&v.cost>0);
 const discount=bounded(Number.isFinite(markdownPercent)?markdownPercent:0,0,30)/100;
 const currentAsk=sum(eligible,v=>v.price);
 const cost=sum(eligible,v=>v.cost);
 const scenarioAsk=currentAsk*(1-discount);
 return {count:eligible.length,currentAsk,scenarioAsk,cost,spread:scenarioAsk-cost};
}
