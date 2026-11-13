import React,{useMemo,useState} from 'react';
import {aquaCloudRequest} from '../services/motyqAquaCloudClient';
import {blankBuyer,loadCotacaoBuyers,saveCotacaoBuyers,safeBuyer,validBuyerPhone,
 type BuyerProfile} from '../services/marketIqCotacaoMesaBuyers';

type Props={scope:string;onSaved:(buyers:BuyerProfile[])=>void};
const fields=[
 ['shop','Nome da loja *'],['contact','Responsável / contato'],['whatsapp','WhatsApp com DDD'],
 ['email','E-mail'],['region','Cidade / região'],
 ['brands','Marcas de interesse (separadas por vírgula)'],
 ['models','Modelos de interesse (separados por vírgula)'],
 ['segments','Segmentos de interesse'],['yearFrom','Ano inicial'],['yearTo','Ano final'],
 ['maxKm','KM máxima'],['budgetTo','Orçamento máximo (R$)']
] as const;
const norm=(v:string)=>v.trim().toLocaleLowerCase('pt-BR');
const generateId=()=>typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID():
 Math.random().toString(36).slice(2)+Date.now().toString(36);
export default function MarketIqAquaBuyersManager({scope,onSaved}:Props){
 const [buyers,setBuyers]=useState<BuyerProfile[]>(()=>loadCotacaoBuyers(scope));
 const [draft,setDraft]=useState<BuyerProfile|null>(null);
 const [query,setQuery]=useState('');
 const [syncingId,setSyncingId]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const shown=useMemo(()=>buyers.filter(b=>(b.shop+' '+b.contact+' '+b.region+' '+b.brands+' '+b.models)
   .toLocaleLowerCase('pt-BR').includes(norm(query))).sort((a,b)=>a.shop.localeCompare(b.shop,'pt-BR')),[buyers,query]);
 const update=<K extends keyof BuyerProfile>(key:K,value:BuyerProfile[K])=>{
  setDraft(prev=>prev?{...prev,[key]:value}:prev);setError('');setNotice('');
 };
 const save=()=>{
  if(!draft)return;
  const clean=safeBuyer({...draft,id:draft.id||generateId(),updatedAt:new Date().toISOString()});
  if(!clean){setError('Informe o nome da loja.');return;}
  if(clean.optedIn&&!validBuyerPhone(clean.whatsapp)){setError('Para autorizar contato, informe WhatsApp válido com DDD.');return;}
  if(clean.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)){setError('Confira o e-mail informado.');return;}
  if(clean.yearFrom&&!/^(19|20)\d{2}$/.test(clean.yearFrom)){setError('Ano inicial inválido.');return;}
  if(clean.yearTo&&!/^(19|20)\d{2}$/.test(clean.yearTo)){setError('Ano final inválido.');return;}
  if(clean.yearFrom&&clean.yearTo&&+clean.yearFrom>+clean.yearTo){setError('Ano inicial maior que ano final.');return;}
  const phone=validBuyerPhone(clean.whatsapp);
  if(phone&&buyers.some(b=>b.id!==clean.id&&validBuyerPhone(b.whatsapp)===phone)){
   setError('Este WhatsApp já está cadastrado em outro lojista.');return;
  }
  if(buyers.some(b=>b.id!==clean.id&&norm(b.shop)===norm(clean.shop))){
   setError('Já existe um cadastro com este nome de loja.');return;
  }
  const next=[clean,...buyers.filter(b=>b.id!==clean.id)];
  try{saveCotacaoBuyers(scope,next);setBuyers(next);onSaved(next);setDraft(null);setError('');
   setNotice('Ficha do lojista salva. A mesma carteira é utilizada na Cotação Mesa e no AQUA.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar o cadastro.');}
 };
 const enableOnline=async(buyer:BuyerProfile)=>{
  if(!buyer.active||!buyer.optedIn||!buyer.email){setError('Informe e-mail válido, mantenha o lojista ativo e confirme a autorização para oportunidades.');return;}
  if(!window.confirm('Habilitar '+buyer.shop+' para acessar oportunidades com a conta '+buyer.email+'?'))return;
  setSyncingId(buyer.id);setError('');setNotice('');
  try{await aquaCloudRequest('enable-buyer',{buyer});setNotice('Acesso online habilitado para '+buyer.email+'. O lojista deverá entrar com essa conta.');}
  catch(e){setError(e instanceof Error?e.message:'Falha na habilitação.');}
  finally{setSyncingId('');}
 };
 const disableOnline=async(buyer:BuyerProfile)=>{
  if(!window.confirm('Bloquear acesso online de '+buyer.shop+'?'))return;
  setSyncingId(buyer.id);setError('');setNotice('');
  try{await aquaCloudRequest('disable-buyer',{buyerId:buyer.id});
   setNotice('Acesso online bloqueado para '+buyer.shop+'.');}
  catch(e){setError(e instanceof Error?e.message:'Falha ao bloquear acesso online.');}
  finally{setSyncingId('');}
 };
 const toggleActive=(buyer:BuyerProfile)=>{
  const next=buyers.map(b=>b.id===buyer.id?{...b,active:!b.active,updatedAt:new Date().toISOString()}:b);
  try{saveCotacaoBuyers(scope,next);setBuyers(next);onSaved(next);
   setNotice(buyer.active?'Lojista desativado, sem apagar o histórico.':'Lojista reativado.');
  }catch(e){setError(e instanceof Error?e.message:'Falha ao alterar o status.');}
 };
 const input='mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
 return <section aria-label="Gestão dos lojistas" className="space-y-3">
  <div className="flex flex-wrap items-start justify-between gap-2">
   <div><h3 className="text-lg font-black">Meus lojistas</h3>
    <p className="mt-1 text-xs text-slate-600">{buyers.length} cadastros · {buyers.filter(b=>b.active).length} ativos. Cadastro compartilhado com a Cotação Mesa neste navegador.</p></div>
   <button type="button" onClick={()=>{setDraft(blankBuyer());setError('');setNotice('');}}
    className="rounded-xl bg-cyan-800 px-4 py-3 text-sm font-black text-white">+ Novo lojista</button>
  </div>
  <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar loja, cidade ou interesse..."
   aria-label="Buscar lojista" className={input}/>
  {notice&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-xs font-bold text-emerald-900">{notice}</p>}
  {!draft?<div className="space-y-2">
   {shown.map(b=><div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
    <div><strong className="text-sm">{b.shop}</strong>
     <p className="text-xs text-slate-600">{[b.contact,b.region,b.whatsapp].filter(Boolean).join(' · ')}</p>
     <p className="mt-1 text-xs text-slate-500">{b.active?'Ativo':'Inativo'} · {b.optedIn?'Autorizou WhatsApp':'Sem autorização'} · {b.vehicleType==='both'?'Carros e motos':b.vehicleType==='car'?'Automóveis':'Motos'}</p>
    </div>
    <div className="flex gap-2">
     <button type="button" onClick={()=>{setDraft({...b});setError('');}} className="rounded-lg border border-cyan-700 px-3 py-2 text-xs font-bold text-cyan-900">Editar ficha</button>
     <button type="button" onClick={()=>toggleActive(b)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">{b.active?'Desativar':'Ativar'}</button>
     <button type="button" disabled={syncingId===b.id} onClick={()=>void enableOnline(b)} className="rounded-lg border border-emerald-700 px-3 py-2 text-xs font-bold text-emerald-800 disabled:opacity-50">{syncingId===b.id?'Habilitando...':'Habilitar no app'}</button>
     <button type="button" disabled={syncingId===b.id} onClick={()=>void disableOnline(b)} className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-bold text-rose-800 disabled:opacity-50">Bloquear no app</button>
    </div>
   </div>)}
   {!shown.length&&<p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Nenhum lojista encontrado. Clique em Novo lojista para cadastrar.</p>}
  </div>:<div className="space-y-4 rounded-2xl border border-cyan-200 bg-cyan-50/30 p-4">
   <h4 className="text-base font-black">{draft.id?'Editar ficha completa':'Cadastrar lojista'}</h4>
   <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key,title])=>
    <label key={key} className="text-xs font-bold text-slate-700">{title}
     <input className={input} value={draft[key]||''} onChange={e=>update(key,e.target.value)}
      maxLength={key==='brands'||key==='models'?400:200}/></label>)}
    <label className="text-xs font-bold">Tipos de veículo
     <select value={draft.vehicleType} onChange={e=>update('vehicleType',e.target.value as BuyerProfile['vehicleType'])} className={input}>
      <option value="both">Carros e motos</option><option value="car">Automóveis</option><option value="motorcycle">Motocicletas</option>
     </select>
    </label>
   </div>
   <label className="flex items-start gap-2 rounded-xl bg-white p-3 text-xs font-semibold">
    <input type="checkbox" checked={draft.optedIn} onChange={e=>update('optedIn',e.target.checked)}/>
    Lojista autorizou receber oportunidades e cotações pelo WhatsApp.
   </label>
   <label className="flex items-center gap-2 text-sm font-bold">
    <input type="checkbox" checked={draft.active} onChange={e=>update('active',e.target.checked)}/> Cadastro ativo
   </label>
   {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs font-bold text-rose-900">{error}</p>}
   <div className="flex flex-wrap gap-2">
    <button type="button" onClick={save} className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white">Salvar ficha</button>
    <button type="button" onClick={()=>{setDraft(null);setError('');}} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold">Cancelar</button>
   </div>
   <p className="text-xs text-slate-600">Desativar preserva o cadastro e o histórico. Nenhum convite é enviado automaticamente.</p>
  </div>}
 </section>;
}
