import React,{useEffect} from 'react';
import type { User } from '../types';
import { errorMonitoringService } from '../services/errorMonitoringService';

const ErrorMonitoringBridge:React.FC<{user:User}>=({user})=>{
  useEffect(()=>{
    const onError=(event:ErrorEvent)=>{
      void errorMonitoringService.capture(user,{
        source:'window.error',message:event.message||String(event.error||'Erro de execução'),
        stack:event.error?.stack,url:event.filename||location.href,
        details:event.lineno?`linha ${event.lineno}:${event.colno||0}`:'',
      }).catch(()=>undefined);
    };
    const onRejection=(event:PromiseRejectionEvent)=>{
      const reason:any=event.reason;
      void errorMonitoringService.capture(user,{
        source:'unhandledrejection',message:String(reason?.message||reason||'Promise rejeitada'),
        stack:String(reason?.stack||''),url:location.href,
      }).catch(()=>undefined);
    };
    const onMotyq=(event:Event)=>{
      const detail=(event as CustomEvent<any>).detail||{};
      void errorMonitoringService.capture(user,{
        source:`react:${detail.module||'unknown'}`,message:String(detail.message||'Erro de renderização'),
        stack:String(detail.stack||''),details:String(detail.componentStack||''),url:location.href,
      }).catch(()=>undefined);
    };
    window.addEventListener('error',onError);
    window.addEventListener('unhandledrejection',onRejection);
    window.addEventListener('motyq:client-error',onMotyq as EventListener);
    return()=>{
      window.removeEventListener('error',onError);
      window.removeEventListener('unhandledrejection',onRejection);
      window.removeEventListener('motyq:client-error',onMotyq as EventListener);
    };
  },[user.email,user.companyId,user.storeId,JSON.stringify(user.storeIds||[])]);
  return null;
};
export default ErrorMonitoringBridge;
