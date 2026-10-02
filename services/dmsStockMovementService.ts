import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { OperationalStockItem, StockMovement, StockMovementType, User } from '../types';

const LEDGER='operational_meta';
const safe=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const cleanPlate=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);

export const dmsStockMovementService={
  record:async(input:{
    item:Pick<OperationalStockItem,'vehicleId'|'plate'|'vehicle'|'cost'>;
    companyId:string;
    storeId:string;
    movement:StockMovementType;
    fromStatus?:string;
    toStatus?:string;
    fromStoreId?:string;
    toStoreId?:string;
    amount?:number;
    reason?:string;
    actor?:Pick<User,'email'|'name'>|null;
    source?:StockMovement['source'];
  }):Promise<StockMovement|null>=>{
    if(!input.item.vehicleId)return null;
    const at=new Date().toISOString();
    const id=safe(`stock_movement_${input.companyId}_${input.storeId}_${input.item.vehicleId}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
    const movement:StockMovement={
      id,
      kind:'stock_movement',
      companyId:input.companyId,
      storeId:input.storeId,
      vehicleId:input.item.vehicleId,
      plate:cleanPlate(input.item.plate),
      vehicle:input.item.vehicle||cleanPlate(input.item.plate),
      movement:input.movement,
      ...(input.fromStatus?{fromStatus:input.fromStatus}:{}),
      ...(input.toStatus?{toStatus:input.toStatus}:{}),
      ...(input.fromStoreId?{fromStoreId:input.fromStoreId}:{}),
      ...(input.toStoreId?{toStoreId:input.toStoreId}:{}),
      ...(typeof input.amount==='number'?{amount:input.amount}:typeof input.item.cost==='number'?{amount:Number(input.item.cost)||0}:{}),
      ...(input.reason?{reason:input.reason}:{}),
      at,
      actorEmail:input.actor?.email||'',
      actorName:input.actor?.name||'',
      source:input.source||'system',
    };
    await setDoc(doc(db,LEDGER,id),movement,{merge:false});
    return movement;
  },

  listForVehicle:async(companyId:string,storeId:string,vehicleId:string):Promise<StockMovement[]>=>{
    const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
    return snap.docs
      .map(item=>item.data() as any)
      .filter(item=>item.kind==='stock_movement'&&item.vehicleId===vehicleId)
      .map(item=>item as StockMovement)
      .sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
  },
};
