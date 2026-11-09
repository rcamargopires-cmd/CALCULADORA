/**
 * Motyq IQ · Parecer Inteligente da Mesa (decision support only).
 *
 * Favorable classification requires explicitly verified market, FIPE and
 * costs, a recent Dealer snapshot, and independent actual paid comparables.
 * Quotes, indexed ads, Dealer asking prices and archived assessments never
 * become proof of an executable sale or purchase.
 */
import {calculateMesaPurchaseCeiling} from './marketIqPurchaseRadar';

export type OpinionStatus='opportunity'|'negotiate'|'avoid'|'insufficient';
export type OpinionConfidence='alta'|'moderada'|'baixa'|'insuficiente';
export type OpinionInput={
 mode:'purchase'|'stock';
 verifiedMarketPrice:number|null;verifiedAds:number;
 offer:number|null;dealerCost:number|null;
 preparation:number;preparationConfirmed:boolean;repasse:boolean;
 fipeCurrent:boolean;fipeValue:number|null;
 snapshotAvailable:boolean;snapshotDate:string;
 familyCount:number;yearFamilyCount:number;over90Count:number;
 historyAvailable:boolean;historyLimited:boolean;
 paidCount:number|null;paidMedian:number|null;
 today?:string;
};
export type PurchaseOpinion={
 status:OpinionStatus;title:string;confidence:OpinionConfidence;
 rationale:string;reasons:string[];missing:string[];nextAction:string;
 verifiedCeiling:number|null;gapToCeiling:number|null;
 marketSupported:boolean;snapshotAgeDays:number|null;
 warning:string;
};
const valid=(v:number|null|undefined):v is number=>
 typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=20_000_000;
const pt=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',
 minimumFractionDigits:2,maximumFractionDigits:2});
function snapshotAge(date:string,today:string):number|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{4}-\d{2}-\d{2}$/.test(today))return null;
 const a=Date.parse(date+'T00:00:00Z'),b=Date.parse(today+'T00:00:00Z');
 if(!Number.isFinite(a)||!Number.isFinite(b))return null;
 const days=Math.floor((b-a)/86400000);
 return days>=0&&days<=730?days:null;
}
export function buildMesaPurchaseOpinion(input:OpinionInput):PurchaseOpinion{
 const marketSupported=input.verifiedAds>=2&&valid(input.verifiedMarketPrice);
 const verifiedCeiling=marketSupported?calculateMesaPurchaseCeiling(
  input.verifiedMarketPrice,input.mode==='stock'?0:Math.max(0,input.preparation),input.repasse):null;
 const paid=Number.isFinite(input.paidCount)?Math.max(0,input.paidCount||0):0;
 const hasOffer=valid(input.offer),hasDealerCost=valid(input.dealerCost);
 const costReady=input.mode==='stock'?hasDealerCost:input.preparationConfirmed;
 const proposed=input.mode==='stock'?input.dealerCost:input.offer;
 const gapToCeiling=valid(proposed)&&verifiedCeiling!==null?
  Math.round((proposed-verifiedCeiling)*100)/100:null;
 const age=snapshotAge(input.snapshotDate,input.today||new Date().toISOString().slice(0,10));
 const recentStock=input.snapshotAvailable&&age!==null&&age<=14;
 const pressure=input.over90Count>=2||
   input.yearFamilyCount>=4&&input.over90Count>=1||
   input.familyCount>=7;
 const missing:string[]=[];
 if(!marketSupported)missing.push('Conferir ao menos dois anúncios individuais Webmotors da versão, ano e KM compatíveis.');
 if(input.mode==='purchase'&&!hasOffer)missing.push('Informar quanto pretende pagar por este veículo.');
 if(input.mode==='purchase'&&!input.preparationConfirmed)missing.push('Confirmar o preparo previsto, mesmo que o custo seja zero.');
 if(input.mode==='stock'&&!hasDealerCost)missing.push('Conferir o Valor Custo real do veículo no Dealer.');
 if(!input.fipeCurrent||!valid(input.fipeValue))missing.push('Validar FIPE vigente da versão e ano-modelo exatos.');
 if(!input.snapshotAvailable)missing.push('Carregar a fotografia do estoque Dealer no Radar.');
 else if(!recentStock)missing.push('Atualizar a fotografia do Dealer (até 14 dias de idade).');
 if(!input.historyAvailable)missing.push('Consultar o histórico autorizado de compras confirmadas.');
 else if(input.historyLimited)missing.push('Completar a consulta histórica parcial antes de concluir.');
 else if(paid<3)missing.push('Amostra pequena: são necessárias três compras independentes comparáveis para um parecer favorável.');
 const reasons:string[]=[];
 if(marketSupported)reasons.push(input.verifiedAds+' anúncio(s) Webmotors individual(is) conferido(s). Preço médio anunciado: '+pt(input.verifiedMarketPrice!)+'.');
 if(verifiedCeiling!==null)reasons.push('Teto hipotético comercial: '+pt(verifiedCeiling)+
  ' (mercado × 0,86'+(input.repasse?' × 0,95':'')+' − preparo informado).');
 if(gapToCeiling!==null){
  if(gapToCeiling>0)reasons.push('Valor proposto ou custo do Dealer excede o teto simulado em '+pt(gapToCeiling)+'.');
  else reasons.push('Valor proposto ou custo do Dealer fica '+pt(-gapToCeiling)+' abaixo do teto simulado.');
 }
 if(recentStock)reasons.push('Estoque Dealer atualizado há '+age+' dia(s); família '+input.familyCount+
  ' veículo(s), '+input.yearFamilyCount+' do mesmo ano-modelo.');
 if(pressure)reasons.push('Pressão de estoque: família numerosa ou veículos do ano-modelo acima de 90 dias. Conferir versões diferentes.');
 if(input.historyAvailable){
  reasons.push(paid+' compra(s) pagas independentes, de mesma versão/ano e KM próximo'+
   (input.historyLimited?' (consulta incompleta)':'')+'.');
  if(valid(input.paidMedian))reasons.push('Mediana histórica efetivamente paga: '+pt(input.paidMedian)+'. Não é valor de venda.');
 }
 let status:OpinionStatus='insufficient';
 let rationale='Faltam evidências ou informações confirmadas para recomendar uma compra.';
 const hasFinancialScenario=marketSupported&&costReady&&
   (input.mode==='stock'?hasDealerCost:hasOffer)&&verifiedCeiling!==null&&gapToCeiling!==null;
 if(hasFinancialScenario){
  if(input.mode==='purchase'&&gapToCeiling>0){
   if(input.fipeCurrent&&recentStock&&gapToCeiling>=Math.max(3000,verifiedCeiling!*0.15)){
    status='avoid';rationale='O valor pretendido ultrapassa substancialmente o teto comercial calculado com anúncios conferidos. Evitar nas condições atuais; reavaliar se houver nova negociação.';
   }else{
    status='negotiate';rationale='O valor pretendido supera o teto comercial simulado. Negociar o preço ou revisar custos antes de avançar.';
   }
  }else if(input.mode==='stock'&&gapToCeiling>0){
   status='negotiate';rationale='O custo registrado supera o teto comparativo de uma nova compra. Revisar venda e custos do estoque atual; isso não é prejuízo realizado.';
  }else if(pressure){
   status='negotiate';rationale='Embora o valor esteja dentro do limite simulado, o estoque interno merece revisão de giro e concentração antes de nova aquisição.';
  }else if(input.mode==='purchase'&&input.historyAvailable&&!input.historyLimited&&paid>=3&&
    valid(input.paidMedian)&&hasOffer&&input.offer!>input.paidMedian*1.12){
   status='negotiate';rationale='A oferta está mais de 12% acima da mediana histórica paga. Verificar diferenças de condição e data antes de negociar.';
  }else if(input.fipeCurrent&&recentStock&&input.historyAvailable&&
    !input.historyLimited&&paid>=3){
   status='opportunity';rationale=input.mode==='stock'?
    'Cenário bruto do estoque favorável com fontes suficientes. Revisar custos, condições e estratégia de venda.':
    'Preço pretendido dentro do teto simulado e amostra mínima conferida. Oportunidade para análise e aprovação humana, não compra autorizada.';
  }
 }
 const confidence:OpinionConfidence=!marketSupported?'insuficiente':
   status==='insufficient'?'baixa':
   input.fipeCurrent&&recentStock&&input.historyAvailable&&!input.historyLimited&&
   paid>=6&&input.verifiedAds>=3?'alta':
   input.fipeCurrent&&recentStock&&input.historyAvailable&&!input.historyLimited&&paid>=3?'moderada':'baixa';
 const titles:Record<OpinionStatus,string>={
  opportunity:'Boa oportunidade para análise',
  negotiate:'Negociar ou revisar custos',
  avoid:'Evitar nas condições atuais',
  insufficient:'Dados insuficientes para recomendar'
 };
 const action= status==='avoid'?'Não avançar com esse valor; renegociar e submeter novo cenário ao responsável.':
   status==='negotiate'?'Revisar o preço pretendido, custos e concentração de estoque com o gestor.':
   status==='opportunity'?'Conferir laudo, despesas, impostos e obter a aprovação humana de compra.':
   missing[0]||'Informe e confirme a referência de mercado para concluir a análise.';
 return {
  status,title:titles[status],confidence,rationale,reasons,missing,
  nextAction:action,verifiedCeiling,gapToCeiling,marketSupported,snapshotAgeDays:age,
  warning:'Parecer de apoio. Anúncios não são vendas concluídas; FIPE, histórico e estoque não comprovam margem líquida, estado, liquidez ou autorização para comprar.'
 };
}
