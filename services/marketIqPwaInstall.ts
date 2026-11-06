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

/**
 * Match physical device class, not PWA display mode or the window width.
 * Windows standalone PWAs frequently start at ~800px wide; they should keep
 * the desktop pricing workspace rather than switch to the phone experience.
 */
export function motyqDesktopDeviceFromAgent(userAgent:string,mobileFlag=false,touchPoints=0):boolean{
 const ua=String(userAgent||'');
 if(mobileFlag||/Android|iPhone|iPad|iPod|Mobile/i.test(ua))return false;
 // iPadOS may announce itself as Macintosh in Safari desktop mode.
 if(/Macintosh/i.test(ua)&&touchPoints>1)return false;
 return /Windows NT|Macintosh|CrOS|X11|Linux x86_64/i.test(ua);
}
export function isDesktopMotyqDevice():boolean{
 if(typeof navigator==='undefined')return false;
 const hint=(navigator as Navigator&{userAgentData?:{mobile?:boolean}}).userAgentData?.mobile;
 return motyqDesktopDeviceFromAgent(navigator.userAgent,hint===true,navigator.maxTouchPoints||0);
}
