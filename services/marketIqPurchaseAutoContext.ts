/**
 * Context for a selected historical evaluation in the Motyq IQ purchase summary.
 * Never promotes an old quote, paid price, or a mismatched FIPE/market listing.
 */
import {familyKey,modelYear,type PurchaseRadarTarget} from './marketIqPurchaseRadar';
import {validatedRadarFipe,fipeVersionCompatible,type RadarFipeQuote,type RadarWebmotorsListing}
 from './marketIqPurchaseEvidence';

const canonical=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();

export function autoFipeForHistoricalTarget(
 target:PurchaseRadarTarget,raw:unknown
):RadarFipeQuote|null{
 const code=String(target.fipeCode||'');
 const expectedYear=modelYear(target.year);
 if(!/^\d{6}-\d$/.test(code)||!expectedYear)return null;
 const quote=validatedRadarFipe(raw,expectedYear);
 if(!quote||quote.fipeCode!==code||
   familyKey(quote.brand,quote.model)!==familyKey(target.brand,target.model)||
   !fipeVersionCompatible(target.model,quote.model))return null;
 const wanted=canonical(target.model),got=canonical(quote.model);
 // A FIPE code alone is not permission to silently switch comfort trim,
 // turbo engine, gearbox or fuel system when the text contradicts the record.
 const plus=/(?:^| )PLUS(?: |$)/.test(wanted);
 if(plus&&!/(?:^| )PLUS(?: |$)/.test(got))return null;
 const automatic=/\b(AUTOMATICO|AUTOMATICA|AUT|AT6|AT8|CVT|DSG)\b/.test(wanted);
 const manual=/\b(MANUAL|MECANICO|MEC)\b/.test(wanted);
 const foundAutomatic=/\b(AUTOMATICO|AUTOMATICA|AUT|AT6|AT8|CVT|DSG)\b/.test(got);
 const foundManual=/\b(MANUAL|MECANICO|MEC)\b/.test(got);
 if((automatic&&!foundAutomatic)||(manual&&!foundManual))return null;
 return quote;
}
export type ActiveFipeContext={
 brand:string;model:string;year:number;vehicleType:'car'|'motorcycle';
 fipe?:{
  value:number;brand:string;model:string;year:number;fuel:string;
  referenceMonth:string;fipeCode:string;referenceStatus?:'current'|'outdated'|'unverified';
  referenceSource?:string;
 }|null;
 listings?:RadarWebmotorsListing[];
};
/** Share live IQ evidence only when the selected archived FIPE identity is exactly the same. */
export function reuseVerifiedIqEvidence(
 target:PurchaseRadarTarget,active:ActiveFipeContext
):Pick<PurchaseRadarTarget,'fipe'|'fipeCode'|'fipeStatus'|'fipeModel'|'fipeYear'|'fipeReferenceMonth'|'fipeSource'|'marketListings'>|null{
 const f=active.fipe,code=String(target.fipeCode||'');
 if(!f||!/^(?:\d{6}-\d)$/.test(code)||f.fipeCode!==code||
   modelYear(target.year)!==f.year||active.year!==f.year||
   target.vehicleType!==active.vehicleType||
   familyKey(target.brand,target.model)!==familyKey(active.brand,active.model)||
   familyKey(f.brand,f.model)!==familyKey(target.brand,target.model)||
   !fipeVersionCompatible(target.model,f.model)||
   !fipeVersionCompatible(target.model,active.model)||
   !autoFipeForHistoricalTarget(target,{...f,referenceStatus:f.referenceStatus||'unverified',
     referenceSource:f.referenceSource||'FIPE'}))return null;
 return {
  fipe:f.value,fipeCode:f.fipeCode,fipeStatus:f.referenceStatus||'unverified',
  fipeModel:f.model,fipeYear:f.year,fipeReferenceMonth:f.referenceMonth,
  fipeSource:f.referenceSource||'FIPE',
  marketListings:(active.listings||[]).filter(l=>l.checked).map(l=>({...l}))
 };
}
