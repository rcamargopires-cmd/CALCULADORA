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

/** A selection is safe only when its FIPE model, year and fuel are compatible.
 * Year options are resolved after selecting the model because of the FIPE API.
 */
export const mobileNormalized=(raw:string)=>normalized(raw).replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
export function mobileFuelFromModel(label:string):MobileFuel|''{
 const v=mobileNormalized(label);
 if(/\b(diesel|dies|td350|td 350|tdi|crdi|bluehdi|d 4d)\b/.test(v))return 'Diesel';
 if(/\b(hibrid\w*|hybrid|4xe|phev|hev|mhev)\b/.test(v))return 'Híbrido';
 if(/\b(eletric|electric|ev)\b/.test(v))return 'Elétrico';
 if(/\b(flex|total flex|bicombustivel)\b/.test(v))return 'Flex';
 if(/\b(etanol|alcool)\b/.test(v))return 'Etanol';
 if(/\b(gasolina|gasol|gas)\b/.test(v))return 'Gasolina';
 return '';
}
export function mobileFilterModels(models:MobileFipeOption[],search:string,fuel:MobileFuel|''){
 const text=mobileNormalized(search);
 const words=text.split(' ').filter(Boolean);
 return models.filter(model=>{
  const name=mobileNormalized(model.name).replace(/\blong\b|\blongi\b/g,'longitude');
  if(words.length&&!words.every(term=>name.split(' ').some(word=>word.startsWith(term.slice(0,Math.min(term.length,4))))))return false;
  const known=mobileFuelFromModel(model.name);
  return !fuel||!known||fuel===known||(fuel==='Flex'&&known==='Gasolina'&&/\bflex\b/.test(name));
 });
}
const carModelMakes:Record<string,string>={
 compass:'jeep',renegade:'jeep',commander:'jeep',avenger:'jeep',
 onix:'chevrolet',tracker:'chevrolet',montana:'chevrolet',spin:'chevrolet',
 hb20:'hyundai',creta:'hyundai',tucson:'hyundai',
 tcross:'volkswagen',polo:'volkswagen',nivus:'volkswagen',virtus:'volkswagen',
 corolla:'toyota',hilux:'toyota',yaris:'toyota',
 argo:'fiat',mobi:'fiat',pulse:'fiat',fastback:'fiat',strada:'fiat',
 kwid:'renault',duster:'renault',
 city:'honda',civic:'honda',hrv:'honda',
 biz:'honda',pcx:'honda',cg:'honda',xre:'honda',cb:'honda',
 fazer:'yamaha',factor:'yamaha',nmax:'yamaha',mt03:'yamaha'
};
/** Infer only unambiguous makes. User still chooses the exact FIPE version. */
export function mobileQuickIntent(text:string,brands:MobileFipeOption[]){
 const normalizedText=mobileNormalized(text);
 const year=Number(normalizedText.match(/\b(?:19|20)\d{2}\b/)?.[0]||0);
 const words=normalizedText.replace(/\b(?:19|20)\d{2}\b/g,'').replace(/\bt\s+cross\b/g,'tcross')
  .split(' ').filter(Boolean);
 const byBrand=brands.find(b=>{
  const name=mobileNormalized(b.name);
  return Boolean(name&&normalizedText.includes(name)&&
   (normalizedText===name||normalizedText.startsWith(name+' ')));
 });
 const firstModel=words.find(w=>Object.hasOwn(carModelMakes,w));
 const make=byBrand?.name||carModelMakes[firstModel||'']||'';
 const brand=byBrand||brands.find(b=>mobileNormalized(b.name)===mobileNormalized(make))||null;
 const leftover=words.filter(w=>{
  if(firstModel&&w===firstModel)return false;
  const brandWords=mobileNormalized(brand?.name||make).split(' ');
  return !brandWords.includes(w);
 });
 const modelWords=words.filter(w=>!mobileNormalized(brand?.name||make).split(' ').includes(w));
 return {brand,year,modelSearch:modelWords.join(' '),description:normalizedText,
  needsBrand:!brand,hasVehicleHint:Boolean(firstModel||byBrand),hasYear:year>=1990&&year<=2100};
}
export function mobileAutoYearChoice(years:MobileFipeOption[],year:number,fuel:MobileFuel|''){
 const match=mobileYearOptions(years,year,fuel);
 if(!match.yearMatched||(Boolean(fuel)&&!match.fuelMatched))return null;
 return match.choices.length===1?match.choices[0]:null;
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
