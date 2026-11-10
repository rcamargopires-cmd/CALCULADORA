/** Cotação Mesa · v1. Buyer expertise and outbound previews stay on this browser.
 * No bulk campaigns, automatic sends, contact discovery or provider integrations.
 * A human opens one WhatsApp conversation per opted-in buyer.
 */
import type {ConsultedVehicle} from './marketIqConsultedRepasse';

export type BuyerProfile={
 id:string;shop:string;contact:string;whatsapp:string;region:string;
 brands:string;models:string;vehicleType:'both'|'car'|'motorcycle';
 yearFrom:string;yearTo:string;optedIn:boolean;active:boolean;updatedAt:string;
};
export type BuyerMatch={buyer:BuyerProfile;score:number;reasons:string[]};
const normalize=(s:unknown)=>String(s??'').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const tags=(s:string)=>s.split(/[,;\n]+/).map(normalize).filter(Boolean);
const validYear=(s:string)=>/^(19\d{2}|20\d{2})$/.test(s)?Number(s):null;
const vehicleYear=(s:string)=>{
 const years=String(s).match(/(?:19|20)\d{2}/g);
 return years?Number(years[years.length-1]):null;
};
export const buyerStorageKey=(scope:string)=>'motyq-iq-cotacao-mesa-compradores-v1-'+
 encodeURIComponent(scope.trim().toLowerCase());
export const blankBuyer=():BuyerProfile=>({
 id:'',shop:'',contact:'',whatsapp:'',region:'',brands:'',models:'',
 vehicleType:'both',yearFrom:'',yearTo:'',optedIn:false,active:true,updatedAt:''
});
export function validBuyerPhone(raw:string):string|null{
 const digits=String(raw||'').replace(/\D/g,'');
 const normalized=digits.startsWith('55')?digits:'55'+digits;
 // Brazilian national number (DDD + 8 or 9 digits), no service numbers.
 return /^55[1-9]\d{1}[2-9]\d{7,8}$/.test(normalized)?normalized:null;
}
export function safeBuyer(value:unknown):BuyerProfile|null{
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>;
 const shop=String(v.shop||'').trim().slice(0,100);
 if(!shop||typeof v.id!=='string'||!v.id.trim())return null;
 return {
  id:v.id.slice(0,100),shop,contact:String(v.contact||'').slice(0,100),
  whatsapp:String(v.whatsapp||'').replace(/[^\d+()\s-]/g,'').slice(0,32),
  region:String(v.region||'').slice(0,100),brands:String(v.brands||'').slice(0,400),
  models:String(v.models||'').slice(0,400),
  vehicleType:v.vehicleType==='car'||v.vehicleType==='motorcycle'?v.vehicleType:'both',
  yearFrom:String(v.yearFrom||'').slice(0,4),yearTo:String(v.yearTo||'').slice(0,4),
  optedIn:v.optedIn===true,active:v.active!==false,updatedAt:String(v.updatedAt||'').slice(0,40)
 };
}
export function loadCotacaoBuyers(scope:string):BuyerProfile[]{
 try{
  const stored=JSON.parse(localStorage.getItem(buyerStorageKey(scope))||'[]');
  if(!Array.isArray(stored))return [];
  const seen=new Set<string>();
  return stored.slice(0,250).map(safeBuyer).filter((b):b is BuyerProfile=>{
   if(!b||seen.has(b.id))return false;seen.add(b.id);return true;
  });
 }catch{return [];}
}
export function saveCotacaoBuyers(scope:string,buyers:BuyerProfile[]):void{
 if(buyers.length>250)throw Error('Limite local de 250 lojistas por conta.');
 const unique=new Set<string>();
 const cleaned=buyers.map(safeBuyer);
 if(cleaned.some(b=>!b||unique.has(b.id)||!unique.add(b.id)))
  throw Error('Carteira de compradores contém cadastro inválido ou duplicado.');
 localStorage.setItem(buyerStorageKey(scope),JSON.stringify(cleaned));
}
export function rankCotacaoBuyers(
 buyers:BuyerProfile[],vehicle:Pick<ConsultedVehicle,'brand'|'model'|'year'>,
 type:'car'|'motorcycle'='car'
):BuyerMatch[]{
 const brand=normalize(vehicle.brand),model=normalize(vehicle.model),year=vehicleYear(vehicle.year);
 if(!brand||!model)return [];
 return buyers.filter(b=>b.active).flatMap(b=>{
  if(b.vehicleType!=='both'&&b.vehicleType!==type)return [];
  const brands=tags(b.brands),models=tags(b.models);
  if(brands.length&&!brands.some(tag=>brand===tag||brand.startsWith(tag+' ')))return [];
  if(models.length&&!models.some(tag=>model===tag||model.includes(tag)||tag.includes(model)))return [];
  const min=validYear(b.yearFrom),max=validYear(b.yearTo);
  if(year!==null&&((min&&year<min)||(max&&year>max)))return [];
  if(year===null&&(min||max))return [];
  const score=(brands.length?40:5)+(models.length?35:0)+(year!==null&&(min||max)?12:0)+
   (b.vehicleType===type?8:0)+(b.optedIn?5:0);
  const reasons=[
   brands.length?'Marca de interesse':'Comprador de várias marcas',
   models.length?'Modelo de interesse':'Modelos variados',
   min||max?'Ano compatível':'Sem restrição de ano'
  ];
  return [{buyer:b,score,reasons}];
 }).sort((a,b)=>b.score-a.score||a.buyer.shop.localeCompare(b.buyer.shop,'pt-BR'));
}
/** Prepares a conversation. Only clicking the returned URL opens WhatsApp.
 * No license plate, FIPE value, client details, internal costs or seller names.
 */
export function buyerWhatsAppUrl(buyer:BuyerProfile,vehicle:ConsultedVehicle):string|null{
 if(!buyer.active||!buyer.optedIn)return null;
 const phone=validBuyerPhone(buyer.whatsapp);
 if(!phone||!vehicle.brand.trim()||!vehicle.model.trim())return null;
 const brief=[vehicle.brand,vehicle.model,vehicle.year].map(v=>v.trim().slice(0,100)).filter(Boolean).join(' ');
 const km=Number(String(vehicle.km||'').replace(/\D/g,''));
 const description=brief+(km>0&&km<2_000_000?' · '+km.toLocaleString('pt-BR')+' km':'');
 const message='Olá! Aqui é da Mesa de Cotações. Temos um veículo para consulta: '+description+
  '. Sua loja tem interesse em cotar? Pode informar o valor, as condições e até quando a proposta vale? Obrigado!';
 return 'https://wa.me/'+phone+'?text='+encodeURIComponent(message);
}
