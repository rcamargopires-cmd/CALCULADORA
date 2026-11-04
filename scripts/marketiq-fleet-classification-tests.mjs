import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('services/marketIqFleetClassification.ts','utf8');
const panel=readFileSync('components/MarketIqFleetClassificationPanel.tsx','utf8');
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const server=readFileSync('services/marketiqPricingHistoryServer.ts','utf8');
const deployed=readFileSync('api/marketiq-market-scan.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
},reportDiagnostics:true});
assert.equal((js.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const {parseMileage,classifyByMileage,resolveFleetPolicy,REPASSE_REASONS}=await import('data:text/javascript;base64,'+
 Buffer.from(js.outputText).toString('base64'));
const expected=[
 [0,'A','SHOWROOM'],[1,'A','SHOWROOM'],[20000,'A','SHOWROOM'],
 [20001,'B','SHOWROOM'],[21000,'B','SHOWROOM'],[50000,'B','SHOWROOM'],
 [50001,'C','SHOWROOM'],[51000,'C','SHOWROOM'],[70000,'C','SHOWROOM'],
 [70001,'D','REPASSE'],[71000,'D','REPASSE'],[120000,'D','REPASSE'],
 [120001,'E','REPASSE'],[999999,'E','REPASSE']
];
for(const [km,group,destination] of expected){
 const info=classifyByMileage(km);
 assert.equal(info?.classification,group,'Mileage '+km+' class');
 assert.equal(info?.destination,destination,'Mileage '+km+' destination');
 assert.equal(resolveFleetPolicy({mileage:km}).destination,destination);
}
assert.equal(classifyByMileage('20.000')?.classification,'A');
assert.equal(classifyByMileage('20.001')?.classification,'B');
assert.equal(classifyByMileage('50.000')?.classification,'B');
assert.equal(classifyByMileage('50.001')?.classification,'C');
assert.equal(parseMileage(''),null,'Empty km must never become A');
assert.equal(parseMileage('40 mil'),null);
assert.equal(parseMileage('-10'),null);
assert.equal(parseMileage('20,5'),null);
assert.equal(parseMileage(12.5),null);
assert.equal(parseMileage('1000000'),null);
const ordinary=resolveFleetPolicy({mileage:'45.000'});
assert.equal(ordinary.classification,'B');
assert.equal(ordinary.destination,'SHOWROOM');
assert.equal(ordinary.isManual,false);
const downgraded=resolveFleetPolicy({mileage:'45.000',manualClassification:'D'});
assert.equal(downgraded.classification,'D');
assert.equal(downgraded.outOfRange,true);
assert.equal(downgraded.destination,'REPASSE');
const commercial=resolveFleetPolicy({mileage:'45.000',destinationOverride:'repasse'});
assert.equal(commercial.classification,'B');
assert.equal(commercial.destination,'REPASSE');
assert.equal(resolveFleetPolicy({mileage:90000,destinationOverride:'auto'}).destination,'REPASSE');
assert.equal(resolveFleetPolicy({mileage:90000,manualClassification:'B'}).outOfRange,true);
assert.equal(resolveFleetPolicy({mileage:'10.000',directRepasseReason:'leilao'}).destination,'REPASSE DIRETO');
for(const r of Object.keys(REPASSE_REASONS)){
 const result=resolveFleetPolicy({mileage:10000,directRepasseReason:r});
 assert.equal(result.destination,'REPASSE DIRETO',r+' forces direct repasse');
 assert.equal(result.direct,true);
}
assert.ok(panel.includes('Classificação e destino · Grupo Abrão Reze'));
assert.ok(panel.includes('Boa liquidez confirmada'),'Class C showroom requires a liquidity warning/check');
assert.ok(panel.includes('justifique')||panel.includes('Justifique'));
assert.ok(panel.includes('Repasse direto obrigatório'));
assert.ok(workspace.includes('fleetPolicy=resolveFleetPolicy({mileage:km'),'Live km must drive classification');
assert.ok(workspace.includes('<MarketIqFleetClassificationPanel km={km}'),'Visible panel wired');
assert.ok(workspace.includes('historicalClass:classification||undefined'),'New class stored with appraisal');
assert.ok(workspace.includes("directRepasseReason,goodLiquidity,"),'Reason and liquidity captured with appraisal');
assert.ok(workspace.includes('if(fleetPolicy.outOfRange&&classificationReason.trim().length<6)'),'Out-of-range override needs reason');
assert.ok(workspace.includes('repasse=fleetPolicy.destination!=='),'Destination controls existing repasse pricing');
assert.ok(workspace.includes('referenceAvg*.86*(repasse?.95:1)'),'Original preliminary ceiling unchanged');
for(const source of [server,deployed]){
 assert.ok(source.includes('directRepasseReason:')||source.includes('directRepasseReason,goodLiquidity'));
 assert.ok(source.includes("repasse:input.repasse===true||directRepasseReason!=='none'||['D','E'].includes(historicalClass)"),
  'Server enforces direct repasse and D/E repasse when saving');
 assert.ok(source.includes('classificationReason:text(input.classificationReason,280)'));
}
console.log('Grupo Abrão Reze classification: all KM limits, automatic destination, justified class override, forced direct repasse and persisted audit metadata passed.');
