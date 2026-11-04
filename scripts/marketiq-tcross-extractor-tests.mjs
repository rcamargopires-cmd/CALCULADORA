import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const backend=readFileSync('api/marketiq-market-scan.ts','utf8');
const ui=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const from=backend.indexOf('const string = (value: unknown)');
const to=backend.indexOf('// Search queries depend',from);
assert.ok(from>0&&to>from,'Extract independent public-index parsing logic');
const src=backend.slice(from,to)+
 '\nglobal_result={marketModelParts,marketBrand,listingPageCandidates,portal,priceOf,kmOf};';
const compiled=ts.transpileModule(src,{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},
 reportDiagnostics:true
});
assert.equal((compiled.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const globals={global_result:null,URL,Date,Math,String,Number,RegExp,Set,Map,Array,JSON,Error,AbortSignal,console};
runInNewContext(compiled.outputText,globals);
const {marketModelParts,marketBrand,listingPageCandidates}=globals.global_result;
const cross=marketModelParts('T-Cross Sense 200 TSI 1.0 Flex 5p Aut.');
assert.equal(cross.family,'t-cross','Never reduce T-Cross to the letter T');
assert.equal(cross.trim,'sense','Cross is part of model, Sense is trim');
assert.equal(marketModelParts('T CROSS HIGHLINE 250 TSI').family,'t-cross','Space-separated T CROSS supported');
assert.equal(marketModelParts('T-Cross Highline 250 TSI').trim,'highline');
assert.equal(marketModelParts('COMPASS LONGITUDE T270 1.3 FLEX').family,'compass');
assert.equal(marketModelParts('COMPASS LONGITUDE T270 1.3 FLEX').trim,'longitude');
assert.equal(marketBrand('VW - Volkswagen'),'Volkswagen');

const raw=[
'Carros Volkswagen T-cross 1.0 200 tsi sense automático 2021 usados',
'132 anúncios encontrados',
'VOLKSWAGEN T-CROSS',
'### 1.0 200 tsi total flex sense automático',
'2021/2021',
'65.000 Km',
'São Paulo (SP)',
'R$ 85.682',
'VOLKSWAGEN T-CROSS',
'### 1.0 200 tsi total flex sense automático',
'2020/2021',
'62.300 Km',
'Votuporanga (SP)',
'R$ 83.500',
'VOLKSWAGEN T-CROSS',
'### 1.0 200 tsi total flex comfortline automático',
'2021/2021',
'60.000 Km',
'Guarulhos (SP)',
'R$ 94.000',
'VOLKSWAGEN T-CROSS',
'### 1.0 200 tsi total flex sense automático',
'2021/2022',
'48.000 Km',
'São Paulo (SP)',
'R$ 90.000'
].join('\n');
const url='https://www.webmotors.com.br/carros/estoque/volkswagen/t-cross/10-200-tsi-total-flex-sense-automatico/de.2021/ate.2021';
const result=listingPageCandidates([{url,title:'T-Cross Sense 2021 na Webmotors',raw_content:raw}],
 marketBrand('VW - Volkswagen'),'T-Cross Sense 200 TSI 1.0 Flex 5p Aut.',2021,68000,'car');
assert.equal(result.length,2,'Extract Sense 2021 from public catalog, reject Comfortline and 2022');
assert.deepEqual([...result].map(x=>x.price).sort((a,b)=>a-b),[83500,85682]);
assert.deepEqual([...result].map(x=>x.km).sort((a,b)=>a-b),[62300,65000]);
assert.ok(result.every(x=>x.source==='webmotors'&&x.catalog===true),
 'Catalog observations must never be labeled as confirmed individual ads');
assert.ok(result.every(x=>x.url===url),'Preserve exact indexed Webmotors listing page');
const duplicates=listingPageCandidates([{url,raw_content:raw+'\\n'+raw}],
 marketBrand('Volkswagen'),'T-Cross Sense 200 TSI 1.0 Flex 5p Aut.',2021,68000,'car');
assert.equal(duplicates.length,2,'Repeated cards in page do not inflate sample');
const noKm=listingPageCandidates([{url,content:'VOLKSWAGEN T-CROSS Sense 2021 R$ 86.000'}],
 'Volkswagen','T-Cross Sense',2021,68000,'car');
assert.equal(noKm.length,0,'Do not invent missing KM');
assert.ok(backend.includes("queryBase=[marketBrand(brand),family,variant,year]"),
 'Provider query must include correct model family and version');
assert.ok(backend.includes("normalizedText.replace(/[-\\s]+/g,'').includes(coreModel.replace(/-/g,''))"),
 'Individual indexed ad matching is hyphen safe');
assert.ok(backend.includes('browsePages,vehicleType'),'Return real indexed Webmotors pages as fallback');
assert.ok(ui.includes('setIndexedBrowsePages('));
assert.ok(ui.includes('Encontramos páginas da Webmotors no índice'));
assert.ok(ui.includes('Preços em vitrines indexadas, não confirmados'));
assert.ok(ui.includes('Não entra no teto da Mesa'),'Vitrine observations never influence the approved ceiling');
assert.ok(ui.includes('Isso NÃO significa ausência de veículos à venda'),'Avoid false no-supply statement');
assert.ok(ui.includes('referenceAvg*.86*(repasse?.95:1)'),'Preliminary buying formula preserved');
assert.ok(ui.includes('avg*.86*(repasse?.95:1)'),'Verified price formula preserved');
console.log('Motyq IQ T-Cross: hyphenated model + Sense trim, catalog price/KM extraction, actual year, no phantom supply or price changes passed.');
