import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const source=readFileSync('services/marketiqPricingHistoryServer.ts','utf8');
const api=readFileSync('api/marketiq-market-scan.ts','utf8');
const ui=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
assert.ok(api.includes("'pricing_history_paid'"),'Actual paid action must dispatch through existing API');
assert.ok(api.includes("kind:isApproval?'valuation_approved':'purchase_paid'"),'Approved and paid events must both be bundled without conflation');
assert.ok(ui.includes("Valor aprovado na avaliação (R$, opcional)"),'New valuations must capture amount approved during appraisal');
assert.ok(ui.includes("Registrar valor aprovado"),'Existing valuations must permit recording approved amount');
assert.ok(ui.includes("Corrigir valor aprovado"),'Approval corrections must remain possible');
assert.ok(ui.includes("Com valor aprovado"),'History filter must include approved valuations');
assert.ok(ui.includes("Acima"),'History must show comparison with estimate');
assert.ok(api.includes("'pricing_history_approved'"),'Approval event must be routed in same API');
assert.ok(source.includes("kind:isApproval?'valuation_approved':'purchase_paid'"),'Approved and paid events must not be conflated');
assert.ok(ui.includes('Registro anterior de valor realmente pago')&&!ui.includes('Valor realmente pago (R$, opcional)'),'Legacy purchase payments must remain labeled separately from approved valuation');

const js=ts.transpileModule(source.replace(/^import .+;\s*$/gm,'')
  .replace('export default async function handler','async function handler')+'\nresult=handler;',{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},reportDiagnostics:true
});
assert.equal((js.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);

const db=new Map(), requests=[];
let currentCompany='tenant-a',currentStore='unit-1',currentRole='manager';
let sequence=0;
const makeRes=()=>({statusCode:200,body:null,setHeader(){return this;},status(n){this.statusCode=n;return this;},json(obj){this.body=obj;return this;}});
const ok=(data)=>({ok:true,status:200,json:async()=>data});
const err=(status)=>({ok:false,status,json:async()=>({})});
const fakeFetch=async(target,options={})=>{
 const url=String(target),method=options.method||'GET';
 requests.push({url,method});
 if(url.includes('identitytoolkit.googleapis.com'))return ok({users:[{email:'mesa@example.com',emailVerified:true}]});
 if(url.includes('oauth2.googleapis.com'))return ok({access_token:'mock-token'});
 if(url.includes('/documents/users/'))return ok({fields:{
   role:{stringValue:currentRole},status:{stringValue:'active'},
   companyId:{stringValue:currentCompany},storeId:{stringValue:currentStore},
   name:{stringValue:'Gerente da Mesa'}
 }});
 if(url.includes('/evaluations')){
   const route=new URL(url),id=route.searchParams.get('documentId');
   const key=route.pathname.split('/evaluations')[0]+'/evaluations/';
   if(method==='POST'){
     assert.ok(id,'Creation must use immutable Firestore document id');
     assert.ok(!db.has(key+id),'Never overwrite prior evaluations or payment events');
     const row=JSON.parse(options.body);
     db.set(key+id,row);
     return ok({name:key+id});
   }
   const requested=route.pathname.split('/evaluations/')[1];
   if(requested)return db.has(key+requested)?ok(db.get(key+requested)):err(404);
   return ok({documents:[...db.entries()].filter(([k])=>k.startsWith(key)).map(([,v])=>v),nextPageToken:''});
 }
 throw Error('Unexpected mock route: '+url);
};
const config={projectId:'test-project',firestoreDatabaseId:'(default)',apiKey:'public-test-key'};
const cryptoMock={createSign:()=>({update(){return this;},end(){},sign(){return Buffer.from('mock-sig');}}),randomUUID:()=>'00000000-0000-4000-8000-'+String(++sequence).padStart(12,'0')};
const ctx={
 URL,URLSearchParams,Buffer,AbortSignal,Date,console,result:null,
 firebaseConfig:config,fetch:fakeFetch,...cryptoMock,
 process:{env:{FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({
   project_id:config.projectId,client_email:'service@test.iam.gserviceaccount.com',private_key:'dummy'
 })}}
};
runInNewContext(js.outputText,ctx);
const handler=ctx.result,auth={method:'POST',headers:{authorization:'Bearer valid-session'}};
const send=async(action,body={})=>{
 const res=makeRes();await handler({...auth,body:{action,...body}},res);return res;
};
const base={
 date:'2026-10-31T17:00:00.000Z',plate:'FXZ9A92',brand:'VW',model:'VIRTUS',
 year:'2022',km:'71.000',cost:'1.000',value:76658,repasse:false,ads:[]
};
const saved=await send('pricing_history_save',{evaluation:base});
assert.equal(saved.statusCode,200,JSON.stringify(saved.body));
const id=saved.body.record.id;
assert.equal(saved.body.record.value,76658);
assert.ok(!('paidValue' in saved.body.record),'Unsold valuation must not be shown as paid');

const invalidAmount=await send('pricing_history_paid',{evaluationId:id,amount:0,paidAt:'2026-10-31'});
assert.equal(invalidAmount.statusCode,400);
const invalidDate=await send('pricing_history_paid',{evaluationId:id,amount:75000,paidAt:'2026-02-30'});
assert.equal(invalidDate.statusCode,400);
const fakeId=await send('pricing_history_paid',{evaluationId:'00000000-0000-4000-8000-999999999999',amount:75000,paidAt:'2026-10-31'});
assert.equal(fakeId.statusCode,404);
const eventRes=await send('pricing_history_paid',{evaluationId:id,amount:75000.20,paidAt:'2026-10-30',companyId:'tenant-z'});
assert.equal(eventRes.statusCode,200,JSON.stringify(eventRes.body));
assert.equal(eventRes.body.paid.paidValue,75000.2);
assert.equal(eventRes.body.paid.evaluationId,id);
assert.equal(eventRes.body.paid.recordedBy,'Gerente da Mesa');
let list=await send('pricing_history_list');
assert.equal(list.statusCode,200);
assert.equal(list.body.records.length,1,'Audit event must not be shown as another evaluation');
assert.equal(list.body.records[0].value,76658,'Estimate must stay intact');
assert.equal(list.body.records[0].paidValue,75000.2,'Actual amount must appear beside estimate');
assert.equal(list.body.records[0].paidAt,'2026-10-30');
await new Promise(resolve=>setTimeout(resolve,7));
const correction=await send('pricing_history_paid',{evaluationId:id,amount:74550,paidAt:'2026-10-31'});
assert.equal(correction.statusCode,200,'Correction must be an additional recorded event');
list=await send('pricing_history_list');
assert.equal(list.body.records.length,1,'Correcting payment must not create another valuation');
assert.equal(list.body.records[0].paidValue,74550,'Latest corrected payment should display');
assert.equal(list.body.records[0].value,76658,'Original price estimate must never change');


currentStore='unit-2';
const wrongStore=await send('pricing_history_paid',{evaluationId:id,amount:72000,paidAt:'2026-10-30'});
assert.equal(wrongStore.statusCode,404);
list=await send('pricing_history_list');
assert.equal(list.body.records.length,0,'Different store cannot read valuation/payment');
currentStore='unit-1';
currentCompany='tenant-b';
const wrongTenant=await send('pricing_history_paid',{evaluationId:id,amount:71000,paidAt:'2026-10-30'});
assert.equal(wrongTenant.statusCode,404);
currentCompany='tenant-a';
currentRole='seller';
const deny=await send('pricing_history_paid',{evaluationId:id,amount:71000,paidAt:'2026-10-30'});
assert.equal(deny.statusCode,403);
currentRole='manager';
const unauth=makeRes();await handler({method:'POST',headers:{},body:{action:'pricing_history_paid'}},unauth);
assert.equal(unauth.statusCode,401);
assert.equal(db.size,3,'Original valuation and two separate audited payment versions must be retained');
assert.ok(requests.some(x=>x.url.includes('/tenant-a/stores/unit-1/evaluations/'+id)),'Must verify parent valuation inside tenant scope');
console.log('Motyq IQ actual paid history: immutable audit, authentication, tenant isolation, validation, list hydration passed.');


// Approved price is a DIFFERENT business event, not the amount paid.
const approval=await send('pricing_history_approved',{evaluationId:id,amount:76000,approvedAt:'2026-10-31'});
assert.equal(approval.statusCode,200,JSON.stringify(approval.body));
assert.equal(approval.body.approved.kind,'valuation_approved');
assert.equal(approval.body.approved.approvedValue,76000);
assert.ok(!('paidValue' in approval.body.approved),'Approved values must never be stored as purchase payments');
list=await send('pricing_history_list');
assert.equal(list.body.records.length,1);
assert.equal(list.body.records[0].value,76658,'Algorithm estimate remains intact');
assert.equal(list.body.records[0].approvedValue,76000,'Approved amount is available in history');
assert.equal(list.body.records[0].paidValue,74550,'Existing actual purchase record remains separately visible');

const badApprovalDate=await send('pricing_history_approved',{evaluationId:id,amount:76000,approvedAt:'2026-02-30'});
assert.equal(badApprovalDate.statusCode,400);
const badApprovalAmount=await send('pricing_history_approved',{evaluationId:id,amount:-1,approvedAt:'2026-10-31'});
assert.equal(badApprovalAmount.statusCode,400);
currentCompany='tenant-b';
const crossTenantApproval=await send('pricing_history_approved',{evaluationId:id,amount:74000,approvedAt:'2026-10-31'});
assert.equal(crossTenantApproval.statusCode,404);
currentCompany='tenant-a';
currentStore='unit-2';
const crossStoreApproval=await send('pricing_history_approved',{evaluationId:id,amount:74000,approvedAt:'2026-10-31'});
assert.equal(crossStoreApproval.statusCode,404);
currentStore='unit-1';
currentRole='seller';
const forbiddenApproval=await send('pricing_history_approved',{evaluationId:id,amount:74000,approvedAt:'2026-10-31'});
assert.equal(forbiddenApproval.statusCode,403);
currentRole='manager';
const updatedApproval=await send('pricing_history_approved',{evaluationId:id,amount:75400,approvedAt:'2026-10-31'});
assert.equal(updatedApproval.statusCode,200);
list=await send('pricing_history_list');
assert.equal(list.body.records.length,1,'Corrections must not duplicate valuations');
assert.equal(list.body.records[0].approvedValue,75400,'Newest approval correction must display');
assert.equal(list.body.records[0].paidValue,74550,'Approval corrections cannot change the paid purchase amount');
assert.equal(list.body.records[0].value,76658,'Approval corrections cannot rewrite Motyq estimate');
assert.equal(db.size,5,'Two purchase events and two approval events alongside the valuation are preserved');
console.log('Motyq IQ approved valuation: distinct approval and purchase events, tenant isolation and audit passed.');
