import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Mic,MicOff,Volume2,VolumeX,X} from 'lucide-react';
import MarketIqVoiceHologram from './MarketIqVoiceHologram';
import {dealerRadarTextMatches,type DealerStockSnapshot} from '../services/marketIqDealerRadar';

type ChatTurn={speaker:'user'|'motyq';message:string};
type PricingDraft={vehicle:string;reference:number|null;preparation:number|null};
type Props={snapshot:DealerStockSnapshot|null;stockReady:boolean;onClose:()=>void};
const brl=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const normalize=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const parseMoney=(value:string):number|null=>{
 const text=normalize(value).replace(/r\$/g,' ').replace(/\s+/g,' ');
 const m=text.match(/(?:^|\s)(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(?:\s*(mil|milhares|k))?(?:\s|$)/);
 if(!m)return null;
 const valueNumber=Number(m[1].replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(/,(?=\d{3}(?:\D|$))/g,'').replace(',','.'));
 if(!Number.isFinite(valueNumber))return null;
 return Math.round(valueNumber*(m[2]?1000:1));
};
const modelFrom=(raw:string)=>{
 const message=normalize(raw);
 const known=['creta','renegade','t-cross','tcross','virtus','onix','hb20','compass','tracker','corolla','polo','nivus','kicks','pulse','argo','mobi','toro','fastback'];
 return known.find(name=>message.includes(name))||null;
};
export default function MotyqVoiceConversation({snapshot,stockReady,onClose}:Props){
 const [turns,setTurns]=useState<ChatTurn[]>([]);
 const [listen,setListen]=useState(false);
 const [wakeEnabled,setWakeEnabled]=useState(false);
 const [speechDetected,setSpeechDetected]=useState(false);
 const [captured,setCaptured]=useState('');
 const [micState,setMicState]=useState<'idle'|'starting'|'listening'|'processing'>('idle');
 const [preferredVoice,setPreferredVoice]=useState('');
 const [voiceOptions,setVoiceOptions]=useState<{name:string;lang:string}[]>([]);
 const [input,setInput]=useState('');
 const [notice,setNotice]=useState('');
 const [muted,setMuted]=useState(false);
 const [lastModel,setLastModel]=useState<string|null>(null);
 const [draft,setDraft]=useState<PricingDraft|null>(null);
 const recognizer=useRef<any>(null);
 const speechDraft=useRef('');
 const delivered=useRef(false);
 const manuallyStopped=useRef(false);
 const mounted=useRef(true);
 const wakeEnabledRef=useRef(false);
 const speakingRef=useRef(false);
 const restartRef=useRef<ReturnType<typeof setTimeout>|null>(null);
 const startCycleRef=useRef<()=>void>(()=>{});

 const turnRef=useRef<ChatTurn[]>([]);
 const addTurn=useCallback((speaker:ChatTurn['speaker'],message:string)=>{
  const next=[...turnRef.current,{speaker,message}].slice(-30);
  turnRef.current=next;setTurns(next);
 },[]);
 const speak=useCallback((phrase:string)=>{
  if(muted||!('speechSynthesis'in window))return;
  try{
   window.speechSynthesis.cancel();
   speakingRef.current=true;
   const active=recognizer.current;
   recognizer.current=null;
   try{active?.abort?.();}catch{}
   setListen(false);
   const item=new SpeechSynthesisUtterance(phrase);
   item.onend=()=>{speakingRef.current=false;if(wakeEnabledRef.current)startCycleRef.current();};
   item.onerror=()=>{speakingRef.current=false;if(wakeEnabledRef.current)startCycleRef.current();};
   item.lang='pt-BR';item.rate=.96;item.pitch=1;
   const options=window.speechSynthesis.getVoices();
   const pt=options.filter(v=>/^pt(-BR)?$/i.test(v.lang)||v.lang.toLowerCase().startsWith('pt-br'));
   const chosen=options.find(v=>v.voiceURI===preferredVoice)||options.find(v=>v.name===preferredVoice);
   const natural=pt.find(v=>/microsoft.*(antonio|daniel)|google.*portugu|natural|neural|premium/i.test(v.name));
   const male=pt.find(v=>/male|masculin|daniel|antonio|felipe|ricardo|paulo/i.test(v.name));
   item.voice=chosen||natural||male||pt[0]||null;
   window.speechSynthesis.speak(item);
  }catch{speakingRef.current=false;if(wakeEnabledRef.current)startCycleRef.current();setNotice('Este navegador não conseguiu reproduzir a resposta. Ela continua disponível por escrito.');}
 },[muted,preferredVoice]);
 const reply=useCallback((message:string)=>{addTurn('motyq',message);speak(message);},[addTurn,speak]);
 useEffect(()=>{
  mounted.current=true;
  const welcome='MOTYQ à disposição. Toque no holograma para iniciar uma conversa.';
  addTurn('motyq',welcome);
  // Playback at entry is best effort: browser autoplay restrictions may block it.
  const handleVoices=()=>{const arr=window.speechSynthesis?.getVoices()||[];setVoiceOptions(arr.filter(v=>v.lang.toLowerCase().startsWith('pt')).map(v=>({name:v.name,lang:v.lang})));};
  if('speechSynthesis'in window){window.speechSynthesis.addEventListener('voiceschanged',handleVoices);handleVoices();speak(welcome);}
  return ()=>{mounted.current=false;wakeEnabledRef.current=false;if(restartRef.current)clearTimeout(restartRef.current);recognizer.current?.abort?.();window.speechSynthesis?.cancel();window.speechSynthesis?.removeEventListener('voiceschanged',handleVoices);};
 // One greeting per mount; the callbacks reference the initial state intentionally.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 const respond=useCallback((raw:string)=>{
  const words=normalize(raw);
  if(!words)return;
  addTurn('user',raw);
  if(/^(oi|ola|bom dia|boa tarde|boa noite|motyq)[!., ]*$/.test(words)){
   reply('Pode falar.');return;
  }
  const isStock=/estoque|quantos|quantas|temos|poss[uí]mos|parados|dias de estoque|capital investido/.test(words);
  const explicitModel=modelFrom(words);
  const queriedModel=explicitModel||(/desses|dessas|desse modelo|daqueles/.test(words)?lastModel:null);
  if(isStock&&queriedModel){
   setLastModel(queriedModel);
   if(!stockReady||!snapshot){reply('O estoque Dealer ainda não está carregado.');return;}
   const found=snapshot.vehicles.filter(v=>v.vehicleType==='car'&&dealerRadarTextMatches(v,queriedModel));
   const overdue=found.filter(v=>v.days>90);
   const avg=found.length?Math.round(found.reduce((a,v)=>a+v.days,0)/found.length):0;
   const capital=found.reduce((a,v)=>a+Math.max(0,v.cost),0);
   if(/parad|mais de 90|noventa dias/.test(words))reply('Dos '+found.length+' '+queriedModel+' em estoque, '+overdue.length+' estão há mais de 90 dias.');
   else if(/capital|investid/.test(words))reply('O capital registrado em '+found.length+' '+queriedModel+' é '+brl(capital)+'.');
   else reply('Na última base Dealer carregada, encontrei '+found.length+' '+queriedModel+' em estoque. A média é '+avg+' dias, e '+overdue.length+' estão há mais de 90 dias.');
   return;
  }
  const wantsPrice=/quanto|pagar|compra|precific|avaliar|valor/.test(words);
  if(wantsPrice&&explicitModel){
   setDraft({vehicle:raw,reference:null,preparation:null});
   reply('Para calcular, qual é o menor preço de anúncio comparável?');return;
  }
  if(draft){
   const n=parseMoney(raw);
   if(n!==null&&n>=0&&n<=2000000){
    if(draft.reference===null){
     setDraft({...draft,reference:n});
     reply('Qual o custo estimado de preparação? Pode ser zero.');return;
    }
    if(draft.preparation===null){
     const next={...draft,preparation:n};
     setDraft(next);
     const suggested=Math.max(0,Math.round(next.reference!*0.86-n));
     reply('Compra sugerida: '+brl(suggested)+'. É uma simulação, não uma cotação de mercado verificada.');return;
    }
   }
  }
  if(/ajuda|o que voc[eê] faz|pode fazer/.test(words)){reply('Consigo consultar estoque e simular compra com um preço de referência.');return;}
  reply('Qual modelo você quer consultar?');
 },[addTurn,reply,lastModel,snapshot,stockReady,draft]);
 const respondRef=useRef(respond);
 useEffect(()=>{respondRef.current=respond;},[respond]);
 const deliverTranscript=(message:string)=>{
  const heard=message.trim();
  if(!heard||delivered.current)return;
  delivered.current=true;setCaptured(heard);setMicState('processing');
  respondRef.current(heard);
  if(!speakingRef.current)setMicState('idle');
 };
 const queueCycle=(delay=350)=>{
  if(restartRef.current)clearTimeout(restartRef.current);
  if(!wakeEnabledRef.current||!mounted.current||speakingRef.current||recognizer.current)return;
  restartRef.current=setTimeout(()=>{if(wakeEnabledRef.current&&!speakingRef.current)startCycleRef.current();},delay);
 };
 const startCycle=()=>{
  if(!wakeEnabledRef.current||speakingRef.current||recognizer.current)return;
  const SpeechRecognizer=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
  if(!window.isSecureContext||!SpeechRecognizer){
   wakeEnabledRef.current=false;setWakeEnabled(false);
   setNotice('A conversa por voz exige navegador compatível e HTTPS.');return;
  }
  try{
   const r=new SpeechRecognizer();
   recognizer.current=r;speechDraft.current='';delivered.current=false;manuallyStopped.current=false;
   r.lang='pt-BR';r.continuous=false;r.interimResults=true;r.maxAlternatives=1;
   r.onstart=()=>{if(recognizer.current===r&&mounted.current){setListen(true);setMicState('listening');}};
   r.onspeechstart=()=>{if(recognizer.current===r)setSpeechDetected(true);};
   r.onspeechend=()=>{if(recognizer.current===r)setSpeechDetected(false);};
   r.onresult=(event:any)=>{
    if(recognizer.current!==r||!mounted.current)return;
    let heard='';let isFinal=false;
    for(let i=0;i<event.results.length;i++){
     heard+=String(event.results[i]?.[0]?.transcript||'')+' ';
     if(event.results[i]?.isFinal)isFinal=true;
    }
    speechDraft.current=heard.trim();
    if(isFinal&&speechDraft.current){
     deliverTranscript(speechDraft.current);
     try{r.stop();}catch{}
    }
   };
   r.onerror=(event:any)=>{
    if(recognizer.current!==r)return;
    const code=String(event?.error||'');
    if(code==='not-allowed'||code==='service-not-allowed'||code==='network'||code==='audio-capture'){
     wakeEnabledRef.current=false;setWakeEnabled(false);
     setNotice('Escuta interrompida ('+code+'). Verifique microfone, permissão e conexão e ative novamente.');
    }else if(code!=='no-speech'&&code!=='aborted'){
     setNotice('Falha na escuta ('+code+').');
    }
   };
   r.onend=()=>{
    if(recognizer.current!==r)return;
    recognizer.current=null;setListen(false);setSpeechDetected(false);setMicState('idle');
    if(speechDraft.current&&!delivered.current)deliverTranscript(speechDraft.current);
    queueCycle();
   };
   setMicState('starting');r.start();
  }catch{
   recognizer.current=null;wakeEnabledRef.current=false;setWakeEnabled(false);
   setListen(false);setMicState('idle');
   setNotice('O navegador não conseguiu reiniciar o microfone. Ative a escuta novamente.');
  }
 };
 startCycleRef.current=startCycle;
 const stop=()=>{
  wakeEnabledRef.current=false;
  setWakeEnabled(false);setSpeechDetected(false);
  if(restartRef.current)clearTimeout(restartRef.current);
  const active=recognizer.current;recognizer.current=null;
  try{active?.abort?.();}catch{}
  setListen(false);setMicState('idle');
  setNotice('Escuta desativada.');
 };
 const start=()=>{
  if(wakeEnabledRef.current){stop();return;}
  const SpeechRecognizer=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
  if(!window.isSecureContext||!SpeechRecognizer){
   setNotice('Seu navegador não disponibiliza reconhecimento de voz. Use Chrome com HTTPS ou digite.');return;
  }
  window.speechSynthesis?.cancel();speakingRef.current=false;
  setNotice('Conversa ativada. Fale normalmente, sem repetir MOTYQ.');
  setCaptured('');wakeEnabledRef.current=true;setWakeEnabled(true);
  speak('Estou ouvindo.');
  if(!('speechSynthesis'in window)||muted)startCycle();
 };
 const sendText=(event:React.FormEvent)=>{event.preventDefault();const text=input.trim();if(!text)return;setInput('');respond(text);};
 return <section aria-label="MOTYQ Voice" className="rounded-2xl border border-cyan-300 bg-[#071a2e] p-4 text-white shadow-xl sm:p-6">
  <header className="mb-4 flex items-center justify-between gap-2">
   <div><h2 className="text-xl font-black text-white">MOTYQ VOICE · Laboratório</h2><p className="text-xs text-cyan-100">Somente na sua conta · Conversa assistida no navegador</p></div>
   <button type="button" onClick={onClose} aria-label="Fechar conversa" className="rounded-lg border border-white/30 p-2 text-white"><X size={20}/></button>
  </header>
  <div className="mb-4 max-h-80 space-y-3 overflow-auto rounded-xl border border-cyan-900/40 bg-[#112b43] p-4" role="log" aria-live="polite">
   {turns.map((turn,i)=><div key={i} className={'rounded-xl p-3 text-sm leading-6 '+(turn.speaker==='motyq'?'bg-[#173c5b] text-cyan-50':'ml-5 bg-white text-slate-900')}>
    <strong className="mb-1 block text-xs">{turn.speaker==='motyq'?'MOTYQ':'Você'}</strong>{turn.message}</div>)}
  </div>
  <div className="mb-3 rounded-lg border border-cyan-500/30 bg-[#12314b] p-3 text-sm text-cyan-50" role="status" aria-live="polite">
   {micState==='starting'?'Ativando microfone...':wakeEnabled?(speakingRef.current?'MOTYQ respondendo...':listen?'Estou ouvindo. Pode falar.':'Preparando a próxima pergunta...'):captured?'Último reconhecimento: '+captured:'Toque no holograma para começar a conversar.'}
  </div>
  <div className="mx-auto mb-3 flex max-w-[300px] flex-col items-center">
   <button type="button" aria-label={wakeEnabled?'Encerrar conversa':'Iniciar conversa por voz'}
    aria-pressed={wakeEnabled} onClick={start}
    className="w-full rounded-3xl focus-visible:outline focus-visible:outline-4 focus-visible:outline-cyan-300">
    <MarketIqVoiceHologram listening={listen} processing={micState==='processing'}
     heard={Boolean(captured)} speechDetected={speechDetected}/>
   </button>
   <span className="mt-1 text-sm font-bold text-cyan-100">{wakeEnabled?'Toque para encerrar':'Toque para conversar'}</span>
  </div>
  <div className="flex flex-wrap items-center justify-center gap-3">
   <button type="button" aria-label={muted?'Ativar respostas em voz':'Silenciar respostas em voz'} onClick={()=>{setMuted(x=>!x);window.speechSynthesis?.cancel();speakingRef.current=false;if(wakeEnabledRef.current)queueCycle();}}
    className="flex items-center gap-2 rounded-lg border border-cyan-400/40 px-3 py-2 text-sm text-white">
    {muted?<VolumeX size={17}/>:<Volume2 size={17}/>} {muted?'Voz desligada':'Voz ligada'}</button>
  </div>
  {voiceOptions.length>0&&<label className="mt-3 block text-xs font-semibold text-cyan-100">
   Voz disponível no navegador
   <select aria-label="Selecionar voz do assistente" value={preferredVoice} onChange={e=>setPreferredVoice(e.target.value)}
    className="mt-1 w-full rounded-lg border border-cyan-500 bg-white p-2 text-sm text-slate-950">
    <option value="">Automática (priorizar masculina, quando disponível)</option>
    {voiceOptions.map((voice,i)=><option key={i} value={voice.name}>{voice.name} ({voice.lang})</option>)}
   </select>
  </label>}
  <button type="button" onClick={()=>speak('MOTYQ à disposição. Como posso ajudar?')}
   className="mt-2 rounded-lg border border-cyan-400/40 px-3 py-2 text-xs font-semibold text-cyan-100">
   Testar voz selecionada
  </button>
  <form onSubmit={sendText} className="mt-4 flex gap-2">
   <input value={input} onChange={e=>setInput(e.target.value)} maxLength={300}
    aria-label="Escrever pergunta ao MOTYQ" placeholder="Ou digite sua pergunta..."
    className="min-w-0 flex-1 rounded-xl border border-cyan-500 bg-white p-3 text-slate-950 placeholder:text-slate-500"/>
   <button type="submit" className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-950">Enviar</button>
  </form>
  {notice&&<p role="alert" className="mt-3 text-sm text-amber-200">{notice}</p>}
  <p className="mt-3 text-xs leading-5 text-cyan-100">Toque uma vez no holograma e fale normalmente. O MOTYQ volta a escutar depois de responder. A escuta só fica ativa enquanto esta tela e o navegador permitirem. Desative pelo botão quando quiser. Vozes disponíveis dependem do dispositivo; pesquisas automáticas de anúncios ainda não estão ativadas.</p>
 </section>;
}
