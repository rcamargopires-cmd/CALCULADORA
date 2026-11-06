/** Shared Motyq IQ mobile workflow helpers.
 * The visual five-step order may differ from the FIPE API dependency order:
 * model/trim must be chosen before FIPE year-code can be resolved.
 * Never invent a fuel-specific FIPE selection or a paid market quote.
 */
export type MobileFipeOption={code:string;name:string};
export type MobileFuel='Flex'|'Gasolina'|'Diesel'|'Etanol'|'Elétrico'|'Híbrido';
export type MobileYearChoice={choices:MobileFipeOption[];fuelMatched:boolean;yearMatched:boolean};
const normalized=(raw:string)=>raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function mobileYearOptions(
 years:MobileFipeOption[],selectedYear:number,fuel:MobileFuel|''='',
):MobileYearChoice{
 const matches=years.filter(option=>{
  const yearCode=String(option.code).match(/^(19|20)\d{2}/)?.[0];
  const yearName=String(option.name).match(/(?:19|20)\d{2}/)?.[0];
  return Number(yearCode||yearName)===selectedYear;
 });
 if(!matches.length)return {choices:[],fuelMatched:false,yearMatched:false};
 if(!fuel)return {choices:matches,fuelMatched:false,yearMatched:true};
 const requested=normalized(fuel);
 const synonyms:Record<MobileFuel,string[]>={
  Flex:['flex','gasolina','alcool','etanol'],Gasolina:['gasolina'],Diesel:['diesel'],
  Etanol:['etanol','alcool'],Elétrico:['eletrico'],Híbrido:['hibrido']
 };
 const specific=matches.filter(option=>{
  const label=normalized(option.name);
  return synonyms[fuel].some(term=>label.includes(term));
 });
 return {choices:specific.length?specific:matches,
  fuelMatched:specific.length>0,yearMatched:true};
}
export function mobilePriceSource(input:{
 fipe:number; verifiedCount:number;verifiedCeiling:number;
 historicalTarget:number;indexedReference:number;mesaReference?:number;mesaCount?:number;
 }):{label:string;value:number;kind:'mesa'|'verified'|'historical'|'missing';disclaimer:string}{
 if((input.mesaCount||0)>=2&&Number.isFinite(input.mesaReference)&&Number(input.mesaReference)>0){
  return {kind:'mesa',value:Number(input.mesaReference),
   label:'Sugestão da Mesa · valor recorrente',
   disclaimer:'Valor repetido em pelo menos 2 veículos distintos da mesma versão, ano/modelo e KM próximo. Baseado em avaliações internas, não em anúncios nem somente em compras. Não é autorização de compra.'};
 }
 if(input.verifiedCount>=2&&input.verifiedCeiling>0){
  return {kind:'verified',value:input.verifiedCeiling,
   label:'Teto de compra com anúncios conferidos',
   disclaimer:'Preço anunciado, não preço efetivamente pago. Confira procedência, versão, custos e aprovações.'};
 }
 if(input.historicalTarget>0){
  return {kind:'historical',value:input.historicalTarget,
   label:'Referência histórica de compra',
   disclaimer:'Estimativa baseada no modelo histórico do Motyq, não oferta garantida de lojistas.'};
 }
 return {kind:'missing',value:0,label:'Sem referência suficiente',
  disclaimer:'A FIPE e anúncios não auditados não autorizam inventar um valor pago por lojista.'};
}
export function mobileHistorySearch<T extends {
 plate?:string;brand?:string;model:string;year:string
}>(records:T[],query:string):T[]{
 const term=normalized(query);
 return !term?records:records.filter(item=>
  normalized([item.plate||'',item.brand||'',item.model,item.year].join(' ')).includes(term));
}
export function mobileModelYearFromCode(yearCode:string,label:string):number{
 return Number(String(yearCode).match(/^(?:19|20)\d{2}/)?.[0]||
  String(label).match(/(?:19|20)\d{2}/)?.[0]||0);
}
