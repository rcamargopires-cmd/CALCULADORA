import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('services/marketIqManagementData.ts','utf8');
const ui=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const dashboard=readFileSync('components/MarketIqManagementDashboard.tsx','utf8');
const fipe=readFileSync('api/marketiq-fipe.ts','utf8');
const history=readFileSync('services/marketiqPricingHistoryServer.ts','utf8');
const deployed=readFileSync('api/marketiq-market-scan.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert.equal((js.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const {parseDashboardData,filterDashboardRows,aggregateDashboard}=await import('data:text/javascript;base64,'+Buffer.from(js.outputText).toString('base64'));
const mk=(id,brand,model,type)=>({
 'ID Avaliação':id,'Status':'UTILIZADO','Marca':brand,'Modelo':model,'Tipo de Veículo':type,
 'Ano modelo':2024,'Valor avaliado':20000,'FIPE':24000,'KM':12000,
 'Data de Avaliação':'31/10/2026','Lojas':'OUTLET SOROCABA','Avaliador':'Outro'
});
const rows=[
 mk(1,'HONDA','CG 160 FAN','Motocicleta'),
 mk(2,'YAMAHA','FACTOR 150','MOTO'),
 mk(3,'HONDA','CITY LX','Automóvel'),
 mk(4,'BMW','R 1250 GS','Motocicleta'),
 mk(5,'HONDA','BIZ 125',''),
 mk(6,'SUZUKI','V-STROM 650',''),
 {...mk(7,'FIAT','MOBI LIKE','Carro'),'Avaliador':'DANIEL BARRUCHELLI DA SILVA'},
 mk(1,'HONDA','CG 160 FAN','Motocicleta'),
];
const parsed=parseDashboardData(rows,'original');
assert.equal(parsed.rows.length,6,'Cars and motorcycles retained, duplicate and excluded evaluator still removed');
assert.equal(parsed.motorcyclesIncluded,5);
assert.equal(parsed.excludedEvaluator,1);
assert.equal(parsed.duplicates,1);
assert.equal(parsed.rows.filter(x=>x.vehicleType==='car').length,1);
assert.equal(filterDashboardRows(parsed.rows,{vehicleType:'motorcycle',store:'',brand:'',model:'',className:'',destination:'',month:'',status:''}).length,5,'Type filter must isolate motorcycle group');
assert.equal(filterDashboardRows(parsed.rows,{vehicleType:'car',store:'',brand:'',model:'',className:'',destination:'',month:'',status:''}).length,1);
assert.equal(aggregateDashboard(parsed.rows).purchases,6,'Purchases from both types count in manager totals');
const batch=Array.from({length:138},(_,i)=>mk(i+100,'HONDA','CG 160 FAN','Motocicleta'));
const all=parseDashboardData(batch,'original');
assert.equal(all.rows.length,138,'138 motorbike rows should import rather than be excluded');
assert.equal(all.motorcyclesIncluded,138);
assert.ok(dashboard.includes('motocicletas incluídas'));
assert.ok(dashboard.includes("['vehicleType','Tipo']"));
assert.ok(dashboard.includes("motyq-iq-dashboard-local-v2-all-vehicles-"),'Old local-only import cannot silently remain without motorcycles');
assert.ok(fipe.includes("const vehicleType=String(source?.vehicleType||'car')==='motorcycle'?'motorcycles':'cars'"));
assert.ok(fipe.includes("const base=BASE_ROOT+'/'+vehicleType;"));
assert.ok(ui.includes('<option value="motorcycle">Motocicleta</option>'));
assert.ok(ui.includes("const query=new URLSearchParams({action,vehicleType,...params})"));
assert.ok(ui.includes("vehicleType==='motorcycle'||!fipe||!classification"),'Car-only trained history must never price motorcycles');
assert.ok(ui.includes("value:provisional?(vehicleType==='motorcycle'?0:"),'Missing motorcycle comparables must never use the car estimate or indexed floor');
assert.ok(ui.includes("vehicleType,plate,model,year,km,cost,repasse"));
assert.ok(history.includes("vehicleType:input.vehicleType==='motorcycle'?'motorcycle':'car'"));
assert.ok(deployed.includes("vehicleType:input.vehicleType==='motorcycle'?'motorcycle':'car'"));
console.log('Motyq IQ motorcycles: import 138, safe type filtering, FIPE and motorcycle appraisal safeguards passed.');
