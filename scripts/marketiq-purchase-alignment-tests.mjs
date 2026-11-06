import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=readFileSync('services/marketIqPurchaseAlignment.ts','utf8');
const panel=readFileSync('components/MarketIqIntelligentHistoryPanel.tsx','utf8');
const out=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
assert.equal((out.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const {alignPurchaseReference}=await import('data:text/javascript;base64,'+Buffer.from(out.outputText).toString('base64'));
const input={verifiedMarketCeiling:0,statisticalTarget:113000,paidCount:2,paidMedian:98000,
 paidAdjustedMedian:98000};
const danger=alignPurchaseReference(input);
assert.equal(danger.status,'review_required','Two confirmed same-version purchases should block a high uncalibrated reference');
assert.equal(danger.suggested,null,'Must not display R$113k as the suggested buying price');
assert.equal(danger.reference,113000,'Raw statistical estimate retained transparently');
assert.equal(danger.historyAnchor,98000);
assert.equal(danger.difference,15000);
assert.equal(danger.differencePercent,15.31);
assert.equal(danger.historyIsFipeAdjusted,true);
assert.equal(alignPurchaseReference({...input,paidCount:0}).status,'unverified',
 'Two R$98k valuation quotes do not count as paid');
assert.equal(alignPurchaseReference({...input,paidCount:1}).status,'unverified',
 'One isolated purchase is not robust enough to block an estimate');
const exactThree=alignPurchaseReference({...input,paidCount:3});
assert.equal(exactThree.status,'history_capped','Three confirmed purchases may conservatively cap suggestion');
assert.equal(exactThree.suggested,98000);
const paidNoFipe=alignPurchaseReference({...input,paidAdjustedMedian:null});
assert.equal(paidNoFipe.status,'review_required','Nominal paid median still flags divergence when historic FIPE is unavailable');
assert.equal(paidNoFipe.historyIsFipeAdjusted,false);
assert.equal(alignPurchaseReference({...input,statisticalTarget:105000}).status,'aligned',
 'Two similar purchases are insufficient to alter close estimates');
assert.equal(alignPurchaseReference({...input,verifiedMarketCeiling:114000}).status,'review_required',
 'Even a verified Webmotors ceiling warrants review when far above actual purchases');
assert.equal(alignPurchaseReference({...input,incompleteHistory:true}).status,'partial');
assert.equal(alignPurchaseReference({...input,historyUnavailable:true}).status,'unverified');
assert.equal(alignPurchaseReference({...input,incompleteHistory:true}).suggested,null,
 'Incomplete archive cannot be treated as fully calibrated');
assert.ok(panel.includes('alignPurchaseReference'), 'The purchase guardrail must be connected to the desktop/mobile panel');
assert.ok(panel.includes("priceSignal.status==='review_required'"), 'The UI must show review-required state');
assert.ok(panel.includes("Valores apenas avaliados não foram usados como compras."),
 'The UI must communicate that quotations do not establish paid-price history');
console.log('Motyq IQ purchase reference alignment: actual-vs-estimate guardrail verified.');
