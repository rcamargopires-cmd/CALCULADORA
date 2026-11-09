import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const app=readFileSync('App.tsx','utf8');
const root=readFileSync('components/RoleAwareRoot.tsx','utf8');
const service=readFileSync('services/userService.ts','utf8');
const api=readFileSync('api/analyze-deal.ts','utf8');
const opts={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX};
for(const source of [app,root,service,api]){
 const {diagnostics}=ts.transpileModule(source,{compilerOptions:opts,reportDiagnostics:true});
 assert.equal((diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,
  'TypeScript source must parse correctly');
}
assert.ok(app.includes('resolvedUser?:User|null'));
assert.ok(app.includes('if(resolvedUser !== undefined)'));
assert.ok(app.includes('if (!user || isMotyqIqWorkspace(user)) return;'),
 'IQ must not activate CRM/directory/deal watchers at startup');
assert.ok(app.includes("params.get('iq')==='1'")&&app.includes("params.get('go')!=='1'"),
 'Avoid loading standard workflows for pricing users and direct IQ access, but preserve GO navigation');
assert.ok(app.includes("dealTenantService.subscribeDirectory(user")&&
 app.includes("dealTenantService.subscribeDeals(user"),
 'GO keeps its existing live subscriptions when explicitly selected');
assert.ok(app.includes('setUser(resolvedUser)'));
assert.ok(app.includes('return;\n    }\n    const unsubscribeAuth = onAuthStateChanged'),
 'A verified role provided by root must skip the second auth listener and profile read');
assert.ok(root.includes('<App resolvedUser={user}/>'));
assert.ok(root.includes('<App resolvedUser={profile}/>'));
assert.ok(root.includes('setProfileError(quota?\'quota\':\'temporarily_unavailable\')'));
assert.ok(root.includes("if(authAccountPresent&&!profile&&profileError)return"),'Signed-in, unverified accounts must not see password form');
assert.ok(root.includes('sessionStorage.setItem(quotaKey(firebaseUser.uid)'),'Quotas should suppress refresh storm');
assert.ok(root.includes('sessionStorage.getItem(quotaKey(firebaseUser.uid)'));
assert.ok(root.includes('Date.now()+5*60*1000'),'Quota retries must have a cooldown');
assert.ok(root.includes("setRetryNonce(n=>n+1)"),'Manual retry is allowed after cooldown');
assert.ok(root.includes("const reinaldoNeedsSync="));
assert.ok(root.includes("const evandroNeedsSync="));
assert.ok(root.includes("if(user?.status==='active'&&(evandroNeedsSync||reinaldoNeedsSync))"),
 'Already authorized desks must skip additional server check');
assert.ok(root.includes("profileUnsubscribe = onSnapshot"),'Role updates and revocation still monitored');
assert.ok(!root.includes('setProfile({email:normalizedEmail'), 'Never fabricate a Firestore profile on quota error');
assert.ok(service.includes("if(/resource-exhausted|quota|429|MOTYQ_FIRESTORE_QUOTA_EXCEEDED/i.test(code))"),
 'Direct quota 429 must not trigger a second Firestore lookup via server');
assert.ok(service.includes("throw new Error('MOTYQ_FIRESTORE_QUOTA_EXCEEDED')"));
assert.ok(service.includes("payload?.error==='firestore_quota_exceeded'"));
assert.ok(api.includes("res.status(503).json({error:'firestore_quota_exceeded'})"),
 'Firestore capacity is not an invalid password');
assert.ok(api.includes("res.setHeader('Retry-After','300')"));
assert.ok(api.includes('let currentUserQuotaBlockedUntil=0'));
assert.ok(api.includes('Date.now()<currentUserQuotaBlockedUntil'));
assert.ok(api.includes('currentUserQuotaBlockedUntil=Date.now()+5*60*1000'));
assert.ok(api.includes('if(email!==OWNER_ADMIN&&Date.now()<currentUserQuotaBlockedUntil)'),
 'Owner emergency path must not be blocked by transient quota breaker');
assert.ok(api.includes("if(/current_user_firestore_429|resource.exhausted|quota/i.test(reason))"));
assert.ok(!api.includes("res.status(401).json({ error: String(error?.message"),'No raw infrastructure errors mistaken for user credentials');
console.log('Motyq auth quota circuit breaker: single profile verification, live permissions, 429 fail-fast, 503 backend mapping, session cooldown, no role bypass passed.');
