/**
 * MarketIQ · manager exception approval model.
 * This is a business-state machine. Firestore authorization is enforced
 * separately by rules; client checks never confer privileges.
 * Browser-local demo decisions must never be treated as genuine approvals.
 */
import {
  calculateConsultedOffer,consultedFinancialInputsReady,makeConsultedId,moneyNumber,
  offerIsEligible, type ConsultedCase,type ConsultedOffer
} from './marketIqConsultedRepasse';

export type ApprovalState='pending'|'approved'|'countered'|'rejected'|'cancelled';
export type ApprovalAction='submitted'|'approved'|'countered'|'rejected'|'cancelled';
export type ApprovalOrigin='repasse_consulta';
export type ApprovalActor={
  email:string;name:string;role:string;companyId:string;storeId:string;
};
export type ApprovalEvent={
  id:string;at:string;actorEmail:string;actorName:string;action:ApprovalAction;
  previousValue:number|null;value:number|null;reason:string;revision:number;
};
export type ManagerApproval={
  id:string;
  origin:ApprovalOrigin;sourceCaseId:string;sourceCaseVersion:number;
  companyId:string;storeId:string;
  vehicle:{brand:string;model:string;year:string;km:string};
  outlet:{name:string;offer:number;validUntil:string};
  costSnapshot:{
    invoice:number;taxesFixed:number;taxesPercent:number;transport:number;
    preparation:number;other:number;marginMode:'reais'|'percentual';margin:number;
  };
  createdAt:string;updatedAt:string;
  requesterEmail:string;requesterName:string;
  suggestedCeiling:number;requestedBuy:number;requestReason:string;
  status:ApprovalState;revision:number;decidedByEmail?:string;decidedByName?:string;
  decidedAt?:string;decidedBuy?:number;decisionReason?:string;events:ApprovalEvent[];
  demoOnly:boolean;
};
export type ApprovalDecision='approved'|'countered'|'rejected';

const sumRounded=(number:number)=>Math.round(number*100)/100;
export const normalizedEmail=(email:string)=>String(email||'').trim().toLowerCase();
const positive=(v:number)=>Number.isFinite(v)&&v>0&&v<=2000000;
export const canManagerApprove=(actor:ApprovalActor,req:ManagerApproval)=>{
 const role=['manager','admin'].includes(actor.role);
 const email=normalizedEmail(actor.email);
 const sameCompany=actor.companyId===req.companyId;
 const storeScope=actor.storeId===req.storeId||actor.role==='admin';
 return role&&Boolean(email)&&email!==normalizedEmail(req.requesterEmail)&&sameCompany&&storeScope;
};
export const isApprovalApplicable=(req:ManagerApproval,source:ConsultedCase)=>{
 if(req.origin!=='repasse_consulta'||req.sourceCaseId!==source.id||
    req.sourceCaseVersion!==source.version||source.state==='arquivado')return false;
 if(req.status!=='approved'||!positive(req.decidedBuy||0))return false;
 if(!consultedFinancialInputsReady(source.costs))return false;
 if(sumRounded(moneyNumber(source.proposedBuy))!==sumRounded(req.requestedBuy))return false;
 const option=source.offers.find(o=>o.buyer===req.outlet.name&&
   moneyNumber(o.value)===req.outlet.offer&&o.validUntil===req.outlet.validUntil);
 if(!option||!offerIsEligible(option))return false;
 const calculation=calculateConsultedOffer(option,source.costs);
 return sumRounded(calculation.ceiling)===sumRounded(req.suggestedCeiling);
};
export const newApprovalFromConsultedCase=(
 source:ConsultedCase,actor:ApprovalActor,reason:string,demoOnly=true,
):ManagerApproval=>{
 if(source.version<1)throw Error('Salve a consulta antes de solicitar aprovação.');
 if(source.state==='arquivado')throw Error('Reative a consulta antes de pedir autorização.');
 if(!actor.companyId||!actor.storeId||!normalizedEmail(actor.email))
   throw Error('Não foi possível identificar empresa, loja e operador.');
 if(!consultedFinancialInputsReady(source.costs))
   throw Error('Preencha NF, impostos e margem antes de solicitar aprovação.');
 const offer=selectedOfferForRequest(source);
 if(!offer)throw Error('Não há oferta válida e confirmada por uma loja.');
 const calculation=calculateConsultedOffer(offer,source.costs);
 const amount=sumRounded(moneyNumber(source.proposedBuy));
 if(!positive(amount))throw Error('Informe o valor proposto para compra.');
 if(!String(reason||'').trim())throw Error('Escreva a justificativa para revisão gerencial.');
 if(String(reason).trim().length>600)throw Error('A justificativa deve ter no máximo 600 caracteres.');
 const at=new Date().toISOString();
 const req:ManagerApproval={
  id:makeConsultedId(),origin:'repasse_consulta',
  sourceCaseId:source.id,sourceCaseVersion:source.version,
  companyId:actor.companyId,storeId:actor.storeId,
  vehicle:{
    brand:source.vehicle.brand.trim(),model:source.vehicle.model.trim(),
    year:source.vehicle.year.trim(),km:String(source.vehicle.km).trim()
  },
  outlet:{name:offer.buyer.trim(),offer:moneyNumber(offer.value),validUntil:offer.validUntil},
  costSnapshot:{
    invoice:moneyNumber(source.costs.invoice),
    taxesFixed:moneyNumber(source.costs.taxesFixed),
    taxesPercent:moneyNumber(source.costs.taxesPercent),
    transport:moneyNumber(source.costs.transport),
    preparation:moneyNumber(source.costs.preparation),
    other:moneyNumber(source.costs.other),
    marginMode:source.costs.marginMode,
    margin:moneyNumber(source.costs.margin),
  },
  createdAt:at,updatedAt:at,
  requesterEmail:normalizedEmail(actor.email),requesterName:actor.name||actor.email,
  suggestedCeiling:sumRounded(calculation.ceiling),requestedBuy:amount,
  requestReason:String(reason).trim(),status:'pending',revision:1,demoOnly,events:[
    {id:makeConsultedId(),at,actorEmail:normalizedEmail(actor.email),
     actorName:actor.name||actor.email,action:'submitted',previousValue:sumRounded(calculation.ceiling),
     value:amount,reason:String(reason).trim(),revision:1}
  ]
 };
 return req;
};
export const selectedOfferForRequest=(source:ConsultedCase):ConsultedOffer|null=>{
 const selected=source.offers.find(o=>o.id===source.selectedOfferId&&offerIsEligible(o));
 if(selected)return selected;
 const candidates=source.offers.filter(o=>offerIsEligible(o))
   .map(o=>({offer:o,ceiling:calculateConsultedOffer(o,source.costs).ceiling}))
   .sort((a,b)=>b.ceiling-a.ceiling);
 return candidates[0]?.offer||null;
};
export const applyManagerDecision=(
 before:ManagerApproval, actor:ApprovalActor,
 action:ApprovalDecision,decidedBuy:number|null,reason:string,
):ManagerApproval=>{
 if(before.status!=='pending')throw Error('Essa solicitação já recebeu uma decisão. Abra outra solicitação para revisá-la.');
 if(!canManagerApprove(actor,before))throw Error('Somente um gerente autorizado de outra conta pode decidir.');
 if(!reason.trim()||reason.trim().length>600)throw Error('Informe uma justificativa de até 600 caracteres.');
 const value=action==='rejected'?null:sumRounded(Number(decidedBuy));
 if(action!=='rejected'&&!positive(value as number))throw Error('Informe um valor de decisão válido.');
 if(action==='countered'&&value===before.requestedBuy)
   throw Error('A contraproposta precisa ter valor diferente do solicitado.');
 const at=new Date().toISOString();
 return {
  ...before,
  status:action,revision:before.revision+1,updatedAt:at,
  decidedAt:at,decidedByEmail:normalizedEmail(actor.email),
  decidedByName:actor.name||actor.email,decidedBuy:value??undefined,
  decisionReason:reason.trim(),
  events:[...before.events,{
   id:makeConsultedId(),at,actorEmail:normalizedEmail(actor.email),
   actorName:actor.name||actor.email,action,
   previousValue:before.requestedBuy,value,reason:reason.trim(),
   revision:before.revision+1,
  }]
 };
};
export const cancelPendingApproval=(before:ManagerApproval,actor:ApprovalActor,reason:string):ManagerApproval=>{
 if(before.status!=='pending')throw Error('Apenas solicitações pendentes podem ser canceladas.');
 if(normalizedEmail(actor.email)!==normalizedEmail(before.requesterEmail))
   throw Error('Somente quem solicitou pode cancelar antes da decisão.');
 if(!reason.trim())throw Error('Informe o motivo do cancelamento.');
 const at=new Date().toISOString();
 return {...before,status:'cancelled',revision:before.revision+1,updatedAt:at,
  decisionReason:reason.trim(),events:[...before.events,{
   id:makeConsultedId(),at,actorEmail:normalizedEmail(actor.email),actorName:actor.name||actor.email,
   action:'cancelled',previousValue:before.requestedBuy,value:null,
   reason:reason.trim(),revision:before.revision+1
  }]
 };
};
export const requestStoreKey=(email:string)=>
 'motyq-iq-approval-preview-local-v1-'+normalizedEmail(email);
export const getLocalApprovalRequests=(email:string):ManagerApproval[]=>{
 try{
  const records=JSON.parse(localStorage.getItem(requestStoreKey(email))||'[]');
  return Array.isArray(records)?records.filter((x:any)=>x&&x.id&&x.demoOnly&&Array.isArray(x.events)).slice(0,300):[];
 }catch{return [];}
};
export const writeLocalApprovalRequests=(email:string,items:ManagerApproval[])=>{
 localStorage.setItem(requestStoreKey(email),JSON.stringify(items.slice(0,300)));
 window.dispatchEvent(new CustomEvent('motyq:approvals-local-saved'));
};
export const upsertLocalApproval=(email:string,item:ManagerApproval)=>{
 const current=getLocalApprovalRequests(email);
 writeLocalApprovalRequests(email,[item,...current.filter(x=>x.id!==item.id)]);
};
export const fakeManagerActor=(source:ApprovalActor):ApprovalActor=>({
 email:'gerente.demo@motyq.invalid',
 name:'Gerente de demonstração',role:'manager',companyId:source.companyId,storeId:source.storeId
});
export const exportApprovalsCsv=(requests:ManagerApproval[])=>{
 const headers=['Protocolo','Data da solicitação','Veículo','Loja','Status','Modo teste',
   'Oferta de revenda R$','Teto técnico R$','Solicitação R$','Valor gerente R$',
   'Diferença gerente x teto R$','Motivo Mesa','Motivo Gerente','Solicitante',
   'Responsável decisão','Data decisão','Versão','Eventos'];
 const quote=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const rows=requests.map(req=>[
   req.id,req.createdAt,[req.vehicle.brand,req.vehicle.model,req.vehicle.year].join(' '),
   req.storeId,req.status,req.demoOnly?'SIM':'NÃO',
   req.outlet.offer,req.suggestedCeiling,req.requestedBuy,req.decidedBuy||'',
   typeof req.decidedBuy==='number'?sumRounded(req.decidedBuy-req.suggestedCeiling):'',
   req.requestReason,req.decisionReason||'',req.requesterName,req.decidedByName||'',
   req.decidedAt||'',req.revision,req.events.length
 ]);
 return '\ufeff'+[headers,...rows].map(row=>row.map(quote).join(';')).join('\r\n');
};
export const exportApprovalEventsCsv=(requests:ManagerApproval[])=>{
 const headers=['Protocolo','Carro','Data do evento','Ação','Versão','Responsável','Antes R$','Depois R$','Justificativa','Modo teste'];
 const quote=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const rows=requests.flatMap(req=>req.events.map(e=>[
   req.id,req.vehicle.brand+' '+req.vehicle.model,e.at,e.action,e.revision,
   e.actorName,e.previousValue??'',e.value??'',e.reason,req.demoOnly?'SIM':'NÃO'
 ]));
 return '\ufeff'+[headers,...rows].map(row=>row.map(quote).join(';')).join('\r\n');
};
