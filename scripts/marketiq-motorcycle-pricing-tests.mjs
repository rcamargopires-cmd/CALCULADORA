import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const source=readFileSync('services/marketIqMotorcycleReference.ts','utf8');
const backend=readFileSync('api/marketiq-market-scan.ts','utf8');
const ui=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const transpiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});
assert.equal((transpiled.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const module={exports:{}};
runInNewContext(transpiled.outputText,{exports:module.exports,module,Number,Math,Set,String,Array});
const {calculateMotorcycleMarketReference,loadMotorcyclesForUser}=module.exports;
const row=(type,status,price,fipe,brand='YAMAHA',model='FZ25 FAZER',year=2018,km=64000)=>({
 vehicleType:type,status,value:price,fipe,brand,model,year,km,date:'2026-10-31',
 month:'2026-10',store:'OUTLET',destination:'SHOWROOM',className:'B',preparation:500,webReference:17000
});
const sample=[
 row('motorcycle','COMPRA',12000,16000),
 row('motorcycle','COMPRA',12500,16000),
 row('motorcycle','COMPRA',11500,16000),
 row('motorcycle','COMPRA',999,16000),
 row('motorcycle','COTACAO',18000,16000),
 row('car','COMPRA',70000,90000,'VW','POLO',2020,40000),
];
const base={brand:'YAMAHA',model:'FZ25 FAZER 250 FLEX',year:2018,km:64000,fipe:15960};
let ref=calculateMotorcycleMarketReference(sample,base);
assert.equal(ref.scope,'model');
assert.equal(ref.sampleSize,3,'Only three same-model motorcycle purchase proxies may be counted');
assert.equal(ref.meanRatio, .75,'Mean of historical paid/approved proxy ratios');
assert.equal(ref.medianRatio,.75);
assert.equal(ref.meanIndication,11950);
assert.equal(ref.medianIndication,11950);
assert.equal(ref.calibrated,false);
assert.equal(calculateMotorcycleMarketReference(sample.slice(0,2),base),null,'Two unrelated samples cannot create a motorcycle reference');
const cross=[
 row('motorcycle','COMPRA',10000,20000,'HONDA','CG 160'),
 row('motorcycle','COMPRA',16000,20000,'HONDA','BIZ 125'),
 row('motorcycle','COMPRA',17000,20000,'HONDA','PCX'),
 row('motorcycle','COMPRA',19000,20000,'YAMAHA','FACTOR'),
 row('motorcycle','COMPRA',17500,20000,'BMW','F 850'),
];
ref=calculateMotorcycleMarketReference(cross,base);
assert.equal(ref.scope,'motorcycles','No exact motorcycle match requires multiple independent observations');
assert.equal(ref.sampleSize,5);
assert.equal(ref.medianRatio,.85);
const noCar=calculateMotorcycleMarketReference([row('car','COMPRA',12000,16000)],base);
assert.equal(noCar,null,'Historical car observations never backfill motorcycle mean');
const localRows=[
 row('motorcycle','COMPRA',12000,16000),
 row('car','COMPRA',70000,90000,'VW','POLO')
];
const mockStore={getItem:(key)=>key==='motyq-iq-dashboard-local-v2-all-vehicles-teste@example.com'?JSON.stringify(localRows):null};
const run=runInNewContext(transpiled.outputText,{exports:{},module:{exports:{}},localStorage:mockStore,Number,Math,Set,String,Array});
assert.ok(ui.includes("vehicleType==='motorcycle'?'Pesquisar motos na Webmotors'"));
assert.ok(ui.includes('calculateMotorcycleMarketReference(motorcycleRows'));
assert.ok(ui.includes('Média de valores avaliados'));
assert.ok(ui.includes('Amostra: {motorcycleReference.sampleSize}'));
assert.ok(!ui.includes("if(vehicleType==='motorcycle'){setAutoError('Para motos"));
assert.ok(backend.includes("path.startsWith('/motos-usadas/')"));
assert.ok(backend.includes("vehicleType==='motorcycle'?2500:15000"),'Motorcycle asking prices below R$ 15k must be eligible');
assert.ok(backend.includes("site:webmotors.com.br/motos-usadas/"),'Motorcycle queries must use the real Webmotors moto catalog');
assert.ok(backend.includes("search(queryBase + ' motocicleta '"));
assert.ok(backend.includes("vehicleType+'|'"),'Market cache must not mix cars and motorcycles');
assert.ok(ui.includes("vehicleType==='motorcycle'?1.60:1.05"),'Motorcycle index samples should not be discarded at the car FIPE cap');
assert.ok(backend.includes("Number(yearPair[1])!==year"),'Webmotors production year must not be mistaken for model year');
console.log('Motyq IQ motorcycle valuation: sample means, FIPE comparison, motorcycle-only market search and UI tests passed.');
