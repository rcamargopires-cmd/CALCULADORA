import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=readFileSync('services/marketiqPricingHistoryServer.ts','utf8');
const api=readFileSync('api/marketiq-market-scan.ts','utf8');
const ui=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
assert.ok(api.includes('groupHistoryByDay(hydratePaidRecords(rows))'));
assert.ok(source.includes("kind:'valuation_revision'"));
assert.ok(ui.includes('Avaliação de hoje atualizada sem criar duplicidade.'));
assert.ok(ui.includes('await refreshHistory();'));

let clock='2026-11-03T20:40:00.000Z';
class FixedDate extends Date {
 constructor(...args){super(...(args.length?args:[clock]));}
 static now(){return new Date(clock).getTime();}
}
const js=ts.transpileModule(source.replace(/^import .+;\s*$/gm,'')
 .replace('export default async function handler','async function handler')+'\nresult=handler;',{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},reportDiagnostics:true
});
assert.equal((js.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const db=new Map();
let company='tenant-a',store='unit-1',seq=0;
const ok=data=>({ok:true,status:200,json:async()=>data});
const fail=code=>({ok:false,status:code,json:async()=>({})});
const prefix=(c=company,s=store)=>'/marketiq_pricing_histories_v1/'+c+'/stores/'+s+'/evaluations/';
const put=record=>db.set(prefix()+record.id,{fields:{payload:{stringValue:JSON.stringify(record)}}});
const mockFetch=async(url,init={})=>{
 const text=String(url),method=init.method||'GET';
 if(text.includes('identitytoolkit.googleapis.com'))return ok({users:[{email:'mesa@example.com',emailVerified:true}]});
 if(text.includes('oauth2.googleapis.com'))return ok({access_token:'mock'});
 if(text.includes('/documents/users/'))return ok({fields:{
  role:{stringValue:'manager'},status:{stringValue:'active'},companyId:{stringValue:company},
  storeId:{stringValue:store},name:{stringValue:'Mesa'}
 }});
 if(!text.includes('/evaluations'))throw Error('Unexpected fetch '+text);
 const route=new URL(text),base=route.pathname.split('/evaluations')[0]+'/evaluations/';
 const doc=route.pathname.split('/evaluations/')[1];
 if(method==='POST'){
   const id=route.searchParams.get('documentId');
   if(db.has(base+id))return fail(409);
   db.set(base+id,JSON.parse(init.body));return ok({});
 }
 if(doc)return db.has(base+doc)?ok(db.get(base+doc)):fail(404);
 return ok({documents:[...db.entries()].filter(([key])=>key.startsWith(base)).map(([,value])=>value),nextPageToken:''});
};
const fakeConfig={projectId:'test-project',firestoreDatabaseId:'(default)',apiKey:'test'};
const vm={result:null,URL,URLSearchParams,Intl,Date:FixedDate,AbortSignal,Buffer,console,
 fetch:mockFetch,firebaseConfig:fakeConfig,
 process:{env:{FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({
 project_id:'test-project',client_email:'service@test.com',private_key:'dummy'
 })}},
 createSign:()=>({update(){return this;},end(){},sign(){return Buffer.from('sig');}}),
 randomUUID:()=> '00000000-0000-4000-8000-'+String(++seq).padStart(12,'0')
};
runInNewContext(js.outputText,vm);
const res=()=>({code:200,body:null,setHeader(){return this;},status(c){this.code=c;return this;},json(b){this.body=b;return this;}});
const send=async(action,payload={})=>{const r=res();await vm.result({method:'POST',headers:{authorization:'Bearer token'},body:{action,...payload}},r);return r;};
const sample=(plate,value,time=clock)=>({
 plate,brand:'HYUNDAI',model:'HB20',year:'2017',km:'48000',cost:'1000',
 date:time,value,ads:[],repasse:false,companyId:company,storeId:store
});
const older={...sample('GFN8505',36700,'2026-11-03T20:22:53Z'),
 id:'00000000-0000-4000-8000-900000000001',createdAt:'2026-11-03T20:22:53Z'};
const newer={...sample('GFN8505',36700,'2026-11-03T20:25:12Z'),
 id:'00000000-0000-4000-8000-900000000002',createdAt:'2026-11-03T20:25:12Z'};
put(older);put(newer);
put({kind:'valuation_approved',id:'00000000-0000-4000-8000-900000000003',
 evaluationId:newer.id,approvedValue:38000,approvedAt:'2026-11-03',
 recordedAt:'2026-11-03T20:27:00Z',recordedBy:'Mesa',companyId:company,storeId:store});
let list=await send('pricing_history_list');
assert.equal(list.code,200);
assert.equal(list.body.records.length,1,'Two legacy HB20 entries must become one card');
assert.equal(list.body.records[0].groupedRecords,2);
assert.equal(list.body.records[0].paidValue,38000,'Existing approved price stays visible');
const update=await send('pricing_history_save',{evaluation:sample('GFN8505',35500)});
assert.equal(update.code,200,JSON.stringify(update.body));
assert.equal(update.body.updated,true);
assert.equal(update.body.record.id,newer.id);
assert.equal([...db.values()].filter(x=>{const r=JSON.parse(x.fields.payload.stringValue);return r.plate==='GFN8505'&&r.kind!=='valuation_revision';}).length,2);
list=await send('pricing_history_list');
assert.equal(list.body.records.length,1);
assert.equal(list.body.records[0].value,35500);
assert.equal(list.body.records[0].paidValue,38000);
assert.equal(list.body.records[0].valuationVersions,3);
assert.equal(list.body.records[0].revisionCount,1);
const car={...sample('ABC1D23',70000),brand:'VW',model:'POLO'};
const first=await send('pricing_history_save',{evaluation:car});
assert.equal(first.code,200);
assert.equal(first.body.updated,false);
assert.equal(first.body.record.id,'eval_20261103_ABC1D23');
const again=await send('pricing_history_save',{evaluation:{...car,value:68000}});
assert.equal(again.code,200);
assert.equal(again.body.updated,true);
assert.equal(again.body.record.id,first.body.record.id);
list=await send('pricing_history_list');
assert.equal(list.body.records.length,2);
assert.equal(list.body.records.find(x=>x.plate==='ABC1D23').value,68000);
assert.equal(list.body.records.find(x=>x.plate==='ABC1D23').valuationVersions,2);
const approval=await send('pricing_history_approved',{evaluationId:first.body.record.id,amount:65000,approvedAt:'2026-11-03'});
assert.equal(approval.code,200,'Canonical daily id allows approval');
list=await send('pricing_history_list');
assert.equal(list.body.records.find(x=>x.plate==='ABC1D23').paidValue,65000);
const parallel={...sample('QWE1A23',28000),brand:'GM',model:'ONIX'};
const results=await Promise.all([
 send('pricing_history_save',{evaluation:parallel}),
 send('pricing_history_save',{evaluation:{...parallel,value:27500}})
]);
assert.ok(results.every(r=>r.code===200),JSON.stringify(results.map(r=>r.body)));
assert.equal(new Set(results.map(r=>r.body.record.id)).size,1,'Simultaneous tabs use the same canonical id');
list=await send('pricing_history_list');
assert.equal(list.body.records.filter(x=>x.plate==='QWE1A23').length,1);
store='unit-2';
const otherStore=await send('pricing_history_save',{evaluation:car});
assert.equal(otherStore.code,200);
assert.equal(otherStore.body.updated,false,'Different stores are independently scoped');
store='unit-1';
clock='2026-11-04T15:00:00.000Z';
const tomorrow=await send('pricing_history_save',{evaluation:sample('GFN8505',33000)});
assert.equal(tomorrow.code,200);
assert.equal(tomorrow.body.updated,false,'A new day permits a separate evaluation');
list=await send('pricing_history_list');
assert.equal(list.body.records.filter(x=>x.plate==='GFN8505').length,2);
console.log('Daily uniqueness: HB20 legacy duplicates, paid value, audit revisions, concurrent saving, unit scope and next-day evaluation passed.');
