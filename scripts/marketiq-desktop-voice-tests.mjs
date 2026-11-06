import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const desktop=readFileSync('components/MarketIqDesktopVoiceSearch.tsx','utf8');
const mesa=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const hologram=readFileSync('components/MarketIqVoiceHologram.tsx','utf8');
const speech=readFileSync('services/marketIqMobileVoice.ts','utf8');
const voiceAssist=readFileSync('services/marketIqDesktopVoiceAssist.ts','utf8');
const flow=readFileSync('services/marketIqMobileFlow.ts','utf8');
const compile=src=>ts.transpileModule(src,{fileName:'motyq-voice.tsx',compilerOptions:{
 module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX
},reportDiagnostics:true});
for(const [file,src] of [['desktop component',desktop],['flow helper',flow],['speech helper',speech],['voice interpretation helper',voiceAssist]]){
 assert.equal(compile(src).diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length||0,0,file);
}
const source=compile(flow).outputText;
const {mobileQuickIntent,mobileFilterModels,mobileYearOptions}=await import('data:text/javascript;base64,'+
 Buffer.from(source).toString('base64'));
const audio=compile(speech).outputText;
const audioUrl='data:text/javascript;base64,'+Buffer.from(audio).toString('base64');
const {mobileSpeechToSearch}=await import(audioUrl);
const assistantJs=compile(voiceAssist).outputText.replace(
 /from ['"]\.\/marketIqMobileVoice['"]/g, `from '${audioUrl}'`);
const {desktopSpeechInterpretations,desktopFuzzyFipeSuggestions}=await import(
 'data:text/javascript;base64,'+Buffer.from(assistantJs).toString('base64'));
const brandList=[{code:'13',name:'Jeep'},{code:'9',name:'Yamaha'}];
const q=mobileQuickIntent('Compass Longitude 2025',brandList);
assert.equal(q.brand?.name,'Jeep');
assert.equal(q.modelSearch,'compass longitude');
assert.equal(q.year,2025);
const models=[
 {code:'1',name:'COMPASS LONG. T270 1.3 TB 4x2 Flex Aut.'},
 {code:'2',name:'COMPASS LIMITED TD350 2.0 Diesel Aut.'},
 {code:'3',name:'COMPASS LONGITUDE T270 1.3 Flex Aut.'}
];
assert.deepEqual(mobileFilterModels(models,q.modelSearch,'').map(m=>m.code),['1','3']);
assert.equal(mobileSpeechToSearch('Compass Longitude dois mil e vinte e cinco'),
 'Compass Longitude 2025');
const speechCandidates=desktopSpeechInterpretations({
 results:[[
  {transcript:'Compass longitudo 2025',confidence:.45},
  {transcript:'Compass longitude 2025',confidence:.28},
  {transcript:'Compass latitude 2025',confidence:.88}
 ]]
},brandList,models);
assert.equal(speechCandidates[0],'Compass longitude 2025',
 'A FIPE helps select the correct alternative among browser hypotheses');
assert.equal(speechCandidates.length,3);
assert.deepEqual(desktopFuzzyFipeSuggestions('compass longitudo',models).map(v=>v.code),
 ['3','1'],'Fuzzy alternatives suggest only FIPE rows and never select them');
assert.deepEqual(desktopFuzzyFipeSuggestions('limitd',models),[],
 'A single vague word must not produce a confident version suggestion');
assert.deepEqual(desktopSpeechInterpretations({results:[]},brandList,models),[]);
assert.deepEqual(mobileYearOptions([
 {code:'2025-1',name:'2025 Gasolina'},{code:'2024-1',name:'2024 Gasolina'}
],2025,'').choices.map(y=>y.code),['2025-1']);
assert.ok(mesa.includes("import MarketIqDesktopVoiceSearch from './MarketIqDesktopVoiceSearch'"));
assert.ok(mesa.includes('<MarketIqDesktopVoiceSearch'),'Desktop FIPE form must expose voice button');
assert.ok(mesa.includes('onBrand={selectBrand}')&&mesa.includes('onModel={selectModel}')&&
 mesa.includes('onYear={selectYear}'),'Voice must use existing FIPE selectors');
assert.ok(desktop.includes('<MarketIqVoiceHologram'),
 'Reuses approved M.O.T.Y.Q hologram in desktop');
assert.ok(desktop.includes("r.lang='pt-BR'"),'Recognition in Portuguese');
assert.ok(desktop.includes('r.maxAlternatives=3'),
 'Ask the browser for multiple recognition alternatives');
assert.ok(desktop.includes('desktopSpeechInterpretations(event,p.brands,p.models)'),
 'Use FIPE context to prefer the best genuine browser alternative');
assert.ok(desktop.includes('speechAlternatives.map('),
 'Present recognized alternatives to the operator');
assert.ok(desktop.includes('desktopFuzzyFipeSuggestions(modelFilter,p.models)'),
 'Suggest FIPE rows when the recognition term has a small spelling error');
assert.ok(desktop.includes('Talvez você tenha dito uma destas versões'),
 'Suggestion wording must require human confirmation');
assert.ok(desktop.includes('SpeechRecognition')&&desktop.includes('webkitSpeechRecognition'));
assert.ok(desktop.includes('mobileSpeechToSearch'),'Normalize spoken years and plates');
assert.ok(desktop.includes('manualStopRef.current=true')&&desktop.includes('r.onend='),
 'Tap the hologram to stop and process speech');
assert.ok(desktop.includes('onClick={()=>prepareSearch(searchText)}'),
 'Explicit FIPE search after silent speech or typed fallback');
assert.ok(desktop.includes('showBrandPicker')&&desktop.includes('pickBrand'),
 'Unrecognized make requires user selection');
assert.ok(desktop.includes('onClick={()=>p.onModel(m.code)}'),
 'Exact trim choice must be confirmed');
assert.ok(desktop.includes('onClick={()=>pickYear(y.code)}'),
 'Exact FIPE year code must be confirmed');
assert.ok(desktop.includes("window.confirm('Trocar o tipo de veículo"),
 'Protect an existing filled form from a vehicle type overwrite');
assert.ok(desktop.includes('p.catalogError')&&desktop.includes('p.onRetryFipe'),
 'FIPE failure has a retry action');
assert.ok(desktop.includes('aria-modal="true"')&&desktop.includes("if(e.key==='Escape')close()"),
 'The voice dialog must be accessible and closable');
assert.ok(desktop.includes('recognitionRef.current=null')&&
 desktop.includes('active?.abort?.()'),'Recognition ends and can restart');
assert.ok(!desktop.includes('getUserMedia(')&&!hologram.includes('getUserMedia('),
 'No competing microphone acquisition on Android or desktop');
assert.ok(!desktop.includes('MediaRecorder')&&!desktop.includes('fetch('),
 'Audio is never recorded or sent to a new server endpoint');
assert.ok(!desktop.includes('p.onSave')&&!desktop.includes('p.onSearchMarket'),
 'Voice search cannot automatically register purchases or unverified prices');
console.log('Motyq IQ Desktop voice: voice capture, brand/trim/year FIPE selection, accessibility and no competing microphone passed.');
