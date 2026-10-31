import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const api=readFileSync('api/marketiq-market-scan.ts','utf8');
const ui=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const range=(start,end)=>{
 const i=api.indexOf(start),j=api.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'Expected market parser section: '+start);
 return api.slice(i,j);
};
const pure=range('const string =','type Source =')+'\n'+range('const priceOf =','const riskWords =');
const bundled=ts.transpileModule(pure+'\nresult={marketBrand,priceOf,kmOf};',{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},
 reportDiagnostics:true
});
const errors=(bundled.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
assert.equal(errors.length,0,'Market parser TS syntax failed');
const globals={result:null};
runInNewContext(bundled.outputText,globals);
const {marketBrand,priceOf,kmOf}=globals.result;
assert.equal(marketBrand('VW - VolksWagen'),'VolksWagen');
assert.equal(marketBrand('GM - Chevrolet'),'Chevrolet');
assert.equal(marketBrand('Jeep'),'Jeep');
assert.equal(marketBrand('Land Rover'),'Land Rover');
assert.equal(priceOf('R$ 123.990 abaixo da FIPE'),123990);
assert.equal(priceOf('R$ 0'),0);
assert.equal(kmOf('2022/2022 96.000 Km Campinas'),96000);
assert.equal(kmOf('48.900 quilômetros'),48900);
assert.equal(kmOf('com 42 mil km rodados'),42000);
assert.ok(ui.includes('disabled={autoLoading||!searchReady}'),'Market search must not wait for FIPE');
assert.ok(ui.includes('year:marketYear'),'Market request must use selected model year');
assert.ok(ui.includes('const [ads,setAds]=useState<Ad[]>([])'),'Do not initialize false blank results');
assert.ok(ui.includes('autoAttempted.current.has(vehicleKey)'),'Prevent repeated automatic requests');
assert.ok(ui.includes('currentAds=adsVehicleKey===vehicleKey?ads:[]'),'Do not mix listings between vehicles');
assert.ok(ui.includes('Sem anúncios indexados · usando histórico de compras'),'Show historical alternative transparently');
assert.ok(!ui.includes('disabled={autoLoading||!fipe||number(km)<=0}'),'Old FIPE dependency must be removed');
console.log('MarketIQ search readiness and parser regression: 18 assertions passed.');
