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
assert.equal(nav.parseSimpleIqIntent('histórico por placa')?.destination,'plateHistory');
assert.equal(nav.parseSimpleIqIntent('ABC1D23')?.plate,'ABC1D23');
assert.equal(nav.parseSimpleIqIntent(''),null);
assert.equal(nav.parseSimpleIqIntent('o'.repeat(230)),null);
assert.equal(nav.parseSimpleIqIntent('uma mensagem sem intenção'),null);
assert.ok(home.includes("onNavigate(item.id)"),'All four major action cards must route to existing modules');
assert.ok(home.includes("id:'pricing'")&&home.includes("id:'consulted'")&&home.includes("id:'radar'")&&home.includes("id:'dashboard'"));
assert.ok(home.includes('Importar planilha')&&home.includes("onSelectImport('dealer')")&&home.includes("onSelectImport('evaluations')"));
assert.ok(home.includes('A identificação é automática, mas você confirma a importação.')&&
 home.includes('onSmartImport(detected.file,detected.result.kind,detected.result.sheet)'),
 'New preview must classify the workbook locally and request explicit confirmation');
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
assert.ok(workspace.includes('if(!beginNewMobileValuation())return;'),
 'Quick plate valuation must ask before replacing an unfinished quote');
assert.ok(workspace.includes('setPlate(lookedUpPlate)'),'Quick plate should fill the right field');
const homeCss=readFileSync('components/marketIqSimpleHome.css','utf8');
assert.ok(home.includes("import './marketIqSimpleHome.css';"));
assert.ok(homeCss.includes('#root .motyq-iq-simple-home .motyq-iq-simple-hero'),
 'Global light theme must not override home only');
for(const color of ['#ffffff','#e0edf4','#a5f3fc','#cffafe'])
 assert.ok(homeCss.includes('color: '+color+' !important;'),'Missing readable hero color '+color);

// Simplified pricing must not render the unreliable ad comparison by default.
assert.ok(workspace.includes('{showAllTools&&<section className="rounded-xl bg-white p-5" aria-label="Ferramentas experimentais de anúncios">'),
 'Webmotors ad-comparison block stays accessible only in explicitly expanded advanced mode');
assert.ok(workspace.includes('Pesquisa de anúncios experimental. Ainda pode não retornar ofertas confiáveis'),
 'Do not present index-based market research as an operationally reliable service');
assert.ok(workspace.includes('{showAllTools&&<section className="grid gap-4 rounded-xl bg-white p-5 md:grid-cols-2">'),
 'Redundant bottom calculation panel must stay out of default pricing view');
assert.ok(workspace.includes('<details className="rounded-2xl border border-slate-200 bg-white p-4">'),
 'Detailed history/classification/confidence panels start folded');
assert.ok(workspace.includes('Ver histórico inteligente, classificação e justificativas'));
for(const panel of ['<MarketIqIntelligentHistoryPanel','<MarketIqFleetClassificationPanel','<MarketIqConfidencePanel']){
 assert.ok(workspace.includes(panel),'Preserve the original analysis '+panel);
}
assert.ok(workspace.includes('Guardar esta avaliação no histórico')&&workspace.includes('Valor aprovado na avaliação'),
 'Primary save and actual-paid reporting must stay available');
const quotePanel=readFileSync('components/MarketIqConsultedRepasse.tsx','utf8');
const radarPanel=readFileSync('components/MarketIqDealerRadarPanel.tsx','utf8');
const radarCss=readFileSync('components/marketIqRadarCompact.css','utf8');
compile(quotePanel,true);compile(radarPanel,true);
assert.ok(quotePanel.includes('Escolha o veículo, consulte lojistas compatíveis e registre a melhor proposta.'));
assert.ok(quotePanel.includes('Convidar e cadastrar novos lojistas'),
 'Public buyer invitation/import must be available without crowding quote flow');
assert.ok(quotePanel.includes('Ver cotações anteriores ({rows.length}) e exportar relatórios'),
 'Previous cases and export are retained but folded');
assert.ok(quotePanel.includes('Preencher para calcular teto'),
 'Tax/margin controls stay available when needed, with explicit simulation label');
assert.ok(quotePanel.includes('Teto simulado para compra')&&quotePanel.includes('current.calculation.sale'),
 'Quote values and estimated buy ceiling remain distinct');
assert.ok(quotePanel.includes('Registrar fechamento quando houver comprador'));
assert.ok(quotePanel.includes('onClick={()=>save()}')&&quotePanel.includes('Registrar fechamento'),
 'Persisting quotes and recording a manually confirmed sale still work');
assert.ok(quotePanel.includes('buyerWhatsAppUrl(buyer,draft.vehicle)'),
 'Buyer WhatsApp actions remain individual and opt-in gated');
assert.ok(radarPanel.includes('Meu estoque <span'));
assert.ok(radarPanel.includes('Dados da importação:')&&radarPanel.includes('current.warnings.join'),
 'Import provenance and all validation warnings remain inspectable');
assert.ok(radarPanel.includes('snapshotOutdated')&&radarPanel.includes('role="alert"'),
 'Old-stock and import failures must remain prominent');
assert.ok(radarPanel.includes('Filtros rápidos do estoque')&&radarPanel.includes('aria-pressed={filter===value}'));
assert.ok(radarPanel.includes('Mais filtros: categoria e condições'),
 'Vehicle type/OS filters still exist in expandable controls');
assert.ok(radarPanel.includes('Análises adicionais: giro, alertas e comparação entre relatórios'),
 'Capital-cost scenarios and delta analysis are retained but folded');
assert.ok(radarPanel.includes('Cotar na Mesa')&&radarPanel.includes('setPurchaseSummaryVehicle(v)'),
 'Selected vehicles still open quote and purchase-summary workflows');
assert.ok(radarPanel.includes('Semelhança por família de modelo')&&radarPanel.includes('dealerSimilarStock(vehicles,selected)'));
assert.ok(radarPanel.includes('Limites técnicos e atualização da planilha'));
assert.ok(radarCss.includes('#root .motyq-iq-radar-hero h2 { color: #ffffff !important; }'));
assert.ok(!radarPanel.includes('fetch(')&&!quotePanel.includes('fetch('),
 'Visual redesign must not introduce remote Firestore requests or automatic dealer messages');
console.log('Motyq IQ simplified home: 4 primary actions, quick navigator, import guide, unchanged old modules, mobile routing and no extra reads passed.');
