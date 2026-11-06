import React from 'react';
import './MarketIqVoiceHologram.css';

type Props={
 listening:boolean;
 processing:boolean;
 heard:boolean;
 speechDetected:boolean;
};

/**
 * Purely visual, speech-event-driven hologram. The browser's SpeechRecognition
 * is the only microphone owner. We intentionally avoid a parallel getUserMedia
 * stream because it may interrupt recognition on Android. The animation reacts
 * to speech detected / result events, not a measured audio-volume waveform.
 */
export default function MarketIqVoiceHologram({listening,processing,heard,speechDetected}:Props){
 // SpeechRecognition owns the microphone exclusively. Opening getUserMedia
 // here created a second audio session and could interrupt Android recognition.
 // React only to recognition events; never open another microphone stream.
 const intensity=listening?(speechDetected?0.72:0.12):processing?0.55:heard?0.18:0.1;
 const cx=180,cy=170;
 const ticks=Array.from({length:88},(_,i)=>{
  const angle=i/88*2*Math.PI-Math.PI/2;
  const gain=0.5+0.5*Math.pow(Math.sin(i*0.71),2);
  const startingRadius=122;
  const length=(i%11===0?17:i%3===0?11:6)+intensity*(15+gain*27);
  return {x1:cx+startingRadius*Math.cos(angle),y1:cy+startingRadius*Math.sin(angle),
   x2:cx+(startingRadius+length)*Math.cos(angle),
   y2:cy+(startingRadius+length)*Math.sin(angle),
   major:i%11===0,key:i};
 });
 const particles=Array.from({length:48},(_,i)=>{
  const angle=i*2.399963;
  const distance=140+(i%7)*5+intensity*(12+(i%5)*8);
  return {x:cx+distance*Math.cos(angle),y:cy+distance*Math.sin(angle)*0.91,
   size:i%7===0?2.3:1.1,opacity:0.26+(i%5)*0.13,key:i};
 });
 const activity=Math.min(1,intensity);
 return <div className={'motyq-holo'+(listening?' is-listening':'')+
  (processing?' is-processing':'')+(heard?' is-heard':'')+(speechDetected?' is-speaking':'')}
  style={{'--motyq-audio-level':String(activity)} as React.CSSProperties}
  aria-hidden="true">
   <svg className="motyq-holo-svg" viewBox="0 0 360 420" role="presentation"
    focusable="false" xmlns="http://www.w3.org/2000/svg">
    <defs>
     <radialGradient id="motyq-holo-core">
      <stop offset="0" stopColor="#082b52" stopOpacity=".99"/>
      <stop offset=".76" stopColor="#041429" stopOpacity=".97"/>
      <stop offset="1" stopColor="#020d1c" stopOpacity=".99"/>
     </radialGradient>
     <linearGradient id="motyq-holo-ring" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stopColor="#2b7de7"/>
      <stop offset=".42" stopColor="#58edff"/>
      <stop offset=".66" stopColor="#1b65c3"/>
      <stop offset="1" stopColor="#a2f5ff"/>
     </linearGradient>
     <radialGradient id="motyq-holo-floor">
      <stop offset="0" stopColor="#41dfff" stopOpacity=".45"/>
      <stop offset=".8" stopColor="#1480e9" stopOpacity=".12"/>
      <stop offset="1" stopColor="#1480e9" stopOpacity="0"/>
     </radialGradient>
    </defs>
    <g className="motyq-holo-projection">
     <path d="M 144 258 L 105 335 Q 180 359 255 335 L 216 258 Z"
      fill="#11baf5" opacity=".035"/>
     <ellipse cx="180" cy="346" rx="114" ry="23" fill="url(#motyq-holo-floor)"/>
     <ellipse className="motyq-holo-floor-motion" cx="180" cy="345" rx="104" ry="16"
      fill="none" stroke="#21baff" strokeWidth="1.6" strokeOpacity=".45"/>
     <ellipse cx="180" cy="344" rx="71" ry="10" fill="none"
      stroke="#63edff" strokeWidth="2" strokeOpacity=".65"/>
     <ellipse cx="180" cy="343" rx="34" ry="5" fill="#6cecff" fillOpacity=".12"
      stroke="#a6f9ff" strokeWidth="1.1" strokeOpacity=".78"/>
     <path d="M 86 345 Q 180 358 274 345" fill="none"
      stroke="#66d9ff" strokeOpacity=".35" strokeWidth="1.2"/>
    </g>
    <g className="motyq-holo-particles">
     {particles.map(p=><circle key={p.key} cx={p.x} cy={p.y} r={p.size}
      fill="#85efff" opacity={p.opacity}/>)}
    </g>
    <g className="motyq-holo-outer-orbit">
     <circle cx={cx} cy={cy} r="151" fill="none"
      stroke="#2077d3" strokeWidth=".9" strokeOpacity=".28" strokeDasharray="4 18"/>
     <circle cx={cx} cy={cy} r="144" fill="none"
      stroke="#37caff" strokeWidth="1.2" strokeOpacity=".37" strokeDasharray="29 43 5 16"/>
     <path d="M 61 82 A 148 148 0 0 1 310 97" fill="none"
      stroke="url(#motyq-holo-ring)" strokeWidth="3" strokeLinecap="round" strokeOpacity=".8"/>
     <path d="M 315 247 A 146 146 0 0 1 73 282" fill="none"
      stroke="#3bd3ff" strokeWidth="2" strokeLinecap="round" strokeOpacity=".55"/>
    </g>
    <g className="motyq-holo-audio-bars">
     {ticks.map(t=><line key={t.key} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
      stroke={t.major?'#b6faff':'#44c9ff'}
      strokeOpacity={t.major?0.95:0.54}
      strokeWidth={t.major?2.5:1.4} strokeLinecap="round"/>)}
    </g>
    <g className="motyq-holo-middle-orbit">
     <circle cx={cx} cy={cy} r="112" fill="none" stroke="#159beb"
      strokeWidth="2" strokeDasharray="40 10 3 10" strokeOpacity=".66"/>
     <circle cx={cx} cy={cy} r="103" fill="none" stroke="#6ae9ff"
      strokeWidth="1.5" strokeDasharray="4 7" strokeOpacity=".65"/>
     <path d="M 78 157 A 102 102 0 0 1 225 78" fill="none"
      stroke="#9df8ff" strokeWidth="4.5" strokeLinecap="round" strokeOpacity=".83"/>
     <path d="M 276 188 A 102 102 0 0 1 134 260" fill="none"
      stroke="#42c8fc" strokeWidth="4" strokeLinecap="round" strokeOpacity=".85"/>
    </g>
    <g className="motyq-holo-inner">
     <circle cx={cx} cy={cy} r="91" fill="url(#motyq-holo-core)"
      stroke="#0f70be" strokeWidth="2.4"/>
     <circle cx={cx} cy={cy} r="84" fill="none"
      stroke="#6be6ff" strokeWidth="1.2" strokeOpacity=".6"/>
     <circle cx={cx} cy={cy} r="76" fill="none"
      stroke="#288dda" strokeWidth="1.1" strokeDasharray="2 9" strokeOpacity=".65"/>
     <ellipse cx={cx} cy={cy} rx="70" ry="18" fill="none"
      stroke="#6ee9ff" strokeWidth=".9" strokeOpacity=".23"/>
     <path d="M 113 145 Q 180 123 247 145 M 113 195 Q 180 217 247 195"
      fill="none" stroke="#38a8ec" strokeOpacity=".13" strokeWidth=".8"/>
     <text x="180" y="174" className="motyq-holo-wordmark" textAnchor="middle">
      M.O.T.Y.Q
     </text>
     <text x="180" y="196" className="motyq-holo-subtitle" textAnchor="middle">
      INTELIGÊNCIA DE AQUISIÇÃO
     </text>
    </g>
   </svg>
   <div className="motyq-holo-caption">
    {processing?'PROCESSANDO COMANDO':listening?'CAPTANDO SUA VOZ':
     heard?'COMANDO RECONHECIDO':'ASSISTENTE MOTYQ IQ'}
    {listening&&speechDetected&&<span className="motyq-holo-meter-dot"/>}
   </div>
  </div>;
}
