import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const service=readFileSync('services/marketIqAssistedOffers.ts','utf8');
const panel=readFileSync('components/MarketIqAssistedCapturePanel.tsx','utf8');
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const compiled=ts.transpileModule(service,{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
 reportDiagnostics:true
});
assert.equal((compiled.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const {parseVisibleWebmotorsText,getWebmotorsCaptureBookmarklet,inspectWebmotorsPaste}=await import(
 'data:text/javascript;base64,'+Buffer.from(compiled.outputText).toString('base64'));

const screenshotPasted='https://www.webmotors.com.br/carros/sp/jeep/compass/13-t270-turbo-flex-longitude-at6/de.2025/ate.2025?tipoveiculo=carros&estadocidade=S%C3%A3o%20Paulo&marca1=jeep&modelo1=compass&versao1=13-t270-turbo-flex-longitude';
assert.equal(inspectWebmotorsPaste(screenshotPasted),'search-url-only',
 'A Webmotors search URL is not evidence of zero cars');
assert.equal(inspectWebmotorsPaste(screenshotPasted+'\n'), 'search-url-only');
assert.equal(inspectWebmotorsPaste(''),'empty');
assert.equal(inspectWebmotorsPaste('JEEP COMPASS\n2022/2022\n73.000 Km\nR$ 89.900'),'offer-text');
assert.equal(inspectWebmotorsPaste('JEEP COMPASS\n2022/2022'),'other-text');
assert.equal(inspectWebmotorsPaste('javascript:(function(){location.href="https://app.motyq.com.br/#motyq-import="+x})()'),'bookmarklet-code');
assert.equal(inspectWebmotorsPaste('const data=JSON.stringify({kind:"motyq-assisted-v1"});document.querySelectorAll("a");location.href="https://app.motyq.com.br/#motyq-import="+data'),'bookmarklet-code');
assert.equal(inspectWebmotorsPaste('javascript:alert("teste")'),'bookmarklet-code');
assert.ok(panel.includes('Você colou o código de captura, não os anúncios.'),
 'Immediately explain a bookmarklet pasted into the offer-text field');
assert.ok(panel.includes('Limpar o código colado'), 'Provide an easy recovery action');
assert.ok(panel.includes('O código copiado vai no endereço de um FAVORITO'),
 'Clarify capture setup before user copies the shortcut');
assert.ok(panel.includes('Você colou somente o endereço da Webmotors.'),
 'Display immediate specific diagnosis for URL-only content');
assert.ok(panel.includes('disabled={!enabled||!text.trim()||invalidPaste}'),
 'Do not run extraction when a URL or bookmarklet code was pasted');
assert.ok(panel.includes('const invalidPaste=pastedOnlyAddress||pastedCaptureCode'),
 'Both mistaken paste types are safely ignored');
assert.ok(panel.includes('Copiar atalho de captura'));
assert.ok(panel.includes('Como criar o favorito no Chrome (uma vez)'));
assert.ok(panel.includes('Ctrl+Shift+O'));
assert.ok(!panel.includes('Na lista da Webmotors pressione <strong>Ctrl+A, Ctrl+C</strong>'),
 'Avoid misleading instructions which caused address-bar copying');

const target={
 brand:'Jeep',model:'COMPASS LONG. T270 1.3 TB 4x2 Flex Aut.',
 year:2022,km:65000,vehicleType:'car',versionLabel:'1.3 T270 Turbo Flex Longitude AT6'
};
const card=(version,year,km,price,city='São Paulo (SP)')=>[
 'JEEP COMPASS',
 version,
 '2021/'+year,
 km+' Km',
 city,
 'R$ '+price,
 'a partir de R$ 2.036/mês',
 'Ver parcelas'
].join('\n');
const clipboard=[
 'Carros Jeep Compass 2022 usados, seminovos e novos 0km',
 '1.150 veículos encontrados',
 card('1.3 T270 Turbo Flex Longitude At6','2022','73.000','89.900','Taboão da Serra (SP)'),
 card('1.3 T270 Turbo Flex Longitude At6','2022','44.000','90.000','São Caetano do Sul (SP)'),
 card('1.3 T270 Turbo Flex Longitude At6','2022','63.100','91.000','Barueri (SP)'),
 card('2.0 TD350 Turbo Diesel Trailhawk At9','2022','62.000','96.000','Campinas (SP)'),
 card('1.3 T270 Turbo Flex Longitude At6','2023','51.000','93.000','São Paulo (SP)'),
 card('1.3 T270 Turbo Flex Longitude At6','2022','125.000','82.000','São Paulo (SP)'),
 card('1.3 T270 Turbo Flex Longitude At6','2022','69.500','86.000 leilão','Osasco (SP)')
].join('\n');
const r=parseVisibleWebmotorsText(clipboard,target);
assert.equal(r.found,7);
assert.equal(r.offers.length,3,'Only matching Longitude T270 2022 with nearby KM');
assert.deepEqual(r.offers.map(a=>a.price),[89900,90000,91000]);
assert.equal(r.meanLowestFive,90300);
assert.equal(r.offers[0].modelYear,2022);
assert.equal(r.offers[0].km,73000);
assert.ok(r.rejected.some(e=>e.reason==='Versão ou motorização diferente'));
assert.ok(r.rejected.some(e=>e.reason==='Ano-modelo diferente'));
assert.ok(r.rejected.some(e=>e.reason==='KM fora da faixa'));
assert.equal(parseVisibleWebmotorsText('JEEP COMPASS\n2022/2022\nR$ 89.900',target).offers.length,0,
 'Missing kilometre is never invented');
assert.equal(parseVisibleWebmotorsText('',target).meanLowestFive,null);
assert.equal(parseVisibleWebmotorsText(card('1.3 T270 Turbo Flex Longitude At6','2022','73.000','89.900'),target).meanLowestFive,null,
 'One offer cannot establish a mean');
const alternative={...target,versionLabel:'2.0 TD350 Turbo Diesel Trailhawk AT9'};
const alt=parseVisibleWebmotorsText(card('2.0 TD350 Turbo Diesel Trailhawk At9','2022','62.000','96.000'),alternative);
assert.equal(alt.offers.length,1,'Allows correctly selected diesel trim');
const bookmarklet=getWebmotorsCaptureBookmarklet();
assert.equal(inspectWebmotorsPaste(bookmarklet),'bookmarklet-code',
 'A real generated bookmarklet must be detected from its JavaScript prefix');
assert.ok(bookmarklet.startsWith('javascript:('));
assert.ok(bookmarklet.length>500);
assert.ok(!bookmarklet.includes('fetch('),'Bookmarklet must never make a background Webmotors request');
assert.ok(!bookmarklet.includes('document.cookie'),'No user cookies read');
assert.ok(!bookmarklet.includes('localStorage'),'No user app storage read');
assert.ok(bookmarklet.includes("confirm('Capturar '"),'Offer transfer requires explicit permission');
assert.ok(bookmarklet.includes("https://app.motyq.com.br/#motyq-import="),
 'Captures route only to the expected Motyq app');
const pageCard={innerText:card('1.3 T270 Turbo Flex Longitude At6','2022','73.000','89.900'),parentElement:null};
const link={href:'https://www.webmotors.com.br/comprar/jeep/compass/13-t270/2021-2022/12345678',
 innerText:'',parentElement:pageCard,getAttribute:()=>null};
const malicious={...link,href:'https://fake-webmotors.com.br/comprar/jeep/compass/13-t270/2021-2022/12345678'};
const page={href:'https://www.webmotors.com.br/carros/sp/jeep/compass',hostname:'www.webmotors.com.br'};
let confirmations=0;
const messages=[];
runInNewContext(bookmarklet.slice('javascript:'.length),{
 location:page,document:{querySelectorAll:()=>[link,link,malicious]},
 URL,TextEncoder,Set,Number,Math,String,Array,JSON,RegExp,btoa:(s)=>Buffer.from(s,'binary').toString('base64'),
 confirm:()=>{confirmations++;return true;},alert:(msg)=>messages.push(msg)
});
assert.equal(confirmations,1);
assert.ok(page.href.startsWith('https://app.motyq.com.br/#motyq-import='));
const b64=page.href.split('motyq-import=')[1].replace(/-/g,'+').replace(/_/g,'/');
const decoded=JSON.parse(Buffer.from(b64,'base64').toString('utf8'));
assert.equal(decoded.kind,'motyq-assisted-v1','Reuse existing safe transfer format');
assert.equal(decoded.ads.length,1,'Duplicate and malicious links ignored');
assert.equal(decoded.ads[0].price,89900);
assert.equal(decoded.ads[0].km,73000);
assert.equal(decoded.ads[0].year,2022);
assert.equal(messages.length,0);
const offPage={href:'https://other.example',hostname:'other.example'};
runInNewContext(bookmarklet.slice('javascript:'.length),{
 location:offPage,document:{querySelectorAll:()=>[]},URL,TextEncoder,Set,Number,Math,String,Array,JSON,RegExp,
 btoa:()=>'',confirm:()=>{throw Error('no confirm outside Webmotors');},
 alert:(msg)=>messages.push(msg)
});
assert.equal(messages.length,1,'Only Webmotors site is allowed');
assert.ok(panel.includes('Opção 1 · Capturar anúncios com um favorito do navegador'));
assert.ok(panel.includes('Opção 2 · Colar lista de ofertas'));
assert.ok(panel.includes('onImport(report.offers)'));
assert.ok(panel.includes('não é possível confirmar'));
assert.ok(workspace.includes('<MarketIqAssistedCapturePanel target={{'));
assert.ok(workspace.includes('const importTextOffers=(offers:VisibleOffer[])'));
assert.ok(workspace.includes("url:'',status:'pending',auto:false,catalog:false"),
 'Pasted rows have no individual URL, so are never pre-approved');
assert.ok(workspace.includes('disabled={Boolean(ad.auto||ad.catalog||!validSource(ad))}'),
 'Preliminary pasted offers cannot be validated before individual URL is provided');
assert.ok(workspace.includes("segments[0]==='comprar'&&segments[1]===expectedBrand&&segments[2]===expectedModel"),
 'Browser captures from unrelated models are not imported');
assert.ok(workspace.includes('referenceAvg*.86*(repasse?.95:1)')&&workspace.includes('avg*.86*(repasse?.95:1)'),
 'Buying formula untouched');
console.log('Motyq IQ assisted capture: pasted Compass 2022 price/KM sorting, version/engine safety, risks, browser-only bookmarklet, explicit consent, private source and existing valuation invariants passed.');
