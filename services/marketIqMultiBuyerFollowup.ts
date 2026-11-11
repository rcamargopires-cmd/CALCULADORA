/** Pure helpers for a single vehicle's multi-buyer quotation follow-up. */
import type {ConsultedCase,ConsultedVehicle,ConsultedOffer} from './marketIqConsultedRepasse';
import {moneyNumber,offerIsEligible} from './marketIqConsultedRepasse';
const norm=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim().replace(/\s+/g,' ');
export const sameQuotedVehicle=(a:ConsultedVehicle,b:ConsultedVehicle)=>{
 const plateA=norm(a.plate).replace(/[^A-Z0-9]/g,'');
 const plateB=norm(b.plate).replace(/[^A-Z0-9]/g,'');
 if(plateA&&plateB)return plateA===plateB;
 // Never join cases with different known plates.
 if(plateA||plateB)return false;
 return !!norm(a.brand)&&!!norm(a.model)&&!!norm(a.year)&&
   norm(a.brand)===norm(b.brand)&&norm(a.model)===norm(b.model)&&
   norm(a.year)===norm(b.year)&&norm(a.km)===norm(b.km);
};
export const findActiveQuotation=(cases:ConsultedCase[],vehicle:ConsultedVehicle)=>
 cases.filter(c=>c.state!=='arquivado'&&c.state!=='vendido'&&sameQuotedVehicle(c.vehicle,vehicle))
 .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]||null;
export const confirmedBuyerQuotes=(offers:ConsultedOffer[]) =>
 offers.filter(o=>offerIsEligible(o)).map(o=>({buyer:o.buyer,value:moneyNumber(o.value),validUntil:o.validUntil}))
 .sort((a,b)=>b.value-a.value||a.buyer.localeCompare(b.buyer,'pt-BR'));
