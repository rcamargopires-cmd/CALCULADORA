import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('services/marketIqWebmotorsBrowseLinks.ts','utf8');
const ui=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const api=readFileSync('api/marketiq-market-scan.ts','utf8');
const result=ts.transpileModule(source,{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
 reportDiagnostics:true
});
assert.equal((result.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const {buildWebmotorsBrowseLinks,WEBMOTORS_REGIONS}=await import('data:text/javascript;base64,'+
 Buffer.from(result.outputText).toString('base64'));
const vehicle=(model,brand='Hyundai',year=2025,vehicleType='car')=>({brand,model,year,vehicleType});
const target=vehicle('HB20 1.0 12V FLEX SENSE PLUS MANUAL');
const output=buildWebmotorsBrowseLinks(target);
assert.equal(output.regionLabel,'Estado de São Paulo (SP)');
assert.equal(output.modelUrl,'https://www.webmotors.com.br/carros/sp/hyundai/hb20/de.2025/ate.2025',
 'Must use statewide SP, not Fortaleza or São Paulo municipality 100km radius');
assert.equal(output.versionUrl,
 'https://www.webmotors.com.br/carros/sp/hyundai/hb20/10-12v-flex-sense-plus-manual/de.2025/ate.2025',
 'Verified Sense Plus Manual deep link should include version');
assert.equal(output.modelLabel,'HB20');
assert.equal(output.year,2025);
assert.equal(buildWebmotorsBrowseLinks(target,'sp-sorocaba').modelUrl,
 'https://www.webmotors.com.br/carros/sp-sorocaba/hyundai/hb20/de.2025/ate.2025');
assert.equal(buildWebmotorsBrowseLinks(target,'sp-sao-paulo').modelUrl,
 'https://www.webmotors.com.br/carros/sp-sao-paulo/hyundai/hb20/de.2025/ate.2025');
assert.equal(buildWebmotorsBrowseLinks(target,'br').modelUrl,
 'https://www.webmotors.com.br/carros/estoque/hyundai/hb20/de.2025/ate.2025');
assert.equal(buildWebmotorsBrowseLinks(vehicle('HB20','Hyundai'), 'sp').versionUrl,null,
 'Do not invent a version slug when none is recorded');
assert.equal(buildWebmotorsBrowseLinks(vehicle('HB20 1.0 TGDI FLEX PLATINUM AUTOMATICO'),'sp').versionUrl,null,
 'Do not guess unknown Webmotors trim routes');
const tCross=buildWebmotorsBrowseLinks(vehicle('T-Cross Sense 200 TSI 1.0 FLEX 5P AUT.','VW - Volkswagen',2021),'sp');
assert.equal(tCross.modelUrl,'https://www.webmotors.com.br/carros/sp/volkswagen/t-cross/de.2021/ate.2021');
assert.equal(tCross.versionUrl,null,'T-Cross FIPE trim does not have a verified public Webmotors slug');
const hb20Sense=buildWebmotorsBrowseLinks(vehicle('HB20 1.0 12V FLEX SENSE MANUAL'),'sp');
assert.equal(hb20Sense.versionUrl,'https://www.webmotors.com.br/carros/sp/hyundai/hb20/10-12v-flex-sense-manual/de.2025/ate.2025');
const moto=buildWebmotorsBrowseLinks(vehicle('FZ25 FAZER ABS','Yamaha',2023,'motorcycle'),'sp');
assert.equal(moto.modelUrl,'https://www.webmotors.com.br/motos/sp/yamaha/fz25-fazer-abs/de.2023/ate.2023');
assert.equal(moto.versionUrl,null);
assert.equal(buildWebmotorsBrowseLinks(vehicle('HB20','Hyundai',0)).modelUrl,null);
assert.equal(buildWebmotorsBrowseLinks(vehicle('','Hyundai')).modelUrl,null);
assert.equal(WEBMOTORS_REGIONS[0].id,'sp','Statewide SP is the default, not a random indexed city');
assert.deepEqual(WEBMOTORS_REGIONS.map(x=>x.id),['sp','sp-sorocaba','sp-sao-paulo','br']);
assert.ok(!source.includes('fortaleza'),'No Fortaleza hardcoded defaults');
assert.ok(!source.includes('querySelector'),'No scraping or browser automation on Webmotors');
assert.ok(ui.includes("const webmotorsBrowse=useMemo(()=>buildWebmotorsBrowseLinks({"));
assert.ok(ui.includes("href={webmotorsBrowse.modelUrl}"),'Outbound browse URL comes from selected model');
assert.ok(ui.includes("href={webmotorsBrowse.versionUrl}"),'Optional verified version deep link');
assert.ok(ui.includes('value={marketRegion} onChange={e=>setMarketRegion('));
assert.ok(ui.includes("WEBMOTORS_REGIONS.map(region"),'User can choose geography');
assert.ok(ui.includes("sessionStorage.setItem(regionKey,marketRegion)"),'Region choice persists in tab');
assert.ok(!ui.includes('href={item.url} target="_blank" rel="noopener noreferrer"\\n        className="rounded-md border border-sky-300'),
 'No arbitrary indexed city links presented as local matches');
assert.ok(ui.includes('O índice encontrou {indexedBrowsePages.length} página(s) da Webmotors'),
 'Index page count remains diagnostic without driving geography');
assert.ok(ui.includes('referenceAvg*.86*(repasse?.95:1)'), 'Preliminary formula remains unchanged');
assert.ok(ui.includes('avg*.86*(repasse?.95:1)'), 'Verified ceiling remains unchanged');
assert.ok(api.includes('marketIqDeskSearchServer(req'), 'Existing market-search API remains unaffected');
console.log('Motyq IQ Webmotors links: statewide SP, Sorocaba, capital, national, HB20 model/version, T-Cross family, motorcycle and no arbitrary Fortaleza pages passed.');
