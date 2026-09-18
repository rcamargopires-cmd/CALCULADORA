import React, { useMemo } from 'react';
import { CarFront, Clock3, FileText, History, MessageSquareText, Phone, Repeat2, UserRound, X } from 'lucide-react';
import { ShowroomPassage, ShowroomPassageActivity, ShowroomPassageStatus } from '../types';

type Props={selected:ShowroomPassage;items:ShowroomPassage[];onClose:()=>void;};

const STATUS:Record<ShowroomPassageStatus,string>={
  waiting:'Aguardando',in_service:'Em atendimento',evaluation:'Avaliação',proposal:'Proposta',
  follow_up:'Follow-up',sale:'Venda',no_deal:'Sem negócio',
};
const SOURCE:Record<string,string>={showroom:'Loja',whatsapp:'WhatsApp',web:'Web',instagram:'Instagram',manual:'Manual',other:'Outro'};

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
const money=(value?:number)=>Number(value||0)
  ? Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
  : '—';

const isSameCustomer=(base:ShowroomPassage,item:ShowroomPassage)=>{
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

const CustomerAttendanceDossier:React.FC<Props>=({selected,items,onClose})=>{
  const records=useMemo(
    ()=>items.filter(item=>isSameCustomer(selected,item)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),
    [items,selected],
  );
  const latest=records[0]||selected;
  const timeline=useMemo(()=>buildTimeline(records),[records]);
  const notes=records.filter(item=>String(item.notes||'').trim());
  const sales=records.filter(item=>item.status==='sale').length;

  return <div className="fixed inset-0 z-[640] overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm md:p-6" onClick={onClose}>
    <div className="mx-auto max-w-6xl overflow-hidden rounded-[30px] border border-slate-200 bg-[#f7f9fc] shadow-2xl" onClick={event=>event.stopPropagation()}>
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5 md:p-7">
        <div className="flex gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-200 bg-cyan-50 text-cyan-700"><FileText size={20}/></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-700">FICHA DO CLIENTE · HISTÓRICO COMERCIAL</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">{latest.customerName||'Cliente'}</h2>
            <p className="mt-1 text-sm text-slate-500">Tudo que já foi registrado nos atendimentos deste cliente, em ordem cronológica.</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-900"><X size={18}/></button>
      </header>

      <div className="space-y-5 p-5 md:p-7">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card icon={<Phone size={16}/>} label="Telefone" value={phoneMask(latest.phone)||'Não informado'} />
          <Card icon={<CarFront size={16}/>} label="Interesse atual" value={latest.interestModel||'Não informado'} />
          <Card icon={<UserRound size={16}/>} label="Vendedor" value={latest.assignedSellerName||'Não informado'} />
          <Card icon={<History size={16}/>} label="Atendimentos" value={String(records.length)} hint={sales?String(sales)+' venda(s) registrada(s)':undefined}/>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Info label="Status atual" value={STATUS[latest.status]} badgeClass={statusClass(latest.status)} />
          <Info label="Origem" value={SOURCE[latest.leadSource||'']||latest.sourceLabel||(latest.origin==='requested'?'Pedido de vendedor':'Passagem de loja')} />
          <Info label="Placa da troca" value={latest.tradeInPlate||'—'} />
          <Info label="Próximo follow-up" value={latest.nextFollowUpAt?dateTime(latest.nextFollowUpAt):'—'} />
        </section>

        {(latest.desiredEntry||latest.desiredPayment)&&<section className="grid gap-3 md:grid-cols-2">
          <Info label="Entrada desejada" value={money(latest.desiredEntry)} />
          <Info label="Parcela desejada" value={money(latest.desiredPayment)} />
        </section>}

        <section className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
          <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-700"><MessageSquareText size={17}/><h3 className="font-semibold">Observações registradas</h3></div>
            <p className="mt-1 text-xs text-slate-400">Aqui aparece aquele texto digitado no atendimento, preservado junto ao registro.</p>
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
            <p className="mt-1 text-xs text-slate-400">Atendimentos antigos mostram os marcos disponíveis. A partir de agora, as mudanças de etapa passam a ser registradas automaticamente.</p>
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
              <div><p className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Procurava</p><p className="mt-1 text-sm text-slate-700">{item.interestModel||'Não informado'}</p></div>
              <div><p className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Vendedor</p><p className="mt-1 text-sm text-slate-700">{item.assignedSellerName||'Não informado'}</p></div>
              <span className={'w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold '+statusClass(item.status)}>{STATUS[item.status]}</span>
            </article>)}
          </div>
        </section>
      </div>
    </div>
  </div>;
};

const Card=({icon,label,value,hint}:{icon:React.ReactNode;label:string;value:string;hint?:string})=><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 grid h-8 w-8 place-items-center rounded-xl bg-slate-100 text-slate-600">{icon}</div><p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">{label}</p><p className="mt-1 text-base font-semibold text-slate-900">{value}</p>{hint&&<p className="mt-1 text-[11px] text-slate-400">{hint}</p>}</div>;
const Info=({label,value,badgeClass}:{label:string;value:string;badgeClass?:string})=><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">{label}</p>{badgeClass?<span className={'mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold '+badgeClass}>{value}</span>:<p className="mt-2 text-sm font-semibold text-slate-800">{value}</p>}</div>;

export default CustomerAttendanceDossier;
