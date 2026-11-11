import React,{useMemo,useState} from 'react';
import type {ConsultedVehicle} from '../services/marketIqConsultedRepasse';
import {buyerWhatsAppUrl,loadCotacaoBuyers,rankCotacaoBuyers,validBuyerPhone}
 from '../services/marketIqCotacaoMesaBuyers';

type Props={scope:string;vehicle:ConsultedVehicle;onClose:()=>void;onOpenDirectory:()=>void};
export default function MarketIqQuickBuyerQuote({scope,vehicle,onClose,onOpenDirectory}:Props){
 const [search,setSearch]=useState('');
 const buyers=useMemo(()=>loadCotacaoBuyers(scope),[scope]);
 const matches=useMemo(()=>rankCotacaoBuyers(buyers,vehicle,vehicle.vehicleType||'car'),[buyers,vehicle]);
 const ordered=useMemo(()=>{
  const preferred=new Set(matches.map(x=>x.buyer.id));
  return [...matches.map(x=>x.buyer),...buyers.filter(b=>b.active&&!preferred.has(b.id))];
 },[buyers,matches]);
 const shown=ordered.filter(b=>(b.shop+' '+b.contact+' '+b.region).toUpperCase().includes(search.trim().toUpperCase()));
 const matchedIds=new Set(matches.map(x=>x.buyer.id));
 return <div role="dialog" aria-modal="true" aria-label="Enviar cotação a lojista cadastrado"
  className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-3"
  onKeyDown={e=>{if(e.key==='Escape')onClose();}}>
  <section className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl">
   <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
    <div><h2 className="text-lg font-black">Cotação direta para lojista</h2>
     <p className="mt-1 text-sm text-slate-700">{[vehicle.brand,vehicle.model,vehicle.year].filter(Boolean).join(' ')}{vehicle.km?' · '+vehicle.km+' km':''}</p>
     <p className="mt-1 text-xs text-slate-500">Selecione o destinatário. O WhatsApp abrirá com a mensagem pronta, mas você confirma o envio.</p></div>
    <button type="button" onClick={onClose} aria-label="Fechar cotação" className="rounded-lg border border-slate-300 px-3 py-2 font-black">×</button>
   </div>
   <div className="border-b border-slate-200 p-3">
    <input autoFocus value={search} onChange={e=>setSearch(e.target.value)}
     placeholder="Pesquisar lojista cadastrado" aria-label="Pesquisar lojista"
     className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/>
    <p className="mt-2 text-xs text-slate-600">{matches.length} compatíveis · {buyers.filter(b=>b.active).length} ativos na carteira deste usuário</p>
   </div>
   <div className="min-h-0 flex-1 overflow-y-auto p-3">
    {!shown.length&&<p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Nenhum lojista encontrado. Confira o cadastro ou remova o filtro.</p>}
    <div className="space-y-2">{shown.map(b=>{
     const url=buyerWhatsAppUrl(b,vehicle);
     const available=b.optedIn&&Boolean(validBuyerPhone(b.whatsapp));
     return <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
      <div><p className="text-sm font-black">{b.shop}</p>
       <p className="text-xs text-slate-600">{[b.contact,b.region].filter(Boolean).join(' · ')}</p>
       <p className="mt-1 text-xs font-semibold text-slate-700">{matchedIds.has(b.id)?'Perfil compatível':'Fora do perfil cadastrado'} · {available?'Contato autorizado':'Contato sem autorização ou telefone válido'}</p></div>
      {url?<a href={url} target="_blank" rel="noopener noreferrer"
       onClick={onClose} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-800">
       Abrir WhatsApp</a>:
       <span className="text-xs text-amber-800">Envio indisponível</span>}
     </div>;
    })}</div>
   </div>
   <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-3">
    <p className="max-w-xs text-[11px] text-slate-500">Sem disparos automáticos. A mensagem não inclui placa, dados de cliente, FIPE ou custos internos.</p>
    <button type="button" onClick={onOpenDirectory} className="rounded-lg border border-cyan-700 px-3 py-2 text-xs font-bold text-cyan-900">Gerenciar lojistas</button>
   </div>
  </section>
 </div>;
}
