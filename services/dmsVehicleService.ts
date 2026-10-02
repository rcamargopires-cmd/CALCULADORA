import { collection, doc, getDocs, query, runTransaction, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { DmsVehicleStage, OperationalStockItem, User, VehicleMaster } from '../types';
import { dmsAuditService } from './dmsAuditService';

const LEDGER='operational_meta';
const safe=(value:string)=>String(value||'')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-zA-Z0-9_-]/g,'-')
  .replace(/-+/g,'-')
  .slice(0,180);
const cleanPlate=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const now=()=>new Date().toISOString();
const masterDocId=(vehicleId:string)=>safe(`vehicle_master_${vehicleId}`);
const plateIndexId=(companyId:string,storeId:string,plate:string)=>safe(`vehicle_plate_index_${companyId}_${storeId}_${cleanPlate(plate)}`);
const claimVehicleId=async(companyId:string,storeId:string,plate:string,preferredVehicleId:string)=>{
  const indexRef=doc(db,LEDGER,plateIndexId(companyId,storeId,plate));
  return runTransaction(db,async tx=>{
    const snap=await tx.get(indexRef);
    if(snap.exists()){
      const current=String((snap.data() as any)?.vehicleId||'').trim();
      if(current)return current;
    }
    tx.set(indexRef,{
      id:plateIndexId(companyId,storeId,plate),
      kind:'vehicle_plate_index',
      companyId,
      storeId,
      plate:cleanPlate(plate),
      vehicleId:preferredVehicleId,
      updatedAt:now(),
    },{merge:true});
    return preferredVehicleId;
  });
};

const stageFromStock=(item:OperationalStockItem):DmsVehicleStage=>{
  const status=String(item.status||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .trim();
  if(status==='saida')return'exited';
  if(status.includes('reserv'))return'reserved';
  if(status.includes('prepar'))return'preparation';
  if(status.includes('vend'))return'sold';
  return'available';
};

const newVehicleId=(companyId:string)=>safe(`veh_${companyId}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`);

const readMasters=async(companyId:string,storeId:string):Promise<VehicleMaster[]>=>{
  const snap=await getDocs(query(
    collection(db,LEDGER),
    where('companyId','==',companyId),
    where('storeId','==',storeId),
  ));
  return snap.docs
    .map(item=>item.data() as any)
    .filter(item=>item.kind==='vehicle_master')
    .map(item=>item as VehicleMaster);
};

const mergeMaster=(base:VehicleMaster|undefined,item:OperationalStockItem,companyId:string,storeId:string,vehicleId:string):VehicleMaster=>{
  const stamp=now();
  return{
    id:masterDocId(vehicleId),
    kind:'vehicle_master',
    vehicleId,
    companyId,
    storeId,
    plate:cleanPlate(item.plate),
    brand:item.brand||base?.brand||'',
    model:item.vehicle||base?.model||cleanPlate(item.plate),
    year:item.year||base?.year||'',
    km:Number(item.km??base?.km??0)||0,
    stage:stageFromStock(item),
    purchaseCost:Number(item.purchaseCost??base?.purchaseCost??item.cost??0)||0,
    prepCost:Number(item.prepCost??base?.prepCost??0)||0,
    currentCost:Number(item.cost??base?.currentCost??0)||0,
    fipe:Number(item.fipe??base?.fipe??0)||0,
    askingPrice:Number(item.askingPrice??base?.askingPrice??0)||0,
    entryDate:item.entryDate||base?.entryDate||'',
    source:item.source==='manual'?'manual':(base?.source||'import'),
    createdAt:base?.createdAt||stamp,
    updatedAt:stamp,
  };
};

export const dmsVehicleService={
  list:readMasters,

  findByPlate:async(companyId:string,storeId:string,plate:string)=>{
    const target=cleanPlate(plate);
    const masters=await readMasters(companyId,storeId);
    return masters.find(item=>cleanPlate(item.plate)===target)||null;
  },

  ensureManyFromStock:async(
    items:OperationalStockItem[],
    companyId:string,
    storeId:string,
    actor?:Pick<User,'email'|'name'>|null,
  ):Promise<OperationalStockItem[]>=>{
    if(!items.length)return[];
    const masters=await readMasters(companyId,storeId);
    const byId=new Map(masters.map(item=>[item.vehicleId,item]));
    const byPlate=new Map(masters.filter(item=>item.plate).map(item=>[cleanPlate(item.plate),item]));
    const enriched:OperationalStockItem[]=[];

    for(const item of items){
      const plate=cleanPlate(item.plate);
      let master=(item.vehicleId&&byId.get(item.vehicleId))||byPlate.get(plate);
      const preferredVehicleId=master?.vehicleId||item.vehicleId||newVehicleId(companyId);
      const vehicleId=await claimVehicleId(companyId,storeId,plate,preferredVehicleId);
      master=byId.get(vehicleId)||master;
      const nextMaster=mergeMaster(master,item,companyId,storeId,vehicleId);
      await setDoc(doc(db,LEDGER,nextMaster.id),nextMaster,{merge:true});
      if(!master){
        await dmsAuditService.record({
          companyId,storeId,entityType:'vehicle',entityId:vehicleId,vehicleId,plate,
          action:'vehicle_master_created',label:'Veículo incluído no cadastro mestre do DMS',
          actor,
        }).catch(()=>undefined);
      }
      master=nextMaster;
      byId.set(vehicleId,nextMaster);
      byPlate.set(plate,nextMaster);
      enriched.push({...item,vehicleId});
    }
    return enriched;
  },

  ensureFromPurchase:async(input:{
    companyId:string;
    storeId:string;
    plate:string;
    vehicle:string;
    brand?:string;
    year?:string;
    km?:number;
    purchaseCost:number;
    source?:'purchase'|'trade_in'|'consignment';
    actor?:Pick<User,'email'|'name'>|null;
  }):Promise<VehicleMaster>=>{
    const plate=cleanPlate(input.plate);
    const masters=await readMasters(input.companyId,input.storeId);
    const existing=masters
      .filter(item=>item.stage!=='exited'&&cleanPlate(item.plate)===plate)
      .sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')))[0];
    const vehicleId=existing?.vehicleId||newVehicleId(input.companyId);
    const stamp=now();
    const master:VehicleMaster={
      id:masterDocId(vehicleId),
      kind:'vehicle_master',
      vehicleId,
      companyId:input.companyId,
      storeId:input.storeId,
      plate,
      brand:input.brand||existing?.brand||'',
      model:input.vehicle||existing?.model||plate,
      year:input.year||existing?.year||'',
      km:Number(input.km??existing?.km??0)||0,
      stage:'purchased',
      purchaseCost:Number(input.purchaseCost)||0,
      prepCost:Number(existing?.prepCost)||0,
      currentCost:(Number(input.purchaseCost)||0)+(Number(existing?.prepCost)||0),
      fipe:Number(existing?.fipe)||0,
      askingPrice:Number(existing?.askingPrice)||0,
      entryDate:existing?.entryDate||'',
      source:input.source||'purchase',
      createdAt:existing?.createdAt||stamp,
      updatedAt:stamp,
    };
    await setDoc(doc(db,LEDGER,master.id),master,{merge:true});
    if(!existing){
      await dmsAuditService.record({
        companyId:input.companyId,storeId:input.storeId,entityType:'vehicle',entityId:vehicleId,
        vehicleId,plate,action:'vehicle_purchase_master_created',
        label:'Veículo criado no cadastro mestre a partir da compra',
        amount:Number(input.purchaseCost)||0,actor:input.actor,
      }).catch(()=>undefined);
    }
    return master;
  },

  syncFromStock:async(
    item:OperationalStockItem,
    companyId:string,
    storeId:string,
    actor?:Pick<User,'email'|'name'>|null,
  )=>{
    const [enriched]=await dmsVehicleService.ensureManyFromStock([item],companyId,storeId,actor);
    return enriched;
  },

  updateStage:async(
    vehicleId:string,
    stage:DmsVehicleStage,
    companyId:string,
    storeId:string,
    actor?:Pick<User,'email'|'name'>|null,
    details='',
  )=>{
    const masters=await readMasters(companyId,storeId);
    const current=masters.find(item=>item.vehicleId===vehicleId);
    if(!current)return null;
    const next={...current,stage,updatedAt:now()};
    await setDoc(doc(db,LEDGER,current.id),next,{merge:true});
    await dmsAuditService.record({
      companyId,storeId,entityType:'vehicle',entityId:vehicleId,vehicleId,plate:current.plate,
      action:'vehicle_stage_changed',label:`Etapa do veículo alterada para ${stage}`,details,actor,
    }).catch(()=>undefined);
    return next;
  },
};
