import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const component=readFileSync('components/MotyqVoiceConversation.tsx','utf8');
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
for(const [name,source] of [['voice',component],['workspace',workspace]]){
 const errors=(ts.transpileModule(source,{fileName:name+'.tsx',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true}).diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 assert.equal(errors.length,0,name+' syntax: '+errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join(';'));
}
assert.ok(workspace.includes("const voiceOwner=String(user.email||'').trim().toLowerCase()==='reinaldo.ribas@abraoreze.com.br'"),'voice pilot gated to user');
assert.ok(workspace.includes("voiceOwner&&<section"),'only owner can open voice');
assert.ok(workspace.includes('snapshot={radarLoadedScope===captureScope?radarSnapshot:null}'),'must not cross dealer account scope');
assert.ok(component.includes('dealerRadarTextMatches(v,model)'),'stock queries use real Dealer matcher');
assert.ok(component.includes('const spokenYear=Number(words.match'),'explicit model year is parsed');
assert.ok(component.includes('dealerModelYear(v.year)===year'),'filter uses Dealer model year');
assert.ok(component.includes('stockContextRef.current={model,year,trim,engine:requestedEngine}'),'retain model, year, trim and engine');
assert.ok(component.includes('const changed=Boolean(explicitModel'),'changing models resets previous year');
assert.ok(component.includes('clearYear'),'all years can be requested');
assert.ok(component.includes('const requestedEngine='),'engine is part of exact vehicle lookup');
assert.ok(component.includes('hasUnknownVersions'),'ambiguous Dealer versions are not counted as precise');
// Regression: a generic family inventory query must drop previously selected year/trim/engine.
assert.ok(component.includes('const broadenVersions='),'spoken all-versions requests recognized');
assert.ok(component.includes('const explicitFamilyStock='),'explicit whole-family request resets FIPE filter');
assert.ok(component.includes('const year=broaden?null:'),'family request clears model-year');
assert.ok(component.includes('const trim=broaden?null:'),'family request clears version');
assert.ok(component.includes('const requestedEngine=broaden?null:'),'family request clears engine');
// Purchase intents must bypass both stock-memory shortcuts and Gemini stock classifier.
assert.ok(component.includes('const purchaseIntent='),'purchase intent detected before Dealer routing');
assert.ok(component.includes('if(purchaseIntent){'),'explicit purchase request gets pricing wizard');
assert.ok(component.includes('if(directPurchase){respondDeterministic(raw);return;}'),'pricing bypasses stock Gemini intent');
assert.ok(component.includes("De qual veículo você quer saber o valor de compra?"),'purchase without model asks for a vehicle');
// Conversational regressions from the operator's real November 26 dialogue.
assert.ok(component.includes("'spin','c4 cactus','cactus'"),'Spin recognized as a real model, never fallback to Renegade');
assert.ok(component.includes("const inferredBrand=model==='spin'?'chevrolet'"),'FIPE resolves Chevrolet Spin without forcing brand repetition');
assert.ok(component.includes("'prestige','lt','ltz','premier'"),'Creta Prestige and Spin LT are supported FIPE versions');
assert.ok(component.includes('lastAnswerRef.current'),'the assistant tracks repeating replies');
assert.ok(component.includes("Não entendi sua última pergunta."),'repeated response changes to clarification');
assert.ok(component.includes("Você quis dizer Citroën C4 Cactus?"),'unclear Cactos voice recognition requests confirmation');
assert.ok(component.includes("const next=fipePendingRef.current+' '+raw"),'FIPE year/version follow-ups retain the original request');
assert.ok(component.includes("if(fipeIntent){"),'FIPE intent supersedes stock/price wizard');
assert.ok(component.includes("if(/\\bfipe\\b/.test(normalized)||fipePendingRef.current||draft"),'FIPE and ongoing pricing bypass Gemini stock router');
assert.ok(component.includes("Sem um anúncio comparável confirmado"),'no repeated reference prompt when no verified ad price exists');
assert.ok(component.includes("Quer saber a média de dias em estoque"),'fragmented aging question asks what operator meant');
// Execute model recognizer to catch accidental substring or unexpected fallback.
const modelStart=component.indexOf('const modelFrom=');
const modelEnd=component.indexOf('export default function',modelStart);
assert.ok(modelStart>=0&&modelEnd>modelStart,'vehicle matcher available');
const modelCode=ts.transpileModule(component.slice(modelStart,modelEnd),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const matcherScope={normalize:(v)=>String(v||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim()};
vm.createContext(matcherScope);vm.runInContext(modelCode,matcherScope);
for(const [utterance,wanted] of [['Chevrolet Spin LT 2019','spin'],['FIPE do Creta Prestige 2020','creta'],['quantos Corolla temos no estoque','corolla'],['tem cactos no estoque',null]]){
 matcherScope.utterance=utterance;
 assert.equal(vm.runInContext('modelFrom(utterance)',matcherScope),wanted,'voice recognizes '+utterance);
}
// Run the exact Dealer fabrication/model-year extraction against common V44 labels.
const yearFrom=component.slice(component.indexOf('export const dealerModelYear='),component.indexOf('const modelFrom=')).replace('export const ','');
const compiled=ts.transpileModule(yearFrom,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const yearContext={};vm.createContext(yearContext);vm.runInContext(compiled,yearContext);
for(const [label,year] of [['2021/2022',2022],['2022',2022],['2022/2023',2023],['2021 - 2022',2022],['',null]]){
 yearContext.label=label;
 assert.equal(vm.runInContext('dealerModelYear(label)',yearContext),year,'Dealer model-year '+label);
}

assert.ok(component.includes('const stockSignal='),'stock intent recognized independently');
assert.ok(component.includes('if(stockSignal||contextual'),'follow-ups route to stock before pricing');
assert.ok(component.includes('stockPendingModelRef.current=true'),'generic request remembers missing model');
assert.ok(component.includes('stockContextRef.current||fipeContextRef.current'),'FIPE vehicle carries into Dealer lookup');
assert.ok(component.includes('if(explicitModel)setLastModel(explicitModel)'),'mentioned model retained');
assert.ok(component.includes("setDraft(null);fipePendingRef.current='';fipeChoicesRef.current=null;fipeRequestRef.current++"),'stock cancels purchase wizard');
assert.ok(component.includes('all||dealerRadarTextMatches(v,model)'),'model narrowed unless all requested');
assert.ok(component.includes('normalizeTrim(v.model)'),'version must be verified against Dealer description');
assert.ok(component.includes('(!requestedEngine||'),'engine filter applied when requested');
assert.ok(component.includes('stockReady||!snapshot'),'cannot invent stock without Dealer import');
assert.ok(component.includes("const fullInput=explicitModel?raw:(draft?.vehicle?draft.vehicle+' '+raw:raw)"),'FIPE can follow incomplete purchase question');
assert.ok(component.includes("const matchYear=mobileYearOptions(years,year,fuel)"),'check the year of every candidate before selecting model');
assert.ok(component.includes("const yearOption=winner.yearOption"),'use validated year code of selected model');
assert.ok(component.includes("Number(result.year)!==year"),'reject mismatched FIPE model year from provider');
assert.ok(component.includes("fipeChoicesRef.current={original:raw,options}"),'remember FIPE alternatives for conversational selection');
assert.ok(component.includes("choice.options[index].code"),'choose option by spoken first/second instead of restarting');
assert.ok(component.includes("const directCode=raw.match"),'allow known FIPE code when catalog is incomplete');
assert.ok(component.includes("data.fipeCode!==directCode||Number(data.year)!==year"),'verify returned FIPE code and year');
assert.ok(!component.includes("Esse ano não consta para a versão selecionada."),'do not falsely claim FIPE year is nonexistent');

assert.ok(component.includes("if(/\\bfipe\\b|tabela fipe/.test(words))"),'FIPE question goes to independent intent');
assert.ok(component.includes("fipeOptions('brands')")&&component.includes("fipeOptions('models'")&&component.includes("fipeOptions('years'")&&component.includes("fipeOptions('detail'"),'FIPE uses live catalog resolution');
assert.ok(component.includes('if(!winner)'),'ambiguous FIPE versions must not be silently selected');
// Execute the pure ranking helper against the exact voice scenario that failed.
const begin=component.indexOf('const fipeModelRank=');
const end=component.indexOf('const fipeOptions=async',begin);
assert.ok(begin>=0&&end>begin,'FIPE ranking helper exists');
const rankJS=ts.transpileModule(component.slice(begin,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const context={
 normalize:(v)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(),
};
context.fipeTerms=(v)=>context.normalize(v).replace(/\b(long|longi|longit)\b/g,'longitude').replace(/[^a-z0-9]+/g,' ').split(' ').filter(Boolean);
vm.createContext(context);
vm.runInContext(rankJS,context);
const options=[
 {code:'abbr',name:'Renegade Long. T270 1.3 TB 4x2 Flex Aut.'},
 {code:'full',name:'Renegade Longitude T270 1.3 Turbo 4x2 Aut.'}
];
context.options=options;
assert.equal(vm.runInContext("fipeModelRank('qual a fipe renegade longitude 2022 t270 1.3 turbo 4.2 automatico',options)?.code",context),'full','precise spoken T270 resolves full Longitude FIPE name');
assert.equal(vm.runInContext("fipeModelRank('Renegade T270 2022',options)?.code ?? null",context),null,'insufficient evidence cannot silently choose a FIPE code');
assert.ok(component.includes("fipePendingRef.current=raw"),'FIPE ambiguity retains conversational context');
assert.ok(component.includes("const followup=fipePendingRef.current+' '+raw"),'follow-up selects engine or fuel from original FIPE request');
assert.ok(component.includes('if(fuel&&!matchYear.fuelMatched)continue'),'fuel ambiguity must not be silently selected');
assert.ok(component.includes("referenceMonth"),'include FIPE reference month');
assert.ok(component.includes("cache:'no-store'"),'refresh FIPE value rather than use stale cache');
assert.ok(component.includes('!stockSignal&&hasYear'),'pricing only starts outside stock intent');
assert.ok(component.includes("awaiting==='version'"),'asks version instead of repeating model request');
assert.ok(component.includes("draft?.awaiting==='version'"),'version answer retained in context');
assert.ok(component.includes("draft?.awaiting==='details'"),'year and mileage answers retained in context');
assert.ok(component.includes("draft.awaiting==='reference'"),'follow-up flows to market reference');
assert.ok(component.includes('Compra sugerida:'),'simulation returns concise number');
assert.ok(component.includes('!stockReady||!snapshot'),'must not claim unloaded inventory counts');
assert.ok(component.includes('sem pesquisa de mercado confirmada'),'must not fabricate Webmotors findings');
assert.ok(component.includes('Compra sugerida: '),'answer starts with value');
assert.ok(!component.includes('Nossa regra é usar'),'no rule lecture in pricing answer');
assert.ok(component.includes('n>=0'),'accept zero-cost preparation');
assert.ok(component.includes('next.reference!*0.86-n'),'pricing follows 14% cost rule');
assert.ok(component.includes("setDraft({...draft,reference:n,awaiting:'preparation'})"),'conversational context retained for price');
assert.ok(component.includes('r.lang=\'pt-BR\''),'pt BR recognition');
assert.ok(component.includes('window.speechSynthesis.speak(item)'),'spoken replies');
assert.ok(component.includes('onClick={start}'),'microphone user initiated');
assert.ok(component.includes('wakeEnabledRef.current=true'),'wake mode requires user opt-in');
assert.ok(component.includes('wakeEnabledRef.current=false'),'wake mode can be disabled');
assert.ok(component.includes('<MarketIqVoiceHologram'), 'hologram starts conversation');
assert.ok(component.includes('onClick={start}'),'one tap starts or stops conversation');
assert.ok(!component.includes('const wake=/'),'no wake-word gate');
assert.ok(component.includes('respondRef.current(heard)'),'all spoken commands route directly to assistant');
assert.ok(component.includes('if(isFinal&&speechDraft.current)'),'final recognition processed');
assert.ok(component.includes('if(speechDraft.current&&!delivered.current)'),'interim text retained when speech ends');
assert.ok(component.includes('item.onend=')&&component.includes('speakingRef.current=true'),'mic pauses while TTS plays');
assert.ok(component.includes('queueCycle()'),'recognition resumes between interactions');
assert.ok(component.includes("speak('Estou ouvindo.')"),'assistant acknowledges activation');
assert.ok(component.includes('Último reconhecimento:'), 'recognized speech displayed to diagnose failures');
assert.ok(component.includes('Selecionar voz do assistente'), 'voice selector offered for installed voices');
assert.ok(component.includes('onClose'), 'user can exit');
console.log('MOTYQ Voice pilot: single user, consent, real Dealer data, 14% simulated pricing, no invented Webmotors offers passed.');
