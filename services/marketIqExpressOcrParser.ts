import {cleanExpressVehicle,type ExpressVehicleExtract} from './marketIqExpress';

/** Conservative AutoAvaliar OCR parser: never guesses price, demand, inventory or buyer identities.
 * Raw OCR text is processed in memory only and never uploaded or saved.
 */
const fold=(x:string)=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const moneyFrom=(x:string):number|null=>{
 const found=x.match(/R\$\s*([\d.,\s]+)/i);
 if(!found)return null;
 const text=found[1].trim().replace(/\s/g,'');
 if(!text||!/^\d[\d.,]*$/.test(text))return null;
 const value=Number(text.includes(',')?text.replace(/\./g,'').replace(',','.'):text.replace(/\.(?=\d{3}(?:\.|$))/g,''));
 return Number.isFinite(value)&&value>=0&&value<=20000000?value:null;
};
const mileage=(x:string):number|null=>{
 const matches=x.match(/\b\d{1,3}(?:[., ]\d{3}){1,2}\b|\b\d{4,6}\b/g)||[];
 for(const item of matches){
  const km=Number(item.replace(/[., ]/g,''));
  if(Number.isSafeInteger(km)&&km>=0&&km<=999999)return km;
 }
 return null;
};
const knownModels:[RegExp,string][]=[
 [/\b(PRISMA|ONIX|TRACKER|SPIN|CRUZE|S10|MONTANA)\b/,'CHEVROLET'],
 [/\b(T-CROSS|TCROSS|POLO|VIRTUS|NIVUS|GOL|SAVEIRO|JETTA|TAOS|AMAROK)\b/,'VOLKSWAGEN'],
 [/\b(CRETA|HB20|TUCSON|IX35)\b/,'HYUNDAI'],
 [/\b(YARIS|COROLLA|HILUX|ETIOS|SW4)\b/,'TOYOTA'],
 [/\b(COMPASS|RENEGADE|COMMANDER)\b/,'JEEP'],
 [/\b(ARGO|MOBI|PULSE|FASTBACK|TORO|STRADA|CRONOS)\b/,'FIAT'],
 [/\b(KWID|SANDERO|DUSTER|KARDIAN|LOGAN|CAPTUR)\b/,'RENAULT'],
 [/\b(KICKS|VERSA|SENTRA|FRONTIER)\b/,'NISSAN'],
 [/\b(CIVIC|FIT|CITY|HR-V|WR-V)\b/,'HONDA'],
 [/\b(ECOSPORT|KA|RANGER|TERRITORY|FIESTA)\b/,'FORD']
];
const chooseTitle=(line:string)=>{
 const normalized=fold(line).replace(/^\s*[#*]+\s*/,'');
 // Model description is generally above the table: "PRISMA 1.4 MPFI LTZ 8V FLEX 4P AUTOMATICO".
 return normalized.length>=6&&normalized.length<=130&&
  knownModels.some(([re])=>re.test(normalized))&&
  !/^(MARCA|MODELO|VERSAO|FABRICANTE|REFERENCIA|REFERENCIAS|VEICULO|ORIGEM|VALOR|ANO|CLIENTE)\s*:/.test(normalized) &&
  !/(\bR\$\s*[\d.]+|\bCPF\b|\bCNPJ\b|\bSOLICITANTE\b)/.test(normalized);
};
/** Keep the model name, not preceding AutoAvaliar menu and photo-tab labels.
 * e.g. "BIA FOTOS LISTA TAOS 1.4 250 TSI..." -> "TAOS 1.4 250 TSI..."
 */
const vehicleTitle=(row:string):string=>{
 const full=fold(row).replace(/^[^A-Z0-9]+/,'');
 if(/(?:CLIENTE|CPF|CNPJ|SOLICITANTE|AVALIADOR|REFERENCIAS|ITENS AVALIADOS)/.test(full))return '';
 let candidate='';
 for(const [pattern] of knownModels){
  const found=full.match(pattern);
  if(found&&found.index!==undefined){
   const next=full.slice(found.index).replace(/\s+(?:PLACA|ANO|KM|QUILOMETRAGEM|ORIGEM|RENAVAM|CHASSI)\s*:?.*$/,'').trim();
   if(next.length>=3&&next.length<=110&&(candidate===''||next.length>candidate.length))candidate=next;
  }
 }
 return candidate;
};
/** Prefer an explicitly labelled value and never reuse the next unrelated field. */
const fieldValue=(lines:string[],prefix:RegExp,allowed:RegExp):string=>{
 for(let i=0;i<lines.length;i++){
  const line=fold(lines[i]).replace(/^[^A-Z0-9]+/,'');
  const matched=line.match(prefix);
  if(!matched)continue;
  const tail=line.slice((matched.index||0)+matched[0].length).replace(/^[\s:|.-]+/,'').trim();
  if(tail&&allowed.test(tail))return tail;
  if(!tail&&i+1<lines.length){
   const next=fold(lines[i+1]);
   if(allowed.test(next)&&!(/^(?:PLACA|ANO|KM|COR|ORIGEM|PORTAS|COMB|CHASSI)\b/.test(next)))return next;
  }
 }
 return '';
};
const labelValue=(lines:string[],re:RegExp)=>{
 for(let i=0;i<lines.length;i++){
  const row=fold(lines[i]);
  const match=row.match(re);
  if(match){
   const tail=row.slice((match.index||0)+match[0].length).replace(/^[\s:|.-]+/,'').trim();
   return tail||fold(lines[i+1]||'');
  }
 }
 return '';
};
const normalizeYears=(x:string):[string,string]=>{
 const pair=x.match(/\b((?:19|20)\d{2})\s*[\/-]\s*((?:19|20)\d{2})\b/);
 return pair?[pair[1],pair[2]]:['',''];
};
const likelyPlate=(s:string):string=>{
 const m=fold(s).replace(/[\s-]/g,'').match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/);
 return m?m[0]:'';
};
/** Reconstruct label/value rows using OCR coordinates when the engine splits the
 * AutoAvaliar left labels from right-aligned values into different text columns.
 */
export function spatialOcrRows(tsv:string):string[]{
 const rows=String(tsv||'').split(/\r?\n/);
 if(rows.length<2)return [];
 const keys=rows[0].split('\t');
 const at=(key:string)=>keys.indexOf(key);
 const idx={level:at('level'),left:at('left'),top:at('top'),height:at('height'),conf:at('conf'),text:at('text')};
 if(Object.values(idx).some(x=>x<0))return [];
 const words:{value:string;x:number;y:number;h:number}[]=[];
 for(const entry of rows.slice(1)){
  const cols=entry.split('\t');
  if(cols[idx.level]!=='5')continue;
  const value=cols.slice(idx.text).join('\t').trim();
  const x=Number(cols[idx.left]),top=Number(cols[idx.top]),h=Number(cols[idx.height]),conf=Number(cols[idx.conf]);
  if(!value||!Number.isFinite(x)||!Number.isFinite(top)||!Number.isFinite(h)||h<1||conf<10)continue;
  words.push({value,x,y:top+h/2,h});
 }
 words.sort((a,b)=>a.y-b.y||a.x-b.x);
 const groups:{center:number;height:number;words:typeof words}[]=[];
 for(const word of words){
  const last=groups[groups.length-1];
  if(last&&Math.abs(last.center-word.y)<=Math.max(6,Math.min(last.height,word.h)*0.42)){
   last.words.push(word);last.center=(last.center*(last.words.length-1)+word.y)/last.words.length;
  }else groups.push({center:word.y,height:word.h,words:[word]});
 }
 return groups.map(g=>g.words.sort((a,b)=>a.x-b.x).map(w=>w.value).join(' ')).filter(Boolean);
}
export function parseAutoAvaliarOcrText(
 rawText:string,tsv?:string,detailsText?:string,detailsTsv?:string,referencesText?:string,referencesTsv?:string
):ExpressVehicleExtract{
 const detailLines=[...spatialOcrRows(detailsTsv||''),...String(detailsText||'').split(/\r?\n/)].map(x=>x.trim()).filter(Boolean);
 const mainLines=[...spatialOcrRows(tsv||''),...String(rawText||'').split(/\r?\n/)].map(x=>x.trim()).filter(Boolean);
 const referenceLines=[...spatialOcrRows(referencesTsv||''),...String(referencesText||'').split(/\r?\n/)].map(x=>x.trim()).filter(Boolean);
 const lines=[...detailLines,...mainLines];
 const upper=lines.map(fold);
 const warnings:string[]=['Leitura local experimental: revise todos os campos antes de utilizar na Mesa.'];
 const title=lines.map(vehicleTitle).find(Boolean)||'';
 const labelBrand=fieldValue(lines,/^(?:MARCA|FABRICANTE)\s*[:|.-]?\s*/,/^(?:VOLKSWAGEN|CHEVROLET|FIAT|TOYOTA|HYUNDAI|JEEP|RENAULT|NISSAN|HONDA|FORD|VW|GM)\b/);
 let brand=knownModels.find(([re])=>re.test(title))?.[1]||'';
 if(labelBrand)brand=labelBrand.startsWith('VW')?'VOLKSWAGEN':labelBrand.startsWith('GM')?'CHEVROLET':labelBrand.split(/\s+/)[0];
 const modelLabel=fieldValue(lines,/^(?:MODELO|VERSAO)\s*[:|.-]?\s*/,/[A-Z]{2,}/);
 const model=(title||vehicleTitle(modelLabel)||modelLabel).replace(/^(CHEVROLET|VOLKSWAGEN|VW|HYUNDAI|TOYOTA|JEEP|FIAT|RENAULT|HONDA|FORD|NISSAN)\s+/,'').trim();
 const yearLabel=fieldValue(lines,/^(?:ANO\s*\/\s*MODELO|ANO\s+FAB\s*\/\s*MOD|ANO\s+MODELO|ANO)\s*[:|.-]?\s*/,/(?:19|20)\d{2}\s*[\/-]\s*(?:19|20)?\d{2}/);
 let [yearManufacture,yearModel]=normalizeYears(yearLabel);
 if(!yearModel){
  const pair=upper.map(normalizeYears).find(pair=>Boolean(pair[1]));
  if(pair)[yearManufacture,yearModel]=pair;
 }
 const kmRaw=fieldValue(lines,/^(?:KM|QUILOMETRAGEM|KMS)\s*[:|.-]?\s*/,/\d{2,6}(?:[., ]\d{3})?/);
 const km=mileage(kmRaw);
 const plate=likelyPlate(fieldValue(lines,/^(?:PLACA)\s*[:|.-]?\s*/,/[A-Z]{3}\s*[- ]?[0-9][A-Z0-9][0-9]{2}/));
 // Read FIPE only from a line explicitly labeled "FIPE" (never "FIPE 0KM").
 let fipeReference:number|null=null;
 const fipeCandidates=[referenceLines,mainLines];
 for(const rows of fipeCandidates){
  for(let i=0;i<rows.length;i++){
   const label=fold(rows[i]);
   if(/^(?:FIPE|TABELA FIPE)(?:\s|:|$)/.test(label)&&!/^FIPE\s*0\s*KM\b/.test(label)){
    const n=moneyFrom(rows.slice(i,i+3).join(' '));
    if(n!==null){fipeReference=n;break;}
   }
  }
  if(fipeReference!==null)break;
 }
 const scoreMatch=upper.join('\n').match(/\b(\d{1,2}(?:[.,]\d)?)\s*\/\s*10\b/);
 const conditionScore=scoreMatch?Number(scoreMatch[1].replace(',','.')):null;
 const repairDetails:string[]=[];
 let repairTotal:number|null=null;
 // Only count lines in item section that name a repair. This avoids FIPE and buyer bids.
 let inItems=false;
 const repairLines=String(rawText||'').split(/\r?\n/).filter(Boolean);
 for(let i=0;i<repairLines.length;i++){
  const row=fold(repairLines[i]);
  if(/\bITENS\s+AVALIADOS\b/.test(row)){inItems=true;continue;}
  if(/^(OPCIONAIS|SOLICITACAO|RESUMO DE COMPRA|HISTORICO|OBSERVACOES)\b/.test(row))inItems=false;
  if(inItems&&/\b(LATARIA|MOTOR|PNEU|PINTURA|REVISAO|MECANICA|FUNILARIA|POLIMENTO|ESTOFADO|VIDRO|SUSPENSAO|FREIO|CAMBIO|ESTETICA|PARACHOQUE)\b/.test(row)){
   const amount=moneyFrom(repairLines[i]);
   if(amount!==null&&amount<100000){
    repairDetails.push(repairLines[i].slice(0,120));
    repairTotal=(repairTotal||0)+amount;
   }
  }
 }
 if(!brand)warnings.push('Marca não reconhecida automaticamente.');
 if(!model)warnings.push('Modelo e versão não identificados.');
 if(/\b(?:FLE|AUTOMAT|MANU|TOTAL)\s*$/.test(model))warnings.push('Modelo ou versão possivelmente cortado pelo OCR; confirme a descrição completa.');
 if(!yearModel)warnings.push('Ano/modelo não confirmado.');
 if(km===null)warnings.push('KM não identificada com segurança.');
 if(fipeReference===null)warnings.push('FIPE não encontrada no recorte; não será presumida.');
 if(repairTotal===null)warnings.push('Reparos não somados automaticamente; confira os itens.');
 const parsed=cleanExpressVehicle({
  brand,model,yearManufacture,yearModel,km,plate,fipeReference,
  conditionScore,repairTotal,repairDetails,warnings
 });
 if(!parsed.model&&!parsed.brand&&!parsed.plate)
  throw new Error('Não encontrei marca/modelo legível. Recorte a área da ficha do carro ou tente um print maior.');
 return parsed;
}
