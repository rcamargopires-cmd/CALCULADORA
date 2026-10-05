import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Banknote, CalendarDays, CheckCircle2, CircleDollarSign, Landmark, Plus, Search, TrendingUp, WalletCards, X } from 'lucide-react';
import type { FinanceAccount, FinanceAccountType, FinanceChartAccount, FinanceCostCenter, FinanceEntry, FinanceEntryType, FinanceReversalRequest, User } from '../types';
import { financeService } from '../services/financeService';
import { prepFinanceService } from '../services/prepFinanceService';
import { dmsPermissions } from '../services/dmsPermissions';
import { financeAccountService } from '../services/financeAccountService';
import { financeStructureService } from '../services/financeStructureService';
import FinanceStructurePanel from './FinanceStructurePanel';
import FinanceReconciliationPanel from './FinanceReconciliationPanel';
import DmsAttachmentManager from './DmsAttachmentManager';

type Props={currentUser:User;companyId:string;storeId:string;storeName:string};
type Tab='payable'|'receivable'|'cashflow'|'dre';

const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const clean=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const today=()=>new Date().toISOString().slice(0,10);
const monthKey=(value?:string)=>String(value||'').slice(0,7);
const displayDate=(value?:string)=>{
  const raw=String(value||'').slice(0,10);
  if(!raw)return 'Sem data';
  const [y,m,d]=raw.split('-');
  return y&&m&&d?`${d}/${m}/${y}`:raw;
};
const statusLabel=(entry:FinanceEntry)=>entry.status==='paid'?'Pago':entry.status==='received'?'Recebido':entry.status==='cancelled'?'Cancelado':'Pendente';
const isSettled=(entry:FinanceEntry)=>entry.status==='paid'||entry.status==='received';
const entryDate=(entry:FinanceEntry)=>String(entry.settledAt||entry.dueDate||entry.competenceDate||entry.createdAt||'').slice(0,10);
const daysFromToday=(iso?:string)=>{
  if(!iso)return null;
  const due=new Date(`${String(iso).slice(0,10)}T12:00:00`).getTime();
  const now=new Date();const todayNoon=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12).getTime();
  return Math.round((due-todayNoon)/86400000);
};

const FinanceModulePanel:React.FC<Props>=({currentUser,companyId,storeId,storeName})=>{
  const permissions=dmsPermissions(currentUser);
  const canCreate=permissions.financeCreate;
  const canSettle=permissions.financeSettle;
  const canApproveReversal=permissions.management;
  const[open,setOpen]=useState(false);
  const[tab,setTab]=useState<Tab>('payable');
  const[items,setItems]=useState<FinanceEntry[]>([]);
  const[reversalRequests,setReversalRequests]=useState<FinanceReversalRequest[]>([]);
  const[accounts,setAccounts]=useState<FinanceAccount[]>([]);
  const[chartAccounts,setChartAccounts]=useState<FinanceChartAccount[]>([]);
  const[costCenters,setCostCenters]=useState<FinanceCostCenter[]>([]);
  const[selectedId,setSelectedId]=useState('');
  const[search,setSearch]=useState('');
  const[entryOpen,setEntryOpen]=useState(false);
  const[entryType,setEntryType]=useState<FinanceEntryType>('payable');
  const[category,setCategory]=useState('Outros');
  const[description,setDescription]=useState('');
  const[party,setParty]=useState('');
  const[amount,setAmount]=useState('');
  const[dueDate,setDueDate]=useState('');
  const[installments,setInstallments]=useState('1');
  const[plate,setPlate]=useState('');
  const[vehicle,setVehicle]=useState('');
  const[chartAccountId,setChartAccountId]=useState('');
  const[costCenterId,setCostCenterId]=useState('');
  const[structureOpen,setStructureOpen]=useState(false);
  const[reconciliationOpen,setReconciliationOpen]=useState(false);
  const[method,setMethod]=useState('Pix');
  const[reference,setReference]=useState('');
  const[financeAccountId,setFinanceAccountId]=useState('');
  const[accountOpen,setAccountOpen]=useState(false);
  const[accountType,setAccountType]=useState<FinanceAccountType>('bank');
  const[accountName,setAccountName]=useState('');
  const[accountBank,setAccountBank]=useState('');
  const[accountAgency,setAccountAgency]=useState('');
  const[accountNumber,setAccountNumber]=useState('');
  const[accountPix,setAccountPix]=useState('');
  const[openingBalance,setOpeningBalance]=useState('');
  const[busy,setBusy]=useState('');
  const[message,setMessage]=useState('');
  const[error,setError]=useState('');
  const[month,setMonth]=useState(today().slice(0,7));

  useEffect(()=>{
    if(!open)return;
    return financeService.subscribe(
      companyId,
      storeId,
      next=>{setItems(next);setError('');},
      cause=>setError(String((cause as any)?.message||'Não foi possível carregar o financeiro.')),
    );
  },[open,companyId,storeId]);

  useEffect(()=>{
    if(!open)return;
    return financeService.subscribeReversalRequests(
      companyId,storeId,
      next=>setReversalRequests(next),
      cause=>console.warn('Motyq: solicitações de estorno indisponíveis.',cause),
    );
  },[open,companyId,storeId]);

  useEffect(()=>{
    if(!open)return;
    return financeAccountService.subscribe(
      companyId,
      storeId,
      next=>{
        setAccounts(next);
        if(!financeAccountId){
          const active=next.find(item=>item.active);
          if(active)setFinanceAccountId(active.accountId);
        }
      },
      cause=>console.warn('Motyq: contas financeiras indisponíveis.',cause),
    );
  },[open,companyId,storeId]);

  const loadStructure=async()=>{
    try{
      const data=await financeStructureService.load(companyId,storeId);
      setChartAccounts(data.chartAccounts.filter(item=>item.active));
      setCostCenters(data.costCenters.filter(item=>item.active));
    }catch(cause){console.warn('Motyq: estrutura financeira indisponível.',cause);}
  };
  useEffect(()=>{if(open)void loadStructure();},[open,companyId,storeId]);

  const selected=items.find(item=>item.id===selectedId)||null;
  const q=search.trim().toLowerCase();
  const filtered=useMemo(()=>{
    const base=tab==='cashflow'?items:items.filter(item=>item.entryType===tab);
    if(!q)return base;
    const qPlate=clean(search);
    return base.filter(item=>
      (qPlate&&clean(item.plate).includes(qPlate)) ||
      [item.description,item.party,item.category,item.vehicle,item.status].some(value=>String(value||'').toLowerCase().includes(q))
    );
  },[items,tab,q,search]);

  const payables=items.filter(item=>item.entryType==='payable'&&item.status!=='cancelled');
  const receivables=items.filter(item=>item.entryType==='receivable'&&item.status!=='cancelled');
  const payableOpen=payables.filter(item=>item.status==='pending');
  const receivableOpen=receivables.filter(item=>item.status==='pending');
  const payableOpenValue=payableOpen.reduce((sum,item)=>sum+Number(item.amount||0),0);
  const receivableOpenValue=receivableOpen.reduce((sum,item)=>sum+Number(item.amount||0),0);
  const agingSource=tab==='payable'?payableOpen:tab==='receivable'?receivableOpen:[];
  const aging={
    overdue30:agingSource.filter(item=>{const d=daysFromToday(item.dueDate);return d!==null&&d<=-30;}),
    overdue8to29:agingSource.filter(item=>{const d=daysFromToday(item.dueDate);return d!==null&&d<=-8&&d>-30;}),
    overdue1to7:agingSource.filter(item=>{const d=daysFromToday(item.dueDate);return d!==null&&d<0&&d>-8;}),
    dueSoon:agingSource.filter(item=>{const d=daysFromToday(item.dueDate);return d!==null&&d>=0&&d<=7;}),
  };

  const monthEntries=items.filter(item=>item.status!=='cancelled'&&monthKey(entryDate(item))===month);
  const realizedIn=monthEntries.filter(item=>item.entryType==='receivable'&&item.status==='received').reduce((sum,item)=>sum+Number(item.amount||0),0);
  const realizedOut=monthEntries.filter(item=>item.entryType==='payable'&&item.status==='paid').reduce((sum,item)=>sum+Number(item.amount||0),0);
  const projectedIn=monthEntries.filter(item=>item.entryType==='receivable'&&item.status==='pending').reduce((sum,item)=>sum+Number(item.amount||0),0);
  const projectedOut=monthEntries.filter(item=>item.entryType==='payable'&&item.status==='pending').reduce((sum,item)=>sum+Number(item.amount||0),0);
  const realizedBalance=realizedIn-realizedOut;
  const projectedBalance=realizedBalance+projectedIn-projectedOut;
  const activeAccounts=accounts.filter(item=>item.active);
  const accountBalances=activeAccounts.map(account=>{
    const settled=items.filter(item=>item.financeAccountId===account.accountId&&isSettled(item));
    const delta=settled.reduce((sum,item)=>sum+(item.entryType==='receivable'?Number(item.amount||0):-Number(item.amount||0)),0);
    return{...account,currentBalance:(Number(account.openingBalance)||0)+delta};
  });
  const totalAccountBalance=accountBalances.reduce((sum,item)=>sum+item.currentBalance,0);
  const dreRevenue=realizedIn;
  const dreExpense=realizedOut;
  const dreResult=dreRevenue-dreExpense;
  const dreMargin=dreRevenue>0?(dreResult/dreRevenue)*100:0;

  const resetForm=()=>{
    setEntryType(tab==='receivable'?'receivable':'payable');
    setCategory('Outros');setDescription('');setParty('');setAmount('');setDueDate('');setInstallments('1');setPlate('');setVehicle('');setChartAccountId('');setCostCenterId('');
  };

  const create=async()=>{
    if(!canCreate)return setError('Seu perfil pode consultar o financeiro, mas não criar lançamentos.');
    const value=Number(String(amount).replace(',','.'))||0;
    if(!description.trim())return setError('Informe a descrição do lançamento.');
    if(!party.trim())return setError(entryType==='payable'?'Informe o fornecedor/beneficiário.':'Informe o cliente/pagador.');
    if(value<=0)return setError('Informe um valor maior que zero.');
    if(!dueDate)return setError('Informe o primeiro vencimento do lançamento.');
    if(!chartAccountId)return setError('Selecione o Plano de Contas do lançamento.');
    if(!costCenterId)return setError('Selecione o Centro de Custo do lançamento.');
    setBusy('create');setError('');setMessage('');
    try{
      const count=Math.max(1,Math.min(120,Math.trunc(Number(installments)||1)));
      if(count>1){
        await financeService.createInstallments({
          entryType,
          category:category.trim()||'Outros',
          description:description.trim(),
          party:party.trim(),
          totalAmount:value,
          installmentCount:count,
          firstDueDate:dueDate||undefined,
          competenceDate:today(),
          plate:plate||undefined,
          vehicle:vehicle.trim()||undefined,
          chartAccountId,
          costCenterId,
          origin:'manual',
          companyId,
          storeId,
          actor:currentUser,
        });
        setMessage(`${count} parcelas criadas no financeiro.`);
      }else{
        await financeService.create({
          entryType,
          category:category.trim()||'Outros',
          description:description.trim(),
          party:party.trim(),
          amount:value,
          dueDate:dueDate||undefined,
          competenceDate:today(),
          plate:plate||undefined,
          vehicle:vehicle.trim()||undefined,
          chartAccountId,
          costCenterId,
          origin:'manual',
          companyId,
          storeId,
          actor:currentUser,
        });
        setMessage(entryType==='payable'?'Conta a pagar criada.':'Conta a receber criada.');
      }
      setEntryOpen(false);resetForm();
    }catch(cause:any){setError(cause?.message||'Não foi possível criar o lançamento.');}
    finally{setBusy('');}
  };

  const deactivateAccount=async(account:FinanceAccount)=>{
    if(!window.confirm(`Inativar ${account.name}? O histórico e os lançamentos vinculados serão preservados.`))return;
    setBusy(`account-${account.accountId}`);setError('');setMessage('');
    try{
      await financeAccountService.deactivate(account,currentUser);
      if(financeAccountId===account.accountId)setFinanceAccountId('');
      setMessage('Conta financeira inativada com histórico preservado.');
    }catch(cause:any){setError(cause?.message||'Não foi possível inativar a conta financeira.');}
    finally{setBusy('');}
  };

  const createAccount=async()=>{
    if(!canCreate)return setError('Seu perfil não pode criar contas financeiras.');
    if(!accountName.trim())return setError('Informe o nome da conta/caixa.');
    setBusy('account');setError('');setMessage('');
    try{
      const created=await financeAccountService.create({
        companyId,storeId,accountType,name:accountName.trim(),bankName:accountBank.trim(),
        agency:accountAgency.trim(),accountNumber:accountNumber.trim(),pixKey:accountPix.trim(),
        openingBalance:Number(String(openingBalance).replace(',','.'))||0,actor:currentUser,
      });
      setFinanceAccountId(created.accountId);
      setAccountOpen(false);setAccountName('');setAccountBank('');setAccountAgency('');setAccountNumber('');setAccountPix('');setOpeningBalance('');
      setMessage('Conta financeira criada.');
    }catch(cause:any){setError(cause?.message||'Não foi possível criar a conta.');}
    finally{setBusy('');}
  };

  const settle=async()=>{
    if(!canSettle)return setError('Somente o Financeiro/Caixa pode baixar pagamentos e recebimentos.');
    if(!selected||selected.status!=='pending')return;
    if(!financeAccountId)return setError('Cadastre e selecione a conta bancária/caixa usada na baixa.');
    setBusy(selected.id);setError('');setMessage('');
    try{
      if(selected.origin==='prep'){
        await prepFinanceService.markPaid(selected as any,currentUser,method,reference.trim(),financeAccountId);
      }else{
        await financeService.settle(selected,currentUser,method,reference.trim(),financeAccountId);
      }
      setMessage(selected.entryType==='payable'?'Pagamento registrado.':'Recebimento registrado.');
      setReference('');
    }catch(cause:any){setError(cause?.message||'Não foi possível concluir a baixa.');}
    finally{setBusy('');}
  };

  const cancel=async()=>{
    if(!canSettle)return setError('Somente o Financeiro/Caixa pode cancelar lançamentos financeiros.');
    if(!selected||selected.status!=='pending')return;
    if(!window.confirm('Cancelar este lançamento financeiro?'))return;
    setBusy(selected.id);setError('');setMessage('');
    try{
      await financeService.cancel(selected);
      setMessage('Lançamento cancelado.');
    }catch(cause:any){setError(cause?.message||'Não foi possível cancelar o lançamento.');}
    finally{setBusy('');}
  };

  const requestReversal=async()=>{
    if(!selected||!canSettle||!isSettled(selected))return;
    const reason=window.prompt('Motivo do estorno desta baixa:','')?.trim()||'';
    if(!reason)return;
    setBusy('reversal-'+selected.id);setError('');setMessage('');
    try{
      await financeService.requestReversal(selected,currentUser,reason);
      setMessage('Pedido de estorno enviado ao gestor para aprovação.');
    }catch(cause:any){setError(cause?.message||'Não foi possível solicitar o estorno.');}
    finally{setBusy('');}
  };

  const decideReversal=async(request:FinanceReversalRequest,approved:boolean)=>{
    if(!canApproveReversal)return;
    const note=approved?'':window.prompt('Motivo da rejeição do estorno:','')?.trim()||'';
    if(!approved&&!note)return;
    setBusy('reversal-decision-'+request.id);setError('');setMessage('');
    try{
      await financeService.decideReversal(request,approved,currentUser,note);
      setMessage(approved?'Estorno aprovado e baixa revertida.':'Pedido de estorno rejeitado.');
    }catch(cause:any){setError(cause?.message||'Não foi possível decidir o estorno.');}
    finally{setBusy('');}
  };

  const pendingReversals=reversalRequests.filter(item=>item.status==='pending');

  const title=tab==='payable'?'Contas a pagar':tab==='receivable'?'Contas a receber':tab==='cashflow'?'Fluxo de caixa':'DRE gerencial';

  return <>
    <button
      onClick={()=>setOpen(true)}
      title="Financeiro Motyq"
      className="fixed right-5 z-[137] grid h-12 w-12 place-items-center rounded-full border border-sky-400/25 bg-zinc-950/95 text-sky-300 shadow-2xl"
      style={{bottom:260}}
    >
      <Banknote size={18}/>
    </button>

    {open&&<div className="fixed inset-0 z-[280] overflow-y-auto bg-black/80 p-3 backdrop-blur-md md:p-6" onClick={()=>setOpen(false)}>
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[30px] border border-white/10 bg-zinc-950 text-white shadow-2xl" onClick={event=>event.stopPropagation()}>
        <header className="flex flex-col gap-5 border-b border-white/10 p-5 md:flex-row md:items-start md:justify-between md:p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-sky-300">MÓDULO FINANCEIRO</p>
            <h3 className="mt-2 text-2xl font-semibold">Pagar, receber e enxergar o caixa da loja.</h3>
            <p className="mt-2 text-sm text-zinc-500">{storeName}. Preparações aprovadas entram automaticamente no contas a pagar.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreate&&<button onClick={()=>setStructureOpen(true)} className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-4 text-xs font-bold text-zinc-200"><Landmark size={15}/> PLANO / CENTROS</button>}
            {canCreate&&<button onClick={()=>setAccountOpen(true)} className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-4 text-xs font-bold text-zinc-200"><WalletCards size={15}/> CONTAS / CAIXAS</button>}
            {canSettle&&<button onClick={()=>setReconciliationOpen(true)} className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-4 text-xs font-bold text-zinc-200"><CheckCircle2 size={15}/> CONCILIAR / FECHAR</button>}
            {canCreate&&<button onClick={()=>{resetForm();setEntryOpen(true);}} className="flex h-10 items-center gap-2 rounded-xl bg-sky-400 px-4 text-xs font-bold text-sky-950"><Plus size={15}/> NOVO LANÇAMENTO</button>}
            <button onClick={()=>setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[.05] text-zinc-400"><X size={18}/></button>
          </div>
        </header>

        <div className="p-5 md:p-7">
          <nav className="flex flex-wrap gap-2">
            <TabButton active={tab==='payable'} onClick={()=>{setTab('payable');setSelectedId('');}} icon={<ArrowDownCircle size={15}/>} label="Contas a pagar" badge={payableOpen.length}/>
            <TabButton active={tab==='receivable'} onClick={()=>{setTab('receivable');setSelectedId('');}} icon={<ArrowUpCircle size={15}/>} label="Contas a receber" badge={receivableOpen.length}/>
            <TabButton active={tab==='cashflow'} onClick={()=>{setTab('cashflow');setSelectedId('');}} icon={<TrendingUp size={15}/>} label="Fluxo de caixa"/>
            <TabButton active={tab==='dre'} onClick={()=>{setTab('dre');setSelectedId('');}} icon={<Landmark size={15}/>} label="DRE gerencial"/>
          </nav>
          {!canSettle&&<div className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-400/[.05] px-4 py-3 text-xs text-amber-200">Visão gerencial: você acompanha valores e vencimentos, mas a baixa financeira fica reservada ao perfil Financeiro/Caixa.</div>}
          {canApproveReversal&&pendingReversals.length>0&&<section className="mt-4 rounded-2xl border border-violet-400/20 bg-violet-400/[.05] p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-violet-200">ESTORNOS AGUARDANDO APROVAÇÃO</p><p className="mt-1 text-[11px] text-zinc-500">{pendingReversals.length} solicitação(ões) do Financeiro/Caixa.</p></div><span className="rounded-full bg-violet-300/10 px-2.5 py-1 text-xs font-bold text-violet-300">{pendingReversals.length}</span></div><div className="mt-3 space-y-2">{pendingReversals.slice(0,8).map(request=><div key={request.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold text-zinc-300">{request.description}</p><p className="mt-1 text-[10px] text-zinc-600">{request.party} · {money(request.amount)} · {request.reason}</p><p className="mt-1 text-[10px] text-zinc-700">Solicitado por {request.requestedByName||request.requestedBy}</p></div><div className="flex gap-2"><button disabled={busy!==''} onClick={()=>void decideReversal(request,true)} className="h-9 rounded-xl bg-emerald-400 px-3 text-[10px] font-bold text-emerald-950 disabled:opacity-50">APROVAR ESTORNO</button><button disabled={busy!==''} onClick={()=>void decideReversal(request,false)} className="h-9 rounded-xl border border-red-400/20 px-3 text-[10px] font-bold text-red-300 disabled:opacity-50">REJEITAR</button></div></div>)}</div></section>}

          <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tab==='payable'&&<>
              <Metric icon={<ArrowDownCircle size={16}/>} label="Em aberto" value={money(payableOpenValue)} note={`${payableOpen.length} conta(s)`} warn={payableOpen.length>0}/>
              <Metric icon={<CalendarDays size={16}/>} label="Vencidas" value={String(payableOpen.filter(item=>item.dueDate&&new Date(`${item.dueDate}T23:59:59`).getTime()<Date.now()).length)} note="atenção imediata"/>
              <Metric icon={<CheckCircle2 size={16}/>} label="Pagas" value={String(payables.filter(item=>item.status==='paid').length)} note="histórico preservado"/>
              <Metric icon={<CircleDollarSign size={16}/>} label="Preparação" value={money(payableOpen.filter(item=>item.origin==='prep').reduce((sum,item)=>sum+Number(item.amount||0),0))} note="aprovado pelo gerente"/>
            </>}
            {tab==='receivable'&&<>
              <Metric icon={<ArrowUpCircle size={16}/>} label="A receber" value={money(receivableOpenValue)} note={`${receivableOpen.length} conta(s)`} warn={receivableOpen.length>0}/>
              <Metric icon={<CalendarDays size={16}/>} label="Vencidas" value={String(receivableOpen.filter(item=>item.dueDate&&new Date(`${item.dueDate}T23:59:59`).getTime()<Date.now()).length)} note="cobranças atrasadas"/>
              <Metric icon={<CheckCircle2 size={16}/>} label="Recebidas" value={String(receivables.filter(item=>item.status==='received').length)} note="baixadas"/>
              <Metric icon={<CircleDollarSign size={16}/>} label="Total recebido" value={money(receivables.filter(item=>item.status==='received').reduce((sum,item)=>sum+Number(item.amount||0),0))} note="histórico acumulado"/>
            </>}
            {tab==='cashflow'&&<>
              <Metric icon={<ArrowUpCircle size={16}/>} label="Entradas realizadas" value={money(realizedIn)} note={month}/>
              <Metric icon={<ArrowDownCircle size={16}/>} label="Saídas realizadas" value={money(realizedOut)} note={month}/>
              <Metric icon={<CircleDollarSign size={16}/>} label="Saldo realizado" value={money(realizedBalance)} note="entradas menos saídas" danger={realizedBalance<0}/>
              <Metric icon={<TrendingUp size={16}/>} label="Saldo projetado" value={money(projectedBalance)} note={`+${money(projectedIn)} · -${money(projectedOut)}`} danger={projectedBalance<0}/>
            </>}
            {tab==='dre'&&<>
              <Metric icon={<ArrowUpCircle size={16}/>} label="Receitas realizadas" value={money(dreRevenue)} note={month}/>
              <Metric icon={<ArrowDownCircle size={16}/>} label="Despesas realizadas" value={money(dreExpense)} note={month}/>
              <Metric icon={<CircleDollarSign size={16}/>} label="Resultado" value={money(dreResult)} note="receitas menos despesas" danger={dreResult<0}/>
              <Metric icon={<TrendingUp size={16}/>} label="Margem" value={`${dreMargin.toFixed(1)}%`} note="resultado / receitas" danger={dreMargin<0}/>
            </>}
          </section>

          {(tab==='payable'||tab==='receivable')&&agingSource.length>0&&<section className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <AgingCard label="+30 dias vencido" items={aging.overdue30} tone="critical"/>
            <AgingCard label="8–29 dias vencido" items={aging.overdue8to29} tone="danger"/>
            <AgingCard label="1–7 dias vencido" items={aging.overdue1to7} tone="warning"/>
            <AgingCard label="Vence em até 7 dias" items={aging.dueSoon} tone="info"/>
          </section>}
          {aging.overdue30.length>0&&<div className="mt-3 rounded-2xl border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-xs text-red-200"><b>Alerta financeiro:</b> há {aging.overdue30.length} lançamento(s) vencido(s) há 30 dias ou mais, somando {money(aging.overdue30.reduce((sum,item)=>sum+Number(item.amount||0),0))}.</div>}

          {(message||error)&&<div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${error?'border-red-400/20 bg-red-400/[.05] text-red-300':'border-emerald-400/20 bg-emerald-400/[.05] text-emerald-300'}`}>{error||message}</div>}

          {tab==='cashflow'?<CashFlowView month={month} setMonth={setMonth} entries={monthEntries} accounts={accountBalances} totalAccountBalance={totalAccountBalance}/>:tab==='dre'?<DreView month={month} setMonth={setMonth} entries={monthEntries}/>:<section className="mt-5 grid gap-4 lg:grid-cols-[.92fr_1.08fr]">
            <div className="rounded-[24px] border border-white/10 bg-white/[.025] p-4">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3">
                <Search size={14} className="text-zinc-600"/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Descrição, parte, placa ou categoria" className="h-10 w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-700"/>
              </div>
              <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto pr-1">
                {filtered.map(item=><EntryRow key={item.id} entry={item} active={selectedId===item.id} onClick={()=>{setSelectedId(item.id);setError('');setMessage('');}}/>)}
                {!filtered.length&&<div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-600">Nenhum lançamento em {title.toLowerCase()}.</div>}
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/[.025] p-5">
              {!selected?<div className="grid min-h-[320px] place-items-center text-center"><div><Banknote size={32} className="mx-auto text-zinc-700"/><p className="mt-3 font-semibold text-zinc-300">Selecione um lançamento</p><p className="mt-1 text-sm text-zinc-600">Aqui você baixa, consulta origem, placa e histórico financeiro.</p></div></div>:<>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${isSettled(selected)?'bg-emerald-400/10 text-emerald-300':selected.status==='cancelled'?'bg-zinc-400/10 text-zinc-400':'bg-amber-400/10 text-amber-300'}`}>{statusLabel(selected).toUpperCase()}</span>
                      {selected.origin==='prep'&&<span className="rounded-full bg-sky-400/10 px-2 py-1 text-[9px] font-bold text-sky-300">PREPTRACK</span>}
                    </div>
                    <h4 className="mt-3 text-xl font-semibold">{selected.description}</h4>
                    <p className="mt-1 text-sm text-zinc-500">{selected.party}</p>
                    {selected.plate&&<p className="mt-2 font-mono text-xs text-zinc-500">{selected.plate} · {selected.vehicle||''}</p>}
                  </div>
                  <div className="text-right"><p className="text-xs text-zinc-600">Valor</p><p className="mt-1 text-3xl font-semibold">{money(selected.amount)}</p></div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Info label="Categoria" value={selected.category||'—'}/>
                  <Info label="Vencimento" value={displayDate(selected.dueDate)}/>
                  <Info label={selected.entryType==='payable'?'Fornecedor / beneficiário':'Cliente / pagador'} value={selected.party||'—'}/>
                  <Info label="Origem" value={selected.origin==='prep'?'Preparação':selected.origin==='purchase'?'Compra de veículo':selected.origin==='sale'?'Venda':selected.origin==='commission'?'Comissão':selected.origin==='manual'?'Manual':'Outro'}/>
                </div>
                <DmsAttachmentManager
                  currentUser={currentUser}
                  companyId={companyId}
                  storeId={storeId}
                  entityType="finance_entry"
                  entityId={selected.id}
                  vehicleId={selected.vehicleId}
                  plate={selected.plate}
                  categories={[{value:'proof',label:'Comprovante'},{value:'invoice',label:'Nota fiscal'},{value:'document',label:'Documento'},{value:'xml',label:'XML'},{value:'other',label:'Outro'}]}
                  title="Comprovantes e documentos financeiros"
                />

                {selected.status==='pending'&&canSettle&&<div className="mt-5 rounded-2xl border border-sky-400/10 bg-sky-400/[.035] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[.13em] text-sky-300">{selected.entryType==='payable'?'Baixar pagamento':'Baixar recebimento'}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <select value={financeAccountId} onChange={e=>setFinanceAccountId(e.target.value)} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white sm:col-span-2">
                      <option value="">Selecione banco / caixa...</option>
                      {accountBalances.map(account=><option key={account.accountId} value={account.accountId}>{account.accountType==='cash'?'Caixa':'Banco'} · {account.name} · {money(account.currentBalance)}</option>)}
                    </select>
                    <select value={method} onChange={e=>setMethod(e.target.value)} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white"><option>Pix</option><option>Transferência</option><option>Boleto</option><option>Dinheiro</option><option>Cartão</option><option>Outro</option></select>
                    <input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Comprovante / referência" className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white outline-none"/>
                  </div>
                  <button disabled={busy===selected.id} onClick={()=>void settle()} className="mt-3 h-11 w-full rounded-xl bg-sky-400 text-sm font-bold text-sky-950 disabled:opacity-50">{busy===selected.id?'Registrando...':selected.entryType==='payable'?'MARCAR COMO PAGO':'MARCAR COMO RECEBIDO'}</button>
                  <button disabled={busy===selected.id} onClick={()=>void cancel()} className="mt-2 h-10 w-full rounded-xl border border-red-400/15 text-xs font-semibold text-red-300 disabled:opacity-50">CANCELAR LANÇAMENTO</button>
                </div>}
                {selected.status==='pending'&&!canSettle&&<div className="mt-5 rounded-2xl border border-amber-400/15 bg-amber-400/[.04] p-4 text-sm text-amber-200">Este lançamento aguarda o Financeiro/Caixa para realizar a baixa.</div>}

                {isSettled(selected)&&<div className="mt-5 rounded-2xl border border-emerald-400/15 bg-emerald-400/[.04] p-4 text-sm text-emerald-300">{statusLabel(selected)} em {selected.settledAt?new Date(selected.settledAt).toLocaleString('pt-BR'):'—'}{selected.paymentMethod&&<span> · {selected.paymentMethod}</span>}{selected.financeAccountId&&<span> · {accounts.find(account=>account.accountId===selected.financeAccountId)?.name||selected.financeAccountId}</span>}{selected.paymentReference&&<span> · {selected.paymentReference}</span>}</div>}
                {isSettled(selected)&&canSettle&&<button disabled={busy!==''} onClick={()=>void requestReversal()} className="mt-3 h-10 w-full rounded-xl border border-amber-400/20 text-xs font-bold text-amber-300 disabled:opacity-50">SOLICITAR ESTORNO DA BAIXA</button>}
                {selected.reversedAt&&<div className="mt-3 rounded-xl border border-violet-400/15 bg-violet-400/[.04] p-3 text-xs text-violet-200">Último estorno em {new Date(selected.reversedAt).toLocaleString('pt-BR')} · {selected.reversalReason||'sem motivo informado'}</div>}
              </>}
            </div>
          </section>}
        </div>
      </div>
    </div>}

    {accountOpen&&canCreate&&<div className="fixed inset-0 z-[292] overflow-y-auto bg-black/75 p-4 backdrop-blur-sm" onClick={()=>setAccountOpen(false)}>
      <div className="mx-auto my-8 w-full max-w-2xl rounded-[26px] border border-white/10 bg-zinc-950 p-5 text-white shadow-2xl" onClick={event=>event.stopPropagation()}>
        <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-sky-300">BANCOS E CAIXAS</p><h4 className="mt-1 text-xl font-semibold">Contas financeiras da unidade</h4></div><button onClick={()=>setAccountOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-white/[.05] text-zinc-400"><X size={17}/></button></div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {accountBalances.map(account=><div key={account.accountId} className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-zinc-300">{account.accountType==='cash'?'CAIXA':'BANCO'} · {account.name}</p><p className="mt-1 text-[10px] text-zinc-600">{account.bankName||account.pixKey||'Conta da unidade'}</p></div><div className="flex items-center gap-2"><strong className="text-sm">{money(account.currentBalance)}</strong><button disabled={busy===`account-${account.accountId}`} onClick={()=>void deactivateAccount(account)} title="Inativar conta" className="grid h-8 w-8 place-items-center rounded-lg border border-red-400/15 text-red-300 disabled:opacity-40"><X size={13}/></button></div></div></div>)}
          {!accountBalances.length&&<div className="sm:col-span-2 rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs text-zinc-600">Nenhum banco ou caixa cadastrado.</div>}
        </div>
        <div className="mt-5 rounded-2xl border border-sky-400/10 bg-sky-400/[.035] p-4">
          <p className="text-xs font-semibold uppercase tracking-[.13em] text-sky-300">Nova conta / caixa</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select value={accountType} onChange={e=>setAccountType(e.target.value as FinanceAccountType)} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white"><option value="bank">Conta bancária</option><option value="cash">Caixa físico</option></select>
            <input value={accountName} onChange={e=>setAccountName(e.target.value)} placeholder={accountType==='cash'?'Ex.: Caixa Loja':'Ex.: Bradesco Movimento'} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white outline-none"/>
            {accountType==='bank'&&<><input value={accountBank} onChange={e=>setAccountBank(e.target.value)} placeholder="Banco" className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white outline-none"/><input value={accountAgency} onChange={e=>setAccountAgency(e.target.value)} placeholder="Agência" className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white outline-none"/><input value={accountNumber} onChange={e=>setAccountNumber(e.target.value)} placeholder="Conta" className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white outline-none"/><input value={accountPix} onChange={e=>setAccountPix(e.target.value)} placeholder="Chave Pix" className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white outline-none"/></>}
            <input type="number" value={openingBalance} onChange={e=>setOpeningBalance(e.target.value)} placeholder="Saldo inicial" className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs text-white outline-none"/>
          </div>
          <button disabled={busy==='account'} onClick={()=>void createAccount()} className="mt-3 h-11 w-full rounded-xl bg-sky-400 text-sm font-bold text-sky-950 disabled:opacity-50">{busy==='account'?'SALVANDO...':'CADASTRAR CONTA / CAIXA'}</button>
        </div>
      </div>
    </div>}

    <FinanceStructurePanel open={structureOpen} onClose={()=>setStructureOpen(false)} currentUser={currentUser} companyId={companyId} storeId={storeId} storeName={storeName} onChanged={()=>void loadStructure()}/>
    <FinanceReconciliationPanel open={reconciliationOpen} onClose={()=>setReconciliationOpen(false)} currentUser={currentUser} companyId={companyId} storeId={storeId} storeName={storeName}/>

    {entryOpen&&canCreate&&<div className="fixed inset-0 z-[290] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={()=>setEntryOpen(false)}>
      <div className="w-full max-w-xl rounded-[26px] border border-white/10 bg-zinc-950 p-5 text-white shadow-2xl" onClick={event=>event.stopPropagation()}>
        <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-sky-300">NOVO LANÇAMENTO</p><h4 className="mt-1 text-xl font-semibold">Financeiro da loja</h4></div><button onClick={()=>setEntryOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-white/[.05] text-zinc-400"><X size={17}/></button></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-500">Tipo<select value={entryType} onChange={e=>setEntryType(e.target.value as FinanceEntryType)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white"><option value="payable">Conta a pagar</option><option value="receivable">Conta a receber</option></select></label>
          <label className="text-xs text-zinc-500">Categoria<input value={category} onChange={e=>setCategory(e.target.value)} placeholder="Ex.: Preparação, aluguel, venda" className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white outline-none"/></label>
          <label className="text-xs text-zinc-500 sm:col-span-2">Descrição<input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Descrição do lançamento" className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white outline-none"/></label>
          <label className="text-xs text-zinc-500">{entryType==='payable'?'Fornecedor / beneficiário':'Cliente / pagador'}<input value={party} onChange={e=>setParty(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white outline-none"/></label>
          <label className="text-xs text-zinc-500">Valor total<input type="number" value={amount} onChange={e=>setAmount(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white outline-none"/></label>
          <label className="text-xs text-zinc-500">Primeiro vencimento<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white"/></label>
          <label className="text-xs text-zinc-500">Parcelas<input type="number" min="1" max="120" value={installments} onChange={e=>setInstallments(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white outline-none"/><span className="mt-1 block text-[10px] text-zinc-600">Acima de 1, o Motyq divide o valor total em vencimentos mensais.</span></label>
          <label className="text-xs text-zinc-500">Plano de contas<select value={chartAccountId} onChange={e=>setChartAccountId(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white"><option value="">Selecione...</option>{chartAccounts.map(item=><option key={item.chartAccountId} value={item.chartAccountId}>{item.code} · {item.name}</option>)}</select></label>
          <label className="text-xs text-zinc-500">Centro de custo<select value={costCenterId} onChange={e=>setCostCenterId(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white"><option value="">Selecione...</option>{costCenters.map(item=><option key={item.costCenterId} value={item.costCenterId}>{item.code} · {item.name}</option>)}</select></label>
          <label className="text-xs text-zinc-500">Placa opcional<input value={plate} onChange={e=>setPlate(clean(e.target.value).slice(0,7))} placeholder="ABC1D23" className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 font-mono text-sm text-white outline-none"/></label>
          <label className="text-xs text-zinc-500 sm:col-span-2">Veículo / referência<input value={vehicle} onChange={e=>setVehicle(e.target.value)} placeholder="Opcional" className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white outline-none"/></label>
        </div>
        {error&&<div className="mt-4 rounded-xl border border-red-400/15 bg-red-400/[.05] px-3 py-2 text-xs text-red-300">{error}</div>}
        <button disabled={busy==='create'} onClick={()=>void create()} className="mt-5 h-11 w-full rounded-xl bg-sky-400 text-sm font-bold text-sky-950 disabled:opacity-50">{busy==='create'?'SALVANDO...':'SALVAR LANÇAMENTO'}</button>
      </div>
    </div>}
  </>;
};

const TabButton=({active,onClick,icon,label,badge}:{active:boolean;onClick:()=>void;icon:React.ReactNode;label:string;badge?:number})=><button onClick={onClick} className={`flex h-10 items-center gap-2 rounded-xl border px-4 text-xs font-semibold transition ${active?'border-sky-400/25 bg-sky-400/[.08] text-sky-300':'border-white/10 bg-white/[.02] text-zinc-500'}`}>{icon}<span>{label}</span>{badge!==undefined&&badge>0&&<span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold text-amber-300">{badge}</span>}</button>;

const AgingCard=({label,items,tone}:{label:string;items:FinanceEntry[];tone:'critical'|'danger'|'warning'|'info'})=>{
  const total=items.reduce((sum,item)=>sum+Number(item.amount||0),0);
  const cls=tone==='critical'?'border-red-400/25 bg-red-400/[.07] text-red-200':tone==='danger'?'border-orange-400/20 bg-orange-400/[.05] text-orange-200':tone==='warning'?'border-amber-400/20 bg-amber-400/[.05] text-amber-200':'border-sky-400/15 bg-sky-400/[.04] text-sky-200';
  return <div className={`rounded-2xl border p-3 ${cls}`}><p className="text-[10px] font-bold uppercase tracking-[.08em] opacity-70">{label}</p><div className="mt-1 flex items-end justify-between gap-2"><b className="text-lg">{items.length}</b><span className="text-xs font-semibold">{money(total)}</span></div></div>;
};

const Metric=({icon,label,value,note,warn,danger}:{icon:React.ReactNode;label:string;value:string;note:string;warn?:boolean;danger?:boolean})=><div className={`rounded-[22px] border p-4 ${danger?'border-red-400/20 bg-red-400/[.05]':warn?'border-amber-400/20 bg-amber-400/[.05]':'border-white/10 bg-white/[.03]'}`}><div className="flex items-center gap-2 text-zinc-500">{icon}<p className="text-xs">{label}</p></div><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-[11px] text-zinc-600">{note}</p></div>;

const EntryRow=({entry,active,onClick}:{key?:React.Key;entry:FinanceEntry;active:boolean;onClick:()=>void})=>{
  const late=entry.status==='pending'&&entry.dueDate&&new Date(`${entry.dueDate}T23:59:59`).getTime()<Date.now();
  return <button onClick={onClick} className={`w-full rounded-2xl border p-4 text-left ${active?'border-sky-400/30 bg-sky-400/[.06]':'border-white/10 bg-black/20'}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${isSettled(entry)?'bg-emerald-400/10 text-emerald-300':entry.status==='cancelled'?'bg-zinc-400/10 text-zinc-400':'bg-amber-400/10 text-amber-300'}`}>{statusLabel(entry).toUpperCase()}</span>{entry.origin==='prep'&&<span className="rounded-full bg-sky-400/10 px-2 py-1 text-[9px] font-bold text-sky-300">PREPTRACK</span>}{entry.installmentCount&&entry.installmentCount>1&&<span className="rounded-full bg-violet-400/10 px-2 py-1 text-[9px] font-bold text-violet-300">{entry.installmentNumber}/{entry.installmentCount}</span>}{late&&<span className="rounded-full bg-red-400/10 px-2 py-1 text-[9px] font-bold text-red-300">VENCIDO</span>}</div>
        <p className="mt-2 truncate text-sm font-semibold text-zinc-200">{entry.description}</p><p className="mt-1 truncate text-xs text-zinc-500">{entry.party}{entry.plate?` · ${entry.plate}`:''}</p>
      </div>
      <div className="shrink-0 text-right"><p className="font-semibold">{money(entry.amount)}</p><p className="mt-1 text-[10px] text-zinc-600">{displayDate(entry.dueDate)}</p></div>
    </div>
  </button>;
};

const CashFlowView=({month,setMonth,entries,accounts,totalAccountBalance}:{month:string;setMonth:(value:string)=>void;entries:FinanceEntry[];accounts:Array<FinanceAccount&{currentBalance:number}>;totalAccountBalance:number})=>{
  const ordered=[...entries].sort((a,b)=>entryDate(a).localeCompare(entryDate(b)));
  let running=0;
  return <section className="mt-5 rounded-[24px] border border-white/10 bg-white/[.025] p-4 md:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.13em] text-zinc-500">MOVIMENTO DO MÊS</p><h4 className="mt-1 text-lg font-semibold">Fluxo realizado + previsto</h4></div><input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white"/></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{accounts.map(account=><div key={account.accountId} className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-zinc-600">{account.accountType==='cash'?'Caixa':'Banco'} · {account.name}</p><p className="mt-1 text-lg font-semibold text-zinc-300">{money(account.currentBalance)}</p></div>)}<div className="rounded-xl border border-sky-400/10 bg-sky-400/[.04] p-3"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-sky-500">Disponível nas contas</p><p className="mt-1 text-lg font-semibold text-sky-300">{money(totalAccountBalance)}</p></div></div>
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-[.1em] text-zinc-600"><tr><th className="p-3">Data</th><th className="p-3">Movimento</th><th className="p-3">Parte</th><th className="p-3">Status</th><th className="p-3 text-right">Entrada</th><th className="p-3 text-right">Saída</th><th className="p-3 text-right">Saldo acumulado</th></tr></thead><tbody>{ordered.map(entry=>{running+=entry.status==='cancelled'?0:entry.entryType==='receivable'?Number(entry.amount||0):-Number(entry.amount||0);return <tr key={entry.id} className="border-b border-white/5"><td className="p-3 text-zinc-500">{displayDate(entryDate(entry))}</td><td className="p-3"><p className="font-semibold text-zinc-300">{entry.description}</p>{entry.plate&&<p className="mt-1 font-mono text-[10px] text-zinc-600">{entry.plate}</p>}</td><td className="p-3 text-zinc-500">{entry.party}</td><td className="p-3 text-zinc-500">{statusLabel(entry)}</td><td className="p-3 text-right font-semibold text-emerald-300">{entry.entryType==='receivable'?money(entry.amount):'—'}</td><td className="p-3 text-right font-semibold text-red-300">{entry.entryType==='payable'?money(entry.amount):'—'}</td><td className={`p-3 text-right font-semibold ${running<0?'text-red-300':'text-zinc-300'}`}>{money(running)}</td></tr>})}{!ordered.length&&<tr><td colSpan={7} className="p-10 text-center text-zinc-600">Nenhum movimento neste mês.</td></tr>}</tbody></table></div>
  </section>;
};

const DreView=({month,setMonth,entries}:{month:string;setMonth:(value:string)=>void;entries:FinanceEntry[]})=>{
  const settled=entries.filter(isSettled);
  const byCategory=new Map<string,{revenue:number;expense:number}>();
  settled.forEach(entry=>{
    const key=entry.category||'Outros';
    const row=byCategory.get(key)||{revenue:0,expense:0};
    if(entry.entryType==='receivable')row.revenue+=Number(entry.amount)||0;
    else row.expense+=Number(entry.amount)||0;
    byCategory.set(key,row);
  });
  const rows=Array.from(byCategory.entries()).map(([category,value])=>({category,...value,result:value.revenue-value.expense})).sort((a,b)=>Math.abs(b.result)-Math.abs(a.result));
  const revenue=rows.reduce((sum,row)=>sum+row.revenue,0);
  const expense=rows.reduce((sum,row)=>sum+row.expense,0);
  const result=revenue-expense;
  return <section className="mt-5 rounded-[24px] border border-white/10 bg-white/[.025] p-4 md:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.13em] text-zinc-500">DRE GERENCIAL</p><h4 className="mt-1 text-lg font-semibold">Receitas e despesas realizadas por categoria</h4><p className="mt-1 text-xs text-zinc-600">Visão gerencial baseada nas baixas financeiras do Motyq.</p></div><input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white"/></div>
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-[.1em] text-zinc-600"><tr><th className="p-3">Categoria</th><th className="p-3 text-right">Receitas</th><th className="p-3 text-right">Despesas</th><th className="p-3 text-right">Resultado</th></tr></thead><tbody>{rows.map(row=><tr key={row.category} className="border-b border-white/5"><td className="p-3 font-semibold text-zinc-300">{row.category}</td><td className="p-3 text-right text-emerald-300">{money(row.revenue)}</td><td className="p-3 text-right text-red-300">{money(row.expense)}</td><td className={`p-3 text-right font-semibold ${row.result<0?'text-red-300':'text-zinc-300'}`}>{money(row.result)}</td></tr>)}{!rows.length&&<tr><td colSpan={4} className="p-10 text-center text-zinc-600">Nenhuma baixa financeira neste mês.</td></tr>}<tr className="border-t border-white/10"><td className="p-3 font-bold text-white">RESULTADO</td><td className="p-3 text-right font-bold text-emerald-300">{money(revenue)}</td><td className="p-3 text-right font-bold text-red-300">{money(expense)}</td><td className={`p-3 text-right text-base font-bold ${result<0?'text-red-300':'text-emerald-300'}`}>{money(result)}</td></tr></tbody></table></div>
  </section>;
};

const Info=({label,value}:{label:string;value:string})=><div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-zinc-600">{label}</p><p className="mt-1 text-sm font-semibold text-zinc-300">{value}</p></div>;

export default FinanceModulePanel;
