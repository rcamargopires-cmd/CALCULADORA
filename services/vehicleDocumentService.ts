import { collection, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { User, VehicleDocumentCase, VehicleMaster } from '../types';
import { financeService } from './financeService';
import { dmsAuditService } from './dmsAuditService';

const LEDGER='operational_meta';
const safe=(value:string)=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const now=()=>new Date().toISOString();
const idFor=(vehicleId:string)=>safe(`vehicle_docs_${vehicleId}`);

const fromDocs=(docs:any[])=>docs
  .map(item=>item.data() as any)
  .filter(item=>item.kind==='vehicle_document_case')
  .map(item=>item as VehicleDocumentCase)
  .sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));

export const vehicleDocumentService={
  subscribe:(companyId:string,storeId:string,onItems:(items:VehicleDocumentCase[])=>void,onError?:(error:unknown)=>void)=>onSnapshot(
    query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)),
    snap=>onItems(fromDocs(snap.docs)),
    error=>onError?.(error),
  ),

  list:async(companyId:string,storeId:string):Promise<VehicleDocumentCase[]>=>{
    const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
    return fromDocs(snap.docs);
  },

  ensure:async(master:VehicleMaster,actor?:Pick<User,'email'|'name'>|null):Promise<VehicleDocumentCase>=>{
    const existing=(await vehicleDocumentService.list(master.companyId,master.storeId)).find(item=>item.vehicleId===master.vehicleId);
    if(existing)return existing;
    const stamp=now();
    const item:VehicleDocumentCase={
      id:idFor(master.vehicleId),kind:'vehicle_document_case',
      companyId:master.companyId,storeId:master.storeId,vehicleId:master.vehicleId,
      plate:master.plate,vehicle:master.model,
      atpvStatus:'pending',crlvStatus:'pending',lienStatus:'pending',debtsStatus:'pending',
      finesAmount:0,debtsAmount:0,dispatcherCost:0,
      createdAt:stamp,updatedAt:stamp,updatedBy:actor?.email||'',updatedByName:actor?.name||'',
    };
    await setDoc(doc(db,LEDGER,item.id),item,{merge:false});
    return item;
  },

  save:async(item:VehicleDocumentCase,actor:Pick<User,'email'|'name'>):Promise<VehicleDocumentCase>=>{
    const next:VehicleDocumentCase={
      ...item,
      finesAmount:Math.max(0,Number(item.finesAmount)||0),
      debtsAmount:Math.max(0,Number(item.debtsAmount)||0),
      dispatcherCost:Math.max(0,Number(item.dispatcherCost)||0),
      updatedAt:now(),updatedBy:actor.email,updatedByName:actor.name,
      ...(item.atpvStatus==='completed'&&!item.transferCompletedAt?{transferCompletedAt:now()}:{}),
    };
    if(next.dispatcherCost>0&&next.dispatcherName&&!next.dispatcherFinanceEntryId){
      const entry=await financeService.create({
        entryType:'payable',category:'Documentação',
        description:`Despachante / transferência · ${next.plate}`,
        party:next.dispatcherName,amount:next.dispatcherCost,dueDate:next.transferDueDate||undefined,
        plate:next.plate,vehicle:next.vehicle,vehicleId:next.vehicleId,
        origin:'other',originId:next.id,companyId:next.companyId,storeId:next.storeId,actor,
      });
      next.dispatcherFinanceEntryId=entry.id;
    }
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'document',entityId:next.id,
      vehicleId:next.vehicleId,plate:next.plate,action:'vehicle_documents_updated',
      label:'Dossiê documental do veículo atualizado',
      details:`ATPV=${next.atpvStatus} · CRLV=${next.crlvStatus} · gravame=${next.lienStatus} · débitos=${next.debtsStatus}`,
      amount:next.dispatcherCost+next.finesAmount+next.debtsAmount,actor,
    }).catch(()=>undefined);
    return next;
  },
};
