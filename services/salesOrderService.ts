import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { CrmProposalSnapshot, SalesOrder, ShowroomPassage, User } from '../types';
import { dmsCustomerService } from './dmsCustomerService';
import { dmsVehicleService } from './dmsVehicleService';
import { currentStockService } from './currentStockService';
import { financeService } from './financeService';
import { vehiclePurchaseService } from './vehiclePurchaseService';
import { dmsAuditService } from './dmsAuditService';

const LEDGER='operational_meta';
const safe=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const cleanPlate=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const now=()=>new Date().toISOString();
const today=()=>new Date().toISOString().slice(0,10);

const fromDocs=(docs:any[])=>docs
  .map(item=>item.data() as any)
  .filter(item=>item.kind==='sales_order')
  .map(item=>item as SalesOrder)
  .sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));

const reserveVehicle=async(order:SalesOrder,actor:User,status='Reservado')=>{
  const stock=await currentStockService.getCurrent(order.companyId,order.storeId);
  const item=stock.find(row=>(order.vehicleId&&row.vehicleId===order.vehicleId)||cleanPlate(row.plate)===cleanPlate(order.plate));
  if(!item)throw new Error('Veículo da proposta não está no estoque atual desta unidade.');
  const next={...item,status};
  await currentStockService.upsert(next,order.storeId,order.companyId,actor);
  return next;
};

export const salesOrderService={
  subscribe:(companyId:string,storeId:string,onItems:(items:SalesOrder[])=>void,onError?:(error:unknown)=>void)=>onSnapshot(
    query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)),
    snap=>onItems(fromDocs(snap.docs)),
    error=>onError?.(error),
  ),

  list:async(companyId:string,storeId:string):Promise<SalesOrder[]>=>{
    const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
    return fromDocs(snap.docs);
  },

  createFromAcceptedProposal:async(
    leadId:string,
    proposal:CrmProposalSnapshot,
    actor:User|Pick<User,'email'|'name'>,
  ):Promise<SalesOrder>=>{
    const leadSnap=await getDoc(doc(db,'showroom_passages',leadId));
    if(!leadSnap.exists())throw new Error('Atendimento não encontrado para gerar o pedido.');
    const lead={id:leadSnap.id,...leadSnap.data()} as ShowroomPassage;
    const existing=(await salesOrderService.list(lead.companyId,lead.storeId))
      .find(item=>item.proposalId===proposal.id&&item.status!=='cancelled');
    if(existing)return existing;

    const plate=cleanPlate(proposal.plate);
    if(!plate)throw new Error('A proposta aceita precisa ter uma placa do estoque.');
    const master=await dmsVehicleService.findByPlate(lead.companyId,lead.storeId,plate);
    if(!master)throw new Error('Veículo da proposta não está ligado ao cadastro mestre desta unidade.');

    const customer=await dmsCustomerService.ensure({
      companyId:lead.companyId,storeId:lead.storeId,name:lead.customerName,phone:lead.phone,email:lead.customerEmail,actor,
    });
    const stamp=now();
    const id=safe(`sale_${lead.companyId}_${lead.storeId}_${plate}_${proposal.id}`);
    const order:SalesOrder={
      id,kind:'sales_order',salesOrderId:id,companyId:lead.companyId,storeId:lead.storeId,
      leadId:lead.id,proposalId:proposal.id,proposalVersion:proposal.version,
      customerId:customer.customerId,customerName:lead.customerName,customerPhone:lead.phone,
      vehicleId:master.vehicleId,plate,vehicle:proposal.vehicle,year:proposal.year,
      salePrice:Number(proposal.salePrice)||0,discount:Number(proposal.discount)||0,
      netSalePrice:Math.max(0,(Number(proposal.salePrice)||0)-(Number(proposal.discount)||0)),
      cashEntry:Number(proposal.cashEntry)||0,financedAmount:Number(proposal.financedAmount)||0,
      installments:Number(proposal.installments)||0,estimatedInstallment:Number(proposal.estimatedInstallment)||0,
      creditStatus:Number(proposal.financedAmount)>0?'pending':'not_required',
      tradeInPlate:cleanPlate(proposal.tradeInPlate),tradeInValue:Number(proposal.tradeInValue)||0,
      tradeInDebt:Number(proposal.tradeInDebt)||0,status:'draft',notes:proposal.notes||'',
      createdAt:stamp,updatedAt:stamp,createdBy:actor.email,createdByName:actor.name,
    };

    await reserveVehicle(order,actor as User,'Reservado');
    await dmsVehicleService.updateStage(master.vehicleId,'reserved',lead.companyId,lead.storeId,actor,'Proposta aceita e Pedido de Venda criado.');

    if(order.tradeInPlate&&order.tradeInValue>0){
      const trade=await vehiclePurchaseService.createManual({
        companyId:order.companyId,storeId:order.storeId,plate:order.tradeInPlate,
        vehicle:`Veículo de troca · ${order.tradeInPlate}`,origin:'trade_in',
        purchasePrice:order.tradeInValue,actor,
      });
      const savedTrade=await vehiclePurchaseService.save({
        ...trade,
        ownerName:lead.customerName,
        ownerPhone:lead.phone,
        payoffAmount:order.tradeInDebt,
        notes:`Troca vinculada ao Pedido de Venda ${order.salesOrderId}.`,
      });
      order.tradeInPurchaseId=savedTrade.purchaseId;
    }

    await setDoc(doc(db,LEDGER,id),order,{merge:false});
    await dmsAuditService.record({
      companyId:order.companyId,storeId:order.storeId,entityType:'sale',entityId:id,
      vehicleId:order.vehicleId,plate:order.plate,action:'sales_order_created',
      label:'Pedido de Venda criado a partir de proposta aceita',amount:order.netSalePrice,actor,
    }).catch(()=>undefined);
    return order;
  },

  approve:async(order:SalesOrder,actor:Pick<User,'email'|'name'>):Promise<SalesOrder>=>{
    if(order.status!=='draft')return order;
    const stamp=now();
    const next:SalesOrder={
      ...order,
      status:order.financedAmount>0?'credit_pending':'ready_to_invoice',
      creditStatus:order.financedAmount>0?'pending':'not_required',
      approvedAt:stamp,approvedBy:actor.email,approvedByName:actor.name,updatedAt:stamp,
    };
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'sale',entityId:next.id,
      vehicleId:next.vehicleId,plate:next.plate,action:'sales_order_approved',
      label:'Pedido de Venda aprovado pelo gestor',amount:next.netSalePrice,actor,
    }).catch(()=>undefined);
    return next;
  },

  setCredit:async(order:SalesOrder,status:'approved'|'rejected',bankName:string,actor:Pick<User,'email'|'name'>):Promise<SalesOrder>=>{
    if(order.financedAmount<=0)throw new Error('Este pedido não possui financiamento.');
    if(order.status!=='credit_pending')throw new Error('Pedido não está aguardando crédito.');
    const next:SalesOrder={
      ...order,bankName:bankName.trim(),creditStatus:status,
      status:status==='approved'?'ready_to_invoice':'credit_pending',updatedAt:now(),
    };
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'sale',entityId:next.id,
      vehicleId:next.vehicleId,plate:next.plate,action:status==='approved'?'credit_approved':'credit_rejected',
      label:status==='approved'?'Crédito aprovado':'Crédito recusado',
      details:next.bankName||'Banco não informado',amount:next.financedAmount,actor,
    }).catch(()=>undefined);
    return next;
  },

  invoice:async(order:SalesOrder,invoiceNumber:string,actor:User):Promise<SalesOrder>=>{
    if(order.status!=='ready_to_invoice')throw new Error('Pedido ainda não está liberado para faturamento.');
    if(order.financedAmount>0&&order.creditStatus!=='approved')throw new Error('O financiamento precisa estar aprovado.');
    const receivableIds=[...(order.receivableIds||[])];
    if(!receivableIds.length){
      if(order.cashEntry>0){
        const entry=await financeService.create({
          entryType:'receivable',category:'Venda de veículo',description:`Entrada da venda · ${order.plate}`,
          party:order.customerName,amount:order.cashEntry,dueDate:today(),
          plate:order.plate,vehicle:order.vehicle,vehicleId:order.vehicleId,
          origin:'sale',originId:order.salesOrderId,companyId:order.companyId,storeId:order.storeId,actor,
        });
        if(order.customerId)await financeService.update(entry,{partyId:order.customerId});
        receivableIds.push(entry.id);
      }
      if(order.financedAmount>0){
        const entry=await financeService.create({
          entryType:'receivable',category:'Financiamento',description:`Repasse de financiamento · ${order.plate}`,
          party:order.bankName||'Banco / financeira',amount:order.financedAmount,dueDate:today(),
          plate:order.plate,vehicle:order.vehicle,vehicleId:order.vehicleId,
          origin:'sale',originId:order.salesOrderId,companyId:order.companyId,storeId:order.storeId,actor,
        });
        receivableIds.push(entry.id);
      }
      const netTrade=Math.max(0,order.tradeInValue-order.tradeInDebt);
      const covered=order.cashEntry+order.financedAmount+netTrade;
      const direct=Math.max(0,order.netSalePrice-covered);
      if(direct>0.01){
        const entry=await financeService.create({
          entryType:'receivable',category:'Venda de veículo',description:`Saldo direto da venda · ${order.plate}`,
          party:order.customerName,amount:direct,dueDate:today(),
          plate:order.plate,vehicle:order.vehicle,vehicleId:order.vehicleId,
          origin:'sale',originId:order.salesOrderId,companyId:order.companyId,storeId:order.storeId,actor,
        });
        if(order.customerId)await financeService.update(entry,{partyId:order.customerId});
        receivableIds.push(entry.id);
      }
    }

    await reserveVehicle(order,actor,'Faturado');
    if(order.vehicleId)await dmsVehicleService.updateStage(order.vehicleId,'invoiced',order.companyId,order.storeId,actor,'Pedido de Venda faturado.');
    const stamp=now();
    const next:SalesOrder={
      ...order,status:'invoiced',receivableIds,
      invoiceNumber:invoiceNumber.trim(),invoiceDate:today(),invoicedAt:stamp,updatedAt:stamp,
    };
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'sale',entityId:next.id,
      vehicleId:next.vehicleId,plate:next.plate,action:'sales_order_invoiced',
      label:'Venda faturada e recebíveis gerados',amount:next.netSalePrice,
      details:next.invoiceNumber||'Sem número de NF',actor,
    }).catch(()=>undefined);
    return next;
  },

  deliver:async(order:SalesOrder,actor:User):Promise<SalesOrder>=>{
    if(order.status!=='invoiced')throw new Error('Somente vendas faturadas podem ser entregues.');
    await currentStockService.markOut(order.plate,order.storeId,order.companyId,actor);
    if(order.vehicleId)await dmsVehicleService.updateStage(order.vehicleId,'delivered',order.companyId,order.storeId,actor,'Veículo entregue ao cliente.');
    await setDoc(doc(db,'showroom_passages',order.leadId),{status:'sale',closedAt:now(),updatedAt:now()},{merge:true});
    const stamp=now();
    const next:SalesOrder={...order,status:'delivered',deliveryDate:today(),deliveredAt:stamp,updatedAt:stamp};
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'sale',entityId:next.id,
      vehicleId:next.vehicleId,plate:next.plate,action:'sales_order_delivered',
      label:'Veículo entregue e retirado do estoque atual',amount:next.netSalePrice,actor,
    }).catch(()=>undefined);
    return next;
  },

  cancel:async(order:SalesOrder,actor:User):Promise<SalesOrder>=>{
    if(order.status==='delivered')throw new Error('Venda entregue exige fluxo de devolução, não cancelamento simples.');
    for(const id of order.receivableIds||[]){
      const finance=(await financeService.getAll(order.companyId,order.storeId)).find(item=>item.id===id);
      if(finance&&finance.status==='pending')await financeService.cancel(finance);
    }
    const stock=await currentStockService.getCurrent(order.companyId,order.storeId);
    const item=stock.find(row=>(order.vehicleId&&row.vehicleId===order.vehicleId)||cleanPlate(row.plate)===cleanPlate(order.plate));
    if(item)await currentStockService.upsert({...item,status:'Disponível'},order.storeId,order.companyId,actor);
    if(order.vehicleId)await dmsVehicleService.updateStage(order.vehicleId,'available',order.companyId,order.storeId,actor,'Pedido de Venda cancelado.');
    const next:SalesOrder={...order,status:'cancelled',updatedAt:now()};
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'sale',entityId:next.id,
      vehicleId:next.vehicleId,plate:next.plate,action:'sales_order_cancelled',
      label:'Pedido de Venda cancelado e estoque liberado',amount:next.netSalePrice,actor,
    }).catch(()=>undefined);
    return next;
  },
};
