import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { PrepOrder, PrepService } from '../types';

const safe=(v:string)=>v.replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,140);
const cleanPlate=(v:unknown)=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const uid=()=>`${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

export const prepTrackService={
  getOrders:async(companyId:string,storeId:string):Promise<PrepOrder[]>=>{
    const snap=await getDocs(query(collection(db,'prep_orders'),where('companyId','==',companyId),where('storeId','==',storeId)));
    return snap.docs.map(d=>d.data() as PrepOrder).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  },
  createOrder:async(input:{plate:string;vehicle:string;companyId:string;storeId:string;createdBy?:string}):Promise<PrepOrder>=>{
    const plate=cleanPlate(input.plate);
    const now=new Date().toISOString();
    const id=safe(`${input.companyId}_${input.storeId}_${plate}`);
    const order:PrepOrder={id,plate,vehicle:input.vehicle||plate,openedAt:now,updatedAt:now,status:'triage',sold:false,destination:'showroom',services:[],createdBy:input.createdBy||'',storeId:input.storeId,companyId:input.companyId};
    await setDoc(doc(db,'prep_orders',id),order,{merge:true});
    return order;
  },
  saveOrder:async(order:PrepOrder):Promise<void>=>{
    await setDoc(doc(db,'prep_orders',order.id),{...order,plate:cleanPlate(order.plate),updatedAt:new Date().toISOString()},{merge:true});
  },
  deleteOrder:async(orderId:string):Promise<void>=>{
    await deleteDoc(doc(db,'prep_orders',orderId));
  },
  addService:async(order:PrepOrder,service:Omit<PrepService,'id'>):Promise<PrepOrder>=>{
    const next={...order,services:[...(order.services||[]),{...service,id:uid()}],updatedAt:new Date().toISOString()};
    await setDoc(doc(db,'prep_orders',order.id),next,{merge:true});
    return next;
  },
  removeService:async(order:PrepOrder,serviceId:string):Promise<PrepOrder>=>{
    const next={...order,services:(order.services||[]).filter(item=>item.id!==serviceId),updatedAt:new Date().toISOString()};
    await setDoc(doc(db,'prep_orders',order.id),next,{merge:true});
    return next;
  }
};