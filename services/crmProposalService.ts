import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import type { CrmProposalSnapshot, CrmProposalStatus, ShowroomPassage, ShowroomPassageActivity } from '../types';
import { salesOrderService } from './salesOrderService';
import { dmsVehicleService } from './dmsVehicleService';
import { currentStockService } from './currentStockService';
import { proposalExpired, stockStatusForProposalEvent } from './dmsFlowPolicy.mjs';

export type ProposalInput=Pick<CrmProposalSnapshot,
  'vehicle'|'plate'|'year'|'km'|'location'|'stockPriceAtCreation'|'salePrice'|'discount'|
  'tradeInPlate'|'tradeInValue'|'tradeInDebt'|'cashEntry'|'installments'|'estimatedInstallment'|'notes'|'validUntil'>;

export const proposalMoney=(value:number)=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

const defaultValidUntil=()=>new Date(Date.now()+48*60*60*1000).toISOString();
const expired=(value?:string)=>proposalExpired(value);
const cleanDocument=(value:string)=>String(value||'').replace(/\D/g,'').slice(0,14);

const finiteNonnegative=(value:number,label:string)=>{
  if(!Number.isFinite(value)||value<0||value>100_000_000)throw new Error(label+' inválido.');
  return Math.round(value*100)/100;
};

export const proposalTotals=(input:Pick<ProposalInput,'salePrice'|'discount'|'tradeInValue'|'tradeInDebt'|'cashEntry'>)=>{
  const netTrade=Number(input.tradeInValue||0)-Number(input.tradeInDebt||0);
  const balance=Math.max(0,Number(input.salePrice||0)-Number(input.discount||0)-netTrade-Number(input.cashEntry||0));
  return {netTrade,financedAmount:Math.round(balance*100)/100};
};

export const crmProposalService={
  save:async(input:{
    leadId:string;
    proposalId?:string;
    expectedVersion?:number;
    proposal:ProposalInput;
    actor:{email:string;name:string};
  })=>{
    const p=input.proposal;
    if(!p.vehicle.trim())throw new Error('Informe o veículo da proposta.');
    const amounts={
      salePrice:finiteNonnegative(Number(p.salePrice),'Preço de venda'),
      discount:finiteNonnegative(Number(p.discount),'Desconto'),
      tradeInValue:finiteNonnegative(Number(p.tradeInValue),'Avaliação da troca'),
      tradeInDebt:finiteNonnegative(Number(p.tradeInDebt),'Saldo devedor da troca'),
      cashEntry:finiteNonnegative(Number(p.cashEntry),'Entrada em dinheiro'),
      estimatedInstallment:finiteNonnegative(Number(p.estimatedInstallment),'Parcela estimada'),
      stockPriceAtCreation:finiteNonnegative(Number(p.stockPriceAtCreation),'Preço de estoque'),
      km:finiteNonnegative(Number(p.km),'Quilometragem'),
      installments:finiteNonnegative(Number(p.installments),'Prazo em meses'),
    };
    if(!amounts.salePrice)throw new Error('Informe um preço de venda maior que zero.');
    if(amounts.discount>amounts.salePrice)throw new Error('Desconto acima do preço de venda.');
    const total=proposalTotals(amounts);
    if(amounts.cashEntry>amounts.salePrice-amounts.discount-(amounts.tradeInValue-amounts.tradeInDebt)){
      throw new Error('A entrada em dinheiro supera o valor restante da negociação.');
    }
    if(amounts.installments&&!total.financedAmount)throw new Error('Não há saldo a financiar.');
    if(amounts.estimatedInstallment&&!amounts.installments)throw new Error('Informe o prazo em meses para registrar a parcela.');
    if(!Number.isInteger(amounts.installments)||amounts.installments>120)throw new Error('Prazo em meses inválido.');
    if(amounts.estimatedInstallment&&amounts.estimatedInstallment*amounts.installments<total.financedAmount){
      throw new Error('O total das parcelas informadas é menor que o saldo a financiar. Revise a estimativa.');
    }
    const ref=doc(db,'showroom_passages',input.leadId);
    const proposalPlate=String(p.plate||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
    if(!/^[A-Z0-9]{7}$/.test(proposalPlate))throw new Error('Selecione um veículo do estoque com placa válida para criar a proposta.');
    const preSnap=await getDoc(ref);
    if(!preSnap.exists())throw new Error('Cliente não encontrado.');
    const preLead=preSnap.data() as ShowroomPassage;
    let master=await dmsVehicleService.findByPlate(preLead.companyId,preLead.storeId,proposalPlate);
    if(!master){
      const current=await currentStockService.getCurrent(preLead.companyId,preLead.storeId);
      const stockItem=current.find(item=>String(item.plate||'').toUpperCase()===proposalPlate);
      if(stockItem){
        await dmsVehicleService.syncFromStock(stockItem,preLead.companyId,preLead.storeId,input.actor);
        master=await dmsVehicleService.findByPlate(preLead.companyId,preLead.storeId,proposalPlate);
      }
    }
    if(!master)throw new Error('Este veículo não está no cadastro mestre da unidade. Atualize o estoque antes de criar a proposta.');
    const timestamp=new Date().toISOString();
    return runTransaction(db,async transaction=>{
      const snap=await transaction.get(ref);
      if(!snap.exists())throw new Error('Cliente não encontrado.');
      const lead=snap.data() as ShowroomPassage;
      if((lead as any).deletedAt)throw new Error('Atendimento removido.');
      const old=Array.isArray(lead.crmProposals)?lead.crmProposals:[];
      const versions=input.proposalId?old.filter(row=>row.id===input.proposalId):[];
      const prior=versions.sort((a,b)=>b.version-a.version)[0];
      if(input.proposalId&&!prior)throw new Error('Proposta anterior não encontrada.');
      if(input.proposalId&&prior?.version!==input.expectedVersion)throw new Error('A proposta mudou em outra sessão. Reabra a ficha antes de salvar.');
      if(prior&&prior.status==='accepted')throw new Error('Proposta aceita não pode ser alterada. Crie uma nova.');
      const id=prior?.id||doc(db,'showroom_passages',input.leadId,'crm_proposal_ids',String(Date.now())+'_'+Math.random().toString(36).slice(2,8)).id;
      const row:CrmProposalSnapshot={
        id,version:(prior?.version||0)+1,status:'draft',
        vehicle:p.vehicle.trim().slice(0,180),
        vehicleId:master.vehicleId,
        plate:proposalPlate,
        year:String(p.year||'').slice(0,24),
        km:amounts.km,
        location:String(p.location||'').slice(0,120),
        stockPriceAtCreation:amounts.stockPriceAtCreation,
        ...amounts,
        tradeInPlate:String(p.tradeInPlate||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7),
        financedAmount:total.financedAmount,
        notes:String(p.notes||'').trim().slice(0,2000),
        validUntil:p.validUntil&&new Date(p.validUntil).getTime()>Date.now()?new Date(p.validUntil).toISOString():(prior?.validUntil||defaultValidUntil()),
        createdAt:prior?.createdAt||timestamp,createdByEmail:prior?.createdByEmail||input.actor.email,
        createdByName:prior?.createdByName||input.actor.name,updatedAt:timestamp,
        updatedByEmail:input.actor.email,updatedByName:input.actor.name,
      };
      const event:ShowroomPassageActivity={
        id:timestamp+'_'+id,type:'contact',at:timestamp,
        label:prior?'Nova versão da proposta comercial':'Proposta comercial criada',
        details:row.vehicle+' · '+row.plate+' · '+proposalMoney(row.salePrice-row.discount)+' · versão '+row.version,
        status:lead.status,byEmail:input.actor.email,byName:input.actor.name,
      };
      transaction.update(ref,{
        crmProposals:[...old,row],
        activityHistory:[...(lead.activityHistory||[]),event].slice(-200),
        updatedAt:timestamp,
      });
      return row;
    });
  },
  setStatus:async(input:{
    leadId:string;proposalId:string;expectedVersion:number;
    status:'sent'|'rejected';actor:{email:string;name:string};
  })=>{
    const ref=doc(db,'showroom_passages',input.leadId);
    const timestamp=new Date().toISOString();
    const updated=await runTransaction(db,async transaction=>{
      const snap=await transaction.get(ref);
      if(!snap.exists())throw new Error('Cliente não encontrado.');
      const lead=snap.data() as ShowroomPassage;
      if((lead as any).deletedAt)throw new Error('Atendimento removido.');
      const old=Array.isArray(lead.crmProposals)?lead.crmProposals:[];
      const latest=old.filter(p=>p.id===input.proposalId).sort((a,b)=>b.version-a.version)[0];
      if(!latest||latest.version!==input.expectedVersion)throw new Error('Esta proposta foi alterada. Reabra a ficha e tente novamente.');
      if(latest.status===input.status)return latest;
      if(latest.status==='accepted'||latest.status==='rejected')throw new Error('Proposta já encerrada. Crie outra versão para renegociar.');
      if(input.status==='sent'&&latest.status!=='draft')throw new Error('Só rascunhos podem ser marcados como enviados.');
      if(input.status==='rejected'&&latest.status!=='sent')throw new Error('Somente proposta enviada pode ser recusada.');
      if(input.status==='sent'&&expired(latest.validUntil))throw new Error('A validade desta proposta venceu. Crie uma nova versão.');
      const next:CrmProposalSnapshot={
        ...latest,version:latest.version+1,status:input.status,
        ...(input.status==='sent'?{reservationExpiresAt:latest.validUntil||defaultValidUntil()}:{}),
        updatedAt:timestamp,updatedByEmail:input.actor.email,updatedByName:input.actor.name
      };
      const labels={sent:'Proposta enviada e veículo reservado',rejected:'Proposta recusada pelo cliente'};
      const event:ShowroomPassageActivity={id:timestamp+'_'+input.proposalId,type:'contact',at:timestamp,label:labels[input.status],details:next.vehicle+' · '+proposalMoney(next.salePrice-next.discount)+' · v'+next.version,status:lead.status,byEmail:input.actor.email,byName:input.actor.name};
      transaction.update(ref,{
        crmProposals:[...old,next],
        status:input.status==='sent'&&lead.status!=='sale'&&lead.status!=='no_deal'?'proposal':lead.status,
        activityHistory:[...(lead.activityHistory||[]),event].slice(-200),updatedAt:timestamp,
      });
      return next;
    });
    if(input.status==='sent'){
      const leadSnap=await getDoc(ref);
      const lead=leadSnap.data() as ShowroomPassage;
      const current=await currentStockService.getCurrent(lead.companyId,lead.storeId);
      const item=current.find(row=>String(row.plate||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===String(updated.plate||'').toUpperCase().replace(/[^A-Z0-9]/g,''));
      if(!item)throw new Error('Veículo não está no estoque atual para reserva.');
      const status=String(item.status||'').toLowerCase();
      if(status.includes('reserv')&&item.vehicleId!==updated.vehicleId)throw new Error('Veículo já reservado em outra negociação.');
      await currentStockService.upsert({...item,status:stockStatusForProposalEvent('sent')||'Reservado'},lead.storeId,lead.companyId,input.actor as any);
      if(updated.vehicleId)await dmsVehicleService.updateStage(updated.vehicleId,'reserved',lead.companyId,lead.storeId,input.actor as any,'Reserva temporária por proposta enviada.');
    }
    if(input.status==='rejected'){
      const leadSnap=await getDoc(ref);
      const lead=leadSnap.data() as ShowroomPassage;
      const current=await currentStockService.getCurrent(lead.companyId,lead.storeId);
      const item=current.find(row=>String(row.plate||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===String(updated.plate||'').toUpperCase().replace(/[^A-Z0-9]/g,''));
      if(item&&String(item.status||'').toLowerCase().includes('reserv')){
        await currentStockService.upsert({...item,status:stockStatusForProposalEvent('rejected')||'Disponível'},lead.storeId,lead.companyId,input.actor as any);
        if(updated.vehicleId)await dmsVehicleService.updateStage(updated.vehicleId,'available',lead.companyId,lead.storeId,input.actor as any,'Reserva liberada por recusa da proposta.');
      }
    }
    return updated;
  },

  acceptDigitally:async(input:{
    leadId:string;proposalId:string;expectedVersion:number;
    customerName:string;customerDocument:string;actor:{email:string;name:string};
  })=>{
    const customerName=String(input.customerName||'').trim();
    const customerDocument=cleanDocument(input.customerDocument);
    if(customerName.length<3)throw new Error('Informe o nome do cliente no aceite.');
    if(customerDocument.length!==11&&customerDocument.length!==14)throw new Error('Informe CPF/CNPJ válido para registrar o aceite.');
    const ref=doc(db,'showroom_passages',input.leadId);
    const timestamp=new Date().toISOString();
    const accepted=await runTransaction(db,async transaction=>{
      const snap=await transaction.get(ref);
      if(!snap.exists())throw new Error('Cliente não encontrado.');
      const lead=snap.data() as ShowroomPassage;
      const old=Array.isArray(lead.crmProposals)?lead.crmProposals:[];
      const latest=old.filter(p=>p.id===input.proposalId).sort((a,b)=>b.version-a.version)[0];
      if(!latest||latest.version!==input.expectedVersion)throw new Error('A proposta mudou. Reabra a ficha.');
      if(latest.status!=='sent')throw new Error('Somente proposta enviada pode receber aceite.');
      if(expired(latest.reservationExpiresAt||latest.validUntil))throw new Error('A proposta/reserva venceu. Crie uma nova versão.');
      const next:CrmProposalSnapshot={
        ...latest,version:latest.version+1,status:'accepted',acceptedAt:timestamp,
        acceptedCustomerName:customerName,acceptedCustomerDocument:customerDocument,
        acceptanceMethod:'assisted_digital',updatedAt:timestamp,updatedByEmail:input.actor.email,updatedByName:input.actor.name,
      };
      const event:ShowroomPassageActivity={
        id:timestamp+'_'+input.proposalId,type:'contact',at:timestamp,label:'Aceite digital registrado',
        details:`${next.vehicle} · ${proposalMoney(next.salePrice-next.discount)} · ${customerName} · documento final ${customerDocument.slice(-4)}`,
        status:lead.status,byEmail:input.actor.email,byName:input.actor.name,
      };
      transaction.update(ref,{crmProposals:[...old,next],activityHistory:[...(lead.activityHistory||[]),event].slice(-200),updatedAt:timestamp});
      return next;
    });
    await salesOrderService.createFromAcceptedProposal(input.leadId,accepted,input.actor as any);
    return accepted;
  },

  expireLeadReservations:async(leadId:string)=>{
    const ref=doc(db,'showroom_passages',leadId);
    const snap=await getDoc(ref);
    if(!snap.exists())return 0;
    const lead=snap.data() as ShowroomPassage;
    const old=Array.isArray(lead.crmProposals)?lead.crmProposals:[];
    const latestById=new Map<string,CrmProposalSnapshot>();
    old.forEach(row=>{const current=latestById.get(row.id);if(!current||current.version<row.version)latestById.set(row.id,row);});
    const targets=[...latestById.values()].filter(row=>row.status==='sent'&&expired(row.reservationExpiresAt||row.validUntil));
    if(!targets.length)return 0;
    const timestamp=new Date().toISOString();
    const appended:CrmProposalSnapshot[]=[];
    const events:ShowroomPassageActivity[]=[];
    for(const row of targets){
      appended.push({...row,version:row.version+1,status:'expired',updatedAt:timestamp,updatedByEmail:'system',updatedByName:'Motyq'});
      events.push({id:timestamp+'_'+row.id,type:'contact',at:timestamp,label:'Proposta e reserva expiradas',details:row.vehicle+' · '+row.plate,status:lead.status,byEmail:'system',byName:'Motyq'});
      const current=await currentStockService.getCurrent(lead.companyId,lead.storeId);
      const item=current.find(stock=>String(stock.plate||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===String(row.plate||'').toUpperCase().replace(/[^A-Z0-9]/g,''));
      if(item&&String(item.status||'').toLowerCase().includes('reserv')){
        await currentStockService.upsert({...item,status:stockStatusForProposalEvent('expired')||'Disponível'},lead.storeId,lead.companyId);
        if(row.vehicleId)await dmsVehicleService.updateStage(row.vehicleId,'available',lead.companyId,lead.storeId,null,'Reserva expirada automaticamente.');
      }
    }
    await runTransaction(db,async transaction=>{
      const fresh=await transaction.get(ref);
      if(!fresh.exists())return;
      const data=fresh.data() as ShowroomPassage;
      transaction.update(ref,{crmProposals:[...(data.crmProposals||[]),...appended],activityHistory:[...(data.activityHistory||[]),...events].slice(-200),updatedAt:timestamp});
    });
    return targets.length;
  },
};
