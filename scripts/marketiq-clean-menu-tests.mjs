import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const source=ts.transpileModule(workspace,{
 compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext},
 reportDiagnostics:true
});
assert.equal((source.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,
 'The Mesa component must parse as valid React TSX');
const top=workspace.match(/<nav className="motyq-iq-tabs[\s\S]*?<\/nav>/)?.[0];
assert.ok(top,'One primary navigation bar should exist');
const primary=['dashboard','pricing','consulted','approvals','learning'];
const nested=['pricing','history','archive','plateHistory','radar'];
for(const section of primary){
 assert.ok(top.includes("switchDeskSection('"+section+"')"),section+' must remain accessible in primary bar');
}
for(const section of ['history','archive','plateHistory']){
 assert.ok(!top.includes("switchDeskSection('"+section+"')"),
  section+' must not appear at primary level');
}
assert.equal((top.match(/<button type="button"/g)||[]).length,5,
 'Primary menu must have exactly five main buttons');
assert.ok(top.includes("aria-label=\"Áreas principais do Motyq IQ\""));
assert.ok(top.includes('aria-expanded={mesaActive}'),'Mesa main item advertises submenu');
assert.ok(workspace.includes("const mesaActive=deskSection==='pricing'||deskSection==='history'||deskSection==='archive'||deskSection==='plateHistory'||deskSection==='radar';"),
 'Mesa must remain active for all five nested pages');
const second=workspace.match(/\{mesaActive&&<nav id="motyq-iq-mesa-tools"[\s\S]*?<\/nav>\}/)?.[0];
assert.ok(second,'Subnavigation only appears when Mesa is active');
assert.equal((second.match(/<button type="button"/g)||[]).length,5,
 'Exactly five nested destinations under Mesa, including Radar');
for(const section of nested){
 assert.ok(second.includes("switchDeskSection('"+section+"')"),section+' must remain accessible under Mesa');
}
assert.ok(second.includes('Nova avaliação'));
assert.ok(second.includes('Histórico <span'),'Online history counter preserved without bloating top level');
assert.ok(second.includes('>{saved.length}</span>'));
assert.ok(second.includes('Arquivo mensal'));
assert.ok(second.includes('Histórico por placa'));
assert.ok(second.includes('Radar de Compra'));
assert.ok(workspace.includes("deskSection==='radar'?<MarketIqDealerRadarPanel/>"));
assert.ok(second.includes('aria-label="Ferramentas da Mesa de precificação"'));
assert.ok(second.includes("deskSection==='archive'?'page':undefined"));
assert.ok(!top.includes('motyq-iq-tabs-caption'),'Remove decorative caption from packed primary bar');
assert.ok(workspace.includes("sessionStorage.setItem('motyq-iq-active-desk-tab',next)"),
 'Previous tab must remain restorable');
assert.ok(workspace.includes("previous==='history'")&&workspace.includes("previous==='archive'")&&
 workspace.includes("previous==='plateHistory'"),'Previously saved submenu destinations must keep working');
assert.ok(workspace.includes("const restore=(r:Saved)=>"),'Saved valuation can still be reopened');
assert.ok(workspace.includes("switchDeskSection('pricing');setNewApprovedValue('')"),
 'Restoring an appraisal must take the user back to New Evaluation');
assert.ok(workspace.includes('deskSection===\'archive\'?<MarketIqMonthlyArchivePanel user={user}'),
 'Monthly archive must remain routed');
assert.ok(workspace.includes('deskSection===\'plateHistory\'?<MarketIqPlateHistoryPanel user={user}'),
 'Plate history must remain routed');
assert.ok(workspace.includes("onOpenApprovals={()=>switchDeskSection('approvals')}"),
 'Repasse can still open approval workflow');
assert.ok(workspace.includes("onOpenArchive={()=>switchDeskSection('archive')}"),
 'Plate-history panel can still return to archive');
console.log('Motyq IQ clean menu: 5 main tabs, 5 nested Mesa tools with Radar, responsive active state, stored routes and cross-navigation verified.');
