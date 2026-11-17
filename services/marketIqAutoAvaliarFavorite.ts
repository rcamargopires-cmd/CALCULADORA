import {cleanExpressVehicle,type ExpressVehicleExtract} from './marketIqExpress';

export const AUTOAVALIAR_FAVORITE_HASH_KEY='motyq-autoavaliar';

/** Runs only when the operator clicks their favorite INSIDE the authenticated
 * AutoAvaliar page. No APIs, scraping endpoints, cookies, storage or network.
 * Only explicit vehicle-card fields are sent after on-screen confirmation.
 * This function must remain self-contained: toString() becomes a bookmarklet.
 */
function captureVisibleAutoAvaliarCard(targetOrigin:string){
 try{
  const host=String(location.hostname||'').toLowerCase();
  if(host!=='autoavaliar.com.br'&&!host.endsWith('.autoavaliar.com.br')){
   alert('Abra uma avaliação na plataforma AutoAvaliar antes de clicar em Enviar ao Motyq.');
   return;
  }
  const text=String(document.body?.innerText||'').slice(0,110000);
  const lines=text.split(/\r?\n/).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);
  const normalize=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const lineNorm=lines.map(normalize);
  const firstOrigin=lineNorm.findIndex(s=>/^ORIGEM(?:\s|$)/.test(s));
  if(firstOrigin<1){
   alert('Não encontrei o quadro Origem / Placa / Ano. Abra uma avaliação completa no AutoAvaliar.');
   return;
  }
  // Search only the visible vehicle card, not other records or the appraisal
  // notes, customer name, VIN, phone, login fields or contact information.
  const cardEnd=Math.min(lines.length,firstOrigin+65);
  const field=(key:string):string=>{
   const rx=new RegExp('^'+key+'(?:\\s*[:|]?)\\s*(.*)$','i');
   for(let i=firstOrigin;i<cardEnd;i++){
    const match=lineNorm[i].match(rx);
    if(!match)continue;
    const value=String(match[1]||'').trim();
    if(value&&value.length<65)return lines[i].slice(lines[i].length-value.length).trim();
    if(lines[i+1]&&i+1<cardEnd&&lines[i+1].length<65)return lines[i+1];
   }
   return '';
  };
  const head=lines.slice(Math.max(0,firstOrigin-12),firstOrigin);
  const title=head.filter(line=>{
   const n=normalize(line);
   return n.length>=11&&n.length<=130&&/\b(?:\d[.,]\d|TFSI|MPI|TURBO|XEI|AUTOMATICO|MANUAL)\b/.test(n)&&
    !/^(?:ANO|PLACA|ORIGEM|FIPE|REFERENCIAS|STATUS|AVALIACAO|COTACAO|COMB)/.test(n)&&
    !/R\$\s*\d/.test(n)&&!n.includes('@');
  }).pop()||'';
  if(!title){
   alert('Não consegui localizar o nome do carro na ficha. Deixe visível o cabeçalho, a placa e o ano.');
   return;
  }
  const model=title.replace(/\s+(?:[|=«»<&()]+|R\$)\s*$/gi,'').slice(0,140).trim();
  const upper=normalize(model);
  let brand='';
  const brands=[
   [/^(?:TERA|POLO|T-CROSS|NIVUS|VIRTUS|GOL|SAVEIRO|JETTA|TAOS|AMAROK)\b/,'VOLKSWAGEN'],
   [/^(?:COROLLA|YARIS|HILUX|ETIOS|SW4)\b/,'TOYOTA'],
   [/^(?:ARGO|TORO|MOBI|CRONOS|STRADA|PULSE|FASTBACK)\b/,'FIAT'],
   [/^(?:ONIX|PRISMA|TRACKER|SPIN|S10|MONTANA)\b/,'CHEVROLET'],
   [/^(?:Q2|Q3|Q5|Q7|Q8|A3|A4|A5|A6|TT)\b/,'AUDI'],
   [/^(?:CRETA|HB20|TUCSON)\b/,'HYUNDAI'],
   [/^(?:COMPASS|RENEGADE|COMMANDER)\b/,'JEEP'],
   [/^(?:KICKS|VERSA|SENTRA)\b/,'NISSAN'],
   [/^(?:DUSTER|KWID|SANDERO|LOGAN|KARDIAN)\b/,'RENAULT'],
   [/^(?:CIVIC|CITY|HR-V|FIT|WR-V)\b/,'HONDA'],
   [/^(?:ECOSPORT|RANGER|TERRITORY|FIESTA|KA)\b/,'FORD']
  ];
  for(const [pattern,make] of brands){if((pattern as RegExp).test(upper)){brand=make as string;break;}}
  const plateRaw=normalize(field('PLACA')).replace(/[^A-Z0-9]/g,'');
  const plate=/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plateRaw)?plateRaw:'';
  const years=field('ANO').match(/\b((?:19|20)\d{2})\s*[/\\-]\s*((?:19|20)\d{2})\b/);
  const yearManufacture=years?years[1]:'';
  const yearModel=years?years[2]:'';
  const kmField=field('KM').match(/\b\d{1,3}(?:\.\d{3}){0,2}\b|\b\d{4,6}\b/);
  const kmValue=kmField?Number(kmField[0].replace(/\./g,'')):NaN;
  const km=Number.isInteger(kmValue)&&kmValue>=0&&kmValue<=999999?kmValue:null;
  // FIPE and condition score are optional observations, not current values
  // or purchase approvals. Never read customer names, chassis or RENAVAM.
  let fipeReference:null|number=null;
  const refIndex=lineNorm.findIndex((s,i)=>i>firstOrigin&&/^REFERENCIAS\b/.test(s));
  const refStart=refIndex>=0?refIndex:firstOrigin;
  const fipeLine=lineNorm.findIndex((s,i)=>i>=refStart&&i<refStart+75&&/^FIPE(?:\s|$)/.test(s)&&!/^FIPE\s*0\s*KM\b/.test(s));
  if(fipeLine>=0){
   const nearby=lines.slice(fipeLine,Math.min(lines.length,fipeLine+4)).join(' ');
   const m=nearby.match(/R\$\s*([\d.]+,\d{2})/i);
   if(m){const n=Number(m[1].replace(/\./g,'').replace(',','.'));if(n>0&&n<=20000000)fipeReference=n;}
  }
  const scores=text.match(/\b(\d{1,2}(?:[,.]\d)?)\s*\/\s*10\b/);
  const score=scores?Number(scores[1].replace(',','.')):NaN;
  const conditionScore=Number.isFinite(score)&&score>=0&&score<=10?score:null;
  if(!yearModel||km===null&&!plate){
   alert('A ficha está incompleta para captura. Deixe visíveis o cabeçalho, placa, ano e KM. Nenhum dado foi enviado.');
   return;
  }
  const vehicle={
   brand,model,plate,yearManufacture,yearModel,km,fipeReference,conditionScore
  };
  if(!confirm('Enviar somente os dados deste veículo ao Motyq?\n'+
   (brand||'Marca a conferir')+' '+model+'\n'+
   'Placa: '+(plate||'não identificada')+'  Ano: '+yearManufacture+'/'+yearModel+
   '  KM: '+(km===null?'a conferir':km)+
   '\nNão envia nome do cliente, telefone, chassi, Renavam, login ou fotos.'))return;
  const payload=encodeURIComponent(JSON.stringify({kind:'motyq-autoavaliar-favorite-v1',vehicle,sourceHost:host}));
  if(payload.length>3000){alert('A captura ficou muito grande. Nenhum dado foi enviado.');return;}
  const url=targetOrigin+'/?iq=1#motyq-autoavaliar='+payload;
  const tab=window.open(url,'_blank');
  if(!tab){alert('O navegador bloqueou a nova aba. Libere pop-ups para o AutoAvaliar e clique novamente.');return;}
  try{tab.opener=null;}catch{}
 }catch{
  alert('Não consegui capturar esta página. Verifique se a ficha do AutoAvaliar está aberta. Nenhum dado foi enviado.');
 }
}

/** The current Motyq origin is embedded at copy time. Preview remains Preview. */
export function getAutoAvaliarFavoriteBookmarklet(origin:string):string{
 const url=new URL(origin);
 if(url.protocol!=='https:'||
   (url.hostname!=='app.motyq.com.br'&&!/^dealmaster-[a-z0-9-]+\.vercel\.app$/.test(url.hostname)))
  throw new Error('Abra o Motyq oficial ou seu Preview seguro para copiar o atalho.');
 return 'javascript:('+captureVisibleAutoAvaliarCard.toString()+')('+JSON.stringify(url.origin)+')';
}

/** Returns only allowed fields, discarding all unexpected page content. */
export function decodeAutoAvaliarFavoriteHash(hash:string):ExpressVehicleExtract|null{
 const raw=String(hash||'');
 if(!raw.startsWith('#'+AUTOAVALIAR_FAVORITE_HASH_KEY+'='))return null;
 if(raw.length>4000)throw new Error('Captura muito grande. Volte ao AutoAvaliar e tente novamente.');
 const encoded=raw.slice(('#'+AUTOAVALIAR_FAVORITE_HASH_KEY+'=').length);
 let value:any;
 try{value=JSON.parse(decodeURIComponent(encoded));}catch{
  throw new Error('O navegador retornou dados inválidos. Capture novamente.');
 }
 if(value?.kind!=='motyq-autoavaliar-favorite-v1'||
  (String(value.sourceHost||'')!=='autoavaliar.com.br'&&
   !String(value.sourceHost||'').endsWith('.autoavaliar.com.br')))
  throw new Error('Esta captura não foi identificada como uma avaliação do AutoAvaliar.');
 const v=value.vehicle;
 if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Dados da avaliação ausentes.');
 const clean=cleanExpressVehicle({
  brand:v.brand,model:v.model,plate:v.plate,
  yearManufacture:v.yearManufacture,yearModel:v.yearModel,km:v.km,
  fipeReference:v.fipeReference,conditionScore:v.conditionScore,
  repairTotal:null,repairDetails:[],
  warnings:['Captura pelo favorito do Chrome: confira placa, versão, KM e FIPE antes de transferir para a Mesa.']
 });
 if(!clean.model||!clean.yearModel||clean.km===null&& !clean.plate)
  throw new Error('A avaliação veio incompleta. Abra a ficha com modelo, ano, KM e placa.');
 return clean;
}
