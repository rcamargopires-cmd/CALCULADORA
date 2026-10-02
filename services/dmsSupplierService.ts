import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { SupplierMaster, User } from '../types';
import { dmsAuditService } from './dmsAuditService';

const LEDGER='operational_meta';
const safe=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,180);
const norm=(value:unknown)=>String(value??'').trim().toLocaleLowerCase('pt-BR');
const now=()=>new Date().toISOString();
const newId=(companyId:string)=>safe(`sup_${companyId}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`);
const docId=(supplierId:string)=>safe(`supplier_master_${supplierId}`);

const list=async(companyId:string,storeId:string):Promise<SupplierMaster[]>=>{
  const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
  return snap.docs.map(item=>item.data() as any).filter(item=>item.kind==='supplier_master').map(item=>item as SupplierMaster);
};

export const dmsSupplierService={
  list,

  ensure:async(input:{
    companyId:string;
    storeId:string;
    name:string;
    document?:string;
    phone?:string;
    email?:string;
    pixKey?:string;
    bankInfo?:string;
    actor?:Pick<User,'email'|'name'>|null;
  }):Promise<SupplierMaster>=>{
    const name=String(input.name||'').trim()||'Fornecedor não informado';
    const document=String(input.document||'').replace(/\D/g,'').slice(0,14);
    const masters=await list(input.companyId,input.storeId);
    const existing=masters.find(item=>
      (document&&String(item.document||'')===document) ||
      norm(item.name)===norm(name)
    );
    const stamp=now();
    const supplierId=existing?.supplierId||newId(input.companyId);
    const next:SupplierMaster={
      id:docId(supplierId),
      kind:'supplier_master',
      supplierId,
      companyId:input.companyId,
      storeId:input.storeId,
      name,
      document:document||existing?.document||'',
      phone:String(input.phone||existing?.phone||'').replace(/\D/g,'').slice(0,15),
      email:String(input.email||existing?.email||'').trim().toLowerCase(),
      pixKey:String(input.pixKey||existing?.pixKey||'').trim(),
      bankInfo:String(input.bankInfo||existing?.bankInfo||'').trim(),
      active:existing?.active!==false,
      createdAt:existing?.createdAt||stamp,
      updatedAt:stamp,
    };
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    if(!existing){
      await dmsAuditService.record({
        companyId:input.companyId,storeId:input.storeId,entityType:'supplier',entityId:supplierId,
        action:'supplier_master_created',label:'Fornecedor incluído no cadastro mestre do DMS',
        details:next.name,actor:input.actor,
      }).catch(()=>undefined);
    }
    return next;
  },

  save:async(supplier:SupplierMaster,actor?:Pick<User,'email'|'name'>|null):Promise<SupplierMaster>=>{
    const next:SupplierMaster={
      ...supplier,
      name:String(supplier.name||'').trim(),
      document:String(supplier.document||'').replace(/\D/g,'').slice(0,14),
      phone:String(supplier.phone||'').replace(/\D/g,'').slice(0,15),
      email:String(supplier.email||'').trim().toLowerCase(),
      pixKey:String(supplier.pixKey||'').trim(),
      bankInfo:String(supplier.bankInfo||'').trim(),
      updatedAt:now(),
    };
    if(!next.name)throw new Error('Informe o nome do fornecedor.');
    await setDoc(doc(db,LEDGER,next.id),next,{merge:true});
    await dmsAuditService.record({
      companyId:next.companyId,storeId:next.storeId,entityType:'supplier',entityId:next.supplierId,
      action:'supplier_master_updated',label:'Cadastro mestre de fornecedor atualizado',
      details:next.name,actor,
    }).catch(()=>undefined);
    return next;
  },
};
