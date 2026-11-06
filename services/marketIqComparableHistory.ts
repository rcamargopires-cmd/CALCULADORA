import type {MonthlyArchiveRow} from './marketIqMonthlyArchive';

export type ComparableCurrent={
 plate:string;brand:string;model:string;modelYear:number;km:number;
 fipe:number;fipeCode?:string;vehicleType:'car'|'motorcycle';
};
export type ComparableCloud={
 id:string;plate?:string;brand?:string;model:string;year:string;km:string;
 vehicleType?:'car'|'motorcycle';approvedValue?:number;paidValue?:number;
 approvedAt?:string;paidAt?:string;date?:string;fipe?:{value?:number}|null;
};
export type ComparableEntry={
 id:string;source:'AutoAvaliar'|'Motyq IQ';date:string;plate:string;brand:string;
 model:string;version:string;year:number;km:number|null;
 status:string;assessed:number|null;paid:number|null;fipe:number|null;
 grade:'exato'|'equivalente'|'relacionado'|'placa';eligible:boolean;
 paidBasis:'approved'|'october_confirmed'|'none';store?:string;
};
export type ComparableResult={
 samePlate:ComparableEntry[];comparables:ComparableEntry[];
 exactCount:number;paidCount:number;paidMedian:number|null;
 historicalAdjustedMedian:number|null;historicalLow:number|null;historicalHigh:number|null;
 confidence:'alta'|'moderada'|'baixa';limited:boolean;
};
export const normComparable=(v:unknown)=>String(v??'').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const comparableBrand=(v:unknown)=>{
 const n=normComparable(v);
 if(['VW','VW VOLKSWAGEN','VOLKSWAGEN'].includes(n))return 'VOLKSWAGEN';
 if(['GM','GM CHEVROLET','CHEVROLET','GENERAL MOTORS'].includes(n))return 'CHEVROLET';
 if(['MERCEDES','M BENZ','MERCEDES BENZ'].includes(n))return 'MERCEDES BENZ';
 return n;
};
export const plateComparable=(v:unknown)=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const readKm=(raw:unknown)=>{
 const s=String(raw??'').trim();
 if(/^\d{1,3}(?:\.\d{3})+$/.test(s))return Number(s.replace(/\./g,''));
 const clean=Number(s.replace(',','.'));
 return Number.isFinite(clean)&&clean>=0&&clean<=999999?clean:null;
};
const validMoney=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=1500&&n<=2000000;
const median=(v:number[]):number|null=>{
 const sorted=v.filter(Number.isFinite).sort((a,b)=>a-b);
 if(!sorted.length)return null;
 const middle=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
};
const sameModel=(a:string,b:string)=>{
 const left=normComparable(a),right=normComparable(b);
 if(!left||!right)return false;
 if(left===right)return true;
 const shorter=left.length<right.length?left:right,larger=left.length<right.length?right:left;
 if(!larger.startsWith(shorter+' '))return false;
 const qualifier=larger.slice(shorter.length+1).split(' ')[0];
 return !['PLUS','SEDAN','HATCH','SPORT','CROSS','SW','SW4','RAPTOR','S'].includes(qualifier);
};
const transmission=(v:string)=>{
 const s=normComparable(v);
 return /\b(MANUAL|MECANICO|MT)\b/.test(s)?'manual':
  /\b(AUTOMATICO|AUTOMATIZADO|AT6|AT8|CVT|DSG|TIPTRONIC|XTRONIC)\b/.test(s)?'auto':'';
};
const versionEquivalent=(current:ComparableCurrent,row:MonthlyArchiveRow)=>{
 if(current.fipeCode&&row.fipeCode&&current.fipeCode.replace(/\D/g,'')===row.fipeCode.replace(/\D/g,''))return true;
 const candidate=normComparable(row.version),full=normComparable(current.model);
 if(!candidate||!full)return false;
 const cTransmission=transmission(candidate),fTransmission=transmission(full);
 if(cTransmission&&fTransmission&&cTransmission!==fTransmission)return false;
 const excluded=new Set(['FLEX','TOTAL','GASOLINA','DIESEL','ETANOL','4P','2P','4X2','4X4','MOTOR','DE','DA','DO','CV']);
 const tokens=(v:string)=>new Set(v.split(' ').filter(t=>t.length>=2&&!excluded.has(t)));
 const a=tokens(candidate),b=tokens(full);
 if(!a.size||!b.size)return false;
 let hits=0;for(const x of a)if(b.has(x))hits++;
 return hits>=2&&hits/a.size>=0.70;
};
const gradeFor=(current:ComparableCurrent,row:MonthlyArchiveRow):ComparableEntry['grade']=>{
 if(plateComparable(current.plate)&&plateComparable(current.plate)===plateComparable(row.plate))return 'placa';
 if(row.vehicleType!==current.vehicleType||comparableBrand(row.brand)!==comparableBrand(current.brand)||
    !sameModel(row.model,current.model)||!row.modelYear)return 'relacionado';
 const gap=Math.abs(row.modelYear-current.modelYear);
 const trimMatch=versionEquivalent(current,row);
 return trimMatch&&gap===0?'exato':trimMatch&&gap===1?'equivalente':'relacionado';
};
const sortEntries=(a:ComparableEntry,b:ComparableEntry)=>{
 const order={placa:4,exato:3,equivalente:2,relacionado:1};
 return order[b.grade]-order[a.grade]||
  Math.abs((a.km??999999))-Math.abs((b.km??999999))||
  b.date.localeCompare(a.date);
};
export function buildComparableHistory(
 current:ComparableCurrent,plateRows:MonthlyArchiveRow[],similarRows:MonthlyArchiveRow[],
 cloudRows:ComparableCloud[],companyId:string,limited=false
):ComparableResult{
 const samePlate:ComparableEntry[]=[],comparables:ComparableEntry[]=[];
 const unique=new Set<string>();
 for(const r of [...plateRows,...similarRows]){
  const key='archive|'+r.month+'|'+r.id;if(unique.has(key))continue;unique.add(key);
  const grade=gradeFor(current,r);
  const same=grade==='placa';
  if(!same&&(r.vehicleType!==current.vehicleType||
   comparableBrand(r.brand)!==comparableBrand(current.brand)||
   !sameModel(r.model,current.model)||!r.modelYear||
   Math.abs(r.modelYear-current.modelYear)>2))continue;
  const status=normComparable(r.status);
  // October 2026 AutoAvaliar rule confirmed by this Mesa: on UTILIZADO,
  // Valor avaliado is the effective purchase value. Other months remain
  // quotation values unless an explicit Motyq approval was recorded.
  const historicalPaid=companyId==='abrao-reze'&&r.month==='2026-10'&&
    status==='UTILIZADO'&&validMoney(r.assessedValue)&&
    (r.fipe===null||r.fipe===undefined||(r.assessedValue/r.fipe>=0.3&&r.assessedValue/r.fipe<=1.15));
  const entry:ComparableEntry={
   id:key,source:'AutoAvaliar',date:r.evaluationDate,plate:plateComparable(r.plate),
   brand:r.brand,model:r.model,version:r.version,year:r.modelYear||0,km:r.km,
   status:r.status,assessed:r.assessedValue,paid:historicalPaid?r.assessedValue:null,
   fipe:r.fipe,grade,eligible:!same&&['exato','equivalente'].includes(grade),
   paidBasis:historicalPaid?'october_confirmed':'none',store:r.store
  };
  (same?samePlate:comparables).push(entry);
 }
 for(const r of cloudRows){
  if(!r||!r.id)continue;
  const id='cloud|'+r.id;if(unique.has(id))continue;unique.add(id);
  const cloudPlate=plateComparable(r.plate);
  const same=Boolean(cloudPlate&&cloudPlate===plateComparable(current.plate));
  const isKind=(r.vehicleType||'car')===current.vehicleType;
  if(!same&&(!isKind||comparableBrand(r.brand)!==comparableBrand(current.brand)||
   !sameModel(r.model,current.model)))continue;
  const year=Number(String(r.year||'').match(/(?:19|20)\d{2}/)?.[0]||0);
  if(!same&&(!year||Math.abs(year-current.modelYear)>2))continue;
  const paid=validMoney(r.paidValue)?r.paidValue:validMoney(r.approvedValue)?r.approvedValue:null;
  const yearGap=Math.abs(year-current.modelYear);
  const versionSame=normComparable(r.model)===normComparable(current.model);
  const grade:ComparableEntry['grade']=same?'placa':
   yearGap===0&&versionSame?'exato':yearGap===1&&versionSame?'equivalente':'relacionado';
  const entry:ComparableEntry={id,source:'Motyq IQ',
   date:String(r.paidAt||r.approvedAt||r.date||'').slice(0,10),plate:cloudPlate,
   brand:r.brand||'',model:r.model,version:r.model,year,km:readKm(r.km),
   status:paid!==null?'COMPRA CONFIRMADA':'AVALIADO',assessed:null,paid,
   fipe:validMoney(r.fipe?.value)?r.fipe.value:null,grade,
   eligible:!same&&['exato','equivalente'].includes(grade),
   paidBasis:paid!==null?'approved':'none'};
  (same?samePlate:comparables).push(entry);
 }
 // Never count the same purchase from the monthly archive and Motyq approval twice.
 const motyqPurchases=[...samePlate,...comparables].filter(r=>r.source==='Motyq IQ'&&r.paid!==null);
 const deduped=comparables.filter(row=>!(row.source==='AutoAvaliar'&&row.paid!==null&&
  motyqPurchases.some(p=>p.plate&&p.plate===row.plate&&p.year===row.year&&
   Math.abs(new Date(p.date).getTime()-new Date(row.date).getTime())<=90*86400000)));
 deduped.sort((a,b)=>{
  const gradeOrder={placa:4,exato:3,equivalente:2,relacionado:1};
  return gradeOrder[b.grade]-gradeOrder[a.grade]||
   Math.abs((a.km??999999)-current.km)-Math.abs((b.km??999999)-current.km)||
   b.date.localeCompare(a.date);
 });
 samePlate.sort((a,b)=>b.date.localeCompare(a.date));
 const eligiblePaid=deduped.filter(e=>e.eligible&&e.paid!==null&&
   (e.km===null||!current.km||Math.abs(e.km-current.km)<=20000));
 const paidValues=eligiblePaid.map(x=>x.paid!);
 const adjusted=eligiblePaid.flatMap(e=>{
  if(!current.fipe||!e.fipe||e.fipe<=0)return [];
  const n=e.paid!/e.fipe*current.fipe;
  if(n/current.fipe<0.3||n/current.fipe>1.15)return [];
  return [n];
 });
 const close=adjusted.sort((a,b)=>a-b);
 const count=eligiblePaid.length;
 return {
  samePlate,comparables:deduped,exactCount:deduped.filter(r=>r.grade==='exato').length,
  paidCount:count,paidMedian:median(paidValues),
  historicalAdjustedMedian:median(adjusted),historicalLow:close.length?close[Math.floor(close.length*.25)]:null,
  historicalHigh:close.length?close[Math.floor((close.length-1)*.75)]:null,
  confidence:count>=6?'alta':count>=3?'moderada':'baixa',limited
 };
}
