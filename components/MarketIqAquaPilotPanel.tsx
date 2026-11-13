import React,{useMemo,useState} from 'react';
import MarketIqAquaBuyersManager from './MarketIqAquaBuyersManager';
import {aquaCloudRequest} from '../services/motyqAquaCloudClient';
import type {ConsultedVehicle} from '../services/marketIqConsultedRepasse';
import {loadCotacaoBuyers,rankCotacaoBuyers,type BuyerProfile} from '../services/marketIqCotacaoMesaBuyers';
import {createAquaLot,loadAquaLots,saveAquaLots,simulateAquaBid,closeAquaLot,
 highestAquaBid,visibleAquaBidSummary,publicAquaVehicle,requestAquaBuyNow,resolveAquaBuyNow,type AquaLot,type AquaMode} from '../services/motyqAquaPilot';

type Props={scope:string;vehicle?:ConsultedVehicle;onClose:()=>void};
const money=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const dateInput=(hours:number)=>{const d=new Date(Date.now()+hours*3600000);return d.toISOString();};
export default function MarketIqAquaPilotPanel({scope,vehicle,onClose}:Props){
 const currentVehicle=vehicle||{plate:'',brand:'',model:'',year:'',km:'',fipe:0,vehicleType:'car' as const};
 const hasVehicle=Boolean(currentVehicle.brand.trim()&&currentVehicle.model.trim()&&currentVehicle.year.trim());
 const [buyers,setBuyers]=useState<BuyerProfile[]>(()=>loadCotacaoBuyers(scope));
 const [lots,setLots]=useState<AquaLot[]>(()=>loadAquaLots(scope));
 const [screen,setScreen]=useState<'mesa'|'lojista'|'cadastro'>('mesa');
 const [mode,setMode]=useState<AquaMode>('open');
 const [hours,setHours]=useState(24);
 const [autoSelect,setAutoSelect]=useState(true);
 const [manualInvites,setManualInvites]=useState<string[]>([]);
 const [showAdvanced,setShowAdvanced]=useState(false);
 const [notes,setNotes]=useState('');
 const [buyNowEnabled,setBuyNowEnabled]=useState(false);
 const [buyNowInput,setBuyNowInput]=useState('');
 const [activeId,setActiveId]=useState('');
 const [buyerId,setBuyerId]=useState('');
 const [bidAmount,setBidAmount]=useState('');
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const [publishing,setPublishing]=useState(false);
 const matches=useMemo(()=>rankCotacaoBuyers(buyers,currentVehicle,currentVehicle.vehicleType||'car'),[buyers,currentVehicle.brand,currentVehicle.model,currentVehicle.year,currentVehicle.vehicleType]);
 const eligible=buyers.filter(b=>b.active&&b.optedIn);
 const compatible=matches.filter(m=>eligible.some(b=>b.id===m.buyer.id)).map(m=>m.buyer.id);
 const invited=autoSelect?compatible:manualInvites;
 const current=lots.find(x=>x.id===activeId)||null;
 const viewedBuyer=buyers.find(x=>x.id===buyerId)||null;
 const summary=current&&buyerId?visibleAquaBidSummary(current,buyerId):null;
 const openLots=lots.filter(l=>l.state==='open'&&Date.parse(l.endsAt)>Date.now());
 const commit=(next:AquaLot[],text:string)=>{saveAquaLots(scope,next);setLots(next);setNotice(text);setError('');};
 const create=()=>{
  try{
   const valid=new Set(eligible.map(b=>b.id));
   if(invited.some(id=>!valid.has(id)))throw new Error('Escolha somente lojistas autorizados.');
   const lot=createAquaLot({
    vehicle:publicAquaVehicle({...currentVehicle,vehicleType:currentVehicle.vehicleType||'car'},notes),
    mode,endsAt:dateInput(hours),visibleBuyerIds:invited,minimumIncrement:500,
    buyNowPrice:buyNowEnabled?Number(buyNowInput):undefined
   });
   commit([lot,...lots],'Oportunidade de teste criada. Ainda não foi enviada aos lojistas.');
   setActiveId(lot.id);setScreen('mesa');setBuyerId('');setBidAmount('');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível criar a oportunidade.');}
 };
 const bid=()=>{
  if(!current||!viewedBuyer)return;
  try{
   const lot=simulateAquaBid(current,{id:viewedBuyer.id,shop:viewedBuyer.shop},Number(bidAmount));
   commit(lots.map(x=>x.id===lot.id?lot:x),'Lance simulado registrado neste navegador.');
   setBidAmount('');
  }catch(e){setError(e instanceof Error?e.message:'Lance inválido.');}
 };
 const publishOnline=async()=>{
  if(!current||current.cloudLotId||current.state!=='open')return;
  if(!window.confirm('Publicar este carro ONLINE para os lojistas habilitados e compatíveis? Os dados do veículo e o valor de arremate ficarão visíveis para eles.'))return;
  setPublishing(true);setError('');setNotice('');
  try{
   const result=await aquaCloudRequest<{lotId:string;invitedCount:number}>('publish',{
    lot:{vehicle:current.vehicle,mode:current.mode,endsAt:current.endsAt,
     visibleBuyerIds:current.visibleBuyerIds,...(current.buyNowPrice?{buyNowPrice:current.buyNowPrice}:{})}
   });
   const next=lots.map(l=>l.id===current.id?{...l,cloudLotId:result.lotId}:l);
   commit(next,'Publicado na nuvem para '+result.invitedCount+' lojista(s) habilitado(s). Este painel local ainda simula os lances.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível publicar online.');}
  finally{setPublishing(false);}
 };
 const buyNow=()=>{
  if(!current||!viewedBuyer||!current.buyNowPrice)return;
  if(!window.confirm('Simular solicitação de arremate de '+money(current.buyNowPrice)+'? Não é uma compra real.'))return;
  try{
   const lot=requestAquaBuyNow(current,{id:viewedBuyer.id,shop:viewedBuyer.shop});
   commit(lots.map(x=>x.id===lot.id?lot:x),'Solicitação fictícia registrada. A Mesa precisa analisar e confirmar. Outros lances ficaram bloqueados.');
   setScreen('mesa');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível solicitar o arremate.');}
 };
 const decideBuyNow=(decision:'approved'|'rejected')=>{
  if(!current||!window.confirm(decision==='approved'?'Aprovar esta solicitação apenas na simulação? Não registra venda.':'Recusar a solicitação simulada e liberar o carro se houver prazo?'))return;
  try{
   const lot=resolveAquaBuyNow(current,decision);
   commit(lots.map(x=>x.id===lot.id?lot:x),decision==='approved'?'Arremate confirmado somente no teste. O carro não foi vendido no sistema.':'Solicitação recusada no teste.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível processar a decisão.');}
 };
 const finish=()=>{
  if(!current||!window.confirm('Encerrar esta oportunidade de teste?'))return;
  try{const lot=closeAquaLot(current);commit(lots.map(x=>x.id===lot.id?lot:x),'Rodada encerrada. Nenhuma venda foi realizada.');}
  catch(e){setError(e instanceof Error?e.message:'Erro ao encerrar.');}
 };
 const small='rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800';
 return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-3" role="dialog" aria-modal="true" aria-label="Motyq AQUA teste simplificado">
  <section className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white text-slate-900">
   <header className="border-b border-slate-200 p-4">
    <div className="flex items-start justify-between gap-3">
     <div><p className="text-xs font-black tracking-wider text-cyan-800">MOTYQ AQUA · TESTE PRIVADO</p>
      <h2 className="text-xl font-black">Aquário de Oportunidades</h2>
      <p className="mt-1 text-xs text-slate-600">Operação simples, sem leilão real ou mensagens automáticas.</p></div>
     <button type="button" onClick={onClose} className={small}>Fechar</button>
    </div>
    <div className="mt-3 grid grid-cols-3 gap-2">
     <button type="button" onClick={()=>setScreen('mesa')}
      className={'rounded-xl p-3 text-sm font-black '+(screen==='mesa'?'bg-cyan-800 text-white':'bg-slate-100 text-slate-800')}>Minha Mesa</button>
     <button type="button" onClick={()=>setScreen('lojista')}
      className={'rounded-xl p-2 text-xs font-black sm:p-3 sm:text-sm '+(screen==='lojista'?'bg-cyan-800 text-white':'bg-slate-100 text-slate-800')}>Visão do lojista</button>
     <button type="button" onClick={()=>setScreen('cadastro')}
      className={'rounded-xl p-2 text-xs font-black sm:p-3 sm:text-sm '+(screen==='cadastro'?'bg-cyan-800 text-white':'bg-slate-100 text-slate-800')}>Meus lojistas</button>
    </div>
   </header>
   <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
    {screen==='cadastro'?<MarketIqAquaBuyersManager scope={scope} onSaved={setBuyers}/>:screen==='mesa'?<>
     <section className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <div><p className="text-xs font-bold text-slate-500">1. VEÍCULO</p>
       {hasVehicle?<><h3 className="text-lg font-black">{currentVehicle.brand} {currentVehicle.model} · {currentVehicle.year}</h3>
       <p className="text-sm text-slate-600">{currentVehicle.km||'KM não informada'} km · Informações copiadas da Mesa</p></>:
       <p className="mt-2 rounded-lg bg-cyan-50 p-3 text-sm text-cyan-950">Você pode consultar oportunidades e editar lojistas aqui. Para criar uma nova oportunidade, abra a avaliação do carro e clique em Colocar no Aquário.</p>}</div>
      <div><p className="mb-2 text-xs font-bold text-slate-500">2. COMO RECEBER OFERTAS?</p>
       <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={()=>setMode('open')} className={'rounded-xl border p-3 text-left '+(mode==='open'?'border-cyan-700 bg-cyan-50':'border-slate-200')}>
         <strong className="block text-sm">Disputa aberta</strong><span className="text-xs text-slate-600">Lojista vê o maior valor</span>
        </button>
        <button type="button" onClick={()=>setMode('sealed')} className={'rounded-xl border p-3 text-left '+(mode==='sealed'?'border-cyan-700 bg-cyan-50':'border-slate-200')}>
         <strong className="block text-sm">Oferta secreta</strong><span className="text-xs text-slate-600">Cada um envia a sua</span>
        </button>
       </div>
      </div>
      <div><p className="mb-2 text-xs font-bold text-slate-500">3. QUANDO TERMINA?</p>
       <div className="flex flex-wrap gap-2">{[2,6,24,48].map(h=><button type="button" key={h} onClick={()=>setHours(h)}
        className={'rounded-xl px-4 py-2 text-sm font-bold '+(hours===h?'bg-cyan-800 text-white':'border border-slate-300')}>{h}h</button>)}</div>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
       <label className="flex items-center gap-2 text-sm font-black text-emerald-950">
        <input type="checkbox" checked={buyNowEnabled} onChange={e=>setBuyNowEnabled(e.target.checked)}/>
        Permitir arremate imediato pelo valor definido pela Mesa
       </label>
       {buyNowEnabled&&<label className="mt-3 block text-xs font-bold text-emerald-950">Valor para arrematar (R$)
        <input type="number" min={1000} max={10000000} step={1} value={buyNowInput} onChange={e=>setBuyNowInput(e.target.value)}
         placeholder="Ex.: 95000" className="mt-1 w-full rounded-xl border border-emerald-400 bg-white p-3 text-base"/>
       </label>}
       <p className="mt-2 text-xs text-emerald-900">O lojista poderá solicitar o arremate nesse valor. A Mesa confirma antes de concluir. Sem compra automática.</p>
      </div>
      <div className="rounded-xl bg-slate-50 p-3">
       <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" checked={autoSelect} onChange={e=>setAutoSelect(e.target.checked)}/>
        Convidar automaticamente os lojistas compatíveis ({compatible.length})
       </label>
       {!autoSelect&&<div className="mt-2 max-h-32 space-y-1 overflow-auto">{eligible.map(b=><label key={b.id} className="flex items-center gap-2 py-1 text-xs">
        <input type="checkbox" checked={manualInvites.includes(b.id)} onChange={e=>setManualInvites(v=>e.target.checked?[...new Set([...v,b.id])]:v.filter(id=>id!==b.id))}/>{b.shop}
       </label>)}</div>}
       {!eligible.length&&<button type="button" onClick={()=>setScreen('cadastro')} className="mt-2 text-xs font-bold text-cyan-800">Cadastre seus lojistas aqui</button>}
       <button type="button" onClick={()=>setScreen('cadastro')} className="ml-2 mt-2 text-xs font-bold text-cyan-800">Cadastrar ou editar lojista</button>
       <button type="button" onClick={()=>setShowAdvanced(v=>!v)} className="mt-2 text-xs font-bold text-cyan-800">
        {showAdvanced?'Ocultar detalhes':'Adicionar observações (opcional)'}</button>
       {showAdvanced&&<textarea rows={2} maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}
        placeholder="Conservação, vistoria e observações sem dados pessoais"
        className="mt-2 w-full rounded-lg border border-slate-300 p-2 text-sm"/>}
      </div>
      <button type="button" onClick={create} disabled={!hasVehicle||!invited.length||(buyNowEnabled&&(!Number.isSafeInteger(Number(buyNowInput))||Number(buyNowInput)<1000))}
       className="w-full rounded-xl bg-emerald-700 p-4 text-base font-black text-white disabled:opacity-50">
       Colocar carro no Aquário de teste</button>
      <p className="text-xs text-slate-500">Não publica na internet. Placa, FIPE e custos internos não entram na oportunidade.</p>
     </section>
     <section className="space-y-2">
      <h3 className="text-sm font-black">Minhas oportunidades ({lots.length})</h3>
      {lots.map(l=><div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
       <button type="button" onClick={()=>setActiveId(l.id)} className="text-left">
        <strong className="block text-sm">{l.vehicle.brand} {l.vehicle.model} · {l.vehicle.year}</strong>
        <span className="text-xs text-slate-600">{l.mode==='open'?'Aberta':'Secreta'} · {l.bids.length} lance(s) fictício(s) · {l.state==='reserved'?'Aguardando Mesa':l.state==='open'?'Em andamento':'Encerrada'}</span>
        {l.buyNowPrice&&<span className="mt-1 block text-xs font-bold text-emerald-800">Arremate imediato: {money(l.buyNowPrice)}</span>}
       </button>
       <button type="button" onClick={()=>{setActiveId(l.id);setBuyerId('');setScreen('lojista');}} className={small}>Ver como lojista</button>
      </div>)}
      {current&&<div className="rounded-xl bg-slate-50 p-3 text-sm">
       <strong>Resultado: {current.vehicle.brand} {current.vehicle.model}</strong>
       <p className="mt-1">Lances simulados: {current.bids.length} · Maior lance: {highestAquaBid(current)?money(highestAquaBid(current)!.amount):'Nenhum'}</p>
       {current.cloudLotId?<p className="mt-2 text-xs font-black text-emerald-800">Publicado para lojistas habilitados · código {current.cloudLotId.slice(0,8)}</p>:
        current.state==='open'&&Date.parse(current.endsAt)>Date.now()&&<div className="mt-3 rounded-xl border border-cyan-300 bg-cyan-50 p-3">
         <p className="mb-2 text-xs text-cyan-900">Para publicar de verdade, habilite previamente os lojistas com e-mail na aba Meus lojistas.</p>
         <button type="button" disabled={publishing} onClick={()=>void publishOnline()} className="w-full rounded-xl bg-cyan-800 p-3 text-sm font-black text-white disabled:opacity-50">{publishing?'Publicando...':'Publicar online para lojistas'}</button>
        </div>}
       {current.cloudLotId&&<p className="mt-2 text-xs text-slate-600">A publicação na nuvem é independente da simulação local. Lances e arremates reais ainda não foram liberados.</p>}
       {current.buyNowRequest?.status==='pending'&&<div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
        <strong className="block text-sm text-amber-950">Solicitação de arremate pendente</strong>
        <p className="mt-1 text-xs text-amber-900">{current.buyNowRequest.buyerShop} · {money(current.buyNowRequest.amount)} · Exclusiva enquanto a Mesa decide</p>
        <div className="mt-3 flex flex-wrap gap-2">
         <button type="button" onClick={()=>decideBuyNow('approved')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white">Confirmar no teste</button>
         <button type="button" onClick={()=>decideBuyNow('rejected')} className="rounded-lg border border-slate-400 px-3 py-2 text-xs font-bold">Recusar e liberar</button>
        </div>
       </div>}
       {current.buyNowRequest?.status==='approved'&&<p className="mt-2 text-xs font-bold text-emerald-800">Arremate aprovado na simulação. Não é compra efetivada.</p>}
       {current.state==='open'&&<button type="button" onClick={finish} className="mt-2 text-xs font-bold text-rose-700">Encerrar oportunidade</button>}
      </div>}
     </section>
    </>:<>
     <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Esta é apenas a simulação do celular do comprador dentro da Mesa. Ainda não existe login externo nem disputa em tempo real.</p>
     <label className="block text-sm font-bold">Simular qual lojista?
      <select value={buyerId} onChange={e=>{setBuyerId(e.target.value);setActiveId('');}} className="mt-1 w-full rounded-xl border border-slate-300 p-3">
       <option value="">Escolha um lojista convidado</option>
       {eligible.map(b=><option key={b.id} value={b.id}>{b.shop}</option>)}
      </select>
     </label>
     {buyerId&&<>
      <h3 className="text-lg font-black">Oportunidades para sua loja</h3>
      {(lots.filter(l=>l.visibleBuyerIds.includes(buyerId))).map(l=><button type="button" key={l.id}
       onClick={()=>{setActiveId(l.id);setBidAmount('');}} className={'w-full rounded-xl border p-4 text-left '+(activeId===l.id?'border-cyan-600 bg-cyan-50':'border-slate-200')}>
       <strong className="block">{l.vehicle.brand} {l.vehicle.model} · {l.vehicle.year}</strong>
       <span className="mt-1 block text-sm text-slate-600">{l.vehicle.km} km · {l.mode==='open'?'Disputa aberta':'Oferta fechada'}</span>
       <span className="mt-1 block text-xs font-bold">{l.state==='reserved'?'Arremate em análise':l.state==='open'&&Date.parse(l.endsAt)>Date.now()?'Recebendo lances':'Encerrado'}</span>
       {l.buyNowPrice&&<span className="mt-1 block text-xs font-bold text-emerald-800">Arremate: {money(l.buyNowPrice)}</span>}
      </button>)}
      {!lots.some(l=>l.visibleBuyerIds.includes(buyerId))&&<p className="text-sm text-slate-600">Nenhuma oportunidade disponível para esta loja.</p>}
     </>}
     {current&&summary&&<section className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <strong className="text-lg">{current.vehicle.brand} {current.vehicle.model} {current.vehicle.year}</strong>
      <p className="text-sm text-slate-600">{current.vehicle.notes||'Confira as condições do veículo antes de ofertar.'}</p>
      <p className="text-sm font-bold">{current.mode==='open'?('Maior lance: '+(summary.highest?money(summary.highest):'Sem lances')):'Oferta secreta: outros lances ficam ocultos'}</p>
      <p className="text-xs text-slate-600">Suas ofertas: {summary.ownBids.length}</p>
      {current.buyNowPrice&&current.state==='open'&&Date.parse(current.endsAt)>Date.now()&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
       <p className="text-xs font-bold text-emerald-900">Preço para arremate imediato</p>
       <strong className="mt-1 block text-2xl text-emerald-950">{money(current.buyNowPrice)}</strong>
       <button type="button" onClick={buyNow} className="mt-3 w-full rounded-xl bg-emerald-700 p-4 text-base font-black text-white">Solicitar arremate agora</button>
       <p className="mt-2 text-xs text-emerald-900">Sujeito à confirmação da Mesa. Nesta versão, apenas simulação.</p>
      </div>}
      {current.state==='reserved'&&<p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">Arremate em análise pela Mesa. Novos lances bloqueados.</p>}
      {current.state==='open'&&Date.parse(current.endsAt)>Date.now()?<>
       <label className="block text-sm font-bold">Seu lance (R$)
        <input type="number" inputMode="numeric" value={bidAmount} min={1000} placeholder="Ex.: 85000"
         onChange={e=>setBidAmount(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-4 text-lg"/></label>
       <button type="button" onClick={bid} disabled={!bidAmount}
        className="w-full rounded-xl bg-emerald-700 p-4 text-base font-black text-white disabled:opacity-50">Simular meu lance</button>
      </>:<p className="text-sm font-bold text-slate-600">Prazo encerrado</p>}
     </section>}
    </>}
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-900">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{notice}</p>}
   </div>
  </section>
 </div>;
}
