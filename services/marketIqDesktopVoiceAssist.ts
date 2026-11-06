import {mobileSpeechToSearch} from './marketIqMobileVoice';

export type VoiceCatalogEntry={code:string;name:string};
type VoiceResult={transcript?:string;confidence?:number};
type VoiceEvent={results?:ArrayLike<ArrayLike<VoiceResult>>};

const norm=(text:string)=>String(text||'').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/\blong\b|\blongi\b/g,'longitude')
 .replace(/\bt[\s-]+cross\b/g,'tcross')
 .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const terms=(s:string)=>norm(s).split(' ').filter(w=>w.length>=3&&!/^(19|20)\d{2}$/.test(w));
const distance=(a:string,b:string,limit=2)=>{
 if(Math.abs(a.length-b.length)>limit)return limit+1;
 const row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  let prev=row[0];row[0]=i;
  let min=row[0];
  for(let j=1;j<=b.length;j++){
   const save=row[j];
   row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));
   prev=save;min=Math.min(min,row[j]);
  }
  if(min>limit)return limit+1;
 }
 return row[b.length];
};
const exactTerm=(a:string,b:string)=>a===b||(a.length>=4&&b.startsWith(a))||
 (b.length>=4&&a.startsWith(b));
const fuzzyTerm=(a:string,b:string)=>exactTerm(a,b)||
 (a.length>=5&&b.length>=5&&distance(a,b)<=2);

/**
 * Rank only words actually returned by the browser. FIPE tokens guide
 * selection among genuine ASR alternatives: never fabricate a vehicle
 * name or treat speech recognition as a guaranteed FIPE identification.
 */
export function desktopSpeechInterpretations(
 event:VoiceEvent,
 brands:VoiceCatalogEntry[],
 models:VoiceCatalogEntry[]
):string[]{
 const all=event.results;
 if(!all?.length)return [];
 const last=all.length-1;
 const prefix=Array.from({length:last},(_,i)=>String(all[i]?.[0]?.transcript||''))
  .join(' ').trim();
 const byText=new Map<string,{text:string;score:number;order:number}>();
 const choices=all[last];
 const count=Math.min(3,choices?.length||0);
 for(let i=0;i<count;i++){
  const item=choices[i];
  const candidate=mobileSpeechToSearch([prefix,item?.transcript||''].join(' ').trim());
  if(!candidate)continue;
  const text=norm(candidate),words=terms(candidate);
  const brand=brands.find(b=>text===norm(b.name)||text.startsWith(norm(b.name)+' '));
  const allowed=brand?words.filter(w=>!terms(brand.name).includes(w)):words;
  const matching=models.map(m=>{
   const label=terms(m.name);
   return allowed.filter(w=>label.some(x=>exactTerm(w,x))).length;
  });
  const modelMatches=Math.max(0,...matching);
  const confidence=Number(item?.confidence);
  const score=(brand?2:0)+(modelMatches>=2?4:modelMatches>0?2:0)+
   (/\b(?:19|20)\d{2}\b/.test(text)?0.5:0)+
   (Number.isFinite(confidence)?Math.min(1,Math.max(0,confidence)):0);
  if(!byText.has(text))byText.set(text,{text:candidate,score,order:i});
 }
 return [...byText.values()].sort((a,b)=>b.score-a.score||a.order-b.order)
  .slice(0,3).map(x=>x.text);
}

/** Suggestions are FIPE catalog rows, never an automatic trim selection.
 * Show only when the strict query gave no matches.
 */
export function desktopFuzzyFipeSuggestions(
 query:string,models:VoiceCatalogEntry[],max=5
):VoiceCatalogEntry[]{
 const queryWords=terms(query).filter(w=>!['jeep','chevrolet','fiat','volkswagen','toyota','honda','hyundai'].includes(w));
 if(queryWords.length<2)return [];
 const matches=models.map(model=>{
  const modelWords=terms(model.name);
  const exact=queryWords.filter(q=>modelWords.some(w=>exactTerm(q,w))).length;
  const fuzzy=queryWords.filter(q=>modelWords.some(w=>fuzzyTerm(q,w))).length;
  return {model,exact,fuzzy};
 }).filter(x=>x.exact>=1&&x.fuzzy===queryWords.length)
  .sort((a,b)=>b.exact-a.exact||a.model.name.length-b.model.name.length);
 return matches.slice(0,max).map(x=>x.model);
}