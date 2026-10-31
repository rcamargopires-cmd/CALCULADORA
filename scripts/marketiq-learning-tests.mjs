import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('services/marketIqLearning.ts','utf8');
const ui=readFileSync('components/MarketIqLearningPanel.tsx','utf8');
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
assert.equal((js.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const {buildMarketIqLearning}=await import('data:text/javascript;base64,'+Buffer.from(js.outputText).toString('base64'));
const row=(vehicleType,status,value,fipe,brand='HONDA',model='CG 160')=>({
 vehicleType,status,value,fipe,brand,model,date:'2026-10-31',month:'2026-10',km:6000,year:2025,
 store:'Outlet',className:'B',destination:'SHOWROOM',preparation:400,webReference:0
});
const records=[
 row('motorcycle','COMPRA',15000,20000),
 row('motorcycle','COTACAO',19000,20000),
 row('car','COMPRA',70000,100000,'VW','POLO'),
 row('car','COTACAO',80000,100000,'VW','POLO'),
 row('motorcycle','REPASSE PENDENTE',1,20000)
];
const history=[
 {id:'a',vehicleType:'motorcycle',brand:'HONDA',model:'CG 160',value:15000,fipe:{value:20000},approvedValue:16000,paidValue:14000},
 {id:'b',vehicleType:'car',brand:'VW',model:'POLO',value:80000,fipe:{value:100000},approvedValue:81000},
];
const summary=buildMarketIqLearning(records,history,new Date('2026-10-31T18:00:00Z'));
assert.equal(summary.importedTotal,5);
assert.equal(summary.cloudTotal,2);
const bike=summary.categories.find(x=>x.kind==='motorcycle');
const car=summary.categories.find(x=>x.kind==='car');
assert.equal(bike.importedEvaluations,3);
assert.equal(bike.importedPurchases,1);
assert.equal(bike.importedRepasse,1);
assert.equal(bike.purchaseProxy.count,1);
assert.equal(bike.purchaseProxy.median,.75,'Historical value from status COMPRA stays a proxy');
assert.equal(bike.cloudApprovedCount,1);
assert.equal(bike.cloudPaidCount,1);
assert.equal(bike.paid.median,.7,'Only actual paid evidence feeds paid ratio');
assert.equal(bike.approved.median,.8,'Approved value is a separate target');
assert.equal(bike.paidEstimateMae,1000);
assert.equal(bike.paidEstimateBias,-1000);
assert.equal(bike.calibrationCandidate,null,'One paid motorcycle must never alter predictions');
assert.equal(car.paid.count,0);
assert.equal(car.purchaseProxy.count,1);
assert.equal(car.cloudApprovedCount,1);
assert.equal(car.cloudPaidCount,0);
const manyPaid=Array.from({length:30},(_,i)=>({
 id:String(i),vehicleType:'motorcycle',brand:'HONDA',model:'MOTO '+(i%5),
 value:14000,fipe:{value:20000},paidValue:15000,
}));
const ready=buildMarketIqLearning([],manyPaid).categories.find(c=>c.kind==='motorcycle');
assert.equal(ready.readiness,'validation_ready');
assert.equal(ready.calibrationCandidate.count,30);
assert.equal(ready.calibrationCandidate.models,5);
assert.equal(ready.calibrationCandidate.percent,5,'The suggested correction is capped at 5% of FIPE');
const sameModel=buildMarketIqLearning([],manyPaid.map(r=>({...r,model:'CG 160'}))).categories.find(c=>c.kind==='motorcycle');
assert.equal(sameModel.calibrationCandidate,null,'30 copies of one model are not diverse enough');
assert.ok(ui.includes('Aprendizado contínuo'));
assert.ok(ui.includes('Status COMPRA no arquivo'));
assert.ok(ui.includes('valor efetivamente pago'));
assert.ok(workspace.includes('Aprendizado IQ'));
assert.ok(workspace.includes('history={saved} onRefresh={refreshHistory}'));
assert.ok(!source.includes('localStorage'),'Pure learning engine must not access identifying browser data');
console.log('Motyq IQ Learning: separate appraisals approvals paid outcomes, robust confidence and UI wiring passed.');
