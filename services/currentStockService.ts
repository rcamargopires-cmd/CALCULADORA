import { collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { OperationalStockItem, User } from '../types';
import { DEFAULT_COMPANY_ID } from './companyService';
import { DEFAULT_STORE_ID } from './storeService';
import { dmsVehicleService } from './dmsVehicleService';

const COLLECTION='operational_stock';
const cleanPlate=(value:unknown)=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const safeId=(value:string)=>value.replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const normalizedStatus=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const isActive=(item:OperationalStockItem)=>item.manualActive!==false&&normalizedStatus(item.status)!=='saida';
const rowMoment=(item:OperationalStockItem)=>`${String(item.snapshotDate||'').slice(0,10)}|${String(item.updatedAt||'')}`;
const docId=(companyId:string,storeId:string,plate:string)=>`stock_${safeId(companyId)}_${safeId(storeId)}_${safeId(cleanPlate(plate))}`;
const currentMetaId=(storeId:string)=>`current_${safeId(storeId)}`;
const stockSummaryId=(storeId:string,date:string)=>`stock_summary_${safeId(storeId)}_${safeId(date)}`;
const announce=()=>{try{window.dispatchEvent(new Event('dealmaster:operational-data-updated'));}catch{}};

const belongsToStore=(value:{storeId?:string},storeId:string)=>(value.storeId||DEFAULT_STORE_ID)===storeId;
const belongsToCompany=(value:{companyId?:string},companyId:string)=>(value.companyId||DEFAULT_COMPANY_ID)===companyId;

const normalizeItem=(item:OperationalStockItem,companyId:string,storeId:string):OperationalStockItem=>{
  const plate=cleanPlate(item.plate);
  return{
    ...item,
    id:docId(companyId,storeId,plate),
    plate,
    companyId,
    storeId,
    snapshotDate:String(item.snapshotDate||localDate()).slice(0,10),
    currentRecord:true,
    updatedAt:item.updatedAt||new Date().toISOString(),
  };
};

const updateMeta=async(items:OperationalStockItem[],companyId:string,storeId:string)=>{
  const today=localDate();
  const active=items.filter(isActive);
  const stockValue=active.reduce((sum,item)=>sum+(Number(item.cost)||0),0);
  const aged60=active.filter(item=>Number(item.stockDays)>60).length;
  const critical=active.filter(item=>Number(item.stockDays)>90);
  const critical90Value=critical.reduce((sum,item)=>sum+(Number(item.cost)||0),0);
  await setDoc(doc(db,'operational_meta',stockSummaryId(storeId,today)),{
    referenceDate:today,companyId,storeId,stockCount:active.length,stockValue,aged60,
    critical90:critical.length,critical90Value,updatedAt:serverTimestamp(),
  },{merge:true});
  await setDoc(doc(db,'operational_meta',currentMetaId(storeId)),{
    companyId,storeId,latestStockDate:today,stockRows:active.length,stockValue,canonicalStockVersion:4,updatedAt:serverTimestamp(),
  },{merge:true});
};

const readCanonical=async(companyId:string,storeId:string)=>{
  const snap=await getDocs(query(
    collection(db,COLLECTION),
    where('companyId','==',companyId),
    where('storeId','==',storeId),
  ));
  return snap.docs
    .map(item=>item.data() as OperationalStockItem)
    .filter(item=>item.currentRecord===true);
};

const deriveLegacy=async(companyId:string,storeId:string):Promise<OperationalStockItem[]>=>{
  const scoped=await getDocs(query(
    collection(db,'operational_stock'),
    where('companyId','==',companyId),
    where('storeId','==',storeId),
  ));
  let all=scoped.docs.map(item=>item.data() as OperationalStockItem).filter(item=>item.currentRecord!==true);

  if(!all.length&&companyId===DEFAULT_COMPANY_ID&&storeId===DEFAULT_STORE_ID){
    try{
      const legacy=await getDocs(collection(db,'operational_stock'));
      all=legacy.docs
        .map(item=>item.data() as OperationalStockItem)
        .filter(item=>item.currentRecord!==true)
        .filter(item=>belongsToCompany(item,companyId)&&belongsToStore(item,storeId));
    }catch{}
  }
  if(!all.length)return[];

  const latest=all.map(item=>String(item.snapshotDate||'').slice(0,10)).filter(Boolean).sort().at(-1)||'';
  const unique=new Map<string,OperationalStockItem>();

  all
    .filter(item=>String(item.snapshotDate||'').slice(0,10)===latest&&item.source!=='manual'&&normalizedStatus(item.status)!=='saida')
    .sort((a,b)=>rowMoment(a).localeCompare(rowMoment(b)))
    .forEach(item=>{const plate=cleanPlate(item.plate);if(plate)unique.set(plate,item);});

  const manualByPlate=new Map<string,OperationalStockItem[]>();
  all.filter(item=>item.source==='manual').forEach(item=>{
    const plate=cleanPlate(item.plate);if(!plate)return;
    const list=manualByPlate.get(plate)||[];list.push(item);manualByPlate.set(plate,list);
  });
  manualByPlate.forEach((items,plate)=>{
    const ordered=[...items].sort((a,b)=>rowMoment(a).localeCompare(rowMoment(b)));
    const explicitExit=ordered.filter(item=>Boolean(item.manualExitAt)||item.manualActive===false).at(-1);
    const newest=ordered.at(-1);
    if(explicitExit&&newest===explicitExit){unique.delete(plate);return;}
    const lastActive=ordered.filter(item=>!item.manualExitAt&&item.manualActive!==false).at(-1);
    if(!lastActive)return;
    unique.set(plate,{
      ...lastActive,
      status:normalizedStatus(lastActive.status)==='saida'?'Em preparação':(lastActive.status||'Em preparação'),
      source:'manual',
      manualActive:true,
      manualExitAt:'',
    });
  });

  return Array.from(unique.values()).map(item=>normalizeItem(item,companyId,storeId));
};

const seedCanonical=async(items:OperationalStockItem[],companyId:string,storeId:string)=>{
  const enriched=await dmsVehicleService.ensureManyFromStock(items,companyId,storeId);
  for(const item of enriched){
    const next=normalizeItem(item,companyId,storeId);
    await setDoc(doc(db,COLLECTION,next.id),next,{merge:true});
  }
  await updateMeta(enriched,companyId,storeId);
};

const reconcileCanonicalV4=async(companyId:string,storeId:string)=>{
  const meta=await getDoc(doc(db,'operational_meta',currentMetaId(storeId)));
  if(Number(meta.data()?.canonicalStockVersion||0)>=4)return;

  const scoped=await getDocs(query(
    collection(db,'operational_stock'),
    where('companyId','==',companyId),
    where('storeId','==',storeId),
  ));
  const all=scoped.docs.map(item=>item.data() as OperationalStockItem);
  if(!all.length)return;

  const canonical=all.filter(item=>item.currentRecord===true);
  const history=all.filter(item=>item.currentRecord!==true);

  const importedHistory=history.filter(item=>item.source!=='manual');

  // A base importada precisa vir do último arquivo real enviado pela loja.
  // Snapshots criados por cadastro manual/preparação não podem virar uma nova "base".
  let latestImportedDate='';
  try{
    const importSnap=await getDocs(query(
      collection(db,'operational_imports'),
      where('companyId','==',companyId),
      where('storeId','==',storeId),
    ));
    const realImports=importSnap.docs
      .map(item=>item.data() as any)
      .filter(item=>String(item.type||'')==='stock')
      .filter(item=>{
        const name=String(item.fileName||'').toLowerCase();
        return !name.startsWith('cadastro manual') &&
          !name.startsWith('recuperação manual') &&
          !name.startsWith('recuperacao manual');
      })
      .sort((a,b)=>{
        const am=typeof a?.importedAt?.toMillis==='function'?a.importedAt.toMillis():0;
        const bm=typeof b?.importedAt?.toMillis==='function'?b.importedAt.toMillis():0;
        if(am!==bm)return am-bm;
        return String(a?.referenceDate||'').localeCompare(String(b?.referenceDate||''));
      });
    latestImportedDate=String(realImports.at(-1)?.referenceDate||'').slice(0,10);
  }catch(error){
    console.warn('MOTYQ could not resolve last real stock import',error);
  }

  if(!latestImportedDate){
    latestImportedDate=importedHistory
      .map(item=>String(item.snapshotDate||'').slice(0,10))
      .filter(Boolean)
      .sort()
      .at(-1)||'';
  }

  const target=new Map<string,OperationalStockItem>();
  importedHistory
    .filter(item=>String(item.snapshotDate||'').slice(0,10)===latestImportedDate)
    .filter(item=>normalizedStatus(item.status)!=='saida')
    .sort((a,b)=>rowMoment(a).localeCompare(rowMoment(b)))
    .forEach(item=>{
      const plate=cleanPlate(item.plate);
      if(plate)target.set(plate,{...item,source:'import'});
    });

  const canonicalManual=new Map<string,OperationalStockItem>();
  canonical
    .filter(item=>item.source==='manual')
    .sort((a,b)=>rowMoment(a).localeCompare(rowMoment(b)))
    .forEach(item=>{
      const plate=cleanPlate(item.plate);
      if(plate)canonicalManual.set(plate,item);
    });

  const legacyManualByPlate=new Map<string,OperationalStockItem[]>();
  history.filter(item=>item.source==='manual').forEach(item=>{
    const plate=cleanPlate(item.plate);
    if(!plate)return;
    const list=legacyManualByPlate.get(plate)||[];
    list.push(item);
    legacyManualByPlate.set(plate,list);
  });

  const manualPlates=new Set<string>([
    ...Array.from(canonicalManual.keys()),
    ...Array.from(legacyManualByPlate.keys()),
  ]);

  manualPlates.forEach(plate=>{
    const currentManual=canonicalManual.get(plate);
    if(currentManual?.manualExitAt||currentManual?.manualActive===false){
      target.delete(plate);
      return;
    }
    if(currentManual&&isActive(currentManual)){
      target.set(plate,currentManual);
      return;
    }

    const historyRows=[...(legacyManualByPlate.get(plate)||[])]
      .sort((a,b)=>rowMoment(a).localeCompare(rowMoment(b)));
    const newest=historyRows.at(-1);
    if(!newest)return;
    if(newest.manualExitAt){
      target.delete(plate);
      return;
    }
    const candidate=[...historyRows].reverse().find(item=>!item.manualExitAt);
    if(!candidate)return;
    target.set(plate,{
      ...candidate,
      source:'manual',
      manualActive:true,
      manualExitAt:'',
      status:normalizedStatus(candidate.status)==='saida'?'Em preparação':(candidate.status||'Em preparação'),
    });
  });

  const next=Array.from(target.values()).map(item=>normalizeItem(item,companyId,storeId));
  const targetPlates=new Set(next.map(item=>cleanPlate(item.plate)));

  for(const item of canonical){
    const plate=cleanPlate(item.plate);
    if(!plate||targetPlates.has(plate))continue;
    await setDoc(doc(db,COLLECTION,docId(companyId,storeId,plate)),{
      ...item,
      currentRecord:true,
      companyId,
      storeId,
      plate,
      status:'Saída',
      manualActive:false,
      updatedAt:new Date().toISOString(),
    },{merge:true});
  }

  for(const item of next){
    await setDoc(doc(db,COLLECTION,item.id),{
      ...item,
      currentRecord:true,
      updatedAt:new Date().toISOString(),
    },{merge:true});
  }

  await updateMeta(next,companyId,storeId);
  announce();
};

export const currentStockService={
  collectionName:COLLECTION,

  getCurrent:async(companyId:string,storeId:string):Promise<OperationalStockItem[]>=>{
    await reconcileCanonicalV4(companyId,storeId);
    let rows=await readCanonical(companyId,storeId);
    if(!rows.length){
      const migrated=await deriveLegacy(companyId,storeId);
      if(migrated.length){
        await seedCanonical(migrated,companyId,storeId);
        rows=migrated;
        announce();
      }
    }
    if(rows.some(item=>!item.vehicleId)){
      const enriched=await dmsVehicleService.ensureManyFromStock(rows,companyId,storeId);
      for(const item of enriched){
        const next=normalizeItem(item,companyId,storeId);
        await setDoc(doc(db,COLLECTION,next.id),next,{merge:true});
      }
      rows=enriched;
    }
    const unique=new Map<string,OperationalStockItem>();
    rows.filter(isActive).sort((a,b)=>rowMoment(a).localeCompare(rowMoment(b))).forEach(item=>{
      const plate=cleanPlate(item.plate);
      if(plate)unique.set(plate,normalizeItem(item,companyId,storeId));
    });
    return Array.from(unique.values());
  },

  subscribe:(
    companyId:string,
    storeId:string,
    onRows:(rows:OperationalStockItem[])=>void,
    onError?:(error:unknown)=>void,
  )=>onSnapshot(
    query(
      collection(db,COLLECTION),
      where('companyId','==',companyId),
      where('storeId','==',storeId),
    ),
    snap=>{
      const unique=new Map<string,OperationalStockItem>();
      snap.docs
        .map(item=>item.data() as OperationalStockItem)
        .filter(item=>item.currentRecord===true&&isActive(item))
        .sort((a,b)=>rowMoment(a).localeCompare(rowMoment(b)))
        .forEach(item=>{
          const plate=cleanPlate(item.plate);
          if(plate)unique.set(plate,normalizeItem(item,companyId,storeId));
        });
      onRows(Array.from(unique.values()));
    },
    error=>onError?.(error),
  ),

  replaceImported:async(
    items:OperationalStockItem[],
    user:User|undefined,
    storeId:string,
    companyId:string,
  ):Promise<OperationalStockItem[]>=>{
    const current=await currentStockService.getCurrent(companyId,storeId);
    const imported=new Map<string,OperationalStockItem>();
    items.forEach(item=>{
      const plate=cleanPlate(item.plate);
      if(!/^[A-Z0-9]{7}$/.test(plate))return;
      imported.set(plate,normalizeItem({...item,plate,source:'import',manualActive:undefined,manualExitAt:undefined,status:item.status||'Disponível'},companyId,storeId));
    });

    const currentByPlate=new Map(current.map(item=>[cleanPlate(item.plate),item]));
    const next:OperationalStockItem[]=[];
    imported.forEach((item,plate)=>{
      const previous=currentByPlate.get(plate);
      next.push(normalizeItem({
        ...previous,
        ...item,
        plate,
        source:previous?.source==='manual'?'manual':'import',
        ...(previous?.source==='manual'?{manualActive:true,manualExitAt:''}:{}),
      },companyId,storeId));
    });

    current.forEach(item=>{
      const plate=cleanPlate(item.plate);
      if(imported.has(plate))return;
      if(item.source==='manual'&&item.manualActive!==false&&!item.manualExitAt){
        next.push(normalizeItem(item,companyId,storeId));
      }
    });

    const enriched=await dmsVehicleService.ensureManyFromStock(next,companyId,storeId,user);
    const nextPlates=new Set(enriched.map(item=>cleanPlate(item.plate)));
    const canonical=await readCanonical(companyId,storeId);
    for(const old of canonical){
      const plate=cleanPlate(old.plate);
      if(!plate||nextPlates.has(plate))continue;
      await setDoc(doc(db,COLLECTION,docId(companyId,storeId,plate)),{
        companyId,storeId,plate,status:'Saída',manualActive:false,updatedAt:new Date().toISOString(),
      },{merge:true});
      if(old.vehicleId){
        await dmsVehicleService.updateStage(old.vehicleId,'exited',companyId,storeId,user,'Veículo ausente na nova importação oficial.').catch(()=>undefined);
      }
    }
    for(const item of enriched){
      await setDoc(doc(db,COLLECTION,item.id),{...item,updatedAt:new Date().toISOString()},{merge:true});
    }
    await updateMeta(enriched,companyId,storeId);
    announce();
    return enriched.filter(isActive);
  },

  upsert:async(item:OperationalStockItem,storeId:string,companyId:string):Promise<OperationalStockItem[]>=>{
    const current=await currentStockService.getCurrent(companyId,storeId);
    const plate=cleanPlate(item.plate);
    if(!/^[A-Z0-9]{7}$/.test(plate))throw new Error('Informe uma placa válida com 7 caracteres.');
    const previous=current.find(row=>cleanPlate(row.plate)===plate);
    const isManual=item.source==='manual'||previous?.source==='manual';
    const draft=normalizeItem({
      ...previous,
      ...item,
      vehicleId:item.vehicleId||previous?.vehicleId,
      plate,
      ...(isManual?{source:'manual' as const,manualActive:true,manualExitAt:''}:{}),
      updatedAt:new Date().toISOString(),
    },companyId,storeId);
    const nextItem=await dmsVehicleService.syncFromStock(draft,companyId,storeId);
    await setDoc(doc(db,COLLECTION,nextItem.id),nextItem,{merge:true});
    const next=[...current.filter(row=>cleanPlate(row.plate)!==plate),nextItem];
    await updateMeta(next,companyId,storeId);
    announce();
    return next.filter(isActive);
  },

  markOut:async(plate:string,storeId:string,companyId:string):Promise<OperationalStockItem[]>=>{
    const target=cleanPlate(plate);
    const current=await currentStockService.getCurrent(companyId,storeId);
    const existing=current.find(item=>cleanPlate(item.plate)===target);
    if(!existing)throw new Error('Veículo não encontrado no estoque atual.');
    await setDoc(doc(db,COLLECTION,docId(companyId,storeId,target)),{
      companyId,storeId,plate:target,status:'Saída',manualActive:false,
      manualExitAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
    },{merge:true});
    const next=current.filter(item=>cleanPlate(item.plate)!==target);
    if(existing.vehicleId){
      await dmsVehicleService.updateStage(existing.vehicleId,'exited',companyId,storeId,undefined,'Saída registrada no estoque atual.').catch(()=>undefined);
    }
    await updateMeta(next,companyId,storeId);
    announce();
    return next;
  },
};
