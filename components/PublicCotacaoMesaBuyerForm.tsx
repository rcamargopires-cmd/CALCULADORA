import React,{useState} from 'react';
import {ArrowRight,CarFront,CheckCircle2,ClipboardCopy,ExternalLink,
 MapPin,MessageCircle,ShieldCheck,Truck,Users} from 'lucide-react';
import type {PublicBuyerRegistration} from '../services/marketIqBuyerRegistration';
import {buyerRegistrationMessage,createPublicBuyerCode,validatePublicBuyer} from '../services/marketIqBuyerRegistration';

const brandList=['Volkswagen','Fiat','Chevrolet','Hyundai','Toyota','Honda','Jeep',
 'Renault','Nissan','Ford','Peugeot','Citroën','BYD','GWM','BMW','Mercedes-Benz','Audi','Mitsubishi'];
const classList=['SUV','Hatch','Sedan','Picape','Utilitário','Van','Esportivo',
 'Elétrico','Híbrido','Moto','Popular de entrada'];
const input='w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100';
const label='mb-1.5 block text-xs font-bold text-slate-700';
const initial:PublicBuyerRegistration={
 shop:'',contact:'',whatsapp:'',region:'',email:'',brands:'',models:'',segments:'',
 vehicleType:'car',yearFrom:'',yearTo:'',maxKm:'',budgetTo:'',optedIn:false
};
function selection(value:string,label:string,field:'brands'|'segments',update:(field:'brands'|'segments',value:string)=>void){
 const current=String(value||'').split(',').map(v=>v.trim()).filter(Boolean);
 const selected=current.includes(label);
 return <button key={label} type="button" aria-pressed={selected}
  onClick={()=>update(field,(selected?current.filter(v=>v!==label):[...current,label]).join(', '))}
  className={'rounded-full border px-3 py-2 text-xs font-bold transition '+(selected?
   'border-cyan-700 bg-cyan-800 text-white':'border-slate-200 bg-white text-slate-700 hover:border-cyan-400')}>
  {label}</button>;
}
export default function PublicCotacaoMesaBuyerForm(){
 const [data,setData]=useState<PublicBuyerRegistration>(initial);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const [copied,setCopied]=useState(false);
 function set<K extends keyof PublicBuyerRegistration>(key:K,value:PublicBuyerRegistration[K]){
  setData(old=>({...old,[key]:value}));
  if(message)setMessage('');
  if(error)setError('');
 };
 const make=()=>{
  const problem=validatePublicBuyer(data);
  if(problem){setError(problem);return;}
  try{
   createPublicBuyerCode(data);
   setMessage(buyerRegistrationMessage(data));setError('');setCopied(false);
   window.scrollTo({top:0,behavior:'smooth'});
  }catch(e:any){setError(String(e?.message||'Não foi possível preparar o cadastro.'));}
 };
 const copy=async()=>{
  try{await navigator.clipboard.writeText(message);setCopied(true);}
  catch{setCopied(false);setError('Não foi possível copiar automaticamente. Selecione o texto abaixo e copie.');}
 };
 const shareUrl=message?'https://api.whatsapp.com/send?text='+encodeURIComponent(message):'';
 return <main className="motyq-buyer-public-page min-h-screen bg-[#f2f6f9] pb-16 text-slate-900">
  <header className="bg-[#153444] px-4 py-6 text-white">
   <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
    <div className="flex items-center gap-3">
     <div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-400/40 bg-cyan-300/10 text-lg font-black text-cyan-300">M</div>
     <div><p className="text-sm font-black tracking-[.2em]">MOTYQ IQ</p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200">Cotação Mesa · Rede de compradores</p></div>
    </div>
    <span className="rounded-full border border-cyan-300/30 px-3 py-1.5 text-[11px] font-bold text-cyan-100">Cadastro de lojista</span>
   </div>
  </header>
  <div className="mx-auto max-w-3xl px-4 pt-7">
   <div className="motyq-buyer-public-hero mb-6 rounded-3xl bg-[#153444] p-6 text-white sm:p-8">
    <p className="motyq-buyer-hero-eyebrow mb-2 text-xs font-black uppercase tracking-widest text-cyan-300">Compradores parceiros</p>
    <h1 className="motyq-buyer-hero-heading text-2xl font-black tracking-tight sm:text-3xl">Quais veículos sua loja quer comprar?</h1>
    <p className="motyq-buyer-hero-description mt-3 max-w-xl text-sm leading-6 text-slate-200">
     Preencha uma única vez e informe os tipos de carros que fazem sentido para sua loja.
     A Mesa poderá priorizar você nas próximas cotações compatíveis com seu perfil.
    </p>
    <div className="motyq-buyer-hero-benefits mt-5 flex flex-wrap gap-3 text-xs font-semibold text-cyan-100">
     <span className="inline-flex items-center gap-1.5"><CarFront size={15}/>Preferências de compra</span>
     <span className="inline-flex items-center gap-1.5"><ShieldCheck size={15}/>Contato autorizado</span>
     <span className="inline-flex items-center gap-1.5"><MessageCircle size={15}/>Envio por WhatsApp</span>
    </div>
   </div>
   {message?<section className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-7">
    <div className="flex items-start gap-3">
     <CheckCircle2 size={28} className="shrink-0 text-emerald-700"/>
     <div><h2 className="text-xl font-black">Cadastro preparado</h2>
      <p className="mt-1 text-sm leading-6 text-slate-700">
       Agora compartilhe com o contato da Mesa que enviou este formulário.
       <strong> Seus dados ainda não foram enviados nem cadastrados no Motyq.</strong>
      </p></div>
    </div>
    <div className="mt-5 flex flex-wrap gap-3">
     <a href={shareUrl} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white hover:bg-emerald-800">
      <MessageCircle size={18}/>Compartilhar pelo WhatsApp <ExternalLink size={14}/></a>
     <button type="button" onClick={()=>void copy()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800">
      <ClipboardCopy size={17}/>{copied?'Texto copiado':'Copiar cadastro'}
     </button>
    </div>
    <p className="mt-3 text-xs leading-5 text-slate-600">
     Ao abrir o WhatsApp, escolha o contato da Mesa e confirme o envio. Compartilhar não é automático.
    </p>
    <label className="mt-5 block text-xs font-bold text-slate-600" htmlFor="registration-text">Texto gerado para a Mesa</label>
    <textarea id="registration-text" readOnly value={message} rows={7}
     className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700"/>
    <button type="button" onClick={()=>{setMessage('');setCopied(false);}}
     className="mt-3 text-xs font-bold text-cyan-800 underline">Voltar e corrigir informações</button>
    {error&&<p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
   </section>:<form className="space-y-5" onSubmit={event=>{event.preventDefault();make();}}>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
     <h2 className="flex items-center gap-2 text-base font-black"><Users size={18} className="text-cyan-700"/>1. Dados de contato</h2>
     <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2"><span className={label}>Nome da loja *</span>
       <input className={input} required maxLength={100} value={data.shop}
        onChange={e=>set('shop',e.target.value)} placeholder="Ex.: Auto Center Veículos"/></label>
      <label><span className={label}>Responsável pelas compras *</span>
       <input className={input} required maxLength={100} value={data.contact}
        onChange={e=>set('contact',e.target.value)} placeholder="Nome e sobrenome"/></label>
      <label><span className={label}>WhatsApp com DDD *</span>
       <input className={input} required type="tel" value={data.whatsapp} maxLength={24}
        onChange={e=>set('whatsapp',e.target.value)} placeholder="(15) 99999-9999"/></label>
      <label><span className={label}>Cidade / região *</span>
       <div className="relative"><MapPin size={16} className="absolute left-3 top-3.5 text-slate-400"/>
        <input className={input+' pl-9'} required maxLength={100} value={data.region}
         onChange={e=>set('region',e.target.value)} placeholder="Sorocaba, SP"/></div></label>
      <label><span className={label}>E-mail comercial (opcional)</span>
       <input className={input} type="email" maxLength={140} value={data.email||''}
        onChange={e=>set('email',e.target.value)} placeholder="compras@loja.com.br"/></label>
     </div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
     <h2 className="flex items-center gap-2 text-base font-black"><CarFront size={18} className="text-cyan-700"/>2. Perfil de compra</h2>
     <label className="mt-4 block"><span className={label}>O que você compra?</span>
      <select className={input} value={data.vehicleType}
       onChange={e=>set('vehicleType',e.target.value as PublicBuyerRegistration['vehicleType'])}>
       <option value="car">Carros e utilitários</option><option value="motorcycle">Motocicletas</option>
       <option value="both">Carros e motos</option>
      </select></label>
     <fieldset className="mt-5">
      <legend className={label}>Marcas de interesse (selecione várias)</legend>
      <div className="mt-2 flex flex-wrap gap-2">
       {brandList.map(brand=>selection(data.brands,brand,'brands',set))}
      </div>
      <label className="mt-3 block"><span className={label}>Outras marcas ou marcas específicas</span>
       <input className={input} value={data.brands} maxLength={400}
        onChange={e=>set('brands',e.target.value)} placeholder="Ex.: Jeep, Toyota, Audi"/></label>
     </fieldset>
     <fieldset className="mt-5">
      <legend className={label}>Categorias que interessam (selecione várias)</legend>
      <div className="mt-2 flex flex-wrap gap-2">
       {classList.map(category=>selection(data.segments||'',category,'segments',set))}
      </div>
     </fieldset>
     <label className="mt-5 block"><span className={label}>Modelos e versões preferidos (opcional)</span>
      <textarea className={input} rows={2} maxLength={400} value={data.models}
       onChange={e=>set('models',e.target.value)}
       placeholder="Ex.: Compass, Renegade, Hilux SRX, HB20 1.0..."/>
      <p className="mt-1 text-[11px] text-slate-500">Separe por vírgulas. Caso compre vários modelos, pode deixar em branco.</p>
     </label>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
     <h2 className="flex items-center gap-2 text-base font-black"><Truck size={18} className="text-cyan-700"/>3. Limites de compra</h2>
     <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label><span className={label}>Ano/modelo mínimo (opcional)</span>
       <input className={input} inputMode="numeric" maxLength={4} value={data.yearFrom}
        onChange={e=>set('yearFrom',e.target.value.replace(/\D/g,''))} placeholder="2018"/></label>
      <label><span className={label}>Ano/modelo máximo (opcional)</span>
       <input className={input} inputMode="numeric" maxLength={4} value={data.yearTo}
        onChange={e=>set('yearTo',e.target.value.replace(/\D/g,''))} placeholder="2026"/></label>
      <label><span className={label}>Quilometragem máxima (opcional)</span>
       <input className={input} inputMode="numeric" maxLength={7} value={data.maxKm||''}
        onChange={e=>set('maxKm',e.target.value.replace(/\D/g,''))} placeholder="120000"/></label>
      <label><span className={label}>Valor máximo de compra, em R$ (opcional)</span>
       <input className={input} inputMode="numeric" maxLength={9} value={data.budgetTo||''}
        onChange={e=>set('budgetTo',e.target.value.replace(/\D/g,''))} placeholder="100000"/></label>
     </div>
    </section>
    <section className="rounded-2xl border border-cyan-200 bg-white p-5 shadow-sm sm:p-6">
     <h2 className="flex items-center gap-2 text-base font-black"><ShieldCheck size={18} className="text-cyan-700"/>4. Permissão de contato</h2>
     <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-800">
      <input className="mt-1.5 h-4 w-4 shrink-0 accent-cyan-800" type="checkbox" required
       checked={data.optedIn} onChange={e=>set('optedIn',e.target.checked)}/>
      Autorizo a equipe de Cotação Mesa que receber este cadastro a utilizar os dados profissionais informados
      para enviar oportunidades de compra compatíveis por WhatsApp. Sei que posso pedir a interrupção dos contatos
      a qualquer momento respondendo à mensagem.
     </label>
     <p className="mt-3 text-xs leading-5 text-slate-600">
      Este formulário não grava seus dados em um servidor. Após preencher, você escolherá com quem compartilhar
      as respostas por WhatsApp. A Mesa poderá revisar seu cadastro antes de adicioná-lo à carteira local de compradores.
     </p>
     {error&&<p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</p>}
     <button type="submit" className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#153f51] px-5 py-3.5 text-sm font-black text-white hover:bg-[#24576c]">
      Preparar cadastro para envio <ArrowRight size={17}/></button>
    </section>
   </form>}
   <p className="mt-6 text-center text-[11px] text-slate-500">Motyq IQ · Cadastro profissional voluntário · Sem assinatura ou custo de participação</p>
  </div>
 </main>;
}
