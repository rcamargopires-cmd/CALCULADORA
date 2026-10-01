import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { OperationalStockItem, User } from '../types';
import { DEFAULT_COMPANY_ID } from './companyService';
import { companyScopeService } from './companyScopeService';
import { storeScopedOperationalService } from './storeScopedOperationalService';

const safeId=(value:string)=>value.replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,120);
const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const asDate=(value:string)=>new Date(value+'T12:00:00');
const diffDays=(from:string,to:string)=>Math.max(0,Math.round((asDate(to).getTime()-asDate(from).getTime())/86400000));
const cleanPlate=(value:string)=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const currentId=(storeId:string)=>`current_${safeId(storeId)}`;
const stockSummaryId=(storeId:string,date:string)=>`stock_summary_${safeId(storeId)}_${safeId(date)}`;

const rollToToday=(item:OperationalStockItem,today:string):OperationalStockItem=>{
  const plate=cleanPlate(item.plate);
  const entryDate=String(item.entryDate||'').slice(0,10);
  const previousDate=String(item.snapshotDate||today).slice(0,10);
  const stockDays=entryDate
    ? diffDays(entryDate,today)
    : Math.max(0,Number(item.stockDays)||0)+diffDays(previousDate,today);
  return {
    ...item,
    id:safeId(`${today}_${plate}`),
    snapshotDate:today,
    plate,
    stockDays,
  };
};

const persist=async(items:OperationalStockItem[],user:User|undefined,storeId:string,companyId:string,action:string)=>{
  const today=localDate();
  const tenant=companyId||DEFAULT_COMPANY_ID;
  const unique=new Map<string,OperationalStockItem>();
  items.forEach(item=>{
    const rolled=rollToToday(item,today);
    if(/^[A-Z0-9]{7}$/.test(rolled.plate))unique.set(rolled.plate,rolled);
  });
  const finalRows=Array.from(unique.values());

  const scoped=await getDocs(query(
    collection(db,'operational_stock'),
    where('companyId','==',tenant),
    where('storeId','==',storeId),
  ));
  const activePlates=new Set(finalRows.map(item=>cleanPlate(item.plate)));

  // Não apagamos documentos do Firestore no cadastro manual. Em perfis de gerente,
  // a regra de delete pode bloquear a operação mesmo quando create/update são válidos.
  // Itens que saíram do snapshot atual são marcados logicamente como "Saída".
  for(const oldDoc of scoped.docs){
    const data=oldDoc.data() as OperationalStockItem;
    if(String(data.snapshotDate||'').slice(0,10)!==today)continue;
    const oldPlate=cleanPlate(data.plate);
    if(oldPlate&&!activePlates.has(oldPlate)){
      await setDoc(oldDoc.ref,{
        status:'Saída',
        updatedAt:new Date().toISOString(),
        companyId:tenant,
        storeId,
      },{merge:true});
    }
  }

  for(const item of finalRows){
    const next:OperationalStockItem={
      ...item,
      id:safeId(`${tenant}_${storeId}_${today}_${item.plate}`),
      snapshotDate:today,
      companyId:tenant,
      storeId,
      updatedAt:new Date().toISOString(),
    };
    await setDoc(doc(db,'operational_stock',next.id),next,{merge:true});
  }

  const stockValue=finalRows.reduce((sum,item)=>sum+(Number(item.cost)||0),0);
  const aged60=finalRows.filter(item=>Number(item.stockDays)>60).length;
  const critical=finalRows.filter(item=>Number(item.stockDays)>90);
  const critical90Value=critical.reduce((sum,item)=>sum+(Number(item.cost)||0),0);

  await setDoc(doc(db,'operational_meta',stockSummaryId(storeId,today)),{
    referenceDate:today,companyId:tenant,storeId,stockCount:finalRows.length,stockValue,aged60,
    critical90:critical.length,critical90Value,updatedAt:serverTimestamp(),
  },{merge:true});
  await setDoc(doc(db,'operational_meta',currentId(storeId)),{
    companyId:tenant,storeId,latestStockDate:today,stockRows:finalRows.length,updatedAt:serverTimestamp(),
  },{merge:true});
  try{
    await addDoc(collection(db,'operational_imports'),{
      type:'stock',companyId:tenant,storeId,referenceDate:today,rows:finalRows.length,
      fileName:`Cadastro manual · ${action}`,importedBy:user?.email||'',importedAt:serverTimestamp(),
    });
  }catch(error){
    // O log de auditoria não pode impedir a atualização principal do estoque.
    console.warn('Manual stock audit log failed',error);
  }
  return finalRows;
};

export const manualStockService={
  getCurrent:async(storeId:string,companyId=companyScopeService.get())=>{
    const tenant=companyId||DEFAULT_COMPANY_ID;
    const rows=await storeScopedOperationalService.getLatestStock(storeId,tenant);
    const today=localDate();
    return rows.map(item=>rollToToday(item,today)).sort((a,b)=>Number(b.stockDays)-Number(a.stockDays));
  },

  save:async(
    item:OperationalStockItem,
    user:User|undefined,
    storeId:string,
    companyId=companyScopeService.get(),
    originalPlate?:string,
    currentRows?:OperationalStockItem[],
  )=>{
    const tenant=companyId||DEFAULT_COMPANY_ID;
    const current=Array.isArray(currentRows)
      ? currentRows.map(row=>rollToToday(row,localDate()))
      : await manualStockService.getCurrent(storeId,tenant);
    const plate=cleanPlate(item.plate);
    if(!/^[A-Z0-9]{7}$/.test(plate))throw new Error('Informe uma placa válida com 7 caracteres.');
    const original=cleanPlate(originalPlate||plate);
    if(current.some(row=>row.plate===plate&&row.plate!==original))throw new Error('Já existe outro veículo com esta placa no estoque.');
    const next=current.filter(row=>row.plate!==original);
    next.push({...item,plate,source:item.source||'manual'});
    return persist(next,user,storeId,tenant,originalPlate?'veículo editado':'veículo incluído');
  },

  remove:async(
    plate:string,
    user:User|undefined,
    storeId:string,
    companyId=companyScopeService.get(),
  )=>{
    const tenant=companyId||DEFAULT_COMPANY_ID;
    const target=cleanPlate(plate);
    const current=await manualStockService.getCurrent(storeId,tenant);
    if(!current.some(row=>row.plate===target))throw new Error('Veículo não encontrado no estoque atual.');
    return persist(current.filter(row=>row.plate!==target),user,storeId,tenant,`saída ${target}`);
  },
};
