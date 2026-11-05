/** Motyq IQ: local parsing, never a substitute for FIPE catalog confirmation. */
export type VoiceFuel='Flex'|'Gasolina'|'Diesel'|'Etanol'|'Híbrido'|'Elétrico';
export type VoiceDraft={
 kind:'appraisal';transcript:string;vehicleType:'car'|'motorcycle';
 brandHint:string;modelHint:string;year:number|null;km:number|null;fuel:VoiceFuel|'';plate:string;
};
export type VoiceResult=VoiceDraft|{kind:'history'|'empty';transcript:string};
export type CatalogOption={code:string;name:string};
const norm=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const has=(s:string,t:string)=>(' '+s+' ').includes(' '+t+' ');
const known:Array<[string,string,('car'|'motorcycle')?]>=[
 ['onix','Chevrolet'],['tracker','Chevrolet'],['spin','Chevrolet'],['montana','Chevrolet'],
 ['creta','Hyundai'],['hb20','Hyundai'],['t cross','Volkswagen'],['nivus','Volkswagen'],
 ['polo','Volkswagen'],['jetta','Volkswagen'],['strada','Fiat'],['argo','Fiat'],
 ['mobi','Fiat'],['pulse','Fiat'],['compass','Jeep'],['renegade','Jeep'],
 ['corolla','Toyota'],['hilux','Toyota'],['hr v','Honda'],['civic','Honda'],
 ['kicks','Nissan'],['fazer','Yamaha','motorcycle'],['factor','Yamaha','motorcycle'],
 ['nmax','Yamaha','motorcycle'],['cg 160','Honda','motorcycle'],
 ['biz 125','Honda','motorcycle'],['pop 110','Honda','motorcycle']
];
const brands:Array<[string,string]>=[
 ['vw','Volkswagen'],['volkswagen','Volkswagen'],['volks','Volkswagen'],
 ['gm','Chevrolet'],['chevrolet','Chevrolet'],['chevy','Chevrolet'],
 ...['Fiat','Hyundai','Toyota','Honda','Yamaha','Jeep','Ford','Nissan',
 'Renault','Peugeot','Citroën','Audi','BMW','Bajaj'].map(v=>[norm(v),v] as [string,string])
];
function mileage(text:string):{km:number|null;snippet:string}{
 const m=/\b(\d{1,3})(?:[,.](\d))?\s*mil(?:\s*(?:km|quil[oô]metros?))?\b/i.exec(text);
 if(m){const n=Number(m[1])*1000+(m[2]?Number(m[2])*100:0);
  if(n>0&&n<=999999)return {km:n,snippet:m[0]};}
 const direct=/\b(\d{1,3}(?:[.,]\d{3})+|\d{4,6})\s*(?:km|quil[oô]metros?)\b/i.exec(text);
 if(direct){const n=Number(direct[1].replace(/[.,]/g,''));
  if(n>0&&n<=999999)return {km:n,snippet:direct[0]};}
 const written=norm(text).match(/\b(vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa)(?: e (um|dois|tres|quatro|cinco|seis|sete|oito|nove))? mil\b/);
 if(written){
  const tens:Record<string,number>={vinte:20,trinta:30,quarenta:40,cinquenta:50,sessenta:60,setenta:70,oitenta:80,noventa:90};
  const units=['','um','dois','tres','quatro','cinco','seis','sete','oito','nove'];
  return {km:(tens[written[1]]+(written[2]?units.indexOf(written[2]):0))*1000,snippet:written[0]};
 }
 return {km:null,snippet:''};
}
export function parseVoiceAppraisal(raw:unknown,currentYear=new Date().getFullYear()):VoiceResult{
 const transcript=typeof raw==='string'?raw.trim().replace(/\s+/g,' '):'';
 if(!transcript)return {kind:'empty',transcript:''};
 const text=norm(transcript);
 const spokenBrand=brands.find(([alias])=>has(text,alias));
 const inferred=known.find(([name])=>has(text,name));
 const brandHint=spokenBrand?.[1]||inferred?.[1]||'';
 const explicitMotorcycle=/\b(moto|motocicleta|scooter)\b/.test(text);
 const vehicleType=explicitMotorcycle||inferred?.[2]==='motorcycle'?'motorcycle':'car';
 const years=[...transcript.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map(m=>Number(m[1]))
  .filter(y=>y>=1990&&y<=currentYear+2);
 const year=years.length?years[years.length-1]:null;
 const kmResult=mileage(transcript);
 const command=/\b(avaliar|avalia[çc][ãa]o|precificar|precifica[çc][ãa]o)\b/i.test(transcript);
 if(!command&&!(year&&kmResult.km&&inferred))return {kind:'history',transcript};
 const fuelMap:Array<[RegExp,VoiceFuel]>=[
  [/\bflex\b/,'Flex'],[/\bdiesel\b/,'Diesel'],[/\bgasolina\b/,'Gasolina'],
  [/\b(etanol|alcool|álcool)\b/,'Etanol'],[/\b(hibrido|híbrido)\b/,'Híbrido'],
  [/\b(eletrico|elétrico)\b/,'Elétrico']];
 const fuel=fuelMap.find(([re])=>re.test(transcript))?.[1]||'';
 const plateText=transcript.toUpperCase().match(/\b[A-Z]{3}[- ]?[0-9][A-Z0-9][- ]?[0-9]{2}\b/);
 const plate=plateText?plateText[0].replace(/[^A-Z0-9]/g,''):'';
 let modelText=norm(transcript).replace(norm(kmResult.snippet),'')
  .replace(/\b(?:19\d{2}|20\d{2})\b/g,'').replace(norm(plateText?.[0]||''),'');
 for(const [alias] of brands)if(spokenBrand?.[0]===alias){
  modelText=(' '+modelText+' ').replace(' '+alias+' ',' ').trim();break;
 }
 modelText=modelText.replace(/\b(avaliar|avaliacao|precificar|precificacao|quero|gostaria|fazer|uma|um|o|a|de|do|da|ano|modelo|carro|moto|motocicleta|scooter|com|quilometros|km|mil)\b/g,' ')
  .replace(/\b(flex|diesel|gasolina|etanol|alcool|hibrido|eletrico)\b/g,' ')
  .replace(/\s+/g,' ').trim();
 // "Fazer" also names a Yamaha model; preserve the keyword when it is
 // unambiguously a model, not the verb "fazer".
 if(inferred?.[0]==='fazer'&&!has(modelText,'fazer'))modelText='fazer '+modelText;
 if(!modelText&&inferred)modelText=inferred[0];
 return {kind:'appraisal',transcript,vehicleType,brandHint,
  modelHint:modelText,year,km:kmResult.km,fuel,plate};
}
export function findVoiceBrand(draft:VoiceDraft,options:CatalogOption[]):CatalogOption|null{
 const hint=norm(draft.brandHint);
 if(!hint)return null;
 const exact=options.filter(b=>norm(b.name)===hint);
 return exact.length===1?exact[0]:null;
}
export function suggestVoiceModels(modelHint:string,models:CatalogOption[]):CatalogOption[]{
 const words=norm(modelHint).split(' ').filter(w=>w.length>0&&!['de','do','da'].includes(w));
 if(!words.length)return models;
 const all=models.map(m=>{
  const label=norm(m.name),hits=words.filter(w=>has(label,w)).length;
  return {model:m,score:hits};
 }).filter(v=>v.score>0).sort((a,b)=>b.score-a.score||a.model.name.localeCompare(b.model.name,'pt-BR'));
 const perfect=all.filter(v=>v.score===words.length);
 return (perfect.length?perfect:all).map(v=>v.model);
}
