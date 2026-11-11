import React,{useMemo,useState} from 'react';
import type {ConsultedVehicle,ConsultedOutreach,ConsultedCase,ConsultedOffer} from '../services/marketIqConsultedRepasse';
import {appendConsultedAudit,emptyConsultedCosts,emptyConsultedOffer,loadConsultedCases,
 makeConsultedId,moneyNumber,saveConsultedCases} from '../services/marketIqConsultedRepasse';
import {buyerWhatsAppUrl,loadCotacaoBuyers,rankCotacaoBuyers,validBuyerPhone,type BuyerProfile}
 from '../services/marketIqCotacaoMesaBuyers';
import {findActiveQuotation} from '../services/marketIqMultiBuyerFollowup';

type Props={scope:string;email:string;vehicle:ConsultedVehicle;onClose:()=>void;onOpenDirectory:()=>void};
type ContactStatus=ConsultedOutreach['status']|'';
type BuyerOffer={value:string;validUntil:string;confirmed:boolean};
const money=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
const today=()=>new Date().toISOString().slice(0,10);
const statusOptions:{key:ContactStatus;label:string}[]=[
 {key:'',label:'Não contatado'},
 {key:'preparado',label:'Mensagem preparada, não confirmada'},
 {key:'contatado',label:'Contatado, confirmado pela Mesa'},
 {key:'respondeu',label:'Respondeu'},
 {key:'recusou',label:'Sem interesse'}
];
const quoteOf=(rows:ConsultedOffer[],buyer:BuyerProfile)=>
 rows.find(row=>row.buyerId===buyer.id)||rows.find(row=>!row.buyerId&&norm(row.buyer)===norm(buyer.shop))||null;
export default function MarketIqQuickBuyerQuote({scope,email,vehicle,onClose,onOpenDirectory}:Props){
 const [buyers]=useState<BuyerProfile[]>(()=>loadCotacaoBuyers(scope));
 const [cases,setCases]=useState<ConsultedCase[]>(()=>loadConsultedCases(email));
 const [baseVersion,setBaseVersion]=useState<number|null>(()=>findActiveQuotation(loadConsultedCases(email),vehicle)?.version??null);
 const [search,setSearch]=useState('');
 const [selected,setSelected]=useState<string[]>(()=>{
  const match=findActiveQuotation(loadConsultedCases(email),vehicle);
  return match?.requests?.map(request=>request.buyerId)||[];
 });
 const [statuses,setStatuses]=useState<Record<string,ContactStatus>>(()=>{
  const match=findActiveQuotation(loadConsultedCases(email),vehicle);
  return Object.fromEntries((match?.requests||[]).map(r=>[r.buyerId,r.status]));
 });
 const [offers,setOffers]=useState<Record<string,BuyerOffer>>(()=>{
  const match=findActiveQuotation(loadConsultedCases(email),vehicle);
  const result:Record<string,BuyerOffer>={};
  for(const buyer of buyers){
   const found=quoteOf(match?.offers||[],buyer);
   if(found)result[buyer.id]={value:found.value,validUntil:found.validUntil,
    confirmed:found.status==='confirmada'};
  }
  return result;
 });
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const [dirty,setDirty]=useState(false);
 const matches=useMemo(()=>rankCotacaoBuyers(buyers,vehicle,vehicle.vehicleType||'car'),[buyers,vehicle]);
 const matchedIds=new Set(matches.map(x=>x.buyer.id));
 const ordered=useMemo(()=>[...matches.map(x=>x.buyer),
   ...buyers.filter(b=>b.active&&!matchedIds.has(b.id))],[matches,buyers]);
 const shown=ordered.filter(b=>(b.shop+' '+b.contact+' '+b.region).toUpperCase().includes(search.trim().toUpperCase()));
 const selectedBuyers=buyers.filter(b=>selected.includes(b.id));
 const validOffers=selectedBuyers.flatMap(b=>{
  const o=offers[b.id];const value=moneyNumber(o?.value);
  return o?.confirmed&&o.validUntil>=today()&&value>0?[{buyer:b.shop,value}]:[];
 }).sort((a,b)=>b.value-a.value);
 const marked=(id:string)=>selected.includes(id);
 const toggle=(id:string)=>{
  setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  setDirty(true);setNotice('');
 };
 const setStatus=(id:string,status:ContactStatus)=>{
  setStatuses(prev=>({...prev,[id]:status}));setDirty(true);setNotice('');
 };
 const updateOffer=(id:string,patch:Partial<BuyerOffer>)=>{
  setOffers(prev=>({...prev,[id]:{value:'',validUntil:'',confirmed:false,...prev[id],...patch}}));
  setDirty(true);setNotice('');
 };
 const save=()=>{
  setError('');setNotice('');
  if(!selectedBuyers.length){setError('Selecione pelo menos um lojista para acompanhar.');return;}
  for(const b of selectedBuyers){
   const offer=offers[b.id];
   if(offer?.value?.trim()){
    const value=moneyNumber(offer.value);
    if(!Number.isFinite(value)||value<=0||value>2_000_000){
     setError('Confira o valor da proposta de '+b.shop+'.');return;
    }
    if(offer.confirmed&&(!/^\d{4}-\d{2}-\d{2}$/.test(offer.validUntil)||offer.validUntil<today())){
     setError('Informe uma validade futura ou atual para a proposta confirmada de '+b.shop+'.');return;
    }
   }else if(offer?.confirmed){
    setError('Informe o valor da proposta confirmada de '+b.shop+'.');return;
   }
  }
  try{
   const latest=loadConsultedCases(email);
   const before=findActiveQuotation(latest,vehicle);
   if((before?.version??null)!==baseVersion){
    setError('A cotação foi alterada em outra aba. Feche e abra novamente para não sobrescrever respostas recentes.');return;
   }
   const now=new Date().toISOString();
   const previous=before||{
    id:makeConsultedId(),createdAt:now,updatedAt:now,version:0,
    vehicle:{...vehicle},offers:[],requests:[],costs:emptyConsultedCosts(),
    selectedOfferId:'',proposedBuy:'',state:'consulta' as const,events:[]
   };
   const requests:ConsultedOutreach[]=[
    ...(previous.requests||[]).filter(r=>!buyers.some(b=>b.id===r.buyerId)),
    ...selectedBuyers.map(b=>{
     const old=(previous.requests||[]).find(r=>r.buyerId===b.id);
     return {buyerId:b.id,buyer:b.shop,preparedAt:old?.preparedAt||now,
      status:statuses[b.id]||'preparado'} as ConsultedOutreach;
    })
   ];
   let updatedOffers=[...previous.offers];
   for(const b of buyers){
    const prior=quoteOf(updatedOffers,b);
    const edited=offers[b.id];
    if(!selected.includes(b.id))continue;
    if(!edited?.value?.trim())continue;
    const value=moneyNumber(edited.value);
    const next:ConsultedOffer={
     ...(prior||emptyConsultedOffer()),
     buyerId:b.id,buyer:b.shop,value:String(value),channel:'whatsapp',
     receivedAt:prior?.receivedAt||today(),
     validUntil:edited.validUntil,
     status:edited.confirmed?'confirmada':'cotada',
     note:prior?.note||''
    };
    updatedOffers=prior?updatedOffers.map(o=>o.id===prior.id?next:o):[...updatedOffers,next];
   }
   const next={...previous,vehicle:{...previous.vehicle,...vehicle},requests,offers:updatedOffers};
   const audited=appendConsultedAudit(before,next,email);
   saveConsultedCases(email,[audited,...latest.filter(r=>r.id!==audited.id)]);
   setCases([audited,...latest.filter(r=>r.id!==audited.id)]);
   setBaseVersion(audited.version);setDirty(false);
   setNotice('Acompanhamento salvo neste navegador. Nenhuma mensagem foi enviada automaticamente.');
  }catch{
   setError('Não foi possível salvar. Confira o espaço e as permissões de armazenamento do navegador.');
  }
 };
 return <div role="dialog" aria-modal="true" aria-label="Central de cotação para lojistas cadastrados"
  className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-3"
  onKeyDown={e=>{if(e.key==='Escape'&&!dirty)onClose();}}>
  <section className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl">
   <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
    <div><h2 className="text-lg font-black">Central de Cotação</h2>
     <p className="mt-1 text-sm text-slate-700">{[vehicle.brand,vehicle.model,vehicle.year].filter(Boolean).join(' ')}{vehicle.km?' · '+vehicle.km+' km':''}</p>
     <p className="mt-1 text-xs text-slate-600">Escolha os lojistas, abra cada conversa e registre os retornos. Não existe envio automático.</p></div>
    <button type="button" onClick={()=>{if(!dirty||window.confirm('Sair sem salvar o acompanhamento?'))onClose();}}
     aria-label="Fechar central de cotação" className="rounded-lg border border-slate-300 px-3 py-2 font-black">×</button>
   </div>
   <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-3 sm:grid-cols-4">
    <div className="rounded-xl bg-slate-50 p-2"><p className="text-[11px] text-slate-600">Selecionados</p><strong>{selected.length}</strong></div>
    <div className="rounded-xl bg-slate-50 p-2"><p className="text-[11px] text-slate-600">Contatados</p><strong>{selected.filter(id=>['contatado','respondeu','recusou'].includes(statuses[id])).length}</strong></div>
    <div className="rounded-xl bg-slate-50 p-2"><p className="text-[11px] text-slate-600">Responderam</p><strong>{selected.filter(id=>statuses[id]==='respondeu').length}</strong></div>
    <div className="rounded-xl bg-emerald-50 p-2"><p className="text-[11px] text-emerald-900">Maior oferta confirmada</p><strong>{validOffers.length?money(validOffers[0].value):'Ainda não há'}</strong></div>
   </div>
   <div className="border-b border-slate-200 p-3">
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar lojista por nome ou cidade"
     aria-label="Buscar lojista" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
     <p className="text-xs text-slate-600">{matches.length} compatíveis · {buyers.filter(b=>b.active).length} ativos</p>
     <button type="button" onClick={()=>{setSelected(prev=>[...new Set([...prev,...matches.filter(x=>buyerWhatsAppUrl(x.buyer,vehicle)).map(x=>x.buyer.id)])]);setDirty(true);}}
      disabled={!matches.length} className="rounded-lg border border-cyan-700 px-3 py-1.5 text-xs font-bold text-cyan-900 disabled:opacity-50">Selecionar compatíveis</button>
    </div>
   </div>
   <div className="min-h-0 flex-1 overflow-y-auto p-3">
    {!shown.length&&<p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Nenhum lojista encontrado. Confira o cadastro ou remova o filtro.</p>}
    <div className="space-y-3">{shown.map(b=>{
     const url=buyerWhatsAppUrl(b,vehicle);const checked=marked(b.id);
     const ready=b.optedIn&&Boolean(validBuyerPhone(b.whatsapp));
     const value=offers[b.id]||{value:'',validUntil:'',confirmed:false};
     return <div key={b.id} className={'rounded-xl border p-3 '+(checked?'border-cyan-400 bg-cyan-50/40':'border-slate-200')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
       <label className="flex cursor-pointer items-center gap-2 text-sm font-black">
        <input type="checkbox" checked={checked} onChange={()=>toggle(b.id)} className="h-4 w-4"/>
        {b.shop}
       </label>
       <span className="text-xs font-semibold text-slate-600">{matchedIds.has(b.id)?'Perfil compatível':'Fora do perfil'} · {ready?'Autorizado':'Sem contato autorizado'}</span>
      </div>
      <p className="mt-1 text-xs text-slate-600">{[b.contact,b.region].filter(Boolean).join(' · ')}</p>
      {checked&&<div className="mt-3 space-y-3">
       <div className="flex flex-wrap items-end gap-2">
        {url?<a href={url} target="_blank" rel="noopener noreferrer"
         onClick={()=>{if(!statuses[b.id])setStatus(b.id,'preparado');}}
         className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white">Abrir WhatsApp</a>:
         <span className="text-xs font-bold text-amber-800">Sem WhatsApp autorizado ou número válido</span>}
        <label className="flex-1 text-xs font-bold">Retorno da loja
         <select value={statuses[b.id]||''} onChange={e=>setStatus(b.id,e.target.value as ContactStatus)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2">
          {statusOptions.map(x=><option key={x.key} value={x.key}>{x.label}</option>)}
         </select>
        </label>
       </div>
       <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs font-bold">Proposta recebida (R$)
         <input type="text" inputMode="decimal" placeholder="Ex.: 85000"
          value={value.value} onChange={e=>updateOffer(b.id,{value:e.target.value})}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/>
        </label>
        <label className="text-xs font-bold">Validade da oferta
         <input type="date" value={value.validUntil} onChange={e=>updateOffer(b.id,{validUntil:e.target.value})}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/>
        </label>
        <label className="flex items-center gap-2 pt-5 text-xs font-bold">
         <input type="checkbox" checked={value.confirmed} onChange={e=>updateOffer(b.id,{confirmed:e.target.checked})}/>
         Oferta confirmada pela Mesa
        </label>
       </div>
      </div>}
     </div>;
    })}</div>
    {validOffers.length>0&&<p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">
     Maior oferta válida: <strong>{validOffers[0].buyer} · {money(validOffers[0].value)}</strong>. Valor bruto informado pelo lojista, antes de impostos, custos e margem.
    </p>}
   </div>
   <div className="border-t border-slate-200 bg-white p-3">
    {error&&<p role="alert" className="mb-2 rounded-lg bg-rose-50 p-2 text-xs font-bold text-rose-800">{error}</p>}
    {notice&&<p role="status" className="mb-2 rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-900">{notice}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2">
     <button type="button" onClick={()=>{if(!dirty||window.confirm('Sair sem salvar?'))onOpenDirectory();}}
      className="rounded-lg border border-cyan-700 px-3 py-2 text-xs font-bold text-cyan-900">Gerenciar cadastro</button>
     <button type="button" onClick={save} className="rounded-xl bg-[#153f51] px-5 py-3 text-sm font-black text-white">Salvar acompanhamento</button>
    </div>
    <p className="mt-2 text-[11px] text-slate-500">O acompanhamento fica neste navegador e usa o histórico da Cotação Mesa. Abrir o WhatsApp não confirma envio. A placa, FIPE, custos e dados de clientes não entram nas mensagens.</p>
   </div>
  </section>
 </div>;
}
