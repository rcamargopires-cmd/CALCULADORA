import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const desk=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const mobile=readFileSync('components/MarketIqMobileExperience.tsx','utf8');
const context=readFileSync('services/marketIqCaptureReturnContext.ts','utf8');
const compilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX};
for(const body of [desk,mobile,context]){
 const {diagnostics}=ts.transpileModule(body,{compilerOptions,reportDiagnostics:true});
 assert.equal((diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
}
const section=(start,end)=>{
 const i=desk.indexOf(start),j=desk.indexOf(end,i+1);
 assert.ok(i>=0&&j>i,'Expected success/failure section found: '+start);
 return desk.slice(i,j);
};
const reset=section(' const resetCurrentValuation=()=>{',' const save=async(');
for(const statement of [
 "sessionStorage.removeItem(formKey)","clearCaptureReturnContext(window.localStorage,captureScope)",
 "clearCaptureDraft(window.localStorage,captureScope,captureKey)",
 "setPlate('')","setBrand('')","setBrandCode('')","setModel('')","setModelCode('')",
 "setYear('')","setYearCode('')","setKm('')","setCost('0')",
 "setVehicleType('car')","setFipe(null)","setNewApprovedValue('')",
 "setNewApprovedDate(localDate())","setAds([])","setAdsVehicleKey('')",
 "setAutoSearchKey('')","setAutoError('')","setIndexedBrowsePages([])",
 "setManualClassification('')","setClassificationReason('')",
 "setDestinationOverride('auto')","setDirectRepasseReason('none')",
 "setExtensionInbox([])","setCaptureReview({selectedIds:null,checkedIds:[]})",
 "setDesktopMesaReference(null)","switchDeskSection('pricing')"
])assert.ok(reset.includes(statement),'Missing field reset: '+statement);
assert.ok(reset.includes('valuationEpoch.current+=1'),'Old async search must be invalidated');
const save=section(' const save=async(',' const restore=(');
const serverConfirm=save.indexOf("const result=await historyRequest('save',record)");
const confirmed=save.indexOf("if(result.saved!==true)throw");
const approved=save.indexOf("await historyRequest('approved'");
const failures=save.indexOf("if(failures.length){");
const success=save.indexOf('resetCurrentValuation();');
const catchBlock=save.indexOf('}catch(error:any){',success);
assert.ok(0<=serverConfirm&&serverConfirm<confirmed&&confirmed<approved&&approved<failures&&failures<success&&success<catchBlock,
 'Reset must be after confirmed evaluation+optional paid event and only in successful branch');
const ifFailed=save.slice(failures,success);
assert.ok(ifFailed.includes('não registrado')||ifFailed.includes('Não salve novamente'),
 'Failed paid registration must retain the form for a later correction');
assert.ok(!save.slice(catchBlock).includes('resetCurrentValuation()'),
 'Failed save must keep form values');
assert.ok(save.includes('setSaveSuccessMessage(receipt+'),'Success acknowledgment visible');
assert.ok(save.includes('setMobileSaveResetSignal(previous=>previous+1)'));
const manual=section(' const beginNewMobileValuation=():boolean=>{',' const input=');
assert.ok(manual.includes('window.confirm(')&&manual.includes('resetCurrentValuation()'),
 'Manual new valuation requires confirmation');
assert.ok(desk.includes('resetAfterSaveSignal={mobileSaveResetSignal}'));
assert.ok(desk.includes('{saveSuccessMessage&&<div role="status"'));
assert.ok(desk.includes("if(searchEpoch!==valuationEpoch.current)return"),
 'Stale in-flight ads ignored when a new valuation starts');
assert.ok(mobile.includes('if(!p.resetAfterSaveSignal)return;'));
assert.ok(mobile.includes("changeTab('pricing')"),'Mobile goes to new pricing form');
const moduleText=ts.transpileModule(context,{compilerOptions}).outputText;
const {clearCaptureReturnContext,writeCaptureReturnContext,readCaptureReturnContext}=await import(
 'data:text/javascript;base64,'+Buffer.from(moduleText).toString('base64'));
const storage=new Map();
const port={
 getItem:key=>storage.get(key)||null,setItem:(key,value)=>{storage.set(key,value);},
 removeItem:key=>{storage.delete(key);}
};
const scope='company|store|mesa@example.test';
assert.equal(writeCaptureReturnContext(port,scope,{vehicleType:'car',plate:'FBF5113',
 brand:'Fiat',brandCode:'21',model:'MOBI TREKKING',modelCode:'33',
 year:'2024 Flex',yearCode:'2024-1',marketYear:2024,km:'22000',cost:'0'}),true);
assert.equal(readCaptureReturnContext(port,scope)?.plate,'FBF5113');
assert.equal(clearCaptureReturnContext(port,scope),true);
assert.equal(readCaptureReturnContext(port,scope),null);
assert.equal(clearCaptureReturnContext(port,scope),true,'Clearing twice is safe');
console.log('Motyq IQ confirmed-save reset: plate/FIPE/KM/paid-value, browser draft, capture isolation, failure retention, mobile reset and clean follow-up verified.');
