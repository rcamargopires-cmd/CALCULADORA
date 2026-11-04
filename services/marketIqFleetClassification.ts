/**
 * Diretriz de classificação Grupo Abrão Reze, recebida em 04/11/2026.
 * A quilometragem estabelece uma classe INICIAL, não certifica conservação.
 * Os limites são contínuos: 20.001 km é B, 50.001 km é C etc.
 */
export type FleetClass='A'|'B'|'C'|'D'|'E';
export type DirectRepasseReason='none'|'sinistro'|'leilao'|'estrutura'|'cautelar';
export type DestinationOverride='auto'|'repasse';
export type FleetDestination='SHOWROOM'|'REPASSE'|'REPASSE DIRETO';
export type KmGuideline={
  classification:FleetClass;
  description:string;
  condition:string;
  destination:'SHOWROOM'|'REPASSE';
};
const rules:Readonly<Record<FleetClass,Omit<KmGuideline,'classification'>>>={
 A:{description:'Excelência / Estado de zero',condition:'Impecável, revisado, sem avarias; pneus e histórico excelentes.',destination:'SHOWROOM'},
 B:{description:'Seminovo selecionado',condition:'Apenas detalhes estéticos mínimos; revisões e histórico conferidos.',destination:'SHOWROOM'},
 C:{description:'Usado selecionado',condition:'Pequenas avarias ou desgaste natural; motor OK, revisão básica e boa liquidez.',destination:'SHOWROOM'},
 D:{description:'Repasse por desgaste',condition:'Desgaste moderado, pneus ou mecânica que exigem intervenção.',destination:'REPASSE'},
 E:{description:'Repasse crítico',condition:'KM superior a 120 mil ou estado crítico com reparo incompatível com margem.',destination:'REPASSE'}
};
export const REPASSE_REASONS:Readonly<Record<Exclude<DirectRepasseReason,'none'>,string>>={
 sinistro:'Histórico de sinistro',
 leilao:'Histórico de leilão',
 estrutura:'Apontamento ou dano estrutural',
 cautelar:'Divergência na vistoria cautelar'
};
export function parseMileage(value:unknown):number|null{
 if(typeof value==='number')return Number.isInteger(value)&&value>=0&&value<=999999?value:null;
 if(typeof value!=='string')return null;
 const raw=value.trim().replace(/\s/g,'');
 if(!raw||!/^(?:\d{1,6}|\d{1,3}(?:\.\d{3}){1,2})$/.test(raw))return null;
 const km=Number(raw.replace(/\./g,''));
 return Number.isInteger(km)&&km>=0&&km<=999999?km:null;
}
export function classifyByMileage(value:unknown):KmGuideline|null{
 const km=parseMileage(value);
 if(km===null)return null;
 const classification:FleetClass=km<=20000?'A':km<=50000?'B':km<=70000?'C':km<=120000?'D':'E';
 return {classification,...rules[classification]};
}
export function resolveFleetPolicy(input:{
 mileage:unknown; manualClassification?:FleetClass|''; destinationOverride?:DestinationOverride;
 directRepasseReason?:DirectRepasseReason
}):{
 guideline:KmGuideline|null;classification:FleetClass|null;
 destination:FleetDestination;isManual:boolean;outOfRange:boolean;direct:boolean
}{
 const guideline=classifyByMileage(input.mileage);
 const manual=input.manualClassification&&Object.prototype.hasOwnProperty.call(rules,input.manualClassification)?
  input.manualClassification:null;
 const classification=manual||guideline?.classification||null;
 const direct=!!input.directRepasseReason&&input.directRepasseReason!=='none';
 const destination:FleetDestination=direct?'REPASSE DIRETO':
  classification==='D'||classification==='E'||input.destinationOverride==='repasse'?'REPASSE':'SHOWROOM';
 return {guideline,classification,destination,isManual:!!manual,
  outOfRange:!!(manual&&guideline&&manual!==guideline.classification),direct};
}
