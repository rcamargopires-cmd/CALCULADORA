import { collection, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { AfterSalesCase, AfterSalesCaseStatus, AfterSalesCaseType, SalesOrder, User } from '../types';
import { dmsSupplierService } from './dmsSupplierService';
import { financeService } from './financeService';
import { dmsAuditService } from './dmsAuditService';

const LEDGER='operational_meta';
const safe=(value:string)=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const now=()=>new Date().toISOString();
const cleanPlate=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);

const fromDocs=(docs:any[])=>docs
  .map(item=>item.data() as any)
  .filter(item=>item.kind==='after_sales_case')
  .map(item=>item as AfterSalesCase)
  .sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));

export const afterSalesService={
  subscribe:(companyId:string,storeId:string,onItems:(items:AfterSalesCase[])=>void,onError?:(error:unknown)=>void)=>onSnapshot(
    query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)),
    snap=>onItems(fromDocs(snap.docs)),
    error=>onError?.(error),
  ),

  list:async(companyId:string,storeId:string):Promise<AfterSalesCase[]>=>{
    const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
    return fromDocs(snap.docs);
  },

  createFromSale:async(input:{
    sale:SalesOrder;type:AfterSalesCaseType;title:string;description:string;actor:Pick<User,'email'|'name'>;
  }):Promise<AfterSalesCase>=>{
    const stamp=now();
    const id=safe(`after_sales_${input.sale.companyId}_${input.sale.storeId}_${input.sale.salesOrderId}_${Date.now()}`);
    const item:AfterSalesCase={
      id,kind:'after_sales_case',companyId:input.sale.companyId,storeId:input.sale.storeId,
      salesOrderId:input.sale.salesOrderId,customerId:input.sale.customerId,
      customerName:input.sale.customerName,customerPhone:input.sale.customerPhone,
      vehicleId:input.sale.vehicleId,plate:cleanPlate(input.sale.plate),vehicle:input.sale.vehicle,
      type:input.type,status:'open',title:String(input.title||'').trim()||'Ocorrência pós-venda',
      description:String(input.description||'').trim(),cost:0,
      openedAt:stamp,openedBy:input.actor.email,openedByName:input.actor.name,updatedAt:stamp,
    };
    await setDoc(doc(db,LEDGER,id),item,{merge:false});
    await dmsAuditService.record({
      companyId:item.companyId,storeId:item.storeId,entityType:'sale',entityId:item.salesOrderId||item.id,
      vehicleId:item.vehicleId,plate:item.plate,action:'after_sales_opened',
      label:`Pós-venda aberto: ${item.title}`,details:item.description,actor:input.actor,
    }).catch(()=>undefined);
    return item;
  },

  save:async(item:AfterSalesCase,actor:Pick<User,'email'|'name'>):Promise<AfterSalesCase>=>{
    let next:AfterSalesCase={...item,cost:Math.max(0,Number(item.cost)||0),updatedAt:now()};
    if(next.supplierName&&next.cost>0&&!next.financeEntryId){
      const supplier=await dmsSupplierService.ensure({
        companyId:next.companyId,storeId:next.storeId,name:next.supplierName,actor,
      });
      const finance=await financeService.create({
        entryType:'payable',category:'Pós-venda / garantia',
        description:`${next.title} · ${next.plate}`,party:next.supplierName,partyId:supplier.supplierId,
        amount:next.cost,plate:next.plate,vehicle:next.vehicle,vehicleId:next.vehicleId,
        origin:'other',originId:next.id,companyId:next.companyId,storeId:next.storeId,actor,
      } as any);
      next={...next,supplierId:supplier.supplierId,financeEntryId:finance.id};
    }
    if((next.status==='resolved'||next.status==='closed')&&!next.resolvedAt)next.resolvedAt=now();
    if(next.status==='closed'&&!next.closedAt)next.closedAt=now();
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'sale',entityId:next.salesOrderId||next.id,
      vehicleId:next.vehicleId,plate:next.plate,action:'after_sales_updated',
      label:`Pós-venda atualizado: ${next.title}`,details:next.status,amount:next.cost,actor,
    }).catch(()=>undefined);
    return next;
  },
};
