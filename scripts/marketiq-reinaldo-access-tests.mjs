import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const backend=readFileSync('api/analyze-deal.ts','utf8');
const roleRoot=readFileSync('components/RoleAwareRoot.tsx','utf8');
const app=readFileSync('App.tsx','utf8');
const history=readFileSync('services/marketiqPricingHistoryServer.ts','utf8');
const deployed=readFileSync('api/marketiq-market-scan.ts','utf8');
const shell=readFileSync('components/MotyqShell.tsx','utf8');
assert.ok(roleRoot.includes("normalizedEmail==='reinaldo.ribas@abraoreze.com.br'"),'Reinaldo must synchronize the signed-in entitlement');
assert.ok(roleRoot.includes("payload.user.pricingDeskAccess===true"),'Only confirmed server role sync may update local profile');
assert.ok(roleRoot.includes("iqEmail==='reinaldo.ribas@abraoreze.com.br'&&!goSelected"),'Reinaldo enters the desk by default but can switch back to GO');
assert.ok(app.includes("iqEmail==='reinaldo.ribas@abraoreze.com.br'&&!goSelected"),'Application routing must match role router');
assert.ok(app.includes("?'?go=1':''"),'Back-to-GO link must actually bypass default IQ');
assert.ok(shell.includes("reinaldo.ribas@abraoreze.com.br"),'GO must provide an IQ navigation entry');
assert.ok(history.includes("pricingDeskAccess:f.pricingDeskAccess?.booleanValue===true"),'Persisted entitlement must be verified from Firestore');
assert.ok(deployed.includes("pricingDeskAccess:f.pricingDeskAccess?.booleanValue===true"),'The deployed API must enforce same entitlement');
assert.ok(!backend.includes("const expected={role:'manager',pricingDeskAccess:true"),'Do not overwrite original role');
const start=backend.indexOf('const ensureReinaldoDeskAccess='),end=backend.indexOf('const ensureManagementScope=',start);
assert.ok(start>0&&end>start);
const segment=backend.slice(start,end)+'\nresult=ensureReinaldoDeskAccess;';
const compiled=ts.transpileModule(segment,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},reportDiagnostics:true});
assert.equal((compiled.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
let writes=[],audits=[];
const vm={
 result:null,
 REINALDO_DESK_ACCESS:'reinaldo.ribas@abraoreze.com.br',
 companyOf:profile=>String(profile?.companyId||'abrao-reze'),
 motyqFirestore:{configured:()=>true,patch:async(...args)=>{writes.push(args);return true;}},
 userAudit:async(...args)=>{audits.push(args);}
};
runInNewContext(compiled.outputText,vm);
const sync=vm.result;
const original={email:'reinaldo.ribas@abraoreze.com.br',role:'seller',status:'active',
 companyId:'abrao-reze',storeId:'outlet-sorocaba',name:'Reinaldo',otherPermission:'preserved'};
const next=await sync(original.email,original);
assert.equal(next.pricingDeskAccess,true);
assert.equal(next.role,'seller','Existing role must remain unchanged');
assert.equal(next.otherPermission,'preserved');
assert.equal(original.pricingDeskAccess,undefined,'Source profile must not be mutated');
assert.equal(writes.length,1);
assert.equal(writes[0][0],'users');
assert.equal(writes[0][1],original.email);
assert.deepEqual(JSON.parse(JSON.stringify(writes[0][2])),{pricingDeskAccess:true},'Server must patch only additive entitlement');
assert.equal(audits.length,1);
assert.equal((await sync(original.email,next)).pricingDeskAccess,true);
assert.equal(writes.length,1,'Second login must not repeat write');
await sync('other@example.com',{...original,email:'other@example.com'});
await sync(original.email,{...original,status:'inactive'});
await sync(original.email,{...original,companyId:'another-dealer'});
assert.equal(writes.length,1,'Do not grant to another user, inactive profile or another dealer');
console.log('Reinaldo Mesa entitlement: additive Firebase sync, tenant, user isolation, routes and history authorization passed.');
