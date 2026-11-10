/**
 * Portable buyer registration handoff for the public Cotação Mesa form.
 * Nothing is posted to a public database or sent to a recipient automatically.
 * The buyer intentionally shares the generated code; a Mesa user inspects and imports.
 */
import {blankBuyer,safeBuyer,validBuyerPhone,type BuyerProfile} from './marketIqCotacaoMesaBuyers';
export const PUBLIC_BUYER_PATH='/cotacao-mesa/cadastro';
export const REGISTRATION_PREFIX='MOTYQBUYER1.';
export type PublicBuyerRegistration=Pick<BuyerProfile,
 'shop'|'contact'|'whatsapp'|'region'|'brands'|'models'|'vehicleType'|
 'yearFrom'|'yearTo'|'optedIn'> & {
 email?:string;segments?:string;maxKm?:string;budgetTo?:string;
};
const safeText=(input:unknown,max:number)=>String(input??'').trim().slice(0,max);
const safeDigits=(input:unknown,max:number)=>safeText(input,32).replace(/\D/g,'').slice(0,max);
export const publicBuyerFormUrl=(origin:string)=>new URL(PUBLIC_BUYER_PATH,origin).toString();

export function validatePublicBuyer(v:PublicBuyerRegistration):string|null{
 if(safeText(v.shop,100).length<2)return 'Informe o nome da loja.';
 if(safeText(v.contact,100).length<2)return 'Informe o responsável pelo cadastro.';
 if(!validBuyerPhone(v.whatsapp))return 'Informe um WhatsApp brasileiro válido, com DDD.';
 if(safeText(v.region,100).length<2)return 'Informe sua cidade ou região.';
 if(!safeText(v.brands,400)&&!safeText(v.models,400)&&!safeText(v.segments,240))
  return 'Selecione pelo menos uma categoria ou informe as marcas/modelos de interesse.';
 const from=safeText(v.yearFrom,4),to=safeText(v.yearTo,4);
 if(from&&!/^(19|20)\d{2}$/.test(from))return 'Ano mínimo inválido.';
 if(to&&!/^(19|20)\d{2}$/.test(to))return 'Ano máximo inválido.';
 if(from&&to&&Number(from)>Number(to))return 'Ano mínimo maior que o máximo.';
 if(Number(v.maxKm||0)>999999)return 'Quilometragem máxima muito alta.';
 if(Number(v.budgetTo||0)>999999999)return 'Faixa máxima de valor inválida.';
 if(v.email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)||v.email.length>140))
  return 'E-mail inválido.';
 if(v.optedIn!==true)return 'Para receber cotações por WhatsApp, confirme seu consentimento.';
 return null;
}
export function normalizePublicBuyer(raw:PublicBuyerRegistration):PublicBuyerRegistration{
 const saved=safeBuyer({...blankBuyer(),...raw,id:'validacao'});
 if(!saved)throw Error('Cadastro inválido.');
 return {
  shop:safeText(saved.shop,100),contact:safeText(saved.contact,100),
  whatsapp:validBuyerPhone(saved.whatsapp)||'',
  region:safeText(saved.region,100),
  email:safeText(saved.email,140),brands:safeText(saved.brands,400),
  models:safeText(saved.models,400),segments:safeText(saved.segments,240),
  vehicleType:saved.vehicleType,yearFrom:safeText(saved.yearFrom,4),
  yearTo:safeText(saved.yearTo,4),maxKm:safeDigits(saved.maxKm,7),
  budgetTo:safeDigits(saved.budgetTo,9),optedIn:saved.optedIn
 };
}
const bytesToBase64url=(raw:string):string=>{
 const bytes=new TextEncoder().encode(raw);
 let binary='';
 for(const byte of bytes)binary+=String.fromCharCode(byte);
 return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const base64urlToString=(str:string):string=>{
 const binary=atob(str.replace(/-/g,'+').replace(/_/g,'/'));
 return new TextDecoder('utf-8',{fatal:true})
  .decode(Uint8Array.from(binary,char=>char.charCodeAt(0)));
};
export function createPublicBuyerCode(raw:PublicBuyerRegistration):string{
 const buyer=normalizePublicBuyer(raw);
 const problem=validatePublicBuyer(buyer);
 if(problem)throw Error(problem);
 const encoded=bytesToBase64url(JSON.stringify({v:1,buyer}));
 if(encoded.length>3500)throw Error('Cadastro muito longo. Resuma as marcas e modelos.');
 return REGISTRATION_PREFIX+encoded;
}
/** Returns a sanitized untrusted submission. A Mesa operator must verify before saving. */
export function parsePublicBuyerCode(message:string):PublicBuyerRegistration{
 if(message.length>9500)throw Error('Mensagem recebida muito longa.');
 const match=message.match(/\bMOTYQBUYER1\.([A-Za-z0-9_-]{35,3500})\b/);
 if(!match)throw Error('Código de cadastro não encontrado. Peça ao lojista para copiar o texto completo.');
 try{
  const object=JSON.parse(base64urlToString(match[1]));
  if(object?.v!==1||!object?.buyer||typeof object.buyer!=='object')
   throw Error('Versão do formulário não reconhecida.');
  const sanitized=normalizePublicBuyer(object.buyer);
  const issue=validatePublicBuyer(sanitized);
  if(issue)throw Error(issue);
  return sanitized;
 }catch(error:any){
  throw Error('Cadastro não pôde ser conferido: '+String(error?.message||'dados inválidos'));
 }
}
export function buyerRegistrationMessage(raw:PublicBuyerRegistration):string{
 const b=normalizePublicBuyer(raw),code=createPublicBuyerCode(b);
 const types={both:'Carros e motos',car:'Automóveis',motorcycle:'Motos'};
 return [
  'CADASTRO DE COMPRADOR · COTAÇÃO MESA / MOTYQ',
  'Loja: '+b.shop,'Responsável: '+b.contact,
  'WhatsApp: '+b.whatsapp,'Região: '+b.region,
  'Interesse: '+types[b.vehicleType],
  'Marcas: '+(b.brands||'Diversas'),'Modelos: '+(b.models||'Variados'),
  'Categorias: '+(b.segments||'Sem preferência'),
  'Ano: '+(b.yearFrom||'livre')+' a '+(b.yearTo||'livre'),
  'KM máximo: '+(b.maxKm||'não informado'),
  'Valor máximo: '+(b.budgetTo?'R$ '+Number(b.budgetTo).toLocaleString('pt-BR'):'não informado'),
  'Consentimento para receber cotações: SIM',
  '',
  'Código de importação (copie o texto integral):',
  code
 ].join('\n');
}
