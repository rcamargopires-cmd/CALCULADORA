import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const identity=readFileSync('services/marketIqDealerModelIdentity.ts','utf8');
const service=readFileSync('services/marketIqStockXRay.ts','utf8');
const component=readFileSync('components/MarketIqStockXRayPanel.tsx','utf8');
const radar=readFileSync('components/MarketIqDealerRadarPanel.tsx','utf8');
const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX};
const url=(source,name)=>{
 const transpiled=ts.transpileModule(source,{fileName:name,compilerOptions:options,reportDiagnostics:true});
 assert.equal(transpiled.diagnostics?.filter(x=>x.category===ts.DiagnosticCategory.Error).length||0,0,
  name+' TS must parse');
 return 'data:text/javascript;base64,'+Buffer.from(transpiled.outputText).toString('base64');
};
const identityUrl=url(identity,'identity.ts');
const serviceUrl=url(service.replaceAll('./marketIqDealerModelIdentity',identityUrl),'xray.ts');
const api=await import(serviceUrl);
const vehicle=(i,make,model,days,cost,price,store='LOJA A')=>({
 key:'KEY'+i,plate:'TST'+String(i).padStart(4,'0'),chassis:'CHASSIS'+i,
 brand:make,model,year:'2024/2025',days,price,cost,purchase:cost*0.9,
 km:45000,kmOriginal:'45000',kmValid:true,vehicleType:'car',
 fuel:'FLEX',transmission:'AT',operationalCost:0,osRule:0,osOutside:0,
 serviceOrders:0,store,buyingCompany:'ABRAO',location:'ESTOQUE',condition:'USADO',
 familyKey:'STALE LEGACY KEY',exactKey:'OLD MODEL KEY'
});
const cars=[
 vehicle(1,'VOLKSWAGEN','T-CROSS COMFORT',130,100000,120000),
 vehicle(2,'VOLKSWAGEN','VW/T CROSS SENSE',115,110000,90000),
 vehicle(3,'VOLKSWAGEN','T CROSS SENSE',92,90000,0),
 vehicle(4,'VOLKSWAGEN','T CROSS HIGHLINE',80,100000,125000),
 vehicle(5,'VOLKSWAGEN','T-CROSS 200 TSI',70,105000,124000),
 vehicle(6,'VOLKSWAGEN','T-ROC TSI',35,120000,150000,'LOJA B'),
 vehicle(7,'CHEVROLET','ONIX PLUS LT',170,75000,81000,'LOJA B'),
 vehicle(8,'CHEVROLET','ONIX LT',12,60000,70000),
 vehicle(9,'TOYOTA','CCROSS XRE',25,140000,170000),
 vehicle(10,'TOYOTA','COROLLA XEI',30,130000,155000,'LOJA B'),
 vehicle(11,'CHERY','TIGGO 7 SPORT',100,150000,170000),
 vehicle(12,'CHERY','TIGGO 8 PHEV',10,200000,250000),
 vehicle(13,'OMODA','OMODA E5',5,210000,260000)
];
const snapshot={reportDate:'2026-11-23',importedAt:'2026-11-23T14:00:00Z',
 vehicles:cars,duplicateCount:0,serviceOrderRows:0,warnings:[],stores:['LOJA A','LOJA B']};
const report=api.analyzeDealerStock(snapshot);
assert.equal(report.count,13);
assert.equal(report.families,9,'Do not combine T-Cross/T-Roc, Onix/Plus, Corolla/Cross, Tiggo7/8');
assert.equal(report.totalCost,cars.reduce((n,v)=>n+v.cost,0));
assert.equal(report.over90,5);
assert.equal(report.over90Cost,100000+110000+90000+75000+150000);
assert.equal(report.unknownPrice,1);
assert.equal(report.underCost,1);
assert.equal(report.stores,2);
assert.equal(report.hasPrevious,false);
assert.equal(report.exitsObserved,0,'Do not invent sales without second snapshot');
assert.ok(report.ranking.every(group=>group.score>=0&&group.score<=100));
const tcross=report.ranking.find(v=>v.family==='T-CROSS');
assert.equal(tcross.count,5);
assert.equal(tcross.over90,3);
assert.equal(tcross.signal,'review_pause','Multiple old cars should trigger human buy review');
assert.ok(report.actions.some(a=>a.type==='buy_review'&&a.familyKey===tcross.key));
assert.equal(report.ranking.find(v=>v.family==='T-ROC')?.count,1);
assert.equal(report.ranking.find(v=>v.family==='ONIX PLUS')?.count,1);
assert.equal(report.ranking.find(v=>v.family==='ONIX')?.count,1);
assert.equal(report.ranking.find(v=>v.family==='COROLLA CROSS')?.count,1);
assert.equal(report.ranking.find(v=>v.family==='COROLLA')?.count,1);
assert.deepEqual(api.scoreStockFamily({count:0,daysAverage:0,over90:0,costShare:0,missingPrice:0,underCost:0}),
 {score:0,temperature:'lower',signal:'monitor',reasons:[]});
const previous={...snapshot,reportDate:'2026-11-16',
 vehicles:[cars[0],cars[1],vehicle(15,'HYUNDAI','CRETA',35,90000,110000)]};
const compared=api.analyzeDealerStock(snapshot,previous);
assert.equal(compared.entriesObserved,11);
assert.equal(compared.exitsObserved,1);
assert.equal(compared.hasPrevious,true);
assert.equal(compared.ranking.find(v=>v.family==='CRETA'),undefined,
 'The live ranking contains current stock only, not vehicles that exited');
const sameDay=api.analyzeDealerStock(snapshot,{...previous,reportDate:snapshot.reportDate});
assert.equal(sameDay.exitsObserved,0,'Never treat same-day re-import as sales');
assert.ok(report.actions.some(a=>a.type==='reprice'));
assert.ok(report.actions.some(a=>a.type==='audit'));
assert.ok(report.actions.some(a=>a.type==='renew'));
assert.ok(component.includes('não são vendas confirmadas')||component.includes('Não são vendas confirmadas'));
assert.ok(component.includes('Não disponível:')&&component.includes('ranking de modelos mais vendidos'),
 'Must disclose sales data limitations');
assert.ok(component.includes('onFamilySelect(v.family)'),'Drilldown into existing Radar');
assert.ok(component.includes('setUnit')===false||component.includes("setUnit(e.target.value)"),
 'Unit filter must recompute analytics');
assert.ok(component.includes('cloudState'));
const home=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
assert.ok(home.includes('Raio-X do Estoque'));
assert.ok(home.includes("setStockXrayRequest(n=>n+1)"));
assert.ok(home.includes("navigateSimple('radar')"));
assert.ok(home.includes('xrayOpenRequest={stockXrayRequest}'));
assert.ok(radar.includes('xrayOpenRequest?:number'));
assert.ok(radar.includes('setShowXRay(true)'));
assert.ok(radar.includes('Raio-X do Estoque'));
assert.ok(radar.includes('MarketIqStockXRayPanel'));
assert.ok(radar.includes('onFamilySelect={openXRayFamily}'));
assert.ok(radar.includes("setSearch(family);setStore('all');setType('all');setFilter('all')"));
console.log('Raio-X IQ: families, scores, capital aging, cautions, per-unit recalculation, snapshot exits and honest no-sales evidence passed.');
