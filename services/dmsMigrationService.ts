import { collection, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { FinanceEntry, PrepOrder, ShowroomPassage, User, VehicleMaster } from '../types';
import { currentStockService } from './currentStockService';
import { dmsVehicleService } from './dmsVehicleService';
import { dmsCustomerService } from './dmsCustomerService';
import { dmsSupplierService } from './dmsSupplierService';
import { dmsAuditService } from './dmsAuditService';

const cleanPlate=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const norm=(value:unknown)=>String(value??'').trim().toLocaleLowerCase('pt-BR');
const LEDGER='operational_meta';

export type DmsMigrationResult={
  stockLinked:number;
  prepLinked:number;
  prepSuppliersLinked:number;
  financeLinked:number;
  financeSuppliersLinked:number;
  historyLinked:number;
  customersLinked:number;
  proposalsLinked:number;
  duplicateMastersArchived:number;
  duplicateDocumentsArchived:number;
  skippedAmbiguous:number;
};

export const dmsMigrationService={
  runSafeMigration:async(companyId:string,storeId:string,actor:Pick<User,'email'|'name'>):Promise<DmsMigrationResult>=>{
    const result:DmsMigrationResult={
      stockLinked:0,prepLinked:0,prepSuppliersLinked:0,financeLinked:0,financeSuppliersLinked:0,
      historyLinked:0,customersLinked:0,proposalsLinked:0,duplicateMastersArchived:0,duplicateDocumentsArchived:0,skippedAmbiguous:0,
    };

    const stock=await currentStockService.getCurrent(companyId,storeId);
    const masters=await dmsVehicleService.list(companyId,storeId);
    const stockByPlate=new Map(stock.map(item=>[cleanPlate(item.plate),item]));
    const grouped=new Map<string,VehicleMaster[]>();
    masters.filter(item=>item.stage!=='exited').forEach(item=>{
      const plate=cleanPlate(item.plate); if(!plate)return;
      const list=grouped.get(plate)||[];list.push(item);grouped.set(plate,list);
    });

    const canonicalByPlate=new Map<string,VehicleMaster>();
    const alias=new Map<string,string>();
    for(const [plate,group] of grouped){
      const stockVehicleId=stockByPlate.get(plate)?.vehicleId;
      const canonical=(stockVehicleId?group.find(item=>item.vehicleId===stockVehicleId):undefined)
        || [...group].sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')))[0];
      if(!canonical)continue;
      canonicalByPlate.set(plate,canonical);
      for(const duplicate of group){
        if(duplicate.vehicleId===canonical.vehicleId)continue;
        alias.set(duplicate.vehicleId,canonical.vehicleId);
        await setDoc(doc(db,LEDGER,duplicate.id),{
          stage:'exited',
          duplicateOf:canonical.vehicleId,
          updatedAt:new Date().toISOString(),
        },{merge:true});
        result.duplicateMastersArchived++;
      }
    }

    // Regrava estoque atual com o ID canônico quando necessário.
    for(const item of stock){
      const plate=cleanPlate(item.plate);
      const master=canonicalByPlate.get(plate);
      if(!master)continue;
      const desired=alias.get(item.vehicleId||'')||item.vehicleId||master.vehicleId;
      if(desired!==item.vehicleId){
        await setDoc(doc(db,'operational_stock',item.id),{vehicleId:desired,updatedAt:new Date().toISOString()},{merge:true});
        result.stockLinked++;
      }
    }

    const prepSnap=await getDocs(query(collection(db,'prep_orders'),where('companyId','==',companyId),where('storeId','==',storeId)));
    for(const snap of prepSnap.docs){
      const order=snap.data() as PrepOrder;
      const plate=cleanPlate(order.plate);
      const master=canonicalByPlate.get(plate);
      const nextVehicleId=alias.get(order.vehicleId||'')||order.vehicleId||master?.vehicleId;
      const services=[...(order.services||[])];
      let changed=false;
      for(let i=0;i<services.length;i++){
        const service=services[i];
        if(service.provider&&!service.supplierId){
          const supplier=await dmsSupplierService.ensure({companyId,storeId,name:service.provider,actor});
          services[i]={...service,supplierId:supplier.supplierId};
          result.prepSuppliersLinked++;changed=true;
        }
      }
      if(nextVehicleId&&nextVehicleId!==order.vehicleId){changed=true;result.prepLinked++;}
      if(changed){
        await setDoc(doc(db,'prep_orders',snap.id),{
          ...(nextVehicleId?{vehicleId:nextVehicleId}:{}),
          services,
          updatedAt:new Date().toISOString(),
        },{merge:true});
      }
    }

    const ledgerSnap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
    for(const snap of ledgerSnap.docs){
      const data:any=snap.data();
      if(!['finance_entry','vehicle_history','stock_movement'].includes(String(data.kind||'')))continue;
      const plate=cleanPlate(data.plate);
      const master=canonicalByPlate.get(plate);
      const nextVehicleId=alias.get(String(data.vehicleId||''))||data.vehicleId||master?.vehicleId;
      const patch:any={};
      if(nextVehicleId&&nextVehicleId!==data.vehicleId){
        patch.vehicleId=nextVehicleId;
        if(data.kind==='finance_entry')result.financeLinked++;
        else if(data.kind==='vehicle_history')result.historyLinked++;
      }
      if(data.kind==='finance_entry'&&data.entryType==='payable'&&data.party&&!data.partyId&&['prep','purchase'].includes(String(data.origin||''))){
        const supplier=await dmsSupplierService.ensure({companyId,storeId,name:String(data.party),actor});
        patch.partyId=supplier.supplierId;
        result.financeSuppliersLinked++;
      }
      if(Object.keys(patch).length)await setDoc(doc(db,LEDGER,snap.id),{...patch,updatedAt:new Date().toISOString()},{merge:true});
    }

    const documentGroups=new Map<string,any[]>();
    for(const snap of ledgerSnap.docs){
      const data:any=snap.data();
      if(data.kind!=='vehicle_document_case')continue;
      const canonicalVehicleId=alias.get(String(data.vehicleId||''))||String(data.vehicleId||'')||canonicalByPlate.get(cleanPlate(data.plate))?.vehicleId||'';
      if(!canonicalVehicleId)continue;
      const group=documentGroups.get(canonicalVehicleId)||[];
      group.push({snap,data,canonicalVehicleId});
      documentGroups.set(canonicalVehicleId,group);
    }
    for(const [canonicalVehicleId,group] of documentGroups){
      const sorted=[...group].sort((a,b)=>String(b.data.updatedAt||b.data.createdAt||'').localeCompare(String(a.data.updatedAt||a.data.createdAt||'')));
      const canonical=sorted.find(item=>item.snap.id===`vehicle_docs_${canonicalVehicleId}`)||sorted[0];
      if(canonical&&canonical.data.vehicleId!==canonicalVehicleId){
        await setDoc(doc(db,LEDGER,canonical.snap.id),{vehicleId:canonicalVehicleId,updatedAt:new Date().toISOString()},{merge:true});
      }
      for(const duplicate of sorted){
        if(!canonical||duplicate.snap.id===canonical.snap.id)continue;
        await setDoc(doc(db,LEDGER,duplicate.snap.id),{
          kind:'vehicle_document_case_archived',
          duplicateOf:canonical.snap.id,
          canonicalVehicleId,
          archivedAt:new Date().toISOString(),
          archivedBy:actor.email,
          archivedByName:actor.name,
          updatedAt:new Date().toISOString(),
        },{merge:true});
        result.duplicateDocumentsArchived++;
      }
    }

    const passagesSnap=await getDocs(query(collection(db,'showroom_passages'),where('companyId','==',companyId),where('storeId','==',storeId)));
    for(const snap of passagesSnap.docs){
      const passage=snap.data() as ShowroomPassage;
      const patch:any={};
      if(!passage.customerId&&passage.customerName){
        const customer=await dmsCustomerService.ensure({
          companyId,storeId,name:passage.customerName,phone:passage.phone,email:passage.customerEmail,actor,
        });
        patch.customerId=customer.customerId;result.customersLinked++;
      }
      if(Array.isArray(passage.crmProposals)&&passage.crmProposals.length){
        let changed=false;
        const proposals=passage.crmProposals.map(proposal=>{
          if(proposal.vehicleId)return proposal;
          const master=canonicalByPlate.get(cleanPlate(proposal.plate));
          if(!master)return proposal;
          changed=true;result.proposalsLinked++;
          return{...proposal,vehicleId:master.vehicleId};
        });
        if(changed)patch.crmProposals=proposals;
      }
      if(Object.keys(patch).length)await updateDoc(doc(db,'showroom_passages',snap.id),patch);
    }

    await dmsAuditService.record({
      companyId,storeId,entityType:'system',entityId:`migration_${storeId}`,
      action:'dms_safe_migration',label:'Migração segura de vínculos mestres executada',
      details:Object.entries(result).map(([key,value])=>`${key}=${value}`).join(' · '),actor,
    }).catch(()=>undefined);

    return result;
  },
};
