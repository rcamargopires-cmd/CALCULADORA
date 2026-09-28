import { motyqFirestore } from '../server/motyqFirestore';

const FIREBASE_API_KEY = 'AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q';
const OWNER_ADMIN = 'r.camargo.pires@gmail.com';
const MANAGER_ALLOWED_ROLES = new Set(['manager','seller','user','reception','evaluator']);

const emailOf=(value:any)=>String(value||'').trim().toLowerCase();
const companyOf=(value:any)=>String(value?.companyId||'abrao-reze').trim()||'abrao-reze';
const roleOf=(value:any)=>String(value?.role||'').trim();
const cleanUser=(raw:any)=>({
  id:emailOf(raw?.email||raw?.id),
  email:emailOf(raw?.email||raw?.id),
  name:String(raw?.name||'').trim(),
  role:String(raw?.role||'seller').trim(),
  status:raw?.status==='inactive'?'inactive':'active',
  createdAt:String(raw?.createdAt||new Date().toISOString()),
  companyId:String(raw?.companyId||'abrao-reze').trim()||'abrao-reze',
  storeId:String(raw?.storeId||'').trim(),
  ...(raw?.goals?{goals:raw.goals}:{}),
  ...(raw?.companyPlan?{companyPlan:raw.companyPlan}:{}),
  ...(raw?.companyStatus?{companyStatus:raw.companyStatus}:{}),
  ...(raw?.companyModuleOverrides?{companyModuleOverrides:raw.companyModuleOverrides}:{}),
});

const verifyFirebaseToken=async(idToken:string)=>{
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({idToken}),
  });
  if(!response.ok)return null;
  const data:any=await response.json().catch(()=>null);
  return data?.users?.[0]||null;
};

const actorFromRequest=async(req:any)=>{
  const authHeader=String(req.headers?.authorization||'');
  const token=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
  if(!token)return null;
  const firebaseUser=await verifyFirebaseToken(token);
  const email=emailOf(firebaseUser?.email);
  if(!email)return null;
  if(email===OWNER_ADMIN){
    const profile=await motyqFirestore.get('users',email).catch(()=>null);
    return profile?{...profile,email,role:'admin',status:'active'}:{email,id:email,name:'Admin',role:'admin',status:'active',companyId:'abrao-reze',storeId:'outlet-sorocaba'};
  }
  const profile:any=await motyqFirestore.get('users',email);
  if(!profile||profile.status!=='active')return null;
  return {...profile,email};
};

const ensureManagerScope=(actor:any,targetCompany:string)=>{
  const role=roleOf(actor);
  if(role!=='admin'&&role!=='manager')throw Object.assign(new Error('forbidden'),{status:403});
  const actorCompany=companyOf(actor);
  if(role==='manager'&&targetCompany!==actorCompany)throw Object.assign(new Error('cross_company_forbidden'),{status:403});
};

const managementContext=async(actor:any,companyId:string)=>{
  ensureManagerScope(actor,companyId);
  const users=await motyqFirestore.query('users',[{field:'companyId',value:companyId}],250);
  const scope:any=await motyqFirestore.get('director_scope',companyId).catch(()=>null);
  let stores=Array.isArray(scope?.stores)?scope.stores.filter((item:any)=>String(item?.companyId||companyId)===companyId&&item?.active!==false):[];
  if(!stores.length){
    const multistore:any=await motyqFirestore.get('config','multistore').catch(()=>null);
    stores=Array.isArray(multistore?.stores)
      ? multistore.stores.filter((item:any)=>String(item?.companyId||'abrao-reze')===companyId&&item?.active!==false)
      : [];
  }
  return {companyId,users,stores};
};

export default async function handler(req:any,res:any){
  if(!['GET','POST','DELETE'].includes(req.method))return res.status(405).json({error:'method_not_allowed'});
  if(!motyqFirestore.configured())return res.status(503).json({error:'server_firestore_not_configured'});

  try{
    const actor:any=await actorFromRequest(req);
    if(!actor)return res.status(401).json({error:'not_authenticated'});
    const actorRole=roleOf(actor);
    if(actorRole!=='admin'&&actorRole!=='manager')return res.status(403).json({error:'forbidden'});

    if(req.method==='GET'){
      const requested=String(req.query?.companyId||'').trim();
      const companyId=actorRole==='admin'?(requested||companyOf(actor)):companyOf(actor);
      const context=await managementContext(actor,companyId);
      return res.status(200).json(context);
    }

    if(req.method==='POST'){
      const input=cleanUser(req.body?.user||{});
      if(!input.email||!input.name||!input.storeId)return res.status(400).json({error:'invalid_user'});
      const companyId=actorRole==='admin'?input.companyId:companyOf(actor);
      ensureManagerScope(actor,companyId);
      input.companyId=companyId;

      const existing:any=await motyqFirestore.get('users',input.email).catch(()=>null);
      if(actorRole==='manager'){
        if(!MANAGER_ALLOWED_ROLES.has(input.role))return res.status(403).json({error:'role_forbidden'});
        if(existing){
          if(companyOf(existing)!==companyId)return res.status(403).json({error:'cross_company_forbidden'});
          if(!MANAGER_ALLOWED_ROLES.has(roleOf(existing)))return res.status(403).json({error:'protected_user'});
        }
      }

      const saved=await motyqFirestore.patch('users',input.email,input);
      return res.status(200).json({user:saved});
    }

    const targetEmail=emailOf(req.body?.email);
    if(!targetEmail)return res.status(400).json({error:'email_required'});
    if(targetEmail===emailOf(actor.email))return res.status(400).json({error:'cannot_delete_self'});
    const target:any=await motyqFirestore.get('users',targetEmail);
    if(!target)return res.status(404).json({error:'user_not_found'});
    if(actorRole==='manager'){
      if(companyOf(target)!==companyOf(actor))return res.status(403).json({error:'cross_company_forbidden'});
      if(!MANAGER_ALLOWED_ROLES.has(roleOf(target)))return res.status(403).json({error:'protected_user'});
    }
    await motyqFirestore.delete('users',targetEmail);
    return res.status(200).json({ok:true});
  }catch(error:any){
    const status=Number(error?.status)||500;
    console.error('User management API failed',error?.message||error);
    return res.status(status).json({error:String(error?.message||'user_management_failed')});
  }
}
