import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const app=readFileSync('App.tsx','utf8');
const service=readFileSync('services/userService.ts','utf8');
const api=readFileSync('api/analyze-deal.ts','utf8');
for(const [name,code] of [['App',app],['userService',service],['API',api]]){
 const result=ts.transpileModule(code,{fileName:name+'.tsx',compilerOptions:{
  jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022
 },reportDiagnostics:true});
 assert.equal((result.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,
  name+' must parse as TypeScript');
}
assert.ok(service.includes('MOTYQ_FIRESTORE_RATE_LIMITED'),
 'The client must classify temporary Firestore quota errors separately');
assert.ok(service.includes('resource-exhausted|429|quota.exceeded|rate.limit'),
 'Recognize Firebase resource exhausted and HTTP429 cases');
assert.ok(service.indexOf('if (/resource-exhausted')<service.indexOf("fetch('/api/analyze-deal?action=current-user'"),
 'Rate-limited client Firestore requests must not trigger duplicate server Firestore lookups');
assert.ok(app.includes('O banco de dados está limitando consultas neste momento'),
 'The login error must explain quota problems rather than blame credentials');
assert.ok(app.includes('Sua senha não foi rejeitada e suas permissões não foram alteradas'),
 'The login error must not claim a denied password or changed permissions');
assert.ok(app.includes("setUser(null)"),
 'Never enter restricted screens when Firestore profile cannot be verified');
assert.ok(!app.includes("quotaLimited ? 'admin'"),
 'Rate limit must never grant admin privileges');
assert.ok(api.includes("const quotaLimited=message==='current_user_firestore_429'"),
 'Server must distinguish verified Firestore 429 from invalid login');
assert.ok(api.includes("res.setHeader('Retry-After','180')"),
 'Server exposes rate-limit backoff to callers');
assert.ok(api.includes("res.status(429).json({")&&api.includes("code:'PROFILE_RATE_LIMITED'"),
 'Server must not report Firestore quota as HTTP401');
assert.ok(api.includes("if(!profile||profile.status!=='active')return res.status(403)"),
 'Genuine missing/inactive users stay blocked');
assert.ok(api.includes("if(!token)return res.status(401)"),
 'Unauthenticated login remains rejected');
assert.ok(api.includes("message==='not_authenticated'?401:503"),
 'Unexpected profile read failure must not be mislabeled as invalid credentials');
console.log('Motyq auth rate limit: distinct Firestore429, safe fail-closed login, and no duplicate fallback lookup passed.');
