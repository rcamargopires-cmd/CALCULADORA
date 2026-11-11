import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const read=(path)=>readFileSync(path,'utf8');
const compile=(s,jsx=false)=>{
 const r=ts.transpileModule(s,{compilerOptions:{
  module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,
  ...(jsx?{jsx:ts.JsxEmit.ReactJSX}:{})
 },reportDiagnostics:true});
 assert.equal((r.diagnostics||[]).filter(e=>e.category===ts.DiagnosticCategory.Error).length,0,
  'TS transpile failed: '+JSON.stringify(r.diagnostics));
 return r.outputText;
};
const radarJs=compile(read('services/marketIqPurchaseRadar.ts'));
const comparableJs=compile(read('services/marketIqComparableHistory.ts'));
const toModule=(s)=>import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
const radar=await toModule(radarJs);
const comparable=await toModule(comparableJs);
globalThis.__marketiqDecisionDeps={...radar,...comparable};
let opinionJs=compile(read('services/marketIqPurchaseOpinion.ts'));
opinionJs=opinionJs.replace(/^import\s+\{[^\n]+\}\s+from\s+['"]\.\/marketIqPurchaseRadar['"];?\s*$/gm,
 'const {calculateMesaPurchaseCeiling}=globalThis.__marketiqDecisionDeps;');
assert.ok(!opinionJs.includes("from './marketIqPurchaseRadar'"),'Opinion imports resolved');
const opinion=await toModule(opinionJs);
Object.assign(globalThis.__marketiqDecisionDeps,opinion);
let decisionJs=compile(read('services/marketIqQuickDecision.ts'));
const dependencies=[
 ['./marketIqPurchaseRadar','buildPurchaseRadar,calculateMesaPurchaseCeiling,modelYear'],
 ['./marketIqComparableHistory','buildComparableHistory'],
 ['./marketIqPurchaseOpinion','buildMesaPurchaseOpinion']
];
for(const [modulePath,exports] of dependencies){
 const importLine=decisionJs.split('\n').find(line=>line.startsWith('import ')&&line.includes('from '+String.fromCharCode(39)+modulePath+String.fromCharCode(39)));
 assert.ok(importLine,'Need compiled import for '+modulePath);
 decisionJs=decisionJs.replace(importLine,'const {'+exports+'}=globalThis.__marketiqDecisionDeps;');
}
assert.ok(!decisionJs.includes("from './marketIq"),'Decision imports must be fully resolved');
const quick=await toModule(decisionJs);
const now=new Date().toISOString().slice(0,10);
const stock={reportDate:now,importedAt:now,vehicles:[{
 key:'PLATE:JKL4M56',plate:'JKL4M56',brand:'HYUNDAI',model:'HB20 TGDI AT6',
 year:'2022/2023',vehicleType:'car',days:110,km:50000,kmValid:true,
 cost:75000,price:90000,store:'SOROCABA'
}],warnings:[],stores:['SOROCABA'],duplicateCount:0,serviceOrderRows:0};
const target={
 plate:'ABC1D23',brand:'HYUNDAI',model:'HB20 1.0 TGDI AT6 COMFORT PLUS',year:'2022/2023',
 km:32000,vehicleType:'car',fipe:90000,fipeStatus:'current',
 fipeCode:'015142-9',fipeYear:2023
};
const input={
 target,snapshot:stock,saved:[],companyId:'abrao-reze',
 offer:76000,preparation:2500,preparationConfirmed:false,
 repasse:false,verifiedMarketPrice:100000,verifiedAds:3,
 historicalEstimate:73500,historicalRange:[69000,79000]
};
const incomplete=quick.buildQuickPurchaseDecision({
 ...input,target:{...target,brand:'',model:'',year:'',km:0}
});
assert.equal(incomplete.identityReady,false);
assert.equal(incomplete.historical,null);
assert.equal(incomplete.ceiling,null);
assert.equal(incomplete.opinion,null);
const unverified=quick.buildQuickPurchaseDecision({...input,verifiedAds:0,verifiedMarketPrice:null});
assert.equal(unverified.ceiling,null,'No verified market = no validated ceiling');
assert.equal(unverified.historical,73500,'Statistical model remains explicitly preliminary');
assert.ok(unverified.warnings.some(s=>s.includes('dois anúncios')));
const unconfirmed=quick.buildQuickPurchaseDecision(input);
assert.equal(unconfirmed.ceiling,null,'A zero or estimated preparation must be confirmed');
const confirmed=quick.buildQuickPurchaseDecision({...input,preparationConfirmed:true});
assert.equal(confirmed.ceiling,83500,'Commercial ceiling reuses 0.86 minus confirmed preparation');
assert.equal(confirmed.radar.familyCount,1);
assert.equal(confirmed.radar.over90Count,1);
assert.equal(confirmed.similar.paidCount,0,'Dealer cost must not be treated as a paid comparable');
assert.ok(confirmed.warnings.some(s=>s.includes('Histórico exibido é parcial')));
const repasse=quick.buildQuickPurchaseDecision({...input,preparationConfirmed:true,repasse:true});
assert.equal(repasse.ceiling,79200,'Repasse includes additional 5% discount');
const older=quick.buildQuickPurchaseDecision({...input,preparationConfirmed:true,
 target:{...target,fipeStatus:'outdated'}
});
assert.equal(older.fipeCurrent,false);
assert.equal(older.historical,null,'Outdated FIPE cannot qualify a historical estimate');
assert.ok(older.warnings.some(s=>s.includes('FIPE vigente')));
const paid=[
 {id:'real1',plate:'DEF4G56',brand:'HYUNDAI',model:'HB20 1.0 TGDI AT6 COMFORT PLUS',
  year:'2023',km:'34000',vehicleType:'car',approvedValue:70000,
  fipe:{value:90000,fipeCode:'015142-9'}}
];
const otherTrim={...paid[0],id:'wrong-version',plate:'XYZ9H87',
 model:'HB20 1.0 TGDI AT6 LIMITED',approvedValue:120000};
const history=quick.buildQuickPurchaseDecision({...input,saved:[...paid,otherTrim],preparationConfirmed:true});
assert.equal(history.similar.paidCount,1,'Only independently confirmed compatible paid values count: '+JSON.stringify(history.similar));
assert.equal(history.similar.paidMedian,70000);
assert.equal(history.similar.limited,true,'This board does not pretend to have fetched the monthly archive');

const component=read('components/MarketIqQuickDecisionPanel.tsx');
const workspace=read('components/ManualPricingWorkspace.tsx');
const home=read('components/MarketIqSimpleHome.tsx');
const navigation=read('services/marketIqSimpleNavigation.ts');
compile(component,true);compile(workspace,true);compile(home,true);
assert.ok(component.includes('buildQuickPurchaseDecision('),'Board reuses the reviewed engines');
assert.ok(component.includes("decision.ceiling??decision.historical"),'Never invent a money value');
assert.ok(component.includes('Teto comercial com anúncios conferidos'));
assert.ok(component.includes('Mediana de valores avaliados · não são compras confirmadas'));
assert.ok(component.includes('Compras pagas comparáveis'));
assert.ok(component.includes('Cotar na Mesa'));
assert.ok(component.includes('Conferir fontes completas'));
assert.ok(workspace.includes('<MarketIqQuickDecisionPanel'));
assert.ok(workspace.includes('setDecisionOffer(\'\')')&&workspace.includes('setDecisionConfirmedCost(null)'),
 'Different vehicles and preparation costs must reset previous user confirmations');
assert.ok(workspace.includes('onQuote={quickQuoteCurrent}'),'Quote from quick decision must use direct registered-buyer picker');
assert.ok(workspace.includes('Ver modelo histórico, classificação e cálculos detalhados'));
assert.ok(workspace.includes('MarketIqPurchaseSummaryModal open={purchaseSummaryOpen}'));
assert.ok(home.includes("label:'Decisão de Compra'"));
assert.ok(navigation.includes('decisao de compra'));
console.log('Motyq IQ one-screen decision: real FIPE, exact paid history, stock pressure, verified market, cost confirmation, safe ceilings, manual quote handoff and mobile preview passed.');
