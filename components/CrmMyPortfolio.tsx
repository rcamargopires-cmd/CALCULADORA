import React,{useMemo,useState} from 'react';
import {ArrowRight,CalendarClock,CarFront,CheckCircle2,ClipboardList,MessageCircle,Search,UsersRound} from 'lucide-react';
import type {GroupStockItem} from '../services/groupStockService';
import type {ShowroomPassage} from '../types';
import {matchGroupStock} from '../services/crmStockMatchService';
import {requestCrmWhatsApp} from './CrmWhatsAppComposer';

type Tab='late'|'today'|'cars'|'proposal'|'all';
type Props={items:ShowroomPassage[];stock:GroupStockItem[];onOpen:(lead:ShowroomPassage)=>void;onContact:(lead:ShowroomPassage)=>void;onAdvanced:()=>void};
const active=(lead:ShowroomPassage)=>!['sale','no_deal'].includes(lead.status);
const phone=(value:string)=>{let n=String(value||'').replace(/\D/g,'');if(n.length===10||n.length===11)n='55'+n;return n.length>=12?n:'';};
const stamp=(date?:string)=>{if(!date)return 'Sem retorno agendado';const d=new Date(date);return Number.isFinite(d.getTime())?d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Data não informada';};
const Mine:React.FC<Props>=({items,stock,onOpen,onContact,onAdvanced})=>{
  const[tab,setTab]=useState<Tab>('late');
  const[search,setSearch]=useState('');
  const now=Date.now();
  const end=new Date();end.setHours(23,59,59,999);
  const live=items.filter(active);
  const late=live.filter(item=>item.nextFollowUpAt&&new Date(item.nextFollowUpAt).getTime()<now);
  const today=live.filter(item=>item.nextFollowUpAt&&new Date(item.nextFollowUpAt).getTime()>=now&&new Date(item.nextFollowUpAt).getTime()<=end.getTime());
  const proposals=live.filter(item=>item.status==='proposal');
  const matches=useMemo(()=>new Map(live.map(lead=>[lead.id,
    matchGroupStock(stock,String(lead.desiredVehicle||lead.interestModel||''),3)])),[items,stock]);
  const cars=live.filter(item=>(matches.get(item.id)||[]).length>0);
  const sets:Record<Tab,ShowroomPassage[]>={late,today,cars,proposal:proposals,all:items};
  const current=sets[tab].filter(item=>{
    const q=search.toLocaleLowerCase('pt-BR').trim();
    return !q||[item.customerName,item.phone,item.desiredVehicle,item.interestModel].some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(q));
  }).sort((a,b)=>String(a.nextFollowUpAt||'9999').localeCompare(String(b.nextFollowUpAt||'9999')));
  const cards=[
    {id:'late' as Tab,label:'Atrasados',count:late.length,description:'Precisam de retorno',icon:<CalendarClock size={19}/>,tone:'border-red-200 bg-red-50 text-red-800'},
    {id:'today' as Tab,label:'Hoje',count:today.length,description:'Contatos agendados',icon:<CheckCircle2 size={19}/>,tone:'border-sky-200 bg-sky-50 text-sky-800'},
    {id:'cars' as Tab,label:'Carros para clientes',count:cars.length,description:'Sugestões no estoque',icon:<CarFront size={19}/>,tone:'border-emerald-200 bg-emerald-50 text-emerald-800'},
    {id:'proposal' as Tab,label:'Em negociação',count:proposals.length,description:'Propostas em andamento',icon:<ClipboardList size={19}/>,tone:'border-amber-200 bg-amber-50 text-amber-800'},
  ];
  return <section className="space-y-4">
    <div className="rounded-[26px] border border-emerald-200 bg-white p-4 md:p-6">
      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">CRM · ROTINA COMERCIAL</p>
      <h3 className="mt-1 text-xl font-bold text-slate-900">Minha carteira</h3>
      <p className="mt-1 text-sm text-slate-500">Escolha uma prioridade, fale com o cliente e registre o próximo passo.</p>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">{cards.map(card=>
        <button type="button" key={card.id} aria-pressed={tab===card.id} onClick={()=>{setTab(card.id);setSearch('');}}
          className={'min-w-0 rounded-2xl border p-3 text-left transition '+card.tone+(tab===card.id?' ring-2 ring-slate-800 ring-offset-2':' hover:shadow-md')}>
          <span>{card.icon}</span><span className="mt-2 block text-2xl font-black">{card.count}</span>
          <span className="block text-sm font-bold">{card.label}</span><span className="mt-1 block text-[11px] opacity-80">{card.description}</span>
        </button>)}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={()=>{setTab('all');setSearch('');}} aria-pressed={tab==='all'}
          className={'rounded-xl px-4 py-2 text-xs font-bold '+(tab==='all'?'bg-slate-900 text-white':'border border-slate-200 text-slate-700')}>Todos os clientes ({items.length})</button>
        <button type="button" onClick={onAdvanced} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700">Visão do funil <ArrowRight size={13} className="ml-1 inline"/></button>
      </div>
    </div>
    <div className="rounded-[26px] border border-slate-200 bg-white p-4 md:p-6">
      <div className="flex flex-wrap justify-between gap-2"><div><h4 className="text-lg font-bold text-slate-900">{cards.find(c=>c.id===tab)?.label||'Todos os clientes'}</h4>
        <p className="mt-1 text-xs text-slate-500">{current.length} cliente(s) · toque na ficha para ver propostas, carros e histórico.</p></div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{current.length}</span></div>
      <label className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search size={17} className="text-slate-400"/>
        <input className="w-full min-w-0 bg-transparent text-sm text-slate-800 outline-none" placeholder="Buscar nome, telefone ou veículo" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">{current.map(item=>{
        const wa=phone(item.phone);
        return <article key={item.id} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0">
            <button type="button" onClick={()=>onOpen(item)} className="break-words text-left font-bold text-slate-900 underline decoration-emerald-300 underline-offset-4">{item.customerName||'Cliente'}</button>
            <p className="mt-1 text-xs text-slate-600">Procura: {item.desiredVehicle||item.interestModel||'Não informado'}</p>
            <p className="mt-1 text-xs text-slate-500">Próximo passo: {stamp(item.nextFollowUpAt)}</p>
          </div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-emerald-700">{item.status==='proposal'?'Em proposta':item.status==='sale'?'Vendido':item.status==='no_deal'?'Encerrado':'Em atendimento'}</span></div>
          {tab==='cars'&&(matches.get(item.id)||[]).length>0&&<p className="mt-2 text-xs font-semibold text-emerald-800">{matches.get(item.id)!.length} sugestão(ões) no estoque. Confira disponibilidade e reservas antes de enviar.</p>}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {wa?<button type="button" onClick={()=>requestCrmWhatsApp(item,tab==='cars'?'stock':tab==='proposal'?'proposal':tab==='today'?'today':'follow_up',(matches.get(item.id)||[])[0]?.item)}
              className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-emerald-600 px-1 text-[11px] font-bold text-white"><MessageCircle size={14}/> WhatsApp</button>
              :<span className="grid min-h-10 place-items-center rounded-xl bg-slate-100 text-[10px] text-slate-400">Sem telefone</span>}
            <button type="button" onClick={()=>onContact(item)} className="min-h-10 rounded-xl bg-slate-900 px-1 text-[11px] font-bold text-white">Registrar contato</button>
            <button type="button" onClick={()=>onOpen(item)} className="min-h-10 rounded-xl border border-slate-300 bg-white px-1 text-[11px] font-bold text-slate-700">Abrir ficha</button>
          </div>
        </article>;
      })}</div>
      {!current.length&&<p className="mt-3 rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">Nenhum cliente nesta seleção. Escolha outra prioridade ou consulte todos os clientes.</p>}
    </div>
  </section>;
};
export default Mine;