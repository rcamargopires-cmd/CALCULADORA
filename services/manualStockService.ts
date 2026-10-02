import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { OperationalStockItem, PrepOrder, User } from '../types';
import { DEFAULT_COMPANY_ID } from './companyService';
import { companyScopeService } from './companyScopeService';
import { currentStockService } from './currentStockService';
import { dmsAuditService } from './dmsAuditService';

const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const asDate=(value:string)=>new Date(value+'T12:00:00');
const diffDays=(from:string,to:string)=>Math.max(0,Math.round((asDate(to).getTime()-asDate(from).getTime())/86400000));
const cleanPlate=(value:string)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

const rollToToday=(item:OperationalStockItem,today:string):OperationalStockItem=>{
  const plate=cleanPlate(item.plate);
  const entryDate=String(item.entryDate||'').slice(0,10);
  const previousDate=String(item.snapshotDate||today).slice(0,10);
  const stockDays=entryDate
    ? diffDays(entryDate,today)
    : Math.max(0,Number(item.stockDays)||0)+diffDays(previousDate,today);
  return {...item,snapshotDate:today,plate,stockDays};
};

const audit=async(action:string,rows:number,user:User|undefined,storeId:string,companyId:string)=>{
  try{
    await addDoc(collection(db,'operational_imports'),{
      type:'stock',companyId,storeId,referenceDate:localDate(),rows,
      fileName:`Cadastro manual · ${action}`,importedBy:user?.email||'',importedAt:serverTimestamp(),
    });
  }catch(error){console.warn('Manual stock audit log failed',error);}
};

export const manualStockService={
  getCurrent:async(storeId:string,companyId=companyScopeService.get())=>{
    const tenant=companyId||DEFAULT_COMPANY_ID;
    const rows=await currentStockService.getCurrent(tenant,storeId);
    const today=localDate();
    return rows.map(item=>rollToToday(item,today)).sort((a,b)=>Number(b.stockDays)-Number(a.stockDays));
  },

  save:async(
    item:OperationalStockItem,
    user:User|undefined,
    storeId:string,
    companyId=companyScopeService.get(),
    originalPlate?:string,
    _currentRows?:OperationalStockItem[],
  )=>{
    const tenant=companyId||DEFAULT_COMPANY_ID;
    const current=await manualStockService.getCurrent(storeId,tenant);
    const plate=cleanPlate(item.plate);
    if(!/^[A-Z0-9]{7}$/.test(plate))throw new Error('Informe uma placa válida com 7 caracteres.');
    const original=cleanPlate(originalPlate||plate);
    if(current.some(row=>cleanPlate(row.plate)===plate&&cleanPlate(row.plate)!==original))throw new Error('Já existe outro veículo com esta placa no estoque.');

    const previous=current.find(row=>cleanPlate(row.plate)===original);
    const purchaseCost=Number(item.purchaseCost ?? previous?.purchaseCost ?? item.cost ?? 0)||0;
    const prepCost=Number(item.prepCost ?? previous?.prepCost ?? 0)||0;
    const nextItem=rollToToday({
      ...previous,
      ...item,
      plate,
      purchaseCost,
      prepCost,
      cost:purchaseCost+prepCost,
      source:'manual',
      manualActive:true,
      manualExitAt:'',
      status:item.status||previous?.status||'Em preparação',
      companyId:tenant,
      storeId,
    },localDate());

    if(originalPlate&&original&&original!==plate&&current.some(row=>cleanPlate(row.plate)===original)){
      await currentStockService.markOut(original,storeId,tenant,user);
    }
    const next=await currentStockService.upsert(nextItem,storeId,tenant,user);
    const saved=next.find(row=>cleanPlate(row.plate)===plate);
    await audit(originalPlate?'veículo editado':'veículo incluído',next.length,user,storeId,tenant);
    await dmsAuditService.record({
      companyId:tenant,
      storeId,
      entityType:'vehicle',
      entityId:saved?.vehicleId||plate,
      vehicleId:saved?.vehicleId,
      plate,
      action:originalPlate?'stock_manual_updated':'stock_manual_created',
      label:originalPlate?'Cadastro manual do veículo atualizado':'Veículo incluído manualmente no estoque',
      amount:Number(saved?.cost||0),
      actor:user,
    }).catch(()=>undefined);
    return next.map(row=>rollToToday(row,localDate())).sort((a,b)=>Number(b.stockDays)-Number(a.stockDays));
  },

  syncPreparation:async(
    order:PrepOrder,
    user:User|undefined,
    storeId:string,
    companyId=companyScopeService.get(),
    _currentRows?:OperationalStockItem[],
  )=>{
    const tenant=companyId||DEFAULT_COMPANY_ID;
    const current=await manualStockService.getCurrent(storeId,tenant);
    const plate=cleanPlate(order.plate);
    const existing=current.find(row=>cleanPlate(row.plate)===plate);
    if(!existing)return current;

    const previousPrep=Number(existing.prepCost)||0;
    const purchaseCost=Number(existing.purchaseCost)||Math.max(0,(Number(existing.cost)||0)-previousPrep);
    const prepCost=(order.services||[])
      .filter(service=>['approved','in_service','waiting_part','done'].includes(service.status))
      .reduce((sum,service)=>sum+(Number(service.finalCost)||Number(service.estimatedCost)||0),0);

    const status=order.sold||order.status==='delivery'||order.status==='delivered'
      ? 'Reservado'
      : ['ready','showroom'].includes(order.status)
        ? 'Disponível'
        : 'Em preparação';

    const updated=rollToToday({
      ...existing,
      purchaseCost,
      prepCost,
      cost:purchaseCost+prepCost,
      status,
      updatedAt:new Date().toISOString(),
    },localDate());

    const next=await currentStockService.upsert(updated,storeId,tenant);
    return next.map(row=>rollToToday(row,localDate())).sort((a,b)=>Number(b.stockDays)-Number(a.stockDays));
  },

  recoverPlate:async(
    _plate:string,
    _user:User|undefined,
    storeId:string,
    companyId=companyScopeService.get(),
    _currentRows?:OperationalStockItem[],
  ):Promise<OperationalStockItem[]|null>=>{
    // Compatibilidade com telas antigas. Não existe mais "recuperação" separada:
    // todas as telas leem a mesma fonte canônica.
    return manualStockService.getCurrent(storeId,companyId);
  },

  remove:async(
    plate:string,
    user:User|undefined,
    storeId:string,
    companyId=companyScopeService.get(),
  )=>{
    const tenant=companyId||DEFAULT_COMPANY_ID;
    const target=cleanPlate(plate);
    const before=await manualStockService.getCurrent(storeId,tenant);
    const existing=before.find(row=>cleanPlate(row.plate)===target);
    const next=await currentStockService.markOut(target,storeId,tenant,user);
    await audit(`saída ${target}`,next.length,user,storeId,tenant);
    await dmsAuditService.record({
      companyId:tenant,
      storeId,
      entityType:'vehicle',
      entityId:existing?.vehicleId||target,
      vehicleId:existing?.vehicleId,
      plate:target,
      action:'stock_exit',
      label:'Saída do veículo registrada no estoque',
      actor:user,
    }).catch(()=>undefined);
    return next.map(row=>rollToToday(row,localDate())).sort((a,b)=>Number(b.stockDays)-Number(a.stockDays));
  },
};
