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

const sum=(rows:readonly DealerStockVehicle[],selector:(row:DealerStockVehicle)=>number)=>
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
