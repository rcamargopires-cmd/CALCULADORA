import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const identitySource=readFileSync('services/marketIqDealerModelIdentity.ts','utf8');
const identityJs=ts.transpileModule(identitySource,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
}}).outputText;
const identityUrl='data:text/javascript;base64,'+Buffer.from(identityJs).toString('base64');
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
}).outputText.replaceAll('./marketIqDealerModelIdentity',identityUrl);
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
assert.ok(panel.includes("v.kmValid?v.km.toLocaleString('pt-BR')+' km':'KM a conferir'"),
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
assert.ok(entry.includes('PUBLIC_BUYER_PATH')&&entry.includes('<PublicCotacaoMesaBuyerForm />')&&
 entry.includes('isPublicCatalogRoute()?<PublicCatalogPage />:<RoleAwareRoot />'),
 'The public dealer registration page may bypass login, while IQ and Radar remain gated by RoleAwareRoot');
assert.ok(!entry.includes('<MarketIqDealerRadarPanel/>'),
 'Radar must appear inside the authorized IQ workspace, not in the public root');
assert.ok(workspace.includes('Ferramentas de aquisição do Motyq IQ')&&
  workspace.includes("switchDeskSection('radar');setMobileFullDesk(true)"),
 'Mobile users need direct access to the authenticated Radar');
assert.ok(workspace.includes('onClick={()=>setPurchaseSummaryOpen(true)}'),
 'IQ valuation must be able to open the integrated purchase summary');


// Reproduce the 35-record Dealer V44 naming distribution without publishing real plates.
const cretaLabels=[
 ...Array(17).fill('CRETA 1.0 TGDI LIMITED AT'),
 ...Array(12).fill('NEW CRETA 1.0L TGDI AT LIMITED'),
 ...Array(5).fill('NOVO CRETA 1.0L TGDI COMFORT AT'),
 'CRETA1TA COMFORT'
];
const cretaRows=radar.parseDealerStockRows([
 ['Atualizado: 23/11/2026 - 09:40:42 AM'],headers,
 ...cretaLabels.map((model,i)=>row({
  Marca:'HYUNDAI',Modelo:model,Placa:'CRT'+String(i+1).padStart(4,'0'),
  Chassis:'9BH'+String(i+1).padStart(14,'0'),
  'Ano Fab/Mod':'2024/2025',Dias:12+i
 }))
]);
assert.equal(cretaRows.vehicles.length,35,'All 35 valid Creta entries must import');
assert.equal(new Set(cretaRows.vehicles.map(v=>v.familyKey)).size,1,
 'Dealer Radar must group CRETA/NEW CRETA/NOVO CRETA/CRETA1TA together');
assert.equal(radar.dealerSimilarStock(cretaRows.vehicles,cretaRows.vehicles[0]).length,34);


// Regression: exact Dealer V44 naming distribution (synthetic plates/chassis)
// contains 23 Volkswagen T-Cross, although a literal "t-cross" search found 5.
const tcrossAliases=[
 ...Array(10).fill('VW/T CROSS HL TSI'),
 ...Array(8).fill('T CROSS SENSE TSI'),
 ...Array(4).fill('T-CROSS 1.4 250 TSI TOTAL FLEX HIGHLINE AUTOMATICO'),
 'VW/T-CROSS TSI'
];
const tcrossSheet=radar.parseDealerStockRows([
 ['Atualizado: 23/11/2026 - 09:40:42 AM'],headers,
 ...tcrossAliases.map((model,i)=>row({
  Marca:'VOLKSWAGEN',Modelo:model,Placa:'TCR'+String(i+1).padStart(4,'0'),
  Chassis:'9BW'+String(i+1).padStart(14,'0'),
  'Ano Fab/Mod':'2024/2025',Dias:10+i
 })),
 row({Marca:'VOLKSWAGEN',Modelo:'T-ROC 1.4 TSI',Placa:'TRC0001',
  Chassis:'9BW00000000123456'}),
 row({Marca:'TOYOTA',Modelo:'COROLLA CROSS',Placa:'CRC0001',
  Chassis:'9BR00000000123456'})
]);
const vwTcross=tcrossSheet.vehicles.filter(v=>v.brand==='VOLKSWAGEN'&&
 radar.dealerRadarTextMatches(v,'t-cross'));
assert.equal(vwTcross.length,23,'All 23 T-Cross variants must be found');
for(const query of ['t-cross','T CROSS','TCross','vw/t-cross','VW/T CROSS',
 'Volkswagen T-Cross']){
 const matches=tcrossSheet.vehicles.filter(v=>radar.dealerRadarTextMatches(v,query));
 assert.equal(matches.length,23,query+' must find every T-Cross spelling but not other CROSS models');
}
assert.equal(tcrossSheet.vehicles.filter(v=>radar.dealerRadarTextMatches(v,'T-ROC')).length,1);
assert.equal(tcrossSheet.vehicles.filter(v=>radar.dealerRadarTextMatches(v,'corolla cross')).length,1);
assert.equal(tcrossSheet.vehicles.filter(v=>radar.dealerRadarTextMatches(v,'TCR0001')).length,1,
 'Plate lookup must remain exact for unique plate text');
assert.equal(tcrossSheet.vehicles.filter(v=>radar.dealerRadarTextMatches(v,'2025')).length,23,
 'Year lookups must continue working');
assert.equal(tcrossSheet.vehicles.filter(v=>radar.dealerRadarTextMatches(v,'')).length,25,
 'Empty term must show complete stock, not shrink the import');
assert.ok(panel.includes('dealerRadarTextMatches(v,search)'),
 'The real Radar UI must use the verified normalized search function');

console.log('Motyq IQ Dealer Radar: V44 header, 3 distinct VINs, OS dedup, risk indicators, local-only import, broad family matches, and snapshot deltas passed.');
