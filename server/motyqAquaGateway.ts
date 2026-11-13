/** Motyq AQUA cloud gateway. All Firestore access stays server-side.
 * No public listing, anonymous reads, demo-to-real promotion or client-direct writes.
 * Buy-now/bids remain disabled until atomic server-side reservation is implemented.
 */
import {createHash,randomUUID} from 'node:crypto';
import {motyqFirestore} from './motyqFirestore.js';
import firebaseConfig from '../firebase-applet-config.json';
import {sendAquaPush} from './motyqAquaPush.js';

const BUYERS='aqua_buyer_access_v1',LOTS='aqua_live_lots_v1',PUSH='aqua_push_tokens_v1',INBOX='aqua_buyer_inbox_v1';
// Prevent Preview data sharing production documents even on a shared Firebase project.
const aquaEnvironment=()=>process.env.VERCEL_ENV==='production'?'production':'preview';
const ALLOWED_ORIGIN=''; // same-origin only; never enable wildcard CORS.
const norm=(v:any)=>String(v??'').trim().toLowerCase();
const str=(v:any,n=120)=>String(v??'').trim().slice(0,n);
const safeId=(v:any)=>/^[a-zA-Z0-9_-]{6,140}$/.test(String(v??''))?String(v):'';
const bool=(v:any)=>v===true;
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
const scopedBuyerKey=(company:string,store:string,id:string)=>digest(aquaEnvironment()+'|'+company+'|'+store+'|'+id).slice(0,52);
const scope=(v:any)=>[str(v.companyId,80),str(v.storeId,80)];
const bad=(status:number,message:string)=>Object.assign(new Error(message),{status});
const publicVehicle=(v:any)=>{
 const year=str(v?.year,32),brand=str(v?.brand,80),model=str(v?.model,140);
 if(!brand||!model||!/(?:19|20)\d{2}/.test(year))throw bad(400,'Dados do veículo incompletos.');
 const km=str(v?.km,16).replace(/[^\d]/g,'');
 if(!km||Number(km)>2000000)throw bad(400,'Quilometragem inválida.');
 const notes=str(v?.notes,500)
  .replace(/\b[A-Z]{3}-?\d{4}\b/gi,'[placa omitida]')
  .replace(/\b[A-Z]{3}\d[A-Z]\d{2}\b/gi,'[placa omitida]')
  .replace(/\b\d{3}[-. ]?\d{3}[-. ]?\d{3}[-. ]?\d{2}\b/g,'[documento omitido]');
 return {brand,model,year,km,vehicleType:v?.vehicleType==='motorcycle'?'motorcycle':'car',notes};
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
 const rows:any[]=await motyqFirestore.query(BUYERS,[{field:'email',value:email}],40);
 return rows.filter((x:any)=>x.email===email&&x.environment===aquaEnvironment()&&x.active===true&&x.optedIn===true);
}
async function ensureBuyerInbox(buyer:any,lotId:string,endsAt:string){
 const key=buyer.id;
 const prior:any=await motyqFirestore.get(INBOX,key);
 if(!prior){
  await motyqFirestore.patch(INBOX,key,{id:key,environment:aquaEnvironment(),
   companyId:buyer.companyId,storeId:buyer.storeId,buyerId:buyer.buyerId,lots:[]});
 }else if(prior.environment!==aquaEnvironment()||prior.companyId!==buyer.companyId||prior.storeId!==buyer.storeId){
  throw bad(403,'Carteira online incompatível.');
 }
 await motyqFirestore.appendToArray(INBOX,key,'lots',{lotId,endsAt});
}
async function listForBuyer(email:string){
 const accounts=await myAccess(email);
 if(!accounts.length)return {linked:false,items:[],interest:null};
 const items:any[]=[];
 for(const a of accounts.slice(0,8)){
  const inbox:any=await motyqFirestore.get(INBOX,a.id);
  if(!inbox||inbox.environment!==aquaEnvironment()||inbox.companyId!==a.companyId||inbox.storeId!==a.storeId)continue;
  const candidates=Array.isArray(inbox.lots)?inbox.lots.filter((item:any)=>
   item&&safeId(item.lotId)&&Date.parse(item.endsAt)>Date.now()).slice(-30):[];
  for(const candidate of candidates){
   const lot:any=await motyqFirestore.get(LOTS,candidate.lotId);
   if(!lot||lot.environment!==aquaEnvironment()||lot.companyId!==a.companyId||
    lot.storeId!==a.storeId||lot.state!=='open'||Date.parse(lot.endsAt)<=Date.now())continue;
   if(!Array.isArray(lot.visibleBuyerIds)||!lot.visibleBuyerIds.includes(a.buyerId))continue;
   if(!compatible({...lot.vehicle,buyNowPrice:lot.buyNowPrice},a.interest))continue;
   if(items.some(x=>x.id===lot.id))continue;
   items.push({id:lot.id,brand:lot.vehicle.brand,model:lot.vehicle.model,year:lot.vehicle.year,
    km:lot.vehicle.km,vehicleType:lot.vehicle.vehicleType,notes:lot.vehicle.notes,
    mode:lot.mode,endsAt:lot.endsAt,buyNowPrice:lot.buyNowPrice??undefined,
    ...(lot.mode==='open'?{highestBid:lot.highestBid??undefined}:{}),shop:a.shop});
  }
 }
 return {linked:true,items:items.slice(0,100),interest:accounts[0].interest||null};
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
  const action=str(req.query?.action,40).replace(/^aqua-/, '');
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
   if(!invited.length||invited.length>60)throw bad(400,'Selecione até 60 lojistas por oportunidade nesta etapa.');
   const all:any[]=await motyqFirestore.query(BUYERS,[{field:'companyId',value:actor.companyId}],250);
   const matched=all.filter((b:any)=>b.environment===aquaEnvironment()&&b.storeId===actor.storeId&&b.active&&b.optedIn&&invited.includes(b.buyerId)&&compatible({...vehicle,buyNowPrice:input.buyNowPrice},b.interest));
   if(matched.length!==invited.length)throw bad(400,'Um ou mais lojistas ainda não estão habilitados ou não são compatíveis.');
   const buyNowPrice=input.buyNowPrice===undefined?undefined:money(input.buyNowPrice);
   if(input.buyNowPrice!==undefined&&buyNowPrice===null)throw bad(400,'Preço de arremate inválido.');
   const clientId=safeId(input.clientLotId);
   if(!clientId)throw bad(400,'Identificador da oportunidade inválido.');
   const docId=digest(aquaEnvironment()+'|'+actor.companyId+'|'+actor.storeId+'|'+clientId).slice(0,52);
   const existing:any=await motyqFirestore.get(LOTS,docId);
   if(existing){
    if(existing.companyId!==actor.companyId||existing.storeId!==actor.storeId||existing.createdBy!==user.email)
     throw bad(403,'Oportunidade indisponível.');
    await Promise.all(matched.map((b:any)=>ensureBuyerInbox(b,docId,existing.endsAt)));
    return json(res,200,{ok:true,lotId:docId,invitedCount:matched.length,alreadyPublished:true});
   }
   const lot={id:docId,environment:aquaEnvironment(),companyId:actor.companyId,storeId:actor.storeId,
    createdBy:user.email,createdAt:new Date().toISOString(),state:'open',vehicle,mode,endsAt,
    visibleBuyerIds:invited, ...(buyNowPrice?{buyNowPrice}:{}), highestBid:null};
   await motyqFirestore.patch(LOTS,docId,lot);
   await Promise.all(matched.map((b:any)=>ensureBuyerInbox(b,docId,endsAt)));
   // Background push is best-effort; buyers still see opportunities in the feed.
   let pushSent=0;
   try{
    const registered:any[]=await motyqFirestore.query(PUSH,[{field:'environment',value:aquaEnvironment()}],500);
    const emails=new Set(matched.map((b:any)=>b.email));
    const destinations=registered.filter((p:any)=>emails.has(p.email)&&p.enabled===true).slice(0,60);
    const host=str(req.headers.host,200);
    const results=await Promise.allSettled(destinations.map((p:any)=>sendAquaPush(
     p.token,vehicle,'https://'+host+'/aqua/lojista'
    )));
    pushSent=results.filter(x=>x.status==='fulfilled').length;
    if(results.some(x=>x.status==='rejected'))console.warn('aqua_push_partial_delivery',results.length,pushSent);
   }catch(err:any){console.warn('aqua_push_unavailable',String(err?.message||'error').slice(0,80));}
   return json(res,200,{ok:true,lotId:docId,invitedCount:matched.length,pushSent});
  }
  if(action==='push-subscribe'&&req.method==='POST'){
   const accounts=await myAccess(user.email);
   if(!accounts.length)throw bad(403,'Seu lojista não foi habilitado pela Mesa.');
   const token=str(req.body?.token,2400);
   if(!/^[A-Za-z0-9:_~.-]{30,2400}$/.test(token))throw bad(400,'Token de notificação inválido.');
   const key=digest(aquaEnvironment()+'|'+user.email+'|'+token).slice(0,52);
   await motyqFirestore.patch(PUSH,key,{id:key,environment:aquaEnvironment(),
    email:user.email,token,enabled:true,updatedAt:new Date().toISOString()});
   return json(res,200,{ok:true});
  }
  if(action==='push-unsubscribe'&&req.method==='POST'){
   const token=str(req.body?.token,2400);
   if(!/^[A-Za-z0-9:_~.-]{30,2400}$/.test(token))throw bad(400,'Token inválido.');
   const key=digest(aquaEnvironment()+'|'+user.email+'|'+token).slice(0,52);
   const previous:any=await motyqFirestore.get(PUSH,key);
   if(previous&&previous.email===user.email&&previous.environment===aquaEnvironment())
    await motyqFirestore.patch(PUSH,key,{enabled:false,updatedAt:new Date().toISOString()});
   return json(res,200,{ok:true});
  }
  if(action==='close-lot'&&req.method==='POST'){
   const actor=await staff(user),lotId=safeId(req.body?.lotId);
   if(!lotId)throw bad(400,'Oportunidade inválida.');
   const lot:any=await motyqFirestore.get(LOTS,lotId);
   if(!lot||lot.environment!==aquaEnvironment()||lot.companyId!==actor.companyId||lot.storeId!==actor.storeId)
    throw bad(404,'Oportunidade não localizada.');
   if(lot.createdBy!==user.email)throw bad(403,'Somente quem publicou pode encerrar.');
   if(lot.state!=='open')return json(res,200,{ok:true,alreadyClosed:true});
   await motyqFirestore.patch(LOTS,lotId,{state:'closed',closedAt:new Date().toISOString()});
   return json(res,200,{ok:true});
  }
  if(action==='enable-buyer'&&req.method==='POST'){
   const actor=await staff(user),buyer=buyerClean(req.body?.buyer);
   const key=scopedBuyerKey(actor.companyId,actor.storeId,buyer.id);
   const doc={id:key,environment:aquaEnvironment(),companyId:actor.companyId,storeId:actor.storeId,buyerId:buyer.id,
    shop:buyer.shop,email:buyer.email,interest:buyer.interest,active:true,optedIn:true,
    updatedBy:user.email,updatedAt:new Date().toISOString()};
   await motyqFirestore.patch(BUYERS,key,doc);
   const inbox:any=await motyqFirestore.get(INBOX,key);
   if(!inbox)await motyqFirestore.patch(INBOX,key,{id:key,environment:aquaEnvironment(),
    companyId:actor.companyId,storeId:actor.storeId,buyerId:buyer.id,lots:[]});
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
  if(action==='disable-buyer'&&req.method==='POST'){
   const actor=await staff(user),id=safeId(req.body?.buyerId);
   if(!id)throw bad(400,'Identificador de lojista inválido.');
   const key=scopedBuyerKey(actor.companyId,actor.storeId,id);
   const previous:any=await motyqFirestore.get(BUYERS,key);
   if(!previous||previous.environment!==aquaEnvironment()||previous.companyId!==actor.companyId||previous.storeId!==actor.storeId)throw bad(404,'Lojista online não localizado.');
   await motyqFirestore.patch(BUYERS,key,{active:false,updatedBy:user.email,updatedAt:new Date().toISOString()});
   return json(res,200,{ok:true});
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
