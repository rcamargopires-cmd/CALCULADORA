import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('services/marketIqWebmotorsBrowseLinks.ts','utf8');
const ui=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const code=ts.transpileModule(source,{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
 reportDiagnostics:true
});
assert.equal((code.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
const {buildWebmotorsBrowseLinks,withWebmotorsOrder}=await import('data:text/javascript;base64,'+
 Buffer.from(code.outputText).toString('base64'));
const compass=buildWebmotorsBrowseLinks({
 brand:'Jeep',model:'COMPASS LONG. T270 1.3 TB 4x2 Flex Aut.',year:2022,vehicleType:'car'
},'sp');
assert.equal(compass.versionUrl,
 'https://www.webmotors.com.br/carros/sp/jeep/compass/13-t270-turbo-flex-longitude-at6/de.2022/ate.2022');
assert.equal(withWebmotorsOrder(compass.versionUrl),
 'https://www.webmotors.com.br/carros/sp/jeep/compass/13-t270-turbo-flex-longitude-at6/de.2022/ate.2022?o=5',
 'Webmotors lowest-price sorting should be included in the exact trim/year/region URL');
assert.equal(withWebmotorsOrder(compass.modelUrl),
 'https://www.webmotors.com.br/carros/sp/jeep/compass/de.2022/ate.2022?o=5',
 'Generic model link must also apply the requested order');
assert.equal(withWebmotorsOrder(compass.versionUrl,'relevance'),compass.versionUrl,
 'Relevance should use the unmodified Webmotors default');
assert.equal(withWebmotorsOrder(compass.versionUrl+'?o=9&foo=bar'),
 compass.versionUrl+'?o=5&foo=bar',
 'An existing ordering parameter is replaced, never duplicated');
assert.equal(withWebmotorsOrder(compass.versionUrl+'?foo=bar&o=5','relevance'),
 compass.versionUrl+'?foo=bar',
 'Switching to relevance clears sorting but preserves other filters');
const brasil=buildWebmotorsBrowseLinks({
 brand:'Hyundai',model:'HB20 1.0 12V FLEX SENSE PLUS MANUAL',year:2025,vehicleType:'car'
},'br');
assert.equal(withWebmotorsOrder(brasil.versionUrl),
 'https://www.webmotors.com.br/carros/estoque/hyundai/hb20/10-12v-flex-sense-plus-manual/de.2025/ate.2025?o=5');
const moto=buildWebmotorsBrowseLinks({
 brand:'Yamaha',model:'FAZER 250',year:2023,vehicleType:'motorcycle'
},'sp');
assert.ok(withWebmotorsOrder(moto.modelUrl)?.endsWith('?o=5'));
assert.equal(withWebmotorsOrder(null),null);
assert.equal(withWebmotorsOrder('https://fake-webmotors.com.br/carros/sp/jeep/compass'),null);
assert.equal(withWebmotorsOrder('http://www.webmotors.com.br/carros/sp/jeep/compass'),null);
assert.equal(withWebmotorsOrder('not a URL'),null);
assert.ok(ui.includes("useState<WebmotorsOrder>('lowest-price')"),
 'Lowest price must be the Motyq default');
assert.ok(ui.includes('<option value="lowest-price">Menor preço (padrão)</option>'));
assert.ok(ui.includes('<option value="relevance">Mais relevantes</option>'));
assert.ok(ui.includes('value={webmotorsOrder} onChange={e=>setWebmotorsOrder('));
assert.ok(ui.includes('href={orderedWebmotorsVersionUrl}'));
assert.ok(ui.includes('href={orderedWebmotorsModelUrl||webmotorsBrowse.modelUrl}'));
assert.ok(ui.includes("webmotorsOrder==='lowest-price'?'Menor preço':'Mais relevantes'"));
assert.ok(ui.includes('Confira na Webmotors se a ordenação foi aplicada corretamente.'),
 'No guarantee of search UI accepting URL sort on the server');
assert.ok(ui.includes('referenceAvg*.86*(repasse?.95:1)')&&ui.includes('avg*.86*(repasse?.95:1)'),
 'The Motyq valuation formulas must remain unchanged');
console.log('Motyq IQ Webmotors order: default o=5, exact Compass version, all-version search, Brazilian regions, motorcycle, relevance and safety checks passed.');
