import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const app=readFileSync('App.tsx','utf8');
const iq=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
for(const [path,source] of [['App.tsx',app],['ManualPricingWorkspace.tsx',iq]]){
 const diagnostics=ts.transpileModule(source,{fileName:path,compilerOptions:{
  jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
 },reportDiagnostics:true}).diagnostics||[];
 assert.deepEqual(diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error),[],path+' must parse');
}
assert.ok(app.includes('className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10'),
 'The IQ logout header must be visible on mobile as well as desktop');
assert.ok(app.includes('aria-label="Sair do Motyq e trocar usuário"'));
assert.ok(app.includes('await signOut(auth)'), 'Logout must terminate Firebase session');
assert.ok(app.includes("sessionStorage.removeItem('motyq-iq-active-desk-tab')"),
 'The last user desk screen must not be restored for another user');
assert.ok(app.includes('setUser(null)'));
assert.ok(app.includes('setAuthError(\'\')'));
assert.ok(iq.includes('Três ações principais do Motyq IQ'));
assert.ok(iq.includes('Avaliar veículo')&&iq.includes('Inteligência de estoque')&&iq.includes('Cotações e repasse'));
assert.ok(iq.includes("onClick={()=>navigateSimple('pricing')}"));
assert.ok(iq.includes("onClick={()=>navigateSimple('radar')}"));
assert.ok(iq.includes("onClick={()=>navigateSimple('consulted')}"));
assert.ok(iq.includes('Outras ferramentas, pesquisa rápida e funções avançadas'));
assert.ok(iq.includes('<MarketIqSimpleHome'), 'Existing modules must remain accessible');
assert.ok(iq.includes('<MarketIqDealerRadarPanel'));
assert.ok(iq.includes('quickSearchRequest={quickStockRequest}'));
assert.ok(iq.includes('xrayOpenRequest={stockXrayRequest}'));
console.log('Motyq IQ Home 3 cards + responsive logout + user session isolation passed.');
