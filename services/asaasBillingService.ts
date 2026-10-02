import { auth } from '../firebase';
import type { Company } from '../types';

export const asaasBillingService={
  status:async()=>{
    const token=await auth.currentUser?.getIdToken();
    if(!token)throw new Error('Sessão administrativa expirada.');
    const response=await fetch('/api/integrations',{
      method:'POST',
      headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
      body:JSON.stringify({domain:'billing',action:'status'}),
    });
    const body:any=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(String(body?.error||'Não foi possível verificar a integração Asaas.'));
    return body;
  },

  updateSubscription:async(input:{companyId:string;amount:number;plan:string;nextDueDate?:string;updatePendingPayments?:boolean})=>{
    const token=await auth.currentUser?.getIdToken();
    if(!token)throw new Error('Sessão administrativa expirada.');
    const response=await fetch('/api/integrations',{
      method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
      body:JSON.stringify({domain:'billing',action:'update-subscription',...input}),
    });
    const body:any=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(String(body?.error||'Não foi possível atualizar a assinatura Asaas.'));
    return body;
  },

  setSubscriptionStatus:async(input:{companyId:string;status:'ACTIVE'|'INACTIVE';nextDueDate?:string})=>{
    const token=await auth.currentUser?.getIdToken();
    if(!token)throw new Error('Sessão administrativa expirada.');
    const response=await fetch('/api/integrations',{
      method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
      body:JSON.stringify({domain:'billing',action:'set-subscription-status',...input}),
    });
    const body:any=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(String(body?.error||'Não foi possível alterar a assinatura Asaas.'));
    return body;
  },

  createSubscription:async(input:{
    company:Company;
    payer:{name:string;cpfCnpj:string;email?:string;mobilePhone?:string};
    amount:number;
    nextDueDate:string;
    billingType?:'UNDEFINED'|'BOLETO'|'PIX';
  })=>{
    const token=await auth.currentUser?.getIdToken();
    if(!token)throw new Error('Sessão administrativa expirada.');
    const response=await fetch('/api/integrations',{
      method:'POST',
      headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
      body:JSON.stringify({
        domain:'billing',action:'create-subscription',companyId:input.company.id,payer:input.payer,
        amount:input.amount,nextDueDate:input.nextDueDate,billingType:input.billingType||'UNDEFINED',
      }),
    });
    const body:any=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(String(body?.error||'Não foi possível ativar a cobrança recorrente.'));
    return body;
  },
};
