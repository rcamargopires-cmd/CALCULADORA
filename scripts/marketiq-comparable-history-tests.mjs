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
const alias=buildComparableHistory({...current,brand:'GM - CHEVROLET'},[],
 [row('alias','2026-10-19')],[],'abrao-reze');
assert.equal(alias.paidCount,1,'Brand aliases must match safely');
const hilux=buildComparableHistory({...current,brand:'TOYOTA',model:'HILUX 2.8 SRX'},[],
 [row('sw4','2026-10-20',{brand:'TOYOTA',model:'HILUX SW4',version:'2.8 SRX'})],[],'abrao-reze');
assert.equal(hilux.comparables.length,0,'Hilux SW4 must never become Hilux pickup comparable');
const oldPlate=buildComparableHistory(current,[row('old','2026-09-18',{plate:'ABC1D23',status:'AVALIADO'})],[],[],'abrao-reze');
assert.equal(oldPlate.samePlate.length,1,'Historical same-plate quote shown');
assert.equal(oldPlate.samePlate[0].paid,null,'Same plate does not infer a purchase');

const compass={plate:'KLM4N56',brand:'JEEP',
 model:'COMPASS LONG. T270 1.3 TB 4x2 Flex Aut.',modelYear:2025,km:37000,
 fipe:130000,vehicleType:'car'};
const cr=(id,date,overrides={})=>row(id,date,{
 plate:'STN3A34',brand:'JEEP',model:'COMPASS',
 version:'1.3 T270 TURBO FLEX LONGITUDE AT6',
 modelYear:2025,km:37500,fipe:130000,assessedValue:98000,...overrides
});
const compassRows=[
 cr('compass-same','2026-10-05'),
 cr('compass-diesel','2026-10-08',{version:'2.0 TD350 TURBO DIESEL LIMITED 4X4 AUTOMATICO',modelYear:2023,assessedValue:112000}),
 cr('compass-hybrid','2026-10-09',{version:'1.3 T270 TURBO HIBRIDO S 4XE AT6',assessedValue:102000}),
 cr('compass-limited','2026-10-10',{version:'1.3 T270 TURBO FLEX LIMITED AT6',assessedValue:108000}),
 cr('compass-2024','2026-10-11',{modelYear:2024,assessedValue:97000}),
 cr('compass-2023','2026-10-12',{modelYear:2023,assessedValue:96000}),
 cr('compass-manual','2026-10-13',{version:'1.3 T270 TURBO FLEX LONGITUDE MANUAL',assessedValue:81000}),
 cr('compass-uncertain','2026-10-14',{version:'LONGITUDE',assessedValue:110000}),
];
const compassCloud={
 id:'same-compass',plate:'ABC9X88',brand:'JEEP',
 model:'COMPASS LONG. T270 1.3 TB 4x2 Flex Aut.',year:'2025',km:'38.000',
 vehicleType:'car',paidValue:100000,paidAt:'2026-11-04',fipe:{value:130000}
};
const compassResult=buildComparableHistory(compass,[],compassRows,[compassCloud],'abrao-reze');
assert.equal(compassResult.exactCount,2,'Only true Compass Longitude T270 Flex 2025 qualifies');
assert.equal(compassResult.paidCount,2,'Diesel, hybrid, Limited, other years and manual cannot increase paid sample');
assert.equal(compassResult.paidMedian,99000,'Median must ignore unrelated diesel price of 112,000');
assert.equal(compassResult.historicalAdjustedMedian,99000);
assert.equal(compassResult.comparables.filter(e=>e.grade==='relacionado').length,6,
 'Other Compass variants remain visible for optional lookup');
assert.equal(compassResult.comparables.filter(e=>e.grade==='equivalente').length,1,
 'Same technical trim of different year may be browsed but not averaged');
assert.equal(compassResult.comparables.find(e=>e.id.endsWith('compass-diesel')).eligible,false);
assert.equal(compassResult.comparables.find(e=>e.id.endsWith('compass-hybrid')).eligible,false);
assert.equal(compassResult.comparables.find(e=>e.id.endsWith('compass-2024')).eligible,false);
assert.equal(compassResult.comparables.find(e=>e.id.endsWith('compass-uncertain')).eligible,false,
 'Insufficiently identified versions fail closed');
// Realistic Amarok Extreme discrepancy reported by the Mesa on 2026-11-06:
// FIPE label abbreviated "Dies." / "4x4"; AutoAvaliar writes "TDI" / "4Motion".
const amarokCurrent={
 plate:'TMB3G36',brand:'VW - VolksWagen',
 model:'AMAROK Extreme CD 3.0 4x4 TB Dies. Aut.',
 modelYear:2025,km:36000,fipe:279765,fipeCode:'005506-9',vehicleType:'car'
};
const amarokArchive=[
 row('amarok-oct26','2026-10-26',{
  plate:'TMJ0B10',brand:'VOLKSWAGEN',model:'AMAROK',
  version:'3.0 V6 TDI EXTREME CD 4MOTION AUTOMATICO',
  modelYear:2025,km:17838,assessedValue:225000,
  status:'AVALIADO',fipe:277000
 }),
 row('amarok-oct23','2026-10-23',{
  plate:'TJE8D61',brand:'VW - VOLKSWAGEN',model:'AMAROK',
  version:'3.0 V6 TDI EXTREME CD 4MOTION AUTOMATICO DIESEL',
  modelYear:2025,km:12900,assessedValue:230000,
  status:'AVALIADO',fipe:277000
 }),
 row('amarok-highline','2026-10-20',{
  plate:'ABC2D34',brand:'VOLKSWAGEN',model:'AMAROK',
  version:'3.0 V6 TDI HIGHLINE CD 4MOTION AUTOMATICO',
  modelYear:2025,km:34500,assessedValue:210000
 }),
 row('amarok-20','2026-10-21',{
  plate:'ABC2D35',brand:'VOLKSWAGEN',model:'AMAROK',
  version:'2.0 TDI EXTREME CD 4MOTION AUTOMATICO',
  modelYear:2025,km:35000,assessedValue:198000
 }),
 row('amarok-4x2','2026-10-22',{
  plate:'ABC2D36',brand:'VOLKSWAGEN',model:'AMAROK',
  version:'3.0 V6 TDI EXTREME CD 4X2 AUTOMATICO',
  modelYear:2025,km:35000,assessedValue:199000
 }),
 row('amarok-manual','2026-10-24',{
  plate:'ABC2D37',brand:'VOLKSWAGEN',model:'AMAROK',
  version:'3.0 V6 TDI EXTREME CD 4MOTION MANUAL',
  modelYear:2025,km:35000,assessedValue:205000
 }),
 row('amarok-old-year','2026-10-25',{
  plate:'ABC2D38',brand:'VOLKSWAGEN',model:'AMAROK',
  version:'3.0 V6 TDI EXTREME CD 4MOTION AUTOMATICO',
  modelYear:2024,km:35000,assessedValue:212000
 })
];
const amarokReport=buildComparableHistory(
 amarokCurrent,
 [row('amarok-same-plate','2026-10-15',{
  plate:'TMB3G36',brand:'VOLKSWAGEN',model:'AMAROK',
  version:'3.0 V6 TDI EXTREME CD 4MOTION AUTOMATICO',
  modelYear:2025,km:37000,status:'AVALIADO',assessedValue:225000
 })],
 amarokArchive,[],'abrao-reze'
);
assert.equal(amarokReport.samePlate.length,1,
 'Prior valuation of same plate stays visible in Mesma placa, never doubles as peer vehicle');
assert.equal(amarokReport.exactCount,2,
 'October Amarok Extreme V6 Diesel 4Motion 2025 must match FIPE Dies. 4x4 Aut.');
assert.equal(amarokReport.paidCount,0,
 'AutoAvaliar status AVALIADO is not proof of a purchase, even when the proposal was R$225k');
assert.ok(amarokReport.comparables.filter(x=>x.grade==='exato').every(x=>x.paid===null),
 'Comparable quotation and confirmed purchase remain separate');
assert.equal(amarokReport.comparables.filter(x=>x.grade==='equivalente').length,1,
 '2024 Amarok Extreme can be seen as context, not mixed into 2025 average');
assert.equal(amarokReport.comparables.filter(x=>x.grade==='relacionado').length,4,
 'Highline, 2.0, 4x2 and manual variants must remain outside exact pricing');
const withOnePaid=buildComparableHistory(amarokCurrent,[],[{
 ...amarokArchive[0],id:'confirmed-amarok',
 plate:'UVW4B32',status:'UTILIZADO',km:36050
}],[],'abrao-reze');
assert.equal(withOnePaid.paidCount,1,
 'Only a matching, confirmed UTILIZADO purchase in October can count in operational paid evidence');
assert.equal(withOnePaid.paidMedian,225000);

assert.ok(panel.includes("'other','Outras versões ('+otherVersions.length"),
 'Unmatched trims must live in a separate tab');
assert.ok(panel.includes("matching.filter(r=>r.paid!==null)"),
 'Paid tab must show only truly matched purchases');
assert.ok(panel.includes("selected==='other'?otherVersions:matching"),
 'Normal comparable view must exclude diesel/hybrid/other trims');
assert.ok(api.includes("action==='comparables'"));
assert.ok(api.includes("'monthly_archive_comparables'"),'Endpoint dispatched');
assert.ok(api.includes('const brandIndex:Record<string,number[]>={}'),'New month indexed by brand');
assert.ok(api.includes('const {plateIndex,...summary}=item'),'Old index privacy regression covered');
assert.ok(api.includes('const {brandIndex,...safeSummary}=summary'),'New index must remain private');
assert.ok(api.includes('const user=await scopedUser(req,sa,token)'),'Server authorization required');
assert.ok(api.includes('user.companyId'),'Tenant scoped archive path');
assert.ok(api.includes("if(process.env.VERCEL_ENV==='preview')"),
 'Preview must always use read-only official archive proxy, regardless of preview environment configuration');
assert.ok(api.includes("action:'monthly_archive_comparables',"),
 'Preview comparison must call the official indexed comparable route directly');
assert.ok(api.includes("OFFICIAL_COMPARABLES_INVALID")&&api.includes("readOnlyPreview:true"),
 'Preview must validate upstream response and mark it read-only');
assert.ok(!api.includes("const meta=await officialArchiveRequest(idToken,'months');"),
 'Preview should not download and scan all monthly snapshots');
assert.ok(api.includes("archivePreviewReader(req,res,action)"),
 'Preview must use read-only authenticated production archive endpoint');
assert.ok(api.includes("['months','load','plate_history','comparables'].includes(action)"),
 'Preview archive proxy must permit only read operations');
assert.ok(api.includes("Homologação somente leitura: salve ou aprove avaliações na versão oficial"),
 'Preview pricing history mutations must be forbidden');
assert.ok(api.includes("authorization:'Bearer '+idToken"),
 'Official read must use the authenticated operator token, not service account credentials');
assert.ok(!api.includes('FIREBASE_SERVICE_ACCOUNT_JSON_PREVIEW'),
 'Never distribute service credential to preview');
assert.ok(panel.includes("action:'monthly_archive_comparables'"));
assert.ok(source.includes("paidBasis:'approved'")&&panel.includes('october_confirmed'));
assert.ok(desktop.includes('<MarketIqIntelligentHistoryPanel'));
assert.ok(mobile.includes('<MarketIqIntelligentHistoryPanel'));
assert.ok(desktop.includes('onOpenPlateHistory={()=>{setSelectedPlateForHistory(plate)'));
console.log('Motyq IQ comparable history tests passed');
