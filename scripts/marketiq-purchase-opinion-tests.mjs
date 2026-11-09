import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const input=readFileSync('services/marketIqPurchaseOpinion.ts','utf8');
const radar=readFileSync('services/marketIqPurchaseRadar.ts','utf8');
const modal=readFileSync('components/MarketIqPurchaseSummaryModal.tsx','utf8');
const desk=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const compilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX};
function transpile(source){
 const compiled=ts.transpileModule(source,{compilerOptions,reportDiagnostics:true});
 assert.equal((compiled.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
 return compiled.outputText;
}
const data=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const engine=transpile(input).replace("'./marketIqPurchaseRadar'","'"+data(transpile(radar))+"'");
const {buildMesaPurchaseOpinion}=await import(data(engine));
const fixture={
 mode:'purchase',verifiedMarketPrice:100000,verifiedAds:3,offer:70000,
 dealerCost:null,preparation:3000,preparationConfirmed:true,repasse:false,
 fipeCurrent:true,fipeValue:92000,snapshotAvailable:true,snapshotDate:'2026-11-07',
 familyCount:2,yearFamilyCount:1,over90Count:0,
 historyAvailable:true,historyLimited:false,paidCount:6,paidMedian:66000,
 today:'2026-11-09'
};
const evalWith=patch=>buildMesaPurchaseOpinion({...fixture,...patch});
const good=evalWith({});
assert.equal(good.status,'opportunity');
assert.equal(good.confidence,'alta');
assert.equal(good.verifiedCeiling,83000,'market*0.86 minus prep, never historical quote');
assert.equal(good.gapToCeiling,-13000);
assert.ok(good.rationale.includes('aprovação humana'));
assert.ok(good.warning.includes('não comprovam margem líquida'));
assert.equal(evalWith({repasse:true}).verifiedCeiling,78700);
assert.equal(evalWith({offer:85000}).status,'negotiate');
assert.equal(evalWith({offer:100000}).status,'avoid','High over-ceiling offer with corroboration is discouraged');
assert.equal(evalWith({offer:100000,fipeCurrent:false}).status,'negotiate',
 'No red avoid recommendation with FIPE version/month unconfirmed');
assert.equal(evalWith({offer:100000,snapshotAvailable:false}).status,'negotiate',
 'No high-certainty avoid without fresh Dealer snapshot');
assert.equal(evalWith({verifiedAds:1}).status,'insufficient');
assert.equal(evalWith({verifiedMarketPrice:null}).verifiedCeiling,null);
assert.equal(evalWith({verifiedAds:1}).verifiedCeiling,null,
 'Single ad must never generate purchase ceiling even if a price is provided');
assert.equal(evalWith({offer:null}).status,'insufficient','No offer = not purchased and no verdict');
assert.equal(evalWith({preparationConfirmed:false}).status,'insufficient',
 'Unset cost confirmation cannot lead to green or red');
assert.equal(evalWith({fipeCurrent:false}).status,'insufficient','Old FIPE must not pass as current');
assert.equal(evalWith({snapshotAvailable:false}).status,'insufficient','No inventory means no green');
assert.equal(evalWith({snapshotDate:'2026-10-01'}).status,'insufficient','Old Dealer import means no green');
assert.equal(evalWith({historyAvailable:false}).status,'insufficient','Missing history is unknown, not zero buys');
assert.equal(evalWith({historyLimited:true}).status,'insufficient','Partial historical query cannot pass as complete');
assert.equal(evalWith({paidCount:2}).status,'insufficient','Fewer than three distinct actual buys');
assert.equal(evalWith({familyCount:7}).status,'negotiate','Stock concentration should block green');
assert.equal(evalWith({yearFamilyCount:4,over90Count:2}).status,'negotiate');
assert.equal(evalWith({offer:76000,paidMedian:65000}).status,'negotiate',
 'Large divergence from confirmed paid history is a review signal, not automatic rejection');
assert.equal(evalWith({verifiedAds:2}).status,'opportunity');
assert.equal(evalWith({verifiedAds:2}).confidence,'moderada');
const soldStock=evalWith({mode:'stock',offer:null,dealerCost:93000,
 preparationConfirmed:false,preparation:10000});
assert.equal(soldStock.verifiedCeiling,86000,'Existing cost already includes prep, do not double count');
assert.equal(soldStock.status,'negotiate','Current stock is to be reviewed, not ordered to discard');
assert.equal(evalWith({mode:'stock',dealerCost:null}).status,'insufficient');
assert.equal(evalWith({mode:'stock',offer:null,dealerCost:70000,preparationConfirmed:false}).status,'opportunity');
assert.equal(evalWith({verifiedMarketPrice:null,offer:1000000}).status,'insufficient',
 'Dealer hypothesis / FIPE must never substitute verified market');
assert.equal(evalWith({verifiedAds:0,historyAvailable:true,paidMedian:70000}).status,'insufficient');
const tsCheck=transpile(modal);
assert.ok(tsCheck.includes('Parecer Inteligente da Mesa'),'Integrated UI present');
assert.ok(modal.includes('verifiedMarketPrice:marketReference'),'Only audited individual market listings sent');
assert.ok(modal.includes('verifiedAds:checkedListings.count'));
assert.ok(modal.includes('preparationConfirmed,setPreparationConfirmed'));
assert.ok(modal.includes('mode:newPurchaseMode?\'purchase\':\'stock\''));
assert.ok(modal.includes('const preparation=newPurchaseMode?numeric(preparationDraft):0'));
assert.ok(modal.includes("historyAvailable:historyStatus==='ready'"));
assert.ok(modal.includes('historyStatus===\'error\''),'Provider errors are visible');
assert.ok(modal.includes('Não substitui o Parecer Inteligente'),'Old Radar signal visually demoted');
assert.ok(desk.includes('cloudHistory={saved}'),'Both current and historical summary should get user-authorized history');
assert.ok(desk.includes("companyId={user.companyId||'abrao-reze'}"));
console.log('Motyq IQ Parecer: opportunity/negotiate/avoid/insufficient, verified market, paid history, FIPE, stale inventory, cost, repasse, stock safeguards and UI passed.');
