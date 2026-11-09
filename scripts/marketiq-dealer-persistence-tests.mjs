import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});

const service=readFileSync('services/marketIqDealerLocalArchive.ts','utf8');
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const panel=readFileSync('components/MarketIqDealerRadarPanel.tsx','utf8');
const src=readFileSync('services/marketIqDealerRadar.ts','utf8');
const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX};
const compiled=ts.transpileModule(service,{compilerOptions:options,reportDiagnostics:true});
assert.equal((compiled.diagnostics||[]).filter(q=>q.category===ts.DiagnosticCategory.Error).length,0);
for(const text of [workspace,panel,src]){
 const result=ts.transpileModule(text,{compilerOptions:options,reportDiagnostics:true});
 assert.equal((result.diagnostics||[]).filter(q=>q.category===ts.DiagnosticCategory.Error).length,0);
}
const memory=new Map();
let created=false;
const fakeDB={
 objectStoreNames:{contains:()=>created},
 createObjectStore:()=>{created=true;},
 close:()=>{},
 onversionchange:null,
 transaction:()=>{
  const tx={oncomplete:null,onerror:null,onabort:null};
  const op=(kind,key,record)=>{
   const req={result:undefined,error:null,onsuccess:null,onerror:null};
   queueMicrotask(()=>{
    if(kind==='get')req.result=memory.get(key);
    if(kind==='put')memory.set(record.key,record);
    if(kind==='delete')memory.delete(key);
    req.onsuccess?.();
    queueMicrotask(()=>tx.oncomplete?.());
   });
   return req;
  };
  tx.objectStore=()=>({
   get:key=>op('get',key),
   put:record=>op('put',record.key,record),
   delete:key=>op('delete',key)
  });
  return tx;
 }
};
globalThis.indexedDB={
 open:()=>{
  const request={result:fakeDB,onupgradeneeded:null,onsuccess:null,onerror:null,onblocked:null};
  queueMicrotask(()=>{
   if(!created)request.onupgradeneeded?.();
   request.onsuccess?.();
  });
  return request;
 }
};
const module=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputText).toString('base64'));
const {readDealerLocalArchive,persistDealerLocalArchive,clearDealerLocalArchive,
 validateDealerArchive,isValidDealerSnapshot}=module;
const make=(plate,date,price)=>({
 importedAt:'2026-11-09T14:20:00.000Z',reportDate:date,
 sourceFileName:'ConsultaEstoqueVeiculos_V44.xlsm',duplicateCount:0,
 warnings:[],stores:['Sorocaba'],serviceOrderRows:1,
 vehicles:[{
  key:'PLATE:'+plate,plate,chassis:'',brand:'FIAT',model:'MOBI TREKKING',
  year:'2023/2024',km:22000,kmOriginal:'22000',kmValid:true,
  fuel:'Flex',transmission:'Manual',days:25,price,
  purchase:40000,cost:45000,operationalCost:500,osRule:100,osOutside:0,
  store:'Sorocaba',buyingCompany:'Grupo',location:'Loja',condition:'Usado',
  vehicleType:'car',serviceOrders:1,familyKey:'FIAT|MOBI',exactKey:'FIAT|MOBI|2023/2024'
 }]
});
const current=make('FBF5113','2026-11-09',61000);
const prior=make('ABC1D23','2026-10-31',59000);
assert.equal(isValidDealerSnapshot(current),true);
assert.equal(isValidDealerSnapshot({...current,vehicles:[]}),false);
assert.equal(validateDealerArchive({...current,version:1,key:'xxx',current,previous:null,savedAt:'2026-11-09'})?.current?.reportDate,'2026-11-09');
assert.equal(validateDealerArchive({version:2,current,previous:null}),null);
const accountA='company-1|sorocaba|mesa@example.invalid';
const accountB='company-1|other|mesa@example.invalid';
assert.equal(await readDealerLocalArchive(accountA),null);
await persistDealerLocalArchive(accountA,current,prior);
assert.equal(memory.size,1);
assert.ok(![...memory.keys()][0].includes('mesa@example.invalid'),'Raw account identifier is not the browser cache key');
assert.equal((await readDealerLocalArchive(accountA))?.current?.vehicles[0].plate,'FBF5113');
assert.equal((await readDealerLocalArchive(accountA))?.previous?.vehicles[0].plate,'ABC1D23');
assert.equal((await readDealerLocalArchive(accountA))?.current?.sourceFileName,'ConsultaEstoqueVeiculos_V44.xlsm');
assert.equal(await readDealerLocalArchive(accountB),null,'Account/unit must not see another scoped cache');
await persistDealerLocalArchive(accountB,prior,null);
assert.equal(memory.size,2);
const latest=make('NXT2B77','2026-11-10',62000);
const first=persistDealerLocalArchive(accountA,prior,current);
const second=persistDealerLocalArchive(accountA,latest,prior);
await Promise.all([first,second]);
assert.equal((await readDealerLocalArchive(accountA))?.current?.vehicles[0].plate,'NXT2B77',
 'Most recent save should win, even when imports race');
await clearDealerLocalArchive(accountA);
assert.equal(await readDealerLocalArchive(accountA),null);
assert.equal((await readDealerLocalArchive(accountB))?.current?.vehicles[0].plate,'ABC1D23',
 'Clear in one scope cannot erase another account cache');
assert.ok(workspace.includes('readDealerLocalArchive(captureScope)'),'Restore on workspace load');
assert.ok(workspace.includes('persistDealerLocalArchive(captureScope,radarSnapshot,radarPreviousSnapshot)'));
assert.ok(workspace.includes('radarWriteRevision===0'),'Hydration must not save stale data');
assert.ok(workspace.includes('radarLoadedScope!==captureScope'),'Do not expose another user scope before hydration');
assert.ok(workspace.includes('localArchiveState={radarCacheState}'),'Radar explains local caching');
assert.ok(workspace.includes('updateRadarSnapshot')&&workspace.includes('updateRadarPreviousSnapshot'));
assert.ok(panel.includes('sourceFileName:file.name.slice(0,140)'),'Remember filename but not raw workbook');
assert.ok(panel.includes('setPrevious(current);setCurrent(snapshot)'),'Replacement retains previous report');
assert.ok(panel.includes("setPrevious(snapshot);setError("),'Importing an older snapshot does not overwrite newer current stock');
assert.ok(panel.includes('snapshotOutdated'),'Stale report warning required');
assert.ok(panel.includes('SALVAS NESTE NAVEGADOR'),'Clear must explicitly warn about deleting saved local inventory');
assert.ok(!service.includes('fetch(')&&!service.includes('firebase')&&
 !service.includes('localStorage.setItem'),'Parsed inventory is private in IDB only');
console.log('Motyq IQ Dealer persistence: IndexedDB save/reload, hashed tenant isolation, two snapshots, newer wins, local deletion, freshness UI and no upload passed.');
