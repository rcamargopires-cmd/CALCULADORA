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
assert.ok(ui.includes("r.lang='pt-BR'"));
assert.ok(ui.includes('speechErrorFeedback(e?.error)'));
assert.ok(ui.includes('mobileSpeechToSearch(e?.results?.[0]?.[0]?.transcript)'));
assert.ok(ui.includes('setQuery(transcript)'), 'Transcribed model/plate must search existing online history');
assert.ok(ui.includes("speechRef.current?.abort?.()"),'Unmount terminates active microphone');
assert.ok(ui.includes('active.abort();'),'Leaving tab terminates active microphone');
assert.ok(ui.includes("r.onend=()"),'Recognition completion must clear state');
assert.ok(ui.includes("if(speechRef.current!==r)return;"),'Late callbacks cannot modify another screen');
assert.ok(ui.includes("voiceState==='listening'?'Parar escuta':'Buscar por voz'"));
assert.ok(ui.includes('role="status"'),'Speech feedback must be located next to microphone, not below history');
assert.ok(ui.includes('onClick={useKeyboardDictation}'), 'A real tap must focus keyboard on unsupported browsers');
assert.ok(ui.includes("searchInputRef.current?.focus()"));
assert.ok(ui.includes("ref={searchInputRef}"));
assert.ok(ui.includes('abra o endereço no Chrome'), 'Guide users in unsupported Android in-app browsers');
assert.ok(ui.includes('permissão de microfone do site'), 'Explain microphone permission when blocked');
assert.ok(!ui.includes('navigator.mediaDevices.getUserMedia'), 'Avoid recording audio or extra mic permission');
assert.ok(!ui.includes('new MediaRecorder'), 'No audio is uploaded to Motyq');
console.log('Motyq IQ Mobile voice: pt-BR Web Speech lifecycle, error-specific feedback, Android keyboard dictation and tab cleanup passed.');
