import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('services/marketIqMobileFlow.ts','utf8');
const ui=readFileSync('components/MarketIqMobileExperience.tsx','utf8');
const mesa=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const app=readFileSync('App.tsx','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
},reportDiagnostics:true});
assert.equal(compiled.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length||0,0);
const {mobileYearOptions,mobilePriceSource,mobileHistorySearch,mobileModelYearFromCode,mobileQuickIntent,mobileFilterModels,mobileFuelFromModel,mobileAutoYearChoice}
 =await import('data:text/javascript;base64,'+Buffer.from(compiled.outputText).toString('base64'));
const options=[
 {code:'2023-1',name:'2023 Gasolina'},
 {code:'2023-3',name:'2023 Diesel'},
 {code:'2022-1',name:'2022 Gasolina'}
];
assert.deepEqual(mobileYearOptions(options,2023,'Gasolina').choices.map(x=>x.code),['2023-1']);
assert.deepEqual(mobileYearOptions(options,2023,'Diesel').choices.map(x=>x.code),['2023-3']);
assert.deepEqual(mobileYearOptions(options,2023,'Flex').choices.map(x=>x.code),['2023-1']);
assert.equal(mobileYearOptions(options,2023,'Flex').fuelMatched,true,
 'Flex FIPE may be labelled gasolina; indicate matching FIPE year without inventing a new code');
const fallback=mobileYearOptions(options,2023,'Híbrido');
assert.equal(fallback.yearMatched,true);
assert.equal(fallback.fuelMatched,false,'Fuel mismatch must be visible to operator');
assert.equal(fallback.choices.length,2,'Never fabricate fuel-specific FIPE choices');
assert.equal(mobileYearOptions(options,2019,'Flex').yearMatched,false);
assert.equal(mobileModelYearFromCode('2023-1','2023 Gasolina'),2023);
assert.equal(mobileModelYearFromCode('','2021 Gasolina'),2021);
assert.equal(mobileModelYearFromCode('',''),0);
const records=[
 {id:'1',brand:'Chevrolet',model:'Tracker Premier',plate:'ABC1D23',year:'2023'},
 {id:'2',brand:'Volkswagen',model:'Jetta GLI',plate:'DEF5G67',year:'2023'}
];
assert.deepEqual(mobileHistorySearch(records,'tracker').map(x=>x.id),['1']);
assert.deepEqual(mobileHistorySearch(records,'abc1d23').map(x=>x.id),['1']);
assert.deepEqual(mobileHistorySearch(records,'CHEVROLET').map(x=>x.id),['1']);
assert.deepEqual(mobileHistorySearch(records,'').map(x=>x.id),['1','2']);
const verified=mobilePriceSource({fipe:102497,verifiedCount:3,verifiedCeiling:84999,historicalTarget:77000,indexedReference:102173});
assert.equal(verified.kind,'verified');
assert.equal(verified.value,84999);
const mesaMatch=mobilePriceSource({fipe:138930,verifiedCount:0,verifiedCeiling:0,
 historicalTarget:113600,indexedReference:0,mesaReference:98000,mesaCount:2});
assert.equal(mesaMatch.kind,'mesa','Two matching appraisals replace the statistical mobile recommendation');
assert.equal(mesaMatch.value,98000);
assert.ok(/avaliações internas/.test(mesaMatch.disclaimer),'Must label assessments, not sales');
const mesaAndMarket=mobilePriceSource({fipe:138930,verifiedCount:3,verifiedCeiling:110000,
 historicalTarget:113600,indexedReference:0,mesaReference:98000,mesaCount:2});
assert.equal(mesaAndMarket.kind,'mesa','Repeated internal price becomes primary, verified market stays a separate datum');
assert.equal(mesaAndMarket.value,98000);
const singleMesa=mobilePriceSource({fipe:138930,verifiedCount:0,verifiedCeiling:0,
 historicalTarget:113600,indexedReference:0,mesaReference:98000,mesaCount:1});
assert.equal(singleMesa.kind,'historical','A single evaluation keeps the original model formula');
assert.equal(singleMesa.value,113600);
const noMesa=mobilePriceSource({fipe:138930,verifiedCount:0,verifiedCeiling:0,
 historicalTarget:113600,indexedReference:0,mesaReference:0,mesaCount:0});
assert.equal(noMesa.kind,'historical','No historical match keeps FIPE/statistical fallback');
assert.equal(noMesa.value,113600);
const history=mobilePriceSource({fipe:102497,verifiedCount:0,verifiedCeiling:0,historicalTarget:80850,indexedReference:102173});
assert.equal(history.kind,'historical');
assert.equal(history.value,80850);
const missing=mobilePriceSource({fipe:102497,verifiedCount:1,verifiedCeiling:100000,historicalTarget:0,indexedReference:102173});
assert.equal(missing.kind,'missing');
assert.equal(missing.value,0,'FIPE or indexed ad must never impersonate an actual B2B purchase');
assert.ok(!ui.includes('Resta 1 precificação'),'Do not invent a weekly pricing quota');
assert.ok(ui.includes("'Passo '+step+' de 5"),'Guided five-step progress preserved');
assert.ok(ui.includes("quickMode?'Busca rápida':'Nova avaliação'"),'Quick mode has distinct navigation');
assert.ok(ui.includes('É carro ou moto?'));
assert.ok(ui.includes('Qual a marca?'));
assert.ok(ui.includes('Qual o ano-modelo?'));
assert.ok(ui.includes('Qual é o combustível?'));
assert.ok(ui.includes('Qual é o modelo e a versão?'));
assert.ok(ui.includes('mobileYearOptions(p.years,pickedYear,pickedFuel)'));
assert.ok(ui.includes('onClick={()=>selectMobileModel(m)}'),'Selecting a FIPE model starts automatic year resolution');
assert.ok(ui.includes('onClick={()=>p.onYear(y.code)}'),'Only ambiguous FIPE year/fuel options require a tap');

const makes=[{code:'13',name:'Jeep'},{code:'2',name:'Chevrolet'},{code:'11',name:'Volkswagen'}];
const intent=mobileQuickIntent('Compass Longitude 2025',makes);
assert.equal(intent.brand.code,'13','Model name may infer an unambiguous FIPE brand');
assert.equal(intent.year,2025);
assert.equal(intent.modelSearch,'compass longitude');
assert.equal(mobileQuickIntent('Jeep Compass Limited 2024',makes).brand.code,'13');
assert.equal(mobileQuickIntent('Carro desconhecido 2020',makes).needsBrand,true,
 'Unknown model needs explicit brand selection rather than fabricated make');
const jeep=[
 {code:'a',name:'COMPASS LONG. T270 1.3 TB 4x2 Flex Aut.'},
 {code:'b',name:'COMPASS LIMITED TD 350 2.0 4x4 Die. Aut.'},
 {code:'c',name:'COMPASS LONGITUDE T270 1.3 FLEX'},
 {code:'d',name:'RENEGADE T270 1.3 FLEX'}
];
assert.deepEqual(mobileFilterModels(jeep,'Compass Longitude','Flex').map(x=>x.code),['a','c'],
 'Search hides diesel and other models while accepting LONG. abbreviation');
assert.equal(mobileFuelFromModel('COMPASS TD 350 Diesel Automático'),'Diesel');
assert.equal(mobileFuelFromModel('COMPASS 4xe Híbrido'),'Híbrido');
assert.equal(mobileAutoYearChoice([{code:'2025-1',name:'2025 Gasolina'}],2025,'Flex')?.code,'2025-1',
 'Compatible single year/fuel choice must resolve automatically');
assert.equal(mobileAutoYearChoice([{code:'2025-1',name:'2025 Gasolina'}],2025,'Diesel'),null,
 'Fuel mismatch must never be silently auto-selected');
assert.equal(mobileAutoYearChoice([
 {code:'2025-1',name:'2025 Gasolina'},{code:'2025-3',name:'2025 Diesel'}
],2025,''),null,'Ambiguous FIPE fuel choices require explicit selection');
assert.ok(ui.includes('Busca rápida de veículo'));
assert.ok(ui.includes('Prefiro escolher passo a passo'));
assert.ok(ui.includes('Tipo de veículo para busca rápida'),'Quick search must support cars and motorcycles');
assert.ok(ui.includes('if(!sameVehicleType)p.onVehicleType(quickType)'),
 'Quick search must not inherit old vehicle type');
const motoQuick=mobileQuickIntent('Yamaha Fazer 2023',[{code:'10',name:'Yamaha'}]);
assert.equal(motoQuick.brand?.name,'Yamaha');
assert.equal(motoQuick.year,2023);
assert.ok(ui.includes("mobileFilterModels(p.models,quickMode?quickIntent.modelSearch:modelSearch,pickedFuel)"));
assert.ok(ui.includes('mobileAutoYearChoice(p.years,pickedYear,pickedFuel)'));
assert.ok(!ui.includes('Ano/combustível da versão na FIPE'),'Redundant FIPE dropdown removed');
assert.ok(ui.includes('historyMatches'));
assert.ok(ui.includes('p.onRestoreHistory(r)'), 'Recent and old history use the real restore workflow');
assert.ok(ui.includes('p.onSave'), 'Mobile save must call existing authenticated history backend');
assert.ok(ui.includes('dmsPermissions(p.user).stockView'), 'Stock must honor existing authorization');
assert.ok(ui.includes('currentStockService.getCurrent(companyIdForUser(p.user),storeIdForUser(p.user))'));
assert.ok(ui.includes('MarketIqConsultedRepasse'), 'Repasse view reuses current workflow');
assert.ok(ui.includes('selectedPrice.disclaimer'), 'Verified and historical values remain differentiated');
assert.ok(ui.includes('p.verifiedCount>=2?cash(p.verifiedAverage)'), 'Only a verified market sample is shown as Webmotors mean');
assert.ok(ui.includes('!validPlate||!p.fipe?.value'), 'Prevent incomplete saves');
assert.ok(ui.includes('/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p.plate)'), 'Do not enable save for invalid 7-character plates');
assert.ok(ui.includes('navigator.share'), 'Native phone sharing, with browser fallback');
assert.ok(ui.includes('SpeechRecognition'), 'Speech recognition must be feature detected');
assert.ok(ui.includes('onOpenFullDesk'), 'User can always access the complete existing desk');
assert.ok(ui.includes('if(!p.onStartNew())return;'), 'New valuation explicitly checks whether to abandon unsaved form');
assert.ok(ui.includes('onOpenApprovals={p.onOpenApprovals}'), 'Repasse approval action must open the real approvals center');
assert.ok(mesa.includes('const beginNewMobileValuation=():boolean=>'));
assert.ok(mesa.includes("window.confirm('Iniciar nova avaliação?"), 'No accidental loss of incomplete appraisal');
assert.ok(mesa.includes("onOpenApprovals={()=>{setMobileFullDesk(true);switchDeskSection('approvals');}}"));
assert.ok(mesa.includes('<MarketIqMobileExperience'));
assert.ok(mesa.includes('history={saved}'), 'Mobile uses exact same cloud history');
assert.ok(mesa.includes('onRestoreHistory={record=>restore(record as Saved)}'));
assert.ok(mesa.includes('fipe={fipe}'), 'Mobile uses existing FIPE API result');
assert.ok(mesa.includes('onSave={(proposal,suggested,source)=>void save(proposal,suggested,source)}'),
 'Mobile uses the existing authenticated history backend with optional manager offer and selected base');
assert.ok(ui.includes('onClick={saveProposal}'), 'Mobile save validates and sends proposal fields');
assert.ok(ui.includes('Ajustar proposta'), 'Mobile offers an explicit change-of-offer control');
assert.ok(mesa.includes('onSearchMarket={()=>void searchMarket()}'));
assert.ok(mesa.includes("mobileFullDesk?'block':'hidden lg:block'"),'Preserve desktop desk on wide screens');
assert.ok(app.includes('lg:flex'), 'Hide old desktop IQ masthead on phones');
assert.ok(app.includes('hidden max-w-7xl px-5 pt-6 lg:block'), 'Avoid duplicate dashboard heading on phones');
assert.ok(mesa.includes('referenceAvg*.86*(repasse?.95:1)'),'Existing indexed price formula unchanged');
assert.ok(mesa.includes('avg*.86*(repasse?.95:1)'),'Existing confirmed price formula unchanged');
console.log('Motyq IQ Mobile: quick and guided routes, matching FIPE version/year/fuel, safe pricing and desktop compatibility passed.');
