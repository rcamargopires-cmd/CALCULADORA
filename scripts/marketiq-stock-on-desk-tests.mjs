import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const service=readFileSync('services/marketIqDealerFamilyStock.ts','utf8');
const panel=readFileSync('components/MarketIqStockOnDeskPanel.tsx','utf8');
const desk=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
for(const [name,src] of [['service',service],['panel',panel],['desk',desk]]){
 const compiled=ts.transpileModule(src,{fileName:name+'.tsx',compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX
 },reportDiagnostics:true});
 assert.equal((compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,
 0,name+' should be valid TypeScript/JSX');
}
const js=ts.transpileModule(service,{compilerOptions:{target:ts.ScriptTarget.ES2022,
 module:ts.ModuleKind.ESNext}}).outputText;
const lookup=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const make=(plate,brand,model,year,days,purchase,cost,price,vehicleType='car')=>({
 key:'PLATE:'+plate,plate,brand,model,year,days,purchase,cost,price,vehicleType,
 store:'Sorocaba',km:80000,kmValid:true,kmOriginal:'80000'
});
const vehicles=[
 make('ABC1D23','VW','I VW T CROSS 1.0 200 TSI SENSE','2021/2022',68,70000,73000,85900),
 make('XYZ9K12','VOLKSWAGEN','TCROSS COMFORTLINE 200TSI','2020/2021',112,74000,76300,87900),
 make('TRO1A23','Volkswagen','T-ROC 1.4 TSI','2021/2022',35,80000,82400,96000),
 make('COR1A23','TOYOTA','COROLLA XEI 2.0','2021/2022',20,82000,85000,105000),
 make('CRS1A23','TOYOTA','COROLLA CROSS XR 2.0','2021/2022',15,105000,110000,136000),
 make('GMX4Z15','GM - Chevrolet','TRACKER LTZ TURBO','2021/2022',93,65000,68000,84500),
 make('GMC1Z15','GMC','TRACKER LTZ TURBO','2021/2022',21,40000,42000,60000),
 make('HB21A23','HYUNDAI','HB20 1.0','2021/2022',23,35000,37000,50000),
 make('HBS1A23','HYUNDAI','HB20S 1.0','2021/2022',24,38000,39500,53000),
 make('MOT1A23','HONDA','CG 160','2021/2022',20,11000,12000,14800,'motorcycle')
];
const snap={reportDate:'2026-11-22',importedAt:'2026-11-23T12:00:00Z',
 vehicles,duplicateCount:0,serviceOrderRows:0,warnings:[],stores:['Sorocaba']};
assert.equal(lookup.dealerModelFamily('VW','T CROSS 1.0 200 TSI'),'T-CROSS');
assert.equal(lookup.dealerModelFamily('Volkswagen','Tcross Sense 200TSI'),'T-CROSS');
assert.equal(lookup.dealerModelFamily('VOLKSWAGEN','T-ROC 1.4 TSI'),'T-ROC');
assert.equal(lookup.dealerModelFamily('TOYOTA','Corolla Cross XR'),'COROLLA CROSS');
assert.equal(lookup.dealerModelFamily('TOYOTA','Corolla Xei'),'COROLLA');
assert.equal(lookup.dealerModelFamily('FORD','Eco Sport 1.6 SE'),'ECOSPORT');
assert.equal(lookup.dealerModelFamily('HYUNDAI','HB20S 1.0'),'HB20S');
assert.equal(lookup.dealerModelFamily('HYUNDAI','HB20 1.0'),'HB20');
const day=new Date('2026-11-23T12:00:00Z');
const tcross=lookup.findDealerFamilyStock(snap,'VW - Volkswagen',
 'T-CROSS 1.0 200 TSI TOTAL FLEX SENSE AUTOMÁTICO','car','2022','ABC1D23',day);
assert.deepEqual(tcross.matches.map(v=>v.vehicle.plate),['ABC1D23','XYZ9K12']);
assert.equal(tcross.count,2);
assert.equal(tcross.oldOver90,1);
assert.equal(tcross.matches[0].samePlate,true,'Show already-stocked plate first');
assert.equal(tcross.matches[0].sameYear,true,'Match model year, not manufacture year');
assert.equal(tcross.matches[0].vehicle.purchase,70000,'Valor Compra not Valor Custo');
assert.equal(tcross.matches[0].vehicle.cost,73000,'Cost is not the paid amount');
assert.equal(tcross.matches[0].vehicle.price,85900,'Suggested selling price is not a completed sale');
assert.equal(tcross.snapshotAgeDays,1);
assert.equal(tcross.isOutdated,false);
const tracker=lookup.findDealerFamilyStock(snap,'GM - Chevrolet',
 'TRACKER 1.0 TURBO LTZ','car','2022','',day);
assert.deepEqual(tracker.matches.map(v=>v.vehicle.plate),['GMX4Z15']);
assert.equal(lookup.findDealerFamilyStock(snap,'TOYOTA','COROLLA 2.0','car','2022','',day).count,1);
assert.equal(lookup.findDealerFamilyStock(snap,'TOYOTA','COROLLA CROSS','car','2022','',day).count,1);
assert.equal(lookup.findDealerFamilyStock(snap,'HYUNDAI','HB20 1.0','car','2022','',day).count,1);
assert.equal(lookup.findDealerFamilyStock(snap,'HYUNDAI','HB20S 1.0','car','2022','',day).count,1);
assert.equal(lookup.findDealerFamilyStock(snap,'HONDA','CG 160','car','2022','',day).count,0);
assert.equal(lookup.findDealerFamilyStock(snap,'HONDA','CG 160','motorcycle','2022','',day).count,1);
assert.equal(lookup.findDealerFamilyStock(snap,'VW','POLO TRACK','car','2022','',day).count,0,
 'No stock found is not an invented inventory hit');
assert.equal(lookup.findDealerFamilyStock(null,'VW','T-CROSS','car','2022','',day),null);
assert.equal(lookup.findDealerFamilyStock(snap,'VW','','car','2022','',day),null);
assert.equal(lookup.findDealerFamilyStock({...snap,reportDate:'2026-10-10'},
 'VW','T-CROSS','car','2022','',day).isOutdated,true);
assert.ok(panel.includes('Meu estoque neste modelo'));
assert.ok(panel.includes('Valor pago · Dealer'));
assert.ok(panel.includes('Custo atual · Dealer'));
assert.ok(panel.includes('Preço sugerido de venda'));
assert.ok(panel.includes('Não informado'));
assert.ok(panel.includes('não comprova venda'));
assert.ok(panel.includes('Nenhum veículo desta família'));
assert.ok(panel.includes('Relatório {result.snapshotAgeDays===null?'));
assert.ok(panel.includes("matching.slice(0,6)"));
assert.ok(panel.includes('Importar estoque do Dealer'));
assert.ok(desk.includes("import MarketIqStockOnDeskPanel from './MarketIqStockOnDeskPanel'"));
assert.ok(desk.includes('snapshot={radarLoadedScope===captureScope?radarSnapshot:null}'),
 'Never show one account stock while another account is loading');
assert.ok(desk.includes("onOpenRadar={()=>{switchDeskSection('radar');setMobileFullDesk(true);}}"),
 'Import/open Radar uses existing gated desk');
assert.ok(!panel.includes('fetch(')&&!panel.includes('localStorage.setItem('),
 'Read-only Dealer stock panel must not upload/sync customer inventory');
console.log('Dealer family stock in IQ pricing: family matching, year, paid/cost/ask, no false sale claims, stale alerts, account isolation and direct Radar entry passed.');
