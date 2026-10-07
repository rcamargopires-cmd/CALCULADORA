import React,{useEffect,useMemo,useRef,useState} from 'react';
import { Camera,Check,ChevronLeft,ChevronRight,ClipboardCheck,LogOut,Plus,RefreshCw,Send,Trash2,TriangleAlert,Wrench } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { User } from '../types';
import { companyIdForUser } from '../services/companyService';
import { storeIdForUser } from '../services/storeService';
import { EvaluationQueueRequest,evaluationQueueService } from '../services/evaluationQueueService';
import { MarketIQDamageItem,MarketIQEvaluation,MarketIQMediaCategory,MarketIQMediaItem,marketIqEvaluationService } from '../services/marketIqEvaluationService';
import { marketIqMediaService } from '../services/marketIqMediaService';
import EvaluatorHistory from './EvaluatorHistory';

const requiredPhotos:Array<{category:MarketIQMediaCategory;label:string;hint:string}>=[
  {category:'front',label:'Frente',hint:'Carro inteiro de frente'},
  {category:'rear',label:'Traseira',hint:'Carro inteiro por trás'},
  {category:'left',label:'Lateral esquerda',hint:'Lateral completa'},
  {category:'right',label:'Lateral direita',hint:'Lateral completa'},
  {category:'interior',label:'Interior',hint:'Bancos e acabamento'},
  {category:'dashboard',label:'Painel',hint:'Painel ligado e KM visível'},
  {category:'tires',label:'Pneus',hint:'Estado dos pneus'},
];
const steps=['Veículo','Fotos','Avarias','Revisão'];
const cleanPlate=(value:unknown)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const money=(value:number)=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const damageTotal=(items:MarketIQDamageItem[])=>items.reduce((sum,item)=>sum+Math.max(0,Number(item.cost||0)),0);

const EvaluatorMobileInspection:React.FC<{user:User}>=({user})=>{
  const companyId=companyIdForUser(user);
  const storeId=storeIdForUser(user);
  const email=user.email.toLowerCase();
  const[requests,setRequests]=useState<EvaluationQueueRequest[]>([]);
  const[active,setActive]=useState<EvaluationQueueRequest|null>(null);
  const[draft,setDraft]=useState<MarketIQEvaluation|null>(null);
  const[photos,setPhotos]=useState<MarketIQMediaItem[]>([]);
  const[damages,setDamages]=useState<MarketIQDamageItem[]>([]);
  const[km,setKm]=useState('');
  const[notes,setNotes]=useState('');
  const[step,setStep]=useState(0);
  const[tab,setTab]=useState<'new'|'mine'>('new');
  const[busy,setBusy]=useState('');
  const[error,setError]=useState('');
  const[pendingCategory,setPendingCategory]=useState<MarketIQMediaCategory>('front');
  const[damageDescription,setDamageDescription]=useState('');
  const[damageCost,setDamageCost]=useState('');
  const fileRef=useRef<HTMLInputElement|null>(null);

  useEffect(()=>evaluationQueueService.subscribe(user,companyId,storeId,setRequests,()=>setError('Não foi possível carregar suas avaliações.')),[user,companyId,storeId]);

  const newItems=useMemo(()=>requests.filter(item=>item.status==='requested'&&!item.evaluatorEmail),[requests]);
  const mine=useMemo(()=>requests.filter(item=>(item.status==='inspection'||item.status==='in_progress')&&item.evaluatorEmail.toLowerCase()===email),[requests,email]);
  const list=tab==='new'?newItems:mine;

  const ensureDraft=async(request:EvaluationQueueRequest)=>{
    let evaluation=request.marketiqEvaluationId?await marketIqEvaluationService.getById(request.marketiqEvaluationId).catch(()=>null):null;
    if(!evaluation){
      const id=await marketIqEvaluationService.create({
        companyId:companyId,storeId:storeId,storeName:storeId,plate:cleanPlate(request.plate),
        vehicle:request.vehicle||'Veículo a identificar',year:request.year||'',km:request.km||'',fipe:'',
        notes:request.notes||'',createdByEmail:email,createdByName:user.name||user.email,
      });
      await evaluationQueueService.linkInspectionDraft(request.id,id,user);
      evaluation=await marketIqEvaluationService.getById(id);
    }
    if(!evaluation)throw new Error('Não foi possível criar o rascunho da inspeção.');
    return evaluation;
  };

  const openInspection=async(request:EvaluationQueueRequest)=>{
    if(busy)return;
    setBusy(request.id);setError('');
    try{
      if(request.status==='requested')await evaluationQueueService.start(request.id,user);
      const next={...request,status:'inspection' as const,evaluatorEmail:email,evaluatorName:user.name||user.email};
      const evaluation=await ensureDraft(next);
      setActive(next);setDraft(evaluation);setPhotos(evaluation.photos||[]);setDamages(evaluation.damages||[]);
      setKm(evaluation.km||request.km||'');setNotes(evaluation.notes||request.notes||'');setStep(0);
    }catch(e:any){setError(e?.message||'Não foi possível abrir esta avaliação.');}
    finally{setBusy('');}
  };

  const saveDraft=async(nextPhotos=photos,nextDamages=damages)=>{
    if(!draft)return;
    await marketIqEvaluationService.updateDraft(draft.id,{
      km:km,notes:notes,photos:nextPhotos,damages:nextDamages,damageTotal:damageTotal(nextDamages),
    },{email:user.email,name:user.name});
  };

  const choosePhoto=(category:MarketIQMediaCategory)=>{setPendingCategory(category);fileRef.current?.click();};

  const uploadPhoto=async(files:FileList|null)=>{
    if(!files?.length||!active||!draft)return;
    setBusy('photo');setError('');
    try{
      const added=await marketIqMediaService.upload({companyId:companyId,storeId:storeId,plate:active.plate,category:pendingCategory,file:files[0]});
      let next=photos.slice();
      if(pendingCategory!=='damage'){
        const old=next.find(item=>item.category===pendingCategory);
        if(old)await marketIqMediaService.remove(old).catch(()=>undefined);
        next=next.filter(item=>item.category!==pendingCategory);
      }
      next.push(added);setPhotos(next);
      await marketIqEvaluationService.attachMedia(draft.id,next,damages);
    }catch(e:any){setError(e?.message||'Não foi possível salvar a foto.');}
    finally{setBusy('');if(fileRef.current)fileRef.current.value='';}
  };

  const removePhoto=async(item:MarketIQMediaItem)=>{
    if(!draft)return;
    await marketIqMediaService.remove(item).catch(()=>undefined);
    const nextPhotos=photos.filter(photo=>photo.id!==item.id);
    const nextDamages=damages.map(d=>d.mediaId===item.id?{...d,mediaId:undefined}:d);
    setPhotos(nextPhotos);setDamages(nextDamages);
    await marketIqEvaluationService.attachMedia(draft.id,nextPhotos,nextDamages);
  };

  const addDamage=async()=>{
    if(!draft)return;
    const value=Math.max(0,Number(String(damageCost).replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''))||0);
    if(!damageDescription.trim()){setError('Descreva a avaria.');return;}
    if(value<=0){setError('Informe o custo estimado da avaria.');return;}
    const item:MarketIQDamageItem={id:'damage_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),description:damageDescription.trim(),cost:value};
    const next=damages.concat(item);setDamages(next);setDamageDescription('');setDamageCost('');setError('');
    await marketIqEvaluationService.attachMedia(draft.id,photos,next);
  };

  const removeDamage=async(id:string)=>{
    if(!draft)return;
    const next=damages.filter(item=>item.id!==id);setDamages(next);
    await marketIqEvaluationService.attachMedia(draft.id,photos,next);
  };

  const requiredDone=requiredPhotos.filter(req=>photos.some(photo=>photo.category===req.category)).length;
  const missing=requiredPhotos.filter(req=>!photos.some(photo=>photo.category===req.category));

  const finishInspection=async()=>{
    if(!active||!draft||busy)return;
    if(missing.length){setStep(1);setError('Faltam fotos obrigatórias: '+missing.map(item=>item.label).join(', ')+'.');return;}
    setBusy('finish');setError('');
    try{
      await saveDraft();
      await evaluationQueueService.completeInspection(active.id,user,{
        marketIqEvaluationId:draft.id,photoCount:photos.length,damageCount:damages.length,damageTotal:damageTotal(damages),
      });
      setActive(null);setDraft(null);setPhotos([]);setDamages([]);setKm('');setNotes('');setStep(0);setTab('mine');
    }catch(e:any){setError(e?.message||'Não foi possível enviar para a mesa de precificação.');}
    finally{setBusy('');}
  };

  if(active&&draft){
    return <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <button onClick={()=>setActive(null)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200"><ChevronLeft size={19}/></button>
          <div className="min-w-0 text-center"><p className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-700">MOTYQ IQ · INSPEÇÃO</p><h1 className="truncate text-base font-semibold">{active.plate} · {active.vehicle||'Veículo'}</h1></div>
          <span className="grid h-10 min-w-10 place-items-center rounded-xl bg-slate-950 px-2 text-xs font-black text-cyan-300">{step+1}/4</span>
        </div>
      </header>

      <main className="mx-auto max-w-xl p-4 pb-28">
        <div className="mb-4 grid grid-cols-4 gap-1.5">{steps.map((name,index)=><button key={name} onClick={()=>setStep(index)} className={'rounded-xl px-1 py-2 text-[9px] font-black uppercase '+(index===step?'bg-slate-950 text-white':index<step?'bg-emerald-50 text-emerald-700':'bg-white text-slate-400')}>{index<step?<Check size={13} className="mx-auto mb-1"/>:null}{name}</button>)}</div>
        {error&&<div className="mb-4 flex gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><TriangleAlert size={17} className="mt-0.5 shrink-0"/><span>{error}</span></div>}

        {step===0&&<div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-cyan-700">1 · CONFIRA O VEÍCULO</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Placa</span><strong className="mt-1 block font-mono text-lg">{active.plate}</strong></div>
            <div className="rounded-2xl bg-slate-50 p-3"><span className="text-xs text-slate-500">RENAVAM</span><strong className="mt-1 block">{active.renavam||'—'}</strong></div>
            <div className="col-span-2 rounded-2xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Veículo</span><strong className="mt-1 block">{active.vehicle||'A identificar'} {active.year?'· '+active.year:''}</strong></div>
          </div>
          <label className="mt-4 block"><span className="mb-1 block text-[10px] font-black uppercase text-slate-500">KM conferido</span><input value={km} onChange={e=>setKm(e.target.value.replace(/\D/g,'').slice(0,7))} onBlur={()=>void saveDraft()} inputMode="numeric" className="h-12 w-full rounded-xl border border-slate-200 px-3 text-base outline-none focus:border-cyan-400"/></label>
          <label className="mt-3 block"><span className="mb-1 block text-[10px] font-black uppercase text-slate-500">Observações da inspeção</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} onBlur={()=>void saveDraft()} rows={4} className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-cyan-400" placeholder="Estado geral, detalhes, luz no painel..."/></label>
        </div>}

        {step===1&&<div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-cyan-700">2 · FOTOS GUIADAS</p><h2 className="mt-1 text-lg font-semibold">{requiredDone}/{requiredPhotos.length} obrigatórias</h2></div><Camera size={24} className="text-cyan-700"/></div>
          <p className="mt-2 text-sm text-slate-500">Toque em cada quadro. No celular a câmera abre direto.</p>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>void uploadPhoto(e.target.files)}/>
          <div className="mt-4 grid grid-cols-2 gap-3">{requiredPhotos.map(req=>{const photo=photos.find(item=>item.category===req.category);return <button key={req.category} disabled={busy==='photo'} onClick={()=>choosePhoto(req.category)} className={'overflow-hidden rounded-2xl border text-left '+(photo?'border-emerald-200 bg-emerald-50':'border-slate-200 bg-slate-50')}><div className="aspect-[4/3]">{photo?<img src={photo.url} className="h-full w-full object-cover" alt={req.label}/>:<div className="grid h-full place-items-center"><Camera size={24} className="text-slate-300"/></div>}</div><div className="p-3"><div className="flex justify-between"><strong className="text-xs">{req.label}</strong>{photo&&<Check size={14} className="text-emerald-600"/>}</div><p className="mt-1 text-[10px] text-slate-500">{photo?'Toque para refazer':req.hint}</p></div></button>;})}</div>
          <button onClick={()=>choosePhoto('damage')} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 text-xs font-black text-amber-700"><Camera size={15}/>FOTO EXTRA DE AVARIA</button>
          {!!photos.filter(p=>p.category==='damage').length&&<div className="mt-3 grid grid-cols-3 gap-2">{photos.filter(p=>p.category==='damage').map(photo=><div key={photo.id} className="relative overflow-hidden rounded-xl border"><img src={photo.url} className="aspect-square w-full object-cover" alt="Avaria"/><button onClick={()=>void removePhoto(photo)} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white"><Trash2 size={13}/></button></div>)}</div>}
        </div>}

        {step===2&&<div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><Wrench size={18} className="text-amber-600"/><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-amber-700">3 · AVARIAS</p><h2 className="mt-1 text-lg font-semibold">O que impacta preparação?</h2></div></div>
          <div className="mt-4 space-y-3"><input value={damageDescription} onChange={e=>setDamageDescription(e.target.value)} placeholder="Ex.: risco forte porta traseira" className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm"/><input value={damageCost} onChange={e=>setDamageCost(e.target.value)} inputMode="decimal" placeholder="Custo estimado em R$" className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm"/><button onClick={()=>void addDamage()} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-sm font-black text-white"><Plus size={16}/>ADICIONAR AVARIA</button></div>
          <div className="mt-4 space-y-2">{damages.map(item=><div key={item.id} className="flex items-start justify-between rounded-2xl border p-3"><div><p className="text-sm font-semibold">{item.description}</p><p className="mt-1 text-xs font-bold text-amber-700">{money(item.cost)}</p></div><button onClick={()=>void removeDamage(item.id)} className="grid h-8 w-8 place-items-center rounded-lg border"><Trash2 size={14}/></button></div>)}</div>
          <div className="mt-4 rounded-2xl bg-slate-950 p-4 text-white"><p className="text-[9px] font-black uppercase text-slate-400">TOTAL ESTIMADO</p><p className="mt-1 text-2xl font-semibold text-amber-300">{money(damageTotal(damages))}</p></div>
        </div>}

        {step===3&&<div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-emerald-700">4 · REVISÃO</p><h2 className="mt-1 text-xl font-semibold">Pronto para a Mesa?</h2>
          <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Fotos</span><strong className={'mt-1 block '+(missing.length?'text-red-600':'text-emerald-700')}>{requiredDone}/{requiredPhotos.length}</strong></div><div className="rounded-2xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Avarias</span><strong className="mt-1 block">{damages.length} · {money(damageTotal(damages))}</strong></div></div>
          {!!missing.length&&<div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">Faltam: {missing.map(item=>item.label).join(', ')}.</div>}
          <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-950"><strong>Ao enviar:</strong> a inspeção fica bloqueada e entra em <strong>Aguardando precificação</strong>. A Mesa recebe fotos, avarias e laudo. O avaliador não aprova a compra.</div>
          <button disabled={busy==='finish'||!!missing.length} onClick={()=>void finishInspection()} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-black text-white disabled:opacity-40"><Send size={17}/>{busy==='finish'?'ENVIANDO...':'ENVIAR PARA MESA DE PRECIFICAÇÃO'}</button>
        </div>}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur"><div className="mx-auto grid max-w-xl grid-cols-2 gap-2"><button disabled={step===0} onClick={()=>setStep(Math.max(0,step-1))} className="flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-bold disabled:opacity-30"><ChevronLeft size={16}/>VOLTAR</button><button disabled={step===3} onClick={()=>setStep(Math.min(3,step+1))} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-bold text-white disabled:opacity-30">AVANÇAR<ChevronRight size={16}/></button></div></nav>
    </div>;
  }

  return <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-4"><div className="mx-auto flex max-w-xl items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-700">MOTYQ IQ</p><h1 className="text-xl font-semibold">Minhas avaliações</h1><p className="mt-1 text-xs text-slate-500">{user.name} · inspeção móvel</p></div><button onClick={()=>signOut(auth)} className="grid h-10 w-10 place-items-center rounded-xl border"><LogOut size={16}/></button></div></header>
    <main className="mx-auto max-w-xl p-4">
      {error&&<div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="mb-4 grid grid-cols-2 rounded-2xl border bg-white p-1"><button onClick={()=>setTab('new')} className={'h-11 rounded-xl text-sm font-bold '+(tab==='new'?'bg-slate-950 text-white':'text-slate-500')}>Novas · {newItems.length}</button><button onClick={()=>setTab('mine')} className={'h-11 rounded-xl text-sm font-bold '+(tab==='mine'?'bg-slate-950 text-white':'text-slate-500')}>Em andamento · {mine.length}</button></div>
      {!list.length?<div className="grid min-h-56 place-items-center rounded-[24px] border border-dashed bg-white p-8 text-center"><div><RefreshCw size={26} className="mx-auto text-slate-300"/><p className="mt-3 font-semibold">{tab==='new'?'Nenhuma avaliação nova':'Nenhuma inspeção em andamento'}</p><p className="mt-1 text-sm text-slate-500">A fila atualiza automaticamente.</p></div></div>:<div className="space-y-3">{list.map(item=><article key={item.id} className="rounded-[24px] border bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><div><p className="font-mono text-xl font-black">{item.plate}</p><p className="mt-1 text-sm font-semibold">{item.vehicle||'Veículo a identificar'}{item.year?' · '+item.year:''}</p><p className="mt-1 text-xs text-slate-500">Vendedor: {item.requesterName||item.requesterEmail}</p></div><span className={'rounded-full border px-2 py-1 text-[9px] font-black '+(item.status==='requested'?'border-amber-200 bg-amber-50 text-amber-700':'border-sky-200 bg-sky-50 text-sky-700')}>{item.status==='requested'?'NOVA':'EM INSPEÇÃO'}</span></div><button disabled={!!busy} onClick={()=>void openInspection(item)} className={'mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-black text-white '+(item.status==='requested'?'bg-cyan-600':'bg-slate-950')}><ClipboardCheck size={16}/>{busy===item.id?'ABRINDO...':item.status==='requested'?'ACEITAR AVALIAÇÃO':'CONTINUAR INSPEÇÃO'}</button></article>)}</div>}
      <div className="mt-6"><EvaluatorHistory companyId={companyId} storeId={storeId}/></div>
    </main>
  </div>;
};
export default EvaluatorMobileInspection;
