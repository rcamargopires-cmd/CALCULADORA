import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('services/marketIqConfidence.ts','utf8');
const panel=readFileSync('components/MarketIqConfidencePanel.tsx','utf8');
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const js=ts.transpileModule(source,{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
 reportDiagnostics:true
});
assert.equal((js.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const {assessMarketIqEvidence}=await import('data:text/javascript;base64,'+
 Buffer.from(js.outputText).toString('base64'));
const ad=(id,km='45.000',extras={})=>({
 source:'webmotors',status:'valid',price:'55.000',km,
 url:'https://www.webmotors.com.br/comprar/gm/onix/lt-2017/'+id,
 note:'Conferido na pagina pelo operador',auto:false,catalog:false,...extras
});
const base=(changes={})=>({
 vehicleType:'car',plate:'QWE1A23',brand:'Chevrolet',model:'ONIX LT 1.4',
 brandCode:'23',modelCode:'456',modelYear:2017,km:45000,
 fipe:{value:50000,referenceStatus:'current'},ads:[],history:[],...changes
});
const carPaid=(id,plate,extra={})=>({
 id,plate,vehicleType:'car',brand:'Chevrolet',model:'ONIX LT 1.4',
 brandCode:'23',modelCode:'456',yearCode:'2017-1',
 year:'2017 Gasolina',km:'45.500',approvedValue:36000,
 date:'2026-11-02T10:00:00.000Z',...extra
});
assert.equal(assessMarketIqEvidence(base({model:'',modelYear:0})).level,'pending');
assert.equal(assessMarketIqEvidence(base({model:'',modelYear:0})).score,0);
const fipeOnly=assessMarketIqEvidence(base());
assert.equal(fipeOnly.score,25);
assert.equal(fipeOnly.level,'low','FIPE alone never proves market confidence');
const indexed=assessMarketIqEvidence(base({ads:[
 ad('12345678','45.000',{auto:true,status:'valid'}),
 ad('12345679','45.000',{catalog:true})
]}));
assert.equal(indexed.verifiedCount,0,'Indexed/catalog pages do not count as verified listings');
assert.equal(indexed.ignoredIndexedCount,2);
assert.equal(indexed.level,'low');
const one=assessMarketIqEvidence(base({ads:[ad('12345678')]}));
assert.equal(one.verifiedCount,1);
assert.equal(one.level,'low');
const two=assessMarketIqEvidence(base({ads:[ad('12345678'),ad('12345679','47.000')]}));
assert.equal(two.verifiedCount,2);
assert.equal(two.level,'medium');
assert.equal(two.score,65);
const three=assessMarketIqEvidence(base({ads:[
 ad('12345678'),ad('12345679','46.000'),ad('12345680','44.000')
]}));
assert.equal(three.level,'high');
assert.equal(three.score,75);
assert.equal(three.checks.length,4);
assert.equal(three.checks.find(x=>x.key==='fipe').state,'good');
assert.equal(assessMarketIqEvidence(base({fipe:{value:50000,referenceStatus:'outdated'},
 ads:[ad('12345678'),ad('12345679'),ad('12345680')]})).level,'low',
 'Outdated FIPE must never show medium/high confidence');
const duplicate=assessMarketIqEvidence(base({ads:[
 ad('12345678'),ad('12345678','46.000',{url:'https://www.webmotors.com.br/comprar/gm/onix/lt-2017/12345678?src=copy'})
]}));
assert.equal(duplicate.verifiedCount,1,'Same listing URL never inflates sample');
const risk=assessMarketIqEvidence(base({ads:[
 ad('12345678'),ad('12345679'),ad('12345680','46.000',{note:'Possivel sinistro'})
]}));
assert.equal(risk.flaggedCount,1);
assert.notEqual(risk.level,'high','Suspect offer should not inflate confidence');
const far=assessMarketIqEvidence(base({ads:[
 ad('12345678'),ad('12345679'),ad('12345680','90.000')
]}));
assert.equal(far.verifiedCount,2);
assert.equal(far.flaggedCount,1);
assert.notEqual(far.level,'high');
const buys=[
 carPaid('a','ABC1A23'),carPaid('b','ABC1A23',{approvedValue:42000}),
 carPaid('c','ABC1A24'),carPaid('d','ABC1A25',{yearCode:'2019-1'}),
 carPaid('e','QWE1A23'),carPaid('f','ABC1A26',{km:'90.000'}),
 carPaid('g','ABC1A27',{vehicleType:'motorcycle'}),
 carPaid('h','ABC1A28',{groupedRecords:2}),
 carPaid('i','ABC1A29',{modelCode:'999',model:'OTHER'})
];
const verifiedBuys=assessMarketIqEvidence(base({history:buys}));
assert.equal(verifiedBuys.paidSampleCount,2,'Only unique same-model, close-year/KM actually-paid vehicles count');
assert.equal(verifiedBuys.checks.find(x=>x.key==='purchases').points,17);
const moto=assessMarketIqEvidence(base({
 vehicleType:'motorcycle',brand:'Yamaha',model:'FZ25',brandCode:'11',modelCode:'222',
 modelYear:2023,km:12000,ads:[
 ad('12345678','16.000'),ad('12345679','20.000'),
 ad('12345680','27.000')
 ],history:buys
}));
assert.equal(moto.verifiedCount,2,'Motorcycles must use stricter KM limit');
assert.equal(moto.paidSampleCount,0,'Car payments never count toward motorcycle evidence');
assert.equal(moto.flaggedCount,1,'Motorcycle comparables outside 10,000 km are flagged');
assert.equal(moto.level,'low','A flagged far-km motorcycle listing requires operator review');
const motoClean=assessMarketIqEvidence(base({vehicleType:'motorcycle',brand:'Yamaha',model:'FZ25',brandCode:'11',modelCode:'222',modelYear:2023,km:12000,ads:[ad('12345678','16.000'),ad('12345679','20.000')]}));
assert.equal(motoClean.level,'medium','Two clean nearby motorcycle listings can give a moderate evidence rating');
assert.ok(panel.includes('Confiança das evidências'),'The new panel must label evidence correctly');
assert.ok(panel.includes('não probabilidade de acerto'),'Must not imply predicted buy success');
assert.ok(panel.includes('não substitui laudo cautelar'),'Must not imply vehicle-history validation');
assert.ok(workspace.includes('<MarketIqConfidencePanel result={confidence}/>'),'Confidence panel integrated in Mesa');
assert.ok(workspace.includes('history:saved'),'Authenticated saved paid history is the only purchase evidence');
assert.ok(workspace.includes('value:provisional?'),'Existing pricing formula untouched');
assert.ok(!source.includes('localStorage'),'Indexed or local Excel proxies must not be treated as paid history');
console.log('Motyq IQ confidence: FIPE, verified Webmotors, KM, distinct real paid purchases, duplicate/fraud guards and UI wiring passed.');
