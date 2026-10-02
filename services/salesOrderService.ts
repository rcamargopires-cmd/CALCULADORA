import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { CrmProposalSnapshot, SalesOrder, ShowroomPassage, User } from '../types';
import { dmsCustomerService } from './dmsCustomerService';
import { dmsVehicleService } from './dmsVehicleService';
import { currentStockService } from './currentStockService';
import { financeService } from './financeService';
import { vehiclePurchaseService } from './vehiclePurchaseService';
import { canApproveOwn, canCancelSale } from './dmsFlowPolicy.mjs';
import { dmsAuditService } from './dmsAuditService';
import { configService } from './configService';
import { calculateCommission } from '../utils/commission';

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

const saleReceivables=async(order:SalesOrder)=>{
  const all=await financeService.getAll(order.companyId,order.storeId);
  return all.filter(item=>item.entryType==='receivable'&&item.origin==='sale'&&item.originId===order.salesOrderId&&item.status!=='cancelled');
};

const ensureReceivable=async(
  order:SalesOrder,
  actor:Pick<User,'email'|'name'>,
  key:'signal'|'financing'|'direct',
  amount:number,
  party:string,
  category:string,
  description:string,
)=>{
  if(amount<=0.01)return null;
  const existing=(await saleReceivables(order)).find(item=>String(item.paymentReference||'')===`sales:${order.salesOrderId}:${key}`);
  if(existing)return existing;
  const entry=await financeService.create({
    entryType:'receivable',category,description,party,amount,dueDate:today(),
    plate:order.plate,vehicle:order.vehicle,vehicleId:order.vehicleId,
    origin:'sale',originId:order.salesOrderId,companyId:order.companyId,storeId:order.storeId,actor,
  });
  const linked=await financeService.update(entry,{
    ...(order.customerId&&key!=='financing'?{partyId:order.customerId}:{}),
    paymentReference:`sales:${order.salesOrderId}:${key}`,
  });
  return linked;
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
    let master=await dmsVehicleService.findByPlate(lead.companyId,lead.storeId,plate);
    if(!master){
      const current=await currentStockService.getCurrent(lead.companyId,lead.storeId);
      const stockItem=current.find(item=>cleanPlate(item.plate)===plate);
      if(stockItem){
        const synced=await dmsVehicleService.syncFromStock(stockItem,lead.companyId,lead.storeId,actor);
        master=await dmsVehicleService.findByPlate(lead.companyId,lead.storeId,synced.plate);
      }
    }

    const customerDocument=String(proposal.acceptedCustomerDocument||'').replace(/\D/g,'').slice(0,14);
    const customer=await dmsCustomerService.ensure({
      companyId:lead.companyId,storeId:lead.storeId,name:lead.customerName,phone:lead.phone,email:lead.customerEmail,
      document:customerDocument,actor,
    });
    const stamp=now();
    const id=safe(`sale_${lead.companyId}_${lead.storeId}_${plate}_${proposal.id}`);
    const order:SalesOrder={
      id,kind:'sales_order',salesOrderId:id,companyId:lead.companyId,storeId:lead.storeId,
      leadId:lead.id,proposalId:proposal.id,proposalVersion:proposal.version,
      customerId:customer.customerId,customerName:lead.customerName,customerPhone:lead.phone,customerDocument,
      customerEmail:customer.email||lead.customerEmail||'',customerAddress:customer.address||'',customerCity:customer.city||'',
      customerState:customer.state||'',customerZipCode:customer.zipCode||'',
      sellerId:lead.assignedSellerId,sellerEmail:lead.assignedSellerEmail,sellerName:lead.assignedSellerName,
      vehicleId:master?.vehicleId,plate,vehicle:proposal.vehicle,year:proposal.year,
      salePrice:Number(proposal.salePrice)||0,discount:Number(proposal.discount)||0,
      netSalePrice:Math.max(0,(Number(proposal.salePrice)||0)-(Number(proposal.discount)||0)),
      cashEntry:Number(proposal.cashEntry)||0,financedAmount:Number(proposal.financedAmount)||0,
      installments:Number(proposal.installments)||0,estimatedInstallment:Number(proposal.estimatedInstallment)||0,
      creditStatus:Number(proposal.financedAmount)>0?'pending':'not_required',
      tradeInPlate:cleanPlate(proposal.tradeInPlate),tradeInValue:Number(proposal.tradeInValue)||0,
      tradeInDebt:Number(proposal.tradeInDebt)||0,status:'draft',
      deliveryChecklist:{financialReleased:false,documentsReady:false,vehicleReady:false,customerConfirmed:false},
      notes:proposal.notes||'',
      createdAt:stamp,updatedAt:stamp,createdBy:actor.email,createdByName:actor.name,
    };

    if(master){
      await reserveVehicle(order,actor as User,'Reservado').catch(()=>undefined);
      await dmsVehicleService.updateStage(master.vehicleId,'reserved',lead.companyId,lead.storeId,actor,'Proposta aceita e Pedido de Venda criado.').catch(()=>undefined);
    }

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

  approve:async(order:SalesOrder,actor:Pick<User,'email'|'name'|'role'>):Promise<SalesOrder>=>{
    if(order.status!=='draft')return order;
    if(!canApproveOwn({createdBy:order.createdBy,actorEmail:actor.email,actorRole:actor.role}))
      throw new Error('Quem criou a negociação não pode aprovar o próprio Pedido de Venda.');
    const stamp=now();
    const receivableIds=[...(order.receivableIds||[])];
    if(order.cashEntry>0){
      const signal=await ensureReceivable(
        order,actor,'signal',order.cashEntry,order.customerName,
        'Sinal de venda',`Sinal / entrada da venda · ${order.plate}`,
      );
      if(signal&&!receivableIds.includes(signal.id))receivableIds.push(signal.id);
    }
    const next:SalesOrder={
      ...order,
      receivableIds,
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

  setCredit:async(
    order:SalesOrder,
    status:'approved'|'rejected',
    bankName:string,
    actor:Pick<User,'email'|'name'>,
    creditReference='',
    financingReturn=0,
  ):Promise<SalesOrder>=>{
    if(order.financedAmount<=0)throw new Error('Este pedido não possui financiamento.');
    if(order.status!=='credit_pending')throw new Error('Pedido não está aguardando crédito.');
    const stamp=now();
    const next:SalesOrder={
      ...order,bankName:bankName.trim(),creditStatus:status,
      creditReference:creditReference.trim(),
      financingReturn:Math.max(0,Number(financingReturn)||0),
      creditDecisionAt:stamp,
      ...(status==='approved'?{creditApprovedAt:stamp}:{}),
      status:status==='approved'?'ready_to_invoice':'credit_pending',updatedAt:stamp,
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
    const tenantFiscal=actor.companyFiscal;
    if(tenantFiscal?.enabled&&tenantFiscal.provider==='focus_nfe'&&order.fiscalStatus!=='authorized'){
      throw new Error('A empresa exige NF-e integrada. Aguarde a autorização fiscal antes de concluir o faturamento.');
    }
    if(order.financedAmount>0&&order.creditStatus!=='approved')throw new Error('O financiamento precisa estar aprovado.');
    const receivableIds=[...(order.receivableIds||[])];
    if(order.cashEntry>0){
      const signal=await ensureReceivable(
        order,actor,'signal',order.cashEntry,order.customerName,
        'Sinal de venda',`Sinal / entrada da venda · ${order.plate}`,
      );
      if(signal&&!receivableIds.includes(signal.id))receivableIds.push(signal.id);
    }
    if(order.financedAmount>0){
      const financing=await ensureReceivable(
        order,actor,'financing',order.financedAmount,order.bankName||'Banco / financeira',
        'Financiamento',`Repasse de financiamento · ${order.plate}`,
      );
      if(financing&&!receivableIds.includes(financing.id))receivableIds.push(financing.id);
    }
    const netTrade=Math.max(0,order.tradeInValue-order.tradeInDebt);
    const covered=order.cashEntry+order.financedAmount+netTrade;
    const direct=Math.max(0,order.netSalePrice-covered);
    if(direct>0.01){
      const balance=await ensureReceivable(
        order,actor,'direct',direct,order.customerName,
        'Venda de veículo',`Saldo direto da venda · ${order.plate}`,
      );
      if(balance&&!receivableIds.includes(balance.id))receivableIds.push(balance.id);
    }

    let commissionPayableId=order.commissionPayableId||'';
    let commissionAmount=Number(order.commissionAmount)||0;
    if(!commissionPayableId&&order.sellerName){
      const stock=await currentStockService.getCurrent(order.companyId,order.storeId);
      const stockItem=stock.find(row=>(order.vehicleId&&row.vehicleId===order.vehicleId)||cleanPlate(row.plate)===cleanPlate(order.plate));
      const vehicleCost=Number(stockItem?.cost)||0;
      const config=await configService.loadConfig();
      const deal={
        licensePlate:order.plate,
        fipeValue:Number(stockItem?.fipe)||0,
        stockDays:Number(stockItem?.stockDays)||0,
        invoiceValue:order.netSalePrice,
        vehicleCost,
        bankReturn:Number(order.financingReturn)||0,
        payments:{entry:order.cashEntry,financing:order.financedAmount,tradeIn:order.tradeInValue},
        costs:{documentation:0,accessories:0,payoff:0,debts:0,others:0},
        dealStatus:'closed' as const,
        closingType:order.financedAmount>0?'banking' as const:'standard' as const,
      };
      const profit=order.netSalePrice-vehicleCost+(Number(order.financingReturn)||0);
      const commission=calculateCommission(deal,profit,config.commission);
      commissionAmount=Math.max(0,Number(commission.total)||0);
      if(commissionAmount>0.01){
        const existing=(await financeService.getAll(order.companyId,order.storeId))
          .find(item=>item.origin==='commission'&&item.originId===order.salesOrderId&&item.status!=='cancelled');
        const payable=existing||await financeService.create({
          entryType:'payable',
          category:'Comissão de venda',
          description:`Comissão da venda · ${order.plate}`,
          party:order.sellerName,
          amount:commissionAmount,
          dueDate:today(),
          plate:order.plate,
          vehicle:order.vehicle,
          vehicleId:order.vehicleId,
          origin:'commission',
          originId:order.salesOrderId,
          companyId:order.companyId,
          storeId:order.storeId,
          actor,
        });
        commissionPayableId=payable.id;
        await financeService.update(payable,{
          partyId:order.sellerId||order.sellerEmail||'',
          paymentReference:`commission:${order.salesOrderId}`,
        });
      }
    }

    await reserveVehicle(order,actor,'Faturado');
    if(order.vehicleId)await dmsVehicleService.updateStage(order.vehicleId,'invoiced',order.companyId,order.storeId,actor,'Pedido de Venda faturado.');
    const stamp=now();
    const next:SalesOrder={
      ...order,status:'invoiced',receivableIds,commissionPayableId,commissionAmount,
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

  updateDeliveryChecklist:async(order:SalesOrder,checklist:SalesOrder['deliveryChecklist']):Promise<SalesOrder>=>{
    if(!['invoiced','ready_to_invoice'].includes(order.status))throw new Error('Checklist de entrega disponível após liberação/faturamento.');
    const next:SalesOrder={...order,deliveryChecklist:checklist,updatedAt:now()};
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    return next;
  },

  deliver:async(order:SalesOrder,actor:User):Promise<SalesOrder>=>{
    if(order.status!=='invoiced')throw new Error('Somente vendas faturadas podem ser entregues.');
    const checklist={financialReleased:false,documentsReady:false,vehicleReady:false,customerConfirmed:false,...(order.deliveryChecklist||{})};
    if(!Object.values(checklist).every(Boolean))throw new Error('Conclua o checklist de entrega antes de liberar o veículo.');
    await currentStockService.markOut(order.plate,order.storeId,order.companyId,actor);
    if(order.vehicleId)await dmsVehicleService.updateStage(order.vehicleId,'delivered',order.companyId,order.storeId,actor,'Veículo entregue ao cliente.');
    await setDoc(doc(db,'showroom_passages',order.leadId),{status:'sale',closedAt:now(),updatedAt:now()},{merge:true});
    const stamp=now();
    const next:SalesOrder={...order,status:'delivered',deliveryChecklist:checklist,deliveryDate:today(),deliveredAt:stamp,deliveredBy:actor.email,deliveredByName:actor.name,updatedAt:stamp};
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'sale',entityId:next.id,
      vehicleId:next.vehicleId,plate:next.plate,action:'sales_order_delivered',
      label:'Veículo entregue e retirado do estoque atual',amount:next.netSalePrice,actor,
    }).catch(()=>undefined);
    return next;
  },

  cancel:async(order:SalesOrder,actor:User,reason='Venda cancelada'):Promise<SalesOrder>=>{
    if(!canCancelSale(order.status)){
      if(order.status==='cancelled')return order;
      throw new Error('Venda entregue exige fluxo de devolução, não cancelamento simples.');
    }
    const cleanReason=String(reason||'').trim()||'Venda cancelada';

    const allFinance=await financeService.getAll(order.companyId,order.storeId);
    const linkedIds=new Set<string>([
      ...(order.receivableIds||[]),
      ...(order.commissionPayableId?[order.commissionPayableId]:[]),
    ]);
    const reversedFinanceIds:string[]=[];
    for(const id of linkedIds){
      const finance=allFinance.find(item=>item.id===id);
      if(!finance||finance.status==='cancelled')continue;
      if(finance.status==='paid'||finance.status==='received'){
        const reversed=await financeService.reverseSettlement(finance,actor,`Cancelamento da venda ${order.salesOrderId}: ${cleanReason}`);
        await financeService.cancel(reversed);
        reversedFinanceIds.push(finance.id);
      }else if(finance.status==='pending'){
        await financeService.cancel(finance);
      }
    }

    if(order.tradeInPurchaseId){
      const purchases=await vehiclePurchaseService.list(order.companyId,order.storeId);
      const tradePurchase=purchases.find(item=>item.purchaseId===order.tradeInPurchaseId);
      if(tradePurchase&&tradePurchase.status==='entered'){
        throw new Error('A troca desta venda já entrou no estoque. Reverta primeiro a entrada da troca antes de cancelar a venda.');
      }
      if(tradePurchase&&tradePurchase.status!=='cancelled'){
        await vehiclePurchaseService.cancel(tradePurchase,actor);
      }
    }

    const stock=await currentStockService.getCurrent(order.companyId,order.storeId);
    const item=stock.find(row=>(order.vehicleId&&row.vehicleId===order.vehicleId)||cleanPlate(row.plate)===cleanPlate(order.plate));
    if(item)await currentStockService.upsert({...item,status:'Disponível'},order.storeId,order.companyId,actor);
    if(order.vehicleId)await dmsVehicleService.updateStage(order.vehicleId,'available',order.companyId,order.storeId,actor,'Pedido de Venda cancelado.');

    await setDoc(doc(db,'showroom_passages',order.leadId),{
      status:'follow_up',
      closedAt:null,
      updatedAt:now(),
    },{merge:true}).catch(()=>undefined);

    const stamp=now();
    const next:SalesOrder={
      ...order,status:'cancelled',cancelledAt:stamp,cancelledBy:actor.email,cancelledByName:actor.name,
      cancellationReason:cleanReason,reversedFinanceIds,updatedAt:stamp,
    };
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'sale',entityId:next.id,
      vehicleId:next.vehicleId,plate:next.plate,action:'sales_order_cancelled',
      label:'Pedido de Venda cancelado, financeiro revertido e estoque liberado',
      amount:next.netSalePrice,details:`${cleanReason} · estornos=${reversedFinanceIds.length}`,actor,
    }).catch(()=>undefined);
    return next;
  },
};
