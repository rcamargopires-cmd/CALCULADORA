import type {DealerStockSnapshot,DealerStockVehicle} from './marketIqDealerRadar';

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
const fold=(raw:string)=>String(raw||'').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toUpperCase()
 .replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const manufacturer=(raw:string)=>{
 const text=fold(raw);
 if(/^(?:GM|CHEVROLET)(?:\s+CHEVROLET|\s+GM)?$/.test(text))return 'CHEVROLET';
 if(text==='VW'||text==='VOLKSWAGEN'||text==='VW VOLKSWAGEN')return 'VOLKSWAGEN';
 return text;
};
const normalizedModel=(brand:string,raw:string)=>{
 let value=fold(raw)
  .replace(/^I\s+VW\s+/,'')
  .replace(/^(?:VW|VOLKSWAGEN|CHEVROLET|GM|HYUNDAI|TOYOTA|FORD|FIAT|JEEP|RENAULT|NISSAN|HONDA)\s+/,'');
 if(manufacturer(brand)==='VOLKSWAGEN')value=value.replace(/^TCROSS\b/,'T CROSS').replace(/^TROC\b/,'T ROC');
 // Dealer V44 names a single Creta family as CRETA, NEW CRETA and NOVO CRETA.
 // Scope aliases to Hyundai Creta only: NEW is a real name in other families.
 if(manufacturer(brand)==='HYUNDAI')
  value=value.replace(/^(?:NEW|NOVO)\s+(?=CRETA(?:\s|$))/,'');
 value=value.replace(/^ECO SPORT\b/,'ECOSPORT');
 return value;
};
/** Family is intentionally distinct from version: T-Cross Sense and
 * T-Cross Comfortline can share a family while keeping their real trims.
 */
export const dealerModelFamily=(brand:string,model:string):string=>{
 const name=normalizedModel(brand,model);
 if(!name)return '';
 if(/^T CROSS(?:\s|$)/.test(name))return 'T-CROSS';
 if(/^T ROC(?:\s|$)/.test(name))return 'T-ROC';
 if(/^COROLLA CROSS(?:\s|$)/.test(name))return 'COROLLA CROSS';
 if(/^ECOSPORT(?:\s|$)/.test(name))return 'ECOSPORT';
 if(/^HB20S(?:\s|$)/.test(name))return 'HB20S';
 if(/^HB20(?:\s|$)/.test(name))return 'HB20';
 // Dealer exports one abbreviated Creta as CRETA1TA COMFORT.
 // Treat it as family Creta, but retain its exact description for verification.
 if(manufacturer(brand)==='HYUNDAI'&&/^CRETA1TA(?:\s|$)/.test(name))return 'CRETA';
 // Motorcycle model families can have two-character names such as CG.
 if(/^CG\s+\d{2,4}(?:\s|$)/.test(name))return 'CG';
 const first=name.split(' ')[0]||'';
 return first.length>=3?first:'';
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
 const wantedBrand=manufacturer(brand);
 const family=dealerModelFamily(brand,model);
 if(!snapshot||!wantedBrand||!family)return null;
 const wantYear=modelYear(year),wantPlate=normalizedPlate(plate);
 const targetDescription=normalizedModel(brand,model);
 const matches=snapshot.vehicles
  .filter(row=>row.vehicleType===vehicleType&&manufacturer(row.brand)===wantedBrand&&
    dealerModelFamily(row.brand,row.model)===family)
  .map(vehicle=>({
   vehicle,
   samePlate:Boolean(wantPlate)&&normalizedPlate(vehicle.plate)===wantPlate,
   sameYear:Boolean(wantYear)&&modelYear(vehicle.year)===wantYear,
   exactDescription:normalizedModel(vehicle.brand,vehicle.model)===targetDescription
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
