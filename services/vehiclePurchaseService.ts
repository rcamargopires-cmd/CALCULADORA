import { collection, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { OperationalStockItem, User, VehiclePurchase, VehiclePurchaseDocuments, VehiclePurchaseOrigin } from '../types';
import type { EvaluationQueueRequest } from './evaluationQueueService';
import { dmsVehicleService } from './dmsVehicleService';
import { dmsSupplierService } from './dmsSupplierService';
import { financeService } from './financeService';
import { currentStockService } from './currentStockService';
import { prepTrackService } from './prepTrackService';
import { dmsAuditService } from './dmsAuditService';

const LEDGER='operational_meta';
const cleanPlate=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const safe=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const now=()=>new Date().toISOString();
const today=()=>new Date().toISOString().slice(0,10);
const emptyDocuments=():VehiclePurchaseDocuments=>({
  atpv:false,crlv:false,ownerDocument:false,debtsChecked:false,lienChecked:false,spareKey:false,manual:false,
});
const normalize=(item:VehiclePurchase):VehiclePurchase=>{
  const purchasePrice=Math.max(0,Number(item.purchasePrice)||0);
  const payoffAmount=Math.max(0,Number(item.payoffAmount)||0);
  const debtsAmount=Math.max(0,Number(item.debtsAmount)||0);
  const acquisitionCosts=Math.max(0,Number(item.acquisitionCosts)||0);
  return{
    ...item,
    plate:cleanPlate(item.plate),
    purchasePrice,payoffAmount,debtsAmount,acquisitionCosts,
    totalAcquisitionCost:purchasePrice+debtsAmount+acquisitionCosts,
    documents:{...emptyDocuments(),...(item.documents||{})},
    updatedAt:now(),
  };
};

const fromDocs=(docs:any[])=>docs
  .map(item=>item.data() as any)
  .filter(item=>item.kind==='vehicle_purchase')
  .map(item=>normalize(item as VehiclePurchase))
  .sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));

export const vehiclePurchaseService={
  subscribe:(companyId:string,storeId:string,onItems:(items:VehiclePurchase[])=>void,onError?:(error:unknown)=>void)=>onSnapshot(
    query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)),
    snap=>onItems(fromDocs(snap.docs)),
    error=>onError?.(error),
  ),

  list:async(companyId:string,storeId:string):Promise<VehiclePurchase[]>=>{
    const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
    return fromDocs(snap.docs);
  },

  listCompletedEvaluations:async(companyId:string,storeId:string):Promise<EvaluationQueueRequest[]>=>{
    const snap=await getDocs(query(collection(db,'evaluation_requests'),where('companyId','==',companyId),where('storeId','==',storeId)));
    return snap.docs
      .map(item=>({id:item.id,...item.data()} as EvaluationQueueRequest))
      .filter(item=>item.status==='completed')
      .sort((a,b)=>String((b.updatedAt as any)?.seconds||b.updatedAt||'').localeCompare(String((a.updatedAt as any)?.seconds||a.updatedAt||'')));
  },

  createFromEvaluation:async(request:EvaluationQueueRequest,actor:Pick<User,'email'|'name'>):Promise<VehiclePurchase>=>{
    const existing=(await vehiclePurchaseService.list(request.companyId,request.storeId))
      .find(item=>item.evaluationRequestId===request.id&&item.status!=='cancelled');
    if(existing)return existing;

    const stamp=now();
    const purchaseId=safe(`purchase_${request.companyId}_${request.storeId}_${cleanPlate(request.plate)}_${Date.now()}`);
    const master=await dmsVehicleService.ensureFromPurchase({
      companyId:request.companyId,storeId:request.storeId,plate:request.plate,
      vehicle:request.vehicle||request.plate,brand:request.brand,year:request.year,
      km:Number(request.km)||0,purchaseCost:Number(request.recommendedBuy)||0,source:'purchase',actor,
    });

    const purchase=normalize({
      id:purchaseId,
      kind:'vehicle_purchase',
      purchaseId,
      companyId:request.companyId,
      storeId:request.storeId,
      evaluationRequestId:request.id,
      vehicleId:master.vehicleId,
      plate:request.plate,
      vehicle:request.vehicle||request.plate,
      brand:request.brand||'',
      year:request.year||'',
      km:Number(request.km)||0,
      fipe:0,
      origin:'purchase',
      status:'draft',
      ownerName:'',
      purchasePrice:Number(request.recommendedBuy)||0,
      payoffAmount:0,
      debtsAmount:0,
      acquisitionCosts:0,
      totalAcquisitionCost:Number(request.recommendedBuy)||0,
      documents:{
        ...emptyDocuments(),
        spareKey:request.hasSpareKey==='yes',
        manual:request.hasManual==='yes',
      },
      notes:request.notes||'',
      createdAt:stamp,
      updatedAt:stamp,
      createdBy:actor.email,
      createdByName:actor.name,
    });
    await setDoc(doc(db,LEDGER,purchaseId),purchase,{merge:false});
    await dmsAuditService.record({
      companyId:purchase.companyId,storeId:purchase.storeId,entityType:'vehicle',
      entityId:master.vehicleId,vehicleId:master.vehicleId,plate:purchase.plate,
      action:'purchase_started',label:'Processo de compra iniciado a partir da avaliação',
      amount:purchase.purchasePrice,actor,
    }).catch(()=>undefined);
    return purchase;
  },

  createManual:async(input:{
    companyId:string;storeId:string;plate:string;vehicle:string;brand?:string;year?:string;km?:number;
    origin?:VehiclePurchaseOrigin;purchasePrice?:number;actor:Pick<User,'email'|'name'>;
  }):Promise<VehiclePurchase>=>{
    const stamp=now();
    const master=await dmsVehicleService.ensureFromPurchase({
      companyId:input.companyId,storeId:input.storeId,plate:input.plate,vehicle:input.vehicle,
      brand:input.brand,year:input.year,km:input.km,purchaseCost:Number(input.purchasePrice)||0,
      source:input.origin==='trade_in'?'trade_in':input.origin==='consignment'?'consignment':'purchase',actor:input.actor,
    });
    const purchaseId=safe(`purchase_${input.companyId}_${input.storeId}_${cleanPlate(input.plate)}_${Date.now()}`);
    const purchase=normalize({
      id:purchaseId,kind:'vehicle_purchase',purchaseId,companyId:input.companyId,storeId:input.storeId,
      vehicleId:master.vehicleId,plate:input.plate,vehicle:input.vehicle,brand:input.brand||'',year:input.year||'',
      km:Number(input.km)||0,origin:input.origin||'purchase',status:'draft',ownerName:'',
      purchasePrice:Number(input.purchasePrice)||0,payoffAmount:0,debtsAmount:0,acquisitionCosts:0,totalAcquisitionCost:Number(input.purchasePrice)||0,
      documents:emptyDocuments(),createdAt:stamp,updatedAt:stamp,createdBy:input.actor.email,createdByName:input.actor.name,
    });
    await setDoc(doc(db,LEDGER,purchaseId),purchase,{merge:false});
    return purchase;
  },

  save:async(purchase:VehiclePurchase):Promise<VehiclePurchase>=>{
    if(['entered','cancelled'].includes(purchase.status))throw new Error('Este processo não pode mais ser alterado.');
    const next=normalize(purchase);
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    return next;
  },

  approve:async(purchase:VehiclePurchase,actor:Pick<User,'email'|'name'>):Promise<VehiclePurchase>=>{
    const current=normalize(purchase);
    if(!current.ownerName.trim())throw new Error('Informe o proprietário/vendedor do veículo.');
    if(current.purchasePrice<=0)throw new Error('Informe o valor de compra.');

    const supplier=await dmsSupplierService.ensure({
      companyId:current.companyId,storeId:current.storeId,name:current.ownerName,
      document:current.ownerDocument,phone:current.ownerPhone,email:current.ownerEmail,pixKey:current.ownerPix,actor,
    });
    const master=await dmsVehicleService.ensureFromPurchase({
      companyId:current.companyId,storeId:current.storeId,plate:current.plate,vehicle:current.vehicle,
      brand:current.brand,year:current.year,km:current.km,purchaseCost:current.totalAcquisitionCost,
      source:current.origin==='trade_in'?'trade_in':current.origin==='consignment'?'consignment':'purchase',actor,
    });

    const payableIds=[...(current.payableIds||[])];
    if(!payableIds.length){
      const ownerBalance=Math.max(0,current.purchasePrice-current.payoffAmount);
      if(ownerBalance>0){
        const entry=await financeService.create({
          entryType:'payable',category:'Compra de veículo',description:`Compra ${current.plate} · saldo ao proprietário`,
          party:current.ownerName,amount:ownerBalance,dueDate:current.paymentDueDate||undefined,
          plate:current.plate,vehicle:current.vehicle,vehicleId:master.vehicleId,origin:'purchase',originId:current.purchaseId,
          companyId:current.companyId,storeId:current.storeId,actor,
        });
        await setDoc(doc(db,LEDGER,entry.id),{partyId:supplier.supplierId},{merge:true});
        payableIds.push(entry.id);
      }
      if(current.payoffAmount>0){
        const entry=await financeService.create({
          entryType:'payable',category:'Quitação',description:`Quitação de financiamento · ${current.plate}`,
          party:`Quitação / banco · ${current.ownerName}`,amount:current.payoffAmount,dueDate:current.paymentDueDate||undefined,
          plate:current.plate,vehicle:current.vehicle,vehicleId:master.vehicleId,origin:'purchase',originId:current.purchaseId,
          companyId:current.companyId,storeId:current.storeId,actor,
        });
        payableIds.push(entry.id);
      }
      if(current.debtsAmount>0){
        const entry=await financeService.create({
          entryType:'payable',category:'Débitos do veículo',description:`Débitos, multas e pendências · ${current.plate}`,
          party:'Débitos do veículo',amount:current.debtsAmount,dueDate:current.paymentDueDate||undefined,
          plate:current.plate,vehicle:current.vehicle,vehicleId:master.vehicleId,origin:'purchase',originId:current.purchaseId,
          companyId:current.companyId,storeId:current.storeId,actor,
        });
        payableIds.push(entry.id);
      }
      if(current.acquisitionCosts>0){
        const entry=await financeService.create({
          entryType:'payable',category:'Custos de aquisição',description:`Custos de aquisição · ${current.plate}`,
          party:'Custos de aquisição',amount:current.acquisitionCosts,dueDate:current.paymentDueDate||undefined,
          plate:current.plate,vehicle:current.vehicle,vehicleId:master.vehicleId,origin:'purchase',originId:current.purchaseId,
          companyId:current.companyId,storeId:current.storeId,actor,
        });
        payableIds.push(entry.id);
      }
    }

    const stamp=now();
    const next=normalize({
      ...current,
      vehicleId:master.vehicleId,
      supplierId:supplier.supplierId,
      payableId:payableIds[0],
      payableIds,
      status:payableIds.length?'payment_pending':'documents',
      approvedAt:current.approvedAt||stamp,
      approvedBy:actor.email,
      approvedByName:actor.name,
      updatedAt:stamp,
    });
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'vehicle',entityId:master.vehicleId,
      vehicleId:master.vehicleId,plate:next.plate,action:'purchase_approved',
      label:'Compra do veículo aprovada',amount:next.totalAcquisitionCost,
      details:`${next.origin} · ${next.ownerName}`,actor,
    }).catch(()=>undefined);
    return next;
  },

  enterStock:async(purchase:VehiclePurchase,actor:User):Promise<VehiclePurchase>=>{
    const current=normalize(purchase);
    if(current.status==='draft')throw new Error('A compra precisa ser aprovada antes da entrada.');
    if(current.status==='cancelled')throw new Error('Compra cancelada.');
    if(current.status==='entered')return current;

    const source:OperationalStockItem['source']=current.origin==='trade_in'?'trade_in':current.origin==='consignment'?'consignment':'purchase';
    const stockItem:OperationalStockItem={
      id:'',
      vehicleId:current.vehicleId,
      snapshotDate:today(),
      plate:current.plate,
      vehicle:current.vehicle,
      brand:current.brand,
      year:current.year,
      km:current.km,
      stockDays:0,
      purchaseCost:current.totalAcquisitionCost,
      prepCost:0,
      cost:current.totalAcquisitionCost,
      fipe:Number(current.fipe)||0,
      askingPrice:0,
      entryDate:today(),
      source,
      status:'Em preparação',
      location:'ESTOQUE',
      companyId:current.companyId,
      storeId:current.storeId,
    };
    const stock=await currentStockService.upsert(stockItem,current.storeId,current.companyId,actor);
    const saved=stock.find(item=>cleanPlate(item.plate)===cleanPlate(current.plate));
    const order=await prepTrackService.ensureOrder({
      vehicleId:saved?.vehicleId||current.vehicleId,plate:current.plate,vehicle:current.vehicle,
      companyId:current.companyId,storeId:current.storeId,createdBy:actor.email,
    });
    await dmsVehicleService.updateStage(saved?.vehicleId||current.vehicleId||'','preparation',current.companyId,current.storeId,actor,'Compra entrou formalmente no estoque e foi enviada ao PrepTrack.').catch(()=>undefined);

    const stamp=now();
    const next=normalize({...current,vehicleId:saved?.vehicleId||current.vehicleId,status:'entered',enteredAt:stamp,updatedAt:stamp});
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'vehicle',entityId:next.vehicleId||next.purchaseId,
      vehicleId:next.vehicleId,plate:next.plate,action:'purchase_stock_entry',
      label:'Compra concluída e veículo incluído no estoque',amount:next.totalAcquisitionCost,
      details:`PrepTrack: ${order.id}`,actor,
    }).catch(()=>undefined);
    return next;
  },

  cancel:async(purchase:VehiclePurchase,actor:Pick<User,'email'|'name'>):Promise<VehiclePurchase>=>{
    if(purchase.status==='entered')throw new Error('Veículo já entrou no estoque. Use o fluxo de saída/estorno.');
    const next=normalize({...purchase,status:'cancelled'});
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'vehicle',entityId:next.vehicleId||next.purchaseId,
      vehicleId:next.vehicleId,plate:next.plate,action:'purchase_cancelled',label:'Processo de compra cancelado',actor,
    }).catch(()=>undefined);
    return next;
  },
};
