import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { MarketPresenceItem, OperationalStockItem, User } from '../types';

const safe=(v:string)=>v.replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,120);
const cleanPlate=(v:unknown)=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);

export type MarketPresenceCorrection = Partial<Pick<MarketPresenceItem,
  'adStatus'|'photoStatus'|'photoCount'|'sitePrice'|'siteKm'|'alert'|'url'
>> & { note?: string };

export const marketPresenceService={
 importAudit:async(items:MarketPresenceItem[],fileName:string,user:User|undefined,storeId:string,companyId:string)=>{
  const valid=items.filter(item=>/^[A-Z0-9]{7}$/.test(cleanPlate(item.plate))).map(item=>({...item,plate:cleanPlate(item.plate),storeId,companyId}));
  if(!valid.length)throw new Error('Nenhuma linha válida de auditoria de site foi reconhecida.');
  for(const item of valid){const id=safe(`${companyId}_${storeId}_${item.referenceDate}_${item.plate}`);await setDoc(doc(db,'market_presence',id),{...item,id,sourceFile:fileName,importedBy:user?.email||'',importedAt:new Date().toISOString()},{merge:true});}
  await setDoc(doc(db,'operational_meta',`market_presence_current_${safe(storeId)}`),{companyId,storeId,latestMarketPresenceDate:valid[0].referenceDate,rows:valid.length,updatedAt:new Date().toISOString()},{merge:true});
  return valid.length;
 },
 getLatest:async(storeId:string,companyId:string):Promise<MarketPresenceItem[]>=>{
  const snap=await getDocs(query(collection(db,'market_presence'),where('companyId','==',companyId),where('storeId','==',storeId)));
  const all=snap.docs.map(d=>({...d.data(),id:d.id}) as MarketPresenceItem);
  if(!all.length)return[];
  const latest=all.reduce((max,item)=>item.referenceDate>max?item.referenceDate:max,'');
  return all.filter(item=>item.referenceDate===latest);
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
  const referenceDate=args.audit?.referenceDate||args.latestReferenceDate||new Date().toISOString().slice(0,10);
  const id=args.audit?.id||safe(`${args.companyId}_${args.storeId}_${referenceDate}_${plate}`);
  const current:MarketPresenceItem=args.audit||{
   id,referenceDate,plate,vehicle:args.stock.vehicle||'',adStatus:'missing',photoStatus:'missing',storeId:args.storeId,companyId:args.companyId,
  };
  const nextAd=args.patch.adStatus??current.adStatus;
  let nextPhoto=args.patch.photoStatus??current.photoStatus;
  if(nextAd==='missing')nextPhoto='missing';
  if(nextAd==='active'&&nextPhoto==='missing')nextPhoto='not_validated';
  const correctedAt=new Date().toISOString();
  const next={
   ...current,
   ...args.patch,
   id,
   referenceDate,
   plate,
   vehicle:current.vehicle||args.stock.vehicle||'',
   adStatus:nextAd,
   photoStatus:nextPhoto,
   storeId:args.storeId,
   companyId:args.companyId,
   manualCorrectedAt:correctedAt,
   manualCorrectedBy:args.user?.email||'',
   manualCorrectionNote:String(args.patch.note||'').trim(),
   auditedAt:correctedAt,
  };
  delete (next as any).note;
  await setDoc(doc(db,'market_presence',id),next,{merge:true});
  return next as MarketPresenceItem;
 },
 summarize:(stock:OperationalStockItem[],audit:MarketPresenceItem[])=>{
  const byPlate=new Map(audit.map(item=>[cleanPlate(item.plate),item]));
  const rows=stock.map(item=>({stock:item,audit:byPlate.get(cleanPlate(item.plate))}));
  const missingAd=rows.filter(r=>r.audit?.adStatus==='missing'||!r.audit);
  const insufficient=rows.filter(r=>r.audit?.photoStatus==='insufficient');
  const notValidated=rows.filter(r=>r.audit?.photoStatus==='not_validated');
  const priceMismatch=rows.filter(r=>r.audit&&r.audit.sitePrice!=null&&Math.abs(Number(r.audit.sitePrice)-Number(r.stock.askingPrice||0))>=1);
  const kmMismatch=rows.filter(r=>r.audit&&r.audit.siteKm!=null&&Number(r.stock.status||0)!==Number(r.audit.siteKm));
  const exposedCapital=rows.filter(r=>r.audit?.adStatus==='active').reduce((s,r)=>s+(Number(r.stock.cost)||0),0);
  const darkCapital=missingAd.reduce((s,r)=>s+(Number(r.stock.cost)||0),0);
  return{rows,missingAd,insufficient,notValidated,priceMismatch,kmMismatch,exposedCapital,darkCapital};
 }
};
