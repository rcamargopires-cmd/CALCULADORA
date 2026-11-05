import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('services/marketIqCapturedDraftStorage.ts','utf8');
const panel=readFileSync('components/MarketIqCapturedReviewPanel.tsx','utf8');
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
},reportDiagnostics:true});
assert.equal((compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
const {captureDraftKey,readCaptureDraft,writeCaptureDraft,clearCaptureDraft,CAPTURE_DRAFT_DAYS}
 =await import('data:text/javascript;base64,'+Buffer.from(compiled.outputText).toString('base64'));
assert.equal(CAPTURE_DRAFT_DAYS,14);
const map=new Map();
const storage={
 getItem:k=>map.get(k)??null,
 setItem:(k,v)=>map.set(k,String(v)),
 removeItem:k=>map.delete(k)
};
const now=1771000000000;
const scope='companyA|storeA|seller@example.com';
const input={vehicleType:'car',brandCode:'JEEP',modelCode:'COMPASS',yearCode:'2025-1',km:'75.200',plate:'ABC-1D23'};
const key=captureDraftKey(input);
assert.ok(key.includes('ABC1D23'),'Plate must be part of evaluation draft identity');
assert.notEqual(key,captureDraftKey({...input,plate:'DEF-4G56'}));
assert.notEqual(key,captureDraftKey({...input,km:'72.000'}));
assert.notEqual(key,captureDraftKey({...input,yearCode:'2024-1'}));
const make=(id,price=119900,km=50000,overrides={})=>({
 source:'webmotors',price:String(price),km:String(km),year:2025,
 url:'https://www.webmotors.com.br/comprar/jeep/compass/13-t270-turbo-flex-longitude-at6/2024-2025/'+id,
 title:'Compass 1.3 longitude - anúncio',note:'Conferir',auto:false,catalog:false,status:'pending',...overrides
});
const first=make('12345678',115990,49080);
const second=make('12345679',118990,57000);
const invalid=make('12345680',118990,57000,{url:'https://evil.example/comprar/jeep/compass/version/2024-2025/12345680'});
const pasted=make('12345681',118990,57000,{url:'https://www.webmotors.com.br/carros/sp/jeep/compass'});
const base={
 captured:[first,second,first,invalid,pasted],
 imported:[{...first,status:'valid',year:undefined},invalid],
 review:{selectedIds:[first.url],checkedIds:[first.url,invalid.url]}
};
assert.equal(writeCaptureDraft(storage,scope,key,base,now),true);
const record=readCaptureDraft(storage,scope,key,now+60);
assert.ok(record,'Draft should survive browser refresh');
assert.equal(record.captured.length,2,'Reject dangerous URLs and de-duplicate valid captured listings');
assert.deepEqual(record.review.checkedIds,[first.url],'Only valid captured URLs retain review markings');
assert.deepEqual(record.review.selectedIds,[first.url],'Preserve explicit operator selection');
assert.equal(record.imported.length,1);
assert.equal(record.imported[0].status,'pending','A restored local draft must never auto-approve a purchase');
assert.equal(record.captured[0].price,'115990');
assert.equal(readCaptureDraft(storage,'companyB|storeA|seller@example.com',key,now+60),null,
 'Other companies must never see this local capture');
assert.equal(readCaptureDraft(storage,'companyA|storeA|other@example.com',key,now+60),null,
 'Other users must never see this local capture');
assert.equal(readCaptureDraft(storage,scope,captureDraftKey({...input,plate:'OTHER'}),now+60),null,
 'Other vehicles must not receive the wrong capture');
assert.equal(readCaptureDraft(storage,scope,key,now+CAPTURE_DRAFT_DAYS*86400000+1),null,
 'Old local drafts expire after the 14-day retention period');
assert.equal(clearCaptureDraft(storage,scope,key,now+1000),true);
assert.equal(readCaptureDraft(storage,scope,key,now+1000),null);
assert.equal(writeCaptureDraft(storage,scope,key,{
 captured:[first],imported:[],review:{selectedIds:null,checkedIds:[]}
},now+4000),true);
assert.equal(readCaptureDraft(storage,scope,key,now+4001).review.selectedIds,null,
 'Unmodified selection defaults are not confused with an explicit empty selection');
assert.equal(writeCaptureDraft(storage,scope,key,{
 captured:[first],imported:[],review:{selectedIds:[],checkedIds:[]}
},now+5000),true);
assert.deepEqual(readCaptureDraft(storage,scope,key,now+5001).review.selectedIds,[],
 'Manually unchecking all items must survive refresh');
for(let i=0;i<25;i++){
 writeCaptureDraft(storage,scope,'key-'+i,{
  captured:[make(String(12345680+i))],imported:[],review:{selectedIds:null,checkedIds:[]}
 },now+6000+i);
}
let raw=JSON.parse([...map.values()][0]);
assert.ok(Object.keys(raw.entries).length<=20,'At most 20 recent evaluation drafts are retained');
assert.equal(readCaptureDraft(storage,scope,'key-0',now+9000),null,'Oldest records are pruned');
assert.ok(readCaptureDraft(storage,scope,'key-24',now+9000));
const corrupt=new Map([['motyq-iq-private-capture-v1-'+encodeURIComponent(scope),'invalid-json']]);
const broken={getItem:k=>corrupt.get(k)||null,setItem:(k,v)=>corrupt.set(k,v),removeItem:k=>corrupt.delete(k)};
assert.equal(readCaptureDraft(broken,scope,key,now),null,'Corrupt browser storage cannot crash evaluation');
assert.equal(readCaptureDraft(undefined,scope,key,now),null,'Private browsing is graceful');

assert.ok(panel.includes('Média dos {activeTopFive.length} menores selecionados'),
 'The mean label must say 3 when only 3 ads are selected, not 5');
assert.ok(panel.includes('Conferidos por você'));
assert.ok(panel.includes('Conferi os dados'));
assert.ok(panel.includes("r.reviewState==='review'&&!checked.has(id)"),
 'Flagged offers are not selectable before the user explicitly checks them');
assert.ok(panel.includes('checkedCount'),'Operator verification must be visibly counted');
assert.ok(panel.includes("onImport(yetToImport.map(r=>r.item as T))"),
 'Already imported listings should not be sent again');
assert.ok(panel.includes('nunca como compra aprovada'));
assert.ok(workspace.includes('captureDraftKey({vehicleType,brandCode,modelCode,yearCode,km,plate})'));
assert.ok(workspace.includes("const captureScope=[user.companyId||'',user.storeId||'',user.email.toLowerCase()].join"));
assert.ok(workspace.includes('readCaptureDraft(window.localStorage'));
assert.ok(workspace.includes('writeCaptureDraft(window.localStorage'));
assert.ok(workspace.includes('clearCaptureDraft(window.localStorage'));
assert.ok(workspace.includes('onReviewChange={setCaptureReview}'));
assert.ok(workspace.includes('Rascunho salvo neste navegador por até'));
assert.ok(workspace.includes("freshCaptureRef.current=null"),'A browser-return capture can be recognized once');
assert.ok(!workspace.includes("setExtensionInbox([]);\\n   setExtensionNotice(validIncoming.length"),
 'Imported capture remains visible for review and subsequent restoration');
assert.ok(workspace.includes('referenceAvg*.86*(repasse?.95:1)'));
assert.ok(workspace.includes('avg*.86*(repasse?.95:1)'));
console.log('Motyq IQ durable capture: plate/account isolation, 14d TTL, duplicates, safe pending restoration, explicit review persistence, dynamic 3-of-5 average and formulas passed.');
