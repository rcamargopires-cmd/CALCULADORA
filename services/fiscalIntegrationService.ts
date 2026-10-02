import { auth } from '../firebase';
import type { FiscalInvoiceRecord, SalesOrder } from '../types';

const request=async(body:Record<string,unknown>)=>{
  const token=await auth.currentUser?.getIdToken();
  if(!token)throw new Error('Sessão expirada. Entre novamente para acessar o fiscal.');
  const response=await fetch('/api/integrations',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify({domain:'fiscal',...body}),
  });
  const data:any=await response.json().catch(()=>({}));
  if(!response.ok){
    const missing=Array.isArray(data?.missing)?` Campos: ${data.missing.join(', ')}.`:'';
    throw new Error(String(data?.error||'Falha na integração fiscal.')+missing);
  }
  return data;
};

export const fiscalIntegrationService={
  status:async(companyId:string,environment:'homologacao'|'producao')=>{
    return request({action:'status',companyId,environment});
  },

  issue:async(order:SalesOrder,environment:'homologacao'|'producao',payload:Record<string,unknown>):Promise<FiscalInvoiceRecord>=>{
    const data=await request({
      action:'issue',salesOrderId:order.salesOrderId,environment,
      reference:String(order.salesOrderId||'').replace(/[^a-zA-Z0-9]/g,'').slice(0,48),
      payload,
    });
    return data.record as FiscalInvoiceRecord;
  },

  query:async(order:SalesOrder,environment:'homologacao'|'producao'):Promise<FiscalInvoiceRecord>=>{
    const data=await request({action:'query',salesOrderId:order.salesOrderId,environment});
    return data.record as FiscalInvoiceRecord;
  },

  cancel:async(order:SalesOrder,environment:'homologacao'|'producao',justification:string):Promise<FiscalInvoiceRecord>=>{
    const data=await request({action:'cancel',salesOrderId:order.salesOrderId,environment,justification});
    return data.record as FiscalInvoiceRecord;
  },
};
