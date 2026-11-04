/**
 * Motyq IQ · Arquivo mensal de avaliações do AutoAvaliar.
 *
 * Importação explícita no navegador. Apenas dados operacionais da avaliação
 * são enviados ao arquivo cloud da empresa. NÃO armazenar cliente, telefone,
 * e-mail, documento, VIN, observações livres, CRM nem arquivo XLSX original.
 *
 * Status UTILIZADO / REPASSE / data de compra não comprovam valor pago.
 * "Valor avaliado" e "ref. Web" permanecem referências com rótulos próprios.
 */
import {isMoto} from './marketIqManagementData';
import {classifyByMileage} from './marketIqFleetClassification';

export type MonthlyArchiveRow={
 id:string;month:string;evaluationDate:string;purchaseDate:string;
 plate:string;brand:string;model:string;version:string;vehicleType:'car'|'motorcycle';
 manufacturingYear:number|null;modelYear:number|null;km:number|null;
 classRecorded:string;classSuggested:string;destination:string;status:string;
 store:string;evaluator:string;seller:string;color:string;
 assessedValue:number|null;estimatedCost:number|null;fipe:number|null;
 webReference:number|null;fipeCode:string;
};
export type MonthlyArchiveParse={
 rows:MonthlyArchiveRow[];sourceRows:number;duplicates:number;invalid:number;
 months:Record<string,number>;
};
const text=(v:unknown,max=120)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
const norm=(v:unknown)=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toUpperCase().replace(/\u00a0/g,' ');
const value=(v:unknown):number|null=>{
 if(typeof v==='number')return Number.isFinite(v)&&v>=0&&v<=2000000?v:null;
 const s=text(v,48).replace(/R\$/gi,'').replace(/\s/g,'');
 if(!s||!/^[\d.,]+$/.test(s))return null;
 const n=Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):
  /^\d{1,3}(?:\.\d{3})+$/.test(s)?s.replace(/\./g,''):s);
 return Number.isFinite(n)&&n>=0&&n<=2000000?n:null;
};
const positive=(v:unknown)=>{const n=value(v);return n!==null&&n>0?n:null;};
const integer=(v:unknown,min:number,max:number)=>{
 const n=value(v);
 return n!==null&&Number.isInteger(n)&&n>=min&&n<=max?n:null;
};
export function archiveDate(v:unknown):string{
 if(typeof v==='number'&&v>35000&&v<65000){
  return new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);
 }
 if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString().slice(0,10);
 const s=text(v,45);
 const br=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
 const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:\D|$)/);
 const date=br?br[3]+'-'+br[2].padStart(2,'0')+'-'+br[1].padStart(2,'0'):
  iso?iso[1]+'-'+iso[2]+'-'+iso[3]:'';
 if(!date)return '';
 const d=new Date(date+'T12:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===date?date:'';
}
export function parseMonthlyArchive(source:Record<string,unknown>[]):MonthlyArchiveParse{
 const rows:MonthlyArchiveRow[]=[];
 let duplicates=0,invalid=0;
 const seen=new Set<string>();
 for(const raw of source){
  if(!raw||typeof raw!=='object'){invalid++;continue;}
  const cols=new Map(Object.entries(raw).map(([k,v])=>[norm(k),v]));
  const read=(...keys:string[])=>{
   for(const k of keys)if(cols.has(norm(k)))return cols.get(norm(k));
   return null;
  };
  const rawId=text(read('ID Avaliação','ID avaliação','ID Avaliacao'),35);
  const id=rawId.replace(/\.0$/,'');
  const evaluationDate=archiveDate(read('Data de Avaliação','Data avaliação'));
  const plate=norm(read('Placa da Avaliação','Placa')).replace(/[^A-Z0-9]/g,'').slice(0,7);
  const brand=norm(read('Marca'));
  const model=norm(read('Modelo'));
  if(!id||!evaluationDate){invalid++;continue;}
  const month=evaluationDate.slice(0,7);
  const key=month+'|'+id;
  if(seen.has(key)){duplicates++;continue;}
  seen.add(key);
  const km=integer(read('KM','Quilometragem'),0,999999);
  const classSuggested=km!==null?classifyByMileage(km)?.classification||'':'';
  const assessedValue=positive(read('Valor avaliado','Valor da avaliação'));
  const webReference=positive(read('ref. Web','Ref. Web'))||
    positive(read('ref. Web(OP)','Ref. Web(OP)'));
  const vehicleTypeRaw=norm(read('Tipo de Veículo','Tipo Veículo'));
  const vehicleType:'car'|'motorcycle'=
    /MOTOCIC|\bMOTO\b|SCOOTER/.test(vehicleTypeRaw)?'motorcycle':
    /CARRO|AUTOMOV|UTILIT/.test(vehicleTypeRaw)?'car':
    isMoto(brand,model)?'motorcycle':'car';
  rows.push({
   id,month,evaluationDate,purchaseDate:archiveDate(read('Data de compra')),
   plate,brand:brand||'NÃO INFORMADA',model:model||'NÃO INFORMADO',version:text(read('Versão','Versao'),160),
   vehicleType,manufacturingYear:integer(read('Ano Fabricação','Ano de Fabricação'),1900,2100),
   modelYear:integer(read('Ano Modelo','Ano-modelo'),1900,2100),km,
   classRecorded:norm(read('Classificação','Classe')).slice(0,16),classSuggested,
   destination:norm(read('Finalidade','Destino')).slice(0,35),
   status:norm(read('Status','Situação')).slice(0,35),
   store:text(read('Lojas','Loja'),110),
   evaluator:text(read('Avaliador'),110),seller:text(read('Vendedor'),110),
   color:text(read('Cor'),40),
   assessedValue,estimatedCost:value(read('Gasto previsto','Preparo previsto')),
   fipe:positive(read('FIPE')),
   webReference,fipeCode:text(read('Código FIPE','Codigo FIPE'),32)
  });
 }
 rows.sort((a,b)=>b.evaluationDate.localeCompare(a.evaluationDate)||b.id.localeCompare(a.id));
 const months:Record<string,number>={};
 for(const r of rows)months[r.month]=(months[r.month]||0)+1;
 return {rows,sourceRows:source.length,duplicates,invalid,months};
}
export const archiveMonthlyTotals=(rows:MonthlyArchiveRow[])=>({
 evaluations:rows.length,
 withPurchaseDate:rows.filter(x=>x.purchaseDate).length,
 withWebReference:rows.filter(x=>x.webReference!==null).length,
 withAssessedValue:rows.filter(x=>x.assessedValue!==null).length,
 classDifference:rows.filter(x=>x.classRecorded&&x.classSuggested&&x.classRecorded!==x.classSuggested).length
});
