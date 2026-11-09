/** Safe context handoff from one specific history row into the purchase simulator. */
import type {ComparableEntry} from './marketIqComparableHistory';
import type {PurchaseRadarTarget} from './marketIqPurchaseRadar';
import {reuseVerifiedIqEvidence,type ActiveFipeContext} from './marketIqPurchaseAutoContext';

const normalize=(v:string)=>String(v||'').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,' ').toUpperCase().trim();

export function purchaseTargetFromComparable(entry:ComparableEntry,active?:ActiveFipeContext):PurchaseRadarTarget{
 const model=String(entry.model||'').trim();
 const version=String(entry.version||'').trim();
 const description=version&&!normalize(model).includes(normalize(version))?
  [model,version].filter(Boolean).join(' '):model;
 const archived:PurchaseRadarTarget={
  brand:entry.brand,model:description,year:entry.year>0?String(entry.year):'',
  plate:entry.plate,vehicleType:entry.vehicleType,km:entry.km??undefined,
  store:entry.store||'',fipe:entry.fipe??0,fipeCode:entry.fipeCode||'',
  // Historical FIPE is never silently presented as the current-month quote.
  fipeStatus:'unverified',fipeModel:description,
  preparation:0,marketListings:[],marketAdsVerified:0,verifiedMarketPrice:0,
  historicalAssessment:{
   source:entry.source,date:entry.date,status:entry.status,
   assessed:entry.assessed,paid:entry.paid,paidBasis:entry.paidBasis
  }
  // A historical assessed/paid value must not become a new offer, Dealer cost,
  // sale price, or validated advertisement automatically.
 };
 // Never import the current valuation's FIPE or Webmotors unless identity
 // matches the selected vehicle's precise FIPE code, year and version.
 const reusable=active?reuseVerifiedIqEvidence(archived,active):null;
 return reusable?{...archived,...reusable}:archived;
}
