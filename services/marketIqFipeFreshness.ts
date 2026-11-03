/**
 * Prevent a month-old FIPE feed from being displayed as the current quote.
 * Primary: Parallelum FIPE API (already used in Motyq IQ).
 * Read-only free alternative: tabelafipe.info (attribution required).
 * Never extrapolate next month's price or convert a different model/year.
 */
export type FipeFreshness='current'|'outdated'|'unverified';
const months=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

export const referencePeriod=(reference:unknown):string=>{
 const normalized=String(reference||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const iso=normalized.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])\b/);
 if(iso)return iso[1]+'-'+iso[2].padStart(2,'0');
 const match=normalized.match(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b\s*(?:de|[-/])?\s*(20\d{2})\b/);
 if(!match)return '';
 return match[2]+'-'+String(months.indexOf(match[1])+1).padStart(2,'0');
};
export const monthInSaoPaulo=(now=new Date()):string=>{
 const parts=new Intl.DateTimeFormat('en-US',{
   timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'
 }).formatToParts(now);
 const year=parts.find(x=>x.type==='year')?.value||'';
 const month=parts.find(x=>x.type==='month')?.value||'';
 return /^\d{4}$/.test(year)&&/^\d{2}$/.test(month)?year+'-'+month:'';
};
export const monthLabel=(period:string):string=>{
 const match=String(period||'').match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
 return match?months[Number(match[2])-1]+' de '+match[1]:'';
};
const fipeCode=(code:unknown)=>String(code||'').trim().replace(/[^0-9-]/g,'');
const numericYear=(v:unknown)=>Number(v);
export type AlternativeReference={
 value:number; referenceMonth:string; fipeCode:string; year:number;source:'tabelafipe.info';
};
export const validatedAlternative=(raw:any,primary:any,now=new Date()):AlternativeReference|null=>{
 const current=monthInSaoPaulo(now);
 const actual=raw?.atual;
 if(!actual||!primary)return null;
 const expectedCode=fipeCode(primary.fipeCode);
 const returnedCode=fipeCode(actual.codigo_fipe||raw.codigo_fipe);
 const expectedYear=numericYear(primary.year),returnedYear=numericYear(actual.model_year);
 const period=referencePeriod(actual.periodo||actual.mes);
 const cents=Number(actual.value_cents);
 if(!/^\d{6}-\d$/.test(expectedCode)||returnedCode!==expectedCode||
   !Number.isInteger(expectedYear)||expectedYear<1900||
   returnedYear!==expectedYear||period!==current||
   !Number.isSafeInteger(cents)||cents<100000||cents>200000000)return null;
 const value=cents/100,previous=Number(primary.value);
 if(!Number.isFinite(previous)||previous<=0||
   value<previous*.5||value>previous*1.5)return null;
 return {value,referenceMonth:monthLabel(period),fipeCode:expectedCode,year:expectedYear,source:'tabelafipe.info'};
};
export const withFipeFreshness=(primary:any,alternative:AlternativeReference|null,now=new Date())=>{
 const expectedPeriod=monthInSaoPaulo(now);
 const primaryPeriod=referencePeriod(primary?.referenceMonth);
 if(primaryPeriod===expectedPeriod)return {
   ...primary,referenceStatus:'current' as FipeFreshness,
   referenceSource:'Parallelum',expectedReference:monthLabel(expectedPeriod)
 };
 if(alternative&&referencePeriod(alternative.referenceMonth)===expectedPeriod)return {
   ...primary,value:alternative.value,referenceMonth:alternative.referenceMonth,
   referenceStatus:'current' as FipeFreshness,
   referenceSource:'tabelafipe.info',expectedReference:monthLabel(expectedPeriod)
 };
 return {
   ...primary,referenceStatus:(primaryPeriod&&primaryPeriod<expectedPeriod?'outdated':'unverified') as FipeFreshness,
   referenceSource:'Parallelum',expectedReference:monthLabel(expectedPeriod)
 };
};
