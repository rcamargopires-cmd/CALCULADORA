import React,{useEffect,useRef,useState} from 'react';
import {onAuthStateChanged,signInWithPopup,signOut} from 'firebase/auth';
import {auth,googleProvider} from '../firebase';
import MarketIqAquaBuyerMobile from './MarketIqAquaBuyerMobile';
import {aquaCloudRequest} from '../services/motyqAquaCloudClient';
import {defaultAquaInterest,type AquaBuyerListing,type AquaInterest} from '../services/motyqAquaBuyerPreview';

type Feed={linked:boolean;items:AquaBuyerListing[];interest?:AquaInterest|null};
const brl=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const formClass='w-full rounded-lg border border-slate-300 p-3 text-sm';
export default function MarketIqAquaBuyerConnected(){
 const [email,setEmail]=useState('');
 const [checking,setChecking]=useState(true);
 const [linked,setLinked]=useState(false);
 const [lots,setLots]=useState<AquaBuyerListing[]>([]);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [prefs,setPrefs]=useState<AquaInterest>(()=>defaultAquaInterest());
 const [screen,setScreen]=useState<'feed'|'preferences'>('feed');
 const [alerts,setAlerts]=useState(false);
 const [installEvent,setInstallEvent]=useState<(Event&{prompt:()=>Promise<void>})|null>(null);
 const observed=useRef<Set<string>|null>(null);
 useEffect(()=>{
  document.title='Motyq AQUA | Lojista';
  const handler=(event:Event)=>{event.preventDefault();setInstallEvent(event as Event&{prompt:()=>Promise<void>});};
  window.addEventListener('beforeinstallprompt',handler);
  return ()=>window.removeEventListener('beforeinstallprompt',handler);
 },[]);
 useEffect(()=>{
  let stopped=false,timer:ReturnType<typeof setInterval>|null=null;
  let currentEmail='';
  const refresh=async()=>{
   if(!currentEmail)return;
   try{
    const response=await aquaCloudRequest<Feed>('buyer-feed');
    if(stopped)return;
    setLinked(response.linked);setLots(response.items);setError('');
    if(response.interest)setPrefs(response.interest);
    const known=new Set(response.items.map(x=>x.id));
    const newly=observed.current?response.items.filter(x=>!observed.current!.has(x.id)):[];
    observed.current=known;
    if(newly.length){
     const car=newly[0];
     setNotice('🔔 Nova oportunidade: '+car.brand+' '+car.model);
     if(alerts&&'Notification' in window&&Notification.permission==='granted'&&'serviceWorker' in navigator)
      void navigator.serviceWorker.ready.then(sw=>sw.showNotification('Motyq AQUA · Nova oportunidade',{
       body:car.brand+' '+car.model+' '+car.year,tag:'AQUA-'+car.id,icon:'/icons/motyq-iq-192.png'
      })).catch(()=>{});
    }
   }catch(e){if(!stopped)setError(e instanceof Error?e.message:'Não foi possível buscar oportunidades.');}
   finally{if(!stopped)setChecking(false);}
  };
  const unsub=onAuthStateChanged(auth,user=>{
   if(timer)clearInterval(timer);
   currentEmail=user?.emailVerified?user.email||'':'';
   setEmail(currentEmail);setLinked(false);setChecking(Boolean(currentEmail));setLots([]);
   setError('');observed.current=null;
   if(currentEmail){void refresh();timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},60000);}
  });
  return ()=>{stopped=true;unsub();if(timer)clearInterval(timer);};
 },[alerts]);
 const logIn=async()=>{setError('');try{await signInWithPopup(auth,googleProvider);}
 catch{setError('Não foi possível entrar com Google. Confirme a conta autorizada e tente novamente.');}};
 const save=async()=>{
  try{
   if(prefs.yearFrom&&prefs.yearTo&&Number(prefs.yearFrom)>Number(prefs.yearTo))
    throw Error('Confira a faixa de anos.');
   await aquaCloudRequest('save-interests',{interest:prefs});
   setNotice('Interesses atualizados. As próximas oportunidades serão filtradas pela sua escolha.');
   setScreen('feed');window.location.reload();
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar interesses.');}
 };
 const allow=async()=>{
  if(!('Notification' in window)){setNotice('Este dispositivo não oferece avisos pelo navegador.');return;}
  try{const result=await Notification.requestPermission();setAlerts(result==='granted');
   setNotice(result==='granted'?'Avisos permitidos enquanto o app estiver aberto. Push com app fechado ainda não está ativo.':'O aplicativo continua mostrando suas oportunidades sem notificações.');}
  catch{setNotice('Não foi possível ativar avisos neste celular.');}
 };
 const install=async()=>{
  if(installEvent){try{await installEvent.prompt();return;}catch{}}
  setNotice('Android: Chrome → ⋮ → Instalar app. iPhone: Safari → Compartilhar → Adicionar à Tela de Início.');
 };
 if(!email)return <div className="min-h-screen bg-[#edf7fa]">
  <div className="mx-auto max-w-lg space-y-3 p-4">
   <header className="rounded-2xl bg-[#12475b] p-5 text-white">
    <p className="text-xs font-black tracking-widest text-cyan-200">MOTYQ AQUA</p>
    <h1 className="mt-1 text-2xl font-black">Oportunidades para sua loja</h1>
    <p className="mt-2 text-sm text-cyan-100">Entre com o e-mail habilitado pela Mesa para ver carros de verdade.</p>
    <button type="button" onClick={()=>void logIn()} className="mt-4 w-full rounded-xl bg-white p-3 font-black text-cyan-950">Entrar com Google</button>
    {error&&<p role="alert" className="mt-2 text-sm text-rose-200">{error}</p>}
   </header>
   <section className="rounded-2xl bg-white p-4"><strong className="text-sm">Conhecer o aplicativo</strong>
    <p className="mt-1 text-xs text-slate-600">A demonstração abaixo usa veículos fictícios e não permite compras.</p></section>
   <MarketIqAquaBuyerMobile/>
  </div>
 </div>;
 return <div className="min-h-screen bg-[#f2f8fa] pb-24 text-slate-900">
  <div className="mx-auto max-w-lg space-y-4 bg-white p-4">
   <header className="rounded-2xl bg-[#12475b] p-5 text-white">
    <p className="text-xs font-black tracking-widest text-cyan-200">MOTYQ AQUA · LOJISTA</p>
    <h1 className="text-xl font-black">Oportunidades para sua loja</h1>
    <div className="mt-3 flex items-center justify-between gap-2 text-xs">
     <span className="truncate">{email}</span>
     <button type="button" onClick={()=>void signOut(auth)} className="rounded-lg border border-cyan-300 px-3 py-2 font-bold">Sair</button>
    </div>
   </header>
   {notice&&<p role="status" className="rounded-xl bg-cyan-50 p-3 text-sm font-bold text-cyan-950">{notice}</p>}
   {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-900">{error}</p>}
   {checking?<p className="rounded-xl bg-slate-100 p-4 text-sm">Conferindo cadastro e oportunidades autorizadas...</p>:
    !linked?<section className="space-y-2 rounded-xl bg-amber-50 p-4">
     <h2 className="font-black text-amber-950">Conta aguardando habilitação</h2>
     <p className="text-sm text-amber-900">Peça à Mesa para cadastrar e habilitar exatamente este e-mail na ficha do lojista. Por segurança, carros de outras lojas não são exibidos.</p>
    </section>:<>
     <div className="grid grid-cols-3 gap-2">
      <button type="button" onClick={()=>setScreen('feed')} className={'rounded-xl p-3 text-xs font-black '+(screen==='feed'?'bg-cyan-800 text-white':'bg-slate-100')}>Carros ({lots.length})</button>
      <button type="button" onClick={()=>setScreen('preferences')} className={'rounded-xl p-3 text-xs font-black '+(screen==='preferences'?'bg-cyan-800 text-white':'bg-slate-100')}>O que procuro</button>
      <button type="button" onClick={()=>void install()} className="rounded-xl bg-slate-100 p-3 text-xs font-black">Instalar app</button>
     </div>
     {screen==='feed'?<>
      <section className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
       <div className="flex items-center justify-between gap-2">
        <strong className="text-sm text-cyan-950">Avisos de oportunidades</strong>
        <button type="button" onClick={()=>void allow()} className="rounded-lg bg-cyan-800 px-3 py-2 text-xs font-black text-white">Permitir avisos</button>
       </div>
       <p className="mt-2 text-xs text-cyan-950">Novos carros aparecem ao atualizar o aplicativo ou durante a consulta automática com ele aberto. Alertas com o app fechado ainda exigem push em segundo plano.</p>
      </section>
      {lots.map(l=><article key={l.id} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
       <h3 className="text-lg font-black">{l.brand} {l.model}</h3>
       <p className="mt-1 text-sm text-slate-600">{l.year} · {Number(l.km).toLocaleString('pt-BR')} km</p>
       <p className="mt-2 text-sm">{l.mode==='open'?'Disputa aberta':'Propostas fechadas'} · {new Date(l.endsAt).toLocaleString('pt-BR')}</p>
       {l.buyNowPrice&&<p className="mt-2 font-black text-emerald-800">Arremate anunciado: {brl(l.buyNowPrice)}</p>}
       {l.mode==='open'&&l.highestBid&&<p className="mt-1 text-sm">Maior lance: {brl(l.highestBid)}</p>}
       {l.notes&&<p className="mt-2 text-xs text-slate-600">{l.notes}</p>}
       <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">Lances e arremates reais ainda não estão liberados nesta etapa.</p>
      </article>)}
      {!lots.length&&<p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Nenhum veículo compatível publicado para sua loja neste momento.</p>}
     </>:<section className="space-y-3 rounded-xl border border-slate-200 p-4">
      <h2 className="font-black">Quais veículos você compra?</h2>
      <label className="block text-sm font-bold">Tipo<select className={formClass} value={prefs.vehicleType}
       onChange={e=>setPrefs(p=>({...p,vehicleType:e.target.value as AquaInterest['vehicleType']}))}>
       <option value="car">Automóveis</option><option value="motorcycle">Motos</option><option value="both">Ambos</option></select></label>
      {([['brands','Marcas'],['models','Modelos'],['yearFrom','Ano mínimo'],['yearTo','Ano máximo'],
       ['maxKm','KM máxima'],['budgetTo','Teto de arremate (R$)']] as const).map(([key,label])=>
       <label key={key} className="block text-sm font-bold">{label}
        <input className={formClass} value={prefs[key]} onChange={e=>setPrefs(p=>({...p,[key]:e.target.value}))}/></label>)}
      <button type="button" onClick={()=>void save()} className="w-full rounded-xl bg-emerald-700 p-3 font-black text-white">Salvar interesses na nuvem</button>
     </section>}
    </>}
  </div>
 </div>;
}
