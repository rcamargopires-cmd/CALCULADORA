import React,{useEffect,useMemo,useState} from 'react';
import {CalendarDays,ClipboardPlus,Gauge,Package,RefreshCw,ShieldCheck,Wrench,X} from 'lucide-react';
import type {FactoryWarrantyClaim,User,WorkshopAppointment,WorkshopOrder,WorkshopOrderStatus,WorkshopOrderType,WorkshopPart,WorkshopTechnician} from '../types';
import {workshopService} from '../services/workshopService';

type Props={currentUser:User;companyId:string;storeId:string;storeName:string};
type Tab='orders'|'agenda'|'parts'|'warranty'|'technicians';
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const dateTime=(value?:string)=>value?new Date(value).toLocaleString('pt-BR'):'—';
const dtLocal=()=>{const d=new Date(Date.now()+3600000);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const STATUS:Record<WorkshopOrderStatus,string>={scheduled:'Agendada',open:'Aberta',in_service:'Em serviço',waiting_part:'Aguardando peça',quality_check:'Qualidade',ready:'Pronta',delivered:'Entregue',cancelled:'Cancelada'};
const TYPE:Record<WorkshopOrderType,string>={preparation:'Preparação',warranty:'Garantia',internal:'Interna',customer:'Cliente'};

const WorkshopPanel:React.FC<Props>=({currentUser,companyId,storeId,storeName})=>{
  const[open,setOpen]=useState(false);
  const[tab,setTab]=useState<Tab>('orders');
  const[orders,setOrders]=useState<WorkshopOrder[]>([]);
  const[appointments,setAppointments]=useState<WorkshopAppointment[]>([]);
  const[parts,setParts]=useState<WorkshopPart[]>([]);
  const[technicians,setTechnicians]=useState<WorkshopTechnician[]>([]);
  const[claims,setClaims]=useState<FactoryWarrantyClaim[]>([]);
  const[productivity,setProductivity]=useState<any[]>([]);
  const[selectedId,setSelectedId]=useState('');
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  const[message,setMessage]=useState('');
  const[orderForm,setOrderForm]=useState({orderType:'internal' as WorkshopOrderType,plate:'',vehicle:'',customerName:'',complaint:'',promisedAt:''});
  const[appointmentForm,setAppointmentForm]=useState({scheduledAt:dtLocal(),durationMinutes:60,plate:'',vehicle:'',customerName:'',reason:'',technicianId:''});
  const[partForm,setPartForm]=useState({sku:'',description:'',brand:'',location:'',quantity:0,minQuantity:1,unitCost:0,salePrice:0});
  const[techForm,setTechForm]=useState({name:'',email:'',specialty:'',hourlyCost:0});
  const[warrantyForm,setWarrantyForm]=useState({workshopOrderId:'',manufacturer:'',protocol:'',status:'draft' as FactoryWarrantyClaim['status'],requestedAmount:0,approvedAmount:0,notes:''});
  const[laborForm,setLaborForm]=useState({description:'',technicianId:'',estimatedMinutes:60,hourlyRate:0});
  const[partIssue,setPartIssue]=useState({partId:'',quantity:1});
  const selected=orders.find(item=>item.id===selectedId)||null;

  const load=async()=>{
    setError('');
    try{
      const[o,a,p,t,c,prod]=await Promise.all([
        workshopService.listOrders(companyId,storeId),workshopService.listAppointments(companyId,storeId),
        workshopService.listParts(companyId,storeId),workshopService.listTechnicians(companyId,storeId),
        workshopService.listWarrantyClaims(companyId,storeId),workshopService.technicianProductivity(companyId,storeId),
      ]);
      setOrders(o);setAppointments(a);setParts(p);setTechnicians(t);setClaims(c);setProductivity(prod);
    }catch(cause:any){setError(cause?.message||'Não foi possível carregar a oficina.');}
  };
  useEffect(()=>{if(!open)return;void load();const unsub=workshopService.subscribeOrders(companyId,storeId,setOrders,cause=>setError(String((cause as any)?.message||'Falha na atualização das OS.')));return unsub;},[open,companyId,storeId]);

  const act=async(task:()=>Promise<any>,success:string)=>{
    setBusy(true);setError('');setMessage('');
    try{await task();setMessage(success);await load();}catch(cause:any){setError(cause?.message||'Operação não concluída.');}finally{setBusy(false);}
  };

  const createOrder=()=>void act(async()=>{
    const order=await workshopService.createOrder({companyId,storeId,...orderForm,actor:currentUser,promisedAt:orderForm.promisedAt?new Date(orderForm.promisedAt).toISOString():undefined});
    setSelectedId(order.id);setOrderForm({orderType:'internal',plate:'',vehicle:'',customerName:'',complaint:'',promisedAt:''});
  },'Ordem de serviço aberta.');

  const createAppointment=()=>void act(async()=>{
    const tech=technicians.find(item=>item.technicianId===appointmentForm.technicianId);
    await workshopService.createAppointment({companyId,storeId,...appointmentForm,scheduledAt:new Date(appointmentForm.scheduledAt).toISOString(),technicianName:tech?.name,actor:currentUser});
    setAppointmentForm({scheduledAt:dtLocal(),durationMinutes:60,plate:'',vehicle:'',customerName:'',reason:'',technicianId:''});
  },'Agendamento criado.');

  const convertAppointment=(appointment:WorkshopAppointment)=>void act(async()=>{
    const order=await workshopService.createOrder({companyId,storeId,orderType:'customer',plate:appointment.plate,vehicle:appointment.vehicle,customerId:appointment.customerId,customerName:appointment.customerName,appointmentId:appointment.id,vehicleId:appointment.vehicleId,complaint:appointment.reason,actor:currentUser});
    setSelectedId(order.id);setTab('orders');
  },'Agendamento convertido em OS.');

  const savePart=()=>void act(async()=>{await workshopService.savePart({companyId,storeId,...partForm,actor:currentUser});setPartForm({sku:'',description:'',brand:'',location:'',quantity:0,minQuantity:1,unitCost:0,salePrice:0});},'Peça cadastrada.');
  const saveTech=()=>void act(async()=>{await workshopService.saveTechnician({companyId,storeId,...techForm,actor:currentUser});setTechForm({name:'',email:'',specialty:'',hourlyCost:0});},'Técnico cadastrado.');

  const addLabor=()=>{
    if(!selected)return;
    void act(async()=>{const tech=technicians.find(item=>item.technicianId===laborForm.technicianId);await workshopService.addLabor(selected,{...laborForm,technicianName:tech?.name,hourlyRate:laborForm.hourlyRate||tech?.hourlyCost||0},currentUser);setLaborForm({description:'',technicianId:'',estimatedMinutes:60,hourlyRate:0});},'Mão de obra adicionada.');
  };
  const issuePart=()=>{
    if(!selected)return;
    const part=parts.find(item=>item.partId===partIssue.partId);
    if(!part){setError('Selecione uma peça.');return;}
    void act(async()=>{await workshopService.issuePart(selected,part,partIssue.quantity,currentUser);setPartIssue({partId:'',quantity:1});},'Peça baixada para a OS.');
  };
  const saveWarranty=()=>{
    const order=orders.find(item=>item.id===warrantyForm.workshopOrderId);
    if(!order){setError('Selecione a OS da garantia.');return;}
    void act(async()=>{await workshopService.saveWarrantyClaim({companyId,storeId,workshopOrder:order,...warrantyForm,actor:currentUser});setWarrantyForm({workshopOrderId:'',manufacturer:'',protocol:'',status:'draft',requestedAmount:0,approvedAmount:0,notes:''});},'Processo de garantia atualizado.');
  };

  const lowParts=useMemo(()=>parts.filter(item=>item.active&&Number(item.quantity)<=Number(item.minQuantity)),[parts]);
  const today=new Date().toISOString().slice(0,10);
  const agendaToday=appointments.filter(item=>String(item.scheduledAt).slice(0,10)===today&&item.status==='scheduled');
  const activeOrders=orders.filter(item=>!['delivered','cancelled'].includes(item.status));

  return <>
    <button title="Oficina DMS" onClick={()=>setOpen(true)} className="hidden" type="button">Oficina DMS</button>
    {open&&<div className="fixed inset-0 z-[301] overflow-y-auto bg-black/85 p-3 backdrop-blur-md md:p-6" onClick={()=>setOpen(false)}>
      <div className="mx-auto max-w-[1500px] overflow-hidden rounded-[30px] border border-white/10 bg-zinc-950 text-white shadow-2xl" onClick={e=>e.stopPropagation()}>
        <header className="flex flex-col gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-start sm:justify-between md:p-7">
          <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-orange-300">MOTYQ · OFICINA</p><h2 className="mt-2 text-2xl font-semibold">OS, agenda, peças, garantia e produtividade.</h2><p className="mt-1 text-sm text-zinc-500">{storeName}. Operação técnica integrada ao DMS.</p></div>
          <div className="flex gap-2"><button disabled={busy} onClick={()=>void load()} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-zinc-400"><RefreshCw size={16} className={busy?'animate-spin':''}/></button><button onClick={()=>setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-zinc-400"><X size={18}/></button></div>
        </header>
        <div className="p-5 md:p-7">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={<Wrench size={16}/>} label="OS ativas" value={String(activeOrders.length)} note={String(orders.length)+' no histórico'}/>
            <Metric icon={<CalendarDays size={16}/>} label="Agenda hoje" value={String(agendaToday.length)} note={String(appointments.filter(item=>item.status==='scheduled').length)+' futuras'}/>
            <Metric icon={<Package size={16}/>} label="Peças em mínimo" value={String(lowParts.length)} note={String(parts.length)+' itens cadastrados'} danger={lowParts.length>0}/>
            <Metric icon={<ShieldCheck size={16}/>} label="Garantias abertas" value={String(claims.filter(item=>!['paid','rejected'].includes(item.status)).length)} note={String(claims.length)+' processos'}/>
          </section>
          {(error||message)&&<div className={'mt-4 rounded-xl border px-4 py-3 text-sm '+(error?'border-red-400/20 bg-red-400/[.05] text-red-300':'border-emerald-400/20 bg-emerald-400/[.05] text-emerald-300')}>{error||message}</div>}
          <nav className="mt-5 flex flex-wrap gap-2">
            <TabButton active={tab==='orders'} onClick={()=>setTab('orders')} icon={<ClipboardPlus size={14}/>} label="ORDENS DE SERVIÇO"/>
            <TabButton active={tab==='agenda'} onClick={()=>setTab('agenda')} icon={<CalendarDays size={14}/>} label="AGENDA"/>
            <TabButton active={tab==='parts'} onClick={()=>setTab('parts')} icon={<Package size={14}/>} label="PEÇAS"/>
            <TabButton active={tab==='warranty'} onClick={()=>setTab('warranty')} icon={<ShieldCheck size={14}/>} label="GARANTIA"/>
            <TabButton active={tab==='technicians'} onClick={()=>setTab('technicians')} icon={<Gauge size={14}/>} label="TÉCNICOS"/>
          </nav>

          {tab==='orders'&&<div className="mt-5 grid gap-4 xl:grid-cols-[.72fr_1.28fr]">
            <section className="space-y-4">
              <Card title="Nova ordem de serviço"><div className="grid gap-2 sm:grid-cols-2">
                <Select label="Tipo" value={orderForm.orderType} onChange={v=>setOrderForm({...orderForm,orderType:v as WorkshopOrderType})} options={Object.entries(TYPE)}/>
                <Input label="Placa" value={orderForm.plate} onChange={v=>setOrderForm({...orderForm,plate:v.toUpperCase()})}/><Input label="Veículo" value={orderForm.vehicle} onChange={v=>setOrderForm({...orderForm,vehicle:v})}/>
                <Input label="Cliente / responsável" value={orderForm.customerName} onChange={v=>setOrderForm({...orderForm,customerName:v})}/><Input label="Prometido para" type="datetime-local" value={orderForm.promisedAt} onChange={v=>setOrderForm({...orderForm,promisedAt:v})}/>
                <Input label="Queixa / serviço" value={orderForm.complaint} onChange={v=>setOrderForm({...orderForm,complaint:v})}/>
              </div><button disabled={busy||!orderForm.vehicle.trim()} onClick={createOrder} className="mt-3 h-10 w-full rounded-xl bg-orange-400 text-xs font-bold text-orange-950 disabled:opacity-40">ABRIR OS</button></Card>
              <Card title="Ordens"><div className="max-h-[570px] space-y-2 overflow-y-auto">{orders.map(item=><button key={item.id} onClick={()=>setSelectedId(item.id)} className={'w-full rounded-xl border p-3 text-left '+(selectedId===item.id?'border-orange-400/30 bg-orange-400/[.06]':'border-white/10 bg-black/20')}><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold">{item.orderNumber}</p><p className="mt-1 text-sm text-zinc-300">{(item.plate||'S/PLACA')+' · '+item.vehicle}</p><p className="mt-1 text-[10px] text-zinc-600">{TYPE[item.orderType]+' · '+dateTime(item.openedAt)}</p></div><span className="rounded-full bg-white/[.06] px-2 py-1 text-[9px] font-bold text-zinc-400">{STATUS[item.status].toUpperCase()}</span></div></button>)}{!orders.length&&<Empty text="Nenhuma OS aberta ainda."/>}</div></Card>
            </section>
            <section className="rounded-[24px] border border-white/10 bg-white/[.025] p-5">
              {!selected?<EmptyLarge/>:<>
                <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-sm font-bold text-orange-300">{selected.orderNumber}</p><h3 className="mt-1 text-xl font-semibold">{(selected.plate||'S/PLACA')+' · '+selected.vehicle}</h3><p className="mt-1 text-xs text-zinc-500">{(selected.customerName||TYPE[selected.orderType])+' · '+selected.complaint}</p></div><div className="text-right"><p className="text-[10px] text-zinc-600">CUSTO DA OS</p><p className="mt-1 text-2xl font-semibold">{money(selected.totalCost)}</p></div></div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2"><Select label="Status" value={selected.status} onChange={v=>void act(()=>workshopService.setOrderStatus(selected,v as WorkshopOrderStatus,currentUser),'Status atualizado.')} options={Object.entries(STATUS)}/><Info label="Prometido" value={selected.promisedAt?dateTime(selected.promisedAt):'Não informado'}/></div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <Card title="Mão de obra"><Input label="Serviço" value={laborForm.description} onChange={v=>setLaborForm({...laborForm,description:v})}/><Select label="Técnico" value={laborForm.technicianId} onChange={v=>{const tech=technicians.find(item=>item.technicianId===v);setLaborForm({...laborForm,technicianId:v,hourlyRate:tech?.hourlyCost||laborForm.hourlyRate});}} options={[['','Sem técnico'],...technicians.map(item=>[item.technicianId,item.name] as [string,string])]}/><div className="grid grid-cols-2 gap-2"><Input label="Min. previstos" type="number" value={String(laborForm.estimatedMinutes)} onChange={v=>setLaborForm({...laborForm,estimatedMinutes:Number(v)||0})}/><Input label="R$/hora" type="number" value={String(laborForm.hourlyRate)} onChange={v=>setLaborForm({...laborForm,hourlyRate:Number(v)||0})}/></div><button disabled={busy||!laborForm.description.trim()} onClick={addLabor} className="mt-2 h-9 w-full rounded-xl border border-orange-400/20 text-[10px] font-bold text-orange-300 disabled:opacity-40">ADICIONAR MÃO DE OBRA</button><div className="mt-3 space-y-2">{(selected.labor||[]).map(item=><div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex justify-between gap-3"><div><p className="text-xs font-semibold">{item.description}</p><p className="mt-1 text-[10px] text-zinc-600">{(item.technicianName||'Sem técnico')+' · prev. '+item.estimatedMinutes+' min'}</p></div><b className="text-xs">{money(item.cost)}</b></div>{!item.finishedAt?<button onClick={()=>{const value=window.prompt('Tempo real trabalhado em minutos:',String(item.estimatedMinutes));if(value!==null)void act(()=>workshopService.finishLabor(selected,item.id,Number(value)||0,currentUser),'Mão de obra concluída.');}} className="mt-2 rounded-lg bg-emerald-400/10 px-2 py-1 text-[9px] font-bold text-emerald-300">CONCLUIR</button>:<p className="mt-2 text-[9px] text-emerald-300">{'Concluído · '+item.actualMinutes+' min reais'}</p>}</div>)}</div></Card>
                  <Card title="Peças da OS"><div className="grid gap-2 sm:grid-cols-[1fr_80px]"><Select label="Peça" value={partIssue.partId} onChange={v=>setPartIssue({...partIssue,partId:v})} options={[['','Selecione...'],...parts.filter(item=>item.active&&item.quantity>0).map(item=>[item.partId,item.sku+' · '+item.description+' ('+item.quantity+')'] as [string,string])]}/><Input label="Qtd." type="number" value={String(partIssue.quantity)} onChange={v=>setPartIssue({...partIssue,quantity:Math.max(1,Number(v)||1)})}/></div><button disabled={busy||!partIssue.partId} onClick={issuePart} className="mt-2 h-9 w-full rounded-xl border border-sky-400/20 text-[10px] font-bold text-sky-300 disabled:opacity-40">BAIXAR PEÇA NA OS</button><div className="mt-3 space-y-2">{(selected.parts||[]).map(item=><div key={item.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-3 text-xs"><span>{String(item.quantity)+'× '+item.sku+' · '+item.description}</span><b>{money(item.totalCost)}</b></div>)}</div></Card>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3"><Info label="Mão de obra" value={money(selected.laborCost)}/><Info label="Peças" value={money(selected.partsCost)}/><Info label="Total" value={money(selected.totalCost)}/></div>
              </>}
            </section>
          </div>}

          {tab==='agenda'&&<div className="mt-5 grid gap-4 lg:grid-cols-[.72fr_1.28fr]"><Card title="Novo agendamento"><div className="grid gap-2 sm:grid-cols-2"><Input label="Data e hora" type="datetime-local" value={appointmentForm.scheduledAt} onChange={v=>setAppointmentForm({...appointmentForm,scheduledAt:v})}/><Input label="Duração, min." type="number" value={String(appointmentForm.durationMinutes)} onChange={v=>setAppointmentForm({...appointmentForm,durationMinutes:Number(v)||60})}/><Input label="Placa" value={appointmentForm.plate} onChange={v=>setAppointmentForm({...appointmentForm,plate:v.toUpperCase()})}/><Input label="Veículo" value={appointmentForm.vehicle} onChange={v=>setAppointmentForm({...appointmentForm,vehicle:v})}/><Input label="Cliente" value={appointmentForm.customerName} onChange={v=>setAppointmentForm({...appointmentForm,customerName:v})}/><Select label="Técnico" value={appointmentForm.technicianId} onChange={v=>setAppointmentForm({...appointmentForm,technicianId:v})} options={[['','A definir'],...technicians.map(item=>[item.technicianId,item.name] as [string,string])]}/><div className="sm:col-span-2"><Input label="Motivo" value={appointmentForm.reason} onChange={v=>setAppointmentForm({...appointmentForm,reason:v})}/></div></div><button disabled={busy||!appointmentForm.vehicle.trim()} onClick={createAppointment} className="mt-3 h-10 w-full rounded-xl bg-orange-400 text-xs font-bold text-orange-950 disabled:opacity-40">AGENDAR</button></Card><Card title="Agenda"><div className="max-h-[650px] space-y-2 overflow-y-auto">{appointments.map(item=><div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{dateTime(item.scheduledAt)}</p><p className="mt-1 text-xs text-zinc-400">{(item.plate||'S/PLACA')+' · '+item.vehicle}</p><p className="mt-1 text-[10px] text-zinc-600">{(item.customerName||'Sem cliente')+' · '+item.reason+' · '+(item.technicianName||'Técnico a definir')}</p></div><div className="flex gap-2"><span className="rounded-full bg-white/[.06] px-2 py-1 text-[9px] font-bold text-zinc-400">{item.status.toUpperCase()}</span>{item.status==='scheduled'&&<button onClick={()=>convertAppointment(item)} className="rounded-lg bg-emerald-400/10 px-2 py-1 text-[9px] font-bold text-emerald-300">ABRIR OS</button>}</div></div></div>)}{!appointments.length&&<Empty text="Agenda vazia."/>}</div></Card></div>}

          {tab==='parts'&&<div className="mt-5 grid gap-4 lg:grid-cols-[.65fr_1.35fr]"><Card title="Cadastrar peça"><div className="grid gap-2 sm:grid-cols-2"><Input label="SKU / código" value={partForm.sku} onChange={v=>setPartForm({...partForm,sku:v.toUpperCase()})}/><Input label="Descrição" value={partForm.description} onChange={v=>setPartForm({...partForm,description:v})}/><Input label="Marca" value={partForm.brand} onChange={v=>setPartForm({...partForm,brand:v})}/><Input label="Localização" value={partForm.location} onChange={v=>setPartForm({...partForm,location:v})}/><Input label="Quantidade" type="number" value={String(partForm.quantity)} onChange={v=>setPartForm({...partForm,quantity:Number(v)||0})}/><Input label="Estoque mínimo" type="number" value={String(partForm.minQuantity)} onChange={v=>setPartForm({...partForm,minQuantity:Number(v)||0})}/><Input label="Custo unitário" type="number" value={String(partForm.unitCost)} onChange={v=>setPartForm({...partForm,unitCost:Number(v)||0})}/><Input label="Preço venda" type="number" value={String(partForm.salePrice)} onChange={v=>setPartForm({...partForm,salePrice:Number(v)||0})}/></div><button disabled={busy||!partForm.sku.trim()||!partForm.description.trim()} onClick={savePart} className="mt-3 h-10 w-full rounded-xl bg-sky-400 text-xs font-bold text-sky-950 disabled:opacity-40">SALVAR PEÇA</button></Card><Card title="Estoque de peças"><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="border-b border-white/10 text-[10px] uppercase text-zinc-600"><tr><th className="p-2">Código</th><th>Descrição</th><th>Local</th><th>Qtd.</th><th>Mín.</th><th>Custo</th><th>Venda</th></tr></thead><tbody>{parts.map(item=><tr key={item.id} className={'border-b border-white/5 '+(item.quantity<=item.minQuantity?'bg-amber-400/[.04]':'')}><td className="p-2 font-mono text-zinc-300">{item.sku}</td><td>{item.description}</td><td>{item.location||'—'}</td><td className={item.quantity<=item.minQuantity?'font-bold text-amber-300':''}>{item.quantity}</td><td>{item.minQuantity}</td><td>{money(item.unitCost)}</td><td>{money(item.salePrice)}</td></tr>)}</tbody></table>{!parts.length&&<Empty text="Nenhuma peça cadastrada."/>}</div></Card></div>}

          {tab==='warranty'&&<div className="mt-5 grid gap-4 lg:grid-cols-[.7fr_1.3fr]"><Card title="Garantia de fábrica"><Select label="OS" value={warrantyForm.workshopOrderId} onChange={v=>setWarrantyForm({...warrantyForm,workshopOrderId:v})} options={[['','Selecione...'],...orders.map(item=>[item.id,item.orderNumber+' · '+item.plate+' · '+item.vehicle] as [string,string])]}/><div className="mt-2 grid gap-2 sm:grid-cols-2"><Input label="Montadora" value={warrantyForm.manufacturer} onChange={v=>setWarrantyForm({...warrantyForm,manufacturer:v})}/><Input label="Protocolo" value={warrantyForm.protocol} onChange={v=>setWarrantyForm({...warrantyForm,protocol:v})}/><Input label="Valor solicitado" type="number" value={String(warrantyForm.requestedAmount)} onChange={v=>setWarrantyForm({...warrantyForm,requestedAmount:Number(v)||0})}/><Input label="Valor aprovado" type="number" value={String(warrantyForm.approvedAmount)} onChange={v=>setWarrantyForm({...warrantyForm,approvedAmount:Number(v)||0})}/><Select label="Status" value={warrantyForm.status} onChange={v=>setWarrantyForm({...warrantyForm,status:v as FactoryWarrantyClaim['status']})} options={[['draft','Rascunho'],['submitted','Enviada'],['approved','Aprovada'],['rejected','Rejeitada'],['paid','Paga']]}/><Input label="Observações" value={warrantyForm.notes} onChange={v=>setWarrantyForm({...warrantyForm,notes:v})}/></div><button disabled={busy||!warrantyForm.workshopOrderId||!warrantyForm.manufacturer.trim()} onClick={saveWarranty} className="mt-3 h-10 w-full rounded-xl bg-violet-400 text-xs font-bold text-violet-950 disabled:opacity-40">SALVAR GARANTIA</button></Card><Card title="Processos de garantia"><div className="space-y-2">{claims.map(item=><div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-semibold">{item.plate+' · '+item.manufacturer}</p><p className="mt-1 text-[10px] text-zinc-600">{'Protocolo '+(item.protocol||'—')}</p></div><span className="rounded-full bg-violet-400/10 px-2 py-1 text-[9px] font-bold text-violet-300">{item.status.toUpperCase()}</span></div><p className="mt-2 text-xs text-zinc-500">{'Solicitado '+money(item.requestedAmount)+' · aprovado '+money(item.approvedAmount)}</p></div>)}{!claims.length&&<Empty text="Nenhuma garantia registrada."/>}</div></Card></div>}

          {tab==='technicians'&&<div className="mt-5 grid gap-4 lg:grid-cols-[.65fr_1.35fr]"><Card title="Cadastrar técnico"><div className="grid gap-2 sm:grid-cols-2"><Input label="Nome" value={techForm.name} onChange={v=>setTechForm({...techForm,name:v})}/><Input label="E-mail" value={techForm.email} onChange={v=>setTechForm({...techForm,email:v})}/><Input label="Especialidade" value={techForm.specialty} onChange={v=>setTechForm({...techForm,specialty:v})}/><Input label="Custo R$/hora" type="number" value={String(techForm.hourlyCost)} onChange={v=>setTechForm({...techForm,hourlyCost:Number(v)||0})}/></div><button disabled={busy||!techForm.name.trim()} onClick={saveTech} className="mt-3 h-10 w-full rounded-xl bg-emerald-400 text-xs font-bold text-emerald-950 disabled:opacity-40">SALVAR TÉCNICO</button></Card><Card title="Produtividade"><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="border-b border-white/10 text-[10px] uppercase text-zinc-600"><tr><th className="p-2">Técnico</th><th>Serviços</th><th>Previsto</th><th>Real</th><th>Eficiência</th><th>Valor MO</th></tr></thead><tbody>{productivity.map(item=><tr key={item.technicianId} className="border-b border-white/5"><td className="p-2 font-semibold text-zinc-300">{item.name}</td><td>{item.completed}</td><td>{Math.round(item.estimatedMinutes/6)/10+' h'}</td><td>{Math.round(item.actualMinutes/6)/10+' h'}</td><td className={item.efficiencyPercent>=100?'text-emerald-300':'text-amber-300'}>{item.efficiencyPercent.toFixed(1)+'%'}</td><td>{money(item.laborValue)}</td></tr>)}</tbody></table>{!productivity.length&&<Empty text="Cadastre técnicos e conclua serviços para medir produtividade."/>}</div></Card></div>}
        </div>
      </div>
    </div>}
  </>;
};

const TabButton=({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon:React.ReactNode;label:string})=><button onClick={onClick} className={'flex h-9 items-center gap-2 rounded-xl border px-3 text-[10px] font-bold '+(active?'border-orange-400/30 bg-orange-400/[.08] text-orange-300':'border-white/10 text-zinc-500')}>{icon}{label}</button>;
const Card=({title,children}:{title:string;children:React.ReactNode})=><section className="rounded-[22px] border border-white/10 bg-white/[.025] p-4"><p className="text-xs font-bold text-zinc-300">{title}</p><div className="mt-3">{children}</div></section>;
const Metric=({icon,label,value,note,danger}:{icon:React.ReactNode;label:string;value:string;note:string;danger?:boolean})=><div className={'rounded-[22px] border p-4 '+(danger?'border-amber-400/20 bg-amber-400/[.04]':'border-white/10 bg-white/[.025]')}><div className="flex items-center gap-2 text-zinc-500">{icon}<p className="text-xs">{label}</p></div><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-[10px] text-zinc-600">{note}</p></div>;
const Input=({label,value,onChange,type='text'}:{label:string;value:string;onChange:(value:string)=>void;type?:string})=><label className="text-[10px] text-zinc-600">{label}<input type={type} value={value} onChange={e=>onChange(e.target.value)} className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-zinc-900 px-2.5 text-xs text-white outline-none"/></label>;
const Select=({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:[string,string][]})=><label className="text-[10px] text-zinc-600">{label}<select value={value} onChange={e=>onChange(e.target.value)} className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-zinc-900 px-2.5 text-xs text-white">{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>;
const Info=({label,value}:{label:string;value:string})=><div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] uppercase text-zinc-700">{label}</p><p className="mt-1 text-xs font-semibold text-zinc-300">{value}</p></div>;
const Empty=({text}:{text:string})=><p className="p-6 text-center text-xs text-zinc-700">{text}</p>;
const EmptyLarge=()=> <div className="grid min-h-[430px] place-items-center text-center"><div><Wrench size={32} className="mx-auto text-zinc-700"/><p className="mt-3 font-semibold text-zinc-300">Selecione uma OS</p><p className="mt-1 text-sm text-zinc-600">Mão de obra, peças e andamento aparecem aqui.</p></div></div>;

export default WorkshopPanel;
