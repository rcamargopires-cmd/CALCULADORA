import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { MarketPresenceItem, OperationalStockItem, User } from '../types';

const safe=(v:string)=>v.replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,120);
const cleanPlate=(v:unknown)=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const currentMetaId=(storeId:string)=>`current_${safe(storeId)}`;

type BatchedMarketPresenceItem=MarketPresenceItem&{stockBatchId?:string;manualCorrectedAt?:string;manualCorrectedBy?:string;manualCorrectionNote?:string};

export type MarketPresenceCorrection = Partial<Pick<MarketPresenceItem,
  'adStatus'|'photoStatus'|'photoCount'|'sitePrice'|'siteKm'|'alert'|'url'
>> & { note?: string };

const activeStockBatch=async(storeId:string,companyId:string)=>{
 try{
  const snap=await getDoc(doc(db,'operational_meta',currentMetaId(storeId)));
  if(!snap.exists())return'';
  const data=snap.data();
  if(String(data.companyId||'')!==String(companyId||''))return'';
  return String(data.latestStockBatchId||'');
 }catch{return'';}
};

export const marketPresenceService={
 importAudit:async(items:MarketPresenceItem[],fileName:string,user:User|undefined,storeId:string,companyId:string)=>{
  const stockBatchId=await activeStockBatch(storeId,companyId);
  const valid=items
   .filter(item=>/^[A-Z0-9]{7}$/.test(cleanPlate(item.plate)))
   .map(item=>({...item,plate:cleanPlate(item.plate),storeId,companyId,stockBatchId} as BatchedMarketPresenceItem));
  if(!valid.length)throw new Error('Nenhuma linha válida de auditoria de site foi reconhecida.');
  for(const item of valid){
   const id=safe(`${companyId}_${storeId}_${item.referenceDate}_${item.plate}`);
   await setDoc(doc(db,'market_presence',id),{...item,id,sourceFile:fileName,importedBy:user?.email||'',importedAt:new Date().toISOString()},{merge:true});
  }
  await setDoc(doc(db,'operational_meta',`market_presence_current_${safe(storeId)}`),{
   companyId,storeId,latestMarketPresenceDate:valid[0].referenceDate,stockBatchId,rows:valid.length,updatedAt:new Date().toISOString()
  },{merge:true});
  return valid.length;
 },

 getLatest:async(storeId:string,companyId:string):Promise<MarketPresenceItem[]>=>{
  const stockBatchId=await activeStockBatch(storeId,companyId);
  const snap=await getDocs(query(collection(db,'market_presence'),where('companyId','==',companyId),where('storeId','==',storeId)));
  const all=snap.docs.map(d=>({...d.data(),id:d.id}) as BatchedMarketPresenceItem);
  if(!all.length)return[];

  // When the stock has an active replacement batch, only audits made against
  // that exact batch are valid. Older audits remain as history but never drive
  // the current Market Presence screen.
  const compatible=stockBatchId?all.filter(item=>String(item.stockBatchId||'')===stockBatchId):all;
  if(!compatible.length)return[];
  const latest=compatible.reduce((max,item)=>item.referenceDate>max?item.referenceDate:max,'');
  return compatible.filter(item=>item.referenceDate===latest);
 },

 correct:async(args:{
  stock:OperationalStockItem;
  audit?:MarketPresenceItem;
  latestReferenceDate?:string;
  patch:MarketPresenceCorrection;
  user?:User;
  storeId:string;
  companyId:string;
 })=>{
  const plate=cleanPlate(args.stock.plate);
  if(!/^[A-Z0-9]{7}$/.test(plate))throw new Error('Placa inválida para correção.');
  const stockBatchId=await activeStockBatch(args.storeId,args.companyId);
  const referenceDate=args.audit?.referenceDate||args.latestReferenceDate||new Date().toISOString().slice(0,10);
  const id=args.audit?.id||safe(`${args.companyId}_${args.storeId}_${referenceDate}_${plate}`);
  const current:BatchedMarketPresenceItem=(args.audit as BatchedMarketPresenceItem)||{
   id,referenceDate,plate,vehicle:args.stock.vehicle||'',adStatus:'missing',photoStatus:'missing',storeId:args.storeId,companyId:args.companyId,stockBatchId,
  };
  const nextAd=args.patch.adStatus??current.adStatus;
  let nextPhoto=args.patch.photoStatus??current.photoStatus;
  if(nextAd==='missing')nextPhoto='missing';
  if(nextAd==='active'&&nextPhoto==='missing')nextPhoto='not_validated';
  const correctedAt=new Date().toISOString();
  const next:any={
   ...current,...args.patch,id,referenceDate,plate,
   vehicle:current.vehicle||args.stock.vehicle||'',
   adStatus:nextAd,photoStatus:nextPhoto,
   storeId:args.storeId,companyId:args.companyId,stockBatchId,
   manualCorrectedAt:correctedAt,manualCorrectedBy:args.user?.email||'',
   manualCorrectionNote:String(args.patch.note||'').trim(),auditedAt:correctedAt,
  };
  delete next.note;
  await setDoc(doc(db,'market_presence',id),next,{merge:true});
  return next as MarketPresenceItem;
 },

 summarize:(stock:OperationalStockItem[],audit:MarketPresenceItem[])=>{
  const byPlate=new Map(audit.map(item=>[cleanPlate(item.plate),item]));
  const rows=stock.map(item=>({stock:item,audit:byPlate.get(cleanPlate(item.plate))}));
  const unverified=rows.filter(r=>!r.audit);
  const missingAd=rows.filter(r=>r.audit?.adStatus==='missing');
  const insufficient=rows.filter(r=>r.audit?.photoStatus==='insufficient');
  const notValidated=rows.filter(r=>r.audit?.adStatus==='active'&&r.audit?.photoStatus==='not_validated');
  const priceMismatch=rows.filter(r=>r.audit&&r.audit.sitePrice!=null&&Math.abs(Number(r.audit.sitePrice)-Number(r.stock.askingPrice||0))>=1);
  const exposedCapital=rows.filter(r=>r.audit?.adStatus==='active').reduce((s,r)=>s+(Number(r.stock.cost)||0),0);
  const darkCapital=missingAd.reduce((s,r)=>s+(Number(r.stock.cost)||0),0);
  return{rows,unverified,missingAd,insufficient,notValidated,priceMismatch,kmMismatch:[],exposedCapital,darkCapital};
 }
};
