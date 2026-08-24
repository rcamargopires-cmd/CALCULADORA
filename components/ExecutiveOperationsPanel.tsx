import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CarFront, CheckCircle2, RefreshCw, ShieldAlert, Sparkles, UsersRound } from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { PrepOrder, ShowroomPassage, Store, User } from '../types';

type StoreSummary = {
  id:string;
  companyId:string;
  storeId:string;
  storeName:string;
  updatedAt:string;
  showroom:{total:number;passages:number;requests:number;evaluations:number;proposals:number;sales:number;waiting:number;conversion:number};
  prep:{active:number;overdue:number;soldPriority:number;ready:number;delivery:number};
};

type AlertLevel='critical'|'attention'|'opportunity';
type ExecutiveAlert={id:string;level:AlertLevel;store:string;title:string;detail:string;score:number};
type Props={currentUser:User;companyId:string;stores:Store[]};

const currentMonthKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};
const summaryId=(companyId:string,storeId:string)=>`${companyId}_${storeId}`.replace(/[^a-zA-Z0-9_-]/g,'-');
const isPrepActive=(status:string)=>!['showroom','delivered'].includes(String(status||''));
const isOverdue=(order:PrepOrder)=>order.services.some(service=>{
  if(!service.dueAt||['done','cancelled'].includes(service.status))return false;
  return new Date(service.dueAt).getTime()<Date.now();
});

const calculateShowroom=(items:ShowroomPassage[])=>{
  const month=currentMonthKey();
  const rows=items.filter(item=>String(item.createdAt||'').slice(0,7)===month);
  const total=rows.length;
  const sales=rows.filter(item=>item.status==='sale').length;
  return{
    total,
    passages:rows.filter(item=>item.origin!=='requested').length,
    requests:rows.filter(item=>item.origin==='requested').length,
    evaluations:rows.filter(item=>['evaluation','proposal','follow_up','sale'].includes(item.status)).length,
    proposals:rows.filter(item=>['proposal','follow_up','sale'].includes(item.status)).length,
    sales,
    waiting:rows.filter(item=>item.status==='waiting'||item.status==='in_service').length,
    conversion:total?sales/total*100:0,
  };
};

const calculatePrep=(items:PrepOrder[])=>({
  active:items.filter(item=>isPrepActive(item.status)).length,
  overdue:items.filter(item=>isPrepActive(item.status)&&isOverdue(item)).length,
  soldPriority:items.filter(item=>item.sold&&item.status!=='delivered').length,
  ready:items.filter(item=>item.status==='ready'||item.status==='showroom').length,
  delivery:items.filter(item=>item.destination==='delivery'&&item.status!=='delivered').length,
});

const alertsFromSummary=(item:StoreSummary):ExecutiveAlert[]=>{
  const alerts:ExecutiveAlert[]=[];
  const s=item.showroom,p=item.prep;
  if(s.total>=10&&s.sales===0)alerts.push({id:`${item.id}-no-sales`,level:'critical',store:item.storeName,title:'Fluxo sem conversão',detail:`${s.total} atendimentos no mês e nenhuma venda registrada.`,score:100+s.total});
  else if(s.total>=10&&s.conversion<10)alerts.push({id:`${item.id}-low-conv`,level:'attention',store:item.storeName,title:'Conversão abaixo de 10%',detail:`${s.total} atendimentos com conversão de ${s.conversion.toFixed(1)}%.`,score:70+(10-s.conversion)});
  if(s.waiting>=3)alerts.push({id:`${item.id}-waiting`,level:'attention',store:item.storeName,title:'Fila de atendimento pressionada',detail:`${s.waiting} clientes aguardando ou em atendimento.`,score:55+s.waiting});
  if(s.proposals>=3&&s.sales===0)alerts.push({id:`${item.id}-proposals`,level:'attention',store:item.storeName,title:'Propostas sem fechamento',detail:`${s.proposals} propostas no mês ainda sem venda registrada.`,score:60+s.proposals});
  if(p.overdue>=2)alerts.push({id:`${item.id}-prep-overdue`,level:'critical',store:item.storeName,title:'Preparação com atraso crítico',detail:`${p.overdue} veículos têm serviço vencido.`,score:110+p.overdue});
  else if(p.overdue===1)alerts.push({id:`${item.id}-prep-overdue`,level:'attention',store:item.storeName,title:'Veículo atrasado na preparação',detail:'1 veículo está com serviço vencido e exige acompanhamento.',score:75});
  if(p.soldPriority>=2)alerts.push({id:`${item.id}-sold-priority`,level:'critical',store:item.storeName,title:'Vendidos aguardando preparação',detail:`${p.soldPriority} veículos vendidos ainda dependem da preparação.`,score:105+p.soldPriority});
  else if(p.soldPriority===1)alerts.push({id:`${item.id}-sold-priority`,level:'attention',store:item.storeName,title:'Vendido prioritário',detail:'1 veículo vendido ainda está na fila de preparação.',score:72});
  if(s.total>=5&&s.conversion>=20)alerts.push({id:`${item.id}-good-conv`,level:'opportunity',store:item.storeName,title:'Boa conversão de showroom',detail:`Conversão de ${s.conversion.toFixed(1)}% em ${s.total} atendimentos.`,score:30+s.conversion});
  return alerts;
};

const ExecutiveOperationsPanel:React.FC<Props>=({currentUser,companyId,stores})=>{
  const[summaries,setSummaries]=useState<StoreSummary[]>([]);
  const[loading,setLoading]=useState(false);
  const role=String(currentUser.role||'');

  const readSummary=async(store:Store)=>{
    const snap=await getDoc(doc(db,'executive_store_summary',summaryId(companyId,store.id)));
    return snap.exists()?snap.data() as StoreSummary:null;
  };

  const buildSummary=async(store:Store):Promise<StoreSummary>=>{
    const showroomSnap=await getDocs(query(collection(db,'showroom_passages'),where('companyId','==',companyId),where('storeId','==',store.id)));
    const prepSnap=await getDocs(query(collection(db,'prep_orders'),where('companyId','==',companyId),where('storeId','==',store.id)));
    const showroom=showroomSnap.docs.map(item=>item.data() as ShowroomPassage);
    const prep=prepSnap.docs.map(item=>item.data() as PrepOrder);
    return{id:summaryId(companyId,store.id),companyId,storeId:store.id,storeName:store.name,updatedAt:new Date().toISOString(),showroom:calculateShowroom(showroom),prep:calculatePrep(prep)};
  };

  const load=async()=>{
    setLoading(true);
    try{
      if(role==='admin'){
        const data:StoreSummary[]=[];
        for(const store of stores){
          try{
            const item=await buildSummary(store);
            await setDoc(doc(db,'executive_store_summary',item.id),item,{merge:true});
            data.push(item);
          }catch{}
        }
        setSummaries(data);
      }else{
        const data=(await Promise.all(stores.map(async store=>{try{return await readSummary(store);}catch{return null;}}))).filter(Boolean) as StoreSummary[];
        setSummaries(data);
      }
    }finally{setLoading(false);}
  };

  useEffect(()=>{if(stores.length)load();else setSummaries([]);},[companyId,stores.map(s=>s.id).join('|')]);

  const group=useMemo(()=>{
    const showroom=summaries.reduce((acc,item)=>({
      total:acc.total+item.showroom.total,passages:acc.passages+item.showroom.passages,requests:acc.requests+item.showroom.requests,
      evaluations:acc.evaluations+item.showroom.evaluations,proposals:acc.proposals+item.showroom.proposals,sales:acc.sales+item.showroom.sales,waiting:acc.waiting+item.showroom.waiting,
    }),{total:0,passages:0,requests:0,evaluations:0,proposals:0,sales:0,waiting:0});
    const prep=summaries.reduce((acc,item)=>({active:acc.active+item.prep.active,overdue:acc.overdue+item.prep.overdue,soldPriority:acc.soldPriority+item.prep.soldPriority,ready:acc.ready+item.prep.ready,delivery:acc.delivery+item.prep.delivery}),{active:0,overdue:0,soldPriority:0,ready:0,delivery:0});
    return{showroom:{...showroom,conversion:showroom.total?showroom.sales/showroom.total*100:0},prep};
  },[summaries]);

  const alerts=useMemo(()=>summaries.flatMap(alertsFromSummary).sort((a,b)=>{
    const order={critical:3,attention:2,opportunity:1};
    return order[b.level]-order[a.level]||b.score-a.score;
  }).slice(0,6),[summaries]);
  const riskCount=alerts.filter(a=>a.level!=='opportunity').length;

  return <>
    <section className="mt-5 grid gap-4 lg:grid-cols-2">
      <div className="rounded-[28px] border border-white/10 bg-[#20242c] p-5">
        <div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-300/10 text-violet-300"><UsersRound size={18}/></div><div><p className="text-xs font-bold uppercase tracking-[.14em] text-zinc-500">ShowroomFlow executivo</p><h2 className="mt-1 text-xl font-semibold">Fluxo e conversão</h2></div></div><button onClick={load} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-zinc-400"><RefreshCw size={15} className={loading?'animate-spin':''}/></button></div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Passagens" value={group.showroom.passages}/><Metric label="Pedidos" value={group.showroom.requests}/><Metric label="Vendas" value={group.showroom.sales}/><Metric label="Conversão" value={`${group.showroom.conversion.toFixed(1)}%`}/></div>
        <div className="mt-4 grid grid-cols-3 gap-2"><Mini label="Avaliações" value={group.showroom.evaluations}/><Mini label="Propostas" value={group.showroom.proposals}/><Mini label="Em atendimento" value={group.showroom.waiting}/></div>
        <p className="mt-4 text-xs text-zinc-500">Mês atual. Apenas números agregados, sem dados de clientes.</p>
      </div>

      <div className="rounded-[28px] border border-white/10 bg-[#20242c] p-5">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300/10 text-cyan-300"><CarFront size={18}/></div><div><p className="text-xs font-bold uppercase tracking-[.14em] text-zinc-500">PrepTrack executivo</p><h2 className="mt-1 text-xl font-semibold">Preparação e risco de entrega</h2></div></div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Em preparação" value={group.prep.active}/><Metric label="Atrasados" value={group.prep.overdue} danger={group.prep.overdue>0}/><Metric label="Vendidos prioritários" value={group.prep.soldPriority} attention={group.prep.soldPriority>0}/><Metric label="Para entrega" value={group.prep.delivery}/></div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-4"><div className="flex items-center gap-2"><Activity size={15} className="text-zinc-500"/><p className="text-xs font-semibold text-zinc-300">{group.prep.overdue>0?`${group.prep.overdue} veículo(s) com serviço vencido exigem atenção.`:group.prep.soldPriority>0?`${group.prep.soldPriority} veículo(s) vendidos estão na fila de preparação.`:'Nenhum risco operacional crítico de preparação neste momento.'}</p></div></div>
        <p className="mt-4 text-xs text-zinc-500">Resumo executivo. Prestadores, custos e observações continuam restritos à operação.</p>
      </div>
    </section>

    <section className="mt-5 rounded-[28px] border border-white/10 bg-[#20242c] p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-3"><div className={`grid h-10 w-10 place-items-center rounded-xl ${riskCount?'bg-amber-300/10 text-amber-300':'bg-emerald-300/10 text-emerald-300'}`}>{riskCount?<ShieldAlert size={18}/>:<Sparkles size={18}/>}</div><div><p className="text-xs font-bold uppercase tracking-[.14em] text-zinc-500">Alertas executivos inteligentes</p><h2 className="mt-1 text-xl font-semibold">Radar operacional</h2></div></div><div className="text-xs text-zinc-500">{riskCount?`${riskCount} ponto(s) exigem leitura`:'Operação sem alerta relevante'}</div></div>
      {alerts.length?<div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{alerts.map(alert=><AlertCard key={alert.id} alert={alert}/>)}</div>:<div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[.04] p-4"><CheckCircle2 size={18} className="text-emerald-300"/><div><p className="text-sm font-semibold text-emerald-200">Nenhum alerta operacional relevante agora.</p><p className="mt-1 text-xs text-zinc-500">O radar evita alertar conversão com amostra pequena e prioriza riscos reais de atendimento e entrega.</p></div></div>}
      <p className="mt-4 text-[11px] text-zinc-600">Critérios usam volume mínimo para conversão e prioridade imediata para atrasos de preparação e veículos vendidos.</p>
    </section>
  </>;
};

const AlertCard=({alert}:{alert:ExecutiveAlert})=>{
  const critical=alert.level==='critical',opportunity=alert.level==='opportunity';
  return <div className={`rounded-2xl border p-4 ${critical?'border-red-400/20 bg-red-400/[.035]':opportunity?'border-emerald-400/20 bg-emerald-400/[.035]':'border-amber-300/20 bg-amber-300/[.035]'}`}><div className="flex items-start gap-3">{critical?<ShieldAlert size={17} className="mt-0.5 shrink-0 text-red-300"/>:opportunity?<Sparkles size={17} className="mt-0.5 shrink-0 text-emerald-300"/>:<AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-300"/>}<div><div className="flex flex-wrap items-center gap-2"><span className={`text-[9px] font-black uppercase tracking-wide ${critical?'text-red-300':opportunity?'text-emerald-300':'text-amber-300'}`}>{critical?'Crítico':opportunity?'Destaque':'Atenção'}</span><span className="text-[10px] text-zinc-600">{alert.store}</span></div><p className="mt-1 text-sm font-semibold text-white">{alert.title}</p><p className="mt-2 text-xs leading-5 text-zinc-400">{alert.detail}</p></div></div></div>;
};
const Metric=({label,value,danger=false,attention=false}:{label:string;value:string|number;danger?:boolean;attention?:boolean})=><div className={`rounded-2xl border p-4 ${danger?'border-red-400/20 bg-red-400/[.035]':attention?'border-amber-300/20 bg-amber-300/[.035]':'border-white/10 bg-black/15'}`}><p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p></div>;
const Mini=({label,value}:{label:string;value:number})=><div className="rounded-xl bg-black/15 p-3"><p className="text-[9px] font-bold uppercase tracking-wide text-zinc-600">{label}</p><p className="mt-1 text-base font-semibold text-zinc-200">{value}</p></div>;

export default ExecutiveOperationsPanel;
