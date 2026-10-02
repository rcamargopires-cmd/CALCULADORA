import { collection, doc, getDocs, onSnapshot, query, runTransaction, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type {
  FactoryWarrantyClaim, User, WorkshopAppointment, WorkshopLaborItem, WorkshopOrder,
  WorkshopOrderStatus, WorkshopOrderType, WorkshopPart, WorkshopPartLine,
  WorkshopPartMovement, WorkshopTechnician,
} from '../types';
import { dmsAuditService } from './dmsAuditService';

const LEDGER='operational_meta';
const safe=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const cleanPlate=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const now=()=>new Date().toISOString();
const newId=(prefix:string,companyId:string,storeId:string)=>safe(`${prefix}_${companyId}_${storeId}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`);
const orderNo=()=>`OS-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-6)}`;

const kindQuery=(companyId:string,storeId:string,kind:string)=>query(
  collection(db,LEDGER),
  where('companyId','==',companyId),
  where('storeId','==',storeId),
  where('kind','==',kind),
);
const readKind=async<T>(companyId:string,storeId:string,kind:string):Promise<T[]>=>{
  const snap=await getDocs(kindQuery(companyId,storeId,kind));
  return snap.docs.map(item=>item.data() as T);
};
const totals=(order:WorkshopOrder)=>{
  const laborCost=(order.labor||[]).reduce((sum,item)=>sum+(Number(item.cost)||0),0);
  const partsCost=(order.parts||[]).reduce((sum,item)=>sum+(Number(item.totalCost)||0),0);
  return{laborCost,partsCost,totalCost:laborCost+partsCost};
};

export const workshopService={
  listOrders:async(companyId:string,storeId:string)=>(
    await readKind<WorkshopOrder>(companyId,storeId,'workshop_order')
  ).sort((a,b)=>String(b.openedAt||'').localeCompare(String(a.openedAt||''))),

  subscribeOrders:(companyId:string,storeId:string,onItems:(items:WorkshopOrder[])=>void,onError?:(error:unknown)=>void)=>onSnapshot(
    kindQuery(companyId,storeId,'workshop_order'),
    snap=>onItems(snap.docs.map(item=>item.data() as WorkshopOrder).sort((a,b)=>String(b.openedAt||'').localeCompare(String(a.openedAt||'')))),
    error=>onError?.(error),
  ),

  listAppointments:async(companyId:string,storeId:string)=>(
    await readKind<WorkshopAppointment>(companyId,storeId,'workshop_appointment')
  ).sort((a,b)=>String(a.scheduledAt||'').localeCompare(String(b.scheduledAt||''))),

  listParts:async(companyId:string,storeId:string)=>(
    await readKind<WorkshopPart>(companyId,storeId,'workshop_part')
  ).sort((a,b)=>a.description.localeCompare(b.description,'pt-BR')),

  listTechnicians:async(companyId:string,storeId:string)=>(
    await readKind<WorkshopTechnician>(companyId,storeId,'workshop_technician')
  ).filter(item=>item.active!==false).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')),

  listWarrantyClaims:async(companyId:string,storeId:string)=>(
    await readKind<FactoryWarrantyClaim>(companyId,storeId,'factory_warranty_claim')
  ).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))),

  createAppointment:async(input:{
    companyId:string;storeId:string;scheduledAt:string;durationMinutes:number;
    vehicleId?:string;plate:string;vehicle:string;customerId?:string;customerName?:string;
    reason:string;technicianId?:string;technicianName?:string;actor:Pick<User,'email'|'name'>;
  }):Promise<WorkshopAppointment>=>{
    if(!input.scheduledAt)throw new Error('Informe data e hora do agendamento.');
    if(!input.vehicle.trim())throw new Error('Informe o veículo.');
    const stamp=now();
    const id=newId('workshop_appointment',input.companyId,input.storeId);
    const item:WorkshopAppointment={
      id,kind:'workshop_appointment',companyId:input.companyId,storeId:input.storeId,
      scheduledAt:new Date(input.scheduledAt).toISOString(),
      durationMinutes:Math.max(15,Math.min(720,Number(input.durationMinutes)||60)),
      vehicleId:input.vehicleId,plate:cleanPlate(input.plate),vehicle:input.vehicle.trim(),
      customerId:input.customerId,customerName:String(input.customerName||'').trim(),
      reason:String(input.reason||'').trim()||'Atendimento de oficina',
      technicianId:input.technicianId,technicianName:input.technicianName,
      status:'scheduled',createdAt:stamp,createdBy:input.actor.email,createdByName:input.actor.name,updatedAt:stamp,
    };
    await setDoc(doc(db,LEDGER,id),item,{merge:false});
    await dmsAuditService.record({
      companyId:item.companyId,storeId:item.storeId,entityType:'system',entityId:item.id,
      vehicleId:item.vehicleId,plate:item.plate,action:'workshop_appointment_created',
      label:'Agendamento de oficina criado',details:`${item.vehicle} · ${item.reason}`,actor:input.actor,
    }).catch(()=>undefined);
    return item;
  },

  updateAppointment:async(item:WorkshopAppointment,patch:Partial<WorkshopAppointment>,actor:Pick<User,'email'|'name'>)=>{
    const next={...item,...patch,updatedAt:now()} as WorkshopAppointment;
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    return next;
  },

  createOrder:async(input:{
    companyId:string;storeId:string;orderType:WorkshopOrderType;vehicleId?:string;plate:string;vehicle:string;
    customerId?:string;customerName?:string;prepOrderId?:string;afterSalesCaseId?:string;appointmentId?:string;
    complaint:string;promisedAt?:string;actor:Pick<User,'email'|'name'>;
  }):Promise<WorkshopOrder>=>{
    if(!input.vehicle.trim())throw new Error('Informe o veículo da OS.');
    if(input.prepOrderId||input.afterSalesCaseId||input.appointmentId){
      const existing=(await workshopService.listOrders(input.companyId,input.storeId)).find(order=>
        (input.prepOrderId&&order.prepOrderId===input.prepOrderId) ||
        (input.afterSalesCaseId&&order.afterSalesCaseId===input.afterSalesCaseId) ||
        (input.appointmentId&&order.appointmentId===input.appointmentId)
      );
      if(existing)return existing;
    }
    const stamp=now();
    const id=newId('workshop_order',input.companyId,input.storeId);
    const order:WorkshopOrder={
      id,kind:'workshop_order',companyId:input.companyId,storeId:input.storeId,orderNumber:orderNo(),
      orderType:input.orderType,status:'open',vehicleId:input.vehicleId,plate:cleanPlate(input.plate),
      vehicle:input.vehicle.trim(),customerId:input.customerId,customerName:String(input.customerName||'').trim(),
      prepOrderId:input.prepOrderId,afterSalesCaseId:input.afterSalesCaseId,appointmentId:input.appointmentId,
      complaint:String(input.complaint||'').trim()||'Serviço de oficina',labor:[],parts:[],
      laborCost:0,partsCost:0,totalCost:0,openedAt:stamp,promisedAt:input.promisedAt,
      createdBy:input.actor.email,createdByName:input.actor.name,updatedAt:stamp,
    };
    await setDoc(doc(db,LEDGER,id),order,{merge:false});
    if(input.appointmentId){
      await setDoc(doc(db,LEDGER,input.appointmentId),{status:'converted',workshopOrderId:id,updatedAt:stamp},{merge:true});
    }
    await dmsAuditService.record({
      companyId:order.companyId,storeId:order.storeId,entityType:'system',entityId:order.id,
      vehicleId:order.vehicleId,plate:order.plate,action:'workshop_order_created',
      label:`OS aberta: ${order.orderNumber}`,details:order.complaint,actor:input.actor,
    }).catch(()=>undefined);
    return order;
  },

  saveOrder:async(order:WorkshopOrder,patch:Partial<WorkshopOrder>,actor:Pick<User,'email'|'name'>)=>{
    let next={...order,...patch,updatedAt:now()} as WorkshopOrder;
    next={...next,...totals(next)};
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    return next;
  },

  setOrderStatus:async(order:WorkshopOrder,status:WorkshopOrderStatus,actor:Pick<User,'email'|'name'>)=>{
    const stamp=now();
    const patch:Partial<WorkshopOrder>={
      status,updatedAt:stamp,
      ...(status==='ready'&&!order.readyAt?{readyAt:stamp}:{}),
      ...(status==='delivered'&&!order.deliveredAt?{deliveredAt:stamp}:{}),
    };
    const next={...order,...patch} as WorkshopOrder;
    await setDoc(doc(db,LEDGER,order.id),patch,{merge:true});
    await dmsAuditService.record({
      companyId:order.companyId,storeId:order.storeId,entityType:'system',entityId:order.id,
      vehicleId:order.vehicleId,plate:order.plate,action:'workshop_order_status',
      label:`OS ${order.orderNumber}: ${status}`,actor,
    }).catch(()=>undefined);
    return next;
  },

  addLabor:async(order:WorkshopOrder,input:{
    description:string;technicianId?:string;technicianName?:string;estimatedMinutes:number;hourlyRate:number;
  },actor:Pick<User,'email'|'name'>)=>{
    const estimatedMinutes=Math.max(0,Number(input.estimatedMinutes)||0);
    const hourlyRate=Math.max(0,Number(input.hourlyRate)||0);
    const item:WorkshopLaborItem={
      id:newId('labor',order.companyId,order.storeId),description:String(input.description||'').trim()||'Mão de obra',
      technicianId:input.technicianId,technicianName:input.technicianName,
      estimatedMinutes,actualMinutes:0,hourlyRate,cost:Math.round((estimatedMinutes/60)*hourlyRate*100)/100,
    };
    return workshopService.saveOrder(order,{labor:[...(order.labor||[]),item]},actor);
  },

  finishLabor:async(order:WorkshopOrder,laborId:string,actualMinutes:number,actor:Pick<User,'email'|'name'>)=>{
    const labor=(order.labor||[]).map(item=>{
      if(item.id!==laborId)return item;
      const minutes=Math.max(0,Number(actualMinutes)||0);
      return{
        ...item,actualMinutes:minutes,finishedAt:now(),
        startedAt:item.startedAt||order.openedAt,
        cost:Math.round((minutes/60)*(Number(item.hourlyRate)||0)*100)/100,
      };
    });
    return workshopService.saveOrder(order,{labor},actor);
  },

  savePart:async(input:{
    companyId:string;storeId:string;part?:WorkshopPart;sku:string;description:string;brand?:string;location?:string;
    quantity:number;minQuantity:number;unitCost:number;salePrice:number;actor:Pick<User,'email'|'name'>;
  }):Promise<WorkshopPart>=>{
    const sku=String(input.sku||'').trim().toUpperCase();
    if(!sku)throw new Error('Informe o SKU/código da peça.');
    if(!String(input.description||'').trim())throw new Error('Informe a descrição da peça.');
    const existing=input.part;
    const partId=existing?.partId||newId('part',input.companyId,input.storeId);
    const item:WorkshopPart={
      id:existing?.id||safe(`workshop_part_${partId}`),kind:'workshop_part',
      companyId:input.companyId,storeId:input.storeId,partId,sku,description:String(input.description).trim(),
      brand:String(input.brand||'').trim(),location:String(input.location||'').trim(),
      quantity:Math.max(0,Number(input.quantity)||0),reservedQuantity:Math.max(0,Number(existing?.reservedQuantity)||0),
      minQuantity:Math.max(0,Number(input.minQuantity)||0),unitCost:Math.max(0,Number(input.unitCost)||0),
      salePrice:Math.max(0,Number(input.salePrice)||0),active:true,updatedAt:now(),
    };
    await setDoc(doc(db,LEDGER,item.id),item,{merge:true});
    return item;
  },

  issuePart:async(order:WorkshopOrder,part:WorkshopPart,quantity:number,actor:Pick<User,'email'|'name'>)=>{
    const qty=Math.max(1,Math.trunc(Number(quantity)||1));
    const movementId=newId('part_movement',order.companyId,order.storeId);
    return runTransaction(db,async transaction=>{
      const partRef=doc(db,LEDGER,part.id);
      const orderRef=doc(db,LEDGER,order.id);
      const [partSnap,orderSnap]=await Promise.all([transaction.get(partRef),transaction.get(orderRef)]);
      if(!partSnap.exists()||!orderSnap.exists())throw new Error('Peça ou OS não encontrada.');
      const freshPart=partSnap.data() as WorkshopPart;
      const freshOrder=orderSnap.data() as WorkshopOrder;
      if(Number(freshPart.quantity||0)<qty)throw new Error('Estoque de peça insuficiente.');
      const line:WorkshopPartLine={
        id:newId('part_line',order.companyId,order.storeId),partId:freshPart.partId,sku:freshPart.sku,
        description:freshPart.description,quantity:qty,unitCost:Number(freshPart.unitCost)||0,
        totalCost:Math.round(qty*(Number(freshPart.unitCost)||0)*100)/100,
      };
      const nextOrder={...freshOrder,parts:[...(freshOrder.parts||[]),line],updatedAt:now()} as WorkshopOrder;
      Object.assign(nextOrder,totals(nextOrder));
      transaction.set(partRef,{quantity:Number(freshPart.quantity||0)-qty,updatedAt:now()},{merge:true});
      transaction.set(orderRef,nextOrder,{merge:true});
      const movement:WorkshopPartMovement={
        id:movementId,kind:'workshop_part_movement',companyId:order.companyId,storeId:order.storeId,
        partId:freshPart.partId,sku:freshPart.sku,workshopOrderId:order.id,movement:'issue',
        quantity:qty,unitCost:Number(freshPart.unitCost)||0,reason:`Baixa para ${order.orderNumber}`,
        createdAt:now(),createdBy:actor.email,createdByName:actor.name,
      };
      transaction.set(doc(db,LEDGER,movementId),movement);
      return{order:nextOrder,part:{...freshPart,quantity:Number(freshPart.quantity||0)-qty}};
    });
  },

  saveTechnician:async(input:{
    companyId:string;storeId:string;technician?:WorkshopTechnician;name:string;email?:string;specialty?:string;
    hourlyCost:number;actor:Pick<User,'email'|'name'>;
  }):Promise<WorkshopTechnician>=>{
    if(!String(input.name||'').trim())throw new Error('Informe o nome do técnico.');
    const technicianId=input.technician?.technicianId||newId('tech',input.companyId,input.storeId);
    const item:WorkshopTechnician={
      id:input.technician?.id||safe(`workshop_technician_${technicianId}`),kind:'workshop_technician',
      companyId:input.companyId,storeId:input.storeId,technicianId,name:String(input.name).trim(),
      email:String(input.email||'').trim().toLowerCase(),specialty:String(input.specialty||'').trim(),
      hourlyCost:Math.max(0,Number(input.hourlyCost)||0),active:true,updatedAt:now(),
    };
    await setDoc(doc(db,LEDGER,item.id),item,{merge:true});
    return item;
  },

  saveWarrantyClaim:async(input:{
    companyId:string;storeId:string;claim?:FactoryWarrantyClaim;workshopOrder:WorkshopOrder;
    manufacturer:string;protocol?:string;status:FactoryWarrantyClaim['status'];requestedAmount:number;approvedAmount:number;
    notes?:string;actor:Pick<User,'email'|'name'>;
  }):Promise<FactoryWarrantyClaim>=>{
    const stamp=now();
    const claimId=input.claim?.claimId||newId('warranty_claim',input.companyId,input.storeId);
    const item:FactoryWarrantyClaim={
      id:input.claim?.id||safe(`factory_warranty_${claimId}`),kind:'factory_warranty_claim',
      companyId:input.companyId,storeId:input.storeId,claimId,workshopOrderId:input.workshopOrder.id,
      vehicleId:input.workshopOrder.vehicleId,plate:input.workshopOrder.plate,
      manufacturer:String(input.manufacturer||'').trim(),protocol:String(input.protocol||'').trim(),
      status:input.status,requestedAmount:Math.max(0,Number(input.requestedAmount)||0),
      approvedAmount:Math.max(0,Number(input.approvedAmount)||0),notes:String(input.notes||'').trim(),
      ...(input.status==='submitted'&&!input.claim?.submittedAt?{submittedAt:stamp}:input.claim?.submittedAt?{submittedAt:input.claim.submittedAt}:{}),
      ...(['approved','rejected'].includes(input.status)&&!input.claim?.decidedAt?{decidedAt:stamp}:input.claim?.decidedAt?{decidedAt:input.claim.decidedAt}:{}),
      ...(input.status==='paid'&&!input.claim?.paidAt?{paidAt:stamp}:input.claim?.paidAt?{paidAt:input.claim.paidAt}:{}),
      updatedAt:stamp,
    };
    await setDoc(doc(db,LEDGER,item.id),item,{merge:true});
    await dmsAuditService.record({
      companyId:item.companyId,storeId:item.storeId,entityType:'system',entityId:item.id,
      vehicleId:item.vehicleId,plate:item.plate,action:'factory_warranty_updated',
      label:`Garantia de fábrica: ${item.status}`,details:[item.manufacturer,item.protocol].filter(Boolean).join(' · '),
      amount:item.approvedAmount||item.requestedAmount,actor:input.actor,
    }).catch(()=>undefined);
    return item;
  },

  technicianProductivity:async(companyId:string,storeId:string)=>{
    const [orders,technicians]=await Promise.all([
      workshopService.listOrders(companyId,storeId),workshopService.listTechnicians(companyId,storeId),
    ]);
    return technicians.map(tech=>{
      const labor=orders.flatMap(order=>(order.labor||[]).filter(item=>item.technicianId===tech.technicianId));
      const actualMinutes=labor.reduce((sum,item)=>sum+(Number(item.actualMinutes)||0),0);
      const estimatedMinutes=labor.reduce((sum,item)=>sum+(Number(item.estimatedMinutes)||0),0);
      const completed=labor.filter(item=>Boolean(item.finishedAt)).length;
      return{
        technicianId:tech.technicianId,name:tech.name,completed,actualMinutes,estimatedMinutes,
        efficiencyPercent:actualMinutes>0?estimatedMinutes/actualMinutes*100:0,
        laborValue:labor.reduce((sum,item)=>sum+(Number(item.cost)||0),0),
      };
    }).sort((a,b)=>b.actualMinutes-a.actualMinutes);
  },
};
