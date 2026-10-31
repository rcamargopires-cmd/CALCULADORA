import React,{useEffect,useMemo,useState} from 'react';
import {ArrowDownToLine,Building2,CheckCircle2,Clock3,FileClock,Handshake,
  Info,LockKeyhole,Send,ShieldAlert,Smartphone,TriangleAlert,XCircle} from 'lucide-react';
import type {User} from '../types';
import {
 applyManagerDecision,canManagerApprove,exportApprovalEventsCsv,
 exportApprovalsCsv,fakeManagerActor,getLocalApprovalRequests,
 isApprovalApplicable,newApprovalFromConsultedCase,normalizedEmail,
 upsertLocalApproval,type ApprovalActor,type ApprovalDecision,type ManagerApproval
} from '../services/marketIqApprovalModel';
import {
 loadConsultedCases,chooseBestConfirmedOffer,moneyNumber,formatReais,
 type ConsultedCase
} from '../services/marketIqConsultedRepasse';
import {
 CLOUD_APPROVALS_ENABLED,publishApprovalRequest,subscribeSharedApprovals,decideSharedApproval
} from '../services/marketIqApprovalCloud';

const cssInput='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100';
const cssButton='inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';
const dateStr=(s:string)=>{
 try {return new Date(s).toLocaleString('pt-BR')} catch {return s}
};
const statusName:Record<string,string>={
 pending:'Aguardando gerente',approved:'Aprovado',countered:'Contraproposta',
 rejected:'Recusado',cancelled:'Cancelado'
};
const download=(csv:string,name:string)=>{
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
};
const vehicleName=(r:ConsultedCase)=>[r.vehicle.brand,r.vehicle.model,r.vehicle.year].filter(Boolean).join(' ');
const requestName=(r:ManagerApproval)=>[r.vehicle.brand,r.vehicle.model,r.vehicle.year].filter(Boolean).join(' ');
const actorFor=(user:User):ApprovalActor=>({
 email:normalizedEmail(user.email),name:user.name||user.email,
 role:user.role,companyId:user.companyId||'abrao-reze',
 storeId:user.storeId||'outlet-sorocaba'
});
const indicatorClass=(s:string)=>s==='approved'?'bg-emerald-50 text-emerald-800':
 s==='rejected'?'bg-rose-50 text-rose-800':
 s==='countered'?'bg-indigo-50 text-indigo-800':
 s==='pending'?'bg-amber-50 text-amber-800':'bg-slate-100 text-slate-700';

export default function MarketIqApprovalCenter({user,managerOnly=false}:{user:User;managerOnly?:boolean}){
 const actor=useMemo(()=>actorFor(user),[user]);
 const [cases,setCases]=useState<ConsultedCase[]>(()=>loadConsultedCases(user.email));
 const [requests,setRequests]=useState<ManagerApproval[]>(()=>
    CLOUD_APPROVALS_ENABLED?[]:getLocalApprovalRequests(user.email));
 const [selectedCaseId,setSelectedCaseId]=useState(()=>{
     try{return sessionStorage.getItem('motyq-iq-manager-case-'+user.email.toLowerCase())||'';}catch{return '';}
   });
 const [requestReason,setRequestReason]=useState('');
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const [working,setWorking]=useState(false);
 const [simulation,setSimulation]=useState(false);
 const [scope,setScope]=useState<'pending'|'all'>('pending');
 const [activeId,setActiveId]=useState('');
 const [decision,setDecision]=useState<ApprovalDecision>('approved');
 const [decisionAmount,setDecisionAmount]=useState('');
 const [decisionReason,setDecisionReason]=useState('');
 const [expanded,setExpanded]=useState<string[]>([]);
 const isManager=['manager','admin'].includes(actor.role);
 const stageMode=!CLOUD_APPROVALS_ENABLED;
 const decisionActor=stageMode&&simulation?fakeManagerActor(actor):actor;

 useEffect(()=>{
   const refresh=()=>setCases(loadConsultedCases(user.email));
   const onStorage=(event:StorageEvent)=>{
     if(event.key?.includes('motyq-iq-repasse-consulta-preview'))refresh();
   };
   window.addEventListener('motyq:repasse-consulta-saved',refresh);
   window.addEventListener('storage',onStorage);
   return ()=>{window.removeEventListener('motyq:repasse-consulta-saved',refresh);window.removeEventListener('storage',onStorage);};
 },[user.email]);
 useEffect(()=>{
   if(CLOUD_APPROVALS_ENABLED) {
     return subscribeSharedApprovals(actor,setRequests,(err)=>setError(
       'Não foi possível carregar solicitações compartilhadas: '+err.message));
   }
   const refresh=()=>setRequests(getLocalApprovalRequests(user.email));
   const storage=(event:StorageEvent)=>{
     if(event.key?.includes('motyq-iq-approval-preview-local'))refresh();
   };
   window.addEventListener('motyq:approvals-local-saved',refresh);
   window.addEventListener('storage',storage);
   return ()=>{window.removeEventListener('motyq:approvals-local-saved',refresh);window.removeEventListener('storage',storage);};
 },[user.email,actor]);
 const caseId=selectedCaseId||cases.find(x=>x.state!=='arquivado')?.id||'';
 const selected=cases.find(c=>c.id===caseId);
 const candidate=selected?chooseBestConfirmedOffer(selected.offers,selected.costs):null;
 const [approved,setApproved]=useState(false);
 const requestsForCurrent=requests.filter(x=>!selected||x.sourceCaseId===selected.id);
 const pending=requests.filter(x=>x.status==='pending');
 const previousApproved=requests.filter(x=>x.status==='approved');
 const decisionTarget=requests.find(x=>x.id===activeId)||null;
 const applicable=requests.filter(r=>r.status==='approved'&&cases.some(c=>isApprovalApplicable(r,c)));
 const awaitingManager=isManager||simulation;
 const visible=scope==='pending'?requests.filter(r=>r.status==='pending'):requests;
 const canDecide=(req:ManagerApproval)=>req.status==='pending'&&canManagerApprove(decisionActor,req)&&
   ((CLOUD_APPROVALS_ENABLED&&isManager)||(stageMode&&simulation));

 const create=async()=>{
   setError('');setNotice('');
   if(!selected){setError('Salve um caso em Repasse Sob Consulta e selecione-o aqui.');return;}
   if(requests.some(x=>x.sourceCaseId===selected.id&&x.sourceCaseVersion===selected.version&&x.status==='pending')){
     setError('Já existe uma solicitação pendente para esta versão da negociação.');return;
   }
   setWorking(true);
   try{
     const req=newApprovalFromConsultedCase(selected,actor,requestReason,stageMode);
     if(CLOUD_APPROVALS_ENABLED)await publishApprovalRequest(req);
     else upsertLocalApproval(user.email,req);
     setRequestReason('');
     setNotice(CLOUD_APPROVALS_ENABLED
       ?'Solicitação encaminhada para gerente. Aguardando decisão.'
       :'Solicitação simulada salva neste navegador. Ela NÃO chegou a um gerente real.');
   }catch(e:any){setError(e?.message||'Falha ao criar solicitação.');}
   finally{setWorking(false);}
 };
 const openDecision=(req:ManagerApproval)=>{
   setActiveId(req.id);setDecision('approved');
   setDecisionAmount(String(req.requestedBuy));setDecisionReason('');
   setError('');setNotice('');
   window.setTimeout(()=>document.getElementById('motyq-iq-decision-form')?.scrollIntoView({block:'nearest',behavior:'smooth'}),40);
 };
 const commitDecision=async()=>{
   if(!decisionTarget)return;
   setError('');setNotice('');
   setWorking(true);
   try{
     const value=decision==='rejected'?null:moneyNumber(decisionAmount);
     if(CLOUD_APPROVALS_ENABLED) {
       // Re-read and decide with optimistic concurrency transaction.
       await decideSharedApproval(actor,decisionTarget.id,decision,value,decisionReason);
     }else{
       const latest=getLocalApprovalRequests(user.email).find(x=>x.id===decisionTarget.id);
       if(!latest)throw Error('Solicitação não encontrada neste navegador.');
       const updated=applyManagerDecision(latest,decisionActor,decision,value,decisionReason);
       upsertLocalApproval(user.email,updated);
     }
     setActiveId('');setDecisionReason('');
     setNotice(stageMode?'Decisão fictícia registrada no histórico local, sem autorização real.'
       :'Decisão gerencial registrada. O solicitante poderá consultar o resultado.');
   }catch(e:any){setError(e?.message||'Falha ao registrar decisão.');}
   finally{setWorking(false);}
 };
 const toggleHistory=(id:string)=>setExpanded(keys=>keys.includes(id)?keys.filter(x=>x!==id):[...keys,id]);
 return <div className="space-y-5 pb-8 text-slate-900">
  <div className="motyq-iq-hero relative overflow-hidden rounded-3xl bg-[#132f40] p-6 text-white md:p-8">
   <div className="absolute -right-8 -top-12 h-52 w-52 rounded-full bg-indigo-300/10 blur-2xl"/>
   <div className="relative flex flex-wrap justify-between gap-4">
    <div>
     <p className="motyq-iq-hero-eyebrow flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-cyan-200"><Smartphone size={16}/> Aprovações · Motyq IQ</p>
     <h2 className="motyq-iq-hero-title mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">Solicitações e decisões da Mesa</h2>
     <p className="motyq-iq-hero-description mt-2 max-w-2xl text-sm leading-6 text-slate-200">
       Solicitar revisão sem interromper a negociação, preservar a recomendação técnica e guardar
       o valor decidido com responsável, justificativa e histórico.
     </p>
    </div>
    <span className="motyq-iq-hero-status self-start rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-black">
     {stageMode?'Simulação local · sem aprovação real':'Fluxo compartilhado'}
    </span>
   </div>
  </div>
  {stageMode?<div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
    <ShieldAlert size={18} className="mt-0.5 shrink-0"/><p><strong>Ambiente de demonstração:</strong> as solicitações e decisões ficam apenas neste navegador.
    Não são enviadas ao celular de outro usuário nem autorizam a compra. A infraestrutura de compartilhamento e as regras de acesso foram preparadas,
    mas ainda dependem de validação e ativação no banco de testes.</p>
   </div>:<div className="flex items-start gap-2 rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-xs text-cyan-900">
    <LockKeyhole size={18} className="shrink-0"/>As decisões compartilhadas exigem autenticação e permissões de gerente. A pessoa que solicitou não pode aprovar a própria exceção.</div>}
  <div className="grid grid-cols-3 gap-3">
   {[
    ['Pendentes',pending.length,'text-amber-700'],
    ['Decididas',requests.length-pending.length,'text-slate-900'],
    ['Autorizações vigentes',applicable.length,'text-emerald-800']
   ].map(([title,value,cls])=><div key={String(title)} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <p className={'mt-2 text-2xl font-black md:text-3xl '+cls}>{value}</p>
      <p className="mt-1 text-[10px] leading-4 text-slate-500">{
       title==='Autorizações vigentes'?'Só para a versão do caso que foi analisada':'No escopo deste ambiente'
      }</p>
   </div>)}
  </div>
  {!managerOnly&&<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="flex items-center gap-2"><Send size={19} className="text-cyan-700"/><h3 className="text-lg font-black">Solicitar revisão à gerência</h3></div>
   <p className="mt-1 text-xs leading-5 text-slate-500">
    É necessário salvar a negociação na aba “Repasse Sob Consulta” antes de solicitar.
    Os dados, os custos, a oferta da loja e o teto serão congelados nesta versão para auditoria.</p>
   <div className="mt-4 grid gap-3 md:grid-cols-2">
    <label><span className="mb-1 block text-xs font-bold text-slate-600">Caso salvo</span>
     <select className={cssInput} value={caseId} onChange={e=>setSelectedCaseId(e.target.value)}>
      {!cases.length&&<option value="">Nenhum repasse salvo</option>}
      {cases.filter(x=>x.state!=='arquivado').map(item=><option key={item.id} value={item.id}>{vehicleName(item)} · v{item.version}</option>)}
     </select>
    </label>
    <div className="rounded-xl bg-slate-50 p-3 text-xs">
     <div className="flex justify-between"><span>Teto técnico da negociação</span><strong>{candidate?formatReais(candidate.calculation.ceiling):'Indisponível'}</strong></div>
     <div className="mt-2 flex justify-between"><span>Valor solicitado à gerência</span><strong>{selected?.proposedBuy?formatReais(moneyNumber(selected.proposedBuy)):'Não informado'}</strong></div>
     {candidate&&selected&&moneyNumber(selected.proposedBuy)>candidate.calculation.ceiling&&
      <p className="mt-2 font-bold text-amber-800">Valor acima do teto técnico. Justificativa obrigatória.</p>}
    </div>
    <label className="md:col-span-2"><span className="mb-1 block text-xs font-bold text-slate-600">Justificativa da Mesa</span>
     <textarea className={cssInput} rows={3} maxLength={600} value={requestReason} onChange={e=>setRequestReason(e.target.value)}
      placeholder="Explique a exceção, condição comercial ou motivo da solicitação de revisão."/>
    </label>
   </div>
   <button className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
    disabled={working||!selected||!candidate||!selected.proposedBuy} onClick={()=>void create()}><Send size={16}/>{stageMode?'Registrar solicitação fictícia':'Enviar solicitação ao gerente'}</button>
   {selected&&!candidate&&<p className="mt-2 text-xs text-amber-800">O caso precisa ter oferta confirmada e válida e os custos fiscais preenchidos para solicitação.</p>}
  </section>}
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div><h3 className="flex items-center gap-2 text-lg font-black"><FileClock size={18}/>Caixa de solicitações</h3>
     <p className="mt-1 text-xs text-slate-500">Pendências, decisões, justificativas e histórico preservados por caso.</p></div>
    <div className="flex flex-wrap gap-2">
     <button type="button" className={cssButton} disabled={!requests.length} onClick={()=>download(exportApprovalsCsv(requests),'motyq-iq-aprovacoes.csv')}>
      <ArrowDownToLine size={15}/>Relatório CSV</button>
     <button type="button" className={cssButton} disabled={!requests.length} onClick={()=>download(exportApprovalEventsCsv(requests),'motyq-iq-aprovacoes-log.csv')}>
      <ArrowDownToLine size={15}/>Log CSV</button>
    </div>
   </div>
   <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
    <div className="flex gap-2">{(['pending','all'] as const).map(s=><button key={s} className={'rounded-lg px-3 py-2 text-xs font-bold '+(scope===s?'bg-[#153f51] text-white':'bg-slate-100 text-slate-600')}
      onClick={()=>setScope(s)}>{s==='pending'?'Pendentes':'Todas'}</button>)}</div>
    {stageMode&&<button type="button" aria-pressed={simulation} onClick={()=>{setSimulation(s=>!s);setActiveId('');}}
      className={'rounded-xl border px-3 py-2 text-xs font-black '+(simulation?'border-indigo-300 bg-indigo-50 text-indigo-800':'border-slate-300 text-slate-600')}>
       <Smartphone size={15} className="mr-2 inline"/> {simulation?'Sair da simulação do gerente':'Simular tela do gerente'}
      </button>}
   </div>
   {stageMode&&simulation&&<p className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs font-bold text-indigo-900">
    Você está simulando um gerente fictício. Nenhuma decisão aqui tem validade operacional ou substitui uma conta de gerente autenticada.
   </p>}
   {!visible.length?<p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
    {scope==='pending'?'Nenhuma solicitação pendente neste ambiente.':'Ainda não há solicitações registradas.'}</p>:
    <div className="mt-4 space-y-3">{visible.map(req=>{
     const editable=canDecide(req);
     const isStale=req.status==='approved'&&!cases.some(c=>isApprovalApplicable(req,c));
     const isApprover=normalizedEmail(decisionActor.email)===normalizedEmail(req.decidedByEmail||'');
     return <article key={req.id} className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div className="min-w-0">
        <h4 className="text-base font-black">{requestName(req)}</h4>
        <p className="mt-1 text-xs text-slate-500"><Building2 size={13} className="mr-1 inline"/>{req.outlet.name} · {req.storeId} · v{req.sourceCaseVersion}</p>
        <p className="mt-1 text-[11px] text-slate-500">{dateStr(req.createdAt)} · solicitado por {req.requesterName}</p>
       </div>
       <span className={'rounded-full px-3 py-1.5 text-[11px] font-black '+indicatorClass(req.status)}>
        {statusName[req.status]}{req.demoOnly?' · teste':''}
       </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
       {[
        ['Oferta da loja',formatReais(req.outlet.offer)],
        ['Teto técnico',formatReais(req.suggestedCeiling)],
        ['Pedido da Mesa',formatReais(req.requestedBuy)],
        ['Decisão do gerente',typeof req.decidedBuy==='number'?formatReais(req.decidedBuy):'Aguardando']
       ].map(([name,val])=><div key={name} className="rounded-xl bg-slate-50 p-3">
         <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{name}</p>
         <p className="mt-1 text-base font-black text-slate-900">{val}</p>
       </div>)}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600"><strong>Motivo da Mesa:</strong> {req.requestReason}</p>
      {req.decisionReason&&<p className="mt-2 text-xs leading-5 text-slate-600"><strong>Decisão:</strong> {req.decisionReason} · {req.decidedByName}</p>}
      {isStale&&<p className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
       <TriangleAlert size={15}/> Autorização não aplicável: negociação alterada, oferta vencida ou caso não disponível neste navegador.
      </p>}
      {editable&&<button type="button" onClick={()=>openDecision(req)}
        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-xs font-black text-white">
       <Handshake size={16}/>{stageMode?'Simular decisão':'Analisar solicitação'}
      </button>}
      <button type="button" onClick={()=>toggleHistory(req.id)} className="ml-2 mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700">
       {expanded.includes(req.id)?'Ocultar histórico':'Ver histórico'}
      </button>
      {expanded.includes(req.id)&&<div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
       {req.events.map(ev=><div key={ev.id} className="border-b border-slate-200 py-2 last:border-none">
        <p className="text-xs font-bold">{ev.action.toUpperCase()} · {dateStr(ev.at)} · {ev.actorName}</p>
        <p className="mt-1 text-xs text-slate-600">{ev.reason}</p>
        <p className="mt-1 text-[11px] text-slate-500">Valor anterior: {ev.previousValue!==null?formatReais(ev.previousValue):'—'} · Novo valor: {ev.value!==null?formatReais(ev.value):'—'}</p>
       </div>)}
      </div>}
     </article>
    })}</div>}
  </section>
  {decisionTarget&&canDecide(decisionTarget)&&<section id="motyq-iq-decision-form" className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5 shadow-sm">
   <h3 className="text-lg font-black">Decisão sobre {requestName(decisionTarget)}</h3>
   <p className="mt-1 text-xs text-slate-600">Somente a decisão desta solicitação será registrada. A recomendação técnica original permanece preservada.</p>
   <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
    <label><span className="mb-1 block text-xs font-bold text-slate-700">Decisão</span>
     <select className={cssInput} value={decision} onChange={e=>setDecision(e.target.value as ApprovalDecision)}>
      <option value="approved">Aprovar valor</option>
      <option value="countered">Contraproposta do gerente</option>
      <option value="rejected">Recusar solicitação</option>
     </select></label>
    {decision!=='rejected'&&<label><span className="mb-1 block text-xs font-bold text-slate-700">Valor decidido (R$)</span>
     <input className={cssInput} value={decisionAmount} onChange={e=>setDecisionAmount(e.target.value)} inputMode="decimal" placeholder="125000"/></label>}
    <label className="sm:col-span-2"><span className="mb-1 block text-xs font-bold text-slate-700">Justificativa obrigatória</span>
     <textarea className={cssInput} rows={3} value={decisionReason} maxLength={600} onChange={e=>setDecisionReason(e.target.value)}
       placeholder="Explique a autorização, a contraproposta ou a recusa."/></label>
   </div>
   <div className="mt-4 flex flex-wrap gap-2">
    <button disabled={working} className="inline-flex items-center gap-2 rounded-xl bg-[#153f51] px-5 py-3 text-sm font-black text-white disabled:opacity-40" onClick={()=>void commitDecision()}>
     <CheckCircle2 size={16}/>{stageMode?'Registrar decisão simulada':'Confirmar decisão gerencial'}</button>
    <button className={cssButton} onClick={()=>setActiveId('')}>Cancelar</button>
   </div>
  </section>}
  {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-900">{error}</p>}
  {notice&&<p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">{notice}</p>}
  <footer className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-600">
   <Info size={17} className="mt-0.5 shrink-0"/>
   <p><strong>Controle de exceções:</strong> a decisão vigente só se aplica à versão exata da negociação e enquanto a oferta da loja compradora permanecer válida. Mudanças nos custos, na oferta ou no valor solicitado exigem nova revisão. Não executa compra, transferência, pagamento ou emissão de NF.</p>
  </footer>
 </div>;
}
