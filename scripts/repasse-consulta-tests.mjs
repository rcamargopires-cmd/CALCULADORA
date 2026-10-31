// Focused pure-logic tests for the preview-only Repasse Sob Consulta tool.
// Executed during preview builds. No Firebase connection or browser is required.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import ts from 'typescript';

const source=readFileSync(join(process.cwd(),'services/marketIqConsultedRepasse.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
},reportDiagnostics:true});
const errors=(compiled.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
assert.equal(errors.length,0,ts.formatDiagnosticsWithColorAndContext(errors,{
  getCanonicalFileName:f=>f,getCurrentDirectory:()=>process.cwd(),getNewLine:()=>'\n'
}));
const service=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputText).toString('base64'));
const costs={invoice:'600',taxesFixed:'2500',taxesPercent:'0',transport:'0',
  preparation:'0',other:'1000',marginMode:'reais',margin:'5000'};
const makeOffer=(value,status='confirmada',validUntil='2099-12-31',id='o1')=>({
  id,buyer:'Loja de teste',value:String(value),channel:'telefone',
  status,receivedAt:'2026-10-30',validUntil,note:'',
});
const offer=makeOffer(145000);
const figure=service.calculateConsultedOffer(offer,costs);
assert.equal(figure.sale,145000);
assert.equal(figure.expenses,4100);
assert.equal(figure.margin,5000);
assert.equal(figure.ceiling,135900);
assert.equal(figure.netBeforeMargin,140900);
assert.equal(service.consultedFinancialInputsReady(costs),true);
assert.equal(service.consultedFinancialInputsReady({...costs,invoice:''}),false);
assert.equal(service.consultedFinancialInputsReady({...costs,invoice:'desconhecido'}),false);
assert.equal(service.consultedFinancialInputsReady({...costs,taxesPercent:'101'}),false);
assert.equal(service.consultedFinancialInputsReady({...costs,margin:'-1000'}),false);
assert.equal(service.isValidConsultedMoney('R$ 1.000,50',false),true);
assert.equal(service.isValidConsultedMoney('um mil',false),false);
assert.equal(service.chooseBestConfirmedOffer([offer],{...costs,margin:''}),null);
assert.equal(service.offerIsEligible(makeOffer(145000,'cotada')),false);
assert.equal(service.offerIsEligible(makeOffer(145000,'confirmada','2020-01-01')),false);
assert.equal(service.offerIsEligible(offer),true);
assert.equal(service.chooseBestConfirmedOffer([makeOffer(144000,'confirmada','2099-12-31','o2'),offer],costs).offer.id,'o1');
assert.equal(service.chooseBestConfirmedOffer([makeOffer(146000,'cotada','2099-12-31','o3'),offer],costs).offer.id,'o1');
const percent={...costs,marginMode:'percentual',margin:'5',taxesPercent:'4'};
assert.equal(service.calculateConsultedOffer(offer,percent).expenses,9900);
assert.equal(service.calculateConsultedOffer(offer,percent).margin,7250);
assert.equal(service.calculateConsultedOffer(offer,percent).ceiling,127850);
const base={
 id:'case-test',createdAt:'2026-10-30T10:00:00Z',updatedAt:'2026-10-30T10:00:00Z',
 version:0,vehicle:{plate:'ABC1D23',brand:'Toyota',model:'Hilux SW4',year:'2018',km:'126190',fipe:209845},
 offers:[offer],costs,selectedOfferId:'o1',proposedBuy:'125000',state:'consulta',events:[]
};
const first=service.appendConsultedAudit(null,base,'test@example.com');
assert.equal(first.version,1);
assert.equal(first.events.length,1);
assert.equal(first.events[0].newSuggestedCeiling,135900);
const updated=service.appendConsultedAudit(first,{...first,proposedBuy:'128000'},'test@example.com');
assert.equal(updated.version,2);
assert.equal(updated.events.length,2);
assert.equal(updated.events[1].formerSuggestedCeiling,135900);
assert.ok(updated.events[1].changes.some(x=>x.includes('125000')&&x.includes('128000')));
const summary=service.exportConsultedReportCsv([updated]);
const log=service.exportConsultedLogCsv([updated]);
assert.ok(summary.includes('Hilux SW4'));
assert.ok(log.includes('Valor proposto'));
assert.ok(!summary.includes('ABC1D23'),'Plate must not be in management export');
console.log('Motyq IQ Repasse Sob Consulta: 21 calculation, validation and audit checks passed.');
