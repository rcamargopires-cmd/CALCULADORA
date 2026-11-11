/** Session-only reconciliation of AutoAvaliar purchases. Never persist raw plates or evaluator names. */
export type UtilizedAuditRow={
 id:string;plate:string;brand:string;model:string;version:string;store:string;
 evaluator:string;assessmentDate:string;purchaseDate:string;value:number;
 status:string;excludedByManagementRule:boolean;
};
type InputLine=Record<string,unknown>;
const t=(v:unknown)=>String(v??'').trim().replace(/\s+/g,' ');
const normalize=(v:unknown)=>t(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const field=(row:InputLine,...keys:string[])=>{
 const values=new Map(Object.entries(row).map(([k,v])=>[normalize(k),v]));
 for(const key of keys)if(values.has(normalize(key)))return values.get(normalize(key));
 return null;
};
export const auditDate=(value:unknown):string=>{
 if(value instanceof Date&&!Number.isNaN(value.valueOf()))return value.toISOString().slice(0,10);
 if(typeof value==='number'&&value>35000&&value<65000)
  return new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);
 const s=t(value);const d=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
 if(d)return d[3]+'-'+d[2].padStart(2,'0')+'-'+d[1].padStart(2,'0');
 const iso=s.match(/^(\d{4}-\d{2}-\d{2})/);return iso?iso[1]:'';
};
const money=(value:unknown)=>{
 if(typeof value==='number')return Number.isFinite(value)?value:0;
 const s=t(value).replace(/R\$/gi,'').replace(/\s/g,'');
 return Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):s)||0;
};
export function extractUtilizedAuditRows(input:InputLine[],source:'original'|'filtered'):UtilizedAuditRow[]{
 const seen=new Set<string>();const rows:UtilizedAuditRow[]=[];
 for(const raw of input){
  const status=normalize(field(raw,source==='filtered'?'Situação analítica':'Status'));
  if(status!=='UTILIZADO'&&status!=='COMPRA')continue;
  const id=t(field(raw,'ID Avaliação','ID avaliação')).replace(/\.0$/,'');
  const plate=normalize(field(raw,'Placa da Avaliação','Placa')).replace(/[^A-Z0-9]/g,'').slice(0,7);
  const key=id||plate+'|'+auditDate(field(raw,'Data de Avaliação','Data avaliação'));
  if(seen.has(key))continue;
  seen.add(key);
  const evaluator=t(field(raw,'Avaliador'));
  rows.push({
   id,plate,brand:t(field(raw,'Marca')),model:t(field(raw,'Modelo')),
   version:t(field(raw,'Versão','Versao')),store:t(field(raw,'Lojas','Loja')),
   evaluator,assessmentDate:auditDate(field(raw,'Data de Avaliação','Data avaliação')),
   purchaseDate:auditDate(field(raw,'Data de compra','Data Compra')),
   status,value:money(field(raw,'Valor avaliado','Valor avaliado/pago')),
   excludedByManagementRule:normalize(evaluator)==='DANIEL BARRUCHELLI DA SILVA'
  });
 }
 return rows.sort((a,b)=>(b.purchaseDate||b.assessmentDate).localeCompare(a.purchaseDate||a.assessmentDate)
  ||a.plate.localeCompare(b.plate));
}
export function countUtilizedByDay(rows:UtilizedAuditRow[],basis:'purchase'|'assessment'='purchase'){
 const dates=new Map<string,number>();
 for(const r of rows){const date=(basis==='purchase'?r.purchaseDate:r.assessmentDate)||'SEM DATA';
  dates.set(date,(dates.get(date)||0)+1);
 }
 return [...dates].map(([date,count])=>({date,count})).sort((a,b)=>b.date.localeCompare(a.date));
}
