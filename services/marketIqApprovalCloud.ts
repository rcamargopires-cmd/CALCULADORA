/**
 * GATED Firebase adapter for manager approvals.
 *
 * Disabled by default. Do NOT set VITE_MARKETIQ_APPROVALS_CLOUD=true until
 * the matching Firestore rules have been validated and promoted consciously.
 * Dedicated preview namespace; no writes to production operational collections.
 */
import {
 collection,doc,getDoc,onSnapshot,query,runTransaction,serverTimestamp,setDoc,
 where,type Unsubscribe
} from 'firebase/firestore';
import {db} from '../firebase';
import type {ApprovalActor,ApprovalDecision,ManagerApproval} from './marketIqApprovalModel';
import {applyManagerDecision,normalizedEmail} from './marketIqApprovalModel';

export const CLOUD_APPROVALS_ENABLED=(import.meta as ImportMeta & {env?:Record<string,string|undefined>}).env?.VITE_MARKETIQ_APPROVALS_CLOUD==='true';
const COLLECTION='marketiq_preview_approvals_v1';

export const publishApprovalRequest = async (request:ManagerApproval):Promise<void> => {
 if(!CLOUD_APPROVALS_ENABLED)throw Error('Compartilhamento em nuvem desativado neste ambiente.');
 if(request.demoOnly)throw Error('Solicitações de demonstração não podem ser publicadas.');
 if(request.status!=='pending'||request.revision!==1)throw Error('Somente solicitações novas podem ser enviadas.');
 const ref=doc(db,COLLECTION,request.id);
 await setDoc(ref,{...request,createdServerAt:serverTimestamp(),updatedServerAt:serverTimestamp()});
};

export const subscribeSharedApprovals=(
 actor:ApprovalActor,onChange:(rows:ManagerApproval[])=>void,onError:(e:Error)=>void
):Unsubscribe=>{
 if(!CLOUD_APPROVALS_ENABLED)throw Error('Compartilhamento em nuvem desativado.');
 const scope=query(collection(db,COLLECTION),
   where('companyId','==',actor.companyId),
   where('storeId','==',actor.storeId),
   ...(['manager','admin'].includes(actor.role)?[]:[where('requesterEmail','==',normalizedEmail(actor.email))])
 );
 return onSnapshot(scope,snapshot=>{
   onChange(snapshot.docs.map(d=>({...d.data(),id:d.id} as ManagerApproval))
     .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
 },e=>onError(e));
};
export const decideSharedApproval=async(
 actor:ApprovalActor,id:string,decision:ApprovalDecision,
 amount:number|null,reason:string
):Promise<void>=>{
 if(!CLOUD_APPROVALS_ENABLED)throw Error('Compartilhamento em nuvem desativado.');
 if(!['manager','admin'].includes(actor.role))throw Error('A decisão exige conta de gerente autenticada.');
 const target=doc(db,COLLECTION,id);
 await runTransaction(db,async tx=>{
   const stored=await tx.get(target);
   if(!stored.exists())throw Error('Solicitação não encontrada.');
   const old={...stored.data(),id:stored.id} as ManagerApproval;
   if(old.demoOnly)throw Error('Não é possível aprovar registros simulados.');
   const updated=applyManagerDecision(old,actor,decision,amount,reason);
   tx.update(target,{
     status:updated.status,revision:updated.revision,updatedAt:updated.updatedAt,
     decidedByEmail:updated.decidedByEmail,decidedByName:updated.decidedByName,
     decidedAt:updated.decidedAt,decidedBuy:updated.decidedBuy??null,
     decisionReason:updated.decisionReason,events:updated.events,
     updatedServerAt:serverTimestamp(),decidedServerAt:serverTimestamp(),
   });
 });
};
