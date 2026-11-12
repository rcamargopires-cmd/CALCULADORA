import React,{useMemo,useState} from 'react';
import type {ConsultedVehicle} from '../services/marketIqConsultedRepasse';
import {loadCotacaoBuyers,rankCotacaoBuyers,type BuyerProfile} from '../services/marketIqCotacaoMesaBuyers';
import {createAquaLot,loadAquaLots,saveAquaLots,simulateAquaBid,closeAquaLot,
 highestAquaBid,visibleAquaBidSummary,publicAquaVehicle,type AquaLot,type AquaMode} from '../services/motyqAquaPilot';

type Props={scope:string;vehicle:ConsultedVehicle;onClose:()=>void};
const money=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const formatDate=(v:string)=>new Date(v).toLocaleString('pt-BR');
const dateInput=(d:Date)=>{const n=new Date(d.getTime()-d.getTimezoneOffset()*60000);return n.toISOString().slice(0,16)};
export default function MarketIqAquaPilotPanel({scope,vehicle,onClose}:Props){
 const [buyers]=useState<BuyerProfile[]>(()=>loadCotacaoBuyers(scope));
 const [lots,setLots]=useState<AquaLot[]>(()=>loadAquaLots(scope));
 const [mode,setMode]=useState<AquaMode>('open');
 const [duration,setDuration]=useState(()=>dateInput(new Date(Date.now()+24*3600000)));
 const [invited,setInvited]=useState<string[]>([]);
 const [notes,setNotes]=useState('');
 const [minimumIncrement,setMinimumIncrement]=useState('500');
 const [activeId,setActiveId]=useState('');
 const [buyerId,setBuyerId]=useState('');
 const [bidAmount,setBidAmount]=useState('');
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const [buyerPreview,setBuyerPreview]=useState(false);
 const matching=useMemo(()=>rankCotacaoBuyers(buyers,vehicle,vehicle.vehicleType||'car'),[buyers,vehicle]);
 const eligible=buyers.filter(b=>b.active&&b.optedIn);
 const current=lots.find(x=>x.id===activeId)||null;
 const chosenBuyer=buyers.find(x=>x.id===buyerId);
 const commit=(next:AquaLot[],message:string)=>{
  saveAquaLots(scope,next);setLots(next);setNotice(message);setError('');
 };
 const launch=()=>{
  try{
   const available=new Set(eligible.map(b=>b.id));
   if(invited.some(id=>!available.has(id)))throw Error('Só lojistas ativos e autorizados podem receber oportunidades.');
   const increment=Number(minimumIncrement);
   const lot=createAquaLot({
    vehicle:publicAquaVehicle({...vehicle,vehicleType:vehicle.vehicleType||'car'},notes),
    mode,endsAt:new Date(duration).toISOString(),visibleBuyerIds:invited,minimumIncrement:increment
   });
   commit([lot,...lots],'Oportunidade criada no laboratório local. Não foi publicada para lojistas reais.');
   setActiveId(lot.id);setBuyerId('');setBidAmount('');setBuyerPreview(false);
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível criar a oportunidade.');}
 };
 const simulatedBid=()=>{
  if(!current||!chosenBuyer)return;
  try{
   const updated=simulateAquaBid(current,{id:chosenBuyer.id,shop:chosenBuyer.shop},Number(bidAmount));
   commit(lots.map(l=>l.id===updated.id?updated:l),'Lance fictício registrado somente no laboratório.');
   setBidAmount('');
  }catch(e){setError(e instanceof Error?e.message:'Lance inválido.');}
 };
 const finish=()=>{
  if(!current||!window.confirm('Encerrar esta rodada de teste? Os lances não podem ser reabertos.'))return;
  try{const updated=closeAquaLot(current);
   commit(lots.map(l=>l.id===updated.id?updated:l),'Rodada encerrada. Nenhuma compra ou venda foi realizada.');
  }catch(e){setError(e instanceof Error?e.message:'Falha ao encerrar.');}
 };
 const summary=current&&buyerId?visibleAquaBidSummary(current,buyerId):null;
 return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-3" role="dialog" aria-modal="true" aria-label="Motyq AQUA laboratório de oportunidades">
  <section className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white text-slate-900">
   <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
    <div><p className="text-xs font-black tracking-widest text-cyan-800">MOTYQ AQUA · LABORATÓRIO</p>
     <h2 className="text-xl font-black">Aquário de Oportunidades</h2>
     <p className="mt-1 text-xs text-slate-600">Teste privado neste navegador. Lojistas externos ainda não têm acesso; lances nesta tela são fictícios.</p></div>
    <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold">Fechar</button>
   </div>
   <div className="min-h-0 flex-1 overflow-y-auto p-4">
    <div className="grid gap-4 lg:grid-cols-2">
     <section className="space-y-3 rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-black">Nova oportunidade</h3>
      <p className="text-sm font-semibold">{vehicle.brand} {vehicle.model} · {vehicle.year} · {vehicle.km} km</p>
      <p className="text-xs text-slate-600">Placa, FIPE, valores internos e dados pessoais não são incluídos no lote.</p>
      <fieldset className="space-y-2"><legend className="text-xs font-black">Modelo de disputa</legend>
       <label className="flex items-center gap-2 text-sm"><input type="radio" checked={mode==='open'} onChange={()=>setMode('open')}/> Aberta: maior lance visível e incremento mínimo</label>
       <label className="flex items-center gap-2 text-sm"><input type="radio" checked={mode==='sealed'} onChange={()=>setMode('sealed')}/> Fechada: cada lojista vê apenas suas propostas</label>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
       <label className="text-xs font-bold">Encerramento<input type="datetime-local" value={duration} onChange={e=>setDuration(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 p-2"/></label>
       <label className="text-xs font-bold">Incremento na disputa aberta (R$)<input type="number" min={100} step={100} value={minimumIncrement} onChange={e=>setMinimumIncrement(e.target.value)}
        disabled={mode==='sealed'} className="mt-1 w-full rounded-lg border border-slate-300 p-2"/></label>
      </div>
      <label className="block text-xs font-bold">Observações públicas, sem dados pessoais
       <textarea rows={2} maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}
        placeholder="Ex.: conservação, detalhes de preparação, condições de vistoria"
        className="mt-1 w-full rounded-lg border border-slate-300 p-2"/></label>
      <div className="flex items-center justify-between gap-2"><strong className="text-xs">Lojistas convidados ({invited.length})</strong>
       <button type="button" className="text-xs font-black text-cyan-800" onClick={()=>
        setInvited(matching.filter(x=>eligible.some(b=>b.id===x.buyer.id)).map(x=>x.buyer.id))
       }>Selecionar compatíveis</button></div>
      <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
       {eligible.map(b=><label key={b.id} className="flex items-center gap-2 p-1 text-xs">
        <input type="checkbox" checked={invited.includes(b.id)}
         onChange={e=>setInvited(v=>e.target.checked?[...new Set([...v,b.id])]:v.filter(id=>id!==b.id))}/>
        {b.shop} {matching.some(x=>x.buyer.id===b.id)?'· compatível':''}
       </label>)}
       {!eligible.length&&<p className="text-xs text-amber-800">Não há lojistas ativos com autorização de contato nesta carteira.</p>}
      </div>
      <button type="button" onClick={launch} className="w-full rounded-xl bg-cyan-800 px-4 py-3 text-sm font-black text-white">
       Criar oportunidade de teste</button>
     </section>
     <section className="space-y-3 rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-black">Rodadas criadas ({lots.length})</h3>
      <div className="max-h-44 space-y-2 overflow-y-auto">
       {lots.map(l=><button type="button" key={l.id} onClick={()=>{setActiveId(l.id);setBuyerId('');setBuyerPreview(false);setNotice('');}}
        className={'w-full rounded-lg border p-3 text-left text-xs '+(current?.id===l.id?'border-cyan-700 bg-cyan-50':'border-slate-200')}>
        <span className="font-black">{l.vehicle.brand} {l.vehicle.model} · {l.vehicle.year}</span>
        <span className="block text-slate-600">{l.mode==='open'?'Disputa aberta':'Propostas fechadas'} · {l.state==='open'&&Date.parse(l.endsAt)<=Date.now()?'Prazo expirado':l.state==='open'?'Recebendo propostas':'Encerrada'} · {l.bids.length} lance(s) fictício(s)</span>
       </button>)}
       {!lots.length&&<p className="text-xs text-slate-600">Crie uma rodada para testar os dois formatos.</p>}
      </div>
      {current&&<div className="space-y-3 border-t border-slate-200 pt-3">
       <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm">{current.mode==='open'?'Disputa aberta':'Propostas fechadas'}</strong>
        <span className="text-xs text-slate-600">Até {formatDate(current.endsAt)}</span>
       </div>
       <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
        <div>Convidados <strong className="block text-lg">{current.visibleBuyerIds.length}</strong></div>
        <div>Lances fictícios <strong className="block text-lg">{current.bids.length}</strong></div>
        <div className="col-span-2">Maior oferta registrada <strong className="block text-lg text-emerald-800">
         {highestAquaBid(current)?money(highestAquaBid(current)!.amount):'Sem ofertas'}</strong></div>
       </div>
       <label className="block text-xs font-black">Simular visão de um lojista convidado
        <select value={buyerId} onChange={e=>{setBuyerId(e.target.value);setBuyerPreview(true);}}
         className="mt-1 w-full rounded-lg border border-slate-300 p-2">
         <option value="">Selecione um lojista</option>
         {current.visibleBuyerIds.map(id=>{const b=buyers.find(x=>x.id===id);return b?<option key={id} value={id}>{b.shop}</option>:null;})}
        </select>
       </label>
       {buyerId&&buyerPreview&&summary&&<div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-xs">
        <strong>Prévia do lojista: {chosenBuyer?.shop}</strong>
        <p className="mt-1">Modo: {current.mode==='open'?'aberto':'propostas fechadas'}</p>
        {current.mode==='open'?<p>Maior lance visível: <strong>{summary.highest?money(summary.highest):'Nenhum'}</strong></p>:
         <p>Outras propostas e identidades ficam ocultas. Suas propostas: {summary.ownBids.length}.</p>}
       </div>}
       {current.state==='open'&&Date.parse(current.endsAt)>Date.now()&&chosenBuyer&&current.visibleBuyerIds.includes(chosenBuyer.id)&&
        <div className="flex flex-wrap items-end gap-2">
         <label className="flex-1 text-xs font-bold">Lance fictício (R$)
          <input inputMode="numeric" type="number" min={1000} value={bidAmount} onChange={e=>setBidAmount(e.target.value)}
           className="mt-1 w-full rounded-lg border border-slate-300 p-2"/></label>
         <button type="button" onClick={simulatedBid} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-black text-white">Simular lance</button>
        </div>}
       {current.state==='open'&&<button type="button" onClick={finish} className="rounded-lg border border-slate-400 px-3 py-2 text-xs font-black">Encerrar rodada de teste</button>}
       <p className="text-[11px] text-slate-500">A Mesa pode analisar o resultado. O sistema não arremata, aceita ofertas ou realiza pagamentos automaticamente.</p>
      </div>}
     </section>
    </div>
    {error&&<p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-900">{error}</p>}
    {notice&&<p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
   </div>
  </section>
 </div>;
}
