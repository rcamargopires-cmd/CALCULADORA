import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=readFileSync('services/marketIqCaptureReturnContext.ts','utf8');
const reviewCode=readFileSync('services/marketIqCapturedReview.ts','utf8');
const ui=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const transpile=s=>{
 const t=ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
 assert.equal(t.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length||0,0);
 return import('data:text/javascript;base64,'+Buffer.from(t.outputText).toString('base64'));
};
const {readCaptureReturnContext,writeCaptureReturnContext,capturedOffersFitReturnContext}=await transpile(code);
const {reviewCapturedWebmotors}=await transpile(reviewCode);
const data=new Map();
const storage={
 getItem:key=>data.get(key)??null,
 setItem:(key,value)=>data.set(key,String(value)),
 removeItem:key=>data.delete(key)
};
const now=1772660000000,scope='company|unit|mesa@example.com';
const context={
 vehicleType:'car',plate:'ABC1D23',brand:'Jeep',brandCode:'38',
 model:'COMPASS LONGITUDE 1.3 T270 TURBO FLEX AUT.',modelCode:'4001',
 year:'2025 Flex',yearCode:'2025-1',marketYear:2025,km:'75.200',cost:'1500'
};
assert.equal(writeCaptureReturnContext(storage,scope,context,now),true);
assert.equal(readCaptureReturnContext(storage,scope,now+2000).plate,'ABC1D23');
assert.equal(readCaptureReturnContext(storage,scope,now+2000).km,'75.200');
assert.equal(readCaptureReturnContext(storage,'other company|other unit|mesa@example.com',now+2000),null,
 'Capture handoff must be tenant and account isolated');
assert.equal(readCaptureReturnContext(storage,scope,now+25*60*60*1000),null,
 'A last-form suggestion must expire after 24 hours');
assert.equal(writeCaptureReturnContext(storage,scope,{...context,marketYear:0},now),false,
 'Missing year cannot become a restorable vehicle');
const capture=[
 {url:'https://www.webmotors.com.br/comprar/jeep/compass/13-t270-turbo-flex-longitude-at6/2024-2025/12345678',
  year:2025,price:'115990',km:'49080'},
 {url:'https://www.webmotors.com.br/comprar/jeep/compass/13-t270-turbo-flex-longitude-at6/2024-2025/12345679',
  year:2025,price:'118990',km:'57000'}
];
const model='https://www.webmotors.com.br/carros/sp/jeep/compass/de.2025/ate.2025';
assert.equal(capturedOffersFitReturnContext(capture,model,2025),true);
assert.equal(capturedOffersFitReturnContext(capture,model,2024),false,'Reject different model-year');
assert.equal(capturedOffersFitReturnContext(capture,'https://www.webmotors.com.br/carros/sp/vw/t-cross/de.2025/ate.2025',2025),false,'Reject different vehicle');
assert.equal(capturedOffersFitReturnContext(capture,null,2025),false,'Do not guess model from unavailable data');
assert.equal(capturedOffersFitReturnContext([{...capture[0],url:'https://evil.example/comprar/jeep/compass/test/2024-2025/12345678'}],model,2025),false,'Reject untrusted listing host');
const noForm=reviewCapturedWebmotors(capture,{
 brand:'',model:'',year:0,km:0,vehicleType:'car',fipeValue:null,
 expectedModelUrl:null,expectedVersionUrl:null
});
assert.equal(noForm.blockedCount,0,'Missing valuation context must never label every captured 2025 car incompatible');
assert.equal(noForm.reviewCount,2);
assert.equal(noForm.eligibleCount,0);
assert.equal(noForm.meanLowestFive,null,'Do not calculate a provisional average without vehicle context');
assert.ok(noForm.rows.every(row=>!row.reasons.includes('Ano-modelo diferente')));
assert.ok(noForm.rows.every(row=>row.reasons.includes('Complete a avaliação para comparar')));
const withForm=reviewCapturedWebmotors(capture,{
 brand:'Jeep',model:'Compass',year:2025,km:75200,vehicleType:'car',
 expectedModelUrl:model,
 expectedVersionUrl:'https://www.webmotors.com.br/carros/sp/jeep/compass/13-t270-turbo-flex-longitude-at6/de.2025/ate.2025',
 fipeValue:138000
});
assert.equal(withForm.blockedCount,0);
assert.equal(withForm.eligibleCount,2);
assert.equal(withForm.topFive.length,2);
assert.equal(withForm.rows[0].kmDifference,18200);
assert.ok(ui.includes("pendingCaptureKey='__captured_in_another_tab__'"),
 'Save captures in a special scoped inbox across tabs');
assert.ok(ui.includes('readCaptureDraft(window.localStorage,captureScope,pendingCaptureKey)'));
assert.ok(ui.includes('writeCaptureDraft(window.localStorage,captureScope,pendingCaptureKey'));
assert.ok(ui.includes('readCaptureReturnContext(window.localStorage,captureScope)'));
assert.ok(ui.includes('writeCaptureReturnContext(window.localStorage,captureScope'));
assert.ok(ui.includes('canRestoreReturn'));
assert.ok(ui.includes('Restaurar avaliação:'));
assert.ok(ui.includes('Nenhum anúncio foi reprovado por falta desses dados.'));
assert.ok(ui.includes('!searchReady||!captureFitsCurrent'));
assert.ok(ui.includes('capturedOffersFitReturnContext(latest,webmotorsBrowse.modelUrl,marketYear)'));
assert.ok(ui.includes("id=\"motyq-iq-valuation-form\""));
assert.ok(ui.includes('referenceAvg*.86*(repasse?.95:1)'));
assert.ok(ui.includes('avg*.86*(repasse?.95:1)'));
assert.ok(ui.includes("status:'pending' as const"));
console.log('Motyq IQ cross-tab capture context: missing-year/KM safeguards, scoped 24h return, model/year matching and no price changes passed.');
