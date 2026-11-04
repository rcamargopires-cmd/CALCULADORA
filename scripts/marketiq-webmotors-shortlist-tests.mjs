import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('services/marketIqWebmotorsShortlist.ts','utf8');
const panel=readFileSync('components/MarketIqWebmotorsShortlistPanel.tsx','utf8');
const desk=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const api=readFileSync('api/marketiq-market-scan.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
},reportDiagnostics:true});
assert.equal((compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
const {rankWebmotorsCandidates}=await import('data:text/javascript;base64,'+
 Buffer.from(compiled.outputText).toString('base64'));
const make=(id,price=56000,km=45000,overrides={})=>({
 source:'webmotors',url:'https://www.webmotors.com.br/comprar/chevrolet/onix/lt/2024-2025/'+id,
 price,km,title:'Chevrolet Onix LT 2025',note:'Indexado, conferir na página',auto:true,catalog:false,
 status:'pending',...overrides
});
const vehicle={brand:'Chevrolet',model:'ONIX 1.0 LT FLEX',year:2025,km:47000,vehicleType:'car',fipe:58000};
const values=[make('12345678',57000,47000),make('12345679',55000,46000),
 make('12345680',55000,47000),make('12345681',58000,49000),
 make('12345682',60000,50000),make('12345683',62000,52000)];
const result=rankWebmotorsCandidates(values,vehicle);
assert.equal(result.total,6);
assert.equal(result.accepted.length,6);
assert.equal(result.topFive.length,5);
assert.deepEqual(result.topFive.slice(0,3).map(x=>x.id),['12345680','12345679','12345678'],
 'Cheapest first, tie broken by KM proximity');
assert.equal(result.sampleAverage,57000,'Average of 5 cheapest 55k,55k,57k,58k,60k');
assert.equal(result.topFive[0].year,2025,'URL model year, not production year');
assert.equal(result.topFive[0].kmDifference,0);
assert.equal(rankWebmotorsCandidates([make('12345678')],vehicle).sampleAverage,null,
 'Never compute a credible market average from one indexed listing');
const rejected=rankWebmotorsCandidates([
 make('12345678'),make('12345678',55000),
 make('12345679',56000,81001),
 make('12345680',56000,45000,{source:'olx'}),
 make('12345681',56000,45000,{catalog:true}),
 make('12345682',56000,45000,{title:'Sinistro recuperado de leilão'}),
 make('12345683',56000,45000,{url:'https://fake-webmotors.com.br/comprar/chevrolet/onix/lt/2024-2025/12345683'}),
 make('12345684',56000,45000,{url:'https://www.webmotors.com.br/comprar/chevrolet/onix/lt/2023-2024/12345684'}),
 make('12345685',56000,45000,{url:'https://www.webmotors.com.br/comprar/fiat/argo/lt/2024-2025/12345685'}),
 make('12345686',56000,45000,{url:'https://www.webmotors.com.br/carros-usados/chevrolet/onix'}),
 make('12345687',56000,45000,{status:'excluded'})
 ],vehicle);
assert.equal(rejected.accepted.length,1);
assert.equal(rejected.sampleAverage,null);
assert.ok(rejected.discarded.some(x=>x.reason==='Outro portal'));
assert.ok(rejected.discarded.some(x=>x.reason==='Vitrine, não anúncio individual'));
assert.ok(rejected.discarded.some(x=>x.reason==='Indício de leilão, sinistro ou restrição'));
assert.ok(rejected.discarded.some(x=>x.reason==='KM fora da faixa comparável'));
assert.ok(rejected.discarded.some(x=>x.reason==='Ano/modelo diferente ou não identificável'));
assert.ok(rejected.discarded.some(x=>x.reason==='Marca ou modelo incompatível'));
assert.ok(rejected.discarded.some(x=>x.reason==='Anúncio repetido'));
const moto={brand:'Yamaha',model:'FAZER FZ25',year:2023,km:12000,vehicleType:'motorcycle',fipe:19000};
const motoUrl=(id)=>'https://www.webmotors.com.br/comprar/yamaha/fazer/250/2022-2023/'+id;
const mr=rankWebmotorsCandidates([
 make('12345691',18000,18000,{url:motoUrl('12345691')}),
 make('12345692',17500,22001,{url:motoUrl('12345692')}),
 make('12345693',17800,10000,{url:motoUrl('12345693')})
],moto);
assert.equal(mr.accepted.length,2,'Motos use a 10,000 km radius');
assert.equal(mr.sampleAverage,17900);
assert.equal(mr.topFive[0].price,17800);
const premium=rankWebmotorsCandidates([make('12345694',90000,47000)],vehicle);
assert.equal(premium.topFive[0].possibleFipePremium,true,'High premium is flagged, not hidden');
const money=rankWebmotorsCandidates([make('12345695','R$ 55.000',47000),
 make('12345696','R$ 57.000',47000)],vehicle);
assert.equal(money.sampleAverage,56000,'Portuguese BRL prices supported');
assert.ok(panel.includes('Menores candidatos Webmotors'));
assert.ok(panel.includes('Conferir anúncio original'));
assert.ok(panel.includes('Não há confirmação de que o anúncio esteja ativo'));
assert.ok(panel.includes('Apenas anúncios conferidos individualmente'));
assert.ok(desk.includes("import MarketIqWebmotorsShortlistPanel"));
assert.ok(desk.includes('rankWebmotorsCandidates(indexed,{'));
assert.ok(desk.includes('<MarketIqWebmotorsShortlistPanel shortlist={webmotorsShortlist}'));
assert.ok(desk.includes("item.source==='webmotors'&&isWebmotors(item.url)"),
 'Do not display OLX/NaPista as automatic candidates');
assert.ok(desk.includes("const indexedOlx:Ad[]=[]")&&desk.includes("const indexedNapista:Ad[]=[]"),
 'Never fall back to other portals');
assert.ok(desk.includes("a.source==='webmotors'&&a.status==='valid'"),
 'Only verified Webmotors source contributes to definitive price');
assert.ok(desk.includes('const marketSample=chooseIndexedMarketSample('),
 'Conservative two-listing provisional simulation preserved');
assert.ok(desk.includes('referenceAvg*.86*(repasse?.95:1)'),
 'Existing preliminary 14% and repasse 5% calculations stay unchanged');
assert.ok(desk.includes('avg*.86*(repasse?.95:1)'),
 'Verified calculation formula remains unchanged');
const market=api.slice(api.indexOf('async function marketIqDeskSearchServer('));
assert.ok(market.includes("site:webmotors.com.br/comprar/"));
assert.ok(!market.includes("search(queryBase + ' site:olx.com.br"));
assert.ok(!market.includes("search(queryBase + ' site:napista.com.br"));
assert.ok(market.includes("if (source!=='webmotors' || !isIndividualAdUrl"));
assert.ok(market.includes("item.source==='webmotors'"));
assert.ok(market.includes("source: 'Webmotors'"));
assert.ok(market.includes("warning: 'Resultados indexados"));
assert.ok(!source.includes('paidValue')&&!source.includes('localStorage'),
 'Ranking cannot alter paid history or use local proxy purchases');
console.log('Motyq IQ Webmotors 2.0: URL/brand/model/year/KM filters, five cheapest, price ties, risks, catalog, duplicates, motorcycles and exclusive source passed.');
