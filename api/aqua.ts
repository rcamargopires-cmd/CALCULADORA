/** Motyq AQUA cloud gateway. All Firestore access stays server-side.
 * No public listing, anonymous reads, demo-to-real promotion or client-direct writes.
 * Buy-now/bids remain disabled until atomic server-side reservation is implemented.
 */
import {createHash,randomUUID} from 'node:crypto';
import {motyqFirestore} from '../server/motyqFirestore.js';
import firebaseConfig from '../firebase-applet-config.json';

const BUYERS='aqua_buyer_access_v1',LOTS='aqua_live_lots_v1';
const ALLOWED_ORIGIN=''; // same-origin only; never enable wildcard CORS.
const norm=(v:any)=>String(v??'').trim().toLowerCase();
const str=(v:any,n=120)=>String(v??'').trim().slice(0,n);
const safeId=(v:any)=>/^[a-zA-Z0-9_-]{6,140}$/.test(String(v??''))?String(v):'';
const bool=(v:any)=>v===true;
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
const scopedBuyerKey=(company:string,store:string,id:string)=>digest(company+'|'+store+'|'+id).slice(0,52);
const scope=(v:any)=>[str(v.companyId,80),str(v.storeId,80)];
const bad=(status:number,message:string)=>Object.assign(new Error(message),{status});
const publicVehicle=(v:any)=>{
 const year=str(v?.year,32),brand=str(v?.brand,80),model=str(v?.model,140);
 if(!brand||!model||!/(?:19|20)\d{2}/.test(year))throw bad(400,'Dados do veículo incompletos.');
 const km=str(v?.km,16).replace(/[^\d]/g,'');
 if(!km||Number(km)>2000000)throw bad(400,'Quilometragem inválida.');
 return {brand,model,year,km,vehicleType:v?.vehicleType==='motorcycle'?'motorcycle':'car',
  notes:str(v?.notes,500)};
};
const money=(n:any)=>Number.isSafeInteger(Number(n))&&Number(n)>=1000&&Number(n)<=10000000?Number(n):null;
const permission=(profile:any)=>profile?.status==='active'&&(
 ['admin','pricing'].includes(profile.role)||profile.pricingDeskAccess===true||
 profile.pricingDeskOnly===true||(profile.role==='manager'&&!['finance','preparation'].includes(profile.dmsAccessProfile)));
const verified=async(req:any)=>{
 const authorization=str(req.headers?.authorization||'',6000);
 const token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
 if(!token)throw bad(401,'Entre na conta para acessar o AQUA.');
 const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+firebaseConfig.apiKey,{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken:token})});
 if(!response.ok)throw bad(401,'Sessão inválida.');
 const result:any=await response.json().catch(()=>({}));
 const account=result.users?.[0];
 const email=norm(account?.email);
 if(!email||account?.emailVerified!==true||account?.disabled===true)throw bad(403,'Confirme seu e-mail para acessar o AQUA.');
 return {email,uid:str(account.localId,130)};
};
const staff=async(user:{email:string})=>{
 const profile=await motyqFirestore.get('users',user.email);
 if(!permission(profile))throw bad(403,'Acesso restrito à Mesa.');
 const [companyId,storeId]=scope(profile);
 if(!companyId||!storeId)throw bad(403,'Empresa ou unidade não configurada.');
 return {companyId,storeId};
};
const buyerClean=(raw:any)=>{
 const id=safeId(raw?.id),email=norm(raw?.email),shop=str(raw?.shop,100);
 if(!id||!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!shop)throw bad(400,'Lojista precisa de nome, ID e e-mail válido.');
 if(raw?.active!==true||raw?.optedIn!==true)throw bad(400,'Lojista deve estar ativo e autorizar oportunidades.');
 const interest={
  vehicleType:raw.vehicleType==='car'||raw.vehicleType==='motorcycle'?raw.vehicleType:'both',
  brands:str(raw.brands,400),models:str(raw.models,400),yearFrom:str(raw.yearFrom,4),
  yearTo:str(raw.yearTo,4),maxKm:str(raw.maxKm,8).replace(/\D/g,''),
  budgetTo:str(raw.budgetTo,10).replace(/\D/g,'')
 };
 if(interest.yearFrom&&!/^(19|20)\d{2}$/.test(interest.yearFrom))throw bad(400,'Ano mínimo inválido.');
 if(interest.yearTo&&!/^(19|20)\d{2}$/.test(interest.yearTo))throw bad(400,'Ano máximo inválido.');
 return {id,email,shop,interest};
};
const N=(v:any)=>str(v,450).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const tags=(v:any)=>str(v,400).split(/[,;\n]+/).map(N).filter(Boolean);
const compatible=(car:any,prefs:any)=>{
 if(prefs.vehicleType!=='both'&&prefs.vehicleType!==car.vehicleType)return false;
 const b=N(car.brand),m=N(car.model),brands=tags(prefs.brands),models=tags(prefs.models);
 if(brands.length&&!brands.some(x=>b===x||b.startsWith(x+' ')))return false;
 if(models.length&&!models.some(x=>m===x||m.includes(x)||x.includes(m)))return false;
 const y=Number((String(car.year).match(/(?:19|20)\d{2}/)||[])[0]);
 if(!y)return false;
 if(Number(prefs.yearFrom)>0&&y<Number(prefs.yearFrom))return false;
 if(Number(prefs.yearTo)>0&&y>Number(prefs.yearTo))return false;
 if(Number(prefs.maxKm)>0&&(!Number(car.km)||Number(car.km)>Number(prefs.maxKm)))return false;
 if(Number(prefs.budgetTo)>0&&car.buyNowPrice&&car.buyNowPrice>Number(prefs.budgetTo))return false;
 return true;
};
async function myAccess(email:string){
 // Lookup is by exact verified email, not a buyerId submitted by the caller.
 const rows=await motyqFirestore.query(BUYERS,[{field:'email',value:email}],40);
 return rows.filter((x:any)=>x.email===email&&x.active===true&&x.optedIn===true);
}
async function listForBuyer(email:string){
 const accounts=await myAccess(email);
 if(!accounts.length)return {linked:false,items:[]};
 const items:any[]=[];
 for(const a of accounts.slice(0,8)){
  // Scoped server-side to tenant; never return non-invited lots.
  const rows=await motyqFirestore.query(LOTS,[{field:'companyId',value:a.companyId}],150);
  for(const lot of rows){
   if(lot.storeId!==a.storeId||lot.state!=='open'||Date.parse(lot.endsAt)<=Date.now())continue;
   if(!Array.isArray(lot.visibleBuyerIds)||!lot.visibleBuyerIds.includes(a.buyerId))continue;
   if(!compatible(lot.vehicle,{...a.interest}))continue;
   items.push({id:lot.id,brand:lot.vehicle.brand,model:lot.vehicle.model,year:lot.vehicle.year,
    km:lot.vehicle.km,vehicleType:lot.vehicle.vehicleType,notes:lot.vehicle.notes,
    mode:lot.mode,endsAt:lot.endsAt,buyNowPrice:lot.buyNowPrice??undefined,
    // Closed offers never leak competitor bids or buyer identities.
    ...(lot.mode==='open'?{highestBid:lot.highestBid??undefined}:{}),
    shop: a.shop});
  }
 }
 return {linked:true,items:items.slice(0,100)};
}
const json=(res:any,status:number,value:any)=>res.status(status).setHeader('Cache-Control','no-store').json(value);
export default async function handler(req:any,res:any){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','POST'].includes(req.method))return json(res,405,{error:'Método não permitido.'});
 if(req.method==='POST'&&req.headers.origin){
  const host=str(req.headers.host,200);
  try{if(new URL(String(req.headers.origin)).host!==host)throw bad(403,'Origem não autorizada.');}
  catch{return json(res,403,{error:'Origem não autorizada.'});}
 }
 try{
  if(!motyqFirestore.configured())throw bad(503,'Sincronização AQUA não configurada no servidor.');
  const user=await verified(req);
  const action=str(req.query?.action,30);
  if(action==='buyer-feed'&&req.method==='GET')return json(res,200,await listForBuyer(user.email));
  if(action==='publish'&&req.method==='POST'){
   const actor=await staff(user),input=req.body?.lot||{};
   const vehicle=publicVehicle(input.vehicle);
   const endsAt=str(input.endsAt,40);
   if(!Number.isFinite(Date.parse(endsAt))||Date.parse(endsAt)<=Date.now()||
    Date.parse(endsAt)>Date.now()+30*86400000)throw bad(400,'Prazo inválido.');
   const mode=input.mode==='sealed'?'sealed':input.mode==='open'?'open':null;
   if(!mode)throw bad(400,'Tipo de disputa inválido.');
   const invited=Array.isArray(input.visibleBuyerIds)?[...new Set(input.visibleBuyerIds.map((x:any)=>safeId(x)).filter(Boolean))]:[];
   if(!invited.length||invited.length>250)throw bad(400,'Selecione lojistas habilitados.');
   const all=await motyqFirestore.query(BUYERS,[{field:'companyId',value:actor.companyId}],250);
   const matched=all.filter((b:any)=>b.storeId===actor.storeId&&b.active&&b.optedIn&&invited.includes(b.buyerId)&&compatible({...vehicle,buyNowPrice:input.buyNowPrice},b.interest));
   if(matched.length!==invited.length)throw bad(400,'Um ou mais lojistas ainda não estão habilitados ou não são compatíveis.');
   const buyNowPrice=input.buyNowPrice===undefined?undefined:money(input.buyNowPrice);
   if(input.buyNowPrice!==undefined&&buyNowPrice===null)throw bad(400,'Preço de arremate inválido.');
   const docId=randomUUID().replace(/-/g,'');
   const lot={id:docId,companyId:actor.companyId,storeId:actor.storeId,
    createdBy:user.email,createdAt:new Date().toISOString(),state:'open',vehicle,mode,endsAt,
    visibleBuyerIds:invited, ...(buyNowPrice?{buyNowPrice}:{}), highestBid:null};
   await motyqFirestore.patch(LOTS,docId,lot);
   return json(res,200,{ok:true,lotId:docId,invitedCount:matched.length});
  }
  if(action==='enable-buyer'&&req.method==='POST'){
   const actor=await staff(user),buyer=buyerClean(req.body?.buyer);
   const key=scopedBuyerKey(actor.companyId,actor.storeId,buyer.id);
   const doc={id:key,companyId:actor.companyId,storeId:actor.storeId,buyerId:buyer.id,
    shop:buyer.shop,email:buyer.email,interest:buyer.interest,active:true,optedIn:true,
    updatedBy:user.email,updatedAt:new Date().toISOString()};
   await motyqFirestore.patch(BUYERS,key,doc);
   return json(res,200,{ok:true,shop:buyer.shop});
  }
  if(action==='save-interests'&&req.method==='POST'){
   const accounts=await myAccess(user.email);
   if(!accounts.length)throw bad(403,'Seu e-mail ainda não foi habilitado por uma Mesa.');
   const input=req.body?.interest||{};
   const interest={
    vehicleType:['car','motorcycle','both'].includes(input.vehicleType)?input.vehicleType:'both',
    brands:str(input.brands,400),models:str(input.models,400),
    yearFrom:str(input.yearFrom,4),yearTo:str(input.yearTo,4),
    maxKm:str(input.maxKm,8).replace(/\D/g,''),
    budgetTo:str(input.budgetTo,10).replace(/\D/g,'')
   };
   if((interest.yearFrom&&!/^(19|20)\d{2}$/.test(interest.yearFrom))||
    (interest.yearTo&&!/^(19|20)\d{2}$/.test(interest.yearTo))||
    (interest.yearFrom&&interest.yearTo&&+interest.yearFrom>+interest.yearTo))
    throw bad(400,'Faixa de anos inválida.');
   for(const item of accounts.slice(0,8)){
    // Only mutate interests of the verified buyer's existing authorized links.
    await motyqFirestore.patch(BUYERS,item.id,{interest,updatedAt:new Date().toISOString()});
   }
   return json(res,200,{ok:true,updated:Math.min(8,accounts.length)});
  }
  if(action==='my-access'&&req.method==='GET'){
   const accounts=await myAccess(user.email);
   return json(res,200,{linked:accounts.length>0,shops:accounts.map((x:any)=>x.shop)});
  }
  throw bad(404,'Ação não encontrada.');
 }catch(err:any){
  const status=Number(err?.status)||(String(err?.message||'').includes('429')?503:500);
  console.error('aqua_gateway',status,String(err?.message||'error').slice(0,120));
  return json(res,status,{error:status===500?'Não foi possível consultar o AQUA agora.':String(err?.message||'Serviço indisponível.')});
 }
}
