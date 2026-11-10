/**
 * A compact read-only decision snapshot for the active Motyq valuation.
 * Reuses the reviewed Radar, exact-version paid history and Mesa opinion.
 * No FIPE calls, Webmotors requests, database writes or new pricing rules.
 */
import {buildPurchaseRadar,calculateMesaPurchaseCeiling,modelYear,
 type PurchaseRadarTarget} from './marketIqPurchaseRadar';
import {buildComparableHistory,type ComparableCloud} from './marketIqComparableHistory';
import {buildMesaPurchaseOpinion} from './marketIqPurchaseOpinion';
import type {DealerStockSnapshot} from './marketIqDealerRadar';

export type QuickDecisionInput={
 target:PurchaseRadarTarget;
 snapshot:DealerStockSnapshot|null;
 saved:ComparableCloud[];
 companyId:string;
 offer:number|null;
 preparation:number;
 preparationConfirmed:boolean;
 repasse:boolean;
 verifiedMarketPrice:number|null;
 verifiedAds:number;
 historicalEstimate:number|null;
 historicalRange:[number,number]|null;
};
export function buildQuickPurchaseDecision(i:QuickDecisionInput){
 const t=i.target;
 const identityReady=Boolean(t.brand.trim()&&t.model.trim()&&modelYear(t.year)&&
  Number.isFinite(t.km)&&Number(t.km)>0);
 const fipeCurrent=t.fipeStatus==='current'&&Number(t.fipe)>0&&
  t.fipeYear===modelYear(t.year)&&Boolean(t.fipeCode);
 const radar=identityReady?buildPurchaseRadar(i.snapshot,{
  ...t,offer:i.offer??undefined,preparation:i.preparation,
  verifiedMarketPrice:i.verifiedMarketPrice??undefined,marketAdsVerified:i.verifiedAds
 }):null;
 // This is intentionally only the in-memory authorized IQ history, not the
 // full monthly archive. The complete authenticated query remains in the
 // existing Intelligence of Purchase view.
 const similar=identityReady?buildComparableHistory({
  plate:t.plate||'',brand:t.brand,model:t.model,
  modelYear:modelYear(t.year)||0,km:t.km||0,fipe:t.fipe||0,
  fipeCode:t.fipeCode,vehicleType:t.vehicleType
 },[],[],i.saved,i.companyId,true):null;
 const stockAge=(()=>{
  const d=i.snapshot?.reportDate||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return null;
  const day=new Date();const iso=new Date(day.getTime()-day.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const age=Math.floor((Date.parse(iso+'T00:00:00Z')-Date.parse(d+'T00:00:00Z'))/86400000);
  return Number.isFinite(age)&&age>=0?age:null;
 })();
 const validMarket=identityReady&&i.verifiedAds>=2&&
  Number.isFinite(i.verifiedMarketPrice)&&Number(i.verifiedMarketPrice)>0;
 const ceiling=validMarket&&i.preparationConfirmed&&Number.isFinite(i.preparation)&&
  i.preparation>=0?calculateMesaPurchaseCeiling(i.verifiedMarketPrice,i.preparation,i.repasse):null;
 const historical=identityReady&&fipeCurrent&&Number.isFinite(i.historicalEstimate)&&
  Number(i.historicalEstimate)>0?i.historicalEstimate:null;
 const opinion=identityReady?buildMesaPurchaseOpinion({
  mode:'purchase',verifiedMarketPrice:validMarket?i.verifiedMarketPrice:null,
  verifiedAds:validMarket?i.verifiedAds:0,
  offer:i.offer, dealerCost:null,preparation:i.preparation,
  preparationConfirmed:i.preparationConfirmed,repasse:i.repasse,
  fipeCurrent,fipeValue:fipeCurrent?t.fipe||null:null,
  snapshotAvailable:Boolean(i.snapshot),snapshotDate:i.snapshot?.reportDate||'',
  familyCount:radar?.familyCount||0,yearFamilyCount:radar?.yearFamilyCount||0,
  over90Count:radar?.over90Count||0,
  // Even when IQ cloud has paid purchases, additional months could exist.
  historyAvailable:Boolean(similar?.paidCount),historyLimited:true,
  paidCount:similar?.paidCount??0,paidMedian:similar?.paidMedian??null
 }):null;
 const warnings:string[]=[];
 if(!identityReady)warnings.push('Complete marca, versão, ano e KM.');
 if(identityReady&&!fipeCurrent)warnings.push('Confirme a FIPE vigente da versão e do ano-modelo.');
 if(identityReady&&!validMarket)warnings.push('Sem dois anúncios individuais Webmotors conferidos: não há teto comercial validado.');
 if(identityReady&&!i.preparationConfirmed)warnings.push('Confirme o valor do preparo, inclusive se for zero.');
 if(identityReady&&!i.snapshot)warnings.push('Estoque do Dealer ainda não carregado.');
 else if(identityReady&&(stockAge===null||stockAge>14))warnings.push('Fotografia do Dealer com mais de 14 dias ou sem data válida.');
 if(identityReady)warnings.push('Histórico exibido é parcial; consulte a Inteligência de Compra para o arquivo mensal completo.');
 return {
  identityReady,fipeCurrent,radar,similar,stockAge,
  verifiedMarket:validMarket,ceiling,historical,opinion,warnings
 };
}
