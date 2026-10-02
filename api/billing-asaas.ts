import { motyqFirestore } from '../server/motyqFirestore.js';

const FIREBASE_API_KEY='AIzaSyAZ5AjBE71pZOcCtKE7ZM8V14I7DNnf0-Q';
const OWNER_ADMIN='r.camargo.pires@gmail.com';

const emailOf=(value:any)=>String(value||'').trim().toLowerCase();
const digits=(value:any,max=20)=>String(value||'').replace(/\D/g,'').slice(0,max);
const isoDate=(value:any)=>{
  const raw=String(value||'').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  return new Date().toISOString().slice(0,10);
};
const addMonth=(date:string)=>{
  const base=new Date(date+'T12:00:00');
  const day=base.getDate();
  base.setDate(1);base.setMonth(base.getMonth()+1);
  const last=new Date(base.getFullYear(),base.getMonth()+1,0).getDate();
  base.setDate(Math.min(day,last));
  return `${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}-${String(base.getDate()).padStart(2,'0')}`;
};

const verifyFirebaseToken=async(idToken:string)=>{
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken}),
  });
  if(!response.ok)return null;
  const data:any=await response.json().catch(()=>({}));
  return data?.users?.[0]||null;
};

const adminActor=async(req:any)=>{
  const authHeader=String(req.headers?.authorization||'');
  const token=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
  if(!token)return null;
  const firebaseUser=await verifyFirebaseToken(token);
  const email=emailOf(firebaseUser?.email);
  if(!email)return null;
  if(email===OWNER_ADMIN)return{email,role:'admin'};
  const profile:any=await motyqFirestore.get('users',email).catch(()=>null);
  return profile?.status==='active'&&profile?.role==='admin'?{...profile,email}:null;
};

const baseUrl=()=>{
  const sandbox=String(process.env.ASAAS_ENVIRONMENT||'sandbox').toLowerCase()!=='production';
  return sandbox?'https://api-sandbox.asaas.com/v3':'https://api.asaas.com/v3';
};
const asaas=async(path:string,options:RequestInit={})=>{
  const apiKey=String(process.env.ASAAS_API_KEY||'').trim();
  if(!apiKey)throw Object.assign(new Error('ASAAS_API_KEY_missing'),{status:503});
  const response=await fetch(baseUrl()+path,{
    ...options,
    headers:{
      accept:'application/json','content-type':'application/json',
      access_token:apiKey,'User-Agent':'MOTYQ/1.0',
      ...(options.headers||{}),
    },
  });
  const body:any=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(`asaas_${response.status}_${body?.errors?.[0]?.description||body?.message||'request_failed'}`),{status:502});
  return body;
};

const getCompanies=async()=>{
  const config:any=await motyqFirestore.get('config','companies');
  return Array.isArray(config?.companies)?config.companies:[];
};
const saveCompanies=(companies:any[])=>motyqFirestore.patch('config','companies',{companies,updatedAt:new Date().toISOString()});

export default async function handler(req:any,res:any){
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'method_not_allowed'});
  }
  if(!motyqFirestore.configured())return res.status(503).json({error:'firebase_service_account_not_configured'});
  try{
    const actor=await adminActor(req);
    if(!actor)return res.status(403).json({error:'admin_required'});
    const action=String(req.body?.action||'create-subscription');
    if(action!=='create-subscription')return res.status(400).json({error:'unsupported_action'});

    const companyId=String(req.body?.companyId||'').trim();
    const payer=req.body?.payer||{};
    const amount=Math.max(1,Number(req.body?.amount)||0);
    const nextDueDate=isoDate(req.body?.nextDueDate);
    const billingType=['UNDEFINED','BOLETO','PIX'].includes(String(req.body?.billingType||'UNDEFINED'))?String(req.body.billingType||'UNDEFINED'):'UNDEFINED';
    if(!companyId||!payer?.name||![11,14].includes(digits(payer?.cpfCnpj,14).length)){
      return res.status(400).json({error:'company_payer_document_required'});
    }

    const companies=await getCompanies();
    const index=companies.findIndex((item:any)=>String(item?.id||'')===companyId);
    if(index<0)return res.status(404).json({error:'company_not_found'});
    const company=companies[index];
    const billing=company.billing||{};
    let customerId=String(billing.externalCustomerId||'').trim();

    if(!customerId){
      const customer=await asaas('/customers',{
        method:'POST',
        body:JSON.stringify({
          name:String(payer.name).trim(),cpfCnpj:digits(payer.cpfCnpj,14),
          ...(emailOf(payer.email)?{email:emailOf(payer.email)}:{}),
          ...(digits(payer.mobilePhone)?{mobilePhone:digits(payer.mobilePhone)}:{}),
          externalReference:companyId,notificationDisabled:false,
        }),
      });
      customerId=String(customer?.id||'');
      if(!customerId)throw new Error('asaas_customer_id_missing');
    }

    let subscriptionId=String(billing.externalSubscriptionId||'').trim();
    if(!subscriptionId){
      const subscription=await asaas('/subscriptions',{
        method:'POST',
        body:JSON.stringify({
          customer:customerId,billingType,value:amount,nextDueDate,cycle:'MONTHLY',
          description:`MOTYQ · Plano ${String(company.plan||'pro').toUpperCase()}`,
          externalReference:companyId,
        }),
      });
      subscriptionId=String(subscription?.id||'');
      if(!subscriptionId)throw new Error('asaas_subscription_id_missing');
    }

    const nextCompany={
      ...company,
      billing:{
        ...billing,enabled:true,provider:'asaas',
        externalCustomerId:customerId,externalSubscriptionId:subscriptionId,
        nextDueAt:nextDueDate,dueDay:Number(nextDueDate.slice(-2))||10,
        manualBlocked:false,updatedAt:new Date().toISOString(),
      },
    };
    companies[index]=nextCompany;
    await saveCompanies(companies);

    const users=await motyqFirestore.query('users',[{field:'companyId',value:companyId}],250).catch(()=>[]);
    await Promise.all(users.map((user:any)=>motyqFirestore.patch('users',String(user.id||user.email),{
      companyBilling:nextCompany.billing,companyPlan:nextCompany.plan,companyStatus:nextCompany.status,
    }).catch(()=>undefined)));

    const auditId=`audit_billing_${companyId}_${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g,'-');
    await motyqFirestore.patch('operational_meta',auditId,{
      id:auditId,kind:'audit_event',companyId,storeId:String(users[0]?.storeId||'billing'),
      entityType:'system',entityId:companyId,action:'asaas_subscription_created',
      label:'Cobrança recorrente Asaas ativada',details:`assinatura=${subscriptionId} · valor=${amount} · próximo=${nextDueDate}`,
      at:new Date().toISOString(),actorEmail:actor.email,actorName:'Administrador MOTYQ',
    }).catch(()=>undefined);

    return res.status(200).json({
      ok:true,provider:'asaas',customerId,subscriptionId,nextDueDate,nextCycleDueDate:addMonth(nextDueDate),
      environment:String(process.env.ASAAS_ENVIRONMENT||'sandbox'),
    });
  }catch(error:any){
    console.error('MOTYQ Asaas billing error',error?.message||error);
    return res.status(Number(error?.status)||500).json({error:String(error?.message||'asaas_billing_failed')});
  }
}
