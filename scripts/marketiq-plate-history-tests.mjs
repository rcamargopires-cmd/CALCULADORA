import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('services/marketIqPlateHistory.ts','utf8');
const ui=readFileSync('components/MarketIqPlateHistoryPanel.tsx','utf8');
const archive=readFileSync('components/MarketIqMonthlyArchivePanel.tsx','utf8');
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const api=readFileSync('api/marketiq-market-scan.ts','utf8');
const js=ts.transpileModule(source,{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
 reportDiagnostics:true
});
assert.equal((js.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
assert.ok(!/from ['"]\.\//.test(js.outputText),'Type-only archive import stripped for independent tests');
const {buildPlateHistory,normalizePlate,validPlate}=await import('data:text/javascript;base64,'+
 Buffer.from(js.outputText).toString('base64'));
const row=(id,date,more={})=>({
 id:String(id),month:date.slice(0,7),evaluationDate:date,plate:'ABC1D23',
 brand:'Hyundai',model:'HB20',vehicleType:'car',km:50000,
 classRecorded:'B',destination:'SHOWROOM',status:'AVALIADO',
 assessedValue:50000,fipe:65000,webReference:60000,...more
});
assert.equal(normalizePlate('abc-1d23'),'ABC1D23');
assert.equal(validPlate('ABC-1234'),true,'Legacy Brazilian plate accepted');
assert.equal(validPlate('abc1d23'),true,'Mercosul Brazilian plate accepted');
assert.equal(validPlate('ABC12D3'),false);
assert.equal(validPlate(''),false);
const nothing=buildPlateHistory([], 'ABC1D23');
assert.equal(nothing.recordsCount,0);
assert.equal(nothing.assessedTotalDelta,null);
assert.equal(nothing.kmTotalDelta,null);
const records=[
 row('1','2026-09-28',{km:49000,assessedValue:50000}),
 row('2','2026-10-04',{km:51000,assessedValue:48000,classRecorded:'C',destination:'REPASSE'}),
 row('3','2026-11-03',{km:47000,assessedValue:65000,classRecorded:'D',destination:'SHOWROOM'}),
 row('3','2026-11-03',{km:47000,assessedValue:99999}), // Duplicate ID in month
 row('4','2026-11-03',{km:47000,assessedValue:null}), // same plate/day, distinct ID
 row('5','2026-10-12',{plate:'XYZ1A23',assessedValue:10000}),
];
const insights=buildPlateHistory(records,'ABC1D23');
assert.equal(insights.recordsCount,4,'Distinct same-day IDs must not collapse into one');
assert.equal(insights.monthsCount,3,'Search spans months');
assert.equal(insights.firstDate,'2026-09-28');
assert.equal(insights.latestDate,'2026-11-03');
assert.equal(insights.firstAssessedValue,50000);
assert.equal(insights.latestAssessedValue,65000);
assert.equal(insights.assessedTotalDelta,15000);
assert.equal(insights.assessedTotalDeltaPct,30);
assert.equal(insights.firstKm,49000);
assert.equal(insights.latestKm,47000);
assert.equal(insights.kmTotalDelta,-2000);
const november=insights.entries.find(x=>x.record.id==='3');
assert.equal(november.assessedDelta,17000,'Compare each entry to the last chronological evaluation');
assert.equal(november.kmDelta,-4000);
assert.ok(november.alerts.some(x=>x.kind==='km_decrease'&&x.severity==='warning'));
assert.ok(november.alerts.some(x=>x.kind==='large_value_change'));
assert.ok(november.alerts.some(x=>x.kind==='class_change'&&x.severity==='info'));
assert.ok(november.alerts.some(x=>x.kind==='destination_change'&&x.severity==='info'));
assert.ok(insights.warningCount>=2);
assert.equal(insights.entries[0].record.id,'4','Newest evaluations shown first');
assert.equal(insights.entries[0].assessedDelta,null,'Missing proposal must not be treated as zero');
const identity=buildPlateHistory([
 row('1','2026-10-04'),row('2','2026-11-03',{brand:'Chevrolet',model:'Onix'})
],'ABC1D23');
assert.ok(identity.entries[0].alerts.some(x=>x.kind==='vehicle_identity'&&x.severity==='warning'));
assert.equal(buildPlateHistory([row('1','2026-10-04')],'ABC1D23').assessedTotalDelta,null);
assert.equal(buildPlateHistory([row('1','2026-10-04', {km:null})],'ABC1D23').kmTotalDelta,null);
assert.ok(!source.includes('paidValue'),'Archive value is not paid price');
assert.ok(ui.includes('Histórico Inteligente por Placa'),'Visible title');
assert.ok(ui.includes("action:'monthly_archive_plate_history'"),'Uses authenticated cloud endpoint');
assert.ok(ui.includes('Linha do tempo da placa'),'Timeline present');
assert.ok(ui.includes('Evolução do valor avaliado'),'Value trajectory present');
assert.ok(ui.includes('não valor pago')&&ui.includes('não comprova compra'),'Do not imply paid-price or purchase verification');
assert.ok(ui.includes('onOpenArchive'),'Return to archive');
assert.ok(archive.includes('onOpenPlateHistory(r.plate)'),'Archive row can open plate history');
assert.ok(archive.includes('validPlate(r.plate)'),'Archive link hidden when plate incomplete');
assert.ok(workspace.includes(">Histórico por placa</button>"),'Dedicated desk tab');
assert.ok(workspace.includes("deskSection==='plateHistory'?<MarketIqPlateHistoryPanel"),'Dedicated desk route');
assert.ok(workspace.includes('setSelectedPlateForHistory(selected)'),'Archive handoff must preserve plate');
assert.ok(api.includes("action==='plate_history'"),'Server query route');
assert.ok(api.includes("'monthly_archive_plate_history'"),'Route dispatch');
assert.ok(api.includes('readChunks(path,token,manifest.batchId,manifest.chunks,manifest.month,selected)'),
 'Uses per-plate chunk index to avoid loading all evaluations for indexed months');
assert.ok(api.includes('const plateIndex:Record<string,number[]>={}'),'New imports add an index');
assert.ok(api.includes('selectedIndices===undefined?Array.from'),
 'Unindexed historical snapshots remain searchable without reimport');
assert.ok(api.includes('const {plateIndex,...summary}=item'),'Month picker must not receive indexes');
assert.ok(api.includes('const user=await scopedUser(req,sa,token)'),'Query always authorizes user');
assert.ok(api.includes('pathFor(dbBase(sa),user.companyId,manifest.month)'),'Never trust company identifier from request');
assert.ok(!api.includes('paidValue:assessedValue'),'Never claim value assessed is amount paid');
console.log('Motyq IQ plate history: multi-month search, same-day repeat IDs, value/KM deltas, caution alerts, private per-plate indexes, legacy fallback and UI wiring passed.');
