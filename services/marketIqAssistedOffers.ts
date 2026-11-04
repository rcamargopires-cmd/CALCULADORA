/**
 * Motyq IQ · assisted Webmotors capture.
 *
 * The bookmarklet is user initiated on a Webmotors page. It reads only
 * visible individual offer cards; it never makes a Webmotors network request,
 * bypasses restrictions or sends authentication/cookies. Sending the small
 * offer payload to Motyq requires a user confirmation.
 *
 * The paste parser is a fallback for a browser that blocks bookmarklets or
 * where no individual listing links are present. Its results are unsigned
 * page observations, not verified individual advertisements.
 */
export type VisibleOffer={
 title:string;
 price:number;
 km:number;
 modelYear:number;
 version:string;
 location:string;
 index:number;
};
export type OffersToReview={
 offers:VisibleOffer[];
 found:number;
 rejected:{reason:string;count:number}[];
 meanLowestFive:number|null;
};
export type OfferTarget={
 brand:string;
 model:string;
 year:number;
 km:number;
 vehicleType:'car'|'motorcycle';
 versionLabel?:string|null;
};

const normalize=(s:unknown)=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/\s+/g,' ').trim();
const simplify=(s:unknown)=>normalize(s).replace(/[^a-z0-9]+/g,'');
const familyFromModel=(name:string):string=>{
 const s=normalize(name);
 const match=s.match(/^([a-z])[- ](cross|roc|iguan)(?=\s|$)/);
 return match?match[1]+'-'+match[2]:s.split(/\s+/)[0]||'';
};
const brandFromName=(name:string):string=>{
 const last=String(name||'').split(/\s+-\s+/).pop()||'';
 const normalized=simplify(last);
 return normalized==='vw'?'volkswagen':normalized==='gm'?'chevrolet':normalized;
};
const moneyValue=(text:string):number|null=>{
 const matches=Array.from(text.matchAll(/R\$\s*([\d.]{3,}(?:,\d{2})?)/gi))
  .map(x=>Number(x[1].replace(/\./g,'').replace(',','.')))
  .filter(n=>Number.isFinite(n)&&n>=1000&&n<=2000000);
 const candidate=matches.find(n=>n>=10000)||matches[0]||null;
 return candidate;
};
const distance=(input:string):number|null=>{
 const match=input.match(/\b(\d{1,3}(?:\.\d{3}){1,2}|\d{1,6})\s*km\b/i);
 if(!match)return null;
 const parsed=Number(match[1].replace(/\./g,''));
 return Number.isFinite(parsed)&&parsed>=1&&parsed<=999999?parsed:null;
};
const year=(input:string):number|null=>{
 const match=input.match(/\b(?:19|20)\d{2}\s*[/\\-]\s*((?:19|20)\d{2})\b/);
 return match?Number(match[1]):null;
};
const token=(s:string,t:string)=>new RegExp('(?:^|[^a-z0-9])'+t+'(?:$|[^a-z0-9])','i').test(normalize(s));
const versionMatches=(input:string,expected:string):boolean=>{
 if(!expected)return true;
 const detected=normalize(expected);
 // Only insist on clear mutually exclusive trims/engines.
 for(const trim of ['longitude','limited','trailhawk','sport','highline','comfortline','platinum']){
  if(token(detected,trim)&&!token(input,trim))return false;
 }
 if(token(detected,'sense')&&!token(input,'sense'))return false;
 if(token(detected,'plus')&&!token(input,'plus'))return false;
 if(token(detected,'t270')&&!token(input,'t270'))return false;
 if(token(detected,'td350')&&!token(input,'td350'))return false;
 if(token(detected,'diesel')&&!token(input,'diesel'))return false;
 return true;
};
const dangerous=/leil[aã]o|sinistr|recuperad[ao]|salvad[ao]|sucata|danos estruturais|dano estrutural/i;
export function parseVisibleWebmotorsText(text:string,vehicle:OfferTarget):OffersToReview{
 const raw=String(text||'').slice(0,160000).replace(/\r/g,'');
 const lines=raw.split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
 const brand=brandFromName(vehicle.brand);
 const model=familyFromModel(vehicle.model);
 const expected=simplify(brand+' '+model);
 const family=simplify(model);
 const candidates:VisibleOffer[]=[];
 const discarded=new Map<string,number>();
 let found=0;
 const reject=(reason:string)=>discarded.set(reason,(discarded.get(reason)||0)+1);
 const tolerance=vehicle.vehicleType==='motorcycle'?10000:30000;
 const stop=new Set<string>();
 // Only count explicit card headings (e.g. JEEP COMPASS), not the title of the
 // search page. The individual card's details follow immediately afterwards.
 for(let i=0;i<lines.length&&found<120;i++){
  const heading=lines[i];
  const normalized=simplify(heading);
  if(normalized!==expected)continue;
  if(stop.has(String(i)))continue;
  found++;
  const slice=lines.slice(i+1,i+15);
  const nextHeading=slice.findIndex(x=>simplify(x)===expected);
  const part=(nextHeading>=0?slice.slice(0,nextHeading):slice);
  const modelYear=part.map(year).find(n=>n!==null)??null;
  const km=part.map(distance).find(n=>n!==null)??null;
  const firstPrice=part.map(moneyValue).find(n=>n!==null)??null;
  const version=part.find(x=>/\b(?:tsi|t270|td350|flex|automatic|manual|turbo|diesel|sense|longitude|sport|limited|trailhawk|platinum|cv|1\.0|1\.3)\b/i.test(x))||'';
  const location=part.find(x=>/\([A-Z]{2}\)/.test(x))||'';
  if(modelYear===null||km===null||firstPrice===null){reject('Preço, KM ou ano ausente');continue;}
  if(modelYear!==vehicle.year){reject('Ano-modelo diferente');continue;}
  if(!Number.isFinite(vehicle.km)||vehicle.km<=0||Math.abs(km-vehicle.km)>tolerance){
   reject('KM fora da faixa');continue;
  }
  if(dangerous.test(part.join(' '))){reject('Indício de leilão ou sinistro');continue;}
  if(!versionMatches(version,vehicle.versionLabel||'')){reject('Versão ou motorização diferente');continue;}
  const key=[modelYear,km,firstPrice,version,location].join('|');
  if(candidates.some(x=>[x.modelYear,x.km,x.price,x.version,x.location].join('|')===key)){
   reject('Oferta repetida');continue;
  }
  candidates.push({title:heading,price:firstPrice,km,modelYear,version,location,index:i});
 }
 candidates.sort((a,b)=>a.price-b.price||Math.abs(a.km-vehicle.km)-Math.abs(b.km-vehicle.km));
 const offers=candidates.slice(0,15);
 const lowest=offers.slice(0,5);
 return {
  offers,found,
  rejected:[...discarded].map(([reason,count])=>({reason,count})).sort((a,b)=>b.count-a.count),
  meanLowestFive:lowest.length>=2?Math.round(lowest.reduce((sum,ad)=>sum+ad.price,0)/lowest.length):null
 };
}

/**
 * Bookmarklet implementation is plain JavaScript by design: Function#toString
 * emits a pasteable script that runs under the user's own browser gesture.
 * It does not depend on private CSS class names from Webmotors.
 */
function readVisibleWebmotorsCards(){
 const host=location.hostname.toLowerCase();
 if(!['www.webmotors.com.br','webmotors.com.br'].includes(host)){
  alert('Abra uma página da Webmotors com anúncios visíveis antes de usar o capturador Motyq.');
  return;
 }
 const canonicalUrl=(value)=>{
  try{
   const u=new URL(value,location.href);
   if(u.protocol!=='https:'||!['www.webmotors.com.br','webmotors.com.br'].includes(u.hostname.toLowerCase()))return null;
   if(!/^\/comprar\/[^/]+\/[^/]+\/.+\/\d{7,}\/?$/i.test(u.pathname))return null;
   return u.origin+u.pathname;
  }catch{return null;}
 };
 const amount=(raw)=>{
  const n=[...String(raw).matchAll(/R\$\s*([\d.]+(?:,\d{2})?)/gi)].map(m=>
   Number(m[1].replace(/\./g,'').replace(',','.'))).filter(n=>Number.isFinite(n)&&n>=1000&&n<=2000000);
  return n.find(n=>n>=10000)||n[0]||null;
 };
 const mileage=(raw)=>{
  const m=String(raw).match(/\b(\d{1,3}(?:\.\d{3}){1,2}|\d{1,6})\s*km\b/i);
  return m?Number(m[1].replace(/\./g,'')):null;
 };
 const modelYear=(raw)=>{
  const m=String(raw).match(/\b(?:19|20)\d{2}\s*[/\-]\s*((?:19|20)\d{2})\b/);
  return m?Number(m[1]):null;
 };
 const seen=new Set(),ads=[];
 const links=[...document.querySelectorAll('a[href]')];
 for(const a of links){
  const url=canonicalUrl((a as HTMLAnchorElement).href||a.getAttribute('href'));
  if(!url||seen.has(url))continue;
  // Find the *smallest* enclosing card with year, km and price. Skip entire
  // search pages/filters to avoid joining unrelated cars into one record.
  let node=a;
  let matched=null;
  for(let depth=0;node&&depth<8;node=node.parentElement,depth++){
   const content=String((node as HTMLElement).innerText||'').replace(/\s+/g,' ').trim();
   if(content.length>1900)break;
   const p=amount(content),km=mileage(content),year=modelYear(content);
   if(p&&km&&year){matched={p,km,year,text:content};break;}
  }
  if(!matched)continue;
  if(matched.km<=0||matched.km>999999||matched.year<1990||matched.year>2100)continue;
  seen.add(url);
  ads.push({
   title:matched.text.slice(0,120),url,
   price:Math.round(matched.p),km:Math.round(matched.km),year:matched.year
  });
  if(ads.length===12)break;
 }
 if(!ads.length){
  alert('Nenhum anúncio individual pôde ser capturado nesta página. No Motyq, use a opção Colar lista: Ctrl+A, Ctrl+C na Webmotors, depois Ctrl+V no Motyq.');
  return;
 }
 if(!confirm('Capturar '+ads.length+' anúncio(s) visível(is) e abrir o Motyq IQ? Confirme os dados antes de usar preços na Mesa.'))return;
 const json=JSON.stringify({kind:'motyq-assisted-v1',ads});
 const bytes=new TextEncoder().encode(json);
 let binary='';for(const n of bytes)binary+=String.fromCharCode(n);
 const value=btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 if(value.length>12000){alert('Muitos dados no lote. Tente capturar menos anúncios.');return;}
 location.href='https://app.motyq.com.br/#motyq-import='+value;
}
export function getWebmotorsCaptureBookmarklet():string{
 return 'javascript:('+readVisibleWebmotorsCards.toString()+')()';
}
