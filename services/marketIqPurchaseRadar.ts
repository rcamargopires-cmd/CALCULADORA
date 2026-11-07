import type {DealerStockSnapshot,DealerStockVehicle} from './marketIqDealerRadar';

/** Marketing-style summary using only actual Dealer and operator supplied evidence. */
export type PurchaseRadarTarget={
 brand:string;model:string;year:string;plate?:string;
 km?:number;store?:string;vehicleType:'car'|'motorcycle';
 fipe?:number;offer?:number;preparation?:number;verifiedMarketPrice?:number;manualSalePrice?:number;dealerSuggestedSalePrice?:number; fipeReferenceMonth?:string;fipeCode?:string;fipeStatus?:'current'|'outdated'|'unverified';fipeModel?:string;fipeYear?:number;fipeSource?:string; marketListings?:Array<{url:string;price:number;km:number;title:string;checked:boolean}>;
 marketAdsVerified?:number;stockVehicle?:DealerStockVehicle|null;
};
export type PurchaseRadarResult={
 snapshotAvailable:boolean;familyCount:number;yearFamilyCount:number;storeFamilyCount:number|null;
 familyRows:DealerStockVehicle[];yearFamilyRows:DealerStockVehicle[];
 ageAverage:number|null;ageMedian:number|null;averageKm:number|null;over90Count:number;
 prices:number[];medianSuggestedPrice:number|null;minSuggestedPrice:number|null;
 grossSpread:number|null;grossMarginPercent:number|null;capitalAt30:number|null;
 grossBasis:'dealer_cost'|'estimated_offer_plus_preparation'|'unavailable';
 referenceSale:'dealer_suggested'|'verified_webmotors'|'manual_assumption'|'unavailable';
 referencePrice:number|null;
 signal:'insufficient'|'check_offer'|'negotiate'|'stock_risk'|'favorable'|'review';
 signalTitle:string;reasons:string[];limits:string[];
};
const norm=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toUpperCase().replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const brandKey=(s:string)=>{
 const n=norm(s);if(/VOLKS|^VW\b/.test(n))return 'VOLKSWAGEN';
 if(/^(GM|CHEVROLET)\b/.test(n))return 'CHEVROLET';
 if(/MERCEDES/.test(n))return 'MERCEDES BENZ';
 return n;
};
export const familyKey=(brand:string,model:string)=>{
 let n=norm(model);
 n=n.replace(/^(VW|VOLKSWAGEN|CHEVROLET|GM|FIAT|FORD|RENAULT|HYUNDAI|TOYOTA)\s+/,'');
 return brandKey(brand)+'|'+(n.split(' ')[0]||'DESCONHECIDO');
};
export const modelYear=(s:string)=>{
 const m=String(s||'').match(/\b(?:19|20)\d{2}\b/g);
 return m?Number(m[m.length-1]):null;
};
const average=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const median=(values:number[])=>{
 if(!values.length)return null;
 const a=[...values].sort((x,y)=>x-y),mid=Math.floor(a.length/2);
 return a.length%2?a[mid]:(a[mid-1]+a[mid])/2;
};
const validMoney=(n:number|undefined)=>Number.isFinite(n)&&Number(n)>0&&Number(n)<20000000?Number(n):null;
/** Mesa commercial rule: 14% margin reserve, optional additional 5% for repasse.
 * Only a hypothetical ceiling, not actual profit or an approved buy offer.
 * Capital at 1.5%/month and any unprovided fees remain separate.
 */
export function calculateMesaPurchaseCeiling(
 salePrice:number|null|undefined,preparation=0,repasse=false
):number|null{
 const price=validMoney(salePrice===null?undefined:salePrice);
 if(price===null)return null;
 const preparationValue=Number.isFinite(preparation)?Math.max(0,preparation):0;
 return Math.max(0,Math.round((price*0.86*(repasse?0.95:1)-preparationValue)*100)/100);
}
export function buildPurchaseRadar(
 snapshot:DealerStockSnapshot|null|undefined,target:PurchaseRadarTarget,store='',
 monthlyCapitalRate=1.5
):PurchaseRadarResult{
 const ready=Boolean(snapshot);
 const year=modelYear(target.year),plate=norm(target.plate||'').replace(/\s/g,'');
 const rows=(snapshot?.vehicles||[]).filter(v=>v.vehicleType===target.vehicleType&&
  familyKey(v.brand,v.model)===familyKey(target.brand,target.model));
 const sameYear=year?rows.filter(v=>modelYear(v.year)===year):[];
 const selected=year?sameYear:rows;
 const prices=selected.map(v=>v.price).filter(v=>v>0);
 const age=selected.map(v=>v.days);
 const validKm=selected.filter(v=>v.kmValid).map(v=>v.km);
 const byStore=store?rows.filter(v=>norm(v.store)===norm(store)).length:null;
 const stock=target.stockVehicle||null;
 const verified=Number(target.marketAdsVerified)>=2?validMoney(target.verifiedMarketPrice):null;
 const dealerSuggested=validMoney(target.dealerSuggestedSalePrice);
 const sourcePrice=stock?validMoney(stock.price):verified||dealerSuggested||validMoney(target.manualSalePrice);
 const saleSource=stock?(stock.price>0?'dealer_suggested':'unavailable'):
  verified?'verified_webmotors':dealerSuggested?'dealer_suggested':
  validMoney(target.manualSalePrice)?'manual_assumption':'unavailable';
 const referencePrice=saleSource==='unavailable'?null:sourcePrice;
 // Real Dealer cost is an existing inventory value. An offer is only a new
 // operator-entered scenario. Never derive a "paid value" from FIPE or history.
 const knownCost=validMoney(stock?.cost);
 const offer=validMoney(target.offer),preparation=Math.max(0,target.preparation||0);
 const basis=stock&&knownCost?knownCost:offer?offer+preparation:null;
 const grossSpread=basis&&referencePrice!==null?referencePrice-basis:null;
 const grossMarginPercent=grossSpread!==null&&referencePrice?grossSpread/referencePrice*100:null;
 const over90=selected.filter(v=>v.days>90).length;
 const familyCount=rows.length, yearFamilyCount=sameYear.length;
 const samePlate=plate&&rows.some(v=>v.plate===plate);
 const reasons:string[]=[];
 if(!ready)reasons.push('Estoque do grupo não carregado. Importe o Dealer no Radar para visualizar a concorrência interna.');
 else if(!familyCount)reasons.push('Nenhum veículo dessa família no relatório carregado. Isso não significa ausência de oferta no mercado.');
 else {
  reasons.push(familyCount+' veículo(s) da família no grupo, '+(year?yearFamilyCount+' do ano-modelo '+year:'sem ano-modelo confirmado')+'.');
  if(selected.length&&over90)reasons.push(over90+' veículo(s) comparáveis por família/ano há mais de 90 dias no estoque.');
  if(samePlate)reasons.push('A placa consultada já consta no estoque importado: confira se é avaliação de entrada ou veículo próprio.');
 }
 if(stock&&stock.price<=0)reasons.push('Veículo do Dealer sem preço sugerido válido.');
 if(stock&&stock.price>0&&stock.cost>stock.price)reasons.push('Preço sugerido abaixo do custo total informado pelo Dealer.');
 if(!stock&&offer===null)reasons.push('Informe o valor que pretende pagar para calcular a diferença bruta.');
 if(!stock&&saleSource==='unavailable')reasons.push('Não há dois anúncios individuais Webmotors conferidos para estimar preço de venda.');
 if(saleSource==='manual_assumption')reasons.push('Preço de venda digitado pelo operador: simulação, sem validação com o mercado.');
 if(!stock&&saleSource==='dealer_suggested')reasons.push('Preço de venda baseado no anúncio sugerido do Dealer: não comprova venda nem mercado Webmotors.');
 if(grossMarginPercent!==null)reasons.push('Diferença bruta indicativa: '+grossMarginPercent.toFixed(1).replace('.',',')+'% do preço de referência.');
 const pressure=selected.length>0&&(over90>=2||over90/selected.length>=0.4)||familyCount>=6;
 let signal:PurchaseRadarResult['signal']='review',signalTitle='Análise em andamento';
 if(!ready){signal='insufficient';signalTitle='Estoque a confirmar';}
 else if(stock&&stock.price<=0){signal='check_offer';signalTitle='Revisar preço de venda';}
 else if(stock&&grossSpread!==null&&grossSpread<0){signal='negotiate';signalTitle='Preço abaixo do custo';}
 else if(!stock&&(!offer||referencePrice===null)){signal='insufficient';signalTitle='Complete os dados da compra';}
 else if(grossMarginPercent!==null&&grossMarginPercent<10){signal='negotiate';signalTitle='Negociar ou revisar custos';}
 else if(saleSource==='manual_assumption'||saleSource==='dealer_suggested'){
  signal='review';signalTitle='Preço de venda ainda não confirmado pelo mercado';
 }
 else if(pressure){signal='stock_risk';signalTitle='Atenção ao estoque do grupo';}
 else if(saleSource==='verified_webmotors'&&grossMarginPercent!==null&&grossMarginPercent>=18&&yearFamilyCount<=2){
  signal='favorable';signalTitle='Cenário bruto favorável, conferir';
 }
 const limits=[
  'Indicadores de estoque e tempo referem-se a veículos ainda disponíveis, não a vendas realizadas.',
  'Modelos da mesma família ou ano podem ter versões, motores e câmbios diferentes. Não formam amostra de preço FIPE exato.',
  'O preço de referência é anunciado/sugerido e não comprova venda. Diferença bruta não equivale a margem líquida.',
  'Sem vendas e demanda regional verificadas, não calculamos MDS, dias médios até a venda, score proprietário ou chance de venda.'
 ];
 const rate=Number.isFinite(monthlyCapitalRate)?Math.min(6,Math.max(0,monthlyCapitalRate)):1.5;
 return {
  snapshotAvailable:ready,familyCount,yearFamilyCount,
  storeFamilyCount:ready?byStore:null,familyRows:rows,yearFamilyRows:sameYear,
  ageAverage:average(age),ageMedian:median(age),averageKm:average(validKm),
  over90Count:over90,prices,medianSuggestedPrice:median(prices),
  minSuggestedPrice:prices.length?Math.min(...prices):null,
  grossSpread,grossMarginPercent,
  capitalAt30:basis!==null?basis*(rate/100):null,
  grossBasis:stock&&knownCost?'dealer_cost':offer?'estimated_offer_plus_preparation':'unavailable',
  referenceSale:saleSource,referencePrice,signal,signalTitle,reasons,limits
 };
}
