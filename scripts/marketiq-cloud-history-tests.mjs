import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const server=readFileSync('services/marketiqPricingHistoryServer.ts','utf8');
const ui=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const api=readFileSync('api/marketiq-market-scan.ts','utf8');
const pure=server.slice(server.indexOf('const text='),server.indexOf('const email='))+
  '\n'+server.slice(server.indexOf('const validAdUrl='),server.indexOf('const historyPath='))+
  '\nresult={finite,normalizePayload};';
const output=ts.transpileModule(pure,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},reportDiagnostics:true});
assert.equal((output.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const ctx={result:null,URL};
runInNewContext(output.outputText,ctx);
const {finite,normalizePayload}=ctx.result;
assert.equal(finite('R$ 89.900',1,2000000),89900,'BRL thousands preserved');
assert.equal(finite('45.000',1,999999),45000,'odometer thousands preserved');
assert.equal(finite('2.500,50',0,50000),2500.50,'Brazilian cost decimals preserved');
assert.equal(finite(48000,1,999999),48000);
const example={
 date:'2026-10-31T17:00:00.000Z',plate:'ABC1D23',brand:'FIAT',model:'MOBI LIKE',
 year:'2024',km:'45.000',cost:'2.500,50',value:76000,repasse:false,
 ads:[{source:'webmotors',url:'https://www.webmotors.com.br/comprar/fiat/mobi/like/2024/12345678',
  price:'89.900',km:'41.000',status:'valid',note:'Conferido'},
  {source:'webmotors',url:'https://fake-webmotors.com/comprar/fiat/mobi/like/2024/12345678',
  price:'1.000',km:'30.000',status:'valid'}]
};
const normalized=normalizePayload(example);
assert.equal(normalized.km,'45000');
assert.equal(normalized.cost,'2500.5');
assert.equal(normalized.ads.length,1,'Remove non-Webmotors origin');
assert.equal(normalized.ads[0].price,'89900');
assert.equal(normalized.ads[0].km,'41000');
assert.equal(normalized.ads[0].status,'valid');
const draft=normalizePayload({...example,value:0,ads:[]});
assert.equal(draft.value,0,'Allow draft without price');
assert.throws(()=>normalizePayload({...example,plate:'BADPLATE'}));
assert.throws(()=>normalizePayload({...example,model:''}));
assert.throws(()=>normalizePayload({...example,ads:[{price:90000,url:'http://example.com'}],date:'invalid'}));
assert.ok(server.includes("accountFromToken(idToken)"));
assert.ok(server.includes("userContext(sa,token,fb)"));
assert.ok(server.includes("['admin','manager','pricing']"));
assert.ok(server.includes("scope.companyId,storeId:scope.storeId"));
assert.ok(!api.includes('api/marketiq-pricing-history'));
assert.ok(api.includes("pricingHistoryHandler(req,res)"));
assert.ok(api.includes('const pricingHistoryHandler=(()=>{'),'History handler must be bundled in the API function');
assert.ok(!api.includes("import pricingHistoryHandler from '../services/marketiqPricingHistoryServer'"),'Do not use unresolvable extensionless TS imports in Vercel API routes');
assert.ok(api.includes('return async function handler(req:any,res:any)'),'Inline history function must be callable');

assert.ok(ui.includes("Histórico de avaliações"));
assert.ok(ui.includes("Salvar avaliação no histórico"));
assert.ok(ui.includes("historyRequest('save',record)"));
assert.ok(ui.includes("historyRequest('list')"));
assert.ok(ui.includes("Copiar avaliações antigas para o histórico"));
assert.ok(ui.includes("switchDeskSection('pricing')"));
console.log('Motyq IQ history: price/KM parsing, validation, security and UI integration checks passed.');


// API integration simulation: authenticates server-side, derives tenant from
// stored profile, writes once and retrieves the same immutable snapshot.
const fakeProfile={
  role:{stringValue:'pricing'},status:{stringValue:'active'},
  companyId:{stringValue:'tenant-a'},storeId:{stringValue:'unit-1'},
  name:{stringValue:'Mesa de Precificação'}
};
let persisted=null;
const calls=[];
let role='pricing';
const fakeFetch=async(target,init={})=>{
 const u=String(target);calls.push({url:u,method:init.method||'GET'});
 const success=(data)=>({ok:true,status:200,json:async()=>data});
 if(u.includes('identitytoolkit.googleapis.com'))return success({users:[{email:'mesa@example.com',emailVerified:true}]});
 if(u.includes('oauth2.googleapis.com'))return success({access_token:'mock_token'});
 if(u.includes('/documents/users/'))return success({fields:{...fakeProfile,role:{stringValue:role}}});
 if(u.includes('/evaluations')&&init.method==='POST'){
   persisted=JSON.parse(String(init.body));
   return success({name:'mock-document'});
 }
 if(u.includes('/evaluations')&&(!init.method||init.method==='GET'))
   return success({documents:persisted?[{fields:persisted.fields}]:[],nextPageToken:''});
 throw Error('Unexpected mocked URL: '+u);
};
const fakeConfig={projectId:'testing-project',firestoreDatabaseId:'(default)',apiKey:'demo-public-key'};
const src=server.replace(/^import .+;\s*$/gm,'').replace('export default async function handler','async function handler')+
 '\nresult=handler;';
const compiledHandler=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},reportDiagnostics:true});
assert.equal((compiledHandler.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const sandbox={
 result:null,URL,URLSearchParams,AbortSignal,Buffer,Date,console,
 fetch:fakeFetch,firebaseConfig:fakeConfig,
 process:{env:{FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({
   project_id:fakeConfig.projectId,client_email:'service@example.com',private_key:'dummy-key'
 })}},
 createSign:()=>({update(){return this;},end(){},sign(){return Buffer.from('mock_signature');}}),
 randomUUID:()=> 'mock-snapshot-001'
};
runInNewContext(compiledHandler.outputText,sandbox);
const handler=sandbox.result;
const mkRes=()=>({
 code:200,body:null,
 setHeader(){return this;},
 status(code){this.code=code;return this;},
 json(body){this.body=body;return this;}
});
const auth={method:'POST',headers:{authorization:'Bearer demo-session'}};
const write=mkRes();
await handler({...auth,body:{action:'pricing_history_save',evaluation:example,companyId:'other-tenant',storeId:'other-unit'}},write);
assert.equal(write.code,200,JSON.stringify(write.body));
assert.equal(write.body.saved,true);
assert.equal(write.body.record.companyId,'tenant-a');
assert.equal(write.body.record.storeId,'unit-1');
assert.equal(write.body.record.createdByName,'Mesa de Precificação');
assert.equal(write.body.record.ads[0].price,'89900');
assert.equal(write.body.record.id,'mock-snapshot-001');
assert.ok(calls.some(x=>x.url.includes('/marketiq_pricing_histories_v1/tenant-a/stores/unit-1/evaluations')));
assert.ok(!calls.some(x=>x.url.includes('/other-tenant/')));
const list=mkRes();
await handler({...auth,body:{action:'pricing_history_list'}},list);
assert.equal(list.code,200);
assert.equal(list.body.records.length,1);
assert.equal(list.body.records[0].plate,'ABC1D23');
assert.equal(list.body.records[0].ads[0].km,'41000');
role='seller';
const forbidden=mkRes();
await handler({...auth,body:{action:'pricing_history_list'}},forbidden);
assert.equal(forbidden.code,403,'Seller must not access pricing history');
fakeProfile.pricingDeskAccess={booleanValue:true};
const granted=mkRes();
await handler({...auth,body:{action:'pricing_history_list'}},granted);
assert.equal(granted.code,200,'Active seller with explicitly assigned desk access may open history');
assert.equal(granted.body.records.length,1);
fakeProfile.pricingDeskAccess={booleanValue:false};
const unauthorized=mkRes();
await handler({method:'POST',headers:{},body:{action:'pricing_history_list'}},unauthorized);
assert.equal(unauthorized.code,401);
console.log('Motyq IQ history: mocked authentication, isolated save/list, audit and denial passed.');
