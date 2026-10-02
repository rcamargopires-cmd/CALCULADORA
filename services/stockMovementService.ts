import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { StockMovement, StockMovementType, User } from '../types';

const LEDGER='operational_meta';
const safe=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const cleanPlate=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);

export const stockMovementService={
  record:async(input:{
    movementType:StockMovementType;
    companyId:string;
    storeId:string;
    vehicleId?:string;
    plate:string;
    vehicle:string;
    fromStatus?:string;
    toStatus?:string;
    fromStoreId?:string;
    toStoreId?:string;
    amount?:number;
    details?:string;
    actor?:Pick<User,'email'|'name'>|null;
  }):Promise<StockMovement>=>{
    const at=new Date().toISOString();
    const id=safe(`stock_move_${input.companyId}_${input.storeId}_${cleanPlate(input.plate)}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
    const movement:StockMovement={
      id,
      kind:'stock_movement',
      movementType:input.movementType,
      vehicleId:input.vehicleId,
      plate:cleanPlate(input.plate),
      vehicle:input.vehicle,
      fromStatus:input.fromStatus,
      toStatus:input.toStatus,
      fromStoreId:input.fromStoreId,
      toStoreId:input.toStoreId,
      amount:typeof input.amount==='number'?input.amount:undefined,
      details:input.details,
      companyId:input.companyId,
      storeId:input.storeId,
      at,
      actorEmail:input.actor?.email||'',
      actorName:input.actor?.name||'',
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
