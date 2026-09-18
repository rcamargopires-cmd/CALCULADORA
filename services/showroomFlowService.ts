import { arrayUnion, collection, doc, getDoc, getDocs, onSnapshot, query, runTransaction, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { CrmLeadSource, CrmLeadTemperature, ShowroomPassage, ShowroomPassageActivity, ShowroomPassageOrigin, ShowroomPassageStatus, ShowroomQueueAudit, ShowroomQueuePause, ShowroomQueueReason, ShowroomQueueSeller, ShowroomQueueState, User } from '../types';

const cleanPhone=(value:string)=>String(value||'').replace(/\D/g,'').slice(0,15);
const queueId=(companyId:string,storeId:string)=>`${companyId}_${storeId}`.replace(/[^a-zA-Z0-9_-]/g,'-');
const now=()=>new Date().toISOString();
const passageRef=()=>doc(collection(db,'showroom_passages'));
const auditId=()=>`${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const cleanEmail=(value:string)=>String(value||'').trim().toLowerCase();
const activity=(type:ShowroomPassageActivity['type'],label:string,details='',status?:ShowroomPassageStatus,byEmail='',byName=''):ShowroomPassageActivity=>({id:auditId(),type,at:now(),label,details,status,byEmail,byName});
const legacyOrigin=(value:any):ShowroomPassageOrigin=>value==='requested'?'requested':'walk_in';
const busyRequestedStatuses=new Set<ShowroomPassageStatus>(['waiting','in_service','evaluation','proposal']);
const localDateKey=(value:string|Date)=>{
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};
const isTodayLocal=(value?:string)=>Boolean(value)&&localDateKey(String(value))===localDateKey(new Date());

const normalizePassage=(data:any):ShowroomPassage=>({
  ...data,
  origin:legacyOrigin(data?.origin),
} as ShowroomPassage);

const isVisiblePassage=(item:ShowroomPassage)=>!Boolean((item as any)?.deletedAt);
const uniqueEmails=(values:string[])=>Array.from(new Set(values.map(cleanEmail).filter(Boolean)));

const normalizeQueue=(data:any,companyId:string,storeId:string):ShowroomQueueState=>{
  const sellers:Array<ShowroomQueueSeller>=Array.isArray(data?.sellers)?data.sellers:[];
  const validEmails=new Set(sellers.map(item=>cleanEmail(item.email)));
  const legacyIndex=Number.isFinite(Number(data?.nextIndex))?Math.max(0,Number(data.nextIndex)):0;
  const legacyOrder=sellers.length
    ? [...sellers.slice(legacyIndex%sellers.length),...sellers.slice(0,legacyIndex%sellers.length)].map(item=>cleanEmail(item.email))
    : [];
  const provided=Array.isArray(data?.turnOrder)?data.turnOrder.map(cleanEmail).filter((email:string)=>validEmails.has(email)):[];
  const turnOrder=uniqueEmails([...(provided.length?provided:legacyOrder),...sellers.map(item=>item.email)]).filter(email=>validEmails.has(email));
  return {
    id:queueId(companyId,storeId),
    companyId,
    storeId,
    sellers,
    nextIndex:0,
    turnOrder,
    pausedSellers:Array.isArray(data?.pausedSellers)?data.pausedSellers:[],
    excludedSellerEmails:Array.isArray(data?.excludedSellerEmails)?uniqueEmails(data.excludedSellerEmails):[],
    auditLog:Array.isArray(data?.auditLog)?data.auditLog:[],
    updatedAt:String(data?.updatedAt||now()),
  };
};

const pausedSet=(queue:ShowroomQueueState)=>new Set(queue.pausedSellers.map(item=>cleanEmail(item.email)));
const excludedSet=(queue:ShowroomQueueState)=>new Set(queue.excludedSellerEmails.map(cleanEmail));
const sellerAvailable=(queue:ShowroomQueueState,seller:ShowroomQueueSeller)=>seller.available&&!pausedSet(queue).has(cleanEmail(seller.email))&&!excludedSet(queue).has(cleanEmail(seller.email));
const sellerByEmail=(queue:ShowroomQueueState,email:string)=>queue.sellers.find(item=>cleanEmail(item.email)===cleanEmail(email));
const orderedSellerEmails=(queue:ShowroomQueueState)=>uniqueEmails([...queue.turnOrder,...queue.sellers.map(item=>item.email)]).filter(email=>Boolean(sellerByEmail(queue,email)));
const firstAvailableEmail=(queue:ShowroomQueueState,busyEmails:Set<string>=new Set())=>{
  for(const email of orderedSellerEmails(queue)){
    const seller=sellerByEmail(queue,email);
    if(seller&&sellerAvailable(queue,seller)&&!busyEmails.has(cleanEmail(email)))return cleanEmail(email);
  }
  return '';
};
const moveEmailToEnd=(queue:ShowroomQueueState,email:string)=>{
  const target=cleanEmail(email);
  const order=orderedSellerEmails(queue).filter(item=>cleanEmail(item)!==target);
  if(target&&sellerByEmail(queue,target))order.push(target);
  return order;
};
const addAudit=(queue:ShowroomQueueState,item:ShowroomQueueAudit)=>[item,...queue.auditLog].slice(0,50);

const getBusyRequestedSellerEmails=async(companyId:string,storeId:string)=>{
  const q=query(collection(db,'showroom_passages'),where('companyId','==',companyId),where('storeId','==',storeId));
  const snap=await getDocs(q);
  return new Set(snap.docs
    .map(item=>normalizePassage(item.data()))
    .filter(item=>isVisiblePassage(item)&&isTodayLocal(item.createdAt)&&item.origin==='requested'&&busyRequestedStatuses.has(item.status))
    .map(item=>cleanEmail(item.assignedSellerEmail))
    .filter(Boolean));
};

export const showroomFlowService={
  subscribeQueue:(companyId:string,storeId:string,onData:(queue:ShowroomQueueState|null)=>void,onError?:(error:any)=>void)=>{
    return onSnapshot(doc(db,'showroom_queue',queueId(companyId,storeId)),snap=>onData(snap.exists()?normalizeQueue(snap.data(),companyId,storeId):null),onError);
  },

  subscribeStorePassages:(companyId:string,storeId:string,onData:(items:ShowroomPassage[])=>void,onError?:(error:any)=>void)=>{
    const q=query(collection(db,'showroom_passages'),where('companyId','==',companyId),where('storeId','==',storeId));
    return onSnapshot(q,snap=>onData(snap.docs.map(item=>normalizePassage(item.data())).filter(isVisiblePassage).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))),onError);
  },

  subscribeSellerPassages:(companyId:string,storeId:string,email:string,onData:(items:ShowroomPassage[])=>void,onError?:(error:any)=>void)=>{
    const q=query(collection(db,'showroom_passages'),where('companyId','==',companyId),where('storeId','==',storeId),where('assignedSellerEmail','==',email));
    return onSnapshot(q,snap=>onData(snap.docs.map(item=>normalizePassage(item.data())).filter(isVisiblePassage).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))),onError);
  },

  syncQueue:async(companyId:string,storeId:string,users:User[]):Promise<ShowroomQueueState>=>{
    const ref=doc(db,'showroom_queue',queueId(companyId,storeId));
    const currentSnap=await getDoc(ref);
    const current=currentSnap.exists()?normalizeQueue(currentSnap.data(),companyId,storeId):null;
    const excluded=new Set((current?.excludedSellerEmails||[]).map(cleanEmail));
    const eligible=users.filter(user=>user.status==='active'&&(user.role==='seller'||user.role==='user')&&!excluded.has(cleanEmail(user.email)));
    const currentByEmail=new Map((current?.sellers||[]).map(seller=>[cleanEmail(seller.email),seller]));
    const sellers=eligible.map(user=>{
      const existing=currentByEmail.get(cleanEmail(user.email));
      return {id:user.id,email:user.email,name:user.name,available:existing?.available??true};
    });
    const eligibleEmails=new Set(sellers.map(item=>cleanEmail(item.email)));
    const oldOrder=current?.turnOrder||[];
    const turnOrder=uniqueEmails([...oldOrder.filter(email=>eligibleEmails.has(cleanEmail(email))),...sellers.map(item=>item.email)]);
    const pausedSellers=(current?.pausedSellers||[]).filter(item=>eligibleEmails.has(cleanEmail(item.email)));
    const next:ShowroomQueueState={id:queueId(companyId,storeId),companyId,storeId,sellers,nextIndex:0,turnOrder,pausedSellers,excludedSellerEmails:current?.excludedSellerEmails||[],auditLog:(current?.auditLog||[]).slice(0,50),updatedAt:now()};
    await setDoc(ref,next,{merge:false});
    return next;
  },

  setSellerAvailability:async(companyId:string,storeId:string,email:string,available:boolean)=>{
    const ref=doc(db,'showroom_queue',queueId(companyId,storeId));
    const snap=await getDoc(ref);if(!snap.exists())return;
    const current=normalizeQueue(snap.data(),companyId,storeId);
    await updateDoc(ref,{sellers:current.sellers.map(seller=>cleanEmail(seller.email)===cleanEmail(email)?{...seller,available}:seller),updatedAt:now()});
  },

  moveSeller:async(companyId:string,storeId:string,email:string,direction:-1|1)=>{
    const ref=doc(db,'showroom_queue',queueId(companyId,storeId));
    const snap=await getDoc(ref);if(!snap.exists())return;
    const current=normalizeQueue(snap.data(),companyId,storeId);
    const order=orderedSellerEmails(current);const index=order.findIndex(item=>cleanEmail(item)===cleanEmail(email));const target=index+direction;if(index<0||target<0||target>=order.length)return;
    [order[index],order[target]]=[order[target],order[index]];
    await updateDoc(ref,{turnOrder:order,nextIndex:0,updatedAt:now()});
  },

  skipSellerOnce:async(input:{companyId:string;storeId:string;sellerEmail:string;actorEmail?:string;actorName?:string;reason?:ShowroomQueueReason})=>{
    const ref=doc(db,'showroom_queue',queueId(input.companyId,input.storeId));
    await runTransaction(db,async tx=>{
      const snap=await tx.get(ref);if(!snap.exists())throw new Error('Fila não configurada.');
      const queue=normalizeQueue(snap.data(),input.companyId,input.storeId);
      const first=firstAvailableEmail(queue);
      if(!first)throw new Error('Nenhum vendedor disponível na fila.');
      if(first!==cleanEmail(input.sellerEmail))throw new Error('A fila mudou. Atualize e tente novamente.');
      const seller=sellerByEmail(queue,first)!;const timestamp=now();
      const audit:ShowroomQueueAudit={id:auditId(),action:'skip_once',sellerEmail:seller.email,sellerName:seller.name,reason:input.reason||'busy',at:timestamp,byEmail:input.actorEmail||'',byName:input.actorName||''};
      tx.update(ref,{turnOrder:moveEmailToEnd(queue,seller.email),nextIndex:0,auditLog:addAudit(queue,audit),updatedAt:timestamp});
    });
  },

  pauseSeller:async(input:{companyId:string;storeId:string;sellerEmail:string;actorEmail?:string;actorName?:string;reason:ShowroomQueueReason})=>{
    const ref=doc(db,'showroom_queue',queueId(input.companyId,input.storeId));
    await runTransaction(db,async tx=>{
      const snap=await tx.get(ref);if(!snap.exists())throw new Error('Fila não configurada.');
      const queue=normalizeQueue(snap.data(),input.companyId,input.storeId);
      const seller=sellerByEmail(queue,input.sellerEmail);if(!seller)throw new Error('Vendedor não encontrado na fila.');
      const timestamp=now();
      const pause:ShowroomQueuePause={email:seller.email,name:seller.name,reason:input.reason,pausedAt:timestamp,pausedBy:input.actorEmail||'',pausedByName:input.actorName||''};
      const pausedSellers=[pause,...queue.pausedSellers.filter(item=>cleanEmail(item.email)!==cleanEmail(seller.email))];
      const audit:ShowroomQueueAudit={id:auditId(),action:'pause',sellerEmail:seller.email,sellerName:seller.name,reason:input.reason,at:timestamp,byEmail:input.actorEmail||'',byName:input.actorName||''};
      tx.update(ref,{pausedSellers,auditLog:addAudit(queue,audit),updatedAt:timestamp});
    });
  },

  resumeSeller:async(input:{companyId:string;storeId:string;sellerEmail:string;actorEmail?:string;actorName?:string})=>{
    const ref=doc(db,'showroom_queue',queueId(input.companyId,input.storeId));
    await runTransaction(db,async tx=>{
      const snap=await tx.get(ref);if(!snap.exists())throw new Error('Fila não configurada.');
      const queue=normalizeQueue(snap.data(),input.companyId,input.storeId);
      const seller=sellerByEmail(queue,input.sellerEmail);if(!seller)return;
      const timestamp=now();const pausedSellers=queue.pausedSellers.filter(item=>cleanEmail(item.email)!==cleanEmail(seller.email));
      const audit:ShowroomQueueAudit={id:auditId(),action:'resume',sellerEmail:seller.email,sellerName:seller.name,at:timestamp,byEmail:input.actorEmail||'',byName:input.actorName||''};
      tx.update(ref,{pausedSellers,auditLog:addAudit(queue,audit),updatedAt:timestamp});
    });
  },

  removeSellerFromQueue:async(input:{companyId:string;storeId:string;sellerEmail:string;actorEmail?:string;actorName?:string})=>{
    const ref=doc(db,'showroom_queue',queueId(input.companyId,input.storeId));
    await runTransaction(db,async tx=>{
      const snap=await tx.get(ref);if(!snap.exists())return;
      const queue=normalizeQueue(snap.data(),input.companyId,input.storeId);
      const seller=sellerByEmail(queue,input.sellerEmail);if(!seller)return;
      const timestamp=now();const target=cleanEmail(seller.email);
      const sellers=queue.sellers.filter(item=>cleanEmail(item.email)!==target);
      const turnOrder=queue.turnOrder.filter(email=>cleanEmail(email)!==target);
      const pausedSellers=queue.pausedSellers.filter(item=>cleanEmail(item.email)!==target);
      const excludedSellerEmails=uniqueEmails([...queue.excludedSellerEmails,target]);
      const audit:ShowroomQueueAudit={id:auditId(),action:'remove',sellerEmail:seller.email,sellerName:seller.name,at:timestamp,byEmail:input.actorEmail||'',byName:input.actorName||''};
      tx.update(ref,{sellers,turnOrder,pausedSellers,excludedSellerEmails,nextIndex:0,auditLog:addAudit(queue,audit),updatedAt:timestamp});
    });
  },

  createPassage:async(input:{companyId:string;storeId:string;customerName:string;phone:string;interestModel:string;origin?:ShowroomPassageOrigin;requestedSellerEmail?:string;createdBy?:string;createdByName?:string}):Promise<ShowroomPassage>=>{
    const origin:ShowroomPassageOrigin=input.origin==='requested'?'requested':'walk_in';
    const busyRequested=origin==='walk_in'?await getBusyRequestedSellerEmails(input.companyId,input.storeId):new Set<string>();
    const qRef=doc(db,'showroom_queue',queueId(input.companyId,input.storeId));
    const pRef=passageRef();
    return runTransaction(db,async tx=>{
      const qSnap=await tx.get(qRef);if(!qSnap.exists())throw new Error('Fila de vendedores ainda não configurada.');
      const queue=normalizeQueue(qSnap.data(),input.companyId,input.storeId);
      let selected:ShowroomQueueSeller|undefined;
      if(origin==='requested'){
        selected=sellerByEmail(queue,input.requestedSellerEmail||'');
        if(!selected)throw new Error('Selecione o vendedor pedido pelo cliente.');
      }else{
        const selectedEmail=firstAvailableEmail(queue,busyRequested);
        selected=sellerByEmail(queue,selectedEmail);
        if(!selected)throw new Error('Nenhum vendedor disponível para passagem agora.');
      }
      const timestamp=now();
      const passage:ShowroomPassage={id:pRef.id,customerName:input.customerName.trim(),phone:cleanPhone(input.phone),interestModel:input.interestModel.trim(),origin,assignedSellerId:selected.id,assignedSellerEmail:selected.email,assignedSellerName:selected.name,status:'waiting',createdAt:timestamp,updatedAt:timestamp,activityHistory:[{id:auditId(),type:'created',at:timestamp,label:'Atendimento criado',details:input.interestModel.trim()?`Interesse: ${input.interestModel.trim()}`:'',status:'waiting',byEmail:input.createdBy||'',byName:input.createdByName||''}],createdBy:input.createdBy||'',createdByName:input.createdByName||'',companyId:input.companyId,storeId:input.storeId};
      tx.set(pRef,passage);
      if(origin==='walk_in')tx.update(qRef,{turnOrder:moveEmailToEnd(queue,selected.email),nextIndex:0,updatedAt:timestamp});
      return passage;
    });
  },

  createCrmLead:async(input:{companyId:string;storeId:string;customerName:string;phone:string;interestModel:string;assignedSellerId:string;assignedSellerEmail:string;assignedSellerName:string;leadSource?:CrmLeadSource;sourceLabel?:string;notes?:string;leadTemperature?:CrmLeadTemperature;nextFollowUpAt?:string;createdBy?:string;createdByName?:string}):Promise<ShowroomPassage>=>{
    const pRef=passageRef();
    const timestamp=now();
    const passage:ShowroomPassage={
      id:pRef.id,
      customerName:input.customerName.trim(),
      phone:cleanPhone(input.phone),
      interestModel:input.interestModel.trim(),
      origin:'walk_in',
      assignedSellerId:input.assignedSellerId,
      assignedSellerEmail:cleanEmail(input.assignedSellerEmail),
      assignedSellerName:input.assignedSellerName.trim(),
      status:'waiting',
      createdAt:timestamp,
      updatedAt:timestamp,
      notes:input.notes?.trim()||'',
      leadSource:input.leadSource||'manual',
      sourceLabel:input.sourceLabel?.trim()||'',
      leadTemperature:input.leadTemperature||'warm',
      nextFollowUpAt:input.nextFollowUpAt||'',
      activityHistory:[{id:auditId(),type:'created',at:timestamp,label:'Lead criado',details:input.notes?.trim()||'',status:'waiting',byEmail:input.createdBy||'',byName:input.createdByName||''}],
      createdBy:input.createdBy||'',
      createdByName:input.createdByName||'',
      companyId:input.companyId,
      storeId:input.storeId,
    };
    await setDoc(pRef,passage);
    return passage;
  },

  updateCrmLead:async(
    id:string,
    patch:Partial<Pick<ShowroomPassage,'customerName'|'phone'|'interestModel'|'desiredVehicle'|'customerEmail'|'purchaseTimeline'|'preferredContact'|'status'|'notes'|'nextFollowUpAt'|'lastContactAt'|'leadTemperature'|'tradeInPlate'|'desiredEntry'|'desiredPayment'|'lostReason'>>,
    actor?:{email?:string;name?:string},
  )=>{
    const timestamp=now();
    const next:any={...patch,updatedAt:timestamp};
    if(typeof patch.customerName==='string')next.customerName=patch.customerName.trim();
    if(typeof patch.phone==='string')next.phone=cleanPhone(patch.phone);
    if(typeof patch.interestModel==='string')next.interestModel=patch.interestModel.trim();
    if(typeof patch.desiredVehicle==='string')next.desiredVehicle=patch.desiredVehicle.trim();
    if(typeof patch.customerEmail==='string')next.customerEmail=patch.customerEmail.trim().toLowerCase();
    if(typeof patch.purchaseTimeline==='string')next.purchaseTimeline=patch.purchaseTimeline.trim();
    if(typeof patch.preferredContact==='string')next.preferredContact=patch.preferredContact;
    if(typeof patch.tradeInPlate==='string')next.tradeInPlate=String(patch.tradeInPlate||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
    if(patch.status==='in_service'&&!('lastContactAt' in patch))next.lastContactAt=timestamp;
    if(patch.status==='sale'||patch.status==='no_deal')next.closedAt=timestamp;
    const events:ShowroomPassageActivity[]=[];
    const byEmail=actor?.email||'';
    const byName=actor?.name||'';
    if(patch.status)events.push({id:auditId(),type:['sale','no_deal'].includes(patch.status)?'closed':'status',at:timestamp,label:`Etapa alterada para ${patch.status}`,status:patch.status,byEmail,byName});
    const profileChanges:string[]=[];
    if('customerName' in patch)profileChanges.push('nome');
    if('phone' in patch)profileChanges.push('telefone');
    if('interestModel' in patch)profileChanges.push('veículo de interesse');
    if('desiredVehicle' in patch)profileChanges.push('interesse atualizado');
    if('customerEmail' in patch)profileChanges.push('e-mail');
    if('purchaseTimeline' in patch)profileChanges.push('prazo de compra');
    if('preferredContact' in patch)profileChanges.push('canal preferido');
    if('tradeInPlate' in patch)profileChanges.push('placa da troca');
    if('desiredEntry' in patch)profileChanges.push('entrada desejada');
    if('desiredPayment' in patch)profileChanges.push('parcela desejada');
    if('leadTemperature' in patch)profileChanges.push('temperatura do lead');
    if(profileChanges.length)events.push({id:auditId(),type:'contact',at:timestamp,label:'Ficha do cliente atualizada',details:profileChanges.join(', '),byEmail,byName});
    if(typeof patch.notes==='string'&&patch.notes.trim())events.push({id:auditId(),type:'note',at:timestamp,label:'Observação atualizada',details:patch.notes.trim().slice(-1200),byEmail,byName});
    if(typeof patch.nextFollowUpAt==='string'&&patch.nextFollowUpAt)events.push({id:auditId(),type:'follow_up',at:timestamp,label:'Follow-up programado',details:patch.nextFollowUpAt,byEmail,byName});
    if(events.length)next.activityHistory=arrayUnion(...events);
    await updateDoc(doc(db,'showroom_passages',id),next);
  },

  addCrmNote:async(id:string,note:string,actor?:{email?:string;name?:string})=>{
    const text=String(note||'').trim();
    if(!text)return;
    const ref=doc(db,'showroom_passages',id);
    const snap=await getDoc(ref);
    if(!snap.exists())throw new Error('Atendimento não encontrado.');
    const current=normalizePassage(snap.data());
    const timestamp=now();
    const stamp=new Date(timestamp).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    const previous=String(current.notes||'').trim();
    const combined=[previous,`[${stamp}] ${text}`].filter(Boolean).join('\n\n').slice(-8000);
    await updateDoc(ref,{
      notes:combined,
      updatedAt:timestamp,
      activityHistory:arrayUnion({
        id:auditId(),
        type:'note',
        at:timestamp,
        label:'Nova anotação adicionada',
        details:text.slice(0,1200),
        byEmail:actor?.email||'',
        byName:actor?.name||'',
      }),
    });
  },

  updatePassage:async(id:string,patch:Partial<Pick<ShowroomPassage,'status'|'notes'|'assumedAt'|'closedAt'>>)=>{
    const timestamp=now();
    const next:any={...patch,updatedAt:timestamp};
    const events:ShowroomPassageActivity[]=[];
    if(patch.status)events.push({id:auditId(),type:['sale','no_deal'].includes(patch.status)?'closed':'status',at:timestamp,label:`Etapa alterada para ${patch.status}`,status:patch.status});
    if(typeof patch.notes==='string'&&patch.notes.trim())events.push({id:auditId(),type:'note',at:timestamp,label:'Observação atualizada',details:patch.notes.trim()});
    if(events.length)next.activityHistory=arrayUnion(...events);
    await updateDoc(doc(db,'showroom_passages',id),next);
  },

  correctPassage:async(input:{id:string;customerName:string;phone:string;interestModel:string;origin:ShowroomPassageOrigin;assignedSellerId:string;assignedSellerEmail:string;assignedSellerName:string;status:ShowroomPassageStatus;notes?:string;actorEmail?:string;actorName?:string;reason:string})=>{
    const ref=doc(db,'showroom_passages',input.id);
    const snap=await getDoc(ref);
    if(!snap.exists())throw new Error('Atendimento não encontrado.');
    const current=normalizePassage(snap.data());
    if(!isVisiblePassage(current))throw new Error('Este atendimento já foi excluído.');
    const timestamp=now();
    const oldHistory=Array.isArray((current as any).correctionHistory)?(current as any).correctionHistory:[];
    const correction={
      at:timestamp,
      byEmail:input.actorEmail||'',
      byName:input.actorName||'',
      reason:input.reason.trim(),
      before:{
        customerName:current.customerName||'',phone:current.phone||'',interestModel:current.interestModel||'',origin:legacyOrigin(current.origin),
        assignedSellerId:current.assignedSellerId||'',assignedSellerEmail:current.assignedSellerEmail||'',assignedSellerName:current.assignedSellerName||'',status:current.status,notes:current.notes||''
      },
      after:{
        customerName:input.customerName.trim(),phone:cleanPhone(input.phone),interestModel:input.interestModel.trim(),origin:legacyOrigin(input.origin),
        assignedSellerId:input.assignedSellerId,assignedSellerEmail:input.assignedSellerEmail,assignedSellerName:input.assignedSellerName,status:input.status,notes:input.notes||''
      }
    };
    const assumedAt=input.status==='waiting'?'':(current.assumedAt||timestamp);
    const closedAt=['sale','no_deal'].includes(input.status)?(current.closedAt||timestamp):'';
    await updateDoc(ref,{
      customerName:input.customerName.trim(),
      phone:cleanPhone(input.phone),
      interestModel:input.interestModel.trim(),
      origin:legacyOrigin(input.origin),
      assignedSellerId:input.assignedSellerId,
      assignedSellerEmail:input.assignedSellerEmail,
      assignedSellerName:input.assignedSellerName,
      status:input.status,
      notes:input.notes||'',
      assumedAt,
      closedAt,
      correctedAt:timestamp,
      correctedByEmail:input.actorEmail||'',
      correctedByName:input.actorName||'',
      correctionReason:input.reason.trim(),
      correctionHistory:[...oldHistory,correction].slice(-20),
      activityHistory:arrayUnion({id:auditId(),type:'correction',at:timestamp,label:'Atendimento corrigido',details:input.reason.trim(),status:input.status,byEmail:input.actorEmail||'',byName:input.actorName||''}),
      updatedAt:timestamp,
    });
  },

  softDeletePassage:async(input:{id:string;actorEmail?:string;actorName?:string;reason:string})=>{
    const ref=doc(db,'showroom_passages',input.id);
    const snap=await getDoc(ref);
    if(!snap.exists())throw new Error('Atendimento não encontrado.');
    const current=normalizePassage(snap.data());
    if(!isVisiblePassage(current))return;
    const timestamp=now();
    await updateDoc(ref,{
      deletedAt:timestamp,
      deletedByEmail:input.actorEmail||'',
      deletedByName:input.actorName||'',
      deletionReason:input.reason.trim(),
      updatedAt:timestamp,
    });
  },

  assumePassage:async(item:ShowroomPassage)=>{
    const timestamp=now();
    await updateDoc(doc(db,'showroom_passages',item.id),{status:'in_service' as ShowroomPassageStatus,assumedAt:item.assumedAt||timestamp,activityHistory:arrayUnion({id:auditId(),type:'assumed',at:timestamp,label:'Atendimento assumido',status:'in_service'}),updatedAt:timestamp});
  },

  finishPassage:async(item:ShowroomPassage,status:Exclude<ShowroomPassageStatus,'waiting'|'in_service'>,notes?:string)=>{
    const timestamp=now();
    await updateDoc(doc(db,'showroom_passages',item.id),{status,notes:notes||item.notes||'',closedAt:['sale','no_deal'].includes(status)?timestamp:(item.closedAt||''),activityHistory:arrayUnion({id:auditId(),type:['sale','no_deal'].includes(status)?'closed':'status',at:timestamp,label:`Etapa alterada para ${status}`,details:notes||'',status}),updatedAt:timestamp});
  }
};