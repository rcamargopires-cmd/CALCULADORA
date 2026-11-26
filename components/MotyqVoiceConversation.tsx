import React,{useCallback,useEffect,useRef,useState} from 'react';
import {auth} from '../firebase';
import {Mic,MicOff,Volume2,VolumeX,X} from 'lucide-react';
import MarketIqVoiceHologram from './MarketIqVoiceHologram';
import {dealerRadarTextMatches,type DealerStockSnapshot} from '../services/marketIqDealerRadar';
import {mobileQuickIntent,mobileYearOptions,type MobileFipeOption} from '../services/marketIqMobileFlow';

type ChatTurn={speaker:'user'|'motyq';message:string};
type PricingDraft={vehicle:string;reference:number|null;preparation:number|null;awaiting?:'details'|'version'|'reference'|'preparation'|'done'};
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
const fipeTerms=(value:string)=>normalize(value).replace(/\b(long|longi|longit)\b/g,'longitude').replace(/[^a-z0-9]+/g,' ').split(' ').filter(Boolean);
// Prefer a uniquely matching FIPE description when the operator says the exact
// engine/trim. Similar FIPE codes are never collapsed solely by model name.
const fipeModelRank=(spoken:string,options:MobileFipeOption[])=>{
 const spokenWords=fipeTerms(spoken);
 const requested=new Set(spokenWords);
 const hasTurbo=requested.has('turbo');
 const hasLongitude=requested.has('longitude');
 const hasAutomatic=/\b(?:automatico|automatica|aut)\b/.test(normalize(spoken));
 const wants4x2=/\b4\s*(?:x|por|\.|\s)\s*2\b/.test(normalize(spoken));
 const matched=options.map(option=>{
  const raw=normalize(option.name).replace(/[^a-z0-9]+/g,' ').split(' ').filter(Boolean);
  const labels=new Set(raw);
  const literal=normalize(option.name);
  let score=0;
  // A full FIPE wording is more specific than abbreviated legacy descriptors.
  if(hasLongitude)score+=labels.has('longitude')?5:labels.has('long')?1:0;
  if(hasTurbo)score+=labels.has('turbo')?5:labels.has('tb')?1:0;
  if(requested.has('t270')&&labels.has('t270'))score+=2;
  if(/\b1[.,]3\b/.test(normalize(spoken))&&/\b1[.,]3\b/.test(literal))score+=2;
  if(wants4x2&&/4\s*x\s*2/.test(literal))score+=2;
  if(hasAutomatic&&/\b(?:aut|automatic[oa])\b/.test(literal))score+=1;
  if(requested.has('flex')&&labels.has('flex'))score+=1;
  return {option,score};
 }).sort((a,b)=>b.score-a.score);
 const winner=matched[0],second=matched[1];
 return winner&&winner.score>=5&&(!second||winner.score-second.score>=4)?winner.option:null;
};
const fipeOptions=async(action:'brands'|'models'|'years'|'detail',params:Record<string,string>={})=>{
 const query=new URLSearchParams({action,vehicleType:'car',...params});
 const response=await fetch('/api/marketiq-fipe?'+query.toString(),{cache:'no-store'});
 if(!response.ok)throw new Error('FIPE indisponível');
 const result=await response.json();
 if(action!=='detail'&&(!Array.isArray(result.items)||!result.items.length))throw new Error('Catálogo FIPE indisponível');
 return result as {items?:MobileFipeOption[];value?:number;model?:string;fuel?:string;year?:number;fipeCode?:string;referenceMonth?:string;referenceStatus?:string};
};
// Dealer 'Ano Fab/Mod' may read 2021/2022 or 2021-2022. Always use model year.
export const dealerModelYear=(yearLabel:string):number|null=>{
 const years=String(yearLabel||'').match(/\b(?:19|20)\d{2}\b/g);
 return years?.length?Number(years[years.length-1]):null;
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
 const fipeRequestRef=useRef(0);
 const fipePendingRef=useRef('');
 const stockPendingModelRef=useRef(false);
 const stockContextRef=useRef<{model:string;year:number|null;trim:string|null;engine:string|null}|null>(null);
 const fipeContextRef=useRef<{model:string;year:number|null;trim:string|null;engine:string|null}|null>(null);
 const stockPendingMetricRef=useRef<'count'|'capital'|null>(null);
 const stockYearRef=useRef<number|null>(null);
 const stockModelRef=useRef<string|null>(null);
 const fipeChoicesRef=useRef<{original:string;options:MobileFipeOption[]}|null>(null);
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
  return ()=>{fipeRequestRef.current++;mounted.current=false;wakeEnabledRef.current=false;if(restartRef.current)clearTimeout(restartRef.current);recognizer.current?.abort?.();window.speechSynthesis?.cancel();window.speechSynthesis?.removeEventListener('voiceschanged',handleVoices);};
 // One greeting per mount; the callbacks reference the initial state intentionally.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 const rememberFipe=(raw:string)=>{
  const model=modelFrom(raw);
  const year=Number(normalize(raw).match(/\b(?:19|20)\d{2}\b/)?.[0]||0)||null;
  const trim=normalize(raw).match(/\b(longitude|sport|limited|trailhawk|sahara|moab|altitude|overland)\b/)?.[1]||null;
  const engine=normalize(raw).match(/\b(t270|td350|t350|1[.,]3|1[.,]8|2[.,]0)\b/)?.[1]?.replace(',','.')||null;
  if(model){fipeContextRef.current={model,year,trim,engine};stockContextRef.current=null;}
 };
 const answerFipe=useCallback(async(raw:string,chosenCode?:string)=>{
  const request=++fipeRequestRef.current;
  const current=()=>mounted.current&&request===fipeRequestRef.current;
  const words=normalize(raw);
  fipeChoicesRef.current=null;
  const year=Number(words.match(/\b(?:19|20)\d{2}\b/)?.[0]||0);
  const model=modelFrom(words);
  // Confirmed by the operator's November 2026 FIPE screenshot.
  // The code is only a lookup hint; the price and year still come from the live provider.
  const knownCode=(model==='renegade'&&year===2022&&/\blongitude\b/.test(words)&&/\b(?:t270|turbo|1[.,]3)\b/.test(words))?'017088-7':undefined;
  const directCode=raw.match(/\b\d{6}-\d\b/)?.[0]||knownCode;
  if(!year||(!model&&!directCode)){fipePendingRef.current=raw;reply('Qual modelo, versão e ano?');return;}
  if(directCode){
   try{
    const query=new URLSearchParams({vehicleType:'car',brand:'Jeep',model:raw,year:String(year),fipeCode:directCode});
    const response=await fetch('/api/marketiq-fipe?'+query.toString(),{cache:'no-store'});
    if(!response.ok)throw new Error('FIPE indisponível');
    const data=await response.json();
    if(!current())return;
    if(data.fipeCode!==directCode||Number(data.year)!==year||!Number.isFinite(Number(data.value))||Number(data.value)<=0){
     reply('Não foi possível validar esse código FIPE para '+year+'.');return;
    }
    rememberFipe(raw);
    reply('FIPE '+data.model+', '+year+': '+brl(Number(data.value))+(data.referenceMonth?' ('+data.referenceMonth+').':'')+
     (data.referenceStatus==='outdated'?' Referência desatualizada.':''));
   }catch{if(current())reply('Não consegui confirmar esse código FIPE agora.');}
   return;
  }
  const tokens=fipeTerms(words);
  fipePendingRef.current='';
  const trimNames=['longitude','sport','limited','trailhawk','sahara','moab','altitude','overland','signature','night eagle'];
  const requestedTrims=trimNames.filter(t=>tokens.includes(t));
  if(requestedTrims.length===0){fipePendingRef.current=raw;reply('Qual é a versão?');return;}
  try{
   const brands=(await fipeOptions('brands')).items||[];
   if(!current())return;
   const intent=mobileQuickIntent(raw,brands);
   if(!intent.brand){reply('Não consegui confirmar a marca na FIPE.');return;}
   const models=(await fipeOptions('models',{brandCode:intent.brand.code})).items||[];
   if(!current())return;
   // Match model family AND trim as full tokens; never choose a similar edition by accident.
   const matching=models.filter(m=>{
    const label=fipeTerms(m.name);
    return label.includes(model.replace('-',''))||label.includes(model);
   }).filter(m=>requestedTrims.every(t=>fipeTerms(m.name).includes(t)));
   const engine=words.match(/\b(?:1[.,][038]|2[.,]0|t270|td350|t350)\b/)?.[0]?.replace(',','.')||'';
   const narrowed=engine?matching.filter(m=>normalize(m.name).includes(engine)):matching;
   if(narrowed.length===0){reply('Não encontrei essa motorização na FIPE. Confira a versão.');return;}
   const fuel=/\bdiesel\b/.test(words)?'Diesel':/\bflex\b/.test(words)?'Flex':/\bgasolina\b/.test(words)?'Gasolina':/\betanol\b/.test(words)?'Etanol':'';
   // First validate model year against EACH matching FIPE entry.
   // A same-name version can exist under multiple codes with different year coverage.
   const eligible:{model:MobileFipeOption;yearOption:MobileFipeOption}[]=[];
   let yearCatalogOk=false;
   for(const candidate of narrowed.slice(0,12)){
    if(!current())return;
    let years:MobileFipeOption[]=[];
    try{years=(await fipeOptions('years',{brandCode:intent.brand.code,modelCode:candidate.code})).items||[];yearCatalogOk=true;}
    catch{continue;}
    if(!current())return;
    const matchYear=mobileYearOptions(years,year,fuel);
    if(fuel&&!matchYear.fuelMatched)continue;
    const yearChoices=matchYear.choices;
    // Only accept one specific fuel/year code per candidate; never guess a fuel.
    if(yearChoices.length===1)eligible.push({model:candidate,yearOption:yearChoices[0]});
   }
   if(!eligible.length){
    fipePendingRef.current=raw;
    reply(yearCatalogOk?'Não consegui confirmar '+year+' para essa versão nesta fonte FIPE. Informe o código FIPE para consultar diretamente.':'O catálogo de anos FIPE está indisponível agora. Tente novamente.');
    return;
   }
   const chosenByCode=chosenCode?eligible.find(item=>item.model.code===chosenCode):null;
   if(chosenCode&&!chosenByCode){reply('A versão escolhida não tem esse ano confirmado na fonte consultada.');return;}
   // Never infer that similar FIPE descriptions have identical prices/codes.
   const winner=chosenByCode||(eligible.length===1?eligible[0]:null);
   if(!winner){
    const options=eligible.map(item=>item.model);
    fipeChoicesRef.current={original:raw,options};
    fipePendingRef.current=raw;
    reply('Encontrei '+options.length+' versões para '+year+': '+options.slice(0,3).map((m,i)=>(i+1)+': '+m.name).join('; ')+'. Diga primeira, segunda ou a descrição.');
    return;
   }
   fipeChoicesRef.current=null;
   fipePendingRef.current='';
   const selected=winner.model;
   const yearOption=winner.yearOption;
   const result=await fipeOptions('detail',{brandCode:intent.brand.code,modelCode:selected.code,yearCode:yearOption.code});
   if(!current())return;
   const value=Number(result.value);
   if(Number(result.year)!==year){reply('O ano retornado pela FIPE não confere com a solicitação.');return;}
   if(!Number.isFinite(value)||value<=0){reply('A FIPE não retornou um valor válido.');return;}
   const month=String(result.referenceMonth||'').trim();
   const status=result.referenceStatus==='outdated'?' Referência possivelmente desatualizada.':result.referenceStatus==='unverified'?' Mês de referência não confirmado.':'';
   rememberFipe(raw);
   reply('FIPE '+selected.name+', '+year+': '+brl(value)+(month?' ('+month+').':'.')+status);
  }catch{
   if(current())reply('A consulta FIPE está indisponível agora. Tente novamente.');
  }
 },[reply]);
 const respondDeterministic=useCallback((raw:string,spokenRaw=raw)=>{
  const words=normalize(raw);
  if(!words)return;
  addTurn('user',spokenRaw);
  const explicitModel=modelFrom(words);
  // Model is conversational context across FIPE, pricing and inventory queries.
  if(explicitModel)setLastModel(explicitModel);
  const previous=stockContextRef.current||fipeContextRef.current;
  const all=/\b(?:estoque inteiro|estoque total|todos os carros do estoque|toda a frota|estoque completo)\b/.test(words);
  const clearYear=/\b(?:todos os anos|qualquer ano|sem filtrar ano)\b/.test(words);
  const spokenYear=Number(words.match(/\b(?:19|20)\d{2}\b/)?.[0]||0)||null;
  const stockSignal=/\b(?:estoque|estocados|quantos|quantas|temos|capital|investido|parados)\b|dinheiro parado|versao temos/.test(words);
  const purchaseIntent=/\b(?:pagar|pagaria|compro|compraria|precificar|precificacao|avaliar|avaliacao|preco de compra)\b/.test(words);
  const broadenVersions=/\b(?:todas? as versoes|qualquer versao|sem filtrar versao|todas versoes|todos os renegade|todas as renegade)\b/.test(words);
  const explicitlyScoped=/\b(?:desses|dessas|desse|dessa|deles|delas|nesses|nessas|mesmos|mesmas)\b/.test(words);
  const explicitFamilyStock=Boolean(explicitModel)&&stockSignal&&!explicitlyScoped&&!/\b(?:longitude|sport|limited|trailhawk|sahara|moab|altitude|overland|t270|td350|t350)\b/.test(words)&&!spokenYear;

  const contextual=Boolean(previous)&&/^(?:e |quanto |qual |versao |versoes |do |da |desses |dessas |desse |dessa )/.test(words)&&!(/\bfipe\b/.test(words)||purchaseIntent);
  if(purchaseIntent){
   fipePendingRef.current='';fipeChoicesRef.current=null;
   const vehicle=explicitModel||previous?.model||lastModel||'';
   const details=explicitModel?raw:vehicle?vehicle+' '+raw:raw;
   const hasPurchaseYear=/\b(?:19|20)\d{2}\b/.test(details);
   const hasPurchaseKm=/\bkm\b|quilometr/.test(details);
   const hasPurchaseTrim=/\b(?:sport|longitude|prestige|limited|trailhawk|sahara|moab|t270|1[.,]3|1[.,]8|2[.,]0)\b/.test(details);
   const awaiting:PricingDraft['awaiting']=!hasPurchaseYear||!hasPurchaseKm?'details':!hasPurchaseTrim?'version':'reference';
   stockPendingModelRef.current=false;stockPendingMetricRef.current=null;
   setDraft({vehicle:details,reference:null,preparation:null,awaiting});
   if(!vehicle)reply('De qual veículo você quer saber o valor de compra? Informe modelo, versão, ano e quilometragem.');
   else if(awaiting==='details')reply('Para precificar o '+vehicle+', informe ano, quilometragem e versão.');
   else if(awaiting==='version')reply('Qual é a versão do '+vehicle+'?');
   else reply('Qual é o menor preço de anúncio comparável?');
   return;
  }
  if(stockSignal||contextual||(stockPendingModelRef.current&&Boolean(explicitModel))){
   setDraft(null);fipePendingRef.current='';fipeChoicesRef.current=null;fipeRequestRef.current++;
   const model=all?'':explicitModel||previous?.model||lastModel||'';
   const changed=Boolean(explicitModel&&explicitModel!==previous?.model);
   const broaden=all||clearYear||broadenVersions||explicitFamilyStock;
   const year=broaden?null:spokenYear||(changed?null:previous?.year||null);
   const explicitTrim=normalize(words).replace(/\blong\.?\b/g,'longitude').match(/\b(longitude|sport|limited|trailhawk|sahara|moab|altitude|overland)\b/)?.[1]||null;
   const trim=broaden?null:explicitTrim||(changed?null:previous?.trim||null);
   const requestedEngine=broaden?null:words.match(/\b(t270|td350|t350|1[.,]3|1[.,]8|2[.,]0)\b/)?.[1]?.replace(',','.')||(changed?null:previous?.engine||null);
   const metric=/\b(?:capital|investido|quanto custa)\b/.test(words)?'capital':/\b(?:quantos|quantas|versao|versoes)\b/.test(words)?'count':stockPendingMetricRef.current||'count';
   if(!model&&!all){
    stockPendingModelRef.current=true;stockPendingMetricRef.current=metric;
    reply(metric==='capital'?'De qual modelo você quer saber o capital investido?':'Qual modelo você quer consultar no estoque?');return;
   }
   stockPendingModelRef.current=false;stockPendingMetricRef.current=null;
   stockContextRef.current={model,year,trim,engine:requestedEngine};
   if(!stockReady||!snapshot){reply('O estoque Dealer ainda não está carregado.');return;}
   const vehicles=snapshot.vehicles.filter(v=>v.vehicleType==='car'&&
    (all||dealerRadarTextMatches(v,model))&&(year===null||dealerModelYear(v.year)===year));
   const normalizeTrim=(s:string)=>normalize(s).replace(/\blong\.?\b/g,'longitude');
   if(!vehicles.length){reply('Nenhum '+model+(year?' ano-modelo '+year:'')+(trim?' versão '+trim:'')+' encontrado na última base Dealer.');return;}
   const hasVersion=vehicles.some(v=>/\b(longitude|sport|limited|trailhawk|sahara|moab|altitude|overland)\b/.test(normalizeTrim(v.model)));
   const hasUnknownVersions=vehicles.some(v=>!/\b(longitude|sport|limited|trailhawk|sahara|moab|altitude|overland)\b/.test(normalizeTrim(v.model)));
   if(trim&&(!hasVersion||hasUnknownVersions)){
    reply('Encontrei '+vehicles.length+' '+model+(year?' '+year:'')+', mas a descrição do Dealer não confirma a versão '+trim+'. Não vou contar todas as versões como se fossem a mesma.');return;
   }
   const found=vehicles.filter(v=>(!trim||normalizeTrim(v.model).split(/[^a-z0-9]+/).includes(trim))&&
    (!requestedEngine||normalize(v.model).includes(requestedEngine)||requestedEngine==='t270'&&/\b1[.,]3\b/.test(v.model)));
   if(requestedEngine&&vehicles.length&&found.length===0){
    reply('Não encontrei '+model+(year?' '+year:'')+' '+(trim||'')+' '+requestedEngine+' identificado nesta base Dealer. Confira se a motorização consta na descrição do estoque.');return;
   }
   const overdue=found.filter(v=>v.days>90);
   const avg=found.length?Math.round(found.reduce((a,v)=>a+v.days,0)/found.length):0;
   const capital=found.reduce((a,v)=>a+Math.max(0,v.cost),0);
   const label=(all?'veículos':model)+(year?' ano-modelo '+year:'')+(trim?' versão '+trim:'');
   if(/\b(?:analis|diagnostic|risco|dinheiro parado)\b/.test(words)){
    reply('Análise de '+found.length+' '+label+': capital de '+brl(capital)+', média de '+avg+' dias e '+overdue.length+' acima de 90 dias. Base Dealer.');
   }else if(/\bmais antigo\b|\bmais tempo\b/.test(words)){
    const oldest=[...found].sort((a,b)=>b.days-a.days)[0];
    reply(oldest?'O '+oldest.brand+' '+oldest.model+' ('+oldest.year+'), placa '+oldest.plate+', está há '+oldest.days+' dias em estoque. Custo: '+brl(oldest.cost)+'.':'Nenhum '+label+' encontrado.');
   }else if(/\b(?:listar|lista|mostra os|quais sao)\b/.test(words)){
    reply(found.length?'Encontrei '+found.length+' '+label+'. Os cinco mais antigos: '+[...found].sort((a,b)=>b.days-a.days).slice(0,5).map(v=>v.brand+' '+v.model+' '+v.year+', '+v.days+' dias').join('; ')+'.':'Nenhum '+label+' encontrado.');
   }else if(/parad|mais de 90|noventa dias/.test(words)){
    reply('Dos '+found.length+' '+label+' em estoque, '+overdue.length+' estão há mais de 90 dias.');
   }else if(metric==='capital')reply('O capital registrado em '+found.length+' '+label+' é '+brl(capital)+'.');
   else reply('Na última base Dealer carregada, encontrei '+found.length+' '+label+' em estoque. Média de '+avg+' dias; '+overdue.length+' acima de 90 dias.');
   return;
  }
  stockPendingModelRef.current=false;
  const ordinal=words.match(/\b(primeira|primeiro|segunda|segundo|terceira|terceiro|1|2|3)\b/);
  if(fipeChoicesRef.current&&ordinal&&!/\bfipe\b/.test(words)){
   const index=/^(primeira|primeiro|1)$/.test(ordinal[1])?0:/^(segunda|segundo|2)$/.test(ordinal[1])?1:2;
   const choice=fipeChoicesRef.current;
   if(choice.options[index]){
    fipeChoicesRef.current=null;
    void answerFipe(choice.original,choice.options[index].code);
    return;
   }
   reply('Essa opção não está na lista. Escolha uma das versões mostradas.');
   return;
  }
  if(fipePendingRef.current&&/\b(?:1[.,][0-9]|2[.,][0-9]|t270|td350|diesel|flex|gasolina|etanol|turbo|sport|limited|longitude|trailhawk|sahara|moab)\b/.test(words)&&!(/\bfipe\b|tabela fipe/.test(words))){
   const followup=fipePendingRef.current+' '+raw;
   fipePendingRef.current='';
   void answerFipe(followup);
   return;
  }
  if(/\bfipe\b|tabela fipe/.test(words)){
   setDraft(null);
   // "Eu quero saber a FIPE" continues with the vehicle already supplied for pricing.
   const fullInput=explicitModel?raw:(draft?.vehicle?draft.vehicle+' '+raw:raw);
   if(!explicitModel&&modelFrom(fullInput))setLastModel(modelFrom(fullInput));
   void answerFipe(fullInput);
   return;
  }
  if(/^(oi|ola|bom dia|boa tarde|boa noite|motyq)[!., ]*$/.test(words)){
   reply('Pode falar.');return;
  }
  const wantsPrice=/quanto|pagar|compra|precific|avaliar|valor/.test(words);
  const hasYear=/\b(?:19|20)\d{2}\b/.test(words);
  const hasKm=/\bkm\b|quil[oô]metr/.test(words);
  const knownTrim=/\b(?:sport|longitude|limited|trailhawk|sahara|moab|serie s|s[eé]rie s|1\.3 turbo|1\.8 flex)\b/.test(words);
  // An operator may answer with just "Renegade 2022 com 50.000 km".
  // Keep the vehicle context instead of demanding the verb "precificar".
  if(explicitModel&&(wantsPrice||(!stockSignal&&hasYear)||(!draft&&!stockSignal))){
   const awaiting:PricingDraft['awaiting']=!hasYear||!hasKm?'details':!knownTrim?'version':'reference';
   setDraft({vehicle:raw,reference:null,preparation:null,awaiting});
   if(awaiting==='details')reply('Qual ano, quilometragem e versão?');
   else if(awaiting==='version')reply(explicitModel+' '+(words.match(/\b(?:19|20)\d{2}\b/)?.[0]||'')+' reconhecido. Qual é a versão?');
   else reply('Qual é o menor preço de anúncio comparável?');
   return;
  }
  if(draft?.awaiting==='details'){
   const nextVehicle=draft.vehicle+' '+raw;
   const full=normalize(nextVehicle);
   const nextYear=/\b(?:19|20)\d{2}\b/.test(full);
   const nextKm=/\bkm\b|quil[oô]metr/.test(full);
   if(!nextYear||!nextKm){
    setDraft({...draft,vehicle:nextVehicle});reply('Informe o ano e a quilometragem.');return;
   }
   if(!/\b(?:sport|longitude|limited|trailhawk|sahara|moab|serie s|s[eé]rie s|1\.3 turbo|1\.8 flex)\b/.test(full)){
    setDraft({...draft,vehicle:nextVehicle,awaiting:'version'});reply('Qual é a versão?');return;
   }
   setDraft({...draft,vehicle:nextVehicle,awaiting:'reference'});
   reply('Qual é o menor preço de anúncio comparável?');return;
  }
  if(draft?.awaiting==='version'){
   if(!raw.trim()){reply('Qual é a versão?');return;}
   // Reply is the exact trim or engine information, not another vehicle.
   setDraft({...draft,vehicle:draft.vehicle+' '+raw,awaiting:'reference'});
   reply('Qual é o menor preço de anúncio comparável?');return;
  }
  if(draft&&(draft.awaiting==='reference'||draft.awaiting==='preparation'||!draft.awaiting)){
   const n=parseMoney(raw);
   if(n!==null&&n>=0&&n<=2000000){
    if(draft.reference===null){
     if(n<1000){reply('Qual é o preço anunciado em reais?');return;}
     setDraft({...draft,reference:n,awaiting:'preparation'});
     reply('Qual o custo estimado de preparação? Pode ser zero.');return;
    }
    if(draft.preparation===null){
     const next={...draft,preparation:n,awaiting:'done' as const};
     setDraft(next);
     const suggested=Math.max(0,Math.round(next.reference!*0.86-n));
     reply('Compra sugerida: '+brl(suggested)+'. Simulação com preço informado, sem pesquisa de mercado confirmada.');return;
    }
   }else{
    reply(draft.reference===null?'Qual é o menor preço de anúncio comparável?':'Qual o custo estimado de preparação?');return;
   }
  }
  if(/ajuda|o que voc[eê] faz|pode fazer/.test(words)){reply('Consigo consultar estoque e simular compra com um preço de referência.');return;}
  reply('Qual modelo você quer consultar?');
 },[addTurn,reply,answerFipe,lastModel,snapshot,stockReady,draft]);
 // The model only resolves conversational intent. All values come from local Dealer rows.
 // Any Gemini/API error falls back to the existing deterministic assistant.
 const respond=useCallback(async(raw:string)=>{
  const current=auth.currentUser;
  if(!current){respondDeterministic(raw);return;}
  const normalized=normalize(raw);
  const directPurchase=/\b(?:pagar|pagaria|compro|compraria|precificar|precificacao|avaliar|avaliacao|preco de compra)\b/.test(normalized);
  if(!/\bfipe\b/.test(normalized)&&!directPurchase&&
   (/\b(?:quantos|quantas|capital|estoque|versao|versoes)\b/.test(normalized)||
    ((stockContextRef.current||fipeContextRef.current)&&/^(?:do|da|desses|dessas|desse|dessa|e )\b/.test(normalized)))){
   respondDeterministic(raw);return;
  }
  if(directPurchase){respondDeterministic(raw);return;}
  try{
   const token=await current.getIdToken();
   const response=await fetch('/api/motyq-voice',{
    method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},
    body:JSON.stringify({action:'stock_intent',transcript:raw,history:turnRef.current.filter(t=>t.speaker==='user').slice(-6),
     lastModel:lastModel||stockModelRef.current||''}),
    signal:AbortSignal.timeout(9000)
   });
   if(response.ok){
    const intent=await response.json();
    if(intent?.intent==='stock'){
     const model=typeof intent.model==='string'&&modelFrom(intent.model)?modelFrom(intent.model):null;
     const existing=modelFrom(raw);
     const scopedModel=intent.scope==='all'?'':model||existing||lastModel||stockModelRef.current||'';
     const year=Number.isInteger(intent.year)?String(intent.year):'';
     const resetYear=intent.clearYear?' todos os anos':'';
     const suffix=intent.scope==='all'?'estoque inteiro':(scopedModel+' '+year+resetYear+' no estoque').trim();
     let canonical='quantos '+suffix;
     if(intent.metric==='capital')canonical='qual capital investido em '+suffix;
     else if(intent.metric==='aging')canonical='quantos '+suffix+' parados há mais de 90 dias';
     else if(intent.metric==='oldest')canonical='qual o mais antigo de '+suffix;
     else if(intent.metric==='analysis')canonical='analise risco dinheiro parado de '+suffix;
     else if(intent.metric==='list')canonical='listar '+suffix;
     respondDeterministic(canonical,raw);
     return;
    }
   }
  }catch{/* The original conversational rules remain available offline or on quota errors. */}
  respondDeterministic(raw);
 },[respondDeterministic,lastModel]);
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
