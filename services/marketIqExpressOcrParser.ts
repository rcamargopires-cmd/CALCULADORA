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
 return normalized.length>=9&&normalized.length<=130&&
  knownModels.some(([re])=>re.test(normalized))&&
  !/^(MARCA|MODELO|VERSAO|FABRICANTE|REFERENCIA|REFERENCIAS|VEICULO|ORIGEM|VALOR|ANO|CLIENTE)\s*:/.test(normalized) &&
  !/(\bR\$\s*[\d.]+|\bCPF\b|\bCNPJ\b|\bSOLICITANTE\b)/.test(normalized);
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
export function parseAutoAvaliarOcrText(rawText:string):ExpressVehicleExtract{
 const lines=String(rawText||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const upper=lines.map(fold);
 const warnings:string[]=['Leitura local experimental: revise todos os campos antes de utilizar na Mesa.'];
 const title=upper.find(chooseTitle)||'';
 const brandLabel=labelValue(lines,/^(?:MARCA|FABRICANTE)\s*[:|.-]?\s*/);
 let brand=knownModels.find(([re])=>re.test(title))?.[1]||'';
 if(brandLabel&&brandLabel.length<40)brand=brandLabel;
 const modelLabel=labelValue(lines,/^(?:MODELO|VERSAO)\s*[:|.-]?\s*/);
 const model=(title||modelLabel).replace(/^(CHEVROLET|VOLKSWAGEN|VW|HYUNDAI|TOYOTA|JEEP|FIAT|RENAULT|HONDA|FORD|NISSAN)\s+/,'').trim();
 const yearLabel=labelValue(lines,/^(?:ANO|ANO MODELO|ANO\/MODELO|ANO FAB\/MOD)\s*[:|.-]?\s*/);
 let [yearManufacture,yearModel]=normalizeYears(yearLabel);
 if(!yearModel){
  const yearRow=upper.find(x=>/^(ANO|ANO\/MODELO)\b/.test(x));
  if(yearRow)[yearManufacture,yearModel]=normalizeYears(yearRow);
 }
 const kmRaw=labelValue(lines,/^(?:KM|QUILOMETRAGEM|KMS)\s*[:|.-]?\s*/);
 const km=mileage(kmRaw);
 const plate=likelyPlate(labelValue(lines,/^(?:PLACA)\s*[:|.-]?\s*/));
 // Read FIPE only from a line explicitly labeled "FIPE" (never "FIPE 0KM").
 let fipeReference:number|null=null;
 for(let i=0;i<upper.length;i++){
  if(/^(?:FIPE|TABELA FIPE)(?:\s|:|$)/.test(upper[i])&&!/^FIPE\s*0\s*KM\b/.test(upper[i])){
   const combined=lines.slice(i,i+3).join(' ');
   const n=moneyFrom(combined);
   if(n!==null){fipeReference=n;break;}
  }
 }
 const scoreMatch=upper.join('\n').match(/\b(\d{1,2}(?:[.,]\d)?)\s*\/\s*10\b/);
 const conditionScore=scoreMatch?Number(scoreMatch[1].replace(',','.')):null;
 const repairDetails:string[]=[];
 let repairTotal:number|null=null;
 // Only count lines in item section that name a repair. This avoids FIPE and buyer bids.
 let inItems=false;
 for(let i=0;i<lines.length;i++){
  const row=upper[i];
  if(/\bITENS\s+AVALIADOS\b/.test(row)){inItems=true;continue;}
  if(/^(OPCIONAIS|SOLICITACAO|RESUMO DE COMPRA|HISTORICO|OBSERVACOES)\b/.test(row))inItems=false;
  if(inItems&&/\b(LATARIA|MOTOR|PNEU|PINTURA|REVISAO|MECANICA|FUNILARIA|POLIMENTO|ESTOFADO|VIDRO|SUSPENSAO|FREIO|CAMBIO|ESTETICA|PARACHOQUE)\b/.test(row)){
   const amount=moneyFrom(lines[i]);
   if(amount!==null&&amount<100000){
    repairDetails.push(lines[i].slice(0,120));
    repairTotal=(repairTotal||0)+amount;
   }
  }
 }
 if(!brand)warnings.push('Marca não reconhecida automaticamente.');
 if(!model)warnings.push('Modelo e versão não identificados.');
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
