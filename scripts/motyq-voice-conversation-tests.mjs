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
assert.ok(component.includes('dealerRadarTextMatches(v,queriedModel)'),'queries use real stock model matcher');
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
assert.ok(component.includes('if(!uniqueMatch)'),'ambiguous FIPE versions must not be silently selected');
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
assert.ok(component.includes("yearOptions.length!==1"),'fuel ambiguity must not be silently selected');
assert.ok(component.includes("referenceMonth"),'include FIPE reference month');
assert.ok(component.includes("cache:'no-store'"),'refresh FIPE value rather than use stale cache');
assert.ok(component.includes('!isStock&&hasYear'),'vehicle and year treated as a pricing continuation');
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
