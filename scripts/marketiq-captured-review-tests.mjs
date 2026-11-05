import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('services/marketIqCapturedReview.ts','utf8');
const panel=readFileSync('components/MarketIqCapturedReviewPanel.tsx','utf8');
const ui=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
assert.equal((compiled.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const {reviewCapturedWebmotors}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputText).toString('base64'));

const car=(id,price,km,overrides={})=>({
 url:'https://www.webmotors.com.br/comprar/jeep/compass/13-t270-turbo-flex-longitude-at6/2024-2025/'+id,
 year:2025,price:String(price),km:String(km),title:'JEEP COMPASS LONGITUDE T270',status:'pending',...overrides
});
const target={
 brand:'Jeep',model:'COMPASS LONG. T270 1.3 TB Flex Aut.',year:2025,km:50000,vehicleType:'car',fipeValue:115000,
 expectedModelUrl:'https://www.webmotors.com.br/carros/sp/jeep/compass/de.2025/ate.2025',
 expectedVersionUrl:'https://www.webmotors.com.br/carros/sp/jeep/compass/13-t270-turbo-flex-longitude-at6/de.2025/ate.2025'
};
const input=[
 car('10000001',104000,43000),
 car('10000002',99000,51000),
 car('10000003',102000,48000),
 car('10000004',105000,52000),
 car('10000005',101000,49000),
 car('10000006',97000,55000),
 car('10000006',96000,55000), // Same listing URL repeated
 car('10000007',95000,49000,{url:'https://www.webmotors.com.br/comprar/jeep/compass/20-td350-turbo-diesel-trailhawk-at9/2024-2025/10000007'}),
 car('10000008',94000,49000,{year:2024}), // different model-year
 car('10000009',94000,49000,{url:'https://www.webmotors.com.br/comprar/fiat/argo/10/2024-2025/10000009'}),
 car('10000010',93000,85000), // distant KM; not preselected
 car('10000011',91000,49000,{title:'JEEP COMPASS Recuperado de leilão'}),
 car('10000012',190000,49000) // big FIPE premium
];
const report=reviewCapturedWebmotors(input,target);
assert.equal(report.rows.length,input.length);
assert.equal(report.eligibleCount,6);
assert.equal(report.reviewCount,4);
assert.equal(report.blockedCount,3);
assert.deepEqual(report.topFive.map(r=>r.price),[97000,99000,101000,102000,104000]);
assert.equal(report.meanLowestFive,100600);
assert.ok(report.rows.every(r=>r.reviewState!=='eligible'||r.reasons.length===0));
assert.ok(report.rows.some(r=>r.reasons.includes('Versão do anúncio não confirmada')));
assert.ok(report.rows.some(r=>r.reasons.includes('Ano-modelo diferente')));
assert.ok(report.rows.some(r=>r.reasons.includes('Anúncio repetido')));
assert.ok(report.rows.some(r=>r.reasons.includes('Marca ou modelo diferente')));
assert.ok(report.rows.some(r=>r.reasons.includes('Possível leilão, sinistro ou dano')));
assert.ok(report.rows.some(r=>r.reasons.includes('Quilometragem distante')));
assert.ok(report.rows.some(r=>r.reasons.includes('Preço muito acima da FIPE')));
assert.equal(report.topFive[0].fipeDifferencePct,-15.7);
const unmatched=reviewCapturedWebmotors([
 car('10000014',98000,48000,{url:'https://outside.example/comprar/jeep/compass/13-t270-turbo-flex-longitude-at6/2024-2025/10000014'})
],target);
assert.equal(unmatched.blockedCount,1);
assert.equal(unmatched.meanLowestFive,null);
assert.equal(reviewCapturedWebmotors([car('10000015',98000,48000)],target).meanLowestFive,null,
 'Single listing is not sufficient for preliminary average');
const moto=reviewCapturedWebmotors([
 {url:'https://www.webmotors.com.br/comprar/yamaha/fazer/250/2022-2023/10000021',price:'18.500',km:21000,year:2023},
 {url:'https://www.webmotors.com.br/comprar/yamaha/fazer/250/2022-2023/10000022',price:17800,km:21001,year:2023}
],{brand:'Yamaha',model:'Fazer',year:2023,km:11000,vehicleType:'motorcycle',
 expectedModelUrl:'https://www.webmotors.com.br/motos/sp/yamaha/fazer/de.2023/ate.2023'});
assert.equal(moto.eligibleCount,1,'Motorcycles use 10,000 KM tolerance');
assert.equal(moto.reviewCount,1);
assert.ok(panel.includes('Conferência dos anúncios capturados'));
assert.ok(panel.includes('Média dos {activeTopFive.length} menores selecionados'));
assert.ok(panel.includes("r.reviewState==='blocked'"));
assert.ok(panel.includes('onImport(yetToImport.map(r=>r.item as T))'));
assert.ok(panel.includes('pendentes'), 'Review UI explicitly describes pending outcomes');
assert.ok(ui.includes('<MarketIqCapturedReviewPanel'));
assert.ok(ui.includes('const applyExtensionCapture=(selectedAds:CapturedAd[])=>'));
assert.ok(ui.includes('const validIncoming=selectedAds.filter'));
assert.ok(ui.includes("status:'pending' as const"),'Original decoder continues marking captured ads pending');
assert.ok(ui.includes('referenceAvg*.86*(repasse?.95:1)'),'Preliminary formula unchanged');
assert.ok(ui.includes('avg*.86*(repasse?.95:1)'),'Confirmed price formula unchanged');
console.log('Motyq IQ capture review: 12 listings, lowest five, FIPE variance, duplicates, trim, model-year, KM, risks and pending-only import passed.');
