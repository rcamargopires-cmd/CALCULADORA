import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('services/marketIqMobileVoice.ts','utf8');
const ui=readFileSync('components/MarketIqMobileExperience.tsx','utf8');
const hologram=readFileSync('components/MarketIqVoiceHologram.tsx','utf8');
const hologramCss=readFileSync('components/MarketIqVoiceHologram.css','utf8');
const transpile=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022
},reportDiagnostics:true});
assert.equal(transpile.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length||0,0);
const {speechErrorFeedback,mobileSpeechToSearch}=await import('data:text/javascript;base64,'+
 Buffer.from(transpile.outputText).toString('base64'));
assert.equal(mobileSpeechToSearch('Tracker 2023'),'Tracker 2023');
assert.equal(mobileSpeechToSearch('Compass Longitude dois mil e vinte e cinco'),
 'Compass Longitude 2025','Spoken full year becomes valid FIPE year');
assert.equal(mobileSpeechToSearch('Tracker dois mil e vinte e tres'),
 'Tracker 2023','Speech parser must accept spoken year without accents');
assert.equal(mobileSpeechToSearch('Onix dois mil e dezenove'),
 'Onix 2019','Older spelled years should also work');
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
assert.ok(ui.includes('<MarketIqVoiceHologram listening={voiceState'),
 'Recognizing mode must render the reactive M.O.T.Y.Q hologram');
assert.ok(hologram.includes('M.O.T.Y.Q'),'Brand name appears inside the holographic core');
assert.ok(hologramCss.includes('motyqHoloSpin')&&hologramCss.includes('motyqHoloSpinReverse'),
 'Holographic blue rings rotate in opposite directions');
assert.ok(hologram.includes('motyq-holo-projection')&&hologram.includes('motyq-holo-floor'),
 'Lower blue projection and floor rings give the volumetric Jarvis look');
assert.ok(hologram.includes('Array.from({length:88}')&&hologram.includes('Array.from({length:48}'),
 'Voice-responsive radial bars and particles surround M.O.T.Y.Q');
assert.ok(hologram.includes('navigator.mediaDevices.getUserMedia'),
 'Real local microphone amplitude enables the particles to expand with speech');
assert.ok(hologram.includes('analyser.getByteTimeDomainData(samples)'),
 'Real RMS microphone signal drives holographic intensity');
assert.ok(hologram.includes('setLevel(Math.round(smoothed*100)/100)'),
 'Smooth signal changes instead of jerky reaction');
assert.ok(hologram.includes('audioStream?.getTracks().forEach(track=>track.stop())'),
 'Voice visualization stops microphone tracks when listening ends');
assert.ok(hologram.includes('if(disposed){stream.getTracks().forEach(track=>track.stop());return;}'),
 'Late permission grants must immediately release the microphone');
assert.ok(hologramCss.includes('prefers-reduced-motion:reduce'),
 'People who reduce motion should see a static hologram');
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
assert.ok(!hologram.includes('new MediaRecorder'),
 'Never record speech audio for visualization');
assert.ok(!hologram.includes('fetch(')&&!hologram.includes('XMLHttpRequest'),
 'Never send microphone amplitude to a server');
assert.ok(ui.includes('role="dialog" aria-modal="true"'),
 'Visual changes do not alter the accessible voice overlay');
console.log('Motyq IQ voice overlay: animated dialog, speech lifecycle, confirmed FIPE search, mic fallback and accessible stop passed.');
