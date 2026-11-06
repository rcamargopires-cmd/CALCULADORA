import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('services/marketIqComparableHistory.ts','utf8');
const api=readFileSync('api/marketiq-market-scan.ts','utf8');
const panel=readFileSync('components/MarketIqIntelligentHistoryPanel.tsx','utf8');
const desktop=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const mobile=readFileSync('components/MarketIqMobileExperience.tsx','utf8');
const transpiled=ts.transpileModule(source,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
},reportDiagnostics:true});
assert.equal((transpiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
assert.ok(!/from ['"]\.\//.test(transpiled.outputText),'Type imports removed');
const {buildComparableHistory}=await import('data:text/javascript;base64,'+
 Buffer.from(transpiled.outputText).toString('base64'));
const current={plate:'ABC1D23',brand:'CHEVROLET',
 model:'ONIX 1.0 TURBO LT AUTOMATICO',modelYear:2023,km:45000,
 fipe:65000,vehicleType:'car'};
const row=(id,date,overrides={})=>({
 id:String(id),month:date.slice(0,7),evaluationDate:date,
 plate:'XYZ2A34',brand:'CHEVROLET',model:'ONIX',version:'1.0 TURBO LT AUTOMATICO',
 modelYear:2023,vehicleType:'car',km:45000,
 assessedValue:52000,fipe:64000,status:'UTILIZADO',store:'AR VW',
 ...overrides
});
const rows=[
 row('1','2026-10-10'),
 row('2','2026-10-11',{assessedValue:54000,plate:'DEF2B34'}),
 row('3','2026-10-12',{assessedValue:53000,plate:'GHI2C34'}),
 row('4','2026-10-12',{model:'ONIX PLUS'}),
 row('5','2026-10-12',{version:'1.0 MPFI JOY MANUAL',assessedValue:41000}),
 row('6','2026-10-12',{status:'AVALIADO',assessedValue:60000}),
 row('7','2026-11-01',{assessedValue:100000}),
 row('8','2026-10-13',{assessedValue:1}),
 row('9','2026-10-13',{vehicleType:'motorcycle'}),
 row('10','2026-10-13',{modelYear:2018}),
 row('11','2026-10-13',{plate:'ABC1D23',assessedValue:56000})
];
const report=buildComparableHistory(current,[rows[10]],rows,[],'abrao-reze');
assert.equal(report.samePlate.length,1,'Plate chronology separate from peer comparisons');
assert.equal(report.paidCount,3,'Only qualified exact/near purchase, not unrelated trims or non-purchases');
assert.equal(report.paidMedian,53000);
assert.equal(report.exactCount,6,'Comparable evaluations include non-purchases but not ONIX PLUS or bike');
assert.ok(report.historicalAdjustedMedian!==null,'FIPE-relative median available');
assert.equal(report.confidence,'moderada');
assert.ok(!report.comparables.some(r=>r.model==='ONIX PLUS'));
assert.ok(report.comparables.some(r=>r.assessed===60000&&r.paid===null),'Quotation never becomes paid');
const otherTenant=buildComparableHistory(current,[],rows,[],'other-dealer');
assert.equal(otherTenant.paidCount,0,'Tenant-specific October paid interpretation cannot leak to other dealers');
const nov=buildComparableHistory(current,[],[row('n','2026-11-05')],[],'abrao-reze');
assert.equal(nov.paidCount,0,'A new month requires purchase-value validation');
const paidCloud={id:'motyq-1',plate:'XYZ2A34',brand:'CHEVROLET',
 model:'ONIX 1.0 TURBO LT AUTOMATICO',year:'2023',km:'45000',
 vehicleType:'car',approvedValue:51500,approvedAt:'2026-10-14',date:'2026-10-14',
 fipe:{value:65000}};
const withCloud=buildComparableHistory(current,[],rows,[paidCloud],'abrao-reze');
assert.equal(withCloud.paidCount,3,'Archive and cloud purchase of same plate/date count once');
assert.ok(withCloud.comparables.some(r=>r.paidBasis==='approved'),'Explicit Motyq approval retained');
const oldPlate=buildComparableHistory(current,[row('old','2026-09-18',{plate:'ABC1D23',status:'AVALIADO'})],[],[],'abrao-reze');
assert.equal(oldPlate.samePlate.length,1,'Historical same-plate quote shown');
assert.equal(oldPlate.samePlate[0].paid,null,'Same plate does not infer a purchase');
assert.ok(api.includes("action==='comparables'"));
assert.ok(api.includes("'monthly_archive_comparables'"),'Endpoint dispatched');
assert.ok(api.includes('const brandIndex:Record<string,number[]>={}'),'New month indexed by brand');
assert.ok(api.includes('const {plateIndex,...summary}=item'),'Old index privacy regression covered');
assert.ok(api.includes('const {brandIndex,...safeSummary}=summary'),'New index must remain private');
assert.ok(api.includes('const user=await scopedUser(req,sa,token)'),'Server authorization required');
assert.ok(api.includes('user.companyId'),'Tenant scoped archive path');
assert.ok(panel.includes("action:'monthly_archive_comparables'"));
assert.ok(panel.includes('approved')&&panel.includes('october_confirmed'));
assert.ok(desktop.includes('<MarketIqIntelligentHistoryPanel'));
assert.ok(mobile.includes('<MarketIqIntelligentHistoryPanel'));
assert.ok(desktop.includes('onOpenPlateHistory={()=>{setSelectedPlateForHistory(plate)'));
console.log('Motyq IQ comparable history tests passed');
