import { auth } from '../firebase';

export type ProductionReadiness={
  serverFirebase:boolean;
  asaas:{configured:boolean;apiKey:boolean;webhookToken:boolean;environment:string;missing:string[]};
  fiscal:{configured:boolean;companyId:string;environment:string;provider:string;missing:string[]};
  external:{githubFirebaseSecret:string;firstBackup:string;oemCredentials:string};
};

export const productionReadinessService={
  check:async(companyId:string,fiscalEnvironment='homologacao'):Promise<ProductionReadiness>=>{
    const token=await auth.currentUser?.getIdToken();
    if(!token)throw new Error('Sessão administrativa expirada.');
    const response=await fetch('/api/integrations',{
      method:'POST',
      headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
      body:JSON.stringify({domain:'readiness',companyId,fiscalEnvironment}),
    });
    const body:any=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(String(body?.error||'Não foi possível executar o pré-voo de produção.'));
    return body as ProductionReadiness;
  },
};
