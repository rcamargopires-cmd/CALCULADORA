import {classifyByMileage,type FleetClass} from './marketIqFleetClassification';

/** Strategic purchase demand is distinct from the fleet's KM-based class and disposal policy. */
export type ExpressCommercialClass='SHOWROOM'|'NORMAL'|'REPASSE';
export type ExpressVehicleExtract={
 brand:string;model:string;yearManufacture:string;yearModel:string;km:number|null;
 plate:string;fipeReference:number|null;conditionScore:number|null;
 repairTotal:number|null;repairDetails:string[];warnings:string[];
};
export type ExpressSignals={
 demandConfirmed:boolean;stockZeroConfirmed:boolean;
 manualClass?:ExpressCommercialClass|null;manualReason?:string;
};
export type ExpressAssessment={
 priority:ExpressCommercialClass;source:'operator_override'|'operator_signals'|'default';
 reason:string;fleetClass:FleetClass|null;fleetGuideline:'SHOWROOM'|'REPASSE'|null;
 policyConflict:boolean;needsReview:boolean;
};
const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function cleanExpressVehicle(raw:any):ExpressVehicleExtract{
 const str=(value:unknown,max=160)=>String(value??'').trim().slice(0,max);
 const plate=str(raw?.plate,12).toUpperCase().replace(/[^A-Z0-9]/g,'');
 const year=(value:any)=>{const s=str(value,10);const match=s.match(/(?:19|20)\d{2}/);return match?match[0]:''};
 const km=finite(Number(raw?.km));const fipe=finite(Number(raw?.fipeReference));
 const score=finite(Number(raw?.conditionScore));const repairs=finite(Number(raw?.repairTotal));
 return {
  brand:str(raw?.brand,80),model:str(raw?.model,140),
  yearManufacture:year(raw?.yearManufacture),yearModel:year(raw?.yearModel),
  plate:/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)?plate:'',
  km:raw?.km!==null&&raw?.km!==undefined&&km!==null&&Number.isInteger(km)&&km>=0&&km<=999999?km:null,
  fipeReference:raw?.fipeReference!==null&&raw?.fipeReference!==undefined&&fipe!==null&&fipe>=0&&fipe<=20000000?fipe:null,
  conditionScore:raw?.conditionScore!==null&&raw?.conditionScore!==undefined&&score!==null&&score>=0&&score<=10?score:null,
  repairTotal:raw?.repairTotal!==null&&raw?.repairTotal!==undefined&&repairs!==null&&repairs>=0&&repairs<=2000000?repairs:null,
  repairDetails:Array.isArray(raw?.repairDetails)?raw.repairDetails.slice(0,8).map((v:any)=>str(v,140)).filter(Boolean):[],
  warnings:Array.isArray(raw?.warnings)?raw.warnings.slice(0,6).map((v:any)=>str(v,180)).filter(Boolean):[]
 };
}
export function assessExpressCommercial(v:ExpressVehicleExtract,signals:ExpressSignals):ExpressAssessment{
 const fleet=v.km===null?null:classifyByMileage(v.km);
 const valid=['SHOWROOM','NORMAL','REPASSE'];
 const forced=signals.manualClass&&valid.includes(signals.manualClass)?signals.manualClass:null;
 const recommended:ExpressCommercialClass=signals.demandConfirmed&&signals.stockZeroConfirmed?'SHOWROOM':'NORMAL';
 const priority=forced||recommended;
 const source=forced?'operator_override':recommended==='SHOWROOM'?'operator_signals':'default';
 const reasons:string[]=[];
 if(forced)reasons.push('Classificação alterada manualmente pela Mesa');
 if(signals.demandConfirmed)reasons.push('procura alta confirmada pela Mesa');
 if(signals.stockZeroConfirmed)reasons.push('ausência no estoque confirmada pela Mesa');
 if(!reasons.length)reasons.push('sem sinais comerciais confirmados');
 if(forced&&signals.manualReason?.trim())reasons.push(signals.manualReason.trim().slice(0,280));
 const policyConflict=priority==='SHOWROOM'&&fleet?.destination==='REPASSE';
 return {
  priority,source,reason:reasons.join('; '),
  fleetClass:fleet?.classification||null,fleetGuideline:fleet?.destination||null,
  policyConflict,
  needsReview:policyConflict||v.km===null||v.fipeReference===null||v.conditionScore!==null&&v.conditionScore<6
 };
}
