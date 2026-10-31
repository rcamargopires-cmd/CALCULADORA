import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('services/marketIqIndexedSample.ts','utf8');
const output=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
},reportDiagnostics:true});
assert.equal((output.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const {chooseIndexedMarketSample,MIN_INDEXED_OBSERVATIONS}=await import(
  'data:text/javascript;base64,'+Buffer.from(output.outputText).toString('base64')
);
const mk=(price,km,source='olx',url='https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/volkswagen-polo')=>
  ({price:String(price),km:String(km),url,source,catalog:true});
const empty=()=>({webmotors:[],olx:[],napista:[]});
const screenshot={
  webmotors:[],
  olx:[mk(78900,112000),mk(78990,118000),mk(79900,116000),mk(84900,114000)],
  napista:[mk(85900,110000,'napista','https://napista.com.br/busca/polo')]
};
const chosen=chooseIndexedMarketSample(screenshot);
assert.equal(chosen.source,'olx','OLX with several comparable prices must beat one NaPista');
assert.equal(chosen.average,(78900+78990+79900+84900)/4);
assert.equal(chosen.counts.napista,1);
assert.equal(chosen.sample.length,4);
assert.equal(chosen.fallback,true);
assert.equal(chosen.sampleContainsCatalogPages,true);
assert.equal(chosen.isUnverified,true);
assert.notEqual(Math.round(chosen.average*.86-2000),71874,'Must not reuse lone NaPista ceiling');
const webmotors=chooseIndexedMarketSample({...screenshot,webmotors:[
 mk(80000,113000,'webmotors','https://www.webmotors.com.br/comprar/volkswagen/polo/highline/2020/00000001'),
 mk(82000,118000,'webmotors','https://www.webmotors.com.br/comprar/volkswagen/polo/highline/2020/00000002')
]});
assert.equal(webmotors.source,'webmotors','Webmotors remains primary with at least 2 unique observations');
assert.equal(webmotors.average,81000);
const partial=chooseIndexedMarketSample({...screenshot,webmotors:[mk(79900,100000,'webmotors')]});
assert.equal(partial.source,'olx','One Webmotors observation cannot override a real OLX sample');
const noSample=chooseIndexedMarketSample({webmotors:[mk(80000,113000)],olx:[mk(78900,112000)],napista:[mk(85900,110000)]});
assert.equal(noSample.source,'');
assert.equal(noSample.sample.length,0);
assert.equal(noSample.average,0,'Never compute a market price from a single page per portal');
const duplicates=chooseIndexedMarketSample({webmotors:[],olx:[mk(78900,112000),mk(78990,112100)],napista:[]});
assert.equal(duplicates.counts.olx,1,'Likely re-indexed snippets should not count twice');
assert.equal(duplicates.source,'');
const varied=chooseIndexedMarketSample({webmotors:[],olx:[mk(78900,112000),mk(78990,118000)],napista:[]});
assert.equal(varied.source,'olx','Distinct price-KM observations within a catalogue count');
assert.equal(MIN_INDEXED_OBSERVATIONS,2);
const code=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
assert.ok(code.includes('const marketSample=chooseIndexedMarketSample('));
assert.ok(code.includes('marketSample.sampleContainsCatalogPages'));
assert.ok(code.includes('Webmotors não forneceu uma amostra mínima aproveitável'));
assert.ok(code.includes('Uma única vitrine não define preço de compra'));
console.log('MarketIQ indexed sample: 24 quality, fallback, duplication and display assertions passed.');
