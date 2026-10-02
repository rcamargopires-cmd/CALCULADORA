import { collection, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { PrepOrder, PrepPayable, PrepService, User, VehicleHistoryEvent, VehicleHistoryEventType } from '../types';

const safe=(value:string)=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const cleanPlate=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const now=()=>new Date().toISOString();
const announce=()=>{try{window.dispatchEvent(new Event('dealmaster:prep-finance-updated'));window.dispatchEvent(new Event('dealmaster:vehicle-history-updated'));}catch{}};
const payableId=(order:PrepOrder,service:PrepService)=>safe(`${order.companyId}_${order.storeId}_${order.id}_${service.id}`);
const historyId=(order:PrepOrder,service:PrepService,suffix:string)=>safe(`${order.companyId}_${order.storeId}_${order.id}_${service.id}_${suffix}`);

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
    const event=historyPayload(
      order,
      service,
      'prep_requested',
      `Preparação solicitada: ${service.type}`,
      actor,
      {details:service.notes||''},
    );
    await setDoc(doc(db,'vehicle_history',event.id),event,{merge:true});
    announce();
  },

  registerApproval:async(order:PrepOrder,service:PrepService,actor:Pick<User,'email'|'name'>)=>{
    const id=payableId(order,service);
    const stamp=now();
    const payable:PrepPayable={
      id,
      orderId:order.id,
      serviceId:service.id,
      plate:cleanPlate(order.plate),
      vehicle:order.vehicle,
      serviceType:service.type,
      provider:service.provider||'Sem fornecedor',
      amount:serviceAmount(service),
      ...(service.dueAt?{dueAt:String(service.dueAt).slice(0,10)}:{}),
      status:'pending',
      requestedBy:service.requestedBy||'',
      requestedByName:service.requestedByName||'',
      approvedBy:actor.email,
      approvedByName:actor.name,
      approvedAt:stamp,
      companyId:order.companyId,
      storeId:order.storeId,
      createdAt:stamp,
      updatedAt:stamp,
    };
    await setDoc(doc(db,'prep_payables',id),payable,{merge:true});
    const event=historyPayload(
      order,
      {...service,payableId:id},
      'prep_approved',
      `Preparação aprovada: ${service.type}`,
      actor,
      {payableId:id,details:`Fornecedor: ${payable.provider}`},
    );
    await setDoc(doc(db,'vehicle_history',event.id),event,{merge:true});
    announce();
    return payable;
  },

  syncApprovedPayable:async(order:PrepOrder,service:PrepService)=>{
    const id=service.payableId||payableId(order,service);
    await setDoc(doc(db,'prep_payables',id),{
      id,
      amount:serviceAmount(service),
      provider:service.provider||'Sem fornecedor',
      serviceType:service.type,
      ...(service.dueAt?{dueAt:String(service.dueAt).slice(0,10)}:{}),
      updatedAt:now(),
      companyId:order.companyId,
      storeId:order.storeId,
      plate:cleanPlate(order.plate),
      vehicle:order.vehicle,
      orderId:order.id,
      serviceId:service.id,
    },{merge:true});
    announce();
  },

  recordCompleted:async(order:PrepOrder,service:PrepService,actor?:Pick<User,'email'|'name'>)=>{
    const event=historyPayload(
      order,
      service,
      'prep_completed',
      `Preparação concluída: ${service.type}`,
      actor,
      {payableId:service.payableId||payableId(order,service)},
    );
    await setDoc(doc(db,'vehicle_history',event.id),event,{merge:true});
    announce();
  },

  cancel:async(order:PrepOrder,service:PrepService,actor?:Pick<User,'email'|'name'>)=>{
    const id=service.payableId||payableId(order,service);
    await setDoc(doc(db,'prep_payables',id),{
      id,status:'cancelled',updatedAt:now(),
      companyId:order.companyId,storeId:order.storeId,
      plate:cleanPlate(order.plate),vehicle:order.vehicle,
      orderId:order.id,serviceId:service.id,
      serviceType:service.type,provider:service.provider||'Sem fornecedor',
      amount:serviceAmount(service),
    },{merge:true});
    const event=historyPayload(order,service,'prep_cancelled',`Preparação cancelada: ${service.type}`,actor,{payableId:id});
    await setDoc(doc(db,'vehicle_history',event.id),event,{merge:true});
    announce();
  },

  markPaid:async(
    payable:PrepPayable,
    actor:Pick<User,'email'|'name'>,
    paymentMethod='',
    paymentReference='',
  )=>{
    const stamp=now();
    await setDoc(doc(db,'prep_payables',payable.id),{
      status:'paid',paidAt:stamp,paidBy:actor.email,paidByName:actor.name,
      paymentMethod,paymentReference,updatedAt:stamp,
    },{merge:true});
    const service:PrepService={
      id:payable.serviceId,type:payable.serviceType,provider:payable.provider,status:'approved',
      estimatedCost:payable.amount,finalCost:payable.amount,payableId:payable.id,
    };
    const order:PrepOrder={
      id:payable.orderId,plate:payable.plate,vehicle:payable.vehicle,openedAt:payable.createdAt,
      updatedAt:stamp,status:'preparing',sold:false,destination:'showroom',services:[service],
      companyId:payable.companyId,storeId:payable.storeId,
    };
    const event=historyPayload(
      order,
      service,
      'prep_paid',
      `Fornecedor pago: ${payable.serviceType}`,
      actor,
      {
        payableId:payable.id,
        amount:payable.amount,
        provider:payable.provider,
        details:[paymentMethod,paymentReference].filter(Boolean).join(' · '),
      },
    );
    await setDoc(doc(db,'vehicle_history',event.id),event,{merge:true});
    announce();
  },

  getPayables:async(companyId:string,storeId:string):Promise<PrepPayable[]>=>{
    const snap=await getDocs(query(
      collection(db,'prep_payables'),
      where('companyId','==',companyId),
      where('storeId','==',storeId),
    ));
    return snap.docs
      .map(item=>item.data() as PrepPayable)
      .sort((a,b)=>String(b.approvedAt||b.createdAt||'').localeCompare(String(a.approvedAt||a.createdAt||'')));
  },

  subscribePayables:(
    companyId:string,
    storeId:string,
    onItems:(items:PrepPayable[])=>void,
    onError?:(error:unknown)=>void,
  )=>onSnapshot(
    query(
      collection(db,'prep_payables'),
      where('companyId','==',companyId),
      where('storeId','==',storeId),
    ),
    snap=>onItems(
      snap.docs
        .map(item=>item.data() as PrepPayable)
        .sort((a,b)=>String(b.approvedAt||b.createdAt||'').localeCompare(String(a.approvedAt||a.createdAt||''))),
    ),
    error=>onError?.(error),
  ),

  getVehicleHistory:async(companyId:string,storeId:string,plate:string):Promise<VehicleHistoryEvent[]>=>{
    const snap=await getDocs(query(
      collection(db,'vehicle_history'),
      where('companyId','==',companyId),
      where('storeId','==',storeId),
    ));
    const target=cleanPlate(plate);
    return snap.docs
      .map(item=>item.data() as VehicleHistoryEvent)
      .filter(item=>cleanPlate(item.plate)===target)
      .sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
  },
};
