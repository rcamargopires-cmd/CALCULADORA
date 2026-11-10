/**
 * Motyq IQ · Home simplificada (prévia).
 * A navegação é local e determinística. Nenhuma chamada ao banco/IA adicional
 * é feita nesta tela. Os módulos existentes mantêm todas as suas permissões.
 */
export type SimpleIqDestination='pricing'|'consulted'|'radar'|'dashboard'|'history'|'archive'|'plateHistory'|'approvals'|'learning';
export type SimpleIqIntent={destination:SimpleIqDestination;plate?:string;explanation:string};
const clean=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function parseSimpleIqIntent(raw:string):SimpleIqIntent|null{
 const text=clean(raw);
 if(!text||text.length>220)return null;
 const compact=text.toUpperCase().replace(/[^A-Z0-9]/g,'');
 const plate=text.match(/\b([a-z]{3})[ -]?([0-9][a-z0-9][0-9]{2})\b/i);
 const selectedPlate=plate?(plate[1]+plate[2]).toUpperCase():undefined;
 if(/cot(a|ar|acao|acoes)|lojista|comprador|proposta|whatsapp/.test(text))
  return {destination:'consulted',explanation:'Abrir a Cotação Mesa e consultar lojistas'};
 if(/estoque|dealer|radar|giro|parados/.test(text))
  return {destination:'radar',explanation:'Consultar o estoque no Radar de Compra'};
 if(/importar|planilha|excel|arquivo mensal|arquivo de avaliac/.test(text))
  return {destination:'archive',explanation:'Abrir o Arquivo Mensal para importar avaliações'};
 if(/placa|historico do carro|historico por placa/.test(text))
  return {destination:'plateHistory',plate:selectedPlate,explanation:selectedPlate?
   'Consultar histórico por placa '+selectedPlate:'Abrir a pesquisa de histórico por placa'};
 if(/aprova|solicitac/.test(text))return {destination:'approvals',explanation:'Abrir solicitações e aprovações'};
 if(/hist[oó]rico|avaliacoes antigas|minhas avaliac/.test(text))
  return {destination:'history',explanation:'Consultar as avaliações do histórico'};
 if(/resultado|relatorio|painel|indicador|desempenho|mes passado/.test(text))
  return {destination:'dashboard',explanation:'Consultar os resultados gerenciais'};
 if(/aprend|padroes|inteligencia/.test(text))return {destination:'learning',explanation:'Abrir Aprendizado IQ'};
 if(/avaliar|avaliacao|precificar|fipe|preco|preco de compra|decisao de compra|quanto pagar|quanto oferecer/.test(text)||/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(compact))
  return {destination:'pricing',plate:selectedPlate,explanation:'Abrir uma avaliação de veículo'};
 return null;
}
