/**
 * Shared Dealer V44 "last published" snapshot for one company.
 * Only the parsed stock (never an XLSM file or VBA) is stored.
 * Chunk docs are immutable per revision. The company manifest is written last,
 * so readers never see half a publication. Local IndexedDB remains a fallback.
 */
import {randomUUID} from 'node:crypto';
import type {DealerStockSnapshot,DealerStockVehicle} from '../services/marketIqDealerRadar';
import {motyqFirestore} from './motyqFirestore.js';

// Preview tests never modify the canonical production company stock.
const databaseNamespace=process.env.VERCEL_ENV==='production'?'v1':'preview_v1';
export const DEALER_SHARED_MANIFEST='motyq_iq_dealer_manifests_'+databaseNamespace;
export const DEALER_SHARED_CHUNKS='motyq_iq_dealer_chunks_'+databaseNamespace;
const MAX_CARS=6000, CHUNK_SIZE=60, MAX_JSON_BYTES=3_000_000;
const trim=(x:unknown,max=140)=>String(x??'').trim().slice(0,max);
const number=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)?x:0;

export type SharedStockHeader={
 revision:string;companyId:string;reportDate:string;importedAt:string;
 sourceFileName:string;count:number;chunkCount:number;duplicateCount:number;
 warnings:string[];stores:string[];serviceOrderRows:number;
};
export type SharedStockManifest={
 companyId:string;version:1;current:SharedStockHeader;previous:SharedStockHeader|null;
 publishedAt:string;publishedBy:string;
};
export type SharedStockArchive={current:DealerStockSnapshot;previous:DealerStockSnapshot|null;
 publishedAt:string;revision:string;publishedBy:string};

export function safeCompany(companyId:string):string{
 const id=String(companyId||'').trim();
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(id))throw Error('company_scope_invalid');
 return id;
}
export const canReadDealerStock=(actor:any):boolean=>Boolean(actor?.status==='active'&&(
 actor.role==='admin'||actor.role==='manager'||actor.role==='pricing'||
 actor.pricingDeskAccess===true||actor.pricingDeskOnly===true));
export const canPublishDealerStock=(actor:any):boolean=>canReadDealerStock(actor)&&(
 actor.role==='admin'||actor.role==='manager'||actor.role==='pricing'||
 actor.pricingDeskOnly===true||actor.pricingDeskAccess===true);

/** Reject untrusted fields and excessive uploads; never persist raw files. */
export function cleanDealerSharedSnapshot(raw:unknown):DealerStockSnapshot{
 if(!raw||typeof raw!=='object')throw Error('invalid_snapshot');
 const value=raw as Record<string,any>;
 if(!Array.isArray(value.vehicles)||value.vehicles.length<1||value.vehicles.length>MAX_CARS)
  throw Error('invalid_vehicle_count');
 if(typeof value.reportDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.reportDate))
  throw Error('invalid_report_date');
 const date=Date.parse(value.reportDate+'T00:00:00Z');
 if(!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==value.reportDate)
  throw Error('invalid_report_date');
 const vehicles:DealerStockVehicle[]=value.vehicles.map((v:any)=>{
  if(!v||typeof v!=='object')throw Error('invalid_vehicle_row');
  const row:DealerStockVehicle={
   key:trim(v.key,80),plate:trim(v.plate,15),chassis:trim(v.chassis,30),
   brand:trim(v.brand,100),model:trim(v.model,220),year:trim(v.year,25),
   km:number(v.km),kmOriginal:trim(v.kmOriginal,35),kmValid:v.kmValid===true,
   fuel:trim(v.fuel,45),transmission:trim(v.transmission,60),days:number(v.days),
   price:number(v.price),purchase:number(v.purchase),cost:number(v.cost),
   operationalCost:number(v.operationalCost),osRule:number(v.osRule),
   osOutside:number(v.osOutside),store:trim(v.store,140),
   buyingCompany:trim(v.buyingCompany,140),location:trim(v.location,120),
   condition:trim(v.condition,100),
   vehicleType:v.vehicleType==='motorcycle'?'motorcycle':'car',
   serviceOrders:number(v.serviceOrders),
   familyKey:trim(v.familyKey,140),exactKey:trim(v.exactKey,250)
  };
  if(!row.key||!row.brand||!row.model||
   row.days<0||row.days>3000||
   row.km<0||row.km>999999||
   [row.cost,row.price,row.purchase].some(n=>n<0||n>20_000_000))
    throw Error('invalid_vehicle_row');
  return row;
 });
 const snapshot:DealerStockSnapshot={
  importedAt:trim(value.importedAt,45)||new Date().toISOString(),
  reportDate:value.reportDate,sourceFileName:trim(value.sourceFileName,140),
  duplicateCount:number(value.duplicateCount),
  warnings:(Array.isArray(value.warnings)?value.warnings:[]).slice(0,25).map((v:unknown)=>trim(v,300)),
  stores:(Array.isArray(value.stores)?value.stores:[]).slice(0,200).map((v:unknown)=>trim(v,140)),
  serviceOrderRows:number(value.serviceOrderRows),vehicles
 };
 if(Buffer.byteLength(JSON.stringify(snapshot),'utf8')>MAX_JSON_BYTES)throw Error('stock_too_large');
 return snapshot;
}
export const makeStockChunks=(rows:DealerStockVehicle[],size=CHUNK_SIZE):DealerStockVehicle[][]=>{
 const result:DealerStockVehicle[][]=[];
 for(let i=0;i<rows.length;i+=size)result.push(rows.slice(i,i+size));
 return result;
};
export function headerFor(snapshot:DealerStockSnapshot,companyId:string,revision:string):SharedStockHeader{
 return {
  revision,companyId,reportDate:snapshot.reportDate,importedAt:snapshot.importedAt,
  sourceFileName:snapshot.sourceFileName||'',count:snapshot.vehicles.length,
  chunkCount:Math.ceil(snapshot.vehicles.length/CHUNK_SIZE),
  duplicateCount:snapshot.duplicateCount,warnings:snapshot.warnings,
  stores:snapshot.stores,serviceOrderRows:snapshot.serviceOrderRows
 };
}
const chunkId=(company:string,revision:string,index:number)=>company+'__'+revision+'__'+String(index).padStart(3,'0');
const toSnapshot=(header:SharedStockHeader,vehicles:DealerStockVehicle[]):DealerStockSnapshot=>({
 importedAt:header.importedAt,reportDate:header.reportDate,sourceFileName:header.sourceFileName,
 duplicateCount:header.duplicateCount,warnings:header.warnings,stores:header.stores,
 serviceOrderRows:header.serviceOrderRows,vehicles
});
export type StockDb=Pick<typeof motyqFirestore,'get'|'patch'>;
const fetchRevision=async(db:StockDb,company:string,header:SharedStockHeader):Promise<DealerStockSnapshot>=>{
 if(header.companyId!==company||header.chunkCount<1||header.chunkCount>100||
  header.count<1||header.count>MAX_CARS)throw Error('shared_stock_corrupt');
 const chunks=await Promise.all(Array.from({length:header.chunkCount},async(_,i)=>{
  const doc=(await db.get(DEALER_SHARED_CHUNKS,chunkId(company,header.revision,i))) as Record<string,any>|null;
  if(!doc||doc.companyId!==company||doc.revision!==header.revision||
   doc.index!==i||typeof doc.json!=='string')throw Error('shared_stock_incomplete');
  return JSON.parse(doc.json) as DealerStockVehicle[];
 }));
 const vehicles=chunks.flat();
 if(vehicles.length!==header.count)throw Error('shared_stock_incomplete');
 return cleanDealerSharedSnapshot(toSnapshot(header,vehicles));
};
export async function loadDealerShared(companyId:string,db:StockDb=motyqFirestore):Promise<SharedStockArchive|null>{
 const company=safeCompany(companyId);
 const manifest=await db.get(DEALER_SHARED_MANIFEST,company) as unknown as SharedStockManifest|null;
 if(!manifest)return null;
 if(manifest.version!==1||manifest.companyId!==company||!manifest.current)
  throw Error('shared_stock_corrupt');
 const current=await fetchRevision(db,company,manifest.current);
 const previous=manifest.previous?
  await fetchRevision(db,company,manifest.previous):null;
 return {current,previous,publishedAt:manifest.publishedAt,
  revision:manifest.current.revision,publishedBy:manifest.publishedBy};
}
/** Upload new rows first, then switch the canonical manifest. On failure,
 * an old complete publication remains readable by every authorized device.
 */
export async function publishDealerShared(companyId:string,input:unknown,publishedBy:string,
 db:StockDb=motyqFirestore):Promise<SharedStockArchive>{
 const company=safeCompany(companyId),snapshot=cleanDealerSharedSnapshot(input);
 const old=await db.get(DEALER_SHARED_MANIFEST,company) as unknown as SharedStockManifest|null;
 if(old&&old.companyId!==company)throw Error('company_scope_mismatch');
 if(old?.current?.reportDate&&snapshot.reportDate<old.current.reportDate)
  throw Error('older_report_rejected');
 const revision=randomUUID().replace(/-/g,'');
 const groups=makeStockChunks(snapshot.vehicles);
 for(let i=0;i<groups.length;i+=5){
  await Promise.all(groups.slice(i,i+5).map((group,j)=>{
   const index=i+j;
   const json=JSON.stringify(group);
   if(Buffer.byteLength(json,'utf8')>700_000)throw Error('stock_chunk_too_large');
   return db.patch(DEALER_SHARED_CHUNKS,chunkId(company,revision,index),{
    companyId:company,revision,index,json
   });
  }));
 }
 const manifest:SharedStockManifest={
  companyId:company,version:1,current:headerFor(snapshot,company,revision),
  // Keep previous generation for comparison; never depend on a device's cache.
  previous:old?.current||null,
  publishedAt:new Date().toISOString(),publishedBy:trim(publishedBy,140)
 };
 await db.patch(DEALER_SHARED_MANIFEST,company,manifest);
 return {current:snapshot,previous:old?.current?
  await fetchRevision(db,company,old.current):null,
  publishedAt:manifest.publishedAt,revision,publishedBy:manifest.publishedBy};
}
