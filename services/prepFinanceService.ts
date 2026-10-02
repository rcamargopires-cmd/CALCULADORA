import { collection, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { PrepOrder, PrepPayable, PrepService, User, VehicleHistoryEvent, VehicleHistoryEventType } from '../types';
import { dmsAuditService } from './dmsAuditService';
import { dmsSupplierService } from './dmsSupplierService';

const LEDGER='operational_meta';
const safe=(value:string)=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const cleanPlate=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const now=()=>new Date().toISOString();
const announce=()=>{try{window.dispatchEvent(new Event('dealmaster:prep-finance-updated'));window.dispatchEvent(new Event('dealmaster:vehicle-history-updated'));}catch{}};
const payableId=(order:PrepOrder,service:PrepService)=>safe(`finance_prep_${order.companyId}_${order.storeId}_${order.id}_${service.id}`);
const historyId=(order:PrepOrder,service:PrepService,suffix:string)=>safe(`history_${order.companyId}_${order.storeId}_${order.id}_${service.id}_${suffix}`);
const serviceAmount=(service:PrepService)=>Math.max(0,Number(service.finalCost)||Number(service.estimatedCost)||0);

const historyPayload=(
  order:PrepOrder,
  service:PrepService,
  type:VehicleHistoryEventType,
  label:string,
  actor?:Pick<User,'email'|'name'>,
  extra:Partial<VehicleHistoryEvent>={},
):VehicleHistoryEvent=>({
  id:historyId(order,service,type),
  kind:'vehicle_history',
  vehicleId:order.vehicleId,
  plate:cleanPlate(order.plate),
  vehicle:order.vehicle,
  type,
  label,
  amount:serviceAmount(service),
  provider:service.provider||'',
  at:now(),
  byEmail:actor?.email||'',
  byName:actor?.name||'',
  orderId:order.id,
  serviceId:service.id,
  companyId:order.companyId,
  storeId:order.storeId,
  ...extra,
});

export const prepFinanceService={
  recordRequest:async(order:PrepOrder,service:PrepService,actor?:Pick<User,'email'|'name'>)=>{
    const event=historyPayload(order,service,'prep_requested',`Preparação solicitada: ${service.type}`,actor,{details:service.notes||''});
    await setDoc(doc(db,LEDGER,event.id),event,{merge:true});
    announce();
  },

  recordRejection:async(order:PrepOrder,service:PrepService,reason:string,actor:Pick<User,'email'|'name'>)=>{
    const event=historyPayload(
      order,
      service,
      'prep_rejected',
      `Preparação rejeitada: ${service.type}`,
      actor,
      {details:reason},
    );
    await setDoc(doc(db,LEDGER,event.id),event,{merge:true});
    await dmsAuditService.record({
      companyId:order.companyId,storeId:order.storeId,entityType:'prep',
      entityId:order.id,vehicleId:order.vehicleId,plate:cleanPlate(order.plate),
      action:'prep_rejected',label:`Preparação rejeitada: ${service.type}`,
      details:reason,amount:serviceAmount(service),actor,
    }).catch(()=>undefined);
    announce();
  },

  registerApproval:async(order:PrepOrder,service:PrepService,actor:Pick<User,'email'|'name'>)=>{
    const supplier=await dmsSupplierService.ensure({
      companyId:order.companyId,
      storeId:order.storeId,
      name:service.provider||'Sem fornecedor',
      actor,
    });
    const id=payableId(order,service);
    const stamp=now();
    const payable:PrepPayable={
      id,
      kind:'finance_entry',
      entryType:'payable',
      status:'pending',
      category:'Preparação de veículo',
      description:service.type,
      party:service.provider||'Sem fornecedor',
      partyId:supplier.supplierId,
      amount:serviceAmount(service),
      dueDate:service.dueAt?String(service.dueAt).slice(0,10):undefined,
      competenceDate:stamp.slice(0,10),
      plate:cleanPlate(order.plate),
      vehicle:order.vehicle,
      vehicleId:order.vehicleId,
      origin:'prep',
      originId:order.id,
      orderId:order.id,
      serviceId:service.id,
      serviceType:service.type,
      provider:service.provider||'Sem fornecedor',
      dueAt:service.dueAt?String(service.dueAt).slice(0,10):undefined,
      requestedBy:service.requestedBy||'',
      requestedByName:service.requestedByName||'',
      approvedBy:actor.email,
      approvedByName:actor.name,
      approvedAt:stamp,
      companyId:order.companyId,
      storeId:order.storeId,
      createdAt:stamp,
      updatedAt:stamp,
      createdBy:service.requestedBy||actor.email,
      createdByName:service.requestedByName||actor.name,
    };
    await setDoc(doc(db,LEDGER,id),payable,{merge:true});
    const event=historyPayload(order,{...service,payableId:id},'prep_approved',`Preparação aprovada: ${service.type}`,actor,{payableId:id,details:`Fornecedor: ${payable.provider}`});
    await setDoc(doc(db,LEDGER,event.id),event,{merge:true});
    await dmsAuditService.record({
      companyId:order.companyId,storeId:order.storeId,entityType:'prep',
      entityId:order.id,vehicleId:order.vehicleId,plate:cleanPlate(order.plate),
      action:'prep_approved',label:`Preparação aprovada: ${service.type}`,
      amount:payable.amount,actor,
    }).catch(()=>undefined);
    announce();
    return payable;
  },

  syncApprovedPayable:async(order:PrepOrder,service:PrepService)=>{
    const id=service.payableId||payableId(order,service);
    await setDoc(doc(db,LEDGER,id),{
      id,
      kind:'finance_entry',
      entryType:'payable',
      origin:'prep',
      originId:order.id,
      category:'Preparação de veículo',
      description:service.type,
      party:service.provider||'Sem fornecedor',
      amount:serviceAmount(service),
      provider:service.provider||'Sem fornecedor',
      serviceType:service.type,
      ...(service.dueAt?{dueDate:String(service.dueAt).slice(0,10),dueAt:String(service.dueAt).slice(0,10)}:{}),
      updatedAt:now(),
      companyId:order.companyId,
      storeId:order.storeId,
      plate:cleanPlate(order.plate),
      vehicle:order.vehicle,
      vehicleId:order.vehicleId,
      orderId:order.id,
      serviceId:service.id,
    },{merge:true});
    announce();
  },

  recordCompleted:async(order:PrepOrder,service:PrepService,actor?:Pick<User,'email'|'name'>)=>{
    const event=historyPayload(order,service,'prep_completed',`Preparação concluída: ${service.type}`,actor,{payableId:service.payableId||payableId(order,service)});
    await setDoc(doc(db,LEDGER,event.id),event,{merge:true});
    announce();
  },

  cancel:async(order:PrepOrder,service:PrepService,actor?:Pick<User,'email'|'name'>)=>{
    const id=service.payableId||payableId(order,service);
    await setDoc(doc(db,LEDGER,id),{
      id,
      kind:'finance_entry',
      entryType:'payable',
      origin:'prep',
      originId:order.id,
      status:'cancelled',
      updatedAt:now(),
      companyId:order.companyId,
      storeId:order.storeId,
      plate:cleanPlate(order.plate),
      vehicle:order.vehicle,
      vehicleId:order.vehicleId,
      orderId:order.id,
      serviceId:service.id,
      serviceType:service.type,
      provider:service.provider||'Sem fornecedor',
      category:'Preparação de veículo',
      description:service.type,
      party:service.provider||'Sem fornecedor',
      amount:serviceAmount(service),
    },{merge:true});
    const event=historyPayload(order,service,'prep_cancelled',`Preparação cancelada: ${service.type}`,actor,{payableId:id});
    await setDoc(doc(db,LEDGER,event.id),event,{merge:true});
    announce();
  },

  markPaid:async(payable:PrepPayable,actor:Pick<User,'email'|'name'>,paymentMethod='',paymentReference='',financeAccountId='')=>{
    const stamp=now();
    await setDoc(doc(db,LEDGER,payable.id),{
      status:'paid',
      paidAt:stamp,
      settledAt:stamp,
      paidBy:actor.email,
      paidByName:actor.name,
      paymentMethod,
      paymentReference,
      financeAccountId,
      updatedAt:stamp,
    },{merge:true});
    const service:PrepService={id:payable.serviceId,type:payable.serviceType,provider:payable.provider,status:'approved',estimatedCost:payable.amount,finalCost:payable.amount,payableId:payable.id};
    const order:PrepOrder={id:payable.orderId,vehicleId:payable.vehicleId,plate:payable.plate||'',vehicle:payable.vehicle||'',openedAt:payable.createdAt,updatedAt:stamp,status:'preparing',sold:false,destination:'showroom',services:[service],companyId:payable.companyId,storeId:payable.storeId};
    const event=historyPayload(order,service,'prep_paid',`Fornecedor pago: ${payable.serviceType}`,actor,{payableId:payable.id,amount:payable.amount,provider:payable.provider,details:[paymentMethod,paymentReference,financeAccountId].filter(Boolean).join(' · ')});
    await setDoc(doc(db,LEDGER,event.id),event,{merge:true});
    await dmsAuditService.record({
      companyId:payable.companyId,storeId:payable.storeId,entityType:'finance',
      entityId:payable.id,vehicleId:payable.vehicleId,plate:payable.plate,
      action:'prep_supplier_paid',label:`Fornecedor pago: ${payable.provider}`,
      amount:payable.amount,actor,
    }).catch(()=>undefined);
    announce();
  },

  getPayables:async(companyId:string,storeId:string):Promise<PrepPayable[]>=>{
    const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
    return snap.docs
      .map(item=>item.data() as any)
      .filter(item=>item.kind==='finance_entry'&&item.entryType==='payable'&&item.origin==='prep')
      .map(item=>item as PrepPayable)
      .sort((a,b)=>String(b.approvedAt||b.createdAt||'').localeCompare(String(a.approvedAt||a.createdAt||'')));
  },

  subscribePayables:(companyId:string,storeId:string,onItems:(items:PrepPayable[])=>void,onError?:(error:unknown)=>void)=>onSnapshot(
    query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)),
    snap=>onItems(
      snap.docs
        .map(item=>item.data() as any)
        .filter(item=>item.kind==='finance_entry'&&item.entryType==='payable'&&item.origin==='prep')
        .map(item=>item as PrepPayable)
        .sort((a,b)=>String(b.approvedAt||b.createdAt||'').localeCompare(String(a.approvedAt||a.createdAt||''))),
    ),
    error=>onError?.(error),
  ),

  getVehicleHistory:async(companyId:string,storeId:string,plate:string):Promise<VehicleHistoryEvent[]>=>{
    const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
    const target=cleanPlate(plate);
    return snap.docs
      .map(item=>item.data() as any)
      .filter(item=>item.kind==='vehicle_history'&&cleanPlate(item.plate)===target)
      .map(item=>item as VehicleHistoryEvent)
      .sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
  },
};
