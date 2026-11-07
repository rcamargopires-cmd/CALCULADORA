import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const model=readFileSync('services/marketIqPurchaseRadar.ts','utf8');
const modal=readFileSync('components/MarketIqPurchaseSummaryModal.tsx','utf8');
const panel=readFileSync('components/MarketIqDealerRadarPanel.tsx','utf8');
const desk=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
for(const [path,src] of [['model',model],['modal',modal]]){
 const result=ts.transpileModule(src,{fileName:path+'.tsx',
  compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,
   jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
 assert.equal(result.diagnostics?.filter(x=>x.category===ts.DiagnosticCategory.Error).length||0,0,
  path+' parses as TSX');
}
const js=ts.transpileModule(model,{fileName:'purchase.ts',
 compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {buildPurchaseRadar,calculateMesaPurchaseCeiling,familyKey,modelYear}=await import(
 'data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
assert.equal(familyKey('VW - VolksWagen','AMAROK EXTREME'),
 familyKey('Volkswagen','Amarok 3.0 V6 TDI'),
 'Brand aliases should map to the same family');
assert.equal(familyKey('GM - Chevrolet','Tracker LTZ 1.0'),
 familyKey('Chevrolet','Tracker Premier'),'Chevrolet brand aliases');
assert.equal(modelYear('2020/2021'),2021,'Read exact model year, not manufacturing year');
assert.equal(modelYear('2025 Diesel'),2025);
assert.equal(calculateMesaPurchaseCeiling(99900,0,false),85914,
 'Tracker Dealer suggested sale 99.900 minus Mesa commercial 14% is 85.914, hypothetical only');
assert.equal(calculateMesaPurchaseCeiling(99900,0,true),81618.3,
 'Repasse additional 5% applies after the 14% commercial reserve');
assert.equal(calculateMesaPurchaseCeiling(99900,2000,false),83914,
 'Preparation cost is removed once, after the 14% reserve');
assert.equal(calculateMesaPurchaseCeiling(null,2000),null,
 'Without a real source or explicit scenario, never invent the maximum offer');
assert.equal(calculateMesaPurchaseCeiling(0,1000),null);
assert.equal(101466-99900,1566,'Screenshot Tracker is under Dealer reported cost');
assert.equal(101466-calculateMesaPurchaseCeiling(99900,0),15552,
 'Gap from actual Dealer cost to a hypothetical NEW purchase ceiling is not an actual loss');
const v=(data={})=>({
 key:'VIN:'+String(data.plate||'ABC1D23'),plate:'ABC1D23',chassis:'',
 brand:'CHEVROLET',model:'TRACKER LTZ TURBO',year:'2020/2021',km:55000,kmValid:true,
 kmOriginal:'55000',days:30,price:85000,purchase:67000,cost:73000,
 store:'ABRAO REZE SOROCABA',vehicleType:'car',serviceOrders:1,...data
});
const vehicles=[
 v(),
 v({key:'VIN:2',plate:'DEF4G56',model:'TRACKER PREMIER TURBO',days:95,price:96000,
  purchase:77000,cost:82000,store:'ABRAO REZE VOTORANTIM'}),
 v({key:'VIN:3',plate:'GHI7J89',year:'2021/2022',price:103000,days:150}),
 v({key:'VIN:4',plate:'JKL1M23',brand:'FIAT',model:'PULSE',year:'2020/2021'})
];
const snapshot={reportDate:'2026-11-07',importedAt:'2026-11-07T11:00:00Z',
 vehicles,stores:['ABRAO REZE SOROCABA','ABRAO REZE VOTORANTIM'],
 duplicateCount:0,warnings:[],serviceOrderRows:1};
const target={brand:'GM - CHEVROLET',model:'TRACKER 1.0 TURBO FLEX LTZ AUT.',year:'2021',
 vehicleType:'car',plate:'XYZ1A23',fipe:85000,km:58000,
 offer:70000,preparation:2000,verifiedMarketPrice:90000,marketAdsVerified:2};
const data=buildPurchaseRadar(snapshot,target,'ABRAO REZE SOROCABA');
assert.equal(data.snapshotAvailable,true);
assert.equal(data.familyCount,3);
assert.equal(data.yearFamilyCount,2,'Model year is required to scope comparable price');
assert.equal(data.storeFamilyCount,2,'Group stocks in chosen store include other years');
assert.equal(data.ageAverage,62.5);
assert.equal(data.over90Count,1);
assert.equal(data.medianSuggestedPrice,90500);
assert.equal(data.referenceSale,'verified_webmotors');
assert.equal(data.referencePrice,90000);
assert.equal(data.grossBasis,'estimated_offer_plus_preparation');
assert.equal(data.grossSpread,18000);
assert.equal(data.grossMarginPercent,20);
assert.equal(data.signal,'stock_risk','Slow family-year cohort must take priority over favorable margin');
assert.ok(data.reasons.some(x=>x.includes('mais de 90 dias')));
assert.ok(data.limits.some(x=>x.includes('diferentes')));
assert.equal(data.capitalAt30,1080,'Capital simulation is 1.5% of offer plus prep');
const noStock=buildPurchaseRadar(null,target);
assert.equal(noStock.signal,'insufficient','No imported inventory cannot be a buy recommendation');
assert.equal(noStock.familyCount,0);
const noWebmotors=buildPurchaseRadar(snapshot,{...target,marketAdsVerified:1});
assert.equal(noWebmotors.referenceSale,'unavailable',
 'Single ad is insufficient to claim sale reference');
assert.equal(noWebmotors.grossSpread,null);
assert.notEqual(noWebmotors.signal,'favorable');
const sim=buildPurchaseRadar(snapshot,{...target,marketAdsVerified:0,
 verifiedMarketPrice:0,manualSalePrice:90000});
assert.equal(sim.referenceSale,'manual_assumption');
assert.equal(sim.grossSpread,18000);
assert.equal(sim.signal,'review','Manually guessed sale price cannot earn a favorable decision');
const existing=buildPurchaseRadar(snapshot,{...target,stockVehicle:vehicles[0]});
assert.equal(existing.grossBasis,'dealer_cost');
assert.equal(existing.referenceSale,'dealer_suggested');
assert.equal(existing.grossSpread,12000,'Use Dealer recorded cost, not offer plus prep');
assert.equal(existing.familyCount,3);
const below=buildPurchaseRadar(snapshot,{...target,stockVehicle:v({
 key:'VIN:below',plate:'UVW4B32',cost:95000,price:89000
})});
assert.equal(below.signal,'negotiate');
assert.equal(below.grossSpread,-6000);
const noPrice=buildPurchaseRadar(snapshot,{...target,stockVehicle:v({
 key:'VIN:unpriced',plate:'LMN2K43',cost:75000,price:0
})});
assert.equal(noPrice.signal,'check_offer','Unpriced stock should get immediate review priority');
assert.equal(noPrice.referencePrice,null);
const dealerScenario=buildPurchaseRadar(snapshot,{
 ...target,stockVehicle:null,offer:0,marketAdsVerified:0,
 verifiedMarketPrice:0,dealerSuggestedSalePrice:99900
});
assert.equal(dealerScenario.referencePrice,99900);
assert.equal(dealerScenario.referenceSale,'dealer_suggested');
assert.equal(dealerScenario.grossSpread,null,'No offer means no gross spread to imply profit');
assert.notEqual(dealerScenario.signal,'favorable',
 'A Dealer asking-price hypothesis must not become an approved buy signal');
assert.ok(dealerScenario.reasons.some(r=>r.includes('não comprova venda')));
const stockWithHighMargin=buildPurchaseRadar(snapshot,{
 ...target,stockVehicle:v({key:'VIN:high-margin',price:160000,cost:90000})
});
assert.notEqual(stockWithHighMargin.signal,'favorable',
 'An unverified Dealer suggested price alone cannot lead to a favorable purchase signal');
assert.ok(modal.includes('role="dialog" aria-modal="true"'));
assert.ok(modal.includes("if(e.key==='Escape')onClose()"),'Escape closes modal');
assert.ok(modal.includes('Resumo de Compra')&&modal.includes('Sinal da Mesa'));
assert.ok(modal.includes('Sem aprovação automática')&&modal.includes('não é lucro líquido'));
assert.ok(modal.includes('Mesmo ano-modelo no grupo'));
assert.ok(modal.includes('Estoque da unidade'));
assert.ok(modal.includes('Mais de 90 dias'));
assert.ok(modal.includes('KM médio em estoque'));
assert.ok(modal.includes('Preço de venda hipotético'));
assert.ok(modal.includes('Simular compra de outro igual'));
assert.ok(modal.includes('Veículo já no estoque'));
assert.ok(modal.includes('calculateMesaPurchaseCeiling(ceilingBenchmark,preparation,repasse)'));
assert.ok(modal.includes('marketReference||data.referencePrice'),
 'Use accepted Webmotors sample in preference to unsourced Dealer price for new-buy ceiling');
assert.ok(modal.includes('marketReference?')&&modal.includes('!marketReference'),
 'Stock summary must distinguish market-backed and hypothetical ceilings');
assert.ok(modal.includes('Showroom · 14%')&&modal.includes('Repasse · +5%'));
assert.ok(modal.includes('O teto é apenas uma hipótese e não autoriza compra.'));
assert.ok(modal.includes('não equivale a prejuízo realizado'));
assert.ok(modal.includes("accent==='dark'?'border-slate-300 bg-slate-50 text-slate-950'"),
 'Cards with light background must not hide their labels with white text');
assert.ok(!modal.includes("accent==='dark'?'border-slate-900 bg-slate-950 text-white'"),
 'No invisible dark style from the user screenshot');
assert.ok(modal.includes("accent==='orange'||accent==='cyan'?'!text-white':'!text-slate-950'"),
 'Highlighted KPI values must have enforced readable contrast on cyan/orange cards');
assert.ok(modal.includes("{' '}Capital, impostos específicos"),
 'A space must separate purchase-caveat sentences');

assert.ok(panel.includes("onClick={e=>{e.stopPropagation();setPurchaseSummaryVehicle(v);}}"),
 'Clicking summary directly in table must not trigger selection navigation');
assert.ok(panel.includes('<MarketIqPurchaseSummaryModal'));
assert.ok(desk.includes('const [radarSnapshot,setRadarSnapshot]=useState<DealerStockSnapshot|null>(null)'));
assert.ok(desk.includes('snapshot={radarSnapshot} onSnapshotChange={setRadarSnapshot}'),
 'Stock import persists across Mesa navigation in memory');
assert.ok(desk.includes('Inteligência de Compra'),'Pricing must have one-click CarInvest summary');
assert.ok(desk.includes('onClick={()=>setPurchaseSummaryOpen(true)}'));
assert.ok(desk.includes("marketAdsVerified:marketReady?primary.length:0"),
 'Pricing summary uses only individually validated Webmotors ads');
assert.ok(desk.includes("verifiedMarketPrice:marketReady?avg:0"),
 'No indexed/unverified Webmotors price may appear as audited');
assert.ok(!modal.includes('onSave')&&!modal.includes('fetch('),
 'Summary cannot authorize purchases or send inventory to server');
console.log('Motyq IQ Purchase Summary: family vs year, stock concentration, scenario margin, non-verified market guards, modal and shared in-memory Dealer snapshot passed.');
