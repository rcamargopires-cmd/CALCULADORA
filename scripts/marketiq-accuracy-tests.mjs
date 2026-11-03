import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('services/marketIqAccuracy.ts','utf8');
const panel=readFileSync('components/MarketIqAccuracyPanel.tsx','utf8');
const learning=readFileSync('components/MarketIqLearningPanel.tsx','utf8');
const historyServer=readFileSync('services/marketiqPricingHistoryServer.ts','utf8');
const api=readFileSync('api/marketiq-market-scan.ts','utf8');
const learningSource=readFileSync('services/marketIqLearning.ts','utf8');

const js=ts.transpileModule(source,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
},reportDiagnostics:true});
assert.equal((js.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const {buildMarketIqAccuracy}=await import('data:text/javascript;base64,'+Buffer.from(js.outputText).toString('base64'));
const car=(id,estimate,paid,extra={})=>({
 id,vehicleType:'car',brand:'GM',model:'ONIX',plate:'ABC1D23',
 createdAt:'2026-11-02T13:00:00Z',paidRecordedAt:'2026-11-02T18:00:00Z',
 value:estimate,approvedValue:paid,fipe:{value:45000},...extra
});
const history=[
 car('a',9700,10000), // 3% under, in 3/5/10
 car('b',10500,10000), // 5% above, in 5/10
 car('c',5000,10000,{originalEstimatedValue:11000,revisionCount:2}), // 10% above
 car('d',12000,10000), // 20% above, outside 10
 {id:'m1',vehicleType:'motorcycle',brand:'YAMAHA',model:'FZ25',plate:'MOT1A23',
   value:12150,approvedValue:9000,provisional:true}, // 35%
 {id:'m2',vehicleType:'motorcycle',brand:'YAMAHA',model:'FZ25',plate:'MOT1A24',
   value:0,approvedValue:9000}, // known purchase without original prediction
 car('legacy',11000,12000,{groupedRecords:2}), // ambiguous due to duplicate plate/day
 car('future',11000,12000,{createdAt:'2026-11-03T14:00:00Z',
   paidRecordedAt:'2026-11-02T13:00:00Z'}) // payment precedes the estimate
];
const result=buildMarketIqAccuracy(history);
const all=result.all, cars=result.cars,motos=result.motorcycles;
assert.equal(cars.paidCount,6,'All paid cars counted even if excluded from accuracy');
assert.equal(cars.comparableCount,4);
assert.equal(cars.ambiguousCount,2,'Duplicate history and time conflict omitted from accuracy');
assert.equal(cars.within3Count,1);
assert.equal(cars.within5Count,2);
assert.equal(cars.within10Count,3);
assert.equal(cars.within3Percent,25);
assert.equal(cars.within5Percent,50);
assert.equal(cars.within10Percent,75);
assert.equal(cars.meanAbsoluteError,950);
assert.equal(cars.meanAbsolutePercent,9.5);
assert.equal(cars.medianAbsolutePercent,7.5);
assert.equal(cars.meanSignedError,800);
assert.equal(cars.outliers[0].id,'d','Highest relative mismatch first');
assert.equal(cars.outliers.find(x=>x.id==='c').estimated,11000,'Immutable original estimate wins over revised effective estimate');
assert.equal(motos.paidCount,2);
assert.equal(motos.comparableCount,1);
assert.equal(motos.withoutEstimateCount,1);
assert.equal(motos.meanAbsoluteError,3150);
assert.equal(motos.meanAbsolutePercent,35);
assert.equal(motos.preliminaryCount,1);
assert.equal(all.paidCount,8);
assert.equal(all.comparableCount,5);
assert.equal(all.withoutEstimateCount,1);
assert.equal(all.ambiguousCount,2);
assert.equal(all.within3Percent,20);
assert.equal(all.within5Percent,40);
assert.equal(all.within10Percent,60);
assert.equal(all.meanAbsoluteError,1390);
assert.equal(all.outliers[0].vehicle,'YAMAHA FZ25');
assert.equal(buildMarketIqAccuracy([]).all.within5Percent,null,'No sample: do not report 0% as a failure');
assert.equal(buildMarketIqAccuracy([car('only-paid',0,10000)]).all.comparableCount,0);
assert.equal(buildMarketIqAccuracy([car('only-paid',0,10000)]).all.paidCount,1);
assert.equal(buildMarketIqAccuracy([car('x',10500,10000),car('x',10500,10000)]).all.comparableCount,1,'Repeated ids do not inflate accuracy');
assert.equal(buildMarketIqAccuracy([car('rev',11000,10000,{revisionCount:1})]).all.comparableCount,0,'Revised records without immutable baseline are excluded');
assert.ok(panel.includes('Dentro de ±{item.limit}%'),'Show 3, 5 and 10 percent thresholds');
assert.ok(panel.includes('comparações válidas')||panel.includes('Comparações válidas'));
assert.ok(panel.includes('Maiores divergências'));
assert.ok(panel.includes('Amostra pequena'),'Low sample size must be explicit');
assert.ok(learning.includes('<MarketIqAccuracyPanel history={history}/>'),'Scorecard must be wired to authenticated history');
assert.ok(historyServer.includes('originalEstimatedValue:entry.value'),'Original saved price must be immutable across revisions');
assert.ok(api.includes('originalEstimatedValue:entry.value'),'Deployed API must include same immutable source');
assert.ok(learningSource.includes('const originalEstimate='),'Learning error metric must reuse original values, not edited prices');
assert.ok(!source.includes('localStorage'),'Pure accuracy does not use unverified imported purchases or identifying browser data');
console.log('Motyq IQ accuracy: correct 3/5/10 thresholds, exclusions, immutable original, transparent sample, cars/motos and UI integration passed.');
