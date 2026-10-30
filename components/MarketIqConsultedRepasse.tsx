import React,{useEffect,useMemo,useState} from 'react';
import {ArrowDownToLine,ArrowRight,Building2,Calculator,CheckCircle2,
  Clock3,FileClock,FileText,HandCoins,Info,Plus,Save,ShieldAlert,Trash2} from 'lucide-react';
import type {User} from '../types';
import {getLocalApprovalRequests,isApprovalApplicable,type ApprovalActor,type ManagerApproval}
 from '../services/marketIqApprovalModel';
import {CLOUD_APPROVALS_ENABLED,subscribeSharedApprovals} from '../services/marketIqApprovalCloud';
import {
  appendConsultedAudit, calculateConsultedOffer, chooseBestConfirmedOffer,
  emptyConsultedCosts, emptyConsultedOffer, emptyConsultedVehicle,consultedFinancialInputsReady,consultedCostInputsValid,isValidConsultedMoney,
  exportConsultedLogCsv, exportConsultedReportCsv, formatReais,
  loadConsultedCases, makeConsultedId,moneyNumber,offerIsEligible,
  saveConsultedCases, type ConsultedCase,type ConsultedCosts,
  type ConsultedOffer,type ConsultedVehicle,
} from '../services/marketIqConsultedRepasse';

const input='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100';
const label='mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-500';
const smallBtn='inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50';
const now=()=>new Date().toISOString();
const newCase=(vehicle?:Partial<ConsultedVehicle>):ConsultedCase=>({
 id:makeConsultedId(),createdAt:now(),updatedAt:now(),version:0,
 vehicle:{...emptyConsultedVehicle(),...vehicle},
 offers:[emptyConsultedOffer()],costs:emptyConsultedCosts(),
 selectedOfferId:'',proposedBuy:'',state:'consulta',events:[],
});
const download=(content:string,file:string)=>{
 const blob=new Blob([content],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);const link=document.createElement('a');
 link.href=url;link.download=file;document.body.append(link);link.click();link.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),1000);
};
const formatDate=(date:string)=>{
 if(!date)return '—';
 try{return new Date(date).toLocaleString('pt-BR');}catch{return date;}
};
const fieldName=(key:string)=>({
 invoice:'Despesas de NF (R$)',taxesFixed:'Impostos fixos (R$)',
 taxesPercent:'Alíquota estimada (%)',transport:'Transporte (R$)',
 preparation:'Preparação (R$)',other:'Outras despesas (R$)',
 margin:'Margem desejada',marginMode:'Tipo de margem',
}[key as keyof ConsultedCosts]||key);
const vehicleDescription=(c:ConsultedVehicle)=>(c.brand+' '+c.model+' '+c.year).trim()||'Veículo não informado';

export default function MarketIqConsultedRepasse({user,vehicleFromDesk,onOpenApprovals}:{
 user:User;vehicleFromDesk:Partial<ConsultedVehicle>;onOpenApprovals?:()=>void;
}){
 const email=String(user.email||'').toLowerCase();
 const draftKey='motyq-iq-repasse-draft-v1-'+email;
 const [rows,setRows]=useState<ConsultedCase[]>(()=>loadConsultedCases(email));
 const [approvals,setApprovals]=useState<ManagerApproval[]>(()=>CLOUD_APPROVALS_ENABLED?[]:getLocalApprovalRequests(email));
 useEffect(()=>{
   if(CLOUD_APPROVALS_ENABLED){
     const actor:ApprovalActor={email,name:user.name||email,role:user.role,
       companyId:user.companyId||'abrao-reze',storeId:user.storeId||'outlet-sorocaba'};
     return subscribeSharedApprovals(actor,setApprovals,()=>{});
   }
   const refresh=()=>setApprovals(getLocalApprovalRequests(email));
   const storage=(event:StorageEvent)=>{if(event.key?.includes('motyq-iq-approval-preview-local'))refresh();};
   window.addEventListener('motyq:approvals-local-saved',refresh);
   window.addEventListener('storage',storage);
   return ()=>{window.removeEventListener('motyq:approvals-local-saved',refresh);window.removeEventListener('storage',storage);};
 },[email,user.name,user.role,user.companyId,user.storeId]);
 const [draft,setDraft]=useState<ConsultedCase>(()=>{
   try{
     const saved=JSON.parse(sessionStorage.getItem(draftKey)||'null');
     return saved&&saved.id&&Array.isArray(saved.offers)&&saved.costs&&saved.vehicle?saved:newCase(vehicleFromDesk);
   }catch{return newCase(vehicleFromDesk);}
 });
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const [showAudit,setShowAudit]=useState(false);
 const [showArchive,setShowArchive]=useState(false);

 useEffect(()=>{try{sessionStorage.setItem(draftKey,JSON.stringify(draft));}catch{}},[draft,draftKey]);
 const updateVehicle=(key:keyof ConsultedVehicle,v:string)=>
   setDraft(d=>({...d,vehicle:{...d.vehicle,[key]:key==='fipe'?moneyNumber(v):v}}));
 const updateCosts=(key:keyof ConsultedCosts,v:string)=>
   setDraft(d=>({...d,costs:{...d.costs,[key]:v}}));
 const updateOffer=(id:string,key:keyof ConsultedOffer,v:string)=>
   setDraft(d=>({...d,offers:d.offers.map(o=>o.id===id?{...o,[key]:v}:o)}));
 const financialReady=consultedFinancialInputsReady(draft.costs);
 const calculations=useMemo(()=>draft.offers.map(offer=>({
   offer,calculation:calculateConsultedOffer(offer,draft.costs),
   eligible:offerIsEligible(offer),
 })),[draft.offers,draft.costs]);
 const best=useMemo(()=>chooseBestConfirmedOffer(draft.offers,draft.costs),[draft.offers,draft.costs]);
 const chosen=financialReady?calculations.find(row=>row.offer.id===draft.selectedOfferId&&row.eligible&&row.calculation.ceiling>0):undefined;
 const current=chosen??(best?{...best,eligible:true}:null);
 const selectedOffer=current?.offer??null;
 const estimatedPrice=current?.calculation.ceiling??null;
 const requestedBuy=moneyNumber(draft.proposedBuy);
 const appliedDecision=approvals.filter(req=>req.status==='approved'&&isApprovalApplicable(req,draft))
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]||null;
 const pendingDecision=approvals.find(req=>req.sourceCaseId===draft.id&&req.sourceCaseVersion===draft.version&&req.status==='pending');
 const expectedProfit=current&&requestedBuy>0?current.calculation.netBeforeMargin-requestedBuy:null;
 const overCeiling=estimatedPrice!==null&&requestedBuy>estimatedPrice;
 const taxRate=moneyNumber(draft.costs.taxesPercent);
 const percentMargin=moneyNumber(draft.costs.margin);
 const validCosts=consultedCostInputsValid(draft.costs);
 const before=rows.find(r=>r.id===draft.id)||null;
 const changed=before?JSON.stringify({
    vehicle:draft.vehicle,offers:draft.offers,costs:draft.costs,
    selectedOfferId:draft.selectedOfferId,proposedBuy:draft.proposedBuy,state:draft.state,
   })!==JSON.stringify({
    vehicle:before.vehicle,offers:before.offers,costs:before.costs,
    selectedOfferId:before.selectedOfferId,proposedBuy:before.proposedBuy,state:before.state,
   }):true;
 const save=(override?:'arquivado'|'consulta')=>{
   setNotice('');setError('');
   const next={...draft,state:override||draft.state};
   if(!next.vehicle.brand.trim()||!next.vehicle.model.trim()){
     setError('Preencha marca e modelo do veículo antes de salvar.');return;
   }
   if(!validCosts){setError('Verifique os custos e as alíquotas. Digite somente valores numéricos não negativos e percentuais de até 100%.');return;}
   if(next.proposedBuy.trim()&&!isValidConsultedMoney(next.proposedBuy,false)){
     setError('Informe um valor de compra numérico válido.');return;
   }
   if(next.offers.length===0||!next.offers.some(o=>o.buyer.trim()&&moneyNumber(o.value)>0)){
     setError('Registre ao menos uma oferta de uma loja com nome e valor positivo.');return;
   }
   if(next.offers.some(o=>o.status==='confirmada'&&(!o.validUntil||!o.buyer.trim()||moneyNumber(o.value)<=0))){
     setError('Para marcar uma oferta como confirmada, informe loja, valor e validade.');return;
   }
   const was=rows.find(r=>r.id===next.id)||null;
   if(was&&!changed&&was.state===next.state){setNotice('Nenhuma alteração desde o último salvamento.');return;}
   const updated=appendConsultedAudit(was,next,user.email||'usuário');
   const nextRows=[updated,...rows.filter(r=>r.id!==updated.id)].slice(0,300);
   try{saveConsultedCases(email,nextRows);setRows(nextRows);setDraft(updated);
     setNotice('Consulta salva neste navegador. Versão '+updated.version+
       ' registrada no histórico local. Nenhuma compra foi aprovada ou executada.');
   }catch{setError('Não foi possível gravar o histórico local. Verifique o espaço disponível no navegador.');}
 };
 const open=(item:ConsultedCase)=>{
   setDraft(item);setNotice('Versão '+item.version+' reaberta. Alterações futuras gerarão novo evento.');
   setError('');setShowAudit(true);window.scrollTo({top:0,behavior:'smooth'});
 };
 const addOffer=()=>setDraft(d=>({...d,offers:[...d.offers,emptyConsultedOffer()]}));
 const removeOffer=(id:string)=>setDraft(d=>({...d,
   offers:d.offers.filter(o=>o.id!==id),
   selectedOfferId:d.selectedOfferId===id?'':d.selectedOfferId,
 }));
 const bringVehicle=()=>{
   setDraft(d=>({...d,vehicle:{
     ...d.vehicle,
     brand:vehicleFromDesk.brand||d.vehicle.brand,
     model:vehicleFromDesk.model||d.vehicle.model,
     year:vehicleFromDesk.year||d.vehicle.year,
     km:vehicleFromDesk.km||d.vehicle.km,
     fipe:vehicleFromDesk.fipe||d.vehicle.fipe,
     plate:vehicleFromDesk.plate||d.vehicle.plate,
   }}));setNotice('Identificação copiada da Mesa. Confira versão, quilometragem e custos.');
 };
 const exportData=(kind:'cases'|'log')=>{
   download(kind==='cases'?exportConsultedReportCsv(rows):exportConsultedLogCsv(rows),
     'motyq-iq-'+(kind==='cases'?'repasses-consultados':'log-de-alteracoes')+'.csv');
 };

 return <div className="space-y-5 pb-8 text-slate-900">
  <section className="motyq-iq-hero relative overflow-hidden rounded-3xl bg-[#153444] p-6 text-white md:p-8">
   <div className="absolute -right-20 -top-16 h-60 w-60 rounded-full bg-cyan-400/10 blur-2xl"/>
   <div className="relative flex flex-wrap items-start justify-between gap-4">
    <div>
     <p className="motyq-iq-hero-eyebrow flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-cyan-300">
      <HandCoins size={17}/> Motyq IQ · Modalidade especial
     </p>
     <h2 className="motyq-iq-hero-title mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">Repasse Sob Consulta</h2>
     <p className="motyq-iq-hero-description mt-2 max-w-2xl text-sm leading-6 text-slate-200">
      Registre quanto outras lojas oferecem antes de definir o valor de entrada. Cada operação
      tem suas próprias despesas, tributos informados e margem desejada.
     </p>
    </div>
    <span className="motyq-iq-hero-status rounded-full border border-cyan-200/30 bg-cyan-100/10 px-3 py-1.5 text-xs font-bold text-cyan-200">
      Testes · não executa compras
    </span>
   </div>
  </section>
  <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
   <ShieldAlert size={18} className="shrink-0"/>
   <p><strong>Simulação operacional:</strong> as ofertas são informadas manualmente após contato com as lojas.
    Marcar uma oferta como confirmada é uma declaração do operador, não uma validação externa.
    Impostos e NF não são calculados automaticamente pela legislação. O registro e o log são
    locais, neste navegador, e não substituem autorização gerencial ou trilha auditável no servidor.</p>
  </div>
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div><h3 className="text-lg font-black">1. Veículo da negociação</h3>
      <p className="mt-1 text-xs text-slate-500">Identificação do caso. A avaliação normal continua independente.</p></div>
    <button type="button" className={smallBtn} onClick={bringVehicle}><ArrowRight size={15}/>Trazer veículo da Mesa</button>
   </div>
   <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
    <label className="col-span-2 md:col-span-1"><span className={label}>Marca</span><input className={input} value={draft.vehicle.brand} onChange={e=>updateVehicle('brand',e.target.value)} placeholder="Toyota"/></label>
    <label className="col-span-2"><span className={label}>Modelo e versão</span><input className={input} value={draft.vehicle.model} onChange={e=>updateVehicle('model',e.target.value)} placeholder="Hilux SW4 SRX 2.8 Diesel"/></label>
    <label><span className={label}>Ano / modelo</span><input className={input} value={draft.vehicle.year} onChange={e=>updateVehicle('year',e.target.value)} placeholder="2018"/></label>
    <label><span className={label}>Quilometragem</span><input className={input} inputMode="numeric" value={draft.vehicle.km} onChange={e=>updateVehicle('km',e.target.value)} placeholder="126190"/></label>
    <label><span className={label}>FIPE (R$) · informativa</span><input className={input} inputMode="decimal" value={draft.vehicle.fipe||''} onChange={e=>updateVehicle('fipe',e.target.value)}/></label>
    <label className="col-span-2 md:col-span-1"><span className={label}>Placa (opcional, apenas no navegador)</span><input className={input} value={draft.vehicle.plate} onChange={e=>updateVehicle('plate',e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7))} maxLength={7} placeholder="ABC1D23"/></label>
   </div>
  </section>

  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div><h3 className="text-lg font-black">2. Ofertas das lojas compradoras</h3>
      <p className="mt-1 text-xs text-slate-500">Registre cada proposta de telefone ou WhatsApp. Só ofertas confirmadas, válidas e ainda não vencidas entram no teto calculado.</p></div>
    <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-3 py-2 text-xs font-black text-white hover:bg-cyan-800" onClick={addOffer}><Plus size={16}/>Adicionar loja</button>
   </div>
   <div className="mt-4 space-y-3">
    {calculations.map(({offer,calculation,eligible},index)=><div key={offer.id}
      className={'rounded-xl border p-3 '+(selectedOffer?.id===offer.id?'border-cyan-400 bg-cyan-50/60':'border-slate-200 bg-slate-50/50')}>
     <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm font-black text-slate-800"><Building2 size={16} className="text-cyan-700"/>Loja {index+1}
       {eligible?<span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">Confirmação informada</span>:
        <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] text-amber-800">{offer.status==='retirada'?'Retirada':'Cotação / pendente'}</span>}
      </div>
      <button type="button" className="inline-flex items-center gap-1 rounded-lg p-1.5 text-xs text-red-600 hover:bg-red-50"
        disabled={draft.offers.length===1} onClick={()=>removeOffer(offer.id)}><Trash2 size={14}/>Remover</button>
     </div>
     <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <label className="col-span-2 md:col-span-1"><span className={label}>Loja compradora</span><input className={input} value={offer.buyer} placeholder="Nome da loja" onChange={e=>updateOffer(offer.id,'buyer',e.target.value)}/></label>
      <label><span className={label}>Oferta recebida R$</span><input className={input} value={offer.value} inputMode="decimal" placeholder="145000" onChange={e=>updateOffer(offer.id,'value',e.target.value)}/></label>
      <label><span className={label}>Situação</span><select className={input} value={offer.status} onChange={e=>updateOffer(offer.id,'status',e.target.value)}>
       <option value="cotada">Informada, não confirmada</option><option value="confirmada">Confirmada por contato</option><option value="retirada">Retirada / cancelada</option>
      </select></label>
      <label><span className={label}>Canal de contato</span><select className={input} value={offer.channel} onChange={e=>updateOffer(offer.id,'channel',e.target.value)}>
       <option value="telefone">Telefone</option><option value="whatsapp">WhatsApp</option><option value="outro">Outro</option>
      </select></label>
      <label><span className={label}>Recebida em</span><input type="date" className={input} value={offer.receivedAt} onChange={e=>updateOffer(offer.id,'receivedAt',e.target.value)}/></label>
      <label><span className={label}>Válida até</span><input type="date" className={input} value={offer.validUntil} onChange={e=>updateOffer(offer.id,'validUntil',e.target.value)}/></label>
      <label className="col-span-2 md:col-span-3"><span className={label}>Observação comercial (opcional)</span><input className={input} value={offer.note} placeholder="Ex.: retirada em nossa loja, pagamento após NF" onChange={e=>updateOffer(offer.id,'note',e.target.value)}/></label>
     </div>
     {calculation.sale>0&&<div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-600">{financialReady?'Teto simulado após custos e margem: ':'Teto indisponível: informe NF, impostos e margem. '}
        {financialReady&&<strong className="text-slate-900">{formatReais(calculation.ceiling)}</strong>}</div>
      <button type="button" onClick={()=>setDraft(d=>({...d,selectedOfferId:offer.id}))} disabled={!eligible||!financialReady||calculation.ceiling<=0}
       className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
       {selectedOffer?.id===offer.id?'Oferta selecionada':'Usar esta oferta'}
      </button>
     </div>}
     {offer.status==='confirmada'&&!eligible&&<p className="mt-2 text-xs font-semibold text-amber-800">
      Oferta não elegível: confira loja, valor e validade (ela pode estar vencida).</p>}
    </div>)}
   </div>
  </section>

  <section className="grid gap-4 lg:grid-cols-5">
   <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
    <h3 className="text-lg font-black">3. Custos e margem desta operação</h3>
    <p className="mt-1 text-xs leading-5 text-slate-500">A margem é escolhida para cada veículo. Percentuais de imposto são inseridos pela Mesa conforme orientação fiscal. Zero somente quando realmente não houver custo aplicável.</p>
    <div className="mt-4 grid grid-cols-2 gap-3">
     {(['invoice','taxesFixed','taxesPercent','transport','preparation','other'] as (keyof ConsultedCosts)[]).map(key=>
       <label key={key}><span className={label}>{fieldName(key)}</span><input className={input} value={draft.costs[key]}
        onChange={e=>updateCosts(key,e.target.value)} placeholder="0" inputMode="decimal"/></label>)}
     <label><span className={label}>Margem desejada</span><input className={input} value={draft.costs.margin}
       onChange={e=>updateCosts('margin',e.target.value)} inputMode="decimal" placeholder="5000"/></label>
     <label><span className={label}>Forma da margem</span><select className={input} value={draft.costs.marginMode} onChange={e=>updateCosts('marginMode',e.target.value)}>
       <option value="reais">Valor em reais (R$)</option><option value="percentual">% sobre oferta de saída</option>
     </select></label>
    </div>
    {!financialReady&&<p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
       Para calcular o teto, informe a margem desejada, as despesas de NF e pelo menos uma hipótese tributária (valor fixo ou percentual). Digite 0 quando não houver custo.</p>}
    <p className="mt-3 rounded-lg bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
     O imposto percentual é aplicado sobre a oferta da loja compradora. A margem percentual, quando usada, também incide sobre essa oferta. Custos fixos e percentuais se somam. Não há cálculo fiscal automático nem substituição da conferência contábil.</p>
   </div>
   <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5 lg:col-span-2">
    <h3 className="flex items-center gap-2 text-lg font-black text-slate-900"><Calculator size={18}/>4. Resultado líquido</h3>
    {current?<>
      <p className="mt-2 text-xs text-cyan-900">Base: <strong>{current.offer.buyer}</strong> · proposta confirmada informada · válida até {current.offer.validUntil.split('-').reverse().join('/')}</p>
      <div className="mt-4 space-y-2 text-sm text-slate-700">
       <div className="flex justify-between gap-2"><span>Oferta da loja</span><strong>{formatReais(current.calculation.sale)}</strong></div>
       <div className="flex justify-between gap-2"><span>Impostos, NF e demais custos</span><strong>− {formatReais(current.calculation.expenses)}</strong></div>
       <div className="flex justify-between gap-2"><span>Margem desejada</span><strong>− {formatReais(current.calculation.margin)}</strong></div>
      </div>
      <div className="mt-4 border-t border-cyan-200 pt-4">
       <p className="text-[11px] font-black uppercase tracking-wider text-cyan-900">Teto indicado para compra</p>
       <p className={'mt-1 text-3xl font-black '+(estimatedPrice!==null&&estimatedPrice>0?'text-emerald-800':'text-red-800')}>
         {formatReais(estimatedPrice||0)}
       </p>
       <p className="mt-1 text-xs leading-5 text-slate-600">Simulação sujeita à validade da oferta, conferência fiscal, autorização da Mesa e negociação final.</p>
      </div>
     </>:<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      {!financialReady?'Ainda faltam custos de NF, impostos e/ou margem. Informe os valores desta negociação, inclusive zero quando aplicável.':'Nenhuma oferta confirmada e válida disponível. Registre a proposta da loja e sua validade antes de considerar um teto de compra.'}</div>}
     <label className="mt-4 block"><span className={label}>Valor que a Mesa pretende oferecer (R$)</span>
      <input className={input} value={draft.proposedBuy} onChange={e=>setDraft(d=>({...d,proposedBuy:e.target.value}))} inputMode="decimal" placeholder="125000"/></label>
     {appliedDecision&&<div className="mt-3 rounded-xl border border-indigo-200 bg-white p-3">
       <p className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Valor vigente autorizado {appliedDecision.demoOnly?'· SIMULAÇÃO LOCAL':'· GERÊNCIA'}</p>
       <p className="mt-1 text-2xl font-black text-indigo-950">{formatReais(appliedDecision.decidedBuy||0)}</p>
       <p className="mt-1 text-xs text-slate-600">Valor original da Mesa: {formatReais(appliedDecision.requestedBuy)} · Teto técnico original: {formatReais(appliedDecision.suggestedCeiling)}</p>
       <p className="mt-1 text-xs text-slate-600">Decidido por {appliedDecision.decidedByName} em {formatDate(appliedDecision.decidedAt||'')} · {appliedDecision.decisionReason}</p>
       {appliedDecision.demoOnly&&<p className="mt-2 text-xs font-bold text-amber-900">Esta autorização é fictícia e não vale para uma compra real.</p>}
      </div>}
     {pendingDecision&&<p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">Esta versão da negociação tem uma solicitação de revisão pendente {pendingDecision.demoOnly?'(simulação)':''}.</p>}
     {current&&requestedBuy>0&&<>
      <div className="mt-3 flex justify-between gap-2 rounded-xl bg-white p-3 text-xs">
       <span>Resultado líquido projetado</span><strong className={expectedProfit!==null&&expectedProfit>=0?'text-emerald-800':'text-rose-700'}>{formatReais(expectedProfit||0)}</strong>
      </div>
      <p className={'mt-2 text-xs font-bold '+(overCeiling?'text-red-700':'text-emerald-700')}>
       {overCeiling?'Acima do teto calculado. Exige revisão da Mesa e, se aplicável, aprovação gerencial.':'Valor proposto dentro do teto calculado para a margem desejada.'}
      </p>
     </>}
   </div>
  </section>

  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div><h3 className="text-lg font-black">5. Registrar consulta e alterações</h3>
     <p className="mt-1 text-xs text-slate-500">Cada salvamento cria uma nova versão do caso, preservando valores anteriores e responsável. Isso não é uma aprovação de compra.</p></div>
    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">Versão atual: {draft.version||'nova'}</span>
   </div>
   <div className="mt-4 flex flex-wrap items-center gap-2">
    <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-[#153f51] px-5 py-3 text-sm font-black text-white hover:bg-[#225468]" onClick={()=>save()}>
     <Save size={17}/>Salvar consulta local</button>
    {onOpenApprovals&&<button type="button" className="inline-flex items-center gap-2 rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-900 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!before||changed||!current||requestedBuy<=0} onClick={()=>{
       try{sessionStorage.setItem('motyq-iq-manager-case-'+email,draft.id);}catch{}
       onOpenApprovals();
      }}>
      <CheckCircle2 size={16}/>Solicitar revisão gerencial</button>}
    <button type="button" className={smallBtn} onClick={()=>{setDraft(newCase(vehicleFromDesk));setNotice('Novo caso iniciado. O caso anterior permanece salvo se você o registrou.');setError('');setShowAudit(false);}}>
     <Plus size={15}/>Nova consulta</button>
    {before&&<button type="button" className={smallBtn} onClick={()=>save(draft.state==='arquivado'?'consulta':'arquivado')}>
      {draft.state==='arquivado'?'Reativar caso':'Arquivar caso'}
    </button>}
    <button type="button" className={smallBtn} onClick={()=>setShowAudit(v=>!v)}>
     <FileClock size={16}/>{showAudit?'Ocultar':'Ver'} histórico do caso</button>
   </div>
   {changed&&before&&<p className="mt-2 text-xs font-semibold text-amber-800">Salve as alterações antes de solicitar nova revisão gerencial.</p>}
   {notice&&<p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">{notice}</p>}
   {error&&<p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-900">{error}</p>}
   {showAudit&&<div className="mt-4 space-y-2">
    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Histórico local da consulta</p>
    {(before?.events||draft.events).length===0?<p className="text-xs text-slate-500">Registre a consulta para criar o primeiro evento.</p>:
     (before?.events||draft.events).slice().reverse().map((event,index)=>
      <div key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
       <div className="flex flex-wrap justify-between gap-2 text-xs"><strong>{event.action.toUpperCase()} · {formatDate(event.at)}</strong><span className="text-slate-500">{event.actor}</span></div>
       <p className="mt-1 text-[11px] text-slate-500">Teto anterior: {event.formerSuggestedCeiling===null?'—':formatReais(event.formerSuggestedCeiling)} · Novo teto: {event.newSuggestedCeiling===null?'—':formatReais(event.newSuggestedCeiling)}</p>
       {event.changes.map((change,j)=><p key={j} className="mt-1 text-xs text-slate-700">{change}</p>)}
      </div>)}
   </div>}
  </section>

  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div><h3 className="text-lg font-black">Histórico de repasses consultados</h3>
     <p className="mt-1 text-xs text-slate-500">{rows.length} caso(s) salvo(s) neste navegador. Exportação compatível com relatório gerencial.</p></div>
    <div className="flex flex-wrap items-center gap-2">
     <button type="button" disabled={!rows.length} className={smallBtn+' disabled:opacity-40'} onClick={()=>exportData('cases')}><ArrowDownToLine size={15}/>Relatório CSV</button>
     <button type="button" disabled={!rows.length} className={smallBtn+' disabled:opacity-40'} onClick={()=>exportData('log')}><FileText size={15}/>Log CSV</button>
    </div>
   </div>
   <label className="mt-3 inline-flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showArchive} onChange={e=>setShowArchive(e.target.checked)}/>Exibir casos arquivados</label>
   {!rows.length?<p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhuma consulta salva ainda. Registre a primeira oferta da loja para iniciar o histórico.</p>:
    <div className="mt-3 space-y-2">
     {rows.filter(r=>showArchive||r.state!=='arquivado').slice(0,30).map(r=>{
      const selected=consultedFinancialInputsReady(r.costs)?r.offers.find(o=>o.id===r.selectedOfferId&&offerIsEligible(o)):undefined;
      const optimal=chooseBestConfirmedOffer(r.offers,r.costs);
      const active=selected?{offer:selected,calculation:calculateConsultedOffer(selected,r.costs)}:optimal;
      return <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
       <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-slate-900">{vehicleDescription(r.vehicle)}</p>
        <p className="mt-1 text-xs text-slate-500">Versão {r.version} · {formatDate(r.updatedAt)} · {r.state==='arquivado'?'Arquivado':'Em consulta'} · {r.offers.length} loja(s)</p>
        <p className="mt-1 text-xs font-medium text-slate-700">Teto simulado: {active?formatReais(active.calculation.ceiling):'sem oferta confirmada'} · Proposta de compra: {r.proposedBuy?formatReais(moneyNumber(r.proposedBuy)):'não informada'}</p>
       </div>
       <button type="button" className={smallBtn} onClick={()=>open(r)}>Reabrir <ArrowRight size={15}/></button>
      </div>;
     })}
    </div>}
   <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500">
    <Info size={15} className="mt-0.5 shrink-0"/>Dados salvos apenas no navegador deste usuário. Logs locais podem ser apagados ou alterados no próprio dispositivo. A trilha auditável de gerentes e notificações será uma integração futura, sujeita a permissões e regras do servidor.
   </p>
  </section>
 </div>;
}
