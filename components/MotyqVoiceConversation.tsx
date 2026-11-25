import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Mic,MicOff,Volume2,VolumeX,X} from 'lucide-react';
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
 const [busy,setBusy]=useState(false);
 const [input,setInput]=useState('');
 const [notice,setNotice]=useState('');
 const [muted,setMuted]=useState(false);
 const [lastModel,setLastModel]=useState<string|null>(null);
 const [draft,setDraft]=useState<PricingDraft|null>(null);
 const recognizer=useRef<any>(null);
 const keepListening=useRef(false);
 const mounted=useRef(true);
 const voices=useRef<SpeechSynthesisVoice[]>([]);
 const turnRef=useRef<ChatTurn[]>([]);
 const addTurn=useCallback((speaker:ChatTurn['speaker'],message:string)=>{
  const next=[...turnRef.current,{speaker,message}].slice(-30);
  turnRef.current=next;setTurns(next);
 },[]);
 const speak=useCallback((phrase:string)=>{
  if(muted||!('speechSynthesis'in window))return;
  try{
   window.speechSynthesis.cancel();
   const item=new SpeechSynthesisUtterance(phrase);
   item.lang='pt-BR';item.rate=.98;item.pitch=.82;
   const options=window.speechSynthesis.getVoices();
   const pt=options.filter(v=>/^pt(-BR)?$/i.test(v.lang)||v.lang.toLowerCase().startsWith('pt-br'));
   const male=pt.find(v=>/male|masculin|daniel|antonio|felipe|ricardo|paulo/i.test(v.name));
   item.voice=male||pt[0]||null;
   window.speechSynthesis.speak(item);
  }catch{setNotice('Este navegador não conseguiu reproduzir a resposta. Ela continua disponível por escrito.');}
 },[muted]);
 const reply=useCallback((message:string)=>{addTurn('motyq',message);speak(message);},[addTurn,speak]);
 useEffect(()=>{
  mounted.current=true;
  const welcome='Boa tarde. MOTYQ à disposição. Toque no microfone quando quiser conversar.';
  addTurn('motyq',welcome);
  // Playback at entry is best effort: browser autoplay restrictions may block it.
  const handleVoices=()=>{voices.current=window.speechSynthesis?.getVoices()||[];};
  if('speechSynthesis'in window){window.speechSynthesis.addEventListener('voiceschanged',handleVoices);handleVoices();speak(welcome);}
  return ()=>{mounted.current=false;keepListening.current=false;recognizer.current?.abort?.();window.speechSynthesis?.cancel();window.speechSynthesis?.removeEventListener('voiceschanged',handleVoices);};
 // One greeting per mount; the callbacks reference the initial state intentionally.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 const respond=useCallback((raw:string)=>{
  const words=normalize(raw);
  if(!words)return;
  addTurn('user',raw);
  if(/^(oi|ola|bom dia|boa tarde|boa noite|motyq)[!., ]*$/.test(words)){
   reply('Estou à disposição. Você pode perguntar sobre o estoque ou pedir uma simulação de compra.');return;
  }
  const isStock=/estoque|quantos|quantas|temos|poss[uí]mos|parados|dias de estoque|capital investido/.test(words);
  const explicitModel=modelFrom(words);
  const queriedModel=explicitModel||(/desses|dessas|desse modelo|daqueles/.test(words)?lastModel:null);
  if(isStock&&queriedModel){
   setLastModel(queriedModel);
   if(!stockReady||!snapshot){reply('Ainda não tenho um estoque Dealer confirmado nesta sessão. Abra o Radar e aguarde a sincronização para que eu responda com números reais.');return;}
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
   reply('Entendi o '+explicitModel+'. Nossa regra é usar o menor anúncio válido da Webmotors, menos 14 por cento e a preparação. Não tenho pesquisa de anúncios verificada nesta conversa. Qual é o menor valor confirmado na Webmotors para essa versão, ano e quilometragem?');return;
  }
  if(draft){
   const n=parseMoney(raw);
   if(n!==null&&n>=1000&&n<=2000000){
    if(draft.reference===null){
     setDraft({...draft,reference:n});
     reply('Anotei '+brl(n)+' como referência informada por você, ainda não validada na Webmotors. Qual é a previsão de gastos com preparação?');return;
    }
    if(draft.preparation===null){
     const next={...draft,preparation:n};
     setDraft(next);
     const suggested=Math.max(0,Math.round(next.reference!*0.86-n));
     reply('Simulação com referência informada de '+brl(next.reference!)+': descontando 14 por cento e '+brl(n)+' de preparação, a compra sugerida é '+brl(suggested)+'. Antes da aprovação, precisamos confirmar versão, ano, quilometragem e procedência dos anúncios.');return;
    }
   }
  }
  if(/ajuda|o que voc[eê] faz|pode fazer/.test(words)){reply('Posso consultar modelos no estoque Dealer carregado e simular a compra pela regra da Mesa. Para uma cotação real, a Webmotors precisa ser verificada.');return;}
  reply('Posso ajudar com o estoque ou uma simulação de compra. Experimente: quantos Creta temos no estoque? Ou: quanto pagar em um Renegade 2020?');
 },[addTurn,reply,lastModel,snapshot,stockReady,draft]);
 const respondRef=useRef(respond);
 useEffect(()=>{respondRef.current=respond;},[respond]);
 const stop=()=>{
  keepListening.current=false;setListen(false);
  const r=recognizer.current;recognizer.current=null;
  try{r?.stop?.();}catch{}
 };
 const start=()=>{
  if(listen){stop();return;}
  const SpeechRecognizer=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
  if(!window.isSecureContext||!SpeechRecognizer){setNotice('Seu navegador não disponibiliza reconhecimento de voz. Use o Chrome com HTTPS ou escreva a pergunta.');return;}
  setNotice('');window.speechSynthesis?.cancel();
  try{
   const r=new SpeechRecognizer();
   recognizer.current=r;r.lang='pt-BR';r.continuous=false;r.interimResults=true;r.maxAlternatives=1;
   r.onstart=()=>{if(mounted.current)setListen(true);};
   r.onresult=(event:any)=>{
    const latest=Array.from(event.results as any[]).map((v:any)=>String(v[0]?.transcript||'')).join(' ').trim();
    if(latest&&event.results[event.results.length-1]?.isFinal){stop();respondRef.current(latest);}
   };
   r.onerror=(event:any)=>{setNotice(event?.error==='not-allowed'?'Autorize o microfone nas configurações do navegador.':'Não consegui reconhecer a fala. Tente novamente ou digite.');stop();};
   r.onend=()=>{if(mounted.current){setListen(false);recognizer.current=null;}};
   r.start();
  }catch{setNotice('Não foi possível abrir o microfone. Confira a permissão do navegador.');stop();}
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
  <div className="flex flex-wrap items-center gap-3">
   <button type="button" aria-label={listen?'Parar de ouvir':'Iniciar microfone'} onClick={start}
    className={'flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold '+(listen?'bg-red-100 text-red-950':'bg-cyan-400 text-slate-950')}>
    {listen?<MicOff size={18}/>:<Mic size={18}/>} {listen?'Parar de ouvir':'Falar com MOTYQ'}</button>
   <button type="button" aria-label={muted?'Ativar respostas em voz':'Silenciar respostas em voz'} onClick={()=>{setMuted(x=>!x);window.speechSynthesis?.cancel();}}
    className="flex items-center gap-2 rounded-lg border border-cyan-400/40 px-3 py-2 text-sm text-white">
    {muted?<VolumeX size={17}/>:<Volume2 size={17}/>} {muted?'Voz desligada':'Voz ligada'}</button>
  </div>
  <form onSubmit={sendText} className="mt-4 flex gap-2">
   <input value={input} onChange={e=>setInput(e.target.value)} maxLength={300}
    aria-label="Escrever pergunta ao MOTYQ" placeholder="Ou digite sua pergunta..."
    className="min-w-0 flex-1 rounded-xl border border-cyan-500 bg-white p-3 text-slate-950 placeholder:text-slate-500"/>
   <button type="submit" className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-950">Enviar</button>
  </form>
  {notice&&<p role="alert" className="mt-3 text-sm text-amber-200">{notice}</p>}
  <p className="mt-3 text-xs leading-5 text-cyan-100">O microfone só funciona ao tocar no botão. A saudação falada depende da permissão de reprodução do navegador. Esta versão usa síntese de voz e comandos orientados; conversa contínua em tempo real e pesquisa automática de anúncios ainda não estão ativadas.</p>
 </section>;
}
