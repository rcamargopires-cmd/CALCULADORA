import {parseAutoAvaliarOcrText} from './marketIqExpressOcrParser';
import {cleanExpressVehicle,type ExpressVehicleExtract} from './marketIqExpress';

/** Clipboard text is parsed in memory and discarded. No customer identifiers,
 * addresses, email, chassis or Renavam are read into the returned vehicle.
 * This path does not call OCR or a paid provider.
 */
export function parseAutoAvaliarClipboardText(raw:string):ExpressVehicleExtract{
 const input=String(raw||'');
 if(input.length<30||input.length>150000)throw new Error('Copie o quadro com os dados da avaliação (modelo, placa, ano e KM).');
 const normalized=input.replace(/\r/g,'').replace(/\u00a0/g,' ').replace(/\t/g,' ').trim();
 const hasLabel=(pattern:RegExp)=>pattern.test(normalized);
 const indicators=[
  hasLabel(/\bPLACA\b/i),hasLabel(/\bANO\b/i),hasLabel(/\b(?:KM|QUILOMETRAGEM)\b/i),
  hasLabel(/\b(?:FIPE|REFER[EÊ]NCIAS)\b/i),hasLabel(/\b(?:ORIGEM|C[AÂ]MBIO|COMB\.)\b/i)
 ].filter(Boolean).length;
 if(indicators<2)throw new Error('O texto copiado não parece ser uma ficha do AutoAvaliar. Selecione os dados da avaliação e copie novamente.');
 let data:ExpressVehicleExtract;
 try{data=parseAutoAvaliarOcrText(normalized);}catch{
  throw new Error('Não consegui localizar o veículo no texto copiado. Copie o quadro que contém modelo, placa, ano e KM.');
 }
 if(!data.brand||!data.model)throw new Error('Não identifiquei marca e versão no texto copiado. Inclua também o cabeçalho do veículo.');
 const copiedFields=[Boolean(data.plate),Boolean(data.yearModel),data.km!==null].filter(Boolean).length;
 if(copiedFields<2)throw new Error('Preciso de pelo menos dois dados entre placa, ano e KM para conferir a avaliação copiada.');
 // Only structured vehicle fields are returned; the original copied text is
 // neither stored nor included in errors, logs, or telemetry.
 return cleanExpressVehicle({
  ...data,
  warnings:[
   'Dados extraídos do texto copiado: confira placa, versão, FIPE e KM antes de usar.',
   ...data.warnings.filter(x=>!x.startsWith('Leitura local experimental:'))
  ]
 });
}
