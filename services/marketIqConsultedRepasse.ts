/**
 * Cotação Mesa - browser-local operating model.
 * No tax determination, credit, vehicle purchase, manager approval or external
 * offer verification occurs here. Only user-entered phone/WhatsApp offers.
 * Browser-local records are NOT an authoritative audit log.
 */
export type OfferStatus = 'cotada' | 'confirmada' | 'retirada';
export type OfferChannel = 'telefone' | 'whatsapp' | 'outro';
export type MarginMode = 'reais' | 'percentual';
export type CaseState = 'consulta' | 'negociacao' | 'vendido' | 'arquivado';
export type ConsultedVehicle = {
  plate: string;
  vehicleType?: 'car'|'motorcycle';
  brand: string;
  model: string;
  year: string;
  km: string;
  fipe: number;
};
export type ConsultedOffer = {
  id: string;
  buyer: string;
  value: string;
  channel: OfferChannel;
  status: OfferStatus;
  receivedAt: string;
  validUntil: string;
  note: string;
};
export type ConsultedCosts = {
  invoice: string;
  taxesFixed: string;
  taxesPercent: string;
  transport: string;
  preparation: string;
  other: string;
  marginMode: MarginMode;
  margin: string;
};
export type ConsultedEvent = {
  id: string;
  at: string;
  actor: string;
  action: 'criado' | 'atualizado' | 'arquivado' | 'reativado';
  changes: string[];
  formerSuggestedCeiling: number | null;
  newSuggestedCeiling: number | null;
};
/** Operator-recorded sale, NOT a bank/payment gateway confirmation. */
export type ConsultedSale={
 buyer:string;offerId:string;finalValue:number;closedAt:string;
 paymentReceived:boolean;registeredBy:string;
};
export type ConsultedOutreach={
 buyerId:string;buyer:string;preparedAt:string;
 status:'preparado'|'contatado'|'respondeu'|'recusou';
};
export type ConsultedCase = {
  id: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  vehicle: ConsultedVehicle;
  offers: ConsultedOffer[];
  requests?:ConsultedOutreach[];
  costs: ConsultedCosts;
  selectedOfferId: string;
  proposedBuy: string;
  state: CaseState;
  sale?:ConsultedSale|null;
  events: ConsultedEvent[];
};

export const emptyConsultedCosts = (): ConsultedCosts => ({
  invoice: '', taxesFixed: '', taxesPercent: '',
  transport: '', preparation: '', other: '',
  marginMode: 'reais', margin: '',
});
export const emptyConsultedVehicle = (): ConsultedVehicle => ({
  plate: '',vehicleType:'car',brand: '',model: '',year: '',km: '',fipe: 0,
});
export const emptyConsultedOffer = (): ConsultedOffer => ({
  id: makeConsultedId(),buyer: '',value: '',channel: 'telefone',
  status: 'cotada',receivedAt: new Date().toISOString().slice(0,10),
  validUntil: '',note: '',
});
export const moneyNumber = (v: string | number | null | undefined): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const source = String(v ?? '').trim().replace(/R\$/gi,'').replace(/\s/g,'');
  const value = Number(source.includes(',') ? source.replace(/\./g,'').replace(',','.') : source.replace(/(?<=\d)\.(?=\d{3}(?:$|\D))/g,''));
  return Number.isFinite(value) ? value : 0;
};
const cents = (v: number) => Math.round(v * 100) / 100;
const clamp=(v:number,l:number,h:number)=>Math.min(h,Math.max(l,v));
export const formatReais = (v: number) => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const makeConsultedId = () => (
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)
);
export const offerIsEligible = (offer: ConsultedOffer, date = new Date().toISOString().slice(0,10)) =>
  offer.status === 'confirmada' &&
  offer.buyer.trim().length >= 2 &&
  moneyNumber(offer.value) > 0 &&
  offer.validUntil.length > 0 &&
  offer.validUntil >= date;

export const calculateConsultedOffer = (offer: ConsultedOffer, costs: ConsultedCosts) => {
  const sale = Math.max(0,moneyNumber(offer.value));
  const rate = clamp(moneyNumber(costs.taxesPercent),0,100);
  const taxesRate = cents(sale * rate / 100);
  const taxesFixed = Math.max(0,moneyNumber(costs.taxesFixed));
  const invoice = Math.max(0,moneyNumber(costs.invoice));
  const transport = Math.max(0,moneyNumber(costs.transport));
  const preparation = Math.max(0,moneyNumber(costs.preparation));
  const other = Math.max(0,moneyNumber(costs.other));
  const expenses = cents(taxesRate+taxesFixed+invoice+transport+preparation+other);
  const margin = costs.marginMode === 'percentual'
    ? cents(sale*clamp(moneyNumber(costs.margin),0,100)/100)
    : Math.max(0,moneyNumber(costs.margin));
  const ceiling = cents(sale-expenses-margin);
  return {sale,taxesRate,expenses,margin,ceiling,
    netBeforeMargin:cents(sale-expenses)};
};
// Reject non-numeric text instead of interpreting an invalid entry as zero.
export const isValidConsultedMoney = (input:string,allowEmpty=true) => {
  const value=String(input??'').trim().replace(/R\$/gi,'').replace(/\s/g,'');
  return value===''?allowEmpty:/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:[,.]\d{1,2})?$/.test(value);
};
export const consultedCostInputsValid = (costs:ConsultedCosts) =>
  (['invoice','taxesFixed','taxesPercent','transport','preparation','other','margin'] as const)
    .every(key=>isValidConsultedMoney(costs[key])&&moneyNumber(costs[key])>=0) &&
  moneyNumber(costs.taxesPercent)<=100 &&
  (costs.marginMode!=='percentual'||moneyNumber(costs.margin)<=100);
export const consultedFinancialInputsReady = (costs: ConsultedCosts) =>
  costs.invoice.trim() !== '' &&
  costs.margin.trim() !== '' &&
  (costs.taxesFixed.trim() !== '' || costs.taxesPercent.trim() !== '') &&
  consultedCostInputsValid(costs);
export const chooseBestConfirmedOffer = (offers: ConsultedOffer[], costs: ConsultedCosts) => {
  // No ceiling for managerial reports until the desk explicitly filled
  // invoice cost, a fiscal assumption and a case-specific target margin.
  if (!consultedFinancialInputsReady(costs)) return null;
  const ranked = offers.filter(x=>offerIsEligible(x))
    .map(offer=>({offer,calculation:calculateConsultedOffer(offer,costs)}))
    .filter(x=>x.calculation.ceiling > 0)
    .sort((a,b)=>b.calculation.ceiling-a.calculation.ceiling);
  return ranked[0] ?? null;
};
export const caseStorageKey = (email:string) =>
  'motyq-iq-repasse-consulta-preview-v1-'+email.toLowerCase().trim();
export const loadConsultedCases = (email:string):ConsultedCase[] => {
  try {
    const rows = JSON.parse(localStorage.getItem(caseStorageKey(email)) || '[]');
    if (!Array.isArray(rows)) return [];
    return rows.filter((r:any)=>r && typeof r.id === 'string' && Array.isArray(r.offers) &&
      Array.isArray(r.events) && r.vehicle && r.costs).slice(0,300);
  } catch{return [];}
};
export const saveConsultedCases = (email:string, rows:ConsultedCase[]) => {
  // Cross-tab event "storage" fires naturally; also notify same-tab dashboard.
  localStorage.setItem(caseStorageKey(email),JSON.stringify(rows.slice(0,300)));
  window.dispatchEvent(new CustomEvent('motyq:repasse-consulta-saved'));
};
const describe=(label:string,a:unknown,b:unknown)=>{
  if (JSON.stringify(a)===JSON.stringify(b)) return '';
  return label+': '+String(a ?? '—')+' → '+String(b ?? '—');
};
export const appendConsultedAudit = (before:ConsultedCase|null, next:ConsultedCase, actor:string):ConsultedCase => {
  const bestBefore=before?chooseBestConfirmedOffer(before.offers,before.costs):null;
  const bestAfter=chooseBestConfirmedOffer(next.offers,next.costs);
  const changes:string[]=[];
  if(!before) changes.push('Nova cotação Mesa registrada.');
  else {
    const fields:[string,unknown,unknown][]=[
      ['Veículo',before.vehicle.brand+' '+before.vehicle.model,next.vehicle.brand+' '+next.vehicle.model],
      ['Placa',before.vehicle.plate,next.vehicle.plate],
      ['Ano',before.vehicle.year,next.vehicle.year],
      ['KM',before.vehicle.km,next.vehicle.km],
      ['FIPE',before.vehicle.fipe,next.vehicle.fipe],
      ['Custos de nota fiscal',before.costs.invoice,next.costs.invoice],
      ['Impostos em reais',before.costs.taxesFixed,next.costs.taxesFixed],
      ['Impostos percentuais',before.costs.taxesPercent,next.costs.taxesPercent],
      ['Transporte',before.costs.transport,next.costs.transport],
      ['Preparo',before.costs.preparation,next.costs.preparation],
      ['Outros custos',before.costs.other,next.costs.other],
      ['Forma da margem',before.costs.marginMode,next.costs.marginMode],
      ['Margem desejada',before.costs.margin,next.costs.margin],
      ['Valor proposto à compra',before.proposedBuy,next.proposedBuy],
      ['Oferta selecionada',before.selectedOfferId,next.selectedOfferId],
      ['Situação',before.state,next.state],
      ['Fechamento de venda',before.sale||null,next.sale||null],
      ['Lojistas consultados',before.requests||[],next.requests||[]],
    ];
    fields.forEach(([label,a,b])=>{const item=describe(label,a,b);if(item)changes.push(item);});
    const prior=new Map(before.offers.map(o=>[o.id,o]));
    for(const offer of next.offers){
      const old=prior.get(offer.id);
      if(!old){changes.push('Oferta adicionada: '+offer.buyer+' ('+formatReais(moneyNumber(offer.value))+')');continue;}
      if(JSON.stringify(old)!==JSON.stringify(offer)){
        changes.push('Oferta '+(offer.buyer||old.buyer)+': '+formatReais(moneyNumber(old.value))+
          ' → '+formatReais(moneyNumber(offer.value))+'; '+old.status+' → '+offer.status+
          '; validade '+(old.validUntil||'não informada')+' → '+(offer.validUntil||'não informada'));
      }
      prior.delete(offer.id);
    }
    prior.forEach(o=>changes.push('Oferta removida: '+o.buyer+' ('+formatReais(moneyNumber(o.value))+')'));
  }
  if(changes.length===0)changes.push('Consulta salva sem alteração de valores.');
  return {
    ...next,
    createdAt:before?.createdAt||next.createdAt,
    updatedAt:new Date().toISOString(),
    version:(before?.version||0)+1,
    events:[...(before?.events||[]),{
      id:makeConsultedId(),at:new Date().toISOString(),
      actor,action:before?next.state==='arquivado'&&before.state!=='arquivado'?'arquivado':
        before.state==='arquivado'&&next.state!=='arquivado'?'reativado':'atualizado':'criado',
      changes,
      formerSuggestedCeiling:bestBefore?.calculation.ceiling??null,
      newSuggestedCeiling:bestAfter?.calculation.ceiling??null,
    }],
  };
};
export const exportConsultedReportCsv = (rows:ConsultedCase[]) => {
 const head=['Veículo','Ano','KM','Situação','Versão','Data última alteração','Ofertas','Ofertas confirmadas válidas',
  'Maior oferta confirmada (reais)','Teto líquido sugerido (reais)','Compra proposta (reais)','Margem estimada (reais)',
  'NF (reais)','Imposto fixo (reais)','Imposto percentual','Transporte (reais)','Preparação (reais)','Outras despesas (reais)',
  'Margem desejada','Modo margem','Último responsável','Quantidade eventos',
  'Loja compradora no fechamento','Valor fechado (reais)','Data do fechamento',
  'Pagamento recebido conforme informado','Responsável pelo fechamento'];
 const items=rows.map(row=>{
  const best=chooseBestConfirmedOffer(row.offers,row.costs);
  const picked=consultedFinancialInputsReady(row.costs)?
   row.offers.find(offer=>offer.id===row.selectedOfferId&&offerIsEligible(offer)):undefined;
  const active=picked?{offer:picked,calculation:calculateConsultedOffer(picked,row.costs)}:best;
  const proposed=moneyNumber(row.proposedBuy);
  return [
   (row.vehicle.brand+' '+row.vehicle.model).trim(),row.vehicle.year,row.vehicle.km,row.state,
   String(row.version),row.updatedAt,String(row.offers.length),
   String(row.offers.filter(offer=>offerIsEligible(offer)).length),
   String(active?.calculation.sale||''),String(active?.calculation.ceiling||''),
   row.proposedBuy,active&&proposed>0?String(cents(active.calculation.netBeforeMargin-proposed)):'',
   row.costs.invoice,row.costs.taxesFixed,row.costs.taxesPercent,row.costs.transport,
   row.costs.preparation,row.costs.other,row.costs.margin,row.costs.marginMode,
   row.events[row.events.length-1]?.actor||'',String(row.events.length),
   row.sale?.buyer||'',row.sale?String(row.sale.finalValue):'',row.sale?.closedAt||'',
   row.sale?.paymentReceived?'SIM':'NÃO',row.sale?.registeredBy||''
  ];
 });
 const quote=(value:unknown)=>'"'+String(value??'').replace(/"/g,'""')+'"';
 return '\ufeff'+[head,...items].map(row=>row.map(quote).join(';')).join('\r\n');
};
export const exportConsultedLogCsv = (rows:ConsultedCase[]) => {
 const head=['Veículo','Caso','Evento','Data/hora','Responsável','Tipo','Teto anterior','Novo teto','Descrição da alteração'];
 const items=rows.flatMap(row=>row.events.flatMap((ev,i)=>ev.changes.map(change=>
  [(row.vehicle.brand+' '+row.vehicle.model).trim(),row.id,String(i+1),ev.at,ev.actor,ev.action,
   ev.formerSuggestedCeiling??'',ev.newSuggestedCeiling??'',change])));
 const quote=(value:unknown)=>'"'+String(value??'').replace(/"/g,'""')+'"';
 return '\ufeff'+[head,...items].map(row=>row.map(quote).join(';')).join('\r\n');
};
