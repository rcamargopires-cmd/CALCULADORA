/**
 * Motyq IQ Management Dashboard
 * Browser-side only. Discards customer, telephone, email, plate, VIN,
 * document/observation and all personnel names before storing or rendering.
 */
export type DashboardStatus='COMPRA'|'COTACAO'|'REPASSE PENDENTE'|'REVISAR'|'OUTROS';
export type DashboardRow={
 vehicleType:'car'|'motorcycle';date:string;month:string;store:string;brand:string;model:string;
 className:string;destination:string;status:DashboardStatus;
 value:number;preparation:number;fipe:number;webReference:number;km:number;year:number;
};
type InputLine=Record<string,unknown>;
const text=(v:unknown)=>String(v??'').trim().replace(/\s+/g,' ');
const norm=(v:unknown)=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const amount=(v:unknown)=>{
 if(typeof v==='number')return Number.isFinite(v)?v:0;
 const s=text(v).replace(/R\$/gi,'').replace(/\s/g,'');
 if(!s)return 0;
 const cleaned=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s;
 const n=Number(cleaned);return Number.isFinite(n)?n:0;
};
const entry=(row:InputLine,key:string)=>{
 const found=Object.keys(row).find(k=>norm(k)===norm(key));
 return found?row[found]:undefined;
};
const dateString=(v:unknown)=>{
 if(typeof v==='number'&&v>35000&&v<65000){
   const d=new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000);
   return d.toISOString().slice(0,10);
 }
 if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString().slice(0,10);
 const s=text(v);
 const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
 if(iso)return iso[1]+'-'+iso[2]+'-'+iso[3];
 const br=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
 return br?br[3]+'-'+br[2].padStart(2,'0')+'-'+br[1].padStart(2,'0'):'';
};
const MOTOBRANDS=new Set(['ROYAL ENFIELD','YAMAHA','BAJAJ','TRIUMPH','DAFRA','HAOJUE','HARLEY-DAVIDSON','KAWASAKI']);
export const isMoto=(brand:string,model:string)=>{
 const b=norm(brand),m=norm(model);
 if(MOTOBRANDS.has(b))return true;
 if(b==='SUZUKI')return /^(INTRUDER|GSX|BURGMAN|V-STROM|YES|EN125|GSR)/.test(m);
 if(b==='HONDA')return /^(CG|CB |CB\d|CBR|PCX|ELITE|BIZ|POP |NXR|XRE|NX-|SHADOW|AFRICA|ADV|LEAD|X-ADV|CRF|TWISTER|SH |SH\d|CBX|NC\d|CG\d)/.test(m);
 if(b==='BMW')return /^(R \d|F \d|G \d|S \d|K \d|R\d|F\d|G\d|S\d)/.test(m);
 return false;
};
const vehicleTypeOf=(row:InputLine,brand:string,model:string):'car'|'motorcycle'=>{
 const explicit=norm(entry(row,'Tipo de Veículo')??entry(row,'Tipo Veículo')??entry(row,'Tipo')??entry(row,'Categoria'));
 if(/MOTOCIC|\bMOTO\b|\bSCOOTER\b|\bCICLOMOTOR\b/.test(explicit))return 'motorcycle';
 if(/AUTOMOV|CARRO|CAMINHONETE|UTILITARIO|PASSEIO|SUV/.test(explicit))return 'car';
 return isMoto(brand,model)?'motorcycle':'car';
};
const validValue=(v:number)=>Number.isFinite(v)&&v>=1000&&v<=2000000;
// Explicitly confirmed in the conversation as purchased, although export says AVALIADO.
const confirmedException=(b:string,m:string,year:number,value:number)=>(
 (norm(b)==='FIAT'&&norm(m)==='TORO'&&year===2025&&Math.abs(value-131440)<1)||
 (norm(b)==='JEEP'&&norm(m)==='COMMANDER'&&year===2022&&Math.abs(value-92000)<1)
);
const classification=(raw:string):DashboardStatus=>{
 const s=norm(raw);
 if(s==='COMPRA'||s==='UTILIZADO')return 'COMPRA';
 if(s==='COTACAO'||s==='AVALIADO')return 'COTACAO';
 if(s==='REPASSE'||s==='REPASSE PENDENTE')return 'REPASSE PENDENTE';
 if(s==='REVISAR')return 'REVISAR';
 return 'OUTROS';
};
export type DashboardImportResult={rows:DashboardRow[];excludedEvaluator:number;motorcyclesIncluded:number;duplicates:number;invalidPurchases:number;source:'original'|'filtered';inputCount:number};
export function parseDashboardData(input:InputLine[],source:'original'|'filtered'):DashboardImportResult{
 const output:DashboardRow[]=[];
 const seen=new Set<string>();
 // Only an ephemeral duplicate detector; plate is never persisted or sent anywhere.
 const usedPlates=new Set<string>();
 let excludedEvaluator=0,motorcyclesIncluded=0,duplicates=0,invalidPurchases=0;
 input.forEach((r,i)=>{
   const evaluator=norm(entry(r,'Avaliador'));
   if(evaluator==='DANIEL BARRUCHELLI DA SILVA'){excludedEvaluator++;return;}
   const brand=text(entry(r,'Marca')),model=text(entry(r,'Modelo'));
   const vehicleType=vehicleTypeOf(r,brand,model);
   const id=text(entry(r,'ID Avaliação')??entry(r,'ID avaliação'));
   if(id&&seen.has(id)){duplicates++;return;}
   if(id)seen.add(id);
   const year=Math.round(amount(entry(r,'Ano modelo')??entry(r,'Ano Modelo')));
   const value=amount(entry(r,source==='filtered'?'Valor avaliado/pago':'Valor avaliado'));
   const originalStatus=norm(entry(r,source==='filtered'?'Situação analítica':'Status'));
   let status=classification(originalStatus);
   if(source==='original'&&status==='COTACAO'&&confirmedException(brand,model,year,value))status='COMPRA';
   if(status==='COMPRA'&&!validValue(value)){status='REVISAR';invalidPurchases++;}
   if(source==='original'&&status==='COMPRA'){
     const plate=norm(entry(r,'Placa da Avaliação'));
     const purchaseKey=plate+'|'+Math.round(value);
     if(plate&&usedPlates.has(purchaseKey)){status='OUTROS';duplicates++;}
     else if(plate)usedPlates.add(purchaseKey);
   }
   const date=dateString(entry(r,source==='filtered'?'Data avaliação':'Data de Avaliação'));
   const destination=norm(entry(r,source==='filtered'?'Destino':'Finalidade'))||'NÃO INFORMADO';
   const className=norm(entry(r,source==='filtered'?'Classe':'Classificação'))||'NÃO INFORMADA';
   if(vehicleType==='motorcycle')motorcyclesIncluded++;
   output.push({
     vehicleType,date,month:date?date.slice(0,7):'SEM DATA',
     store:text(entry(r,source==='filtered'?'Loja':'Lojas'))||'NÃO INFORMADA',
     brand:brand.toUpperCase()||'NÃO INFORMADA',
     model:model.toUpperCase()||'NÃO INFORMADO',
     className, destination,status,
     value,preparation:amount(entry(r,source==='filtered'?'Preparo previsto':'Gasto previsto')),
     fipe:amount(entry(r,'FIPE')),
     webReference:amount(entry(r,source==='filtered'?'Ref. Web':'ref. Web')),
     km:amount(entry(r,'KM')),year,
   });
 });
 return {rows:output,excludedEvaluator,motorcyclesIncluded,duplicates,invalidPurchases,source,inputCount:input.length};
}
export type DashboardFilters={vehicleType:string;store:string;brand:string;model:string;className:string;destination:string;month:string;status:string};
export const emptyFilters:DashboardFilters={vehicleType:'',store:'',brand:'',model:'',className:'',destination:'',month:'',status:''};
export const dashboardOptions=(rows:DashboardRow[],key:keyof DashboardFilters)=>{
 const values=rows.map(x=>String(x[key as keyof DashboardRow]||'')).filter(Boolean);
 return [...new Set(values)].sort((a,b)=>a.localeCompare(b,'pt-BR'));
};
export const filterDashboardRows=(rows:DashboardRow[],f:DashboardFilters)=>rows.filter(r=>
 (!f.vehicleType||r.vehicleType===f.vehicleType)&&(!f.store||r.store===f.store)&&(!f.brand||r.brand===f.brand)&&(!f.model||r.model===f.model)&&
 (!f.className||r.className===f.className)&&(!f.destination||r.destination===f.destination)&&
 (!f.month||r.month===f.month)&&(!f.status||r.status===f.status));
const median=(values:number[])=>{
 const a=values.filter(x=>Number.isFinite(x)).sort((x,y)=>x-y);
 return a.length?a.length%2?a[Math.floor(a.length/2)]:(a[a.length/2-1]+a[a.length/2])/2:0;
};
type Aggregate={name:string;count:number;value:number;preparation:number;fipeRatios:number[];qtdAll:number;quotes:number};
export const aggregateDashboard=(rows:DashboardRow[])=>{
 const purchased=rows.filter(r=>r.status==='COMPRA');
 const quotes=rows.filter(r=>r.status==='COTACAO');
 const statusNames=['COMPRA','COTACAO','REPASSE PENDENTE','REVISAR','OUTROS'] as DashboardStatus[];
 const status=statusNames.map(name=>({name,value:rows.filter(r=>r.status===name).length}));
 const totalPaid=purchased.reduce((sum,r)=>sum+r.value,0);
 const preparation=purchased.reduce((sum,r)=>sum+r.preparation,0);
 const units=Array.from(new Set(rows.map(r=>r.store))).map(name=>{
   const x=rows.filter(r=>r.store===name),b=x.filter(r=>r.status==='COMPRA');
   const q=x.filter(r=>r.status==='COTACAO');
   const ratios=b.filter(r=>r.fipe>0).map(r=>r.value/r.fipe);
   return {name, evaluations:x.length,purchases:b.length,quotes:q.length,
     totalPaid:b.reduce((sum,r)=>sum+r.value,0),prep:b.reduce((sum,r)=>sum+r.preparation,0),
     index:b.length+q.length?b.length/(b.length+q.length):0,medianFipe:median(ratios)};
 }).sort((a,b)=>b.purchases-a.purchases);
 const group=(makeKey:(r:DashboardRow)=>string)=>Array.from(
   purchased.reduce((m,r)=>{const k=makeKey(r);const a=m.get(k)||{name:k,count:0,value:0,preparation:0,ratios:[] as number[]};
     a.count++;a.value+=r.value;a.preparation+=r.preparation;if(r.fipe>0)a.ratios.push(r.value/r.fipe);
     m.set(k,a);return m;
   },new Map<string,{name:string;count:number;value:number;preparation:number;ratios:number[]}>()).values()
 ).map(r=>({name:r.name,count:r.count,value:r.value,preparation:r.preparation,medianFipe:median(r.ratios)}))
   .sort((a,b)=>b.count-a.count);
 const brands=group(r=>r.brand);
 const models=group(r=>r.brand+' '+r.model);
 const classes=group(r=>r.className);
 const destinations=group(r=>r.destination);
 const dates=[...new Set(rows.map(r=>r.date).filter(Boolean))].sort().map(date=>({
    date,caption:date.slice(8,10)+'/'+date.slice(5,7),
    purchases:rows.filter(r=>r.date===date&&r.status==='COMPRA').length,
    quotes:rows.filter(r=>r.date===date&&r.status==='COTACAO').length,
 }));
 return {
  evaluations:rows.length,purchaseCount:purchased.length,quoteCount:quotes.length,
  totalPaid,preparation,medianPaid:median(purchased.map(r=>r.value)),
  missingWeb:purchased.filter(r=>r.webReference<=0).length,
  noPreparation:purchased.filter(r=>r.preparation<=0).length,
  medianPaidFipe:median(purchased.filter(r=>r.fipe>0).map(r=>r.value/r.fipe)),
  status,units,brands,models,classes,destinations,dates,
 };
};
