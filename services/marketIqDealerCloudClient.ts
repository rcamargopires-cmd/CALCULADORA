/**
 * Same-origin authenticated client for the company's shared Dealer snapshots.
 * The local cache is only a fallback, not the canonical company inventory.
 */
import {auth} from '../firebase';
import type {DealerStockSnapshot} from './marketIqDealerRadar';
export type DealerCloudArchive={
 current:DealerStockSnapshot;previous:DealerStockSnapshot|null;
 publishedAt:string;revision:string;publishedBy:string;
};
const URL='/api/analyze-deal?action=dealer-stock';
const message=(code:string)=>({
 not_authenticated_or_inactive:'Sua sessão Firebase não foi reconhecida. Entre novamente no Motyq.',
 not_authenticated:'Sua sessão Firebase expirou ou não está ativa. Entre novamente no Motyq.',
 inactive_or_missing_user:'Seu usuário não possui cadastro ativo na empresa. Peça ao gestor para conferir seu acesso.',
 profile_verification_unavailable:'O servidor não conseguiu verificar seu perfil. Seus dados locais foram preservados.',
 not_authorized_for_iq_stock:'Seu perfil não tem acesso ao estoque da Mesa.',
 not_authorized_to_publish_stock:'Seu perfil pode consultar, mas não publicar o estoque compartilhado.',
 company_scope_forbidden:'Não é permitido consultar o estoque de outra empresa.',
 older_report_rejected:'Este arquivo é anterior à fotografia publicada. O estoque compartilhado não foi substituído.',
 stock_cloud_quota_exceeded:'O banco de dados atingiu temporariamente o limite de consultas.',
 stock_cloud_unavailable:'O compartilhamento está temporariamente indisponível.',
 stock_cloud_temporarily_unavailable:'Não foi possível consultar o estoque compartilhado agora.',
 stock_too_large:'O relatório é grande demais para publicação. Gere uma planilha menor.'
} as Record<string,string>)[code]||'A sincronização do estoque não foi concluída.';
async function request<T>(companyId:string,method:'GET'|'POST',snapshot?:DealerStockSnapshot):Promise<T>{
 await auth.authStateReady();
 const user=auth.currentUser;
 if(!user)throw Error('Entre na sua conta para sincronizar o estoque Dealer.');
 const token=await user.getIdToken();
 const params=method==='GET'?'&companyId='+encodeURIComponent(companyId):'';
 const response=await fetch(URL+params,{
  method,cache:'no-store',signal:AbortSignal.timeout(15000),
  headers:{Authorization:'Bearer '+token,...(method==='POST'?{'Content-Type':'application/json'}:{})},
  ...(method==='POST'?{body:JSON.stringify({companyId,snapshot})}:{})
 });
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error(message(String(payload?.error||''))),{status:response.status});
 return payload as T;
}
export async function getDealerCloudArchive(companyId:string):Promise<DealerCloudArchive|null>{
 const response=await request<{shared:DealerCloudArchive|null}>(companyId,'GET');
 return response.shared||null;
}
export async function publishDealerCloudArchive(
 companyId:string,snapshot:DealerStockSnapshot
):Promise<{revision:string;publishedAt:string;count:number;reportDate:string}>{
 return request(companyId,'POST',snapshot);
}
