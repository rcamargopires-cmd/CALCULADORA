import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import ts from 'typescript';
const compile=(path)=>{
 const src=readFileSync(join(process.cwd(),path),'utf8');
 const result=ts.transpileModule(src,{compilerOptions:{
   target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
 },reportDiagnostics:true});
 const errs=(result.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
 assert.equal(errs.length,0,'TypeScript syntax failure '+path);
 return result.outputText;
};
const dep=compile('services/marketIqConsultedRepasse.ts');
const depUrl='data:text/javascript;base64,'+Buffer.from(dep).toString('base64');
const model=compile('services/marketIqApprovalModel.ts')
 .replaceAll("from './marketIqConsultedRepasse'","from '"+depUrl+"'")
 .replaceAll('from "./marketIqConsultedRepasse"','from "'+depUrl+'"');
const app=await import('data:text/javascript;base64,'+Buffer.from(model).toString('base64'));
const finance=await import(depUrl);
const alice={email:'mesa@example.com',name:'Mesa',role:'seller',companyId:'company-1',storeId:'store-1'};
const bob={email:'gerente@example.com',name:'Gerente',role:'manager',companyId:'company-1',storeId:'store-1'};
const other={...bob,email:'gestor-outra@loja.com',storeId:'store-2'};
const rogue={...bob,companyId:'company-2'};
const same={...bob,email:alice.email};
const costs={invoice:'600',taxesFixed:'2500',taxesPercent:'0',transport:'0',preparation:'0',
 other:'1000',marginMode:'reais',margin:'5000'};
const offer={id:'offer1',buyer:'Loja 1',value:'145000',channel:'telefone',
 status:'confirmada',receivedAt:'2026-10-30',validUntil:'2099-12-31',note:''};
const source={id:'case1',createdAt:'2026-10-30T12:00:00Z',updatedAt:'2026-10-30T12:00:00Z',
 version:1,vehicle:{plate:'ABC1D23',brand:'Toyota',model:'SW4 SRX 2.8',year:'2018',km:'126190',fipe:209845},
 offers:[offer],costs,selectedOfferId:offer.id,proposedBuy:'140000',state:'consulta',events:[]};
const req=app.newApprovalFromConsultedCase(source,alice,'Cliente quer fechar agora');
assert.equal(req.status,'pending');
assert.equal(req.suggestedCeiling,135900);
assert.equal(req.requestedBuy,140000);
assert.equal(req.sourceCaseVersion,1);
assert.equal(req.events[0].action,'submitted');
assert.equal(app.canManagerApprove(bob,req),true);
assert.equal(app.canManagerApprove(alice,req),false);
assert.equal(app.canManagerApprove(same,req),false);
assert.equal(app.canManagerApprove(other,req),false);
assert.equal(app.canManagerApprove(rogue,req),false);
assert.throws(()=>app.applyManagerDecision(req,alice,'approved',140000,'ok'),/Somente um gerente/);
assert.throws(()=>app.applyManagerDecision(req,bob,'approved',null,'ok'),/valor de decisão válido/);
const approved=app.applyManagerDecision(req,bob,'approved',140000,'Cliente já espera a proposta');
assert.equal(approved.status,'approved');
assert.equal(approved.decidedBuy,140000);
assert.equal(approved.events.length,2);
assert.equal(approved.revision,2);
assert.equal(approved.events[1].previousValue,140000);
assert.equal(app.isApprovalApplicable(approved,source),true);
assert.equal(app.isApprovalApplicable(approved,{...source,version:2}),false);
assert.equal(app.isApprovalApplicable(approved,{...source,proposedBuy:'141000'}),false);
assert.equal(app.isApprovalApplicable(approved,{...source,costs:{...costs,invoice:'1000'}}),false);
assert.equal(app.isApprovalApplicable(approved,{...source,offers:[{...offer,validUntil:'2020-01-01'}]}),false);
assert.throws(()=>app.applyManagerDecision(approved,bob,'approved',140000,'again'),/já recebeu/);
const countered=app.applyManagerDecision(req,bob,'countered',135000,'Somente 135 mil');
assert.equal(countered.status,'countered');
assert.equal(app.isApprovalApplicable(countered,source),false);
assert.throws(()=>app.applyManagerDecision(req,bob,'countered',140000,'igual'),/contraproposta/);
const rejected=app.applyManagerDecision(req,bob,'rejected',null,'Sem margem');
assert.equal(rejected.decidedBuy,undefined);
assert.equal(rejected.status,'rejected');
const frozen=app.exportApprovalsCsv([approved]);
assert.ok(frozen.includes('140000'));
assert.ok(!frozen.includes('ABC1D23'),'Plates must not be exported');
assert.ok(app.exportApprovalEventsCsv([approved]).includes('Cliente já espera'));
assert.throws(()=>app.newApprovalFromConsultedCase({...source,version:0},alice,'ok'),/Salve/);
assert.throws(()=>app.newApprovalFromConsultedCase({...source,offers:[]},alice,'ok'),/não há oferta/i);
assert.throws(()=>app.newApprovalFromConsultedCase(source,alice,''),/justificativa/);
console.log('MarketIQ exception approvals: 30 lifecycle, permission, expiration and export assertions passed.');
