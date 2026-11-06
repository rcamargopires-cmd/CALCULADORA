import type {ComparableCurrent,ComparableEntry} from './marketIqComparableHistory';
const normComparable=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const plateComparable=(v:unknown)=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');

export type MesaPriceReference={key:string;value:number;count:number};
export const mesaReferenceKey=(current:ComparableCurrent,companyId:string)=>[
 companyId.trim(),current.vehicleType,plateComparable(current.plate),normComparable(current.brand),
 normComparable(current.model),current.modelYear,current.km
].join('|');

export type MesaPricePattern={
 assessmentEvents:number;
 uniqueVehicles:number;
 repeatedPlateEvents:number;
 quoteVehicles:number;
 paidVehicles:number;
 typicalQuote:number|null;
 typicalCount:number;
 typicalShare:number;
 quoteMedian:number|null;
 confirmedPaidMedian:number|null;
 maxPaid:number|null;
 maxPaidPlate:string|null;
 exceptions:number;
 operationalSuggestion:number|null;
 confidence:'sem_amostra'|'baixa'|'moderada'|'alta';
};
/**
 * This is an operational pattern, not a valuation of the vehicle's condition.
 * One plate can be quoted 5 times but is ONE car. Quotes must not be treated
 * as paid transactions. The observed maximum is NOT automatic buying authority.
 */
const cash=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=1500&&v<=2_000_000;
const median=(numbers:number[])=>{
 const s=[...numbers].sort((a,b)=>a-b);
 return s.length?s.length%2?s[Math.floor(s.length/2)]:
  (s[s.length/2-1]+s[s.length/2])/2:null;
};
// A matching valuation must be the same actual amount, not just a shared R$1k bucket.
const moneyBucket=(v:number)=>Math.round(v*100)/100;
const mostRecent=(a:ComparableEntry,b:ComparableEntry)=>b.date.localeCompare(a.date);
export function deriveMesaPricePattern(records:ComparableEntry[],currentKm:number):MesaPricePattern{
 const exact=records.filter(r=>r.grade==='exato'&&
  (!Number.isFinite(currentKm)||currentKm<=0||r.km===null||Math.abs(r.km-currentKm)<=20000));
 const allRecords=exact.filter(r=>cash(r.assessed)||cash(r.paid));
 const map=new Map<string,ComparableEntry[]>();
 for(const record of allRecords){
  const key=record.plate||record.id;
  map.set(key,[...(map.get(key)||[]),record]);
 }
 const observations:number[]=[];
 const purchaseRecords:ComparableEntry[]=[];
 for(const items of map.values()){
  const ordered=[...items].sort(mostRecent);
  const confirmed=ordered.find(r=>cash(r.paid));
  const priced=confirmed||ordered.find(r=>cash(r.assessed));
  if(priced){
   const v=cash(priced.paid)?priced.paid:priced.assessed;
   if(cash(v))observations.push(v);
  }
  if(confirmed)purchaseRecords.push(confirmed);
 }
 const histogram=new Map<number,number>();
 for(const price of observations){
  const bucket=moneyBucket(price);
  histogram.set(bucket,(histogram.get(bucket)||0)+1);
 }
 const quoteMedian=median(observations);
 const mostFrequent=[...histogram].sort((a,b)=>b[1]-a[1]||
  (quoteMedian===null?0:Math.abs(a[0]-quoteMedian)-Math.abs(b[0]-quoteMedian))||
  a[0]-b[0])[0];
 const typicalQuote=mostFrequent?.[0]??null;
 const typicalCount=mostFrequent?.[1]??0;
 const typicalShare=observations.length?typicalCount/observations.length:0;
 const paidAmounts=purchaseRecords.map(r=>r.paid!).filter(cash);
 const confirmedPaidMedian=median(paidAmounts);
 const highest=purchaseRecords.filter(r=>cash(r.paid)).sort((a,b)=>(b.paid||0)-(a.paid||0))[0];
 const maxPaid=highest?.paid??null;
 const supportsTypical=typicalCount>=2;
 // Two different vehicles at the identical price establish a repeated
 // INTERNAL negotiation reference, even when more diverse quotations exist.
 // If no amount repeats, keep the existing FIPE/Webmotors/statistical formula.
 const operationalSuggestion=supportsTypical?typicalQuote:null;
 const exceptions=operationalSuggestion===null?0:
  paidAmounts.filter(v=>v>operationalSuggestion*1.05).length;
 const confidence: MesaPricePattern['confidence']=observations.length<2?'sem_amostra':
  observations.length<3?'baixa':observations.length<6?'moderada':'alta';
 return {
  assessmentEvents:exact.length,uniqueVehicles:map.size,
  repeatedPlateEvents:Math.max(0,exact.length-map.size),
  quoteVehicles:observations.length,paidVehicles:purchaseRecords.length,
  typicalQuote,typicalCount,typicalShare,quoteMedian,confirmedPaidMedian,
  maxPaid,maxPaidPlate:highest?.plate||null,exceptions,
  operationalSuggestion,confidence
 };
}
