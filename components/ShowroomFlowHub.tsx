import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Bell, LogOut, Pause, Play, RefreshCw, Search, Store, UserMinus, UsersRound, X } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { ShowroomPassage, ShowroomPassageOrigin, ShowroomPassageStatus, ShowroomQueueReason, ShowroomQueueSeller, ShowroomQueueState, User } from '../types';
import { showroomFlowService } from '../services/showroomFlowService';
import { userService } from '../services/userService';

type Props={currentUser:User;companyId:string;storeId:string;storeName:string};
const STATUS:Record<ShowroomPassageStatus,string>={waiting:'Aguardando vendedor',in_service:'Em atendimento',evaluation:'Avaliação',proposal:'Proposta',follow_up:'Retorno',sale:'Venda',no_deal:'Sem negócio'};
const REASON:Record<ShowroomQueueReason,string>={busy:'Outro atendimento',lunch:'Almoço',away:'Fora da loja',other:'Outro'};
const ORIGIN:Record<ShowroomPassageOrigin,string>={walk_in:'PASSAGEM',requested:'PEDIDO'};
const BUSY_REQUESTED_STATUSES=new Set<ShowroomPassageStatus>(['waiting','in_service','evaluation','proposal']);
const phoneMask=(raw:string)=>{const v=String(raw||'').replace(/\D/g,'').slice(0,11);if(v.length<=2)return v;if(v.length<=6)return `(${v.slice(0,2)}) ${v.slice(2)}`;if(v.length<=10)return `(${v.slice(0,2)}) ${v.slice(2,6)}-${v.slice(6)}`;return `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;};
const mins=(iso?:string)=>iso?Math.max(0,Math.floor((Date.now()-new Date(iso).getTime())/60000)):0;
const todayLocal=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const isToday=(iso:string)=>iso?.slice(0,10)===todayLocal();
const emailKey=(value:string)=>String(value||'').trim().toLowerCase();
const timeLabel=(iso:string)=>new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const originOf=(item:ShowroomPassage):ShowroomPassageOrigin=>item.origin==='requested'?'requested':'walk_in';
const isPaused=(queue:ShowroomQueueState|null,email:string)=>Boolean(queue?.pausedSellers?.some(item=>emailKey(item.email)===emailKey(email)));
const sellerMap=(queue:ShowroomQueueState|null)=>new Map((queue?.sellers||[]).map(seller=>[emailKey(seller.email),seller]));
const orderedSellers=(queue:ShowroomQueueState|null):ShowroomQueueSeller[]=>{
  if(!queue)return[];
  const map=sellerMap(queue);const used=new Set<string>();const result:ShowroomQueueSeller[]=[];
  const order=(queue.turnOrder?.length?queue.turnOrder:queue.sellers.map(item=>item.email));
  [...order,...queue.sellers.map(item=>item.email)].forEach(email=>{const key=emailKey(email);const seller=map.get(key);if(seller&&!used.has(key)){used.add(key);result.push(seller);}});
  return result;
};
const requestedBusyEmails=(passages:ShowroomPassage[])=>new Set(passages.filter(item=>originOf(item)==='requested'&&BUSY_REQUESTED_STATUSES.has(item.status)).map(item=>emailKey(item.assignedSellerEmail)));
const nextSellerFromQueue=(queue:ShowroomQueueState|null,busy:Set<string>=new Set())=>orderedSellers(queue).find(seller=>seller.available&&!isPaused(queue,seller.email)&&!busy.has(emailKey(seller.email)))||null;

const ShowroomFlowHub:React.FC<Props>=({currentUser,companyId,storeId,storeName})=>{
  const[queue,setQueue]=useState<ShowroomQueueState|null>(null);
  const[passages,setPassages]=useState<ShowroomPassage[]>([]);
  const[open,setOpen]=useState(false);
  const[tick,setTick]=useState(0);
  const previousWaiting=useRef(new Set<string>());
  const isReception=currentUser.role==='reception';
  const isManager=currentUser.role==='admin'||currentUser.role==='manager';
  const isSeller=currentUser.role==='seller'||currentUser.role==='user';

  useEffect(()=>{
    if(!storeId)return;
    const uq=isSeller?()=>{}:showroomFlowService.subscribeQueue(companyId,storeId,setQueue,console.error);
    const up=isSeller
      ? showroomFlowService.subscribeSellerPassages(companyId,storeId,currentUser.email,setPassages,console.error)
      : showroomFlowService.subscribeStorePassages(companyId,storeId,setPassages,console.error);
    return()=>{uq();up();};
  },[companyId,storeId,currentUser.email,isSeller]);

  useEffect(()=>{const id=setInterval(()=>setTick(v=>v+1),30000);return()=>clearInterval(id);},[]);
  const today=useMemo(()=>passages.filter(item=>isToday(item.createdAt)),[passages,tick]);
  const waiting=useMemo(()=>today.filter(item=>item.status==='waiting').sort((a,b)=>a.createdAt.localeCompare(b.createdAt)),[today]);

  useEffect(()=>{
    if(!isSeller)return;
    const current=new Set(waiting.map(item=>item.id));
    const fresh=waiting.find(item=>!previousWaiting.current.has(item.id));
    if(fresh&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
      new Notification(originOf(fresh)==='requested'?'Cliente pediu por você':'Nova passagem para você',{body:`${fresh.customerName} · Interesse: ${fresh.interestModel||'não informado'}`});
    }
    previousWaiting.current=current;
  },[waiting,isSeller]);

  if(isReception)return <ReceptionScreen currentUser={currentUser} companyId={companyId} storeId={storeId} storeName={storeName} queue={queue} passages={today}/>;
  return <>{isSeller&&<SellerFlow currentUser={currentUser} items={today} waiting={waiting} open={open} setOpen={setOpen}/>} {isManager&&<ManagerFlow currentUser={currentUser} companyId={companyId} storeId={storeId} storeName={storeName} queue={queue} items={today} open={open} setOpen={setOpen}/>}</>;
};

const ReceptionScreen=({currentUser,companyId,storeId,storeName,queue,passages}:{currentUser:User;companyId:string;storeId:string;storeName:string;queue:ShowroomQueueState|null;passages:ShowroomPassage[]})=>{
  const[name,setName]=useState('');
  const[phone,setPhone]=useState('');
  const[model,setModel]=useState('');
  const[origin,setOrigin]=useState<ShowroomPassageOrigin>('walk_in');
  const[requestedSeller,setRequestedSeller]=useState('');
  const[saving,setSaving]=useState(false);
  const[message,setMessage]=useState('');
  const[reasonOpen,setReasonOpen]=useState(false);
  const[queueBusy,setQueueBusy]=useState(false);
  const busyByRequest=useMemo(()=>requestedBusyEmails(passages),[passages]);
  const nextSeller=useMemo(()=>nextSellerFromQueue(queue,busyByRequest),[queue,busyByRequest]);
  const roster=useMemo(()=>orderedSellers(queue),[queue]);

  const register=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!name.trim()||phone.replace(/\D/g,'').length<8){setMessage('Preencha nome e telefone do cliente.');return;}
    if(origin==='requested'&&!requestedSeller){setMessage('Selecione o vendedor pedido pelo cliente.');return;}
    setSaving(true);setMessage('');
    try{
      const item=await showroomFlowService.createPassage({companyId,storeId,customerName:name,phone,interestModel:model,origin,requestedSellerEmail:requestedSeller,createdBy:currentUser.email,createdByName:currentUser.name});
      setMessage(origin==='requested'?`Pedido registrado para ${item.assignedSellerName}. A fila foi preservada.`:`Passagem direcionada para ${item.assignedSellerName}.`);
      setName('');setPhone('');setModel('');setRequestedSeller('');setOrigin('walk_in');
    }catch(error:any){setMessage(error?.message||'Não foi possível registrar o atendimento.');}
    finally{setSaving(false);}
  };

  const unavailable=async(reason:ShowroomQueueReason)=>{
    if(!nextSeller||queueBusy)return;
    setQueueBusy(true);setMessage('');
    try{
      if(reason==='busy'){
        await showroomFlowService.skipSellerOnce({companyId,storeId,sellerEmail:nextSeller.email,actorEmail:currentUser.email,actorName:currentUser.name,reason});
        setMessage(`${nextSeller.name} pulado nesta passagem e movido para o fim da rodada.`);
      }else{
        await showroomFlowService.pauseSeller({companyId,storeId,sellerEmail:nextSeller.email,actorEmail:currentUser.email,actorName:currentUser.name,reason});
        setMessage(`${nextSeller.name} pausado: ${REASON[reason]}.`);
      }
      setReasonOpen(false);
    }catch(error:any){setMessage(error?.message||'Não foi possível alterar a fila.');}
    finally{setQueueBusy(false);}
  };

  const resume=async(email:string,name:string)=>{
    if(queueBusy)return;setQueueBusy(true);setMessage('');
    try{await showroomFlowService.resumeSeller({companyId,storeId,sellerEmail:email,actorEmail:currentUser.email,actorName:currentUser.name});setMessage(`${name} voltou para a fila na posição preservada.`);}
    catch(error:any){setMessage(error?.message||'Não foi possível reativar o vendedor.');}
    finally{setQueueBusy(false);}
  };

  const success=message.includes('direcionada')||message.includes('registrado')||message.includes('voltou')||message.includes('pulado')||message.includes('pausado');

  return <div className="fixed inset-0 z-[500] overflow-y-auto bg-[#070708] text-white">
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#09090b]/95 px-6 py-4 backdrop-blur">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-300 text-black"><Store size={20}/></div><div><p className="text-xs font-bold uppercase tracking-[.16em] text-amber-300">ShowroomFlow · Recepção</p><h1 className="text-xl font-semibold">{storeName}</h1></div></div>
      <button onClick={()=>signOut(auth)} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-400 hover:text-white"><LogOut size={16}/> Sair</button>
    </header>
    <main className="mx-auto grid max-w-7xl gap-5 p-5 lg:grid-cols-[.88fr_1.12fr] lg:p-8">
      <section className="rounded-[30px] border border-white/10 bg-white/[.025] p-6">
        <p className="text-xs font-bold uppercase tracking-[.15em] text-zinc-500">Novo atendimento</p>
        <h2 className="mt-2 text-3xl font-semibold">Cliente chegou? Registre aqui.</h2>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/20 p-1.5">
          <button type="button" onClick={()=>{setOrigin('walk_in');setRequestedSeller('');setMessage('');}} className={`rounded-xl px-3 py-3 text-xs font-bold transition ${origin==='walk_in'?'bg-emerald-300 text-black':'text-zinc-400 hover:text-white'}`}>PASSAGEM</button>
          <button type="button" onClick={()=>{setOrigin('requested');setMessage('');}} className={`rounded-xl px-3 py-3 text-xs font-bold transition ${origin==='requested'?'bg-violet-300 text-black':'text-zinc-400 hover:text-white'}`}>PEDIDO DE VENDEDOR</button>
        </div>

        {origin==='walk_in'?<div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/[.04] p-4">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs text-zinc-500">PRÓXIMO DA FILA</p><p className="mt-1 text-xl font-semibold text-emerald-300">{nextSeller?.name||'Fila sem vendedor disponível'}</p>{nextSeller&&busyByRequest.size>0&&<p className="mt-1 text-[10px] text-zinc-500">Vendedores em pedido são pulados sem perder a posição.</p>}</div>{nextSeller&&<button type="button" onClick={()=>setReasonOpen(v=>!v)} className="rounded-xl border border-amber-300/20 bg-amber-300/[.06] px-3 py-2 text-xs font-semibold text-amber-200">Indisponível agora</button>}</div>
          {reasonOpen&&nextSeller&&<div className="mt-4 border-t border-white/10 pt-4"><p className="mb-2 text-xs text-zinc-500">Pedidos já são detectados automaticamente. Use abaixo apenas para outras indisponibilidades.</p><div className="grid grid-cols-2 gap-2"><ReasonButton label="Outro atendimento" hint="Consome a vez e vai ao fim" onClick={()=>unavailable('busy')} disabled={queueBusy}/><ReasonButton label="Almoço" hint="Pausa e preserva posição" onClick={()=>unavailable('lunch')} disabled={queueBusy}/><ReasonButton label="Fora da loja" hint="Pausa e preserva posição" onClick={()=>unavailable('away')} disabled={queueBusy}/><ReasonButton label="Outro" hint="Pausa e preserva posição" onClick={()=>unavailable('other')} disabled={queueBusy}/></div></div>}
        </div>:<div className="mt-4 rounded-2xl border border-violet-400/20 bg-violet-400/[.04] p-4"><p className="text-xs text-zinc-500">PEDIDO DE VENDEDOR</p><p className="mt-1 text-sm text-zinc-300">O cliente escolhe o vendedor. Este atendimento <strong className="text-violet-200">não consome a vez da passagem</strong>.</p><select value={requestedSeller} onChange={e=>setRequestedSeller(e.target.value)} className="mt-3 h-12 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white"><option value="">Selecione o vendedor pedido</option>{roster.map(seller=><option key={seller.email} value={seller.email}>{seller.name}{busyByRequest.has(emailKey(seller.email))?' · já em pedido':''}{isPaused(queue,seller.email)?' · pausado':''}</option>)}</select></div>}

        {Boolean(queue?.pausedSellers?.length)&&<div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-zinc-600">Pausados temporariamente</p><div className="mt-2 space-y-2">{queue!.pausedSellers.map(item=><div key={item.email} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2"><div><p className="text-sm font-semibold text-white">{item.name}</p><p className="text-[10px] text-zinc-600">{REASON[item.reason]} · desde {timeLabel(item.pausedAt)}</p></div><button disabled={queueBusy} onClick={()=>resume(item.email,item.name)} className="rounded-lg border border-emerald-400/20 px-2.5 py-1.5 text-[10px] font-bold text-emerald-300 disabled:opacity-40">REATIVAR</button></div>)}</div></div>}

        <form onSubmit={register} className="mt-6 space-y-4">
          <Field label="Nome do cliente" value={name} onChange={setName} placeholder="Nome e sobrenome" autoFocus/>
          <Field label="Telefone" value={phoneMask(phone)} onChange={v=>setPhone(v.replace(/\D/g,''))} placeholder="(15) 99999-9999"/>
          <Field label="Modelo de interesse" value={model} onChange={setModel} placeholder="Ex.: T-Cross, Creta, SUV..."/>
          <div><label className="mb-1 block text-xs font-semibold uppercase text-zinc-500">Vendedor responsável</label><div className="flex h-12 items-center rounded-xl border border-white/10 bg-black/30 px-4 text-sm font-semibold text-white">{origin==='requested'?(roster.find(s=>emailKey(s.email)===emailKey(requestedSeller))?.name||'Selecione acima'):(nextSeller?.name||'Nenhum vendedor disponível')}</div></div>
          <button disabled={saving||(origin==='walk_in'&&!nextSeller)||(origin==='requested'&&!requestedSeller)} className={`w-full rounded-xl px-5 py-3 font-bold text-black disabled:opacity-40 ${origin==='requested'?'bg-violet-300':'bg-amber-300'}`}>{saving?'Registrando...':origin==='requested'?'Registrar pedido':'Registrar passagem'}</button>
          {message&&<p className={`rounded-xl border p-3 text-sm ${success?'border-emerald-400/20 bg-emerald-400/[.05] text-emerald-300':'border-amber-400/20 bg-amber-400/[.05] text-amber-300'}`}>{message}</p>}
        </form>
      </section>

      <section className="rounded-[30px] border border-white/10 bg-white/[.025] p-6">
        <div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-zinc-500">Movimento de hoje</p><h2 className="mt-2 text-2xl font-semibold">{passages.length} atendimento(s)</h2></div><div className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-500">tempo real</div></div>
        <div className="mt-5 max-h-[68vh] space-y-2 overflow-y-auto pr-1">{passages.map(item=><PassageCard key={item.id} item={item}/>)}{!passages.length&&<Empty text="Nenhum atendimento registrado hoje."/>}</div>
      </section>
    </main>
  </div>;
};

const SellerFlow=({currentUser,items,waiting,open,setOpen}:{currentUser:User;items:ShowroomPassage[];waiting:ShowroomPassage[];open:boolean;setOpen:(v:boolean)=>void})=>{
  const current=waiting[0];const[action,setAction]=useState<string>('');
  const assume=async(item:ShowroomPassage)=>{setAction(item.id);try{await showroomFlowService.assumePassage(item);}finally{setAction('');}};
  const enableNotifications=async()=>{if(typeof Notification!=='undefined')await Notification.requestPermission();};
  return <>
    <button onClick={()=>setOpen(true)} title="ShowroomFlow" className="fixed right-5 z-[139] grid h-12 w-12 place-items-center rounded-full border border-violet-400/25 bg-zinc-950/95 text-violet-300 shadow-2xl" style={{bottom:440}}><Bell size={18}/>{waiting.length>0&&<span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{waiting.length}</span>}</button>
    {current&&<div className="fixed left-1/2 top-20 z-[360] w-[calc(100%-24px)] max-w-md -translate-x-1/2 rounded-[26px] border border-violet-400/30 bg-zinc-950 p-5 shadow-2xl"><div className="flex items-start justify-between"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.15em] text-violet-300"><Bell size={14}/> {originOf(current)==='requested'?'CLIENTE PEDIU POR VOCÊ':'NOVA PASSAGEM PARA VOCÊ'}</p><div className="mt-3 flex items-center gap-2"><OriginBadge origin={originOf(current)}/><h3 className="text-2xl font-semibold text-white">{current.customerName}</h3></div><p className="mt-1 text-sm text-zinc-400">Interesse: {current.interestModel||'não informado'}</p><p className="mt-1 text-xs text-zinc-600">Chegou há {mins(current.createdAt)} min · {phoneMask(current.phone)}</p>{originOf(current)==='requested'&&<p className="mt-2 text-xs text-violet-300">Sua posição na fila de passagens fica preservada enquanto este pedido estiver ativo.</p>}</div><button onClick={()=>setOpen(true)} className="text-zinc-600 hover:text-white"><UsersRound size={18}/></button></div><button disabled={action===current.id} onClick={()=>assume(current)} className="mt-5 w-full rounded-xl bg-violet-300 py-3 text-sm font-bold text-black">{action===current.id?'Assumindo...':'ASSUMIR ATENDIMENTO'}</button></div>}
    {open&&<FlowModal title="Meus clientes" subtitle={currentUser.name} onClose={()=>setOpen(false)}><div className="mb-4 flex justify-end"><button onClick={enableNotifications} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-400">Ativar avisos do navegador</button></div><div className="space-y-2">{items.map(item=><SellerPassage key={item.id} item={item}/>)}{!items.length&&<Empty text="Nenhum cliente atribuído hoje."/>}</div></FlowModal>}
  </>;
};

const SellerPassage=({item}:{item:ShowroomPassage})=>{
  const[busy,setBusy]=useState(false);
  const setStatus=async(status:ShowroomPassageStatus)=>{setBusy(true);try{if(status==='in_service')await showroomFlowService.assumePassage(item);else await showroomFlowService.finishPassage(item,status as any);}finally{setBusy(false);}};
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><OriginBadge origin={originOf(item)}/><p className="font-semibold text-white">{item.customerName}</p></div><p className="mt-1 text-sm text-zinc-500">{item.interestModel||'Interesse não informado'} · {phoneMask(item.phone)}</p><p className="mt-1 text-xs text-zinc-600">{STATUS[item.status]} · {item.status==='waiting'?`${mins(item.createdAt)} min aguardando`:item.assumedAt?`assumido às ${timeLabel(item.assumedAt)}`:''}</p>{originOf(item)==='requested'&&BUSY_REQUESTED_STATUSES.has(item.status)&&<p className="mt-1 text-[10px] text-violet-300">Pedido ativo · sua vez de passagem está preservada</p>}</div><select disabled={busy} value={item.status} onChange={e=>setStatus(e.target.value as ShowroomPassageStatus)} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white"><option value="waiting">Aguardando</option><option value="in_service">Em atendimento</option><option value="evaluation">Avaliação</option><option value="proposal">Proposta</option><option value="follow_up">Retorno</option><option value="sale">Venda</option><option value="no_deal">Sem negócio</option></select></div></div>;
};

const ManagerFlow=({currentUser,companyId,storeId,storeName,queue,items,open,setOpen}:{currentUser:User;companyId:string;storeId:string;storeName:string;queue:ShowroomQueueState|null;items:ShowroomPassage[];open:boolean;setOpen:(v:boolean)=>void})=>{
  const[syncing,setSyncing]=useState(false);const[search,setSearch]=useState('');const[recName,setRecName]=useState('');const[recEmail,setRecEmail]=useState('');const[msg,setMsg]=useState('');
  const waiting=items.filter(i=>i.status==='waiting');const inService=items.filter(i=>i.status==='in_service');const sales=items.filter(i=>i.status==='sale');const walkIns=items.filter(i=>originOf(i)==='walk_in');const requests=items.filter(i=>originOf(i)==='requested');
  const avgWait=items.filter(i=>i.assumedAt).length?Math.round(items.filter(i=>i.assumedAt).reduce((s,i)=>s+Math.max(0,(new Date(i.assumedAt!).getTime()-new Date(i.createdAt).getTime())/60000),0)/items.filter(i=>i.assumedAt).length):0;
  const filtered=items.filter(item=>`${item.customerName} ${item.phone} ${item.interestModel} ${item.assignedSellerName} ${ORIGIN[originOf(item)]}`.toLowerCase().includes(search.toLowerCase()));
  const busyByRequest=useMemo(()=>requestedBusyEmails(items),[items]);
  const actualNext=useMemo(()=>nextSellerFromQueue(queue,busyByRequest),[queue,busyByRequest]);
  const roster=useMemo(()=>orderedSellers(queue),[queue]);

  const sync=async()=>{setSyncing(true);try{const users=await userService.getAll(companyId,storeId);await showroomFlowService.syncQueue(companyId,storeId,users);}finally{setSyncing(false);}};
  const createReception=async()=>{if(!recName.trim()||!recEmail.includes('@'))return;setMsg('');try{const user:any={id:recEmail.trim().toLowerCase(),email:recEmail.trim().toLowerCase(),name:recName.trim(),role:'reception',status:'active',createdAt:new Date().toISOString(),companyId,storeId};if(currentUser.companyPlan)user.companyPlan=currentUser.companyPlan;if(currentUser.companyStatus)user.companyStatus=currentUser.companyStatus;if(currentUser.companyModuleOverrides)user.companyModuleOverrides=currentUser.companyModuleOverrides;await userService.save(user);setMsg('Usuário de recepção criado. Ele pode entrar com este e-mail.');setRecName('');setRecEmail('');}catch(error:any){setMsg(error?.message||'Não foi possível criar o usuário.');}};
  const managerResume=async(email:string)=>{await showroomFlowService.resumeSeller({companyId,storeId,sellerEmail:email,actorEmail:currentUser.email,actorName:currentUser.name});};
  const removeSeller=async(seller:ShowroomQueueSeller)=>{if(!window.confirm(`Retirar ${seller.name} da fila do ShowroomFlow?`))return;await showroomFlowService.removeSellerFromQueue({companyId,storeId,sellerEmail:seller.email,actorEmail:currentUser.email,actorName:currentUser.name});};

  return <>
    <button onClick={()=>setOpen(true)} title="ShowroomFlow · passagens" className="fixed right-5 z-[139] grid h-12 w-12 place-items-center rounded-full border border-violet-400/25 bg-zinc-950/95 text-violet-300 shadow-2xl" style={{bottom:440}}><UsersRound size={18}/>{waiting.length>0&&<span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{waiting.length}</span>}</button>
    {open&&<FlowModal title="ShowroomFlow · Passagens" subtitle={storeName} onClose={()=>setOpen(false)}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Kpi label="Atendimentos" value={items.length}/><Kpi label="Passagens" value={walkIns.length}/><Kpi label="Pedidos" value={requests.length} violet/><Kpi label="Aguardando" value={waiting.length} danger={waiting.some(i=>mins(i.createdAt)>=10)}/><Kpi label="Em atendimento" value={inService.length}/><Kpi label="Vendas" value={sales.length} good/></div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[.72fr_1.28fr]">
        <section className="rounded-[24px] border border-white/10 bg-white/[.025] p-4">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.13em] text-zinc-600">Fila da vez</p><p className="mt-1 text-sm text-zinc-400">Próximo: <span className="font-semibold text-violet-300">{actualNext?.name||'nenhum disponível'}</span> · média {avgWait} min para assumir</p></div><button onClick={sync} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-zinc-400"><RefreshCw size={14} className={syncing?'animate-spin':''}/></button></div>
          <div className="mt-4 space-y-2">{roster.map(seller=>{const pause=queue?.pausedSellers?.find(item=>emailKey(item.email)===emailKey(seller.email));const requestedBusy=busyByRequest.has(emailKey(seller.email));const isNext=emailKey(actualNext?.email||'')===emailKey(seller.email);return <div key={seller.email} className={`flex items-center gap-2 rounded-xl border p-3 ${isNext?'border-violet-400/25 bg-violet-400/[.05]':requestedBusy?'border-violet-400/20 bg-violet-400/[.03]':'border-white/10 bg-black/20'}`}><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{seller.name}</p><p className={`text-[10px] ${pause?'text-amber-300':requestedBusy?'text-violet-300':'text-zinc-600'}`}>{pause?`PAUSADO · ${REASON[pause.reason]}`:requestedBusy?'EM PEDIDO · POSIÇÃO PRESERVADA':isNext?'PRÓXIMO DA VEZ':seller.available?'Disponível':'Pausado pelo gestor'}</p></div><button onClick={()=>showroomFlowService.moveSeller(companyId,storeId,seller.email,-1)} className="text-zinc-600 hover:text-white"><ArrowUp size={14}/></button><button onClick={()=>showroomFlowService.moveSeller(companyId,storeId,seller.email,1)} className="text-zinc-600 hover:text-white"><ArrowDown size={14}/></button>{pause?<button title="Reativar pausa" onClick={()=>managerResume(seller.email)} className="text-emerald-300"><Play size={15}/></button>:<button title={seller.available?'Pausar vendedor':'Reativar vendedor'} onClick={()=>showroomFlowService.setSellerAvailability(companyId,storeId,seller.email,!seller.available)} className={seller.available?'text-zinc-500':'text-emerald-300'}>{seller.available?<Pause size={15}/>:<Play size={15}/>}</button>}<button title="Retirar da fila do ShowroomFlow" onClick={()=>removeSeller(seller)} className="text-zinc-600 hover:text-red-300"><UserMinus size={15}/></button></div>})}{!roster.length&&<Empty text="Fila ainda não configurada. Clique em atualizar para sincronizar os vendedores ativos."/>}</div>
          {Boolean(queue?.auditLog?.length)&&<div className="mt-5 border-t border-white/10 pt-4"><p className="text-xs font-bold uppercase tracking-[.13em] text-zinc-600">Movimentações da fila</p><div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">{queue!.auditLog.slice(0,10).map(item=><div key={item.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"><p className="text-xs text-zinc-300"><span className="font-semibold text-white">{item.sellerName}</span> {item.action==='skip_once'?'foi pulado nesta vez':item.action==='pause'?'foi pausado':item.action==='remove'?'foi retirado da fila':'voltou para a fila'}{item.reason?` · ${REASON[item.reason]}`:''}</p><p className="mt-1 text-[10px] text-zinc-600">{timeLabel(item.at)} · {item.byName||item.byEmail||'Sistema'}</p></div>)}</div></div>}
          {currentUser.role==='admin'&&<div className="mt-5 border-t border-white/10 pt-4"><p className="text-xs font-bold uppercase tracking-[.13em] text-zinc-600">Acesso da recepção</p><input value={recName} onChange={e=>setRecName(e.target.value)} placeholder="Nome da recepcionista" className="mt-3 h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none"/><input value={recEmail} onChange={e=>setRecEmail(e.target.value)} placeholder="E-mail" className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none"/><button onClick={createReception} className="mt-2 w-full rounded-xl bg-violet-300 py-2.5 text-xs font-bold text-black">Criar acesso Recepção</button>{msg&&<p className="mt-2 text-xs text-zinc-500">{msg}</p>}</div>}
        </section>
        <section className="rounded-[24px] border border-white/10 bg-white/[.025] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.13em] text-zinc-600">Acompanhamento</p><h3 className="mt-1 text-lg font-semibold text-white">Clientes de hoje</h3></div><div className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3"><Search size={14} className="text-zinc-600"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cliente, vendedor ou modelo" className="bg-transparent text-xs text-white outline-none"/></div></div><div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">{filtered.map(item=><PassageCard key={item.id} item={item}/>)}{!filtered.length&&<Empty text="Nenhum atendimento encontrado."/>}</div></section>
      </div>
    </FlowModal>}
  </>;
};

const ReasonButton=({label,hint,onClick,disabled}:{label:string;hint:string;onClick:()=>void;disabled?:boolean})=><button type="button" disabled={disabled} onClick={onClick} className="rounded-xl border border-white/10 bg-black/20 p-3 text-left transition hover:border-amber-300/25 hover:bg-amber-300/[.04] disabled:opacity-40"><p className="text-xs font-semibold text-white">{label}</p><p className="mt-1 text-[10px] text-zinc-600">{hint}</p></button>;
const OriginBadge=({origin}:{origin:ShowroomPassageOrigin})=><span className={`rounded-full px-2 py-1 text-[9px] font-black tracking-wide ${origin==='requested'?'bg-violet-400/15 text-violet-200':'bg-emerald-400/15 text-emerald-200'}`}>{ORIGIN[origin]}</span>;
const PassageCard=({item}:{item:ShowroomPassage})=><div className={`rounded-2xl border p-4 ${item.status==='waiting'&&mins(item.createdAt)>=10?'border-red-400/20 bg-red-400/[.04]':originOf(item)==='requested'?'border-violet-400/15 bg-violet-400/[.025]':'border-white/10 bg-black/20'}`}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><OriginBadge origin={originOf(item)}/><p className="font-semibold text-white">{item.customerName}</p>{item.status==='waiting'&&<span className="rounded-full bg-amber-400/10 px-2 py-1 text-[10px] font-bold text-amber-300">{mins(item.createdAt)} MIN</span>}</div><p className="mt-1 text-sm text-zinc-500">{item.interestModel||'Interesse não informado'} · {phoneMask(item.phone)}</p><p className="mt-1 text-xs text-zinc-600">Vendedor: {item.assignedSellerName}</p>{originOf(item)==='requested'&&BUSY_REQUESTED_STATUSES.has(item.status)&&<p className="mt-1 text-[10px] text-violet-300">Pedido ativo · vez da passagem preservada</p>}</div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${item.status==='sale'?'bg-emerald-400/10 text-emerald-300':item.status==='waiting'?'bg-amber-400/10 text-amber-300':'bg-violet-400/10 text-violet-300'}`}>{STATUS[item.status]}</span></div></div>;
const FlowModal=({title,subtitle,onClose,children}:{title:string;subtitle:string;onClose:()=>void;children:React.ReactNode})=><div className="fixed inset-0 z-[350] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={onClose}><div className="mx-auto max-w-7xl overflow-hidden rounded-[32px] border border-white/10 bg-zinc-950 shadow-2xl" onClick={e=>e.stopPropagation()}><header className="flex items-center justify-between border-b border-white/10 p-5 md:p-7"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-violet-300">ShowroomFlow</p><h2 className="mt-1 text-2xl font-semibold text-white">{title}</h2><p className="mt-1 text-sm text-zinc-500">{subtitle}</p></div><button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/[.05] text-zinc-400"><X size={18}/></button></header><div className="p-5 md:p-7">{children}</div></div></div>;
const Field=({label,value,onChange,placeholder,autoFocus}:{label:string;value:string;onChange:(v:string)=>void;placeholder:string;autoFocus?:boolean})=><div><label className="mb-1 block text-xs font-semibold uppercase text-zinc-500">{label}</label><input autoFocus={autoFocus} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-amber-300/40"/></div>;
const Empty=({text}:{text:string})=><div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-sm text-zinc-600">{text}</div>;
const Kpi=({label,value,danger,good,violet}:{label:string;value:number;danger?:boolean;good?:boolean;violet?:boolean})=><div className={`rounded-2xl border p-4 ${danger?'border-red-400/20 bg-red-400/[.04]':good?'border-emerald-400/20 bg-emerald-400/[.04]':violet?'border-violet-400/20 bg-violet-400/[.04]':'border-white/10 bg-white/[.025]'}`}><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold text-white">{value}</p></div>;
export default ShowroomFlowHub;