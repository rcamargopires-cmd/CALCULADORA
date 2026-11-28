import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('server/motyqDealerShared.ts','utf8');
const endpoint=readFileSync('server/motyqDealerSharedGateway.ts','utf8');
const existingApi=readFileSync('api/analyze-deal.ts','utf8');
const client=readFileSync('services/marketIqDealerCloudClient.ts','utf8');
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const panel=readFileSync('components/MarketIqDealerRadarPanel.tsx','utf8');
const opts={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX};
for(const [name,code] of [['server',source],['endpoint',endpoint],['client',client],
 ['workspace',workspace],['panel',panel]]){
 const transpiled=ts.transpileModule(code,{fileName:name+'.tsx',
  compilerOptions:opts,reportDiagnostics:true});
 assert.equal((transpiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,
 0,name+' must parse');
}
const output=ts.transpileModule(source.replace(
 "import {motyqFirestore} from './motyqFirestore.js';",
 "const motyqFirestore={get(){throw Error('MUST_NOT_CALL_GLOBAL_DB')},patch(){throw Error('MUST_NOT_CALL_GLOBAL_DB')}};"
 ),{compilerOptions:opts}).outputText;
const m=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
const make=(plate,reportDate='2026-11-23')=>({
 importedAt:'2026-11-23T09:00:00Z',reportDate,sourceFileName:'Dealer_V44.xlsm',
 duplicateCount:0,stores:['Outlet','Centro'],warnings:[],serviceOrderRows:0,
 vehicles:[{
  key:'PLATE:'+plate,plate,chassis:'9BW00000012345678',
  brand:'VOLKSWAGEN',model:'VW/T CROSS HL TSI',year:'2024/2025',
  km:43000,kmOriginal:'43000',kmValid:true,fuel:'FLEX',transmission:'AUTOMATICO',
  days:37,price:110000,purchase:90000,cost:94000,operationalCost:1500,
  osRule:0,osOutside:0,store:'Outlet',buyingCompany:'Empresa',
  location:'Centro',condition:'NOVO',vehicleType:'car',
  serviceOrders:0,familyKey:'VW|T CROSS',exactKey:'VW|T CROSS|2024/2025'
 }]
});
let docs=new Map(),calls=[],blockChunk=false;
const db={
 get:async(collection,id)=>docs.get(collection+'|'+id)||null,
 patch:async(collection,id,payload)=>{
  calls.push({collection,id,payload});
  if(blockChunk&&collection===m.DEALER_SHARED_CHUNKS)throw Error('network_failed');
  docs.set(collection+'|'+id,payload);
  return {...payload,id};
 }
};
assert.equal(m.canReadDealerStock({status:'active',role:'manager'}),true);
assert.equal(m.canReadDealerStock({status:'active',role:'seller'}),false);
assert.equal(m.canReadDealerStock({status:'inactive',role:'admin'}),false);
assert.equal(m.canReadDealerStock({status:'active',role:'seller',pricingDeskAccess:true}),true);
assert.equal(m.canPublishDealerStock({status:'active',role:'seller'}),false);
assert.equal(m.canPublishDealerStock({status:'active',role:'manager'}),true);
assert.throws(()=>m.safeCompany('../outro'),/company_scope_invalid/);
assert.throws(()=>m.cleanDealerSharedSnapshot({...make('ABC1D23'),vehicles:[]}),/invalid_vehicle_count/);
assert.throws(()=>m.cleanDealerSharedSnapshot({...make('ABC1D23'),reportDate:'2026-02-31'}),/invalid_report_date/);
const cleaned=m.cleanDealerSharedSnapshot({...make('ABC1D23'),dangerous:true,
 vehicles:[{...make('ABC1D23').vehicles[0],secret:'not_saved'}]});
assert.equal(cleaned.dangerous,undefined);
assert.equal(cleaned.vehicles[0].secret,undefined,'Only allowlisted Dealer fields can persist');
assert.equal(await m.loadDealerShared('empresa-1',db),null);
const published=await m.publishDealerShared('empresa-1',make('ABC1D23'),'gestor@example.invalid',db);
assert.equal(published.current.vehicles[0].plate,'ABC1D23');
assert.equal(calls.at(-1).collection,m.DEALER_SHARED_MANIFEST,'Manifest is committed last');
assert.equal((await m.loadDealerShared('empresa-1',db)).current.vehicles[0].plate,'ABC1D23');
assert.equal(await m.loadDealerShared('empresa-2',db),null,'Company scope is isolated');
const many=make('ABC1D23');
many.vehicles=Array.from({length:137},(_,i)=>({
 ...many.vehicles[0],plate:'ABC'+String(i+1).padStart(4,'0'),
 key:'PLATE:ABC'+String(i+1).padStart(4,'0')
}));
const countBefore=calls.length;
const bigger=await m.publishDealerShared('empresa-1',many,'gestor@example.invalid',db);
assert.equal(bigger.current.vehicles.length,137);
assert.equal((await m.loadDealerShared('empresa-1',db)).previous.vehicles[0].plate,'ABC1D23',
 'Previous company snapshot survives for change comparison');
assert.equal(calls.slice(countBefore).filter(c=>c.collection===m.DEALER_SHARED_CHUNKS).length,3,
 'Chunked storage must not exceed one Firestore document for all stock');
assert.equal(calls.slice(countBefore).at(-1).collection,m.DEALER_SHARED_MANIFEST);
await assert.rejects(()=>m.publishDealerShared('empresa-1',make('OLDER12','2026-11-22'),
 'gestor@example.invalid',db),/older_report_rejected/);
assert.equal((await m.loadDealerShared('empresa-1',db)).current.vehicles.length,137,
 'An older report cannot roll back company stock');
blockChunk=true;
await assert.rejects(()=>m.publishDealerShared('empresa-1',make('NEW1A23','2026-11-24'),
 'gestor@example.invalid',db),/network_failed/);
blockChunk=false;
assert.equal((await m.loadDealerShared('empresa-1',db)).current.vehicles.length,137,
 'Failed chunk upload must preserve the previous manifest');
const oneChunkKey=[...docs.keys()].find(k=>k.startsWith(m.DEALER_SHARED_CHUNKS+'|empresa-1__'+bigger.revision));
const backup=docs.get(oneChunkKey);
docs.delete(oneChunkKey);
await assert.rejects(()=>m.loadDealerShared('empresa-1',db),/shared_stock_incomplete/);
docs.set(oneChunkKey,backup);
assert.equal((await m.loadDealerShared('empresa-1',db)).current.vehicles.length,137);
assert.ok(!endpoint.includes("firebase-applet-config.json"),'Serverless runtime must never import JSON without attributes');
assert.ok(!endpoint.includes('authenticatedActor('),'Gateway must not duplicate login/profile logic');
assert.ok(endpoint.includes('motyqDealerSharedGateway(req:any,res:any,actor:any)'));
assert.ok(existingApi.includes("currentUserProfileWithIdToken(token,email)"),'Use existing server-side Firestore role profile');
assert.ok(existingApi.includes('ensureReinaldoDeskAccess(email,await ensureEvandroIqOnly(email,profile))'),
 'Honor the same authorized desk access as the regular login');
assert.ok(existingApi.includes("profile.status!=='active'"),'Inactive account must not access Dealer stock');
assert.ok(existingApi.includes("return res.status(403).json({error:'inactive_or_missing_user'})"));
assert.ok(existingApi.includes("if(!token)return res.status(401).json({error:'not_authenticated'})"));
assert.ok(endpoint.includes("company!==ownCompany"),'Forbid cross-company reads and writes');
assert.ok(endpoint.includes("canPublishDealerStock(actor)"),'Restrict writers');
assert.ok(endpoint.includes("canReadDealerStock(actor)"),'Restrict readers');
assert.ok(endpoint.includes("cache-Control")||endpoint.includes("Cache-Control"));
assert.ok(existingApi.includes("bodyParser:{sizeLimit:'4mb'}"));
assert.ok(existingApi.includes("dealer-stock'){"),'Dealer uses existing Vercel API function');
assert.ok(existingApi.includes('return motyqDealerSharedGateway(req,res,actor)'),
 'Profile already verified by existing Motyq login is passed to Dealer gateway');
assert.ok(client.includes("action=dealer-stock"));
assert.ok(client.includes("auth.authStateReady()"),'Wait for Firebase session hydration');
assert.ok(client.includes("auth.currentUser")&&client.includes("user.getIdToken()"));
assert.ok(workspace.includes('getDealerCloudArchive(dealerCompanyId)'));
assert.ok(workspace.includes('publishDealerCloudArchive(dealerCompanyId,next)'));
assert.ok(workspace.includes('readDealerLocalArchive(captureScope)'));
assert.ok(workspace.includes('cloudLastChecked.current>120_000'));
assert.ok(workspace.includes('radarLoadedScope!==captureScope'),'Tenant-aware hydration');
assert.ok(panel.includes('await props.onPublishSnapshot(snapshot)'),'Publish BEFORE showing success');
assert.ok(panel.includes('Publicar estoque atual para a empresa'));
assert.ok(panel.includes('Atualizar estoque da empresa'));
assert.ok(panel.includes('onPublishSnapshot?:(snapshot:DealerStockSnapshot)=>Promise<void>'));
assert.ok(panel.includes('SALVAS NESTE NAVEGADOR'),'Clear is explicitly local-only');
// Optional Google Drive access must never introduce a public file endpoint or leak OAuth tokens.
const driveSource=readFileSync('services/marketIqGoogleDriveStock.ts','utf8');
const driveTranspiled=ts.transpileModule(driveSource,{fileName:'marketIqGoogleDriveStock.ts',compilerOptions:opts,reportDiagnostics:true});
assert.equal((driveTranspiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,'Drive importer must parse');
assert.ok(driveSource.includes('drive.readonly'),'Google Drive read-only permission');
assert.ok(driveSource.includes('reauthenticateWithPopup'),'Google account explicitly reauthorizes the application');
assert.ok(driveSource.includes('providerId===\'google.com\''),'Do not silently replace the existing MOTYQ login');
assert.ok(driveSource.includes('MAX_BYTES=42*1024*1024'),'Limit workbook size');
assert.ok(driveSource.includes('new File([payload]'),'Reuse established Dealer workbook parser');
assert.ok(!driveSource.includes('localStorage')&&!driveSource.includes('sessionStorage'),'OAuth token and workbook bytes are never persisted by the Drive connector');
assert.ok(panel.includes('fetchDealerDriveWorkbook(driveLink)'),'Radar can pull a consenting users Drive file');
assert.ok(panel.includes('const loaded=await importFile(file,true)'),'Drive import stays local only');
assert.ok(panel.includes('if(!localOnly&&props.onPublishSnapshot)'),'No new bank publish from Drive import');
console.log('Motyq IQ Google Drive opt-in: user-scoped OAuth, read-only, file size, local import and no raw data sharing passed.');
console.log('Motyq IQ Dealer cloud: company isolation, verified roles, atomic manifests, chunks, old-report guard, failed-upload fallback and shared UI verified.');
