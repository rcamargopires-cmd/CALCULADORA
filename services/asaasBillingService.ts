import { auth } from '../firebase';
import type { Company } from '../types';

export const asaasBillingService={
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
