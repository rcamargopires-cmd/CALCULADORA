/**
 * Authenticated same-origin Dealer stock API.
 * Firebase identity token is checked server-side, then the active user profile
 * determines company and read/publish permissions. Service credentials never
 * leave the function. No direct browser Firestore reads/rules release needed.
 */
import firebaseConfig from '../firebase-applet-config.json';
import {motyqFirestore} from '../server/motyqFirestore.js';
import {safeCompany,canReadDealerStock,canPublishDealerStock,
 loadDealerShared,publishDealerShared} from '../server/motyqDealerShared.js';

const key=String(firebaseConfig.apiKey||'');
const ADMIN_OWNER='r.camargo.pires@gmail.com';
const cleanEmail=(value:unknown)=>String(value||'').trim().toLowerCase();
const fail=(res:any,status:number,error:string)=>res.status(status).json({error});

async function authenticatedActor(req:any):Promise<any|null>{
 const header=String(req.headers?.authorization||'');
 const token=header.startsWith('Bearer ')?header.slice(7):'';
 if(!token||!key)return null;
 const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(key),{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken:token})
 });
 if(!response.ok)return null;
 const data:any=await response.json().catch(()=>({}));
 const identity=data?.users?.[0];
 const email=cleanEmail(identity?.email);
 // Invalid, anonymous or unverified sessions cannot read sensitive stock.
 if(!email||identity?.emailVerified!==true)return null;
 const profile=await motyqFirestore.get('users',email);
 if(email===ADMIN_OWNER&&(!profile||profile.status==='active'))
  return {...profile,email,status:'active',role:'admin',companyId:profile?.companyId||'abrao-reze'};
 if(!profile||profile.status!=='active')return null;
 return {...profile,email};
}

export default async function motyqDealerSharedGateway(req:any,res:any){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'&&req.method!=='POST'){
  res.setHeader('Allow','GET, POST');
  return fail(res,405,'method_not_allowed');
 }
 if(!motyqFirestore.configured())return fail(res,503,'stock_cloud_unavailable');
 try{
  const actor=await authenticatedActor(req);
  if(!actor)return fail(res,401,'not_authenticated_or_inactive');
  if(!canReadDealerStock(actor))return fail(res,403,'not_authorized_for_iq_stock');
  const asked=String(req.method==='POST'?req.body?.companyId:req.query?.companyId||'').trim();
  const ownCompany=safeCompany(actor.companyId||'abrao-reze');
  const company=safeCompany(asked||ownCompany);
  if(actor.role!=='admin'&&company!==ownCompany)return fail(res,403,'company_scope_forbidden');
  if(req.method==='GET'){
   const result=await loadDealerShared(company);
   return res.status(200).json({shared:result});
  }
  if(!canPublishDealerStock(actor))return fail(res,403,'not_authorized_to_publish_stock');
  const published=await publishDealerShared(company,req.body?.snapshot,actor.email);
  return res.status(200).json({
   ok:true,revision:published.revision,publishedAt:published.publishedAt,
   count:published.current.vehicles.length,reportDate:published.current.reportDate
  });
 }catch(error:any){
  const reason=String(error?.message||error||'');
  const clientErrors=new Set(['company_scope_invalid','company_scope_mismatch','invalid_snapshot',
   'invalid_vehicle_count','invalid_report_date','invalid_vehicle_row','stock_too_large','stock_chunk_too_large']);
  if(reason==='older_report_rejected')return fail(res,409,'older_report_rejected');
  if(clientErrors.has(reason))return fail(res,400,reason);
  if(/firestore_429|resource.exhausted|quota/i.test(reason)){
   res.setHeader('Retry-After','180');
   return fail(res,503,'stock_cloud_quota_exceeded');
  }
  console.error('dealer_shared_api',reason.slice(0,150));
  return fail(res,503,'stock_cloud_temporarily_unavailable');
 }
}
