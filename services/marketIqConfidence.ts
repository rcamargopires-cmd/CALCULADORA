/**
 * Motyq IQ: a conservative, explainable audit of evidence available to the desk.
 * This is NOT a probability of purchase-price accuracy or an underwriting rule.
 * Indexed/crawled listings and unconfirmed Excel purchases never earn points.
 * No estimation, margin, FIPE value or approved price is changed here.
 */
export type EvidenceLevel='pending'|'low'|'medium'|'high';
export type EvidenceState='good'|'limited'|'missing';
export type EvidenceCheck={key:'fipe'|'webmotors'|'km'|'purchases';label:string;state:EvidenceState;detail:string;points:number;maxPoints:number};
export type EvidenceAd={
 source?:string;url?:string;price?:string|number;km?:string|number;
 status?:string;auto?:boolean;catalog?:boolean;note?:string;
};
export type PaidHistory={
 id?:string;vehicleType?:string;plate?:string;brand?:string;model?:string;
 brandCode?:string;modelCode?:string;year?:string;yearCode?:string;
 km?:string|number;approvedValue?:number;paidValue?:number;
 groupedRecords?:number;date?:string;paidRecordedAt?:string;approvedRecordedAt?:string;
};
export type EvidenceInput={
 vehicleType:'car'|'motorcycle';plate?:string;brand?:string;model?:string;
 brandCode?:string;modelCode?:string;modelYear:number;km:number;
 fipe?:{value?:number;referenceStatus?:string}|null;
 ads:EvidenceAd[];history:PaidHistory[];
};
export type EvidenceResult={
 level:EvidenceLevel;score:number;checks:EvidenceCheck[];
 verifiedCount:number;nearKmCount:number;paidSampleCount:number;
 ignoredIndexedCount:number;flaggedCount:number;nextAction:string;
};
const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)?n:0;
const amount=(v:unknown)=>{
 if(typeof v==='number')return finite(v);
 if(typeof v!=='string')return 0;
 const raw=v.trim().replace(/\s/g,'');
 if(!/^[\d.,]+$/.test(raw))return 0;
 const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):/^\d{1,3}(?:\.\d{3})+$/.test(raw)?raw.replace(/\./g,''):raw;
 const n=Number(normalized);
 return Number.isFinite(n)?n:0;
};
const norm=(s:unknown)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toUpperCase().replace(/[^A-Z0-9]/g,'');
const yearFrom=(value:unknown)=>{
 const match=String(value||'').match(/(?:19|20)\d{2}/);
 return match?Number(match[0]):0;
};
const median=(items:number[])=>{
 if(!items.length)return null;
 const sorted=[...items].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
};
const cleanWebmotorsUrl=(value:unknown)=>{
 try{
  const parsed=new URL(String(value||''));
  if(parsed.protocol!=='https:'||
   !['webmotors.com.br','www.webmotors.com.br'].includes(parsed.hostname.toLowerCase())||
   !/^\/comprar\/[^/]+\/[^/]+\/.+\/\d{7,}\/?$/i.test(parsed.pathname))return '';
  return (parsed.origin+parsed.pathname).replace(/\/$/,'').toLowerCase();
 }catch{return '';}
};
const hasRisk=(note:unknown)=>/leil[aã]o|sinistr|recuperad|batid|restri[cç][aã]o/i.test(String(note||''));

export function assessMarketIqEvidence(input:EvidenceInput):EvidenceResult{
 const vehicleReady=Boolean(norm(input.brand)&&norm(input.model)&&
  Number.isInteger(input.modelYear)&&input.modelYear>=1990&&input.modelYear<=2100&&
  Number.isFinite(input.km)&&input.km>0);
 const limit=input.vehicleType==='motorcycle'?10000:30000;
 const midLimit=input.vehicleType==='motorcycle'?5000:15000;
 const tightLimit=input.vehicleType==='motorcycle'?2000:5000;
 const inspected=new Map<string,{km:number;note:string}>();
 let ignoredIndexedCount=0,flaggedCount=0;
 for(const ad of input.ads||[]){
  if(ad.auto||ad.catalog){ignoredIndexedCount++;continue;}
  if(ad.status!=='valid'||ad.source!=='webmotors')continue;
  const link=cleanWebmotorsUrl(ad.url),price=amount(ad.price),adKm=amount(ad.km);
  if(!link||price<1000||price>2000000||adKm<=0||adKm>999999)continue;
  if(hasRisk(ad.note)){flaggedCount++;continue;}
  if(Math.abs(adKm-input.km)>limit){flaggedCount++;continue;}
  if(!inspected.has(link))inspected.set(link,{km:adKm,note:String(ad.note||'')});
 }
 const verified=[...inspected.values()];
 const deviations=verified.map(item=>Math.abs(item.km-input.km));
 const medianKmGap=median(deviations);
 const verifiedCount=verified.length;
 const fipeCurrent=Boolean(finite(input.fipe?.value)>=1000&&input.fipe?.referenceStatus==='current');
 const fipePoints=fipeCurrent?25:0;
 const webPoints=verifiedCount>=3?35:verifiedCount===2?25:verifiedCount===1?12:0;
 const kmPoints=medianKmGap===null?0:medianKmGap<=tightLimit?15:medianKmGap<=midLimit?10:5;
 const currentPlate=norm(input.plate);
 const uniquePaid=new Map<string,PaidHistory>();
 for(const row of input.history||[]){
  if(!row||(row.vehicleType==='motorcycle'?'motorcycle':'car')!==input.vehicleType)continue;
  const plate=norm(row.plate);
  if(plate.length!==7||plate===currentPlate||Number(row.groupedRecords||1)>1)continue;
  const paid=finite(row.paidValue)>=1000?finite(row.paidValue):finite(row.approvedValue);
  if(paid<1000||paid>2000000)continue;
  const sameCodes=Boolean(input.brandCode&&input.modelCode&&row.brandCode&&row.modelCode&&
   input.brandCode===row.brandCode&&input.modelCode===row.modelCode);
  const sameNames=Boolean(norm(input.brand)&&norm(input.model)&&norm(input.brand)===norm(row.brand)&&
   norm(input.model)===norm(row.model));
  if(!sameCodes&&!sameNames)continue;
  const year=yearFrom(row.yearCode)||yearFrom(row.year);
  if(!year||Math.abs(year-input.modelYear)>1)continue;
  const km=amount(row.km);
  if(km<=0||Math.abs(km-input.km)>limit)continue;
  const existing=uniquePaid.get(plate);
  const stamped=String(row.paidRecordedAt||row.approvedRecordedAt||row.date||'');
  const previous=String(existing?.paidRecordedAt||existing?.approvedRecordedAt||existing?.date||'');
  if(!existing||stamped>previous)uniquePaid.set(plate,row);
 }
 const paidSampleCount=uniquePaid.size;
 const paidPoints=paidSampleCount>=5?25:paidSampleCount>=2?17:paidSampleCount===1?10:0;
 const checks:EvidenceCheck[]=[
  {key:'fipe',label:'FIPE vigente',state:fipeCurrent?'good':'missing',points:fipePoints,maxPoints:25,
   detail:fipeCurrent?'Preço e referência do mês confirmados.':
    input.fipe?.value?'Referência atual não confirmada. Atualize a FIPE.':'Ainda sem consulta FIPE válida.'},
  {key:'webmotors',label:'Anúncios conferidos',state:verifiedCount>=3?'good':verifiedCount>=2?'limited':'missing',
   points:webPoints,maxPoints:35,
   detail:verifiedCount+' anúncio(s) individual(is) Webmotors validado(s) manualmente, com KM próximo.'},
  {key:'km',label:'KM dos comparáveis',state:medianKmGap===null?'missing':
   medianKmGap<=tightLimit?'good':'limited',
   points:kmPoints,maxPoints:15,
   detail:medianKmGap===null?'Sem anúncios Webmotors conferidos e próximos em KM.':
    'Diferença mediana de '+Math.round(medianKmGap).toLocaleString('pt-BR')+' km nos anúncios aproveitados.'},
  {key:'purchases',label:'Compras realmente pagas',state:paidSampleCount>=5?'good':
   paidSampleCount>0?'limited':'missing',points:paidPoints,maxPoints:25,
   detail:paidSampleCount+' placa(s) distintas do mesmo modelo, ano e KM próximos, com valor aprovado/pago no histórico online.'}
 ];
 const score=checks.reduce((s,item)=>s+item.points,0);
 let level:EvidenceLevel='low';
 if(!vehicleReady)level='pending';
 else if(fipeCurrent&&verifiedCount>=3&&score>=75&&flaggedCount===0)level='high';
 else if(fipeCurrent&&verifiedCount>=2&&score>=50&&flaggedCount===0)level='medium';
 let nextAction='Continuar a vistoria e conferir possíveis avarias, leilão, sinistro e custos antes de aprovar.';
 if(!vehicleReady)nextAction='Preencha marca, versão, ano/modelo e KM para avaliar a base disponível.';
 else if(!fipeCurrent)nextAction='Atualize e confirme a FIPE do mês antes da decisão.';
 else if(flaggedCount)nextAction='Revise os anúncios com KM distante ou observações de risco; não use esses registros como referência segura.';
 else if(verifiedCount<2)nextAction='Confira pelo menos dois anúncios individuais da Webmotors com KM próxima.';
 else if(verifiedCount<3)nextAction='Se possível, valide um terceiro anúncio Webmotors para fortalecer a amostra.';
 else if(medianKmGap!==null&&medianKmGap>midLimit)nextAction='Busque anúncios com quilometragem ainda mais próxima da avaliada.';
 else if(paidSampleCount<2)nextAction='Continue registrando valores aprovados e pagos para ampliar o histórico de modelos equivalentes.';
 return {
  level,score:vehicleReady?score:0,checks,verifiedCount,nearKmCount:verifiedCount,
  paidSampleCount,ignoredIndexedCount,flaggedCount,nextAction
 };
}
