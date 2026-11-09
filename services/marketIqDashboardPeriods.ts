/**
 * Motyq IQ · histórico gerencial local, separado do Arquivo Mensal na nuvem.
 *
 * Guarda somente os campos financeiros/veiculares já autorizados pelo painel.
 * IDs do AutoAvaliar são usados apenas em memória e convertidos em digest SHA-256
 * vinculado ao usuário. Não guardar placa, clientes, pessoas ou XLSX original.
 */
import type {DashboardRow} from './marketIqManagementData';

export type DashboardMonthSource={fileName:string;importedAt:string;count:number};
export type DashboardPeriodArchive={
 version:3;records:DashboardRow[];months:Record<string,DashboardMonthSource>;
};
export type DashboardMergePlan={
 next:DashboardPeriodArchive;months:string[];added:number;updated:number;
 replacedMonths:string[];removedByReplacement:number;missingIds:number;
};
const validMonth=(s:string)=>/^\d{4}-(?:0[1-9]|1[0-2])$/.test(s)||s==='SEM DATA';
const allowedStatus=new Set(['COMPRA','COTACAO','REPASSE PENDENTE','REVISAR','OUTROS']);
export const MAX_DASHBOARD_RECORDS=15000;
export const MAX_DASHBOARD_JSON_CHARS=4000000;
export const emptyDashboardArchive=():DashboardPeriodArchive=>({version:3,records:[],months:{}});

// Remove unknown/identifying properties on migration or on reading local data.
export function cleanDashboardRow(value:unknown):DashboardRow|null{
 if(!value||typeof value!=='object')return null;
 const r=value as Record<string,unknown>;
 if((r.vehicleType!=='car'&&r.vehicleType!=='motorcycle')||
    typeof r.store!=='string'||typeof r.status!=='string'||
    !allowedStatus.has(r.status))return null;
 const str=(field:string,max=120)=>String(r[field]??'').slice(0,max);
 const num=(field:string)=>typeof r[field]==='number'&&Number.isFinite(r[field])?
   Math.max(0,Math.min(2000000,r[field] as number)):0;
 const month=str('month',12);
 if(!validMonth(month))return null;
 const idKey=typeof r.recordKey==='string'&&/^id:[a-f0-9]{64}$/.test(r.recordKey)?
  r.recordKey:undefined;
 return {
  vehicleType:r.vehicleType,date:str('date',16),month,
  store:str('store'),brand:str('brand'),model:str('model'),className:str('className',35),
  destination:str('destination',35),status:r.status as DashboardRow['status'],
  value:num('value'),preparation:num('preparation'),fipe:num('fipe'),
  webReference:num('webReference'),km:num('km'),year:num('year'),
  ...(idKey?{recordKey:idKey}:{})
 };
}
function validRecords(input:unknown):DashboardRow[]{
 if(!Array.isArray(input))return [];
 return input.slice(0,MAX_DASHBOARD_RECORDS).map(cleanDashboardRow).filter((r):r is DashboardRow=>Boolean(r));
}
const buildMetadata=(rows:DashboardRow[],label:string):Record<string,DashboardMonthSource>=>{
 const months:Record<string,DashboardMonthSource>={};
 for(const r of rows){
  if(!months[r.month])months[r.month]={fileName:label,importedAt:'',count:0};
  months[r.month].count++;
 }
 return months;
};
export function readDashboardArchive(
 storage:Pick<Storage,'getItem'>,periodKey:string,legacyKey:string
):DashboardPeriodArchive{
 const raw=storage.getItem(periodKey);
 if(raw){
  try{
   const v=JSON.parse(raw);
   if(v?.version===3&&Array.isArray(v.records)&&v.records.length<=MAX_DASHBOARD_RECORDS){
    const records=validRecords(v.records);
    const months=buildMetadata(records,'Importação local');
    for(const month of Object.keys(months)){
     const m=v.months?.[month];
     if(m&&typeof m==='object'){
      months[month]={
       fileName:String(m.fileName||'Importação local').slice(0,160),
       importedAt:String(m.importedAt||'').slice(0,40),
       count:months[month].count
      };
     }
    }
    return {version:3,records,months};
   }
  }catch{ /* Legacy fallback if the new archive cannot be decoded. */ }
 }
 try{
  const old=storage.getItem(legacyKey);
  const records=validRecords(old?JSON.parse(old):[]);
  const label=String(storage.getItem(legacyKey+'-name')||'Base anterior recuperada');
  return {version:3,records,months:buildMetadata(records,label)};
 }catch{return emptyDashboardArchive();}
}
/** Privacy: the source evaluation identifier never gets written to storage. */
export async function attachDashboardKeys(
 rows:DashboardRow[],ids:string[],accountScope:string
):Promise<DashboardRow[]>{
 if(!globalThis.crypto?.subtle)throw Error('Navegador sem criptografia segura para identificar avaliações. Use HTTPS.');
 const encoder=new TextEncoder();
 return Promise.all(rows.map(async (row,i)=>{
  const id=String(ids[i]||'').trim().replace(/\.0$/,'');
  if(!id)return {...row};
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(accountScope+'\u0000'+id));
  const key='id:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  return {...row,recordKey:key};
 }));
}
export function planDashboardMerge(
 previous:DashboardPeriodArchive,incoming:DashboardRow[],sourceName:string,at:string
):DashboardMergePlan{
 if(!incoming.length)throw Error('Esta planilha não contém avaliações válidas.');
 const months=[...new Set(incoming.map(r=>r.month))].sort();
 const oldMonths=new Set(previous.records.map(r=>r.month));
 const replacedMonths=months.filter(month=>oldMonths.has(month)&&(
  previous.records.some(r=>r.month===month&&!r.recordKey)||
  incoming.some(r=>r.month===month&&!r.recordKey)
 ));
 const replace=new Set(replacedMonths);
 const removedByReplacement=previous.records.filter(r=>replace.has(r.month)).length;
 const nextRecords=previous.records.filter(r=>!replace.has(r.month)).map(r=>({...r}));
 const byId=new Map(nextRecords.flatMap((r,i)=>r.recordKey?[[r.recordKey,i] as const]:[]));
 let added=0,updated=0;
 for(const item of incoming){
  const row=cleanDashboardRow(item);
  if(!row)continue;
  const existing=row.recordKey?byId.get(row.recordKey):undefined;
  if(existing!==undefined){
   nextRecords[existing]=row;updated++;
  }else{
   if(row.recordKey)byId.set(row.recordKey,nextRecords.length);
   nextRecords.push(row);added++;
  }
 }
 if(nextRecords.length>MAX_DASHBOARD_RECORDS)
  throw Error('O histórico ultrapassou 15 mil avaliações locais. Exporte os dados e divida a análise por períodos.');
 const nextMonths=buildMetadata(nextRecords,'Importação local');
 for(const month of Object.keys(nextMonths)){
  if(!months.includes(month)&&previous.months[month])nextMonths[month]={
   ...previous.months[month],count:nextMonths[month].count
  };
  else nextMonths[month]={fileName:sourceName.slice(0,160),importedAt:at,count:nextMonths[month].count};
 }
 const next={version:3 as const,records:nextRecords,months:nextMonths};
 if(JSON.stringify(next).length>MAX_DASHBOARD_JSON_CHARS)
  throw Error('O histórico excede o espaço local permitido. Exporte os dados antes de importar mais meses.');
 return {next,months,added,updated,replacedMonths,removedByReplacement,
  missingIds:incoming.filter(r=>!r.recordKey).length};
}
