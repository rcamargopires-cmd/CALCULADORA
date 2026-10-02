import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import type { DmsAttachment, DmsAttachmentCategory, User } from '../types';
import { dmsAuditService } from './dmsAuditService';

const LEDGER='operational_meta';
const safe=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'-').replace(/-+/g,'-').slice(0,180);
const now=()=>new Date().toISOString();
const MAX_BYTES=15*1024*1024;
const allowed=(type:string)=>type.startsWith('image/')||[
  'application/pdf','application/xml','text/xml','text/plain','application/octet-stream'
].includes(type);

export const dmsAttachmentService={
  upload:async(input:{
    companyId:string;storeId:string;
    entityType:DmsAttachment['entityType'];entityId:string;
    vehicleId?:string;plate?:string;
    category:DmsAttachmentCategory;file:File;actor:Pick<User,'email'|'name'>;
  }):Promise<DmsAttachment>=>{
    if(!auth.currentUser)throw new Error('Sua sessão expirou. Entre novamente para anexar o arquivo.');
    if(!input.file)throw new Error('Selecione um arquivo.');
    if(input.file.size>MAX_BYTES)throw new Error('Arquivo acima de 15 MB.');
    const contentType=input.file.type||'application/octet-stream';
    if(!allowed(contentType))throw new Error('Use imagem, PDF, XML ou arquivo de texto.');
    const stamp=now();
    const id=safe(`attachment_${input.companyId}_${input.storeId}_${input.entityType}_${input.entityId}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
    const name=safe(input.file.name||'arquivo');
    const storagePath=`dms/${safe(input.companyId)}/${safe(input.storeId)}/${input.entityType}/${safe(input.entityId)}/${id}_${name}`;
    const objectRef=ref(storage,storagePath);
    await uploadBytes(objectRef,input.file,{
      contentType,
      customMetadata:{
        companyId:input.companyId,storeId:input.storeId,entityType:input.entityType,entityId:input.entityId,
        createdBy:input.actor.email||'',
      },
    });
    const url=await getDownloadURL(objectRef);
    const attachment:DmsAttachment={
      id,kind:'dms_attachment',companyId:input.companyId,storeId:input.storeId,
      entityType:input.entityType,entityId:input.entityId,
      ...(input.vehicleId?{vehicleId:input.vehicleId}:{}),
      ...(input.plate?{plate:String(input.plate).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7)}:{}),
      category:input.category,name:input.file.name||name,contentType,size:input.file.size,
      storagePath,url,createdAt:stamp,createdBy:input.actor.email,createdByName:input.actor.name,
    };
    await setDoc(doc(db,LEDGER,id),attachment,{merge:false});
    await dmsAuditService.record({
      companyId:input.companyId,storeId:input.storeId,
      entityType:input.entityType==='finance_entry'?'finance':input.entityType==='vehicle_document'?'document':input.entityType==='prep_service'?'prep':'system',
      entityId:input.entityId,vehicleId:input.vehicleId,plate:input.plate,
      action:'attachment_uploaded',label:`Arquivo anexado: ${attachment.name}`,details:input.category,actor:input.actor,
    }).catch(()=>undefined);
    return attachment;
  },

  list:async(companyId:string,storeId:string,entityType:DmsAttachment['entityType'],entityId:string):Promise<DmsAttachment[]>=>{
    const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
    return snap.docs.map(item=>item.data() as any)
      .filter(item=>item.kind==='dms_attachment'&&item.entityType===entityType&&item.entityId===entityId)
      .map(item=>item as DmsAttachment)
      .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  },

  remove:async(item:DmsAttachment,actor:Pick<User,'email'|'name'>)=>{
    await deleteObject(ref(storage,item.storagePath)).catch(()=>undefined);
    await deleteDoc(doc(db,LEDGER,item.id));
    await dmsAuditService.record({
      companyId:item.companyId,storeId:item.storeId,
      entityType:item.entityType==='finance_entry'?'finance':item.entityType==='vehicle_document'?'document':item.entityType==='prep_service'?'prep':'system',
      entityId:item.entityId,vehicleId:item.vehicleId,plate:item.plate,
      action:'attachment_removed',label:`Arquivo removido: ${item.name}`,details:item.category,actor,
    }).catch(()=>undefined);
  },
};
