import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CarFront, Clock3, FileText, History, Mail, MessageSquareText, PencilLine,
  Phone, Repeat2, Save, UserRound, WalletCards, X
} from 'lucide-react';
import { CrmLeadTemperature, ShowroomPassage, ShowroomPassageActivity, ShowroomPassageStatus, User } from '../types';
import { showroomFlowService } from '../services/showroomFlowService';
import type { GroupStockItem } from '../services/groupStockService';
import CrmCommercialProposals from './CrmCommercialProposals';
import CrmPersonalizedCatalog from './CrmPersonalizedCatalog';

type Props={selected:ShowroomPassage;items:ShowroomPassage[];user:User;stockItems?:GroupStockItem[];onClose:()=>void;onContact?: (lead:ShowroomPassage)=>void;};

const STATUS:Record<ShowroomPassageStatus,string>={
  waiting:'Aguardando',in_service:'Em atendimento',evaluation:'Avaliação',proposal:'Proposta',
  follow_up:'Follow-up',sale:'Venda',no_deal:'Sem negócio',
};
const SOURCE:Record<string,string>={showroom:'Loja',whatsapp:'WhatsApp',web:'Web',instagram:'Instagram',manual:'Manual',other:'Outro'};
const TEMP:Record<CrmLeadTemperature,string>={hot:'Quente',warm:'Morno',cold:'Frio'};
const TIMELINE:Record<string,string>={today:'Hoje',week:'Até 7 dias',month:'Até 30 dias',quarter:'Até 90 dias',later:'Mais de 90 dias',unknown:'Ainda não definiu'};
const CONTACT:Record<string,string>={whatsapp:'WhatsApp',phone:'Ligação',email:'E-mail'};

const cleanPhone=(value:string)=>String(value||'').replace(/\D/g,'');
const cleanName=(value:string)=>String(value||'').trim().toLocaleLowerCase('pt-BR');
const phoneMask=(raw:string)=>{
  const value=cleanPhone(raw).slice(-11);
  if(value.length<=2)return value;
  if(value.length<=6)return '('+value.slice(0,2)+') '+value.slice(2);
  if(value.length<=10)return '('+value.slice(0,2)+') '+value.slice(2,6)+'-'+value.slice(6);
  return '('+value.slice(0,2)+') '+value.slice(2,7)+'-'+value.slice(7);
};
const dateTime=(iso?:string)=>{
  if(!iso)return '—';
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))return '—';
  return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
};
const localInput=(iso?:string)=>{
  if(!iso)return '';
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))return '';
  const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
};
const money=(value?:number)=>Number(value||0)
  ? Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
  : '—';
const moneyInput=(value:string)=>Number(String(value||'').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.'))||0;

const isSameCustomer=(base:ShowroomPassage,item:ShowroomPassage)=>{
  if(base.id===item.id)return true;
  const a=cleanPhone(base.phone),b=cleanPhone(item.phone);
  if(a.length>=8&&b.length>=8)return a===b;
  const na=cleanName(base.customerName),nb=cleanName(item.customerName);
  return Boolean(na&&nb&&na===nb);
};

type TimelineItem={id:string;at:string;label:string;details?:string;status?:ShowroomPassageStatus;by?:string;kind?:ShowroomPassageActivity['type']|'legacy';};

const buildTimeline=(records:ShowroomPassage[])=>{
  const timeline:TimelineItem[]=[];
  records.forEach(record=>{
    const activities=Array.isArray(record.activityHistory)?record.activityHistory:[];
    activities.forEach(activity=>timeline.push({
      id:record.id+'_'+activity.id,
      at:activity.at,label:activity.label,details:activity.details,status:activity.status,
      by:activity.byName||activity.byEmail||'',kind:activity.type,
    }));
    if(!activities.some(item=>item.type==='created')){
      timeline.push({
        id:record.id+'_created',at:record.createdAt,label:'Atendimento registrado',
        details:record.interestModel?'Interesse: '+record.interestModel:'',status:'waiting',
        by:record.createdByName||record.createdBy||'',kind:'legacy',
      });
    }
    if(record.assumedAt&&!activities.some(item=>item.type==='assumed')){
      timeline.push({
        id:record.id+'_assumed',at:record.assumedAt,label:'Atendimento assumido',
        status:'in_service',by:record.assignedSellerName||'',kind:'legacy',
      });
    }
    const corrections=Array.isArray((record as any).correctionHistory)?(record as any).correctionHistory:[];
    corrections.forEach((entry:any,index:number)=>timeline.push({
      id:record.id+'_correction_'+index,at:String(entry?.at||record.updatedAt||record.createdAt),
      label:'Cadastro corrigido',details:String(entry?.reason||''),status:entry?.after?.status,
      by:String(entry?.byName||entry?.byEmail||''),kind:'correction',
    }));
    if(record.lastContactAt&&!activities.some(item=>item.type==='contact')){
      timeline.push({id:record.id+'_contact',at:record.lastContactAt,label:'Último contato registrado',kind:'contact'});
    }
    if(record.nextFollowUpAt){
      timeline.push({id:record.id+'_followup',at:record.nextFollowUpAt,label:'Follow-up programado',details:'Próximo retorno previsto',kind:'follow_up'});
    }
    if(record.closedAt&&!activities.some(item=>item.type==='closed')){
      timeline.push({
        id:record.id+'_closed',at:record.closedAt,
        label:record.status==='sale'?'Venda concluída':'Atendimento encerrado',
        details:record.notes||'',status:record.status,kind:'closed',
      });
    }
  });
  const dedup=new Map<string,TimelineItem>();
  timeline.forEach(item=>{
    const key=item.at+'_'+item.label+'_'+String(item.details||'');
    if(!dedup.has(key))dedup.set(key,item);
  });
  return Array.from(dedup.values()).sort((a,b)=>String(b.at).localeCompare(String(a.at)));
};

const statusClass=(status?:ShowroomPassageStatus)=>{
  if(status==='sale')return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if(status==='no_deal')return 'border-slate-200 bg-slate-100 text-slate-600';
  if(status==='in_service')return 'border-sky-200 bg-sky-50 text-sky-700';
  if(status==='evaluation'||status==='proposal'||status==='follow_up')return 'border-violet-200 bg-violet-50 text-violet-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

const CustomerAttendanceDossier:React.FC<Props>=({selected,items,user,stockItems=[],onClose,onContact})=>{
  const current=items.find(item=>item.id===selected.id)||selected;
  const records=useMemo(
    ()=>items.filter(item=>isSameCustomer(current,item)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),
    [items,current.id,current.phone,current.customerName],
  );
  const latest=records[0]||current;
  const timeline=useMemo(()=>buildTimeline(records),[records]);
  const notes=records.filter(item=>String(item.notes||'').trim());
  const sales=records.filter(item=>item.status==='sale').length;

  const[editing,setEditing]=useState(false);
  const[saving,setSaving]=useState(false);
  const[feedback,setFeedback]=useState('');
  const[desiredVehicle,setDesiredVehicle]=useState('');
  const[email,setEmail]=useState('');
  const[purchaseTimeline,setPurchaseTimeline]=useState('unknown');
  const[preferredContact,setPreferredContact]=useState<'whatsapp'|'phone'|'email'>('whatsapp');
  const[tradeInPlate,setTradeInPlate]=useState('');
  const[desiredEntry,setDesiredEntry]=useState('');
  const[desiredPayment,setDesiredPayment]=useState('');
  const[temperature,setTemperature]=useState<CrmLeadTemperature>('warm');
  const[followUp,setFollowUp]=useState('');
  const[newNote,setNewNote]=useState('');

  useEffect(()=>{
    setDesiredVehicle(String(latest.desiredVehicle||latest.interestModel||''));
    setEmail(String(latest.customerEmail||''));
    setPurchaseTimeline(String(latest.purchaseTimeline||'unknown'));
    setPreferredContact((latest.preferredContact||'whatsapp') as 'whatsapp'|'phone'|'email');
    setTradeInPlate(String(latest.tradeInPlate||''));
    setDesiredEntry(latest.desiredEntry?String(latest.desiredEntry):'');
    setDesiredPayment(latest.desiredPayment?String(latest.desiredPayment):'');
    setTemperature(latest.leadTemperature||'warm');
    setFollowUp(localInput(latest.nextFollowUpAt));
  },[
    latest.id,latest.updatedAt,latest.desiredVehicle,latest.interestModel,latest.customerEmail,
    latest.purchaseTimeline,latest.preferredContact,latest.tradeInPlate,latest.desiredEntry,
    latest.desiredPayment,latest.leadTemperature,latest.nextFollowUpAt
  ]);

  const save=async()=>{
    setSaving(true);setFeedback('');
    try{
      await showroomFlowService.updateCrmLead(latest.id,{
        desiredVehicle:desiredVehicle.trim(),
        customerEmail:email.trim(),
        purchaseTimeline,
        preferredContact,
        tradeInPlate,
        desiredEntry:moneyInput(desiredEntry),
        desiredPayment:moneyInput(desiredPayment),
        leadTemperature:temperature,
        nextFollowUpAt:followUp?new Date(followUp).toISOString():'',
      },{email:user.email,name:user.name});
      if(newNote.trim()){
        await showroomFlowService.addCrmNote(latest.id,newNote,{email:user.email,name:user.name});
        setNewNote('');
      }
      setFeedback('Ficha atualizada com sucesso.');
      setEditing(false);
    }catch(error:any){
      setFeedback(error?.message||'Não foi possível salvar a ficha agora.');
    }finally{setSaving(false);}
  };

  return createPortal(<div className="fixed inset-0 z-[640] overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm md:p-6" onClick={onClose}>
    <div className="mx-auto max-w-6xl overflow-hidden rounded-[30px] border border-slate-200 bg-[#f7f9fc] shadow-2xl" onClick={event=>event.stopPropagation()}>
      <header className="flex flex-col gap-4 border-b border-slate-200 bg-white p-5 md:flex-row md:items-start md:justify-between md:p-7">
        <div className="flex gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-200 bg-cyan-50 text-cyan-700"><FileText size={20}/></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-700">FICHA DO CLIENTE · HISTÓRICO COMERCIAL</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">{latest.customerName||'Cliente'}</h2>
            <p className="mt-1 text-sm text-slate-500">Abra, complete e acompanhe o cliente sem perder o histórico do atendimento.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end md:self-auto">
          <button type="button" onClick={()=>{setEditing(value=>!value);setFeedback('');}} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
            <PencilLine size={15}/>{editing?'FECHAR EDIÇÃO':'ADICIONAR DADOS'}
          </button>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-900"><X size={18}/></button>
        </div>
      </header>

      <div className="space-y-5 p-5 md:p-7">
        {feedback&&<div className={'rounded-2xl border px-4 py-3 text-sm '+(feedback.includes('sucesso')?'border-emerald-200 bg-emerald-50 text-emerald-700':'border-amber-200 bg-amber-50 text-amber-800')}>{feedback}</div>}
        <section className="rounded-[24px] border border-emerald-200 bg-white p-4 md:p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">PRÓXIMA AÇÃO</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{latest.nextFollowUpAt?'Retornar: '+dateTime(latest.nextFollowUpAt):'Definir e agendar o próximo contato'}</p>
          <p className="mt-1 text-xs text-slate-500">{latest.desiredVehicle||latest.interestModel||'Interesse ainda não informado'} · {STATUS[latest.status]}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {cleanPhone(latest.phone).length>=10&&<a href={'https://wa.me/'+(cleanPhone(latest.phone).length<=11?'55':'')+cleanPhone(latest.phone)}
              target="_blank" rel="noopener noreferrer" className="grid min-h-11 place-items-center rounded-xl bg-emerald-600 px-2 text-xs font-bold text-white">WhatsApp</a>}
            {onContact&&<button type="button" onClick={()=>onContact(latest)} className="min-h-11 rounded-xl bg-slate-900 px-2 text-xs font-bold text-white">Registrar contato</button>}
            <button type="button" onClick={()=>{setEditing(true);document.getElementById('motyq-dossier-edit')?.scrollIntoView({behavior:'smooth'});}} className="min-h-11 rounded-xl border border-slate-200 px-2 text-xs font-bold text-slate-700">Agendar / editar</button>
            <button type="button" onClick={()=>document.getElementById('motyq-dossier-proposals')?.scrollIntoView({behavior:'smooth'})} className="min-h-11 rounded-xl border border-slate-200 px-2 text-xs font-bold text-slate-700">Nova proposta</button>
            {stockItems.length>0&&<button type="button" onClick={()=>document.getElementById('motyq-dossier-catalog')?.scrollIntoView({behavior:'smooth'})} className="min-h-11 rounded-xl border border-slate-200 px-2 text-xs font-bold text-slate-700">Enviar carros</button>}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card icon={<Phone size={16}/>} label="Telefone" value={phoneMask(latest.phone)||'Não informado'} />
          <Card icon={<CarFront size={16}/>} label="Interesse atual" value={latest.desiredVehicle||latest.interestModel||'Não informado'} />
          <Card icon={<UserRound size={16}/>} label="Vendedor" value={latest.assignedSellerName||'Não informado'} />
          <Card icon={<History size={16}/>} label="Atendimentos" value={String(records.length)} hint={sales?String(sales)+' venda(s) registrada(s)':undefined}/>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Info label="Status atual" value={STATUS[latest.status]} badgeClass={statusClass(latest.status)} />
          <Info label="Origem" value={SOURCE[latest.leadSource||'']||latest.sourceLabel||(latest.origin==='requested'?'Pedido de vendedor':'Passagem de loja')} />
          <Info label="Placa da troca" value={latest.tradeInPlate||'—'} />
          <Info label="Próximo follow-up" value={latest.nextFollowUpAt?dateTime(latest.nextFollowUpAt):'—'} />
        </section>

        {(latest.customerEmail||latest.purchaseTimeline||latest.preferredContact||latest.desiredEntry||latest.desiredPayment)&&<section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Info label="E-mail" value={latest.customerEmail||'—'} />
          <Info label="Prazo de compra" value={TIMELINE[latest.purchaseTimeline||'']||'—'} />
          <Info label="Contato preferido" value={CONTACT[latest.preferredContact||'']||'—'} />
          <Info label="Entrada / parcela" value={(latest.desiredEntry||latest.desiredPayment)?money(latest.desiredEntry)+' / '+money(latest.desiredPayment):'—'} />
        </section>}

        {editing&&<section id="motyq-dossier-edit" className="rounded-[26px] border border-cyan-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700"><PencilLine size={16}/></div>
            <div><h3 className="font-semibold text-slate-900">Completar ficha comercial</h3><p className="mt-1 text-xs text-slate-500">Esses dados ficam no cliente e ajudam o CRM, os follow-ups e o radar de estoque.</p></div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <EditField label="Veículo desejado" value={desiredVehicle} onChange={setDesiredVehicle} placeholder="Ex.: Creta Platinum 2023 até R$ 120 mil"/>
            <EditField label="E-mail" value={email} onChange={setEmail} placeholder="cliente@email.com" type="email"/>
            <SelectField label="Prazo para compra" value={purchaseTimeline} onChange={setPurchaseTimeline} options={TIMELINE}/>
            <SelectField label="Contato preferido" value={preferredContact} onChange={value=>setPreferredContact(value as any)} options={CONTACT}/>
            <EditField label="Placa do carro na troca" value={tradeInPlate} onChange={value=>setTradeInPlate(value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7))} placeholder="ABC1D23"/>
            <SelectField label="Temperatura" value={temperature} onChange={value=>setTemperature(value as CrmLeadTemperature)} options={TEMP}/>
            <EditField label="Entrada desejada" value={desiredEntry} onChange={setDesiredEntry} placeholder="Ex.: 30000"/>
            <EditField label="Parcela desejada" value={desiredPayment} onChange={setDesiredPayment} placeholder="Ex.: 1800"/>
            <label className="md:col-span-2"><span className="mb-1 block text-[10px] font-black uppercase tracking-[.11em] text-slate-400">Próximo follow-up</span><input type="datetime-local" value={followUp} onChange={e=>setFollowUp(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-cyan-400"/></label>
            <label className="md:col-span-2"><span className="mb-1 block text-[10px] font-black uppercase tracking-[.11em] text-slate-400">Nova anotação</span><textarea value={newNote} onChange={e=>setNewNote(e.target.value)} rows={4} placeholder="Ex.: cliente quer branco, tem carro na troca, só consegue vir sábado..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-cyan-400"/></label>
          </div>
          <div className="mt-5 flex justify-end"><button disabled={saving} onClick={save} className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"><Save size={16}/>{saving?'SALVANDO...':'SALVAR NA FICHA'}</button></div>
        </section>}

        <div id="motyq-dossier-proposals"><CrmCommercialProposals lead={current} user={user} stockItems={stockItems}/></div>
        {stockItems.length > 0 && <div id="motyq-dossier-catalog"><CrmPersonalizedCatalog lead={current} user={user} stockItems={stockItems}/></div>}

        <section className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
          <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-700"><MessageSquareText size={17}/><h3 className="font-semibold">Observações registradas</h3></div>
            <p className="mt-1 text-xs text-slate-400">As novas anotações são acrescentadas sem apagar o que já foi escrito.</p>
            <div className="mt-4 space-y-3">
              {!notes.length?<div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">Nenhuma observação foi registrada ainda.</div>:notes.map(item=><div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">{dateTime(item.createdAt)}</p>
                  <span className={'rounded-full border px-2 py-1 text-[10px] font-bold '+statusClass(item.status)}>{STATUS[item.status]}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.notes}</p>
                <p className="mt-2 text-[11px] text-slate-400">{item.assignedSellerName||'Vendedor não informado'}</p>
              </div>)}
            </div>
          </div>

          <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-700"><Clock3 size={17}/><h3 className="font-semibold">Linha do tempo</h3></div>
            <p className="mt-1 text-xs text-slate-400">Alterações da ficha, anotações, etapas e retornos ficam registrados aqui.</p>
            <div className="mt-5 space-y-0">
              {!timeline.length?<div className="text-sm text-slate-500">Sem eventos registrados.</div>:timeline.map((event,index)=><div key={event.id} className="relative grid grid-cols-[22px_1fr] gap-3 pb-5 last:pb-0">
                <div className="relative flex justify-center">
                  <span className="mt-1 h-3 w-3 rounded-full border-2 border-cyan-600 bg-white"/>
                  {index<timeline.length-1&&<span className="absolute top-4 h-[calc(100%-4px)] w-px bg-slate-200"/>}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{event.label}</p>
                    {event.status&&<span className={'rounded-full border px-2 py-0.5 text-[9px] font-bold '+statusClass(event.status)}>{STATUS[event.status]}</span>}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">{dateTime(event.at)}{event.by?' · '+event.by:''}</p>
                  {event.details&&<p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-600">{event.details}</p>}
                </div>
              </div>)}
            </div>
          </div>
        </section>

        <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-700"><Repeat2 size={17}/><h3 className="font-semibold">Todos os atendimentos deste cliente</h3></div>
          <div className="mt-4 space-y-3">
            {records.map(item=><article key={item.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[150px_1fr_1fr_120px] md:items-center">
              <div><p className="text-xs font-semibold text-slate-800">{dateTime(item.createdAt)}</p><p className="mt-1 text-[11px] text-slate-400">{item.sourceLabel||SOURCE[item.leadSource||'']||'ShowroomFlow'}</p></div>
              <div><p className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Procurava</p><p className="mt-1 text-sm text-slate-700">{item.desiredVehicle||item.interestModel||'Não informado'}</p></div>
              <div><p className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Vendedor</p><p className="mt-1 text-sm text-slate-700">{item.assignedSellerName||'Não informado'}</p></div>
              <span className={'w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold '+statusClass(item.status)}>{STATUS[item.status]}</span>
            </article>)}
          </div>
        </section>
      </div>
    </div>
  </div>, document.body);
};

const Card=({icon,label,value,hint}:{icon:React.ReactNode;label:string;value:string;hint?:string})=><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 grid h-8 w-8 place-items-center rounded-xl bg-slate-100 text-slate-600">{icon}</div><p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">{label}</p><p className="mt-1 break-words text-base font-semibold text-slate-900">{value}</p>{hint&&<p className="mt-1 text-[11px] text-slate-400">{hint}</p>}</div>;
const Info=({label,value,badgeClass}:{label:string;value:string;badgeClass?:string})=><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">{label}</p>{badgeClass?<span className={'mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold '+badgeClass}>{value}</span>:<p className="mt-2 break-words text-sm font-semibold text-slate-800">{value}</p>}</div>;
const EditField=({label,value,onChange,placeholder,type='text'}:{label:string;value:string;onChange:(value:string)=>void;placeholder?:string;type?:string})=><label><span className="mb-1 block text-[10px] font-black uppercase tracking-[.11em] text-slate-400">{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-cyan-400"/></label>;
const SelectField=({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:Record<string,string>})=><label><span className="mb-1 block text-[10px] font-black uppercase tracking-[.11em] text-slate-400">{label}</span><select value={value} onChange={e=>onChange(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-cyan-400">{Object.entries(options).map(([key,text])=><option key={key} value={key}>{text}</option>)}</select></label>;

export default CustomerAttendanceDossier;
