import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const parser=readFileSync('services/marketIqVoiceAppraisal.ts','utf8');
const ui=readFileSync('components/MarketIqMobileExperience.tsx','utf8');
const mesa=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const compiled=ts.transpileModule(parser,{compilerOptions:{
 module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022
},reportDiagnostics:true});
assert.equal((compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
const {parseVoiceAppraisal,findVoiceBrand,suggestVoiceModels}
 =await import('data:text/javascript;base64,'+Buffer.from(compiled.outputText).toString('base64'));
const onix=parseVoiceAppraisal('Avaliar um Onix Premier 2023 com 45 mil quilômetros',2026);
assert.equal(onix.kind,'appraisal');
assert.equal(onix.modelHint,'onix premier');
assert.equal(onix.brandHint,'Chevrolet');
assert.equal(onix.year,2023);
assert.equal(onix.km,45000);
assert.equal(onix.vehicleType,'car');
const tCross=parseVoiceAppraisal('Quero precificar Volkswagen T-Cross 2024 com 57.000 km diesel',2026);
assert.equal(tCross.kind,'appraisal');
assert.equal(tCross.brandHint,'Volkswagen');
assert.equal(tCross.modelHint,'t cross');
assert.equal(tCross.year,2024);
assert.equal(tCross.km,57000);
assert.equal(tCross.fuel,'Diesel');
const moto=parseVoiceAppraisal('Avaliar moto Yamaha Fazer 250 ano 2022 com 18.500 quilômetros',2026);
assert.equal(moto.kind,'appraisal');
assert.equal(moto.vehicleType,'motorcycle');
assert.equal(moto.brandHint,'Yamaha');
assert.equal(moto.modelHint,'fazer 250');
assert.equal(moto.km,18500);
const verbal=parseVoiceAppraisal('Precificar HB20 2021 com quarenta e cinco mil quilômetros',2026);
assert.equal(verbal.kind,'appraisal');
assert.equal(verbal.km,45000);
assert.equal(verbal.modelHint,'hb20');
assert.equal(verbal.brandHint,'Hyundai');
const partial=parseVoiceAppraisal('Avaliar um Jeep Compass',2026);
assert.equal(partial.kind,'appraisal');
assert.equal(partial.year,null);
assert.equal(partial.km,null);
const historical=parseVoiceAppraisal('Tracker 2023',2026);
assert.equal(historical.kind,'history','Old history voice search remains unchanged');
assert.equal(parseVoiceAppraisal('ABC1D23',2026).kind,'history');
assert.equal(parseVoiceAppraisal('',2026).kind,'empty');
const invalidYear=parseVoiceAppraisal('Avaliar um Onix Premier 2085 com 50 mil km',2026);
assert.equal(invalidYear.year,null,'No invented or out-of-range model year');
const brands=[
 {code:'CHEVY',name:'Chevrolet'}, {code:'VW',name:'Volkswagen'},
 {code:'YAMAHA',name:'Yamaha'}
];
assert.deepEqual(findVoiceBrand(onix,brands),brands[0]);
assert.deepEqual(findVoiceBrand(tCross,brands),brands[1]);
assert.equal(findVoiceBrand(onix,[{code:'1',name:'Chevrolet'},{code:'2',name:'Chevrolet'}]),null,
 'Ambiguous FIPE brand code must be chosen by human');
assert.equal(findVoiceBrand(partial,[{code:'1',name:'Jeep'}])?.code,'1');
const models=[
 {code:'1',name:'ONIX HATCH PREMIER 1.0 TURBO AT'},
 {code:'2',name:'ONIX HATCH LT 1.0'},
 {code:'3',name:'ONIX PLUS PREMIER 1.0 TURBO'},
 {code:'4',name:'TRACKER PREMIER'}
];
assert.deepEqual(suggestVoiceModels('onix premier',models).map(m=>m.code),['1','3'],
 'Shortlist trims but do not guess whether sedan or hatch is correct');
assert.deepEqual(suggestVoiceModels('tracker premier',models).map(m=>m.code),['4']);
assert.equal(suggestVoiceModels('nãO-existe',models).length,0);
assert.ok(ui.includes('parseVoiceAppraisal(transcript)'),'Recognition must route to local intent parser');
assert.ok(ui.includes("intent.kind==='appraisal'"),'History commands and appraisal commands separate');
assert.ok(ui.includes('voiceDraft&&<section'), 'Show voice confirmation before any FIPE form changes');
assert.ok(ui.includes('applySpokenAppraisal'), 'Only explicit user click transfers speech into a draft');
assert.ok(ui.includes('if(!voiceDraft||!p.onStartNew())return;'),
 'Never overwrite existing form without the existing confirmation');
assert.ok(ui.includes('findVoiceBrand(draft,p.brands)'), 'Brand IDs come only from actual FIPE options');
assert.ok(ui.includes("draft.vehicleType===p.vehicleType"), 'No reuse of car catalog for motorcycles');
assert.ok(ui.includes('p.onKm(String(draft.km))'));
assert.ok(ui.includes('setModelSearch(draft.modelHint)'), 'Search FIPE versions by spoken trim');
assert.ok(ui.includes("setStep(!found?2:!draft.year?3:!draft.fuel?4:5)"),
 'Missing fields remain in the guided wizard');
assert.ok(ui.includes('suggestedModels.slice(0,50)'), 'Operator chooses exact model from actual FIPE options');
assert.ok(ui.includes('onClick={()=>{p.onModel(m.code);setModelSearch(m.name);}}'),
 'Explicit FIPE version selection');
assert.ok(ui.includes('Interpretar como nova avaliação'), 'Keyboard dictation can submit same workflow');
assert.ok(ui.includes('p.onSave'), 'No changes to signed-in cloud history');
assert.ok(mesa.includes('referenceAvg*.86*(repasse?.95:1)'));
assert.ok(mesa.includes('avg*.86*(repasse?.95:1)'));
console.log('Motyq IQ Mobile voice appraisal: pt-BR year/KM/make/trim parsing, motorcycles, history fallback, human FIPE verification and no auto pricing passed.');
