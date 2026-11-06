import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('services/marketIqMobileVoice.ts','utf8');
const ui=readFileSync('components/MarketIqMobileExperience.tsx','utf8');
const transpile=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022
},reportDiagnostics:true});
assert.equal(transpile.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length||0,0);
const {speechErrorFeedback,mobileSpeechToSearch}=await import('data:text/javascript;base64,'+
 Buffer.from(transpile.outputText).toString('base64'));
assert.equal(mobileSpeechToSearch('Tracker 2023'),'Tracker 2023');
assert.equal(mobileSpeechToSearch('VW Jetta GLI'),'VW Jetta GLI');
assert.equal(mobileSpeechToSearch('ABC 1 D 23'),'ABC1D23');
assert.equal(mobileSpeechToSearch('A B C 1 D 2 3'),'ABC1D23');
assert.equal(mobileSpeechToSearch('  '),'');
assert.equal(mobileSpeechToSearch(null),'');
for(const name of ['not-allowed','service-not-allowed','audio-capture','no-speech',
 'network','language-not-supported']){
 const info=speechErrorFeedback(name);
 assert.ok(info.message.length>50,'Useful message for '+name);
 assert.equal(info.useKeyboard,true,'Keyboard fallback for '+name);
}
assert.ok(speechErrorFeedback('not-allowed').message.includes('permissões'));
assert.ok(speechErrorFeedback('network').message.includes('conexão'));
assert.equal(speechErrorFeedback('aborted').useKeyboard,false);
assert.ok(ui.includes("(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition"));
assert.ok(ui.includes("r.lang='pt-BR'"),'Recognize Brazilian Portuguese');
assert.ok(ui.includes('speechErrorFeedback(event?.error)'),'Specific permission/network error guidance');
assert.ok(ui.includes('mobileSpeechToSearch(results[results.length-1]?.[0]?.transcript)'),
 'Recognize the latest result, including interim browser speech');
assert.ok(ui.includes('setQuickQuery(transcript)'),'Recognized vehicle fills quick search');
assert.ok(ui.includes('startQuickSearch(transcript)'),'Recognized vehicle uses existing FIPE search');
assert.ok(ui.includes('setQuery(transcript);closeVoice();return;'),
 'Recognized plates can still find authorized history records');
assert.ok(ui.includes('role="dialog" aria-modal="true" aria-label="Motyq IQ busca por voz"'),
 'Voice search must be an accessible full-screen overlay');
assert.ok(ui.includes('motyqOrbit 10s linear infinite'),
 'Central Jarvis orb animation is present');
assert.ok(ui.includes('prefers-reduced-motion:reduce'),
 'People who reduce motion should see a static orb');
assert.ok(ui.includes('voiceManualStopRef.current=true'),
 'Touching the orb stops speech and requests search');
assert.ok(ui.includes("voiceState==='processing'"),
 'Show processing feedback during speech finalization');
assert.ok(ui.includes('voiceManualStopRef.current')&&ui.includes('runVoiceSearch(transcript)'),
 'Manual end automatically searches after a final transcript');
assert.ok(ui.includes('onClick={()=>runVoiceSearch(voiceTranscript)}'),
 'Silence-ended speech requires a visible confirmation');
assert.ok(ui.includes('r.interimResults=true'),'Live words appear while listening');
assert.ok(ui.includes('role="status" aria-live="polite"'),'Dialog announces speech status');
assert.ok(ui.includes('aria-label="Fechar busca por voz"'),'An accessible close button is provided');
assert.ok(ui.includes('onClick={useKeyboardDictation}'),'Unsupported browsers get Android keyboard fallback');
assert.ok(ui.includes('quickInputRef.current?.focus()'),'Fallback focuses the vehicle search field');
assert.ok(ui.includes('ref={quickInputRef}'));
assert.ok(ui.includes('abra o Motyq no Chrome'),'In-app browser limitations are explained');
assert.ok(ui.includes("speechRef.current?.abort?.()"),'Unmount aborts recognition');
assert.ok(ui.includes('active.abort();'),'Leaving a tab aborts recognition');
assert.ok(ui.includes('speechRef.current!==r'),'Late speech callbacks cannot change another screen');
assert.ok(!ui.includes('navigator.mediaDevices.getUserMedia'),'Do not record extra microphone audio');
assert.ok(!ui.includes('new MediaRecorder'),'Do not store raw user speech recordings');
console.log('Motyq IQ voice overlay: animated dialog, speech lifecycle, confirmed FIPE search, mic fallback and accessible stop passed.');
