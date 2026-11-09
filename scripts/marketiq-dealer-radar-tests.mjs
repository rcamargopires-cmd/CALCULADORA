import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const service=readFileSync('services/marketIqDealerRadar.ts','utf8');
const panel=readFileSync('components/MarketIqDealerRadarPanel.tsx','utf8');
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const entry=readFileSync('index.tsx','utf8');
for(const [name,source] of [['service',service],['panel',panel]]){
 const parsed=ts.transpileModule(source,{fileName:name+'.tsx',compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX
 },reportDiagnostics:true});
 assert.equal(parsed.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length||0,0,name+' must parse');
}
const js=ts.transpileModule(service.replace("import * as XLSX from 'xlsx';","const XLSX={};"),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText;
const radar=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const headers=['Empresa Compra','Estoque Atual','Modelo','Placa','Cor','Km','Comb.','Transmissão','Dias',
 'Preço Sugerido','Marca','Ano Fab/Mod','Chassis','Situação','Valor Compra','Custo Oper.','OS_Regra',
 'OS_Fora Regra','Valor Custo','Localização'];
const row=(o={})=>{
 const values={'Empresa Compra':'ABRAO DVU','Estoque Atual':'ABRAO DVU','Modelo':'TRACKER LTZ TURBO',
  'Placa':'ABC1D23','Km':52000,'Comb.':'FLEX','Transmissão':'AUTOMÁTICO',
  'Dias':95,'Preço Sugerido':89000,'Marca':'CHEVROLET','Ano Fab/Mod':'2020/2021',
  'Chassis':'9BGAA001100000001','Valor Compra':74000,'Valor Custo':78500,'Custo Oper.':1200,...o};
 return headers.map(name=>values[name]??'');
};
const input=[
 ['RELATÓRIO DE ESTOQUE DE VEÍCULOS - V44'],
 ['Atualizado: 07/11/2026 - 07:48:22 AM'],
 headers,
 row(),
 row({Placa:'DEF4G56',Chassis:'9BGAA001100000002',Modelo:'TRACKER PREMIER TURBO',
  'Dias':40,'Preço Sugerido':0,'Valor Custo':91000}),
 row({Placa:'GHI7J89',Chassis:'9BGAA001100000003',Modelo:'ONIX PREMIER',
  'Dias':10,'Preço Sugerido':50000,'Valor Custo':52500,'Km':65000}),
 row({Placa:'GHI7J89',Chassis:'9BGAA001100000003',Modelo:'ONIX PREMIER',
  'Dias':10,'Preço Sugerido':50000,'Valor Custo':52500,'Km':65000})
];
const os=[['K_OS_Codigo','Veiculo_Placa','Veiculo_Chassi'],
 ['26001','ABC1D23','9BGAA001100000001'],['26001','ABC1D23','9BGAA001100000001'],
 ['26002','','9BGAA001100000001'],['26003','GHI7J89','9BGAA001100000003']];
const snap=radar.parseDealerStockRows(input,os);
assert.equal(snap.reportDate,'2026-11-07');
assert.equal(snap.vehicles.length,3,'Duplicate VIN should not inflate stock');
assert.equal(snap.duplicateCount,1);
assert.equal(snap.vehicles.find(v=>v.plate==='ABC1D23').serviceOrders,2,'Distinct OS count once');
const stats=radar.dealerRadarStats(snap.vehicles);
assert.equal(stats.count,3);
assert.equal(stats.priceMissing,1);
assert.equal(stats.underCost,1,'Below-cost count excludes unpriced vehicles');
assert.equal(stats.over90,1);
assert.equal(stats.costTotal,78500+91000+52500);
assert.equal(stats.daysMedian,40);
assert.equal(stats.ageBuckets.reduce((s,a)=>s+a.count,0),3);
assert.ok(stats.capitalCostEstimate>0,'Capital scenario positive only with positive stock cost and days');
const tracker=snap.vehicles.find(v=>v.plate==='ABC1D23');
assert.deepEqual(radar.dealerSimilarStock(snap.vehicles,tracker).map(v=>v.plate),['DEF4G56'],
 'Same model family counts separately from exact FIPE version/year');
assert.ok(radar.dealerRiskFlags(tracker).some(x=>x.includes('90 dias')));
assert.ok(radar.dealerRiskFlags(snap.vehicles.find(v=>v.plate==='GHI7J89')).some(x=>x.includes('abaixo do custo')));
// Dealer can contain anomalous mileage. This must not remove the car,
// its cost, its days or missing-price alert from the group stock.
const withBadKm=radar.parseDealerStockRows([
 ['Atualizado: 07/11/2026 - 07:48:22 AM'],headers,
 ...input.slice(3,6),
 row({Placa:'MNO1P23',Chassis:'9BGAA001100000007',Km:1250000,
  Dias:12,'Preço Sugerido':0,'Valor Custo':87500})
]);
const badKmCar=withBadKm.vehicles.find(v=>v.plate==='MNO1P23');
assert.equal(withBadKm.vehicles.length,4,'Invalid KM cannot remove a real stock vehicle');
assert.equal(withBadKm.duplicateCount,0);
assert.equal(badKmCar.kmValid,false,'KM must be explicitly marked unverified');
assert.equal(badKmCar.kmOriginal,'1250000','Original reported KM remains visible to operator');
assert.equal(badKmCar.km,0,'Invalid raw KM cannot be used in statistical comparisons');
assert.ok(withBadKm.warnings.some(w=>w.includes('mantido(s) no estoque')));
assert.ok(radar.dealerRiskFlags(badKmCar).some(w=>w.includes('KM inconsistente')));
const badKmStats=radar.dealerRadarStats(withBadKm.vehicles);
assert.equal(badKmStats.count,4);
assert.equal(badKmStats.priceMissing,2);
assert.equal(badKmStats.costTotal,78500+91000+52500+87500);
assert.equal(badKmStats.ageBuckets.find(b=>b.name==='0 a 30').count,2);
assert.ok(panel.includes("v.kmValid?v.km.toLocaleString('pt-BR'):'A conferir'"),
 'Radar table must display a mileage warning, never a fake 0 km');
assert.ok(panel.includes("selected.kmOriginal||'não informado'"),
 'Operator must be able to inspect the original suspect mileage');

// Real-world Dealer typo: SUX0A03 was searched as SUX0A63.
const trackerPlate='SUX0A03';
const nearby=radar.parseDealerStockRows([
 ['Atualizado: 07/11/2026 - 07:48:22 AM'],headers,
 row({Placa:trackerPlate,Chassis:'9BGED76B0RB144619',
  Marca:'GM',Modelo:'TRACKER 12T A RS',Dias:64,
  'Valor Custo':101466,'Preço Sugerido':99900}),
 row({Placa:'ABC1D23',Chassis:'9BGAA001100000001'})
]);
assert.deepEqual(radar.dealerPlateSuggestions(nearby.vehicles,'SUX0A63').map(v=>v.plate),
 [trackerPlate],'One incorrect digit in a full plate should suggest the real Dealer plate');
assert.deepEqual(radar.dealerPlateSuggestions(nearby.vehicles,'SUX-0A63').map(v=>v.plate),
 [trackerPlate],'Hyphenated plate inputs must be supported');
assert.equal(radar.dealerPlateSuggestions(nearby.vehicles,'SUX0A03').length,0,
 'Exact plate exists: no typo suggestion is needed');
assert.equal(radar.dealerPlateSuggestions(nearby.vehicles,'SUX0B63').length,0,
 'Two wrong characters must not guess a vehicle identity');
assert.equal(radar.dealerPlateSuggestions(nearby.vehicles,'TRACKER').length,0,
 'Model text must never be treated as a license plate');
assert.equal(radar.dealerPlateSuggestions(nearby.vehicles,'SUX0A6').length,0,
 'Partial plate must not trigger fuzzy suggestions');
assert.ok(panel.includes('Nenhuma placa exata encontrada. Você quis dizer?'),
 'The UI clearly labels fuzzy plates as suggestions, not results');
assert.ok(panel.includes('O Motyq nunca altera a placa automaticamente.'),
 'Do not silently select a vehicle');
assert.ok(panel.includes('onClick={()=>selectSuggestedPlate(v.plate)}'),
 'Only a deliberate click accepts the suggested Dealer plate');
assert.ok(panel.includes("setSearch(plate);setStore('all');setType('all');setFilter('all');"),
 'Choosing a suggestion resets filters that could hide the matched vehicle');

const newer=radar.parseDealerStockRows([
 ['Atualizado: 08/11/2026 - 08:00:00 AM'],headers,
 row({Placa:'ABC1D23','Dias':96,'Estoque Atual':'ABRAO TATUI','Preço Sugerido':86000}),
 row({Placa:'DEF4G56',Chassis:'9BGAA001100000002','Dias':41,'Preço Sugerido':80000}),
 row({Placa:'JKL1M23',Chassis:'9BGAA001100000004','Dias':1})
]);
const change=radar.compareDealerSnapshots(snap,newer);
assert.equal(change.entries.length,1);
assert.equal(change.exits.length,1,'Disappearing from stock is not automatically a sale');
assert.equal(change.transfers.length,1);
assert.equal(change.priceChanges.length,2);
assert.ok(panel.includes("type=\"file\" accept=\".xlsm,.xlsx\""),'Local XLSM file import');
assert.ok(panel.includes("Nenhuma macro é executada"));
assert.ok(panel.includes('dealerRadarStats(filtered,rate)'));
assert.ok(panel.includes('dealerSimilarStock(vehicles,selected)'));
assert.ok(panel.includes('compareDealerSnapshots(previous,current)'));
assert.ok(panel.includes('Exportar alertas CSV'));
assert.ok(panel.includes('const url=URL.createObjectURL(new Blob([csv]'),
 'Export uses a browser download; no uploaded stock server endpoint');
assert.ok(panel.includes('último relatório e a fotografia anterior são recuperados automaticamente'),
 'Previous/current Dealer snapshots are kept in the user browser rather than lost on reload');
assert.ok(panel.includes('snapshotOutdated')&&panel.includes('14'),'Old inventory gets a visible freshness alert');
assert.ok(panel.includes('sourceFileName'),'Filename survives a browser reload');
assert.ok(panel.includes('«Limpar dados locais»'),'Shared device users can erase cached inventory');
assert.ok(!panel.includes('localStorage.setItem')&&!panel.includes('fetch('),
 'No inventory upload to server and no insecure localStorage persistence');
assert.ok(service.includes("bookVBA:false"),'Macros are never loaded or executed');
assert.ok(service.includes("book.Sheets['Consulta']"),'Only the Dealer Consulta sheet is stock source');
assert.ok(service.includes("book.Sheets['OrdensServ']"),'Read OS as informational only');
assert.ok(service.includes("42*1024*1024"),'Reject oversized input');
assert.ok(workspace.includes('Radar de Compra')&&workspace.includes('MarketIqDealerRadarPanel'));
assert.ok(!entry.includes('radarLocalPreview')&&!entry.includes('radar-local'),
 'Radar must not have an unauthenticated, stand-alone laboratory route after integration');
assert.ok(entry.includes("isPublicCatalogRoute() ? <PublicCatalogPage /> : <RoleAwareRoot />"),
 'The IQ application must remain behind RoleAwareRoot authentication');
assert.ok(!entry.includes('<MarketIqDealerRadarPanel/>'),
 'Radar must appear inside the authorized IQ workspace, not in the public root');
assert.ok(workspace.includes('Ferramentas de aquisição do Motyq IQ')&&
  workspace.includes("switchDeskSection('radar');setMobileFullDesk(true)"),
 'Mobile users need direct access to the authenticated Radar');
assert.ok(workspace.includes('onClick={()=>setPurchaseSummaryOpen(true)}'),
 'IQ valuation must be able to open the integrated purchase summary');

console.log('Motyq IQ Dealer Radar: V44 header, 3 distinct VINs, OS dedup, risk indicators, local-only import, broad family matches, and snapshot deltas passed.');
