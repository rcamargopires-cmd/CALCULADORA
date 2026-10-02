import { timingSafeEqual } from 'node:crypto';
import { motyqFirestore } from '../server/motyqFirestore.js';

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

export default async function handler(req:any,res:any){
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'method_not_allowed'});
  }
  if(!motyqFirestore.configured())return res.status(503).json({error:'firebase_service_account_not_configured'});
  try{
    const expected=String(process.env.ASAAS_WEBHOOK_TOKEN||'').trim();
    const supplied=String(req.headers?.['asaas-access-token']||'').trim();
    if(!expected||!supplied||!sameToken(expected,supplied))return res.status(401).json({error:'invalid_webhook_token'});

    const body=req.body||{};
    const eventId=String(body.id||'').trim();
    const event=String(body.event||'').trim();
    const payment=body.payment||{};
    if(!eventId||!event)return res.status(400).json({error:'invalid_event'});
    const eventDocId=safe(`asaas_event_${eventId}`);
    if(await motyqFirestore.get('operational_meta',eventDocId).catch(()=>null)){
      return res.status(200).json({ok:true,duplicate:true});
    }

    const config:any=await motyqFirestore.get('config','companies');
    const companies=Array.isArray(config?.companies)?config.companies:[];
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

    if(index<0)return res.status(200).json({ok:true,unmatched:true});

    const company=companies[index];
    const billing=company.billing||{};
    const paid=['PAYMENT_RECEIVED','PAYMENT_CONFIRMED'].includes(event);
    const overdue=event==='PAYMENT_OVERDUE';
    const paymentUrl=String(payment.invoiceUrl||payment.bankSlipUrl||billing.paymentUrl||'').trim();
    const nextBilling={
      ...billing,enabled:true,provider:'asaas',
      ...(paymentUrl?{paymentUrl}:{}),
      ...(paid?{
        lastPaidAt:new Date().toISOString(),nextDueAt:nextMonthly(String(payment.dueDate||billing.nextDueAt||new Date().toISOString().slice(0,10))),
        manualBlocked:false,manualGraceUntil:'',
      }:{}),
      ...(overdue&&payment.dueDate?{nextDueAt:String(payment.dueDate).slice(0,10)}:{}),
      updatedAt:new Date().toISOString(),
    };
    companies[index]={...company,billing:nextBilling};
    await motyqFirestore.patch('config','companies',{companies,updatedAt:new Date().toISOString()});

    const users=await motyqFirestore.query('users',[{field:'companyId',value:String(company.id)}],250).catch(()=>[]);
    await Promise.all(users.map((user:any)=>motyqFirestore.patch('users',String(user.id||user.email),{
      companyBilling:nextBilling,companyPlan:company.plan,companyStatus:company.status,
    }).catch(()=>undefined)));

    return res.status(200).json({ok:true,event,companyId:company.id});
  }catch(error:any){
    console.error('MOTYQ Asaas webhook error',error?.message||error);
    return res.status(500).json({error:'asaas_webhook_failed'});
  }
}
