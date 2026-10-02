import { timingSafeEqual } from 'node:crypto';
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
const safe=(value:string)=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const sameToken=(a:string,b:string)=>{
  const aa=Buffer.from(a),bb=Buffer.from(b);
  return aa.length===bb.length&&timingSafeEqual(aa,bb);
};
const nextMonthly=(dueDate:string)=>{
  const base=/^\d{4}-\d{2}-\d{2}$/.test(dueDate)?new Date(dueDate+'T12:00:00'):new Date();
  const day=base.getDate();base.setDate(1);base.setMonth(base.getMonth()+1);
  base.setDate(Math.min(day,new Date(base.getFullYear(),base.getMonth()+1,0).getDate()));
  return `${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}-${String(base.getDate()).padStart(2,'0')}`;
};
const processWebhook=async(req:any)=>{
  const expected=String(process.env.ASAAS_WEBHOOK_TOKEN||'').trim();
  const supplied=String(req.headers?.['asaas-access-token']||'').trim();
  if(!expected||!supplied||!sameToken(expected,supplied))return{status:401,body:{error:'invalid_webhook_token'}};

  const body=req.body||{};
  const eventId=String(body.id||'').trim();
  const event=String(body.event||'').trim();
  const payment=body.payment||{};
  if(!eventId||!event)return{status:400,body:{error:'invalid_event'}};
  const eventDocId=safe(`asaas_event_${eventId}`);
  if(await motyqFirestore.get('operational_meta',eventDocId).catch(()=>null)){
    return{status:200,body:{ok:true,duplicate:true}};
  }

  const companies=await getCompanies();
  const subscriptionId=String(payment.subscription||body.subscription?.id||'').trim();
  const externalReference=String(payment.externalReference||body.subscription?.externalReference||'').trim();
  const index=companies.findIndex((company:any)=>
    (externalReference&&String(company?.id||'')===externalReference) ||
    (subscriptionId&&String(company?.billing?.externalSubscriptionId||'')===subscriptionId)
  );

  await motyqFirestore.patch('operational_meta',eventDocId,{
    id:eventDocId,kind:'billing_event',companyId:index>=0?String(companies[index].id):'unknown',
    storeId:'billing',provider:'asaas',eventId,event,paymentId:String(payment.id||''),
    subscriptionId,amount:Number(payment.value||0),dueDate:String(payment.dueDate||''),
    receivedAt:new Date().toISOString(),payload:body,
  });

  if(index<0)return{status:200,body:{ok:true,unmatched:true}};
  const company=companies[index];
  const billing=company.billing||{};
  const paid=['PAYMENT_RECEIVED','PAYMENT_CONFIRMED'].includes(event);
  const overdue=event==='PAYMENT_OVERDUE';
  const paymentUrl=String(payment.invoiceUrl||payment.bankSlipUrl||billing.paymentUrl||'').trim();
  const nextBilling={
    ...billing,enabled:true,provider:'asaas',
    ...(paymentUrl?{paymentUrl}:{}),
    ...(paid?{
      lastPaidAt:new Date().toISOString(),
      nextDueAt:nextMonthly(String(payment.dueDate||billing.nextDueAt||new Date().toISOString().slice(0,10))),
      manualBlocked:false,manualGraceUntil:'',
    }:{}),
    ...(overdue&&payment.dueDate?{nextDueAt:String(payment.dueDate).slice(0,10)}:{}),
    updatedAt:new Date().toISOString(),
  };
  companies[index]={...company,billing:nextBilling};
  await saveCompanies(companies);
  const users=await motyqFirestore.query('users',[{field:'companyId',value:String(company.id)}],250).catch(()=>[]);
  await Promise.all(users.map((user:any)=>motyqFirestore.patch('users',String(user.id||user.email),{
    companyBilling:nextBilling,companyPlan:company.plan,companyStatus:company.status,
  }).catch(()=>undefined)));
  return{status:200,body:{ok:true,event,companyId:company.id}};
};


const focusTokens=()=>{
  const direct=String(process.env.FOCUS_NFE_TOKEN||'').trim();
  let map:Record<string,string>={};
  try{
    const raw=String(process.env.FOCUS_NFE_TOKENS_JSON||'').trim();
    if(raw)map=JSON.parse(raw);
  }catch{}
  return{direct,map};
};
const focusEnvironment=(requested:any)=>{
  const value=String(requested||process.env.FOCUS_NFE_ENVIRONMENT||'homologacao').toLowerCase();
  return value==='producao'||value==='production'?'producao':'homologacao';
};
const focusTokenFor=(companyId:string)=>{
  const {direct,map}=focusTokens();
  return String(map?.[companyId]||direct||'').trim();
};
const focusBase=(environment:'homologacao'|'producao')=>environment==='producao'
  ?'https://api.focusnfe.com.br'
  :'https://homologacao.focusnfe.com.br';
const focusRequest=async(companyId:string,environment:'homologacao'|'producao',path:string,options:RequestInit={})=>{
  const token=focusTokenFor(companyId);
  if(!token)throw Object.assign(new Error('FOCUS_NFE_TOKEN_missing'),{status:503});
  const response=await fetch(focusBase(environment)+path,{
    ...options,
    headers:{
      accept:'application/json',
      authorization:`Basic ${Buffer.from(token+':').toString('base64')}`,
      ...(options.body?{'content-type':'application/json'}:{}),
      ...(options.headers||{}),
    },
  });
  const body:any=await response.json().catch(()=>({}));
  if(!response.ok){
    const msg=String(body?.mensagem_sefaz||body?.mensagem||body?.message||body?.erro||'request_failed');
    throw Object.assign(new Error(`focus_nfe_${response.status}_${msg}`),{status:response.status>=500?502:response.status,providerBody:body});
  }
  return body;
};
const fiscalStatus=(body:any)=>{
  const value=String(body?.status||body?.situacao||'').toLowerCase();
  if(['autorizado','authorized'].includes(value))return'authorized';
  if(value.includes('cancel'))return'cancelled';
  if(value.includes('erro')||value.includes('rejeit')||value.includes('deneg'))return'rejected';
  if(value.includes('process')||value.includes('pend'))return'pending';
  return value?'pending':'error';
};
const fiscalMessages=(body:any)=>{
  const out:Array<{code?:string;message:string}>=[];
  const add=(code:any,message:any)=>{const text=String(message||'').trim();if(text)out.push({...(code?{code:String(code)}:{}),message:text});};
  add(body?.status_sefaz,body?.mensagem_sefaz);
  add(body?.codigo,body?.mensagem);
  if(Array.isArray(body?.erros))body.erros.forEach((item:any)=>add(item?.codigo||item?.code,item?.mensagem||item?.message||item));
  if(Array.isArray(body?.errors))body.errors.forEach((item:any)=>add(item?.code,item?.message||item?.description||item));
  return out.slice(0,20);
};
const absoluteFocusUrl=(environment:'homologacao'|'producao',value:any)=>{
  const raw=String(value||'').trim();
  if(!raw)return'';
  if(/^https?:\/\//i.test(raw))return raw;
  return focusBase(environment)+(raw.startsWith('/')?'':'/')+raw;
};
const fiscalRecordFrom=(order:any,reference:string,environment:'homologacao'|'producao',body:any,prior:any={})=>{
  const stamp=new Date().toISOString();
  const status=fiscalStatus(body);
  const number=String(body?.numero||body?.numero_nfe||body?.numero_nf||prior?.invoiceNumber||'').trim();
  const series=String(body?.serie||body?.serie_nfe||prior?.series||'').trim();
  const accessKey=String(body?.chave_nfe||body?.chave||body?.chave_acesso||prior?.accessKey||'').trim();
  const protocol=String(body?.protocolo||body?.numero_protocolo||prior?.protocol||'').trim();
  const danfeUrl=absoluteFocusUrl(environment,body?.caminho_danfe||body?.url_danfe||body?.danfe_url||prior?.danfeUrl);
  const xmlUrl=absoluteFocusUrl(environment,body?.caminho_xml_nota_fiscal||body?.caminho_xml||body?.url_xml||prior?.xmlUrl);
  return{
    id:String(prior?.id||safe(`fiscal_${order.salesOrderId}`)),
    kind:'fiscal_invoice',
    companyId:String(order.companyId),storeId:String(order.storeId),
    salesOrderId:String(order.salesOrderId),vehicleId:order.vehicleId||'',plate:String(order.plate||''),
    provider:'focus_nfe',environment,status,providerDocumentId:reference,reference,
    invoiceNumber:number,series,accessKey,protocol,total:Number(order.netSalePrice)||0,
    danfeUrl,xmlUrl,messages:fiscalMessages(body),
    requestedAt:prior?.requestedAt||stamp,
    ...(status==='authorized'?{authorizedAt:prior?.authorizedAt||stamp}:{}),
    updatedAt:stamp,
    providerPayload:{
      status:body?.status||body?.situacao||'',
      statusSefaz:body?.status_sefaz||'',
      mensagemSefaz:body?.mensagem_sefaz||'',
      numero:body?.numero||body?.numero_nfe||'',
      serie:body?.serie||body?.serie_nfe||'',
      chave:body?.chave_nfe||body?.chave||body?.chave_acesso||'',
      protocolo:body?.protocolo||body?.numero_protocolo||'',
    },
  };
};
const fiscalActor=async(req:any)=>{
  const authHeader=String(req.headers?.authorization||'');
  const token=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
  if(!token)return null;
  const firebaseUser=await verifyFirebaseToken(token);
  const email=emailOf(firebaseUser?.email);
  if(!email)return null;
  if(email===OWNER_ADMIN)return{email,role:'admin',companyId:'*'};
  const profile:any=await motyqFirestore.get('users',email).catch(()=>null);
  if(profile?.status!=='active')return null;
  return{...profile,email};
};
const canFiscalOrder=(actor:any,order:any)=>{
  if(!actor||!order)return false;
  if(actor.role==='admin')return true;
  if(actor.role!=='manager')return false;
  if(String(actor.companyId||'')!==String(order.companyId||''))return false;
  const stores=Array.isArray(actor.storeIds)&&actor.storeIds.length?actor.storeIds:[actor.storeId];
  if(!stores.map(String).includes(String(order.storeId||'')))return false;
  const overrides=actor?.dmsPermissionOverrides||{};
  if(typeof overrides.salesView==='boolean')return overrides.salesView===true;
  const profile=String(actor.dmsAccessProfile||'');
  return !profile||profile==='management';
};
const fiscalOrder=async(id:string)=>{
  const direct=await motyqFirestore.get('operational_meta',id).catch(()=>null);
  if(direct?.kind==='sales_order')return direct;
  const list=await motyqFirestore.query('operational_meta',[{field:'salesOrderId',value:id}],20).catch(()=>[]);
  return list.find((item:any)=>item.kind==='sales_order')||null;
};
const fiscalRecord=async(order:any)=>{
  const id=safe(`fiscal_${order.salesOrderId}`);
  return await motyqFirestore.get('operational_meta',id).catch(()=>null);
};
const syncFiscalOrder=async(order:any,record:any)=>{
  await motyqFirestore.patch('operational_meta',String(order.id||order.salesOrderId),{
    fiscalInvoiceId:record.id,fiscalProvider:'focus_nfe',fiscalStatus:record.status,
    fiscalAccessKey:record.accessKey||'',fiscalExternalId:record.reference||'',
    fiscalDanfeUrl:record.danfeUrl||'',fiscalXmlUrl:record.xmlUrl||'',
    ...(record.invoiceNumber?{invoiceNumber:record.invoiceNumber}:{}),
    updatedAt:new Date().toISOString(),
  });
};
const handleFiscal=async(req:any)=>{
  if(req.method!=='POST')return{status:405,body:{error:'method_not_allowed'}};
  if(!motyqFirestore.configured())return{status:503,body:{error:'firebase_service_account_not_configured'}};
  const actor=await fiscalActor(req);
  if(!actor)return{status:403,body:{error:'active_user_required'}};
  const action=String(req.body?.action||'status');

  if(action==='status'){
    const companyId=String(req.body?.companyId||actor.companyId||'').trim();
    const environment=focusEnvironment(req.body?.environment);
    const configured=Boolean(companyId&&focusTokenFor(companyId));
    return{status:200,body:{ok:true,provider:'focus_nfe',configured,environment,missing:configured?[]:['FOCUS_NFE_TOKEN / FOCUS_NFE_TOKENS_JSON']}};
  }

  const salesOrderId=String(req.body?.salesOrderId||'').trim();
  if(!salesOrderId)return{status:400,body:{error:'sales_order_required'}};
  const order=await fiscalOrder(salesOrderId);
  if(!order)return{status:404,body:{error:'sales_order_not_found'}};
  if(!canFiscalOrder(actor,order))return{status:403,body:{error:'fiscal_order_forbidden'}};
  const environment=focusEnvironment(req.body?.environment);
  const reference=String(req.body?.reference||String(order.salesOrderId||'').replace(/[^a-zA-Z0-9]/g,'').slice(0,48)||Date.now()).trim();

  if(action==='issue'){
    if(!['ready_to_invoice','invoiced'].includes(String(order.status||'')))return{status:409,body:{error:'sales_order_not_ready_to_invoice'}};
    const payload=req.body?.payload&&typeof req.body.payload==='object'?req.body.payload:{};
    const required=[
      ['natureza_operacao',payload.natureza_operacao],
      ['data_emissao',payload.data_emissao],
      ['tipo_documento',payload.tipo_documento],
      ['finalidade_emissao',payload.finalidade_emissao],
      ['items',Array.isArray(payload.items)&&payload.items.length],
    ].filter(([,value])=>!value).map(([key])=>key);
    if(required.length)return{status:400,body:{error:'fiscal_payload_incomplete',missing:required}};
    if(Number(payload.valor_total||0)<=0)return{status:400,body:{error:'fiscal_total_required'}};
    const prior=await fiscalRecord(order);
    if(prior?.status==='authorized')return{status:200,body:{ok:true,record:prior,idempotent:true}};
    const body=await focusRequest(String(order.companyId),environment,`/v2/nfe?ref=${encodeURIComponent(reference)}`,{
      method:'POST',body:JSON.stringify(payload),
    });
    const record=fiscalRecordFrom(order,reference,environment,body,prior||{});
    await motyqFirestore.patch('operational_meta',record.id,record);
    await syncFiscalOrder(order,record);
    const auditId=safe(`audit_fiscal_${order.salesOrderId}_${Date.now()}`);
    await motyqFirestore.patch('operational_meta',auditId,{
      id:auditId,kind:'audit_event',companyId:order.companyId,storeId:order.storeId,
      entityType:'sale',entityId:order.salesOrderId,vehicleId:order.vehicleId||'',plate:order.plate||'',
      action:'fiscal_invoice_requested',label:'Emissão de NF-e solicitada via Focus NFe',
      details:`ref=${reference} · ambiente=${environment} · status=${record.status}`,
      amount:Number(order.netSalePrice)||0,at:new Date().toISOString(),actorEmail:actor.email,actorName:String(actor.name||actor.email),
    }).catch(()=>undefined);
    return{status:200,body:{ok:true,record}};
  }

  if(action==='query'){
    const prior=await fiscalRecord(order);
    const ref=String(prior?.reference||reference||'').trim();
    if(!ref)return{status:404,body:{error:'fiscal_reference_not_found'}};
    const body=await focusRequest(String(order.companyId),environment,`/v2/nfe/${encodeURIComponent(ref)}?completa=1`);
    const record=fiscalRecordFrom(order,ref,environment,body,prior||{});
    await motyqFirestore.patch('operational_meta',record.id,record);
    await syncFiscalOrder(order,record);
    return{status:200,body:{ok:true,record}};
  }

  if(action==='cancel'){
    const prior=await fiscalRecord(order);
    if(!prior||prior.status!=='authorized')return{status:409,body:{error:'authorized_invoice_required'}};
    const justification=String(req.body?.justification||'').trim();
    if(justification.length<15||justification.length>255)return{status:400,body:{error:'cancellation_justification_15_255'}};
    const body=await focusRequest(String(order.companyId),environment,`/v2/nfe/${encodeURIComponent(prior.reference)}`,{
      method:'DELETE',body:JSON.stringify({justificativa:justification}),
    });
    const record={...fiscalRecordFrom(order,prior.reference,environment,body,prior),status:'cancelled',updatedAt:new Date().toISOString()};
    await motyqFirestore.patch('operational_meta',record.id,record);
    await syncFiscalOrder(order,record);
    const auditId=safe(`audit_fiscal_cancel_${order.salesOrderId}_${Date.now()}`);
    await motyqFirestore.patch('operational_meta',auditId,{
      id:auditId,kind:'audit_event',companyId:order.companyId,storeId:order.storeId,
      entityType:'sale',entityId:order.salesOrderId,vehicleId:order.vehicleId||'',plate:order.plate||'',
      action:'fiscal_invoice_cancelled',label:'NF-e cancelada via Focus NFe',details:justification,
      at:new Date().toISOString(),actorEmail:actor.email,actorName:String(actor.name||actor.email),
    }).catch(()=>undefined);
    return{status:200,body:{ok:true,record}};
  }

  return{status:400,body:{error:'unsupported_fiscal_action'}};
};

export default async function handler(req:any,res:any){
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'method_not_allowed'});
  }
  if(!motyqFirestore.configured())return res.status(503).json({error:'firebase_service_account_not_configured'});
  try{
    const domain=String(req.body?.domain||'billing').toLowerCase();
    if(domain==='fiscal'){
      const result=await handleFiscal(req);
      return res.status(result.status).json(result.body);
    }
    const isWebhook=Boolean(req.body?.event)||Boolean(req.headers?.['asaas-access-token']);
    if(isWebhook){
      const result=await processWebhook(req);
      return res.status(result.status).json(result.body);
    }
    const actor=await adminActor(req);
    if(!actor)return res.status(403).json({error:'admin_required'});
    const action=String(req.body?.action||'create-subscription');
    if(action==='status'){
      const apiKey=String(process.env.ASAAS_API_KEY||'').trim();
      const webhookToken=String(process.env.ASAAS_WEBHOOK_TOKEN||'').trim();
      return res.status(200).json({
        ok:true,provider:'asaas',
        environment:String(process.env.ASAAS_ENVIRONMENT||'sandbox'),
        configured:Boolean(apiKey&&webhookToken),
        missing:[...(!apiKey?['ASAAS_API_KEY']:[]),...(!webhookToken?['ASAAS_WEBHOOK_TOKEN']:[])],
      });
    }
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
