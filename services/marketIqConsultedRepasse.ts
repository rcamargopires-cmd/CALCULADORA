/**
 * Repasse Sob Consulta - preview-only operating model.
 * No tax determination, credit, vehicle purchase, manager approval or external
 * offer verification occurs here. Only user-entered phone/WhatsApp offers.
 * Browser-local records are NOT an authoritative audit log.
 */
export type OfferStatus = 'cotada' | 'confirmada' | 'retirada';
export type OfferChannel = 'telefone' | 'whatsapp' | 'outro';
export type MarginMode = 'reais' | 'percentual';
export type CaseState = 'consulta' | 'negociacao' | 'arquivado';
export type ConsultedVehicle = {
  plate: string;
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
export type ConsultedCase = {
  id: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  vehicle: ConsultedVehicle;
  offers: ConsultedOffer[];
  costs: ConsultedCosts;
  selectedOfferId: string;
  proposedBuy: string;
  state: CaseState;
  events: ConsultedEvent[];
};

export const emptyConsultedCosts = (): ConsultedCosts => ({
  invoice: '', taxesFixed: '', taxesPercent: '',
  transport: '', preparation: '', other: '',
  marginMode: 'reais', margin: '',
});
export const emptyConsultedVehicle = (): ConsultedVehicle => ({
  plate: '',brand: '',model: '',year: '',km: '',fipe: 0,
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
export const consultedFinancialInputsReady = (costs: ConsultedCosts) =>
  costs.invoice.trim() !== '' &&
  costs.margin.trim() !== '' &&
  (costs.taxesFixed.trim() !== '' || costs.taxesPercent.trim() !== '') &&
  (['invoice','taxesFixed','taxesPercent','transport','preparation','other','margin'] as const)
    .every(key=>moneyNumber(costs[key])>=0) &&
  moneyNumber(costs.taxesPercent)<=100 &&
  (costs.marginMode!=='percentual'||moneyNumber(costs.margin)<=100);
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
  if(!before) changes.push('Nova consulta de repasse registrada.');
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
    'Maior oferta confirmada R$','Teto líquido sugerido R$','Compra proposta R$','Margem estimada R$','NF R$',
    'Imposto fixo R$','Imposto %','Transporte R$','Preparação R$','Outras despesas R$',
    'Margem desejada','Modo margem','Último responsável','Quantidade eventos'];
  const items=rows.map(r=>{
    const best=chooseBestConfirmedOffer(r.offers,r.costs);
    const selected=consultedFinancialInputsReady(r.costs)?r.offers.find(o=>o.id===r.selectedOfferId&&offerIsEligible(o)):undefined;
    const active=selected?{offer:selected,calculation:calculateConsultedOffer(selected,r.costs)}:best;
    const proposed=moneyNumber(r.proposedBuy);
    return [
      (r.vehicle.brand+' '+r.vehicle.model).trim(),r.vehicle.year,r.vehicle.km,r.state,
      String(r.version),r.updatedAt,String(r.offers.length),
      String(r.offers.filter(o=>offerIsEligible(o)).length),
      String(active?.calculation.sale||''),String(active?.calculation.ceiling||''),
      r.proposedBuy,active&&proposed>0?String(cents(active.calculation.netBeforeMargin-proposed)):'',
      r.costs.invoice,r.costs.taxesFixed,r.costs.taxesPercent,r.costs.transport,
      r.costs.preparation,r.costs.other,r.costs.margin,r.costs.marginMode,
      r.events[r.events.length-1]?.actor||'',String(r.events.length),
    ];
  });
  const quote=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""')+'"';
  return '\ufeff'+[head,...items].map(row=>row.map(quote).join(';')).join('\r\n');
};
export const exportConsultedLogCsv = (rows:ConsultedCase[]) => {
  const head=['Veículo','Caso','Evento','Data/hora','Responsável','Tipo','Teto anterior','Novo teto','Descrição da alteração'];
  const items=rows.flatMap(r=>r.events.flatMap((ev,i)=>ev.changes.map(change=>
    [(r.vehicle.brand+' '+r.vehicle.model).trim(),r.id,String(i+1),ev.at,ev.actor,ev.action,
      ev.formerSuggestedCeiling??'',ev.newSuggestedCeiling??'',change])));
  const quote=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""')+'"';
  return '\ufeff'+[head,...items].map(row=>row.map(quote).join(';')).join('\r\n');
};
