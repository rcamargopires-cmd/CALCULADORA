import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('services/marketIqComparablePurchase.ts','utf8');
const panel=readFileSync('components/MarketIqIntelligentHistoryPanel.tsx','utf8');
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const modal=readFileSync('components/MarketIqPurchaseSummaryModal.tsx','utf8');
const radar=readFileSync('services/marketIqPurchaseRadar.ts','utf8');
const history=readFileSync('services/marketIqComparableHistory.ts','utf8');
const compilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX};
for(const body of [source,panel,workspace,modal,radar,history]){
 const result=ts.transpileModule(body,{compilerOptions,reportDiagnostics:true});
 assert.equal((result.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
}
const transpiled=ts.transpileModule(source,{compilerOptions}).outputText;
assert.ok(!/from ['"]\./.test(transpiled),'Purchase target adapter must be a pure helper');
const {purchaseTargetFromComparable}=await import('data:text/javascript;base64,'+Buffer.from(transpiled).toString('base64'));
const row={
 id:'archive|2026-10|123',source:'AutoAvaliar',date:'2026-10-16',plate:'TIN6C49',
 brand:'HYUNDAI',model:'HB20',version:'1.0 TGDI FLEX COMFORT PLUS AUTOMÁTICO',
 year:2025,km:18968,vehicleType:'car',status:'AVALIADO',
 assessed:76000,paid:null,fipe:85000,grade:'exato',eligible:true,paidBasis:'none',
 store:'OUTLET SOROCABA'
};
const target=purchaseTargetFromComparable(row);
assert.equal(target.brand,'HYUNDAI');
assert.equal(target.model,'HB20 1.0 TGDI FLEX COMFORT PLUS AUTOMÁTICO');
assert.equal(target.year,'2025');
assert.equal(target.km,18968);
assert.equal(target.plate,'TIN6C49');
assert.equal(target.vehicleType,'car');
assert.equal(target.store,'OUTLET SOROCABA');
assert.equal(target.fipe,85000);
assert.equal(target.fipeStatus,'unverified','Archived FIPE must not pass as current');
assert.equal(target.offer,undefined,'Assessed price is not a live offer');
assert.equal(target.manualSalePrice,undefined);
assert.equal(target.dealerSuggestedSalePrice,undefined);
assert.equal(target.stockVehicle,undefined);
assert.equal(target.marketAdsVerified,0);
assert.deepEqual(target.marketListings,[]);
assert.equal(target.historicalAssessment?.assessed,76000);
assert.equal(target.historicalAssessment?.paid,null);
assert.equal(target.historicalAssessment?.paidBasis,'none');
const cloud=purchaseTargetFromComparable({
 ...row,id:'cloud|x',source:'Motyq IQ',brand:'YAMAHA',model:'FAZER FZ25 250 ABS',
 version:'FAZER FZ25 250 ABS',vehicleType:'motorcycle',year:2024,km:10000,
 assessed:null,paid:9000,paidBasis:'approved'
});
assert.equal(cloud.model,'FAZER FZ25 250 ABS','Same model text must not repeat');
assert.equal(cloud.vehicleType,'motorcycle','Row vehicle type overrides current form');
assert.equal(cloud.historicalAssessment?.paid,9000);
assert.equal(cloud.offer,undefined,'Paid history must not silently become new offer');
assert.ok(panel.includes('onOpenPurchaseSummary(e)'));
assert.ok(panel.includes('Resumo de Compra'));
assert.ok(panel.includes('onOpenPurchaseSummary?:'));
assert.ok(workspace.includes('onOpenPurchaseSummary={setPurchaseSummaryComparable}'));
assert.ok(workspace.includes('target={purchaseTargetFromComparable(purchaseSummaryComparable)}'));
assert.ok(workspace.includes('onClose={()=>setPurchaseSummaryComparable(null)}'));
assert.ok(workspace.includes('target={{\n   brand,model,year,plate,vehicleType,km:number(km)'),
 'Existing current appraisal purchase summary must remain independent');
assert.ok(modal.includes('Avaliação selecionada no Histórico Inteligente'));
assert.ok(modal.includes('Valor avaliado, não pago'));
assert.ok(modal.includes('não foi utilizado automaticamente'));
assert.ok(history.includes('vehicleType:r.vehicleType'),'AutoAvaliar record must retain its category');
console.log('Motyq IQ comparable summary: HB20 row, strict version/year/KM, historical quote not paid, motorcycle type, independent modal and safe pricing passed.');
