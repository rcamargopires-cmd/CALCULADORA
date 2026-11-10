import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const home=readFileSync('components/MarketIqSimpleHome.tsx','utf8');
const navigation=readFileSync('services/marketIqSimpleNavigation.ts','utf8');
function compile(source,jsx){
 const result=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,...(jsx?{jsx:ts.JsxEmit.ReactJSX}:{})
 },reportDiagnostics:true});
 const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 assert.equal(errors.length,0,'TS must parse without error: '+errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join(', '));
 return result.outputText;
}
compile(workspace,true);compile(home,true);
const nav=await import('data:text/javascript;base64,'+Buffer.from(compile(navigation,false)).toString('base64'));
const checks={
 'avaliar carro':'pricing',
 'precificar HB20':'pricing',
 'fipe':'pricing',
 'cotação de lojas':'consulted',
 'cotar carro':'consulted',
 'compradores':'consulted',
 'WhatsApp lojistas':'consulted',
 'meu estoque':'radar',
 'radar dealer':'radar',
 'giro estoque':'radar',
 'meus resultados':'dashboard',
 'painel de resultados':'dashboard',
 'histórico de avaliações':'history',
 'importar excel':'archive',
 'arquivo mensal':'archive',
 'solicitações e aprovações':'approvals',
 'aprendizado iq':'learning',
 'histórico por placa ABC1D23':'plateHistory'
};
for(const [q,route] of Object.entries(checks)){
 const result=nav.parseSimpleIqIntent(q);
 assert.equal(result?.destination,route,JSON.stringify({q,result,route}));
}
assert.equal(nav.parseSimpleIqIntent('histórico por placa ABC1D23')?.plate,'ABC1D23');
assert.equal(nav.parseSimpleIqIntent(''),null);
assert.equal(nav.parseSimpleIqIntent('o'.repeat(230)),null);
assert.equal(nav.parseSimpleIqIntent('uma mensagem sem intenção'),null);
assert.ok(home.includes("onNavigate(item.id)"),'All four major action cards must route to existing modules');
assert.ok(home.includes("id:'pricing'")&&home.includes("id:'consulted'")&&home.includes("id:'radar'")&&home.includes("id:'dashboard'"));
assert.ok(home.includes('Importar planilha')&&home.includes("onSelectImport('dealer')")&&home.includes("onSelectImport('evaluations')"));
assert.ok(home.includes('identificação automática do arquivo será a próxima etapa'),'Import guide must not claim automatic import exists');
assert.ok(home.includes('Assistente de navegação M.O.T.Y.Q.'),'Assistant must be explicitly described as navigation only');
assert.ok(home.includes('Não envia mensagens nem toma decisões de compra.'));
assert.ok(home.includes('stockCount===null')&&home.includes('Registros carregados, não total geral'),'Counts are qualified, no fake KPI');
assert.ok(home.includes('Ver todas as ferramentas'));
assert.ok(workspace.includes("previous:'home'")||workspace.includes(":'home';"),'New browser sessions should show the simplified home');
assert.ok(workspace.includes("deskSection==='home'&&<main"),'Home screen is actually mounted');
assert.ok(workspace.includes('<MarketIqSimpleHome'));
assert.ok(workspace.includes('const [showAllTools,setShowAllTools]=useState(false);'));
assert.ok(workspace.includes('onOpenAdvanced={()=>{setShowAllTools(true);navigateSimple(\'pricing\');}}'));
assert.ok(workspace.includes('onSelectImport={selectSimpleImport}'));
assert.ok(workspace.includes('navigateSimple(kind===\'dealer\'?\'radar\':\'archive\')'));
assert.ok(workspace.includes("deskSection!=='home'&&<main"),'Heavy previous tools are hidden on home');
assert.ok(workspace.includes("(showAllTools?'':'hidden')"),'Legacy crowded navigation must be collapsed by default');
assert.ok(workspace.includes('Navegação simplificada'));
assert.ok(workspace.includes("navigateSimple('home')"),'Users can return home from both desktop/mobile');
assert.ok(workspace.includes('setMobileFullDesk(destination!==\'home\'&&destination!==\'pricing\')'),
 'Mobile evaluation remains guided and specialist modules become accessible on small screens');
for(const moduleName of ['MarketIqManagementDashboard','MarketIqConsultedRepasse','MarketIqDealerRadarPanel',
 'MarketIqMonthlyArchivePanel','MarketIqLearningPanel','MarketIqApprovalCenter','MarketIqMobileExperience']){
 assert.ok(workspace.includes(moduleName),'Existing module '+moduleName+' must remain integrated');
}
assert.ok(workspace.includes("onQuoteVehicle={vehicle=>"),'Radar to quote handoff must survive');
assert.ok(workspace.includes("switchDeskSection('consulted')"));
console.log('Motyq IQ simplified home: 4 primary actions, quick navigator, import guide, unchanged old modules, mobile routing and no extra reads passed.');
