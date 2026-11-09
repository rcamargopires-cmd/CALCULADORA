import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const opt={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX};
const transpile=s=>{const x=ts.transpileModule(s,{compilerOptions:opt,reportDiagnostics:true});
 assert.equal((x.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);return x.outputText;};
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const radar=transpile(readFileSync('services/marketIqPurchaseRadar.ts','utf8'));
const evidence=transpile(readFileSync('services/marketIqPurchaseEvidence.ts','utf8'))
 .replace(/import\s*\{\s*rankWebmotorsCandidates\s*\}\s*from\s*['"]\.\/marketIqWebmotorsShortlist['"];?/,
 'const rankWebmotorsCandidates=()=>({accepted:[],discarded:[]});');
assert.ok(!/from ['"]\./.test(evidence),'No unresolved evidence dependencies');
const autoSource=readFileSync('services/marketIqPurchaseAutoContext.ts','utf8');
const auto=transpile(autoSource)
 .replaceAll("'./marketIqPurchaseRadar'","'"+data(radar)+"'")
 .replaceAll("'./marketIqPurchaseEvidence'","'"+data(evidence)+"'");
assert.ok(!/from ['"]\./.test(auto),'No unresolved auto context imports');
const {autoFipeForHistoricalTarget,reuseVerifiedIqEvidence}=await import(data(auto));
const adapter=transpile(readFileSync('services/marketIqComparablePurchase.ts','utf8'))
 .replaceAll("'./marketIqPurchaseAutoContext'","'"+data(auto)+"'");
const {purchaseTargetFromComparable}=await import(data(adapter));
const row={id:'archive|2026-10|100',source:'AutoAvaliar',
 date:'2026-10-16',plate:'TIN6C49',brand:'HYUNDAI',model:'HB20',
 version:'1.0 TGDI FLEX COMFORT PLUS AUTOMÁTICO',year:2025,km:18968,
 vehicleType:'car',status:'AVALIADO',assessed:76000,paid:null,fipe:85000,
 fipeCode:'015145-8',grade:'exato',eligible:true,paidBasis:'none',store:'OUTLET'};
const target=purchaseTargetFromComparable(row);
assert.equal(target.fipeCode,'015145-8','Preserve historical exact code');
assert.equal(target.fipeStatus,'unverified','Archived price cannot pose as current');
assert.equal(target.offer,undefined,'Old quotation is not a purchase offer');
assert.equal(target.verifiedMarketPrice,0);
const quote={value:86125,brand:'HYUNDAI',model:'HB20 1.0 TGDI FLEX COMFORT PLUS AUTOMÁTICO',
 year:2025,fuel:'Flex',fipeCode:'015145-8',referenceMonth:'novembro de 2026',
 referenceStatus:'current',referenceSource:'Parallelum'};
assert.equal(autoFipeForHistoricalTarget(target,quote)?.value,86125);
assert.equal(autoFipeForHistoricalTarget(target,{...quote,fipeCode:'015146-6'}),null,'Wrong code not accepted');
assert.equal(autoFipeForHistoricalTarget(target,{...quote,year:2024}),null,'Wrong year not accepted');
assert.equal(autoFipeForHistoricalTarget(target,{...quote,brand:'CHEVROLET'}),null,'Wrong family not accepted');
assert.equal(autoFipeForHistoricalTarget(target,{...quote,model:'HB20 1.0 TGDI FLEX COMFORT AUTOMÁTICO'}),null,'Plus trim mismatch must be rejected');
assert.equal(autoFipeForHistoricalTarget(target,{...quote,model:'HB20 1.0 TGDI FLEX COMFORT PLUS MANUAL'}),null,'Gearbox mismatch');
assert.equal(autoFipeForHistoricalTarget({...target,fipeCode:''},quote),null,'No guessing without FIPE code');
const active={brand:'HYUNDAI',model:'HB20 1.0 TGDI FLEX COMFORT PLUS AUTOMÁTICO',
 year:2025,vehicleType:'car',fipe:quote,listings:[
 {url:'https://www.webmotors.com.br/comprar/hyundai/hb20/a/12345678',price:91000,km:20000,
  title:'HB20 Comfort Plus',checked:true},
 {url:'https://www.webmotors.com.br/comprar/hyundai/hb20/b/12345679',price:95000,km:18000,
  title:'HB20',checked:false}
]};
const reused=reuseVerifiedIqEvidence(target,active);
assert.equal(reused?.fipe,86125);
assert.equal(reused?.fipeStatus,'current');
assert.equal(reused?.marketListings?.length,1,'Only Mesa-checked ads reused');
const transferred=purchaseTargetFromComparable(row,active);
assert.equal(transferred.fipeStatus,'current');
assert.equal(transferred.fipe,86125);
assert.equal(transferred.marketListings?.length,1);
assert.equal(transferred.offer,undefined,'Old assessed amount is not a proposal');
assert.equal(transferred.historicalAssessment?.paid,null);
assert.equal(purchaseTargetFromComparable(row,{...active,year:2024}).fipeStatus,'unverified');
assert.equal(purchaseTargetFromComparable(row,{...active,fipe:{...quote,fipeCode:'015146-6'}}).fipeStatus,'unverified');
assert.equal(purchaseTargetFromComparable(row,{...active,model:'HB20 1.0 TGDI FLEX COMFORT PLUS MANUAL'}).fipeStatus,'unverified');
assert.equal(purchaseTargetFromComparable({...row,fipeCode:''},active).fipeStatus,'unverified');
const modal=readFileSync('components/MarketIqPurchaseSummaryModal.tsx','utf8');
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const history=readFileSync('services/marketIqComparableHistory.ts','utf8');
transpile(modal);transpile(workspace);transpile(history);
assert.ok(modal.includes("action:'monthly_archive_comparables'"));
assert.ok(modal.includes("authorization:'Bearer '+token"),'Signed-in account context required');
assert.ok(modal.includes('buildComparableHistory(current,historyData.plateRecords'));
assert.ok(modal.includes('deriveMesaPricePattern(result.comparables,current.km)'));
assert.ok(modal.includes('historyStatus===\'error\''),'Provider error is not zero purchases');
assert.ok(modal.includes("historyData.identity!==historicalIdentity"),'Stale archive never rendered for another vehicle');
assert.ok(modal.includes('autoFipeForHistoricalTarget(target,body)'),'Only exact FIPE auto accepted');
assert.ok(modal.includes('Sem aprovação automática'));
assert.ok(modal.includes('Não interprete a ausência de números como zero compras'));
assert.ok(modal.includes('As cotações não entram na mediana paga'));
assert.ok(workspace.includes('cloudHistory={saved}'));
assert.ok(workspace.includes("companyId={user.companyId||'abrao-reze'}"));
assert.ok(history.includes('fipeCode:r.fipeCode'),'Store historical FIPE code');
console.log('Motyq IQ purchase auto-context: FIPE exact code/version/year, paid-vs-quote, same-user archive, checked ads, data isolation and UX guards passed.');
