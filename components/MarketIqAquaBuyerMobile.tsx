import React,{useEffect,useMemo,useState} from 'react';
import {Bell,CarFront,Check,Clock,Download,Search,Settings2,ShieldCheck,Smartphone} from 'lucide-react';
import {aquaInterestKey,buyerListingMatches,defaultAquaInterest,findNewRelevantListings,loadAquaInterest,
 sampleBuyerLots,saveAquaInterest,type AquaBuyerListing,type AquaInterest} from '../services/motyqAquaBuyerPreview';

const brl=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
type PromptEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export default function MarketIqAquaBuyerMobile(){
 const [interest,setInterest]=useState<AquaInterest>(()=>loadAquaInterest());
 const [screen,setScreen]=useState<'feed'|'profile'>('feed');
 const [onlyMine,setOnlyMine]=useState(true);
 const [feed,setFeed]=useState<AquaBuyerListing[]>(()=>sampleBuyerLots());
 const [notice,setNotice]=useState('');
 const [expanded,setExpanded]=useState('');
 const [alertEnabled,setAlertEnabled]=useState(false);
 const [installEvent,setInstallEvent]=useState<PromptEvent|null>(null);
 const [standalone,setStandalone]=useState(false);
 const matched=useMemo(()=>feed.filter(x=>buyerListingMatches(x,interest)),[feed,interest]);
 const shown=onlyMine?matched:feed;
 useEffect(()=>{
  document.title='Motyq AQUA | Lojista';
  const meta=document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if(meta)meta.href='/aqua-lojista.webmanifest';
  const event=(e:Event)=>{e.preventDefault();setInstallEvent(e as PromptEvent);};
  const onInstall=()=>{setInstallEvent(null);setStandalone(true);};
  window.addEventListener('beforeinstallprompt',event);
  window.addEventListener('appinstalled',onInstall);
  setStandalone(window.matchMedia?.('(display-mode: standalone)').matches||('standalone' in navigator&&(navigator as Navigator&{standalone?:boolean}).standalone===true));
  return ()=>{window.removeEventListener('beforeinstallprompt',event);window.removeEventListener('appinstalled',onInstall);};
 },[]);
 const save=()=>{
  if(interest.yearFrom&&interest.yearTo&&Number(interest.yearFrom)>Number(interest.yearTo)){
   setNotice('Confira os anos: inicial maior que final.');return;
  }
  try{saveAquaInterest(interest);setScreen('feed');setNotice('Seus interesses foram salvos neste dispositivo.');}
  catch{setNotice('Não foi possível salvar. Confira o armazenamento do navegador.');}
 };
 const enableAlerts=async()=>{
  if(!('Notification' in window)){setNotice('Este navegador não oferece notificações aqui. O alerta dentro do app continua disponível.');return;}
  if(!window.isSecureContext){setNotice('Permissão de notificações exige conexão HTTPS.');return;}
  try{const permission=await Notification.requestPermission();
   setAlertEnabled(permission==='granted');
   setNotice(permission==='granted'?'Avisos de teste habilitados enquanto o aplicativo estiver aberto. O envio em segundo plano ainda não está ativo.':'Notificações não autorizadas. Você continua vendo oportunidades no app.');
  }catch{setNotice('Não foi possível ativar as notificações neste dispositivo.');}
 };
 const simulateMatch=()=>{
  const now=Date.now();
  const vehicleType=interest.vehicleType==='motorcycle'?'motorcycle':'car';
  const brand=interest.brands.split(',').map(x=>x.trim()).find(Boolean)||(vehicleType==='car'?'Jeep':'Honda');
  const model=interest.models.split(',').map(x=>x.trim()).find(Boolean)||(vehicleType==='car'?'Compass':'CG 160');
  const year=interest.yearFrom&&Number(interest.yearFrom)>1900?interest.yearFrom:'2023';
  const maxKm=Number(interest.maxKm.replace(/\D/g,''));
  const km=String(maxKm>1000?Math.min(maxKm,35000):35000);
  const newLot:AquaBuyerListing={id:'DEMO-'+now,brand,model,year,km,vehicleType,
   mode:'open',endsAt:new Date(now+86400000).toISOString(),highestBid:75000,
   notes:'Nova oportunidade fictícia para demonstrar o aviso'};
  const relevant=findNewRelevantListings(feed.map(x=>x.id),[newLot],interest);
  setFeed(x=>[newLot,...x]);
  setScreen('feed');setOnlyMine(true);
  if(relevant.length){
   setNotice('🔔 Nova oportunidade compatível: '+brand+' '+model+'. Aviso exibido no app.');
   if(alertEnabled&&'Notification' in window&&Notification.permission==='granted'){
    try{new Notification('Motyq AQUA · Oportunidade de teste',{body:brand+' '+model+' '+year+' combina com seu perfil.',tag:newLot.id});}catch{}
   }
  }else setNotice('Veículo de demonstração adicionado, mas fora do perfil. Ajuste seus interesses.');
 };
 const install=async()=>{
  if(!installEvent){
   setNotice('Android: Chrome > menu ⋮ > Instalar app. iPhone: Safari > Compartilhar > Adicionar à Tela de Início.');
   return;
  }
  try{await installEvent.prompt();await installEvent.userChoice;setInstallEvent(null);}
  catch{setNotice('Use o menu do navegador para adicionar o AQUA à tela inicial.');}
 };
 const input='mt-1 block w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900';
 return <div className="min-h-screen bg-[#f2f8fa] text-slate-900">
  <div className="mx-auto min-h-screen max-w-lg bg-white pb-24 shadow-sm">
   <header className="sticky top-0 z-10 border-b border-cyan-100 bg-[#12475b] p-4 text-white">
    <div className="flex items-center justify-between">
     <div><p className="text-xs font-black tracking-widest text-cyan-200">MOTYQ AQUA</p>
      <h1 className="text-xl font-black">Oportunidades para sua loja</h1></div>
     <button onClick={install} type="button" aria-label="Instalar o AQUA" className="rounded-xl border border-cyan-300/40 p-2.5"><Download size={22}/></button>
    </div>
    <div className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-950">
     DEMONSTRAÇÃO · Veículos e lances fictícios. Sem acesso aos dados reais da Mesa.
    </div>
   </header>
   <main className="space-y-4 p-4">
    {notice&&<div role="status" className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold text-cyan-950">{notice}
     <button type="button" aria-label="Dispensar aviso" onClick={()=>setNotice('')} className="ml-2 float-right font-bold">×</button>
    </div>}
    {screen==='feed'?<>
     <div className="flex gap-2">
      <button type="button" onClick={()=>setOnlyMine(true)} className={'flex-1 rounded-xl p-3 text-sm font-bold '+(onlyMine?'bg-cyan-800 text-white':'bg-slate-100')}>Para minha loja ({matched.length})</button>
      <button type="button" onClick={()=>setOnlyMine(false)} className={'flex-1 rounded-xl p-3 text-sm font-bold '+(!onlyMine?'bg-cyan-800 text-white':'bg-slate-100')}>Ver exemplos ({feed.length})</button>
     </div>
     <section className="space-y-2 rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-2"><Bell size={18} className="text-cyan-800"/><h2 className="font-black">Avisos de oportunidades</h2></div>
      <p className="text-xs leading-5 text-slate-600">Nesta demonstração, novos carros compatíveis aparecem no app. O aviso do celular pode ser testado com o aplicativo aberto. Notificações em segundo plano virão com o serviço de push.</p>
      <div className="grid grid-cols-2 gap-2">
       <button type="button" onClick={()=>void enableAlerts()} className="rounded-xl bg-cyan-800 px-3 py-3 text-xs font-black text-white">Permitir avisos</button>
       <button type="button" onClick={simulateMatch} className="rounded-xl border border-cyan-700 px-3 py-3 text-xs font-black text-cyan-950">Simular carro novo</button>
      </div>
     </section>
     <h2 className="text-base font-black">Aquário de oportunidades</h2>
     {shown.map(l=><article key={l.id} className="space-y-3 rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-cyan-50 p-3 text-cyan-900"><CarFront size={24}/></div>
       <div className="min-w-0 flex-1"><h3 className="text-base font-black">{l.brand} {l.model}</h3>
        <p className="text-sm text-slate-600">{l.year} · {Number(l.km).toLocaleString('pt-BR')} km</p></div>
       <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold">{l.mode==='open'?'Aberta':'Secreta'}</span></div>
      <div className="flex items-center justify-between text-sm">
       <span className="flex items-center gap-1 text-slate-600"><Clock size={15}/> Rodada de teste</span>
       <strong className="text-emerald-800">{l.buyNowPrice?brl(l.buyNowPrice)+' arremate':'Sem preço fixo'}</strong>
      </div>
      {expanded===l.id&&<div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
       {l.notes||'Oportunidade ilustrativa.'}
       <p className="mt-2 font-semibold">Lances e arremates reais só ficarão disponíveis após autenticação e integração da Mesa.</p>
      </div>}
      <button type="button" onClick={()=>setExpanded(x=>x===l.id?'':l.id)} className="w-full rounded-xl border border-cyan-700 p-3 text-sm font-black text-cyan-900">
       {expanded===l.id?'Ocultar detalhes':'Ver oportunidade'}</button>
     </article>)}
     {!shown.length&&<div className="rounded-2xl bg-slate-50 p-6 text-center">
      <Search className="mx-auto text-slate-500" size={30}/><h3 className="mt-2 font-black">Nenhum carro neste perfil</h3>
      <p className="mt-1 text-sm text-slate-600">Altere seus interesses para descobrir outras oportunidades.</p>
      <button type="button" onClick={()=>setScreen('profile')} className="mt-3 text-sm font-bold text-cyan-800">Editar o que procuro</button>
     </div>}
    </>:<>
     <h2 className="text-lg font-black">O que sua loja procura?</h2>
     <p className="text-sm text-slate-600">Defina uma vez. O AQUA utiliza estas preferências para destacar oportunidades compatíveis.</p>
     <label className="block text-sm font-bold">Tipo de veículo
      <select className={input} value={interest.vehicleType} onChange={e=>setInterest(x=>({...x,vehicleType:e.target.value as AquaInterest['vehicleType']}))}>
       <option value="car">Automóveis</option><option value="motorcycle">Motocicletas</option><option value="both">Carros e motos</option></select></label>
     {([['brands','Marcas de interesse'],['models','Modelos (opcional)'],['yearFrom','Ano a partir de'],['yearTo','Ano até'],['maxKm','KM máxima'],['budgetTo','Orçamento de arremate até (R$)']] as const).map(([key,label])=>
      <label key={key} className="block text-sm font-bold">{label}
       <input className={input} value={interest[key]} onChange={e=>setInterest(x=>({...x,[key]:e.target.value}))}
        placeholder={key==='brands'?'Ex.: Jeep, Volkswagen':key==='models'?'Ex.: Compass, T-Cross':''}/></label>)}
     <button type="button" onClick={save} className="w-full rounded-xl bg-emerald-700 p-4 font-black text-white">Salvar meus interesses</button>
     <p className="text-xs text-slate-500">No teste, estas informações ficam apenas neste dispositivo. O cadastro real precisará de login e autorização da loja.</p>
    </>}
   </main>
   <footer className="fixed bottom-0 left-1/2 z-10 flex w-full max-w-lg -translate-x-1/2 border-t border-slate-200 bg-white p-2">
    <button type="button" onClick={()=>setScreen('feed')} className={'flex flex-1 flex-col items-center gap-1 rounded-lg p-2 text-xs font-bold '+(screen==='feed'?'text-cyan-800':'text-slate-500')}><CarFront size={20}/>Oportunidades</button>
    <button type="button" onClick={()=>setScreen('profile')} className={'flex flex-1 flex-col items-center gap-1 rounded-lg p-2 text-xs font-bold '+(screen==='profile'?'text-cyan-800':'text-slate-500')}><Settings2 size={20}/>Meus interesses</button>
    <button type="button" onClick={install} className="flex flex-1 flex-col items-center gap-1 rounded-lg p-2 text-xs font-bold text-slate-500"><Smartphone size={20}/>{standalone?'Instalado':'Instalar'}</button>
   </footer>
  </div>
 </div>;
}
