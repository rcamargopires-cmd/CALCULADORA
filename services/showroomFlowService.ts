import { collection, doc, getDoc, onSnapshot, query, runTransaction, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { ShowroomPassage, ShowroomPassageStatus, ShowroomQueueSeller, ShowroomQueueState, User } from '../types';

const cleanPhone=(value:string)=>String(value||'').replace(/\D/g,'').slice(0,15);
const queueId=(companyId:string,storeId:string)=>`${companyId}_${storeId}`.replace(/[^a-zA-Z0-9_-]/g,'-');
const now=()=>new Date().toISOString();
const passageRef=()=>doc(collection(db,'showroom_passages'));

const normalizeQueue=(data:any,companyId:string,storeId:string):ShowroomQueueState=>({
  id:queueId(companyId,storeId),
  companyId,
  storeId,
  sellers:Array.isArray(data?.sellers)?data.sellers:[],
  nextIndex:Number.isFinite(Number(data?.nextIndex))?Number(data.nextIndex):0,
  updatedAt:String(data?.updatedAt||now()),
});

export const showroomFlowService={
  subscribeQueue:(companyId:string,storeId:string,onData:(queue:ShowroomQueueState|null)=>void,onError?:(error:any)=>void)=>{
    return onSnapshot(doc(db,'showroom_queue',queueId(companyId,storeId)),snap=>onData(snap.exists()?normalizeQueue(snap.data(),companyId,storeId):null),onError);
  },

  subscribeStorePassages:(companyId:string,storeId:string,onData:(items:ShowroomPassage[])=>void,onError?:(error:any)=>void)=>{
    const q=query(collection(db,'showroom_passages'),where('companyId','==',companyId),where('storeId','==',storeId));
    return onSnapshot(q,snap=>onData(snap.docs.map(item=>item.data() as ShowroomPassage).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))),onError);
  },

  subscribeSellerPassages:(companyId:string,storeId:string,email:string,onData:(items:ShowroomPassage[])=>void,onError?:(error:any)=>void)=>{
    const q=query(collection(db,'showroom_passages'),where('companyId','==',companyId),where('storeId','==',storeId),where('assignedSellerEmail','==',email));
    return onSnapshot(q,snap=>onData(snap.docs.map(item=>item.data() as ShowroomPassage).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))),onError);
  },

  syncQueue:async(companyId:string,storeId:string,users:User[]):Promise<ShowroomQueueState>=>{
    const ref=doc(db,'showroom_queue',queueId(companyId,storeId));
    const currentSnap=await getDoc(ref);
    const current=currentSnap.exists()?normalizeQueue(currentSnap.data(),companyId,storeId):null;
    const eligible=users.filter(user=>user.status==='active'&&(user.role==='seller'||user.role==='user'));
    const previous=new Map((current?.sellers||[]).map(seller=>[seller.email.toLowerCase(),seller]));
    const orderedExisting=(current?.sellers||[]).filter(existing=>eligible.some(user=>user.email.toLowerCase()===existing.email.toLowerCase())).map(existing=>{
      const fresh=eligible.find(user=>user.email.toLowerCase()===existing.email.toLowerCase())!;
      return {...existing,id:fresh.id,email:fresh.email,name:fresh.name};
    });
    const newOnes=eligible.filter(user=>!previous.has(user.email.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name)).map(user=>({id:user.id,email:user.email,name:user.name,available:true}));
    const sellers=[...orderedExisting,...newOnes];
    const next:ShowroomQueueState={id:queueId(companyId,storeId),companyId,storeId,sellers,nextIndex:sellers.length?Math.min(current?.nextIndex||0,sellers.length-1):0,updatedAt:now()};
    await setDoc(ref,next,{merge:false});
    return next;
  },

  setSellerAvailability:async(companyId:string,storeId:string,email:string,available:boolean)=>{
    const ref=doc(db,'showroom_queue',queueId(companyId,storeId));
    const snap=await getDoc(ref);if(!snap.exists())return;
    const current=normalizeQueue(snap.data(),companyId,storeId);
    await updateDoc(ref,{sellers:current.sellers.map(seller=>seller.email.toLowerCase()===email.toLowerCase()?{...seller,available}:seller),updatedAt:now()});
  },

  moveSeller:async(companyId:string,storeId:string,email:string,direction:-1|1)=>{
    const ref=doc(db,'showroom_queue',queueId(companyId,storeId));
    const snap=await getDoc(ref);if(!snap.exists())return;
    const current=normalizeQueue(snap.data(),companyId,storeId);const index=current.sellers.findIndex(item=>item.email===email);const nextIndex=index+direction;if(index<0||nextIndex<0||nextIndex>=current.sellers.length)return;
    const sellers=[...current.sellers];[sellers[index],sellers[nextIndex]]=[sellers[nextIndex],sellers[index]];
    await updateDoc(ref,{sellers,updatedAt:now(),nextIndex:Math.min(current.nextIndex,Math.max(sellers.length-1,0))});
  },

  createPassage:async(input:{companyId:string;storeId:string;customerName:string;phone:string;interestModel:string;createdBy?:string;createdByName?:string}):Promise<ShowroomPassage>=>{
    const qRef=doc(db,'showroom_queue',queueId(input.companyId,input.storeId));
    const pRef=passageRef();
    return runTransaction(db,async tx=>{
      const qSnap=await tx.get(qRef);if(!qSnap.exists())throw new Error('Fila de vendedores ainda não configurada.');
      const queue=normalizeQueue(qSnap.data(),input.companyId,input.storeId);const available=queue.sellers.filter(item=>item.available);if(!available.length)throw new Error('Nenhum vendedor disponível na fila.');
      let selected:ShowroomQueueSeller|undefined;let selectedIndex=-1;
      for(let offset=0;offset<queue.sellers.length;offset+=1){const index=(queue.nextIndex+offset)%queue.sellers.length;const candidate=queue.sellers[index];if(candidate?.available){selected=candidate;selectedIndex=index;break;}}
      if(!selected)throw new Error('Nenhum vendedor disponível na fila.');
      const timestamp=now();
      const passage:ShowroomPassage={id:pRef.id,customerName:input.customerName.trim(),phone:cleanPhone(input.phone),interestModel:input.interestModel.trim(),assignedSellerId:selected.id,assignedSellerEmail:selected.email,assignedSellerName:selected.name,status:'waiting',createdAt:timestamp,updatedAt:timestamp,createdBy:input.createdBy||'',createdByName:input.createdByName||'',companyId:input.companyId,storeId:input.storeId};
      tx.set(pRef,passage);tx.update(qRef,{nextIndex:(selectedIndex+1)%Math.max(queue.sellers.length,1),updatedAt:timestamp});return passage;
    });
  },

  updatePassage:async(id:string,patch:Partial<Pick<ShowroomPassage,'status'|'notes'|'assumedAt'|'closedAt'>>)=>{
    await updateDoc(doc(db,'showroom_passages',id),{...patch,updatedAt:now()});
  },

  assumePassage:async(item:ShowroomPassage)=>{
    const timestamp=now();
    await updateDoc(doc(db,'showroom_passages',item.id),{status:'in_service' as ShowroomPassageStatus,assumedAt:item.assumedAt||timestamp,updatedAt:timestamp});
  },

  finishPassage:async(item:ShowroomPassage,status:Exclude<ShowroomPassageStatus,'waiting'|'in_service'>,notes?:string)=>{
    const timestamp=now();
    await updateDoc(doc(db,'showroom_passages',item.id),{status,notes:notes||item.notes||'',closedAt:['sale','no_deal'].includes(status)?timestamp:(item.closedAt||''),updatedAt:timestamp});
  }
};