import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { User } from '../types';
import { dmsMigrationService } from './dmsMigrationService';
import { tenantSecurityMigrationService } from './tenantSecurityMigrationService';
import { DEFAULT_COMPANY_ID } from './companyService';
import { DEFAULT_STORE_ID } from './storeService';
import { dmsAuditService } from './dmsAuditService';

const LEDGER='operational_meta';
const now=()=>new Date().toISOString();

type MigrationDefinition={
  version:string;
  label:string;
  applies:(companyId:string,storeId:string)=>boolean;
  run:(companyId:string,storeId:string,actor:Pick<User,'email'|'name'>)=>Promise<unknown>;
};

const MIGRATIONS:MigrationDefinition[]=[
  {
    version:'2026-10-02-001-tenant-scope',
    label:'Completar companyId/storeId no tenant legado',
    applies:(companyId,storeId)=>companyId===DEFAULT_COMPANY_ID&&storeId===DEFAULT_STORE_ID,
    run:async()=>tenantSecurityMigrationService.prepareDefaultTenant(),
  },
  {
    version:'2026-10-02-002-dms-master-links',
    label:'Vincular estoque, preparação, financeiro, clientes e fornecedores aos cadastros mestres',
    applies:()=>true,
    run:(companyId,storeId,actor)=>dmsMigrationService.runSafeMigration(companyId,storeId,actor),
  },
];

const idFor=(companyId:string,storeId:string,version:string)=>`migration_${companyId}_${storeId}_${version}`.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,190);

export type MigrationRunResult={version:string;label:string;status:'applied'|'skipped'|'already_applied';result?:unknown};

export const dmsMigrationRegistry={
  definitions:()=>MIGRATIONS.map(({version,label})=>({version,label})),

  appliedVersions:async(companyId:string,storeId:string):Promise<Set<string>>=>{
    const snap=await getDocs(query(collection(db,LEDGER),where('companyId','==',companyId),where('storeId','==',storeId)));
    return new Set(
      snap.docs.map(item=>item.data() as any)
        .filter(item=>item.kind==='dms_migration_version'&&item.status==='applied')
        .map(item=>String(item.version||'')),
    );
  },

  runPending:async(companyId:string,storeId:string,actor:Pick<User,'email'|'name'>):Promise<MigrationRunResult[]>=>{
    const applied=await dmsMigrationRegistry.appliedVersions(companyId,storeId);
    const results:MigrationRunResult[]=[];
    for(const migration of MIGRATIONS){
      if(applied.has(migration.version)){
        results.push({version:migration.version,label:migration.label,status:'already_applied'});
        continue;
      }
      if(!migration.applies(companyId,storeId)){
        results.push({version:migration.version,label:migration.label,status:'skipped'});
        continue;
      }
      const result=await migration.run(companyId,storeId,actor);
      const stamp=now();
      await setDoc(doc(db,LEDGER,idFor(companyId,storeId,migration.version)),{
        id:idFor(companyId,storeId,migration.version),
        kind:'dms_migration_version',
        version:migration.version,label:migration.label,status:'applied',
        companyId,storeId,appliedAt:stamp,appliedBy:actor.email,appliedByName:actor.name,
        result,
      },{merge:false});
      await dmsAuditService.record({
        companyId,storeId,entityType:'system',entityId:migration.version,
        action:'migration_applied',label:`Migração aplicada: ${migration.label}`,actor,
      }).catch(()=>undefined);
      applied.add(migration.version);
      results.push({version:migration.version,label:migration.label,status:'applied',result});
    }
    return results;
  },
};
