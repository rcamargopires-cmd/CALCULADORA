import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const moduleCode=readFileSync('services/marketIqExclusiveAccess.ts','utf8');
const js=ts.transpileModule(moduleCode,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
const module={exports:{}};
runInNewContext(js.outputText,{module,exports:module.exports});
const {iqExclusiveUser,EVANDRO_IQ_ONLY_EMAIL}=module.exports;
const evandro={email:EVANDRO_IQ_ONLY_EMAIL,status:'active',role:'manager',name:'Evandro',companyId:'abrao-reze',storeId:'outlet-sorocaba'};
const safe=iqExclusiveUser(evandro);
assert.equal(safe.role,'manager');
assert.equal(safe.pricingDeskOnly,true,'Evandro must land on Motyq IQ without URL parameters');
assert.equal(evandro.pricingDeskOnly,undefined,'The UI projection must not mutate Firestore source objects');
assert.equal(iqExclusiveUser(null),null,'Signed-out users must reach login screen');
assert.equal(iqExclusiveUser({...evandro,status:'inactive'}).pricingDeskOnly,undefined);
assert.equal(iqExclusiveUser({...evandro,companyId:'other-company'}).pricingDeskOnly,undefined);
assert.equal(iqExclusiveUser({...evandro,role:'seller'}).pricingDeskOnly,undefined,'Must not elevate a seller to manager');
assert.equal(iqExclusiveUser({...evandro,email:'other.manager@example.com'}).pricingDeskOnly,undefined);

const roleRoot=readFileSync('components/RoleAwareRoot.tsx','utf8');
const app=readFileSync('App.tsx','utf8');
const server=readFileSync('api/analyze-deal.ts','utf8');
assert.ok(roleRoot.includes('const active = user?.status === \'active\' ? iqExclusiveUser('));
assert.ok(roleRoot.includes('setProfile(next?.status === \'active\' ? iqExclusiveUser('));
assert.ok(roleRoot.includes("const iqAllowed=Boolean(profile) &&"),'No-profile login must not crash');
assert.ok(roleRoot.includes("method:'GET',cache:'no-store'"),'Server profile sync is authenticated');
assert.ok(app.includes("setUser(iqExclusiveUser({...dbUser,email:normalizedEmail}))"));
assert.ok(server.includes('await ensureEvandroIqOnly(email,profile)'),'Evandro IQ-only sync must remain chained with new additive access');
assert.ok(server.includes('ensureReinaldoDeskAccess(email,'),'Reinaldo separate entitlement must be applied without touching Evandro role');
assert.ok(server.includes("if(actor?.pricingDeskOnly===true||emailOf(actor?.email)===EVANDRO_IQ_ONLY)return false;"));

let calls=[];
let audits=0;
const sa=server.slice(server.indexOf('const EVANDRO_IQ_ONLY='),server.indexOf('const DMS_ACCESS_PROFILES ='))+
 server.slice(server.indexOf('const ensureEvandroIqOnly='),server.indexOf('const ensureManagementScope='))+
 '\nresult=ensureEvandroIqOnly;';
const sm=ts.transpileModule(sa,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}});
const vm={
 result:null,
 Object,
 emailOf:(s)=>String(s||'').trim().toLowerCase(),
 companyOf:(p)=>String(p?.companyId||'abrao-reze'),
 roleOf:(p)=>String(p?.role||''),
 motyqFirestore:{configured:()=>true,patch:async(...args)=>{calls.push(args);return true;}},
 userAudit:async()=>{audits++;},
 Error
};
runInNewContext(sm.outputText,vm);
const sync=vm.result;
const synced=await sync(EVANDRO_IQ_ONLY_EMAIL,evandro);
assert.equal(synced.pricingDeskOnly,true);
assert.equal(synced.role,'manager');
assert.equal(calls.length,1);
assert.equal(calls[0][0],'users');
assert.equal(calls[0][1],EVANDRO_IQ_ONLY_EMAIL);
assert.equal(calls[0][2].dmsPermissionOverrides.evaluationsView,true);
assert.equal(calls[0][2].dmsPermissionOverrides.financeView,false);
assert.equal(calls[0][2].dmsPermissionOverrides.usersManage,false);
assert.equal(audits,1);
await sync(EVANDRO_IQ_ONLY_EMAIL,synced);
assert.equal(calls.length,1,'Second login must not rewrite unchanged account');
await sync('other.manager@example.com',{...evandro,email:'other.manager@example.com'});
await sync(EVANDRO_IQ_ONLY_EMAIL,{...evandro,status:'inactive'});
await sync(EVANDRO_IQ_ONLY_EMAIL,{...evandro,role:'seller'});
assert.equal(calls.length,1,'Other accounts, inactive users and sellers must not be modified');
console.log('Evandro IQ-only: login, account isolation, backend profile migration and audit tests passed.');
