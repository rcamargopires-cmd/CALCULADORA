import type {DealerStockSnapshot,DealerStockVehicle} from './marketIqDealerRadar';
import {dealerCanonicalBrand,dealerModelDescription,dealerModelFamily} from './marketIqDealerModelIdentity';
export {dealerModelFamily} from './marketIqDealerModelIdentity';

/** Read-only comparison against the most recent Dealer V44 snapshot.
 * No FIPE code or price is inferred from inventory data.
 */
export type DealerFamilyMatch={
 vehicle:DealerStockVehicle;
 samePlate:boolean;
 sameYear:boolean;
 exactDescription:boolean;
};
export type DealerFamilyStockResult={
 family:string;
 brand:string;
 matches:DealerFamilyMatch[];
 count:number;
 oldOver90:number;
 reportDate:string;
 importedAt:string;
 snapshotAgeDays:number|null;
 isOutdated:boolean;
};
const modelYear=(year:string)=>{
 const clean=String(year||'').match(/(?:19|20)\d{2}/g);
 return clean?.length?clean[clean.length-1]:'';
};
const normalizedPlate=(plate:string)=>String(plate||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const dateAge=(raw:string,today:Date)=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raw||''))return null;
 const stamp=Date.parse(raw+'T00:00:00Z');
 if(!Number.isFinite(stamp))return null;
 const local=Date.UTC(today.getFullYear(),today.getMonth(),today.getDate());
 return Math.floor((local-stamp)/86400000);
};

export function findDealerFamilyStock(
 snapshot:DealerStockSnapshot|null|undefined,
 brand:string,model:string,vehicleType:'car'|'motorcycle'='car',
 year='',plate='',today:Date=new Date()
):DealerFamilyStockResult|null{
 const wantedBrand=dealerCanonicalBrand(brand);
 const family=dealerModelFamily(brand,model);
 if(!snapshot||!wantedBrand||!family)return null;
 const wantYear=modelYear(year),wantPlate=normalizedPlate(plate);
 const targetDescription=dealerModelDescription(brand,model);
 const matches=snapshot.vehicles
  .filter(row=>row.vehicleType===vehicleType&&dealerCanonicalBrand(row.brand)===wantedBrand&&
    dealerModelFamily(row.brand,row.model)===family)
  .map(vehicle=>({
   vehicle,
   samePlate:Boolean(wantPlate)&&normalizedPlate(vehicle.plate)===wantPlate,
   sameYear:Boolean(wantYear)&&modelYear(vehicle.year)===wantYear,
   exactDescription:dealerModelDescription(vehicle.brand,vehicle.model)===targetDescription
  }))
  .sort((a,b)=>Number(b.samePlate)-Number(a.samePlate)||
    Number(b.exactDescription)-Number(a.exactDescription)||
    Number(b.sameYear)-Number(a.sameYear)||
    b.vehicle.days-a.vehicle.days||
    a.vehicle.plate.localeCompare(b.vehicle.plate));
 const snapshotAgeDays=dateAge(snapshot.reportDate,today);
 return {family,brand:wantedBrand,matches,count:matches.length,
  oldOver90:matches.filter(v=>v.vehicle.days>90).length,
  reportDate:snapshot.reportDate||'',importedAt:snapshot.importedAt||'',
  snapshotAgeDays,isOutdated:snapshotAgeDays===null||snapshotAgeDays<0||snapshotAgeDays>14};
}


/** Filters and ordering for the *visible* Dealer stock only. These never
 * affect the full family count, any price recommendation, or stored snapshot.
 * Year comparison uses model-year (the last year in Dealer's Fab/Mod field).
 */
export type DealerStockYearFilter='all'|'same'|'near1'|'near2';
export type DealerStockDescriptionFilter='family'|'exact';
export type DealerStockPriceBasis='price'|'purchase'|'cost';
export type DealerStockSort='match'|'priceAsc'|'priceDesc'|'daysDesc';
export type DealerStockViewOptions={
 modelYear:string;
 yearFilter:DealerStockYearFilter;
 descriptionFilter:DealerStockDescriptionFilter;
 priceBasis:DealerStockPriceBasis;
 minPrice:number|null;
 maxPrice:number|null;
 sort:DealerStockSort;
};
export const dealerStockModelYear=(year:string):string=>modelYear(year);

export function filterDealerFamilyStock(
 matches:readonly DealerFamilyMatch[],options:DealerStockViewOptions
):DealerFamilyMatch[]{
 const requested=Number(modelYear(options.modelYear));
 const maxYearDifference=options.yearFilter==='same'?0:
  options.yearFilter==='near1'?1:options.yearFilter==='near2'?2:null;
 const min=options.minPrice!==null&&Number.isFinite(options.minPrice)&&options.minPrice>=0?
  options.minPrice:null;
 const max=options.maxPrice!==null&&Number.isFinite(options.maxPrice)&&options.maxPrice>=0?
  options.maxPrice:null;
 if((maxYearDifference!==null&&!requested)||(min!==null&&max!==null&&min>max))return [];
 const filtered=matches.filter(match=>{
  if(options.descriptionFilter==='exact'&&!match.exactDescription)return false;
  if(maxYearDifference!==null){
   const rowYear=Number(modelYear(match.vehicle.year));
   if(!rowYear||Math.abs(rowYear-requested)>maxYearDifference)return false;
  }
  if(min!==null||max!==null){
   const value=match.vehicle[options.priceBasis];
   // Missing Dealer values are not zero-priced opportunities.
   if(!Number.isFinite(value)||value<=0)return false;
   if(min!==null&&value<min)return false;
   if(max!==null&&value>max)return false;
  }
  return true;
 });
 if(options.sort==='match')return filtered; // preserve plate/exact/year priority
 const usable=(value:number)=>Number.isFinite(value)&&value>0;
 return filtered.sort((a,b)=>{
  if(options.sort==='daysDesc')return b.vehicle.days-a.vehicle.days||
   a.vehicle.plate.localeCompare(b.vehicle.plate);
  const av=a.vehicle[options.priceBasis],bv=b.vehicle[options.priceBasis];
  // Blank prices always appear last, including when sorting descending.
  if(usable(av)!==usable(bv))return usable(av)?-1:1;
  if(!usable(av))return a.vehicle.plate.localeCompare(b.vehicle.plate);
  const difference=options.sort==='priceAsc'?av-bv:bv-av;
  return difference||a.vehicle.plate.localeCompare(b.vehicle.plate);
 });
}
