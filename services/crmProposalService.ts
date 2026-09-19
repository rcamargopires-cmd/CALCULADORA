import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import type { CrmProposalSnapshot, CrmProposalStatus, ShowroomPassage, ShowroomPassageActivity } from '../types';

export type ProposalInput=Pick<CrmProposalSnapshot,
  'vehicle'|'plate'|'year'|'km'|'location'|'stockPriceAtCreation'|'salePrice'|'discount'|
  'tradeInPlate'|'tradeInValue'|'tradeInDebt'|'cashEntry'|'installments'|'estimatedInstallment'|'notes'>;

export const proposalMoney=(value:number)=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

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
        plate:String(p.plate||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7),
        year:String(p.year||'').slice(0,24),
        km:amounts.km,
        location:String(p.location||'').slice(0,120),
        stockPriceAtCreation:amounts.stockPriceAtCreation,
        ...amounts,
        tradeInPlate:String(p.tradeInPlate||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7),
        financedAmount:total.financedAmount,
        notes:String(p.notes||'').trim().slice(0,2000),
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
    status:Exclude<CrmProposalStatus,'draft'>;actor:{email:string;name:string};
  })=>{
    const ref=doc(db,'showroom_passages',input.leadId);
    const timestamp=new Date().toISOString();
    return runTransaction(db,async transaction=>{
      const snap=await transaction.get(ref);
      if(!snap.exists())throw new Error('Cliente não encontrado.');
      const lead=snap.data() as ShowroomPassage;
      if((lead as any).deletedAt)throw new Error('Atendimento removido.');
      const old=Array.isArray(lead.crmProposals)?lead.crmProposals:[];
      const latest=old.filter(p=>p.id===input.proposalId).sort((a,b)=>b.version-a.version)[0];
      if(!latest||latest.version!==input.expectedVersion)throw new Error('Esta proposta foi alterada. Reabra a ficha e tente novamente.');
      if(latest.status===input.status)return latest;
      if(latest.status==='accepted'||latest.status==='rejected')throw new Error('Proposta já encerrada. Crie outra versão para renegociar.');
      if(input.status==='accepted'&&latest.status!=='sent')throw new Error('Registre o envio da proposta antes de marcar como aceita.');
      if(input.status==='sent'&&latest.status!=='draft')throw new Error('Só rascunhos podem ser marcados como enviados.');
      const next:CrmProposalSnapshot={...latest,version:latest.version+1,status:input.status,updatedAt:timestamp,updatedByEmail:input.actor.email,updatedByName:input.actor.name};
      const labels={sent:'Proposta marcada como enviada',accepted:'Proposta aceita pelo cliente',rejected:'Proposta recusada pelo cliente'};
      const event:ShowroomPassageActivity={id:timestamp+'_'+input.proposalId,type:'contact',at:timestamp,label:labels[input.status],details:next.vehicle+' · '+proposalMoney(next.salePrice-next.discount)+' · v'+next.version,status:lead.status,byEmail:input.actor.email,byName:input.actor.name};
      transaction.update(ref,{
        crmProposals:[...old,next],
        status:input.status==='sent'&&lead.status!=='sale'&&lead.status!=='no_deal'?'proposal':lead.status,
        activityHistory:[...(lead.activityHistory||[]),event].slice(-200),updatedAt:timestamp,
      });
      return next;
    });
  },
};
