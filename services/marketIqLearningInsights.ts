/**
 * Motyq IQ 2.0 — patterns seen after the original valuation is compared
 * with an actually approved/paid amount from authenticated history.
 *
 * This is a descriptive audit, NOT a suggested recalibration and NOT a
 * guarantee that an individual vehicle can be purchased for a given price.
 * AutoAvaliar spreadsheet proposals and imported COMPRA statuses NEVER
 * enter the error sample.
 */
import type {LearningHistoryRecord,VehicleKind} from './marketIqLearning';

export type InsightKind='all'|VehicleKind;
export type InsightDimension='model'|'class'|'km';
export type InsightCase={
 id:string;kind:VehicleKind;label:string;plate:string;date:string;
 estimated:number;paid:number;absoluteError:number;
 absolutePercent:number;signedPercent:number;provisional:boolean;
 modelKey:string;recordedClass:string;kmBand:string;
};
export type InsightGroup={
 key:string;label:string;count:number;within5Percent:number;
 meanAbsolutePercent:number;medianAbsolutePercent:number;
 meanAbsoluteError:number;meanSignedPercent:number;overCount:number;
 underCount:number;nearCount:number;provisionalCount:number;
 insight:'insufficient'|'exploratory'|'descriptive';
};
export type InsightReport={
 kind:InsightKind;paidRecords:number;comparableCount:number;
 missingOriginal:number;ambiguous:number;provisionalCount:number;
 groupsByModel:InsightGroup[];groupsByClass:InsightGroup[];groupsByKm:InsightGroup[];
 cases:InsightCase[];highDivergence:InsightCase[];
};
type Extended=LearningHistoryRecord & {
 km?:string|number;historicalClass?:string;year?:string;yearCode?:string;
 directRepasseReason?:string;
};
const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=1000&&n<=2000000;
const rounded=(n:number,d=2)=>Math.round(n*10**d)/10**d;
const norm=(s:unknown)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toUpperCase().replace(/\s+/g,' ').trim();
const dateTime=(s:unknown):number|null=>{
 if(!s)return null;
 const t=new Date(String(s)).getTime();
 return Number.isFinite(t)?t:null;
};
const parseKm=(value:unknown):number|null=>{
 if(typeof value==='number')return Number.isInteger(value)&&value>=0&&value<=999999?value:null;
 if(typeof value!=='string')return null;
 const s=value.trim().replace(/\s/g,'');
 if(!/^(?:\d{1,6}|\d{1,3}(?:\.\d{3}){1,2})$/.test(s))return null;
 const num=Number(s.replace(/\./g,''));
 return Number.isInteger(num)&&num>=0&&num<=999999?num:null;
};
const kmBand=(km:number|null):string=>{
 if(km===null)return 'KM não informada';
 if(km<=20000)return 'Até 20 mil km';
 if(km<=50000)return '20.001 a 50 mil km';
 if(km<=70000)return '50.001 a 70 mil km';
 if(km<=120000)return '70.001 a 120 mil km';
 return 'Acima de 120 mil km';
};
const median=(numbers:number[]):number=>{
 const sorted=[...numbers].sort((a,b)=>a-b),index=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[index]:(sorted[index-1]+sorted[index])/2;
};
const group=(cases:InsightCase[],dimension:InsightDimension):InsightGroup[]=>{
 const bucket=new Map<string,InsightCase[]>();
 for(const item of cases){
  const key=dimension==='model'?item.modelKey:dimension==='class'?item.recordedClass:item.kmBand;
  const existing=bucket.get(key)||[];
  existing.push(item);bucket.set(key,existing);
 }
 return [...bucket].map(([key,values])=>{
  const count=values.length;
  const mean=(pick:(r:InsightCase)=>number)=>values.reduce((sum,r)=>sum+pick(r),0)/count;
  const meanAbsolutePercent=rounded(mean(x=>x.absolutePercent));
  const within5Percent=rounded(values.filter(x=>x.absolutePercent<=5+1e-9).length/count*100,1);
  return {
   key,label:key,count,within5Percent,
   meanAbsolutePercent,medianAbsolutePercent:rounded(median(values.map(x=>x.absolutePercent))),
   meanAbsoluteError:rounded(mean(x=>x.absoluteError)),
   meanSignedPercent:rounded(mean(x=>x.signedPercent)),
   overCount:values.filter(x=>x.signedPercent>1).length,
   underCount:values.filter(x=>x.signedPercent< -1).length,
   nearCount:values.filter(x=>Math.abs(x.signedPercent)<=1).length,
   provisionalCount:values.filter(x=>x.provisional).length,
   insight:count>=5?'descriptive':count>=3?'exploratory':'insufficient'
  } satisfies InsightGroup;
 }).sort((a,b)=>b.count-a.count||b.meanAbsolutePercent-a.meanAbsolutePercent||a.key.localeCompare(b.key,'pt-BR'));
};
const toCase=(r:Extended):InsightCase|null=>{
 const paid=valid(r.paidValue)?r.paidValue:valid(r.approvedValue)?r.approvedValue:null;
 if(paid===null)return null;
 const original=r.originalEstimatedValue!==undefined?r.originalEstimatedValue:
  Number(r.revisionCount||0)>0?null:r.value;
 if(!valid(original))return null;
 const created=dateTime(r.createdAt||r.date);
 const paidAt=dateTime(r.paidRecordedAt||r.approvedRecordedAt);
 if(Number(r.groupedRecords||1)>1||(created!==null&&paidAt!==null&&created>paidAt))return null;
 const kind:VehicleKind=r.vehicleType==='motorcycle'?'motorcycle':'car';
 const brand=norm(r.brand),model=norm(r.model);
 const modelKey=brand&&model?brand+' '+model:'Modelo não informado';
 const recordedClass=['A','B','C','D','E'].includes(String(r.historicalClass||'').toUpperCase())?
  'Classe '+String(r.historicalClass).toUpperCase():'Classe não informada';
 const signedPercent=(original-paid)/paid*100;
 return {
  id:String(r.id),kind,label:modelKey,
  plate:String(r.plate||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7),
  date:String(r.createdAt||r.date||'').slice(0,10),
  estimated:original,paid,absoluteError:Math.abs(original-paid),
  absolutePercent:Math.abs(signedPercent),signedPercent,
  provisional:r.provisional===true,modelKey,recordedClass,kmBand:kmBand(parseKm(r.km))
 };
};
export function buildMarketIqLearningInsights(input:LearningHistoryRecord[],kind:InsightKind='all'):InsightReport{
 // One record per stable evaluation ID. A duplicate in the client store cannot
 // be counted twice as a purchase or as a model sample.
 const unique=new Map<string,Extended>();
 for(const r of input||[]){
  if(r&&typeof r.id==='string'&&r.id.trim())unique.set(r.id,r);
 }
 const records=[...unique.values()].filter(r=>kind==='all'||
  (r.vehicleType==='motorcycle'?'motorcycle':'car')===kind);
 let paidRecords=0,missingOriginal=0,ambiguous=0;
 const cases:InsightCase[]=[];
 for(const record of records){
  if(!valid(record.paidValue)&&!valid(record.approvedValue))continue;
  paidRecords++;
  const baseline=record.originalEstimatedValue!==undefined?record.originalEstimatedValue:
   Number(record.revisionCount||0)>0?null:record.value;
  if(!valid(baseline)){missingOriginal++;continue;}
  const created=dateTime(record.createdAt||record.date);
  const paidAt=dateTime(record.paidRecordedAt||record.approvedRecordedAt);
  if(Number(record.groupedRecords||1)>1||(created!==null&&paidAt!==null&&created>paidAt)){
   ambiguous++;continue;
  }
  const one=toCase(record);
  if(one)cases.push(one);
 }
 const highDivergence=[...cases].sort((a,b)=>b.absolutePercent-a.absolutePercent||
  b.absoluteError-a.absoluteError||a.id.localeCompare(b.id)).slice(0,5);
 return {
  kind,paidRecords,comparableCount:cases.length,missingOriginal,ambiguous,
  provisionalCount:cases.filter(x=>x.provisional).length,
  groupsByModel:group(cases,'model'),groupsByClass:group(cases,'class'),
  groupsByKm:group(cases,'km'),cases,highDivergence
 };
}
