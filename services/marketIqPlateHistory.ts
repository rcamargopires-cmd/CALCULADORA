/**
 * Histórico Inteligente por Placa · Motyq IQ
 *
 * Derived from monthly archive snapshots, without changing their stored data.
 * An assessed value is NOT a confirmed purchase amount. Historical records
 * must never be merged by day: distinct evaluation IDs remain visible.
 */
import type {MonthlyArchiveRow} from './marketIqMonthlyArchive';

export type PlateAlert={
 kind:'km_decrease'|'large_value_change'|'vehicle_identity'|'class_change'|'destination_change';
 severity:'warning'|'info';
 message:string;
};
export type PlateHistoryEntry={
 record:MonthlyArchiveRow;
 previous:MonthlyArchiveRow|null;
 assessedDelta:number|null;
 assessedDeltaPct:number|null;
 kmDelta:number|null;
 alerts:PlateAlert[];
};
export type PlateHistoryInsight={
 plate:string;
 recordsCount:number;
 monthsCount:number;
 firstDate:string;
 latestDate:string;
 firstAssessedValue:number|null;
 latestAssessedValue:number|null;
 assessedTotalDelta:number|null;
 assessedTotalDeltaPct:number|null;
 firstKm:number|null;
 latestKm:number|null;
 kmTotalDelta:number|null;
 warningCount:number;
 entries:PlateHistoryEntry[];
};

export const normalizePlate=(value:unknown)=>String(value||'')
 .toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);

export const validPlate=(value:unknown):boolean=>
 /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizePlate(value));

const number=(v:unknown):number|null=>
 typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const positive=(v:unknown):number|null=>{
 const n=number(v);
 return n!==null&&n>0?n:null;
};
const sameIdentity=(a:MonthlyArchiveRow,b:MonthlyArchiveRow)=>{
 const normalized=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toUpperCase().replace(/\s+/g,' ').trim();
 return normalized(a.brand)===normalized(b.brand)&&normalized(a.model)===normalized(b.model)&&
  a.vehicleType===b.vehicleType;
};
export function buildPlateHistory(input:MonthlyArchiveRow[],rawPlate:string):PlateHistoryInsight{
 const plate=normalizePlate(rawPlate);
 const unique=new Map<string,MonthlyArchiveRow>();
 for(const row of input||[]){
  if(!row||normalizePlate(row.plate)!==plate||!row.id||!row.month)continue;
  const key=row.month+'|'+row.id;
  if(!unique.has(key))unique.set(key,row);
 }
 const chronology=[...unique.values()].sort((a,b)=>
  a.evaluationDate.localeCompare(b.evaluationDate)||
  a.month.localeCompare(b.month)||a.id.localeCompare(b.id));
 const entriesAscending:PlateHistoryEntry[]=chronology.map((record,i)=>{
  const previous=i?chronology[i-1]:null;
  const assessed=positive(record.assessedValue),before=positive(previous?.assessedValue);
  const assessedDelta=assessed!==null&&before!==null?assessed-before:null;
  const assessedDeltaPct=assessedDelta!==null&&before!==null?assessedDelta/before*100:null;
  const km=number(record.km),prevKm=number(previous?.km);
  const kmDelta=km!==null&&prevKm!==null?km-prevKm:null;
  const alerts:PlateAlert[]=[];
  if(previous){
   if(!sameIdentity(record,previous))alerts.push({
    kind:'vehicle_identity',severity:'warning',
    message:'Marca, modelo ou tipo de veículo diferente do registro anterior. Confira a placa e os dados cadastrados.'
   });
   if(kmDelta!==null&&kmDelta< -500)alerts.push({
    kind:'km_decrease',severity:'warning',
    message:'KM registrada menor que na avaliação anterior. Verifique os registros e o hodômetro.'
   });
   if(assessedDeltaPct!==null&&Math.abs(assessedDeltaPct)>=20)alerts.push({
    kind:'large_value_change',severity:'warning',
    message:'Variação de pelo menos 20% no valor avaliado. Confira data, condição e contexto da negociação.'
   });
   if(record.classRecorded&&previous.classRecorded&&record.classRecorded!==previous.classRecorded)alerts.push({
    kind:'class_change',severity:'info',
    message:'A classificação registrada foi alterada entre avaliações.'
   });
   if(record.destination&&previous.destination&&record.destination!==previous.destination)alerts.push({
    kind:'destination_change',severity:'info',
    message:'O destino comercial registrado mudou entre avaliações.'
   });
  }
  return {record,previous,assessedDelta,assessedDeltaPct,kmDelta,alerts};
 });
 const valued=chronology.filter(x=>positive(x.assessedValue)!==null);
 const kmKnown=chronology.filter(x=>number(x.km)!==null);
 const firstVal=valued.length?positive(valued[0].assessedValue):null;
 const lastVal=valued.length?positive(valued[valued.length-1].assessedValue):null;
 const assessedTotalDelta=valued.length>=2&&firstVal!==null&&lastVal!==null?
  lastVal-firstVal:null;
 const firstKm=kmKnown.length?number(kmKnown[0].km):null;
 const latestKm=kmKnown.length?number(kmKnown[kmKnown.length-1].km):null;
 const kmTotalDelta=kmKnown.length>=2&&firstKm!==null&&latestKm!==null?
  latestKm-firstKm:null;
 return {
  plate,recordsCount:chronology.length,monthsCount:new Set(chronology.map(r=>r.month)).size,
  firstDate:chronology[0]?.evaluationDate||'',
  latestDate:chronology[chronology.length-1]?.evaluationDate||'',
  firstAssessedValue:firstVal,latestAssessedValue:lastVal,assessedTotalDelta,
  assessedTotalDeltaPct:assessedTotalDelta!==null&&firstVal!==null&&firstVal>0?
   assessedTotalDelta/firstVal*100:null,
  firstKm,latestKm,kmTotalDelta,
  warningCount:entriesAscending.reduce((sum,e)=>sum+e.alerts.filter(a=>a.severity==='warning').length,0),
  entries:entriesAscending.reverse()
 };
}
