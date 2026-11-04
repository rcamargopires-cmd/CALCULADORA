import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const service=readFileSync('services/marketIqWebmotorsBrowseLinks.ts','utf8');
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const output=ts.transpileModule(service,{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
 reportDiagnostics:true
});
assert.equal((output.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const {buildWebmotorsBrowseLinks,getWebmotorsVersionOptions}=await import('data:text/javascript;base64,'+
 Buffer.from(output.outputText).toString('base64'));

const build=(model,brand='Jeep',year=2022,region='sp',override=null)=>buildWebmotorsBrowseLinks({
 brand,model,year,vehicleType:'car'
},region,override);
const root='https://www.webmotors.com.br/carros/sp/jeep/compass/';
const end='/de.2022/ate.2022';
const cases=[
 ['COMPASS LONG. T270 1.3 TB 4x2 Flex Aut.','13-t270-turbo-flex-longitude-at6'],
 ['COMPASS Longitude 1.3 T270 Turbo Flex AT6','13-t270-turbo-flex-longitude-at6'],
 ['COMPASS LTD. T270 1.3 TB 4x2 Flex Aut.','13-t270-turbo-flex-limited-at6'],
 ['COMPASS SPORT T270 1.3 TB Flex Aut.','13-t270-turbo-flex-sport-at6'],
 ['COMPASS S T270 1.3 TB Flex Aut.','13-t270-turbo-flex-s-at6'],
 ['COMPASS LONG. TD350 2.0 Diesel 4x4 Aut.','20-td350-turbo-diesel-longitude-at9'],
 ['COMPASS LIMITED TD350 2.0 Diesel 4x4 Aut.','20-td350-turbo-diesel-limited-at9'],
 ['COMPASS TRAILHAWK TD350 2.0 Diesel Aut.','20-td350-turbo-diesel-trailhawk-at9']
];
for(const [model,slug] of cases){
 const item=build(model);
 assert.equal(item.versionUrl,root+slug+end,'Correct engine+trim: '+model);
 assert.equal(item.versionMatch,'automatic',model);
 assert.equal(item.versionOptions.length,7);
}
assert.equal(build('COMPASS LONGITUDE FLEX AUT.').versionUrl,null,
 'Ambiguous engine is not arbitrarily assigned to a T270 or TD350');
assert.equal(build('COMPASS SPORT LIMITED T270 1.3 TB FLEX AUT.').versionUrl,null,
 'Conflicting trim labels must not assign a version');
assert.equal(build('COMPASS LONG. TD350 2.0 Diesel 4x4 Aut.','Jeep',2022,'sp-sorocaba').versionUrl,
 'https://www.webmotors.com.br/carros/sp-sorocaba/jeep/compass/20-td350-turbo-diesel-longitude-at9/de.2022/ate.2022');
const unmapped=build('COMPASS', 'Jeep',2022);
assert.equal(unmapped.versionUrl,null);
assert.equal(unmapped.versionMatch,'not-mapped');
assert.equal(unmapped.modelUrl,'https://www.webmotors.com.br/carros/sp/jeep/compass/de.2022/ate.2022');
assert.equal(unmapped.versionOptions.length,7,'Provide explicit confirmed choices even without engine FIPE');
const chosen=build('COMPASS LONGITUDE FLEX AUT.','Jeep',2022,'sp',
 '20-td350-turbo-diesel-longitude-at9');
assert.equal(chosen.versionMatch,'manual');
assert.equal(chosen.versionUrl,root+'20-td350-turbo-diesel-longitude-at9'+end);
assert.equal(build('COMPASS LONGITUDE T270 1.3 TB FLEX','Jeep',2022,'sp',
 'not-a-real-version').versionUrl,null,'Unverified manual slugs cannot be injected');
const cross=build('T-Cross Sense 200 TSI 1.0 FLEX 5P AUT.','VW - Volkswagen',2021);
assert.equal(cross.versionUrl,
 'https://www.webmotors.com.br/carros/sp/volkswagen/t-cross/10-200-tsi-total-flex-sense-automatico/de.2021/ate.2021');
assert.equal(cross.versionOptions.length,1);
const crossNoTransmission=build('T-Cross Sense 200 TSI 1.0 FLEX','VW - Volkswagen',2021);
assert.equal(crossNoTransmission.versionUrl,null,'Unknown transmission must not assume automatic');
const hb20=build('HB20 1.0 12V FLEX SENSE PLUS MANUAL','Hyundai',2025);
assert.equal(hb20.versionUrl,
 'https://www.webmotors.com.br/carros/sp/hyundai/hb20/10-12v-flex-sense-plus-manual/de.2025/ate.2025');
const autoHB20=build('HB20 1.0 12V FLEX SENSE PLUS AUTOMATICO','Hyundai',2025);
assert.equal(autoHB20.versionUrl,null,'An automatic HB20 cannot receive a manual version link');
assert.equal(getWebmotorsVersionOptions('Jeep','Compass Longitude').length,7);
assert.equal(getWebmotorsVersionOptions('Fiat','Argo 1.3 Drive').length,0);
assert.ok(!service.includes('fetch('),'Verified routes do not trigger extra Webmotors requests');
assert.ok(workspace.includes('const versionSignature=[vehicleType,brandCode,modelCode,yearCode,brand,model,marketYear].join('),
 'Manual override must not be reused on a different appraisal');
assert.ok(workspace.includes("webmotorsVersionOverride?.signature===versionSignature"),
 'Stale version choices must be ignored when a vehicle changes');
assert.ok(workspace.includes('setWebmotorsVersionOverride(e.target.value===\'auto\'?null:'),
 'Operator can reset automatic mapping');
assert.ok(workspace.includes('Filtrar versão')===false,'Prior secondary version link replaced with specific primary CTA');
assert.ok(workspace.includes('Abrir {webmotorsBrowse.modelLabel} {marketYear} com todas as versões'),
 'Generic URL remains available but visibly distinguished');
assert.ok(workspace.includes('referenceAvg*.86*(repasse?.95:1)')&&
 workspace.includes('avg*.86*(repasse?.95:1)'),
 'No changes to buying formulas');
console.log('Motyq IQ versions: Compass T270/TD350 x trim, HB20 and T-Cross, manual override, ambiguous safeguards and UI verified.');
