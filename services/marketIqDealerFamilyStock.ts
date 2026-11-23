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
