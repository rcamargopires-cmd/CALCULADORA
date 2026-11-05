// Chromium's install prompt is ephemeral. Never call prompt() except inside
// a direct tap/click; otherwise Chrome refuses to show it.
export type InstallChoice='accepted'|'dismissed'|'unavailable';
type DeferredPwaPrompt=Event&{
 prompt:()=>Promise<void>;
 userChoice:Promise<{outcome:'accepted'|'dismissed'}>;
};
let deferred:DeferredPwaPrompt|null=null;
let installed=false;
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(cb=>cb());
if(typeof window!=='undefined'){
 window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  deferred=e as DeferredPwaPrompt;
  notify();
 });
 window.addEventListener('appinstalled',()=>{
  installed=true;deferred=null;notify();
 });
}
export function isStandaloneMotyq():boolean{
 if(typeof window==='undefined')return false;
 return installed||window.matchMedia?.('(display-mode: standalone)').matches||
  Boolean((navigator as Navigator&{standalone?:boolean}).standalone);
}
export function canPromptMotyqInstall():boolean{return Boolean(deferred)&&!isStandaloneMotyq();}
export function subscribeMotyqInstall(cb:()=>void):()=>void{
 listeners.add(cb);return()=>{listeners.delete(cb);};
}
export async function promptMotyqInstall():Promise<InstallChoice>{
 if(!deferred||isStandaloneMotyq())return 'unavailable';
 const event=deferred;
 deferred=null;
 notify();
 try{
  await event.prompt();
  const choice=await event.userChoice;
  return choice?.outcome==='accepted'?'accepted':'dismissed';
 }catch{return 'unavailable';}
}
