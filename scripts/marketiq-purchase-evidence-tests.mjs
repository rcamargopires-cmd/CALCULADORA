import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('services/marketIqPurchaseEvidence.ts','utf8');
const shortlist=readFileSync('services/marketIqWebmotorsShortlist.ts','utf8');
const sourcesPanel=readFileSync('components/MarketIqPurchaseSourcesPanel.tsx','utf8');
const modal=readFileSync('components/MarketIqPurchaseSummaryModal.tsx','utf8');
const pricing=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
for(const [name,code] of [['purchaseEvidence',source],['sourcesPanel',sourcesPanel],['modal',modal]]){
 const parsed=ts.transpileModule(code,{fileName:name+'.tsx',
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
 assert.equal(parsed.diagnostics?.filter(x=>x.category===ts.DiagnosticCategory.Error).length||0,0,
  name+' must compile as TypeScript');
}
const transpile=(src)=>ts.transpileModule(src,{compilerOptions:{
 module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const urlFor=js=>'data:text/javascript;base64,'+Buffer.from(js).toString('base64');
const depUrl=urlFor(transpile(shortlist));
const evidenceJs=transpile(source).replace(/from ["']\.\/marketIqWebmotorsShortlist["']/,
 "from '"+depUrl+"'");
const evidence=await import(urlFor(evidenceJs));
const {summarizeOperatorWebmotors,validatedRadarFipe,radarTrim,fipeVersionCompatible}=evidence;
const target={brand:'GM - Chevrolet',model:'TRACKER 12T A RS',year:2024,km:53000,
 vehicleType:'car',fipe:100000};
const url=(variant,id,year='2023-2024')=>
 'https://www.webmotors.com.br/comprar/chevrolet/tracker/'+variant+
 '/4-portas/'+year+'/'+id;
const approved=(variant,id,price,km,rest={})=>({
 url:url(variant,id),price,km,title:'Tracker '+variant,checked:true,...rest
});
const one=approved('12-turbo-flex-rs-automatico','11111111',99000,49000);
const two=approved('12-turbo-flex-rs-automatico','22222222',93000,56000);
const sample=summarizeOperatorWebmotors([one,two],target,'TRACKER 12T A RS');
assert.equal(sample.count,2);
assert.equal(sample.average,96000);
assert.equal(sample.listings.length,2);
assert.equal(sample.listings[0].price,93000);
const onlyOne=summarizeOperatorWebmotors([one],target,target.model);
assert.equal(onlyOne.count,1);
assert.equal(onlyOne.average,null);
const notChecked=summarizeOperatorWebmotors([one,{...two,checked:false}],target,target.model);
assert.equal(notChecked.average,null);
assert.ok(notChecked.rejected.some(r=>r.reason.includes('Pendente')));
const wrongTrim=summarizeOperatorWebmotors([one,approved('12-turbo-flex-ltz-automatico','33333333',80000,49000)],
 target,target.model);
assert.equal(wrongTrim.count,1,'LTZ cannot lower the median of Tracker RS');
const wrongEngine=summarizeOperatorWebmotors([one,approved('10-turbo-flex-rs-automatico','44444444',80000,50000)],
 target,target.model);
assert.equal(wrongEngine.count,1,'1.0 RS must not enter 1.2 RS market sample');
const wrongYear=summarizeOperatorWebmotors([one,{
 ...two,url:url('12-turbo-flex-rs-automatico','22222222','2022-2023')
}],target,target.model);
assert.equal(wrongYear.count,1,'Year/model mismatch');
const farKm=summarizeOperatorWebmotors([one,{...two,km:105000}],target,target.model);
assert.equal(farKm.count,1,'30k KM tolerance must apply');
const unsafe=summarizeOperatorWebmotors([one,{...two,url:'https://webmotors.com.br.evil.example/comprar/chevrolet/tracker/...'}],
 target,target.model);
assert.equal(unsafe.count,1,'Only actual Webmotors individual URLs');
const duplicate=summarizeOperatorWebmotors([one,{
 ...one,url:url('12-turbo-flex-rs-automatico','11111111').replace('www.','')
}],target,target.model);
assert.equal(duplicate.count,1,'Same listing ID across www vs apex cannot inflate sample');
const auction=summarizeOperatorWebmotors([one,{...two,title:'Tracker RS sinistrado'}],target,target.model);
assert.equal(auction.count,1,'Sinistro must not enter market baseline');
const overpriced=summarizeOperatorWebmotors([one,{...two,price:150000}],target,target.model);
assert.equal(overpriced.count,1,'Price >35% current FIPE needs independent review');
const noTrim=summarizeOperatorWebmotors([one,two],target,'TRACKER');
assert.equal(noTrim.average,null,'Missing exact trim is not verified market evidence');
assert.equal(radarTrim('TRACKER 12T A RS'),'rs');
assert.equal(fipeVersionCompatible('TRACKER 12T A RS','TRACKER 1.2 TURBO FLEX RS AUT'),true);
assert.equal(fipeVersionCompatible('TRACKER 12T A RS','TRACKER 1.2 TURBO LTZ AUT'),false);
assert.equal(fipeVersionCompatible('TRACKER 12T A RS','TRACKER 1.0 TURBO FLEX RS AUT'),false);
const base={value:105000,year:2024,model:'TRACKER RS 1.2 TURBO AUT',
 brand:'GM - Chevrolet',fuel:'Flex',fipeCode:'004324-0',
 referenceMonth:'novembro de 2026',referenceStatus:'current',referenceSource:'Parallelum'};
assert.equal(validatedRadarFipe(base,2024).value,105000);
assert.equal(validatedRadarFipe({...base,year:2023},2024),null);
assert.equal(validatedRadarFipe({...base,value:0},2024),null);
assert.equal(validatedRadarFipe({...base,fipeCode:'fake'},2024),null);
assert.equal(validatedRadarFipe({...base,referenceStatus:'outdated'},2024).referenceStatus,'outdated',
 'An outdated FIPE response must never be labeled current');
assert.ok(sourcesPanel.includes("fetch('/api/marketiq-fipe?'"),
 'Use existing FIPE API, only on operator action');
assert.ok(sourcesPanel.includes("action,vehicleType:vehicle.vehicleType,...params"),
 'FIPE request must select actual car or motorcycle type');
assert.ok(sourcesPanel.includes("fipeVersionCompatible(vehicle.model,found.model)"),
 'Reject wrong FIPE engine and trim after server lookup');
assert.ok(sourcesPanel.includes('checked={row.checked}'),
 'Every listing requires explicit operator check');
assert.ok(sourcesPanel.includes('Nenhum anúncio conferido.'));
assert.ok(sourcesPanel.includes('Nenhum dado digitado aqui é salvo em avaliações'));
assert.ok(modal.includes('summarizeOperatorWebmotors('));
assert.ok(modal.includes('marketReference||data.referencePrice'),
 'Two manually validated Webmotors listings must become preferred source of purchase ceiling');
assert.ok(modal.includes('marketReference?')&&modal.includes('média dos anúncios Webmotors conferidos pela Mesa'),
 'The ceiling must clearly identify its Webmotors vs Dealer source');
assert.ok(modal.includes('<MarketIqPurchaseSourcesPanel'));
assert.ok(modal.includes('checkedListings.listings.map(ad=><a'), 'Links must remain auditable');
assert.ok(pricing.includes('marketListings:primary.map(ad=>({'),
 'Reuse previously operator-validated individual Webmotors ads from Mesa');
assert.ok(pricing.includes("checked:!ad.auto&&ad.status==='valid'"),
 'Never inherit auto-indexed offers as reviewed market evidence');
console.log('Motyq IQ Radar Webmotors/FIPE: exact trim, engine, year, KM, URL, duplicated ID, sinistro, user confirmation and month-status safeguards passed.');
