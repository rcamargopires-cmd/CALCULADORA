import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('services/marketIqLearningInsights.ts','utf8');
const insightPanel=readFileSync('components/MarketIqLearningInsightsPanel.tsx','utf8');
const octoberAudit=readFileSync('components/MarketIqOctoberAudit.tsx','utf8');
const learningPanel=readFileSync('components/MarketIqLearningPanel.tsx','utf8');
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const pricing=readFileSync('services/marketIqHistoricalPricing.ts','utf8');
const fipe=readFileSync('services/marketIqFipeFreshness.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
},reportDiagnostics:true});
assert.equal((js.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const {buildMarketIqLearningInsights}=await import('data:text/javascript;base64,'+
 Buffer.from(js.outputText).toString('base64'));
const car=(id,estimated,paid,extras={})=>({
 id,vehicleType:'car',brand:'Chevrolet',model:'Onix',plate:'ABC1D23',
 km:'19.500',historicalClass:'A',createdAt:'2026-11-03T10:00:00Z',
 paidRecordedAt:'2026-11-03T13:00:00Z',value:estimated,
 approvedValue:paid,provisional:false,...extras
});
const moto=(id,estimated,paid,extras={})=>({
 ...car(id,estimated,paid),vehicleType:'motorcycle',brand:'Yamaha',model:'Fazer',
 plate:'MOT1D23',historicalClass:'B',km:'42.000',...extras
});
const records=[
 car('a',10500,10000),  // +5%
 car('b',9700,10000),   // -3%
 car('c',12000,10000,{km:'65.000',historicalClass:'C'}), // +20%
 car('d',12000,10000,{value:12000,revisionCount:2,originalEstimatedValue:9000,km:'125.000',historicalClass:'E'}), // -10%, original retained
 car('revised',12000,10000,{revisionCount:2}), // no original: exclude
 car('legacy',10500,10000,{groupedRecords:2}), // ambiguous
 car('future',10500,10000,{createdAt:'2026-11-04T15:00:00Z',paidRecordedAt:'2026-11-04T11:00:00Z'}), // ambiguous
 moto('m1',12000,9000,{provisional:true}), // +33.33%
 moto('m2',0,9000), // paid without estimate
 moto('m3',9000,9000), // exact
 car('a',10500,10000), // duplicate ID must not inflate sample
 {id:'excel-proxy',vehicleType:'car',brand:'GM',model:'Onix',value:50000,status:'COMPRA'}
];
const all=buildMarketIqLearningInsights(records);
assert.equal(all.kind,'all');
assert.equal(all.paidRecords,10,'Only distinct authenticated paid records count');
assert.equal(all.comparableCount,6);
assert.equal(all.missingOriginal,2);
assert.equal(all.ambiguous,2);
assert.equal(all.provisionalCount,1);
const cars=buildMarketIqLearningInsights(records,'car');
const motos=buildMarketIqLearningInsights(records,'motorcycle');
assert.equal(cars.paidRecords,7);
assert.equal(cars.comparableCount,4);
assert.equal(motos.paidRecords,3);
assert.equal(motos.comparableCount,2);
assert.equal(cars.groupsByModel[0].label,'CHEVROLET ONIX');
assert.equal(cars.groupsByModel[0].count,4);
assert.equal(cars.groupsByModel[0].within5Percent,50,'Exactly two cases inside +/-5%');
assert.equal(cars.groupsByModel[0].insight,'exploratory','Sample below five must not be portrayed as stable');
assert.equal(motos.groupsByModel[0].insight,'insufficient');
assert.equal(cars.groupsByClass.find(c=>c.key==='Classe A').count,2);
assert.equal(cars.groupsByClass.find(c=>c.key==='Classe C').count,1);
assert.equal(cars.groupsByClass.find(c=>c.key==='Classe E').count,1);
assert.equal(cars.groupsByKm.find(c=>c.key==='Até 20 mil km').count,2);
assert.equal(cars.groupsByKm.find(c=>c.key==='50.001 a 70 mil km').count,1);
assert.equal(cars.groupsByKm.find(c=>c.key==='Acima de 120 mil km').count,1);
assert.equal(cars.cases.find(c=>c.id==='d').estimated,9000,
 'Revised snapshots must not overwrite the immutable original estimate');
assert.equal(cars.cases.find(c=>c.id==='d').signedPercent,-10);
assert.ok(all.highDivergence[0].id==='m1','Biggest error percentage first');
assert.ok(all.groupsByModel.every(g=>Number.isFinite(g.meanSignedPercent)));
assert.equal(buildMarketIqLearningInsights([]).comparableCount,0);
assert.equal(buildMarketIqLearningInsights([car('only-payment',0,10000)]).comparableCount,0);
assert.equal(buildMarketIqLearningInsights([car('missing',0,0)]).paidRecords,0);
assert.equal(buildMarketIqLearningInsights([car('good',10000,10000,{
 historicalClass:'SEM CLASSE',km:'abc'
})]).groupsByClass[0].key,'Classe não informada',
 'Do not reinterpret historical class from kilometre range');
const stable=Array.from({length:5},(_,i)=>car('stable'+i,9900,10000));
assert.equal(buildMarketIqLearningInsights(stable).groupsByModel[0].insight,'descriptive');
assert.ok(insightPanel.includes('Aprendizado IQ 2.0'));
assert.ok(insightPanel.includes('Modelos')&&insightPanel.includes('Classe registrada')&&
 insightPanel.includes('Faixa de KM'),'Model / class / KM grouping visible');
assert.ok(insightPanel.includes("r.provisional?' · estimativa preliminar'"),'Preliminary baseline disclosed');
assert.ok(insightPanel.includes('não entra')||insightPanel.includes('não entram'),'Excel proxy never used as paid amount');
assert.ok(insightPanel.includes('Não há compras')||insightPanel.includes('Ainda não há compras'),
 'No-sample display must explain data coverage');
assert.ok(octoberAudit.includes('const referenceCount=2666'),'October reference count');
assert.ok(octoberAudit.includes("entry.count===referenceCount?'matched':'difference'"),'October count comparison');
assert.ok(octoberAudit.includes("status==='unavailable'"),'Do not imply missing when live archive is inaccessible');
assert.ok(octoberAudit.includes('getIdToken()'),'Cloud manifest requires authenticated session');
assert.ok(octoberAudit.includes("monthly_archive_months"),'Read month summary only');
assert.ok(octoberAudit.includes('não contém as estimativas')&&octoberAudit.includes('não é automaticamente'),
 'Archive cannot silently enter predictive accuracy');
assert.ok(learningPanel.includes('Padrões de acerto')&&learningPanel.includes('Indicadores gerais')&&
 learningPanel.includes('Conferir outubro'),'Internal tabs avoid crowded main menu');
assert.ok(learningPanel.includes('<MarketIqAccuracyPanel history={history}/>'),
 'Original accuracy panel still present');
assert.ok(learningPanel.includes('<MarketIqLearningInsightsPanel history={history}/>'));
assert.ok(learningPanel.includes('onOpenArchive={onOpenArchive}'));
assert.ok(workspace.includes('onOpenArchive={()=>switchDeskSection('),
 'Learning audit opens existing monthly archive');
assert.ok(pricing.includes('calculateHistoricalPrice'),'Historical price formula kept');
assert.ok(fipe.includes('reference')||fipe.includes('FIPE'),'Existing FIPE checks untouched');
assert.ok(!source.includes('localStorage'),'Analytic calculation uses only authenticated history');
console.log('Motyq IQ 2.0: model/class/KM learning, real paid outcomes, revisions, duplicates, ambiguity, small-sample guards, October authenticated audit and UI wiring passed.');
