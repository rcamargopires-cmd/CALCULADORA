import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const compile=(path,dependencies={})=>{
 const source=readFileSync(path,'utf8');
 const output=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
 }}).outputText;
 const mod={exports:{}};
 runInNewContext(output,{
  module:mod,exports:mod.exports,URL,Number,String,Array,JSON,RegExp,Set,Math,Error,
  require:(id)=>{
   if(Object.prototype.hasOwnProperty.call(dependencies,id))return dependencies[id];
   throw new Error('Unexpected module dependency: '+id);
  }
 });
 return mod.exports;
};
const vehicleLib=compile('services/marketIqExpress.ts',{
 './marketIqFleetClassification':{classifyByMileage:()=>({classification:'A',destination:'SHOWROOM'})}
});
const lib=compile('services/marketIqAutoAvaliarFavorite.ts',{
 './marketIqExpress':vehicleLib
});
const favorite=lib.getAutoAvaliarFavoriteBookmarklet('https://app.motyq.com.br');
assert.ok(favorite.startsWith('javascript:(function captureVisibleAutoAvaliarCard('));
assert.ok(favorite.length>1200);
assert.ok(!favorite.includes('fetch('),'Never call APIs on the AutoAvaliar site');
assert.ok(!favorite.includes('document.cookie'),'Never access site credentials');
assert.ok(!favorite.includes('localStorage'),'Never read browser storage');
assert.ok(!favorite.includes('XMLHttpRequest'),'Never access hidden API endpoints');
assert.ok(favorite.includes('confirm('),'Explicit approval before navigation');
assert.ok(favorite.includes('window.open(url'), 'Keep AutoAvaliar evaluation in the original tab');
assert.ok(favorite.includes('autoavaliar.com.br'),'Restrict the favorite to actual AutoAvaliar domain');
assert.ok(favorite.includes('motyq-autoavaliar='));
assert.throws(()=>lib.getAutoAvaliarFavoriteBookmarklet('http://localhost:3000'),/Abra o Motyq/);
assert.throws(()=>lib.getAutoAvaliarFavoriteBookmarklet('https://example.org'),/Abra o Motyq/);
assert.ok(lib.getAutoAvaliarFavoriteBookmarklet('https://dealmaster-abcd123-reinaldo-ribas-projects.vercel.app').startsWith('javascript:'));

function capture(page,options={}){
 let openedUrl='',alerts=[],confirmed=false;
 const host=options.host||'portal.autoavaliar.com.br';
 runInNewContext(favorite.slice('javascript:'.length),{
  location:{hostname:host},
  document:options.document||{body:{innerText:page},querySelectorAll:()=>[]},
  window:{open(url){openedUrl=url;return {opener:{}};}},
  confirm(text){confirmed=text;return options.allow!==false;},
  alert(message){alerts.push(String(message));},
  Number,String,Math,JSON,RegExp,Array,Set,Error,encodeURIComponent
 });
 return {openedUrl,alerts,confirmed};
}
const polo=[
 'Dashboard','Avaliações','Fotos','Fotos Lista','POLO 1.0 MPI TRACK MANUAL',
 '#','116606156','Origem','NACIONAL','Placa','SPU1I52',
 'Ano','2025/2025','Cor','CINZA','Comb.','FLEX','Câmbio','MANUAL',
 'Km','39.318','Portas','4','Motor','999',
 'Renavam','01010101010','Chassi','CHASSI_EXEMPLO_NAO_TRANSFERIR',
 'Status AVALIADO','Avaliador AVALIADOR_EXEMPLO_NAO_TRANSFERIR','Telefone (15) 99999-9999',
 'NOTAS DA AVALIAÇÃO','7.1/10','REFERÊNCIAS','FIPE','Valor','R$ 73.315,00',
 'FIPE 0KM','R$ 92.089,00'
].join('\n');
const poloDone=capture(polo);
assert.ok(poloDone.openedUrl.startsWith('https://app.motyq.com.br/?iq=1#motyq-autoavaliar='));
assert.ok(poloDone.confirmed.includes('SPU1I52'));
assert.ok(!poloDone.openedUrl.includes('AVALIADOR_EXEMPLO'));
assert.ok(!poloDone.openedUrl.includes('01010101010'));
assert.ok(!poloDone.openedUrl.includes('CHASSI_EXEMPLO'));
assert.ok(!poloDone.openedUrl.includes('99999-9999'));
const poloDecoded=lib.decodeAutoAvaliarFavoriteHash(new URL(poloDone.openedUrl).hash);
assert.equal(poloDecoded.brand,'VOLKSWAGEN');
assert.equal(poloDecoded.model,'POLO 1.0 MPI TRACK MANUAL');
assert.equal(poloDecoded.plate,'SPU1I52');
assert.equal(poloDecoded.yearManufacture,'2025');
assert.equal(poloDecoded.yearModel,'2025');
assert.equal(poloDecoded.km,39318);
assert.equal(poloDecoded.fipeReference,73315);
assert.equal(poloDecoded.conditionScore,7.1);
assert.equal(poloDecoded.repairTotal,null);
assert.equal(poloDecoded.repairDetails.length,0);
// Actual AutoAvaliar vehicle cards display small icons beside each field,
// and some templates render label and value on the same line.
const inlineWithIcons=polo
 .replace('\nOrigem\nNACIONAL','\n◎ Origem NACIONAL')
 .replace('\nPlaca\nSPU1I52','\n⌗ Placa: SPU1I52')
 .replace('\nAno\n2025/2025','\n▣ Ano: 2025/2025')
 .replace('\nKm\n39.318','\n⚙ Km: 39.318');
const iconCaptured=capture(inlineWithIcons);
assert.ok(iconCaptured.openedUrl,'Icon-prefixed, same-line AutoAvaliar labels must be recognized');
const iconVehicle=lib.decodeAutoAvaliarFavoriteHash(new URL(iconCaptured.openedUrl).hash);
assert.equal(iconVehicle.plate,'SPU1I52');
assert.equal(iconVehicle.yearModel,'2025');
assert.equal(iconVehicle.km,39318);

// Some HTML table templates break the row's text in body.innerText.
// The fallback reads only the small parent of an exact field label.
function fixtureLabel(label,content){
 const row={innerText:label+' '+content,parentElement:null};
 const element={innerText:label,children:[],parentElement:row,nextElementSibling:null};
 return element;
}
const domFixture={
 body:{innerText:polo.replace('SPU1I52','[value in table cell]')
  .replace('2025/2025','[value in table cell]')
  .replace('39.318','[value in table cell]')},
 querySelectorAll:()=>[
  fixtureLabel('Placa','SPU1I52'),
  fixtureLabel('Ano','2025/2025'),
  fixtureLabel('KM','39.318')
 ]
};
const domCaptured=capture(domFixture.body.innerText,{document:domFixture});
assert.ok(domCaptured.openedUrl,'Read visible table cells even when flattened body text loses values');
const domVehicle=lib.decodeAutoAvaliarFavoriteHash(new URL(domCaptured.openedUrl).hash);
assert.equal(domVehicle.plate,'SPU1I52');
assert.equal(domVehicle.yearModel,'2025');
assert.equal(domVehicle.km,39318);

// Regression from the authenticated AutoAvaliar screenshot (2015/2015,
// GBE2488, 151.280 km): card labels and values may be on different DOM
// branches, at the same visual Y coordinate. The flattened page text
// contains neither plate nor year; use visible text-node bounding geometry.
const missingFlat=polo.replace('SPU1I52','[plate not in flattened rows]')
 .replace('2025/2025','[year not in flattened rows]')
 .replace('39.318','[km not in flattened rows]');
const mk=(value,left,top,width=100,height=17)=>({
 nodeValue:value,parentElement:{tagName:'SPAN'},
 rect:{left,right:left+width,top,bottom:top+height,height}
});
const visibleTextNodes=[
 mk('Origem',594,78,62),mk('NACIONAL',822,78,90),
 mk('Placa',594,111,57),mk('GBE2488',822,111,80),
 mk('Ano',594,144,35),mk('2015/2015',822,144,85),
 mk('Km',594,300,28),mk('151.280',822,300,75),
 // These additional values appear on other rows and must not leak.
 mk('Motor',594,315,52),mk('1000',822,315,47),
 mk('Renavam',594,355,60),mk('01066164115',822,355,102)
];
const geometryDoc={
 body:{innerText:missingFlat},
 querySelectorAll:()=>[],
 createTreeWalker:()=>{
  let i=0;return {nextNode:()=>visibleTextNodes[i++]||null};
 },
 createRange:()=>{
  let current=null;
  return {selectNodeContents(node){current=node;},
   getBoundingClientRect(){return current?.rect||null;}};
 }
};
const geometryCapture=capture(missingFlat,{document:geometryDoc});
assert.ok(geometryCapture.openedUrl,
 'The favorite should read actual aligned text nodes without print or OCR');
const geometryVehicle=lib.decodeAutoAvaliarFavoriteHash(new URL(geometryCapture.openedUrl).hash);
assert.equal(geometryVehicle.plate,'GBE2488');
assert.equal(geometryVehicle.yearManufacture,'2015');
assert.equal(geometryVehicle.yearModel,'2015');
assert.equal(geometryVehicle.km,151280);
assert.notEqual(geometryVehicle.plate,'01066164115');
assert.ok(geometryCapture.confirmed.includes('GBE2488'));
// Real 17/11/2026 Polo 1.6 MSI Total Flex Manual, QXC9B09,
// 2019/2020, 113.664 km. The favorite incorrectly sent "KM: 4" from
// the neighboring Portas row. A same-row visual match must win.
const msi=polo.replace('POLO 1.0 MPI TRACK MANUAL','POLO 1.6 MSI TOTAL FLEX MANUAL')
 .replace('SPU1I52','QXC9B09').replace('2025/2025','2019/2020')
 .replace('39.318','4');
const msiNodes=[
 mk('Origem',594,78,62),mk('NACIONAL',822,78,90),
 mk('Placa',594,111,57),mk('QXC9B09',822,111,80),
 mk('Ano',594,144,35),mk('2019/2020',822,144,85),
 mk('Km',594,300,28),mk('113.664',822,300,75),
 mk('Portas',594,331,60),mk('4',822,331,15)
];
const msiDoc={
 body:{innerText:msi},
 querySelectorAll:()=>[],
 createTreeWalker:()=>{
  let i=0;return {nextNode:()=>msiNodes[i++]||null};
 },
 createRange:()=>{
  let current=null;
  return {selectNodeContents(node){current=node;},
   getBoundingClientRect(){return current?.rect||null;}};
 }
};
const msiCaptured=capture(msi,{document:msiDoc});
assert.ok(msiCaptured.openedUrl,'Polo 1.6 MSI should be transferred for review');
const msiVehicle=lib.decodeAutoAvaliarFavoriteHash(new URL(msiCaptured.openedUrl).hash);
assert.equal(msiVehicle.plate,'QXC9B09');
assert.equal(msiVehicle.yearManufacture,'2019');
assert.equal(msiVehicle.yearModel,'2020');
assert.equal(msiVehicle.km,113664,
 'Visual KM of 113.664 must beat 4 from Portas or neighboring OCR text');
assert.ok(msiCaptured.confirmed.includes('KM: 113664'),
 'Consent dialog must show exact mileage before opening the Motyq');
const msiWithoutGeometry=capture(msi,{document:{
 body:{innerText:msi},querySelectorAll:()=>[]
}});
const msiWithoutGeometryVehicle=lib.decodeAutoAvaliarFavoriteHash(
 new URL(msiWithoutGeometry.openedUrl).hash);
assert.equal(msiWithoutGeometryVehicle.km,null,
 'Never guess 4 km from Portas when the KM geometry is not accessible');
assert.ok(msiWithoutGeometry.confirmed.includes('KM: a conferir'));
const msiInline=msi.replace('\nKm\n4','\nKm 113.664');
const msiInlineVehicle=lib.decodeAutoAvaliarFavoriteHash(new URL(capture(msiInline).openedUrl).hash);
assert.equal(msiInlineVehicle.km,113664,'Exact KM label/value on a line remains supported');
const missingPlateYear=polo.replace('SPU1I52','[plate missing]')
 .replace('2025/2025','[year missing]');
const missingOnly=capture(missingPlateYear,{document:{
 body:{innerText:missingPlateYear},querySelectorAll:()=>[],createTreeWalker:()=>({nextNode:()=>null}),
 createRange:()=>({selectNodeContents(){},getBoundingClientRect(){return null;}})
}});
const allMissing=capture(missingFlat,{document:{
 body:{innerText:missingFlat},querySelectorAll:()=>[],createTreeWalker:()=>({nextNode:()=>null}),
 createRange:()=>({selectNodeContents(){},getBoundingClientRect(){return null;}})
}});
assert.equal(allMissing.openedUrl,'','No plate, no year and no KM must not be transferred');
assert.ok(missingOnly.openedUrl,
 'With a clear title and KM, open manual review even if plate/year cannot be read');
assert.ok(missingOnly.confirmed.includes('ATENÇÃO: preencher no Motyq: ano/modelo, placa'));
const partialVehicle=lib.decodeAutoAvaliarFavoriteHash(new URL(missingOnly.openedUrl).hash);
assert.equal(partialVehicle.plate,'','Never guess a plate/year from unrelated values');
assert.equal(partialVehicle.yearModel,'');
assert.equal(partialVehicle.km,39318);
assert.ok(partialVehicle.warnings.some(w=>w.includes('Faltaram campos')));
assert.equal(capture(missingFlat,{allow:false,document:geometryDoc}).openedUrl,'',
 'Partial data still requires user confirmation');
const tera=polo.replace('POLO 1.0 MPI TRACK MANUAL','TERA 1.0 MPI FLEX MANUAL')
 .replace('SPU1I52','UQR5I61').replace('2025/2025','2026/2026')
 .replace('39.318','2.079').replace('R$ 73.315,00','R$ 92.652,00');
const teraDone=lib.decodeAutoAvaliarFavoriteHash(new URL(capture(tera).openedUrl).hash);
assert.equal(teraDone.brand,'VOLKSWAGEN');
assert.equal(teraDone.model,'TERA 1.0 MPI FLEX MANUAL');
assert.equal(teraDone.plate,'UQR5I61');
assert.equal(teraDone.km,2079);
assert.equal(teraDone.yearModel,'2026');
assert.equal(teraDone.fipeReference,92652);
const corolla=polo.replace('POLO 1.0 MPI TRACK MANUAL','COROLLA 2.0 XEI 16V FLEX 4P AUTOMÁTICO')
 .replace('SPU1I52','GLI0722').replace('2025/2025','2017/2017').replace('39.318','73.333');
const corollaDone=lib.decodeAutoAvaliarFavoriteHash(new URL(capture(corolla).openedUrl).hash);
assert.equal(corollaDone.brand,'TOYOTA');
assert.equal(corollaDone.plate,'GLI0722');
assert.equal(corollaDone.km,73333);
assert.equal(corollaDone.model,'COROLLA 2.0 XEI 16V FLEX 4P AUTOMÁTICO');
assert.equal(capture(polo,{allow:false}).openedUrl,'','No transfer without on-page user confirmation');
assert.equal(capture(polo,{host:'lookalike-autoavaliar.com.br'}).openedUrl,'','No transfer on unrelated site');
assert.equal(capture('Avaliador e estoque\nTeste sem veículo\nPlaca\nABC1D23').openedUrl,'','Cannot export another page');
assert.equal(lib.decodeAutoAvaliarFavoriteHash('#some-other-hash=123'),null);
assert.throws(()=>lib.decodeAutoAvaliarFavoriteHash('#motyq-autoavaliar=invalid-json'),/dados inválidos/);
assert.throws(()=>lib.decodeAutoAvaliarFavoriteHash('#motyq-autoavaliar='+encodeURIComponent(JSON.stringify({
 kind:'motyq-autoavaliar-favorite-v1',sourceHost:'evil.com',vehicle:{model:'POLO',plate:'ABC1D23',yearModel:'2025'}
}))),/não foi identificada/);
const panel=readFileSync('components/MarketIqExpressPrintPanel.tsx','utf8');
const desk=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
assert.ok(panel.includes('Copiar botão Enviar ao Motyq'));
assert.ok(panel.includes('getAutoAvaliarFavoriteBookmarklet(window.location.origin)'));
assert.ok(panel.includes('initialFavorite'));
assert.ok(panel.includes("method==='favorite'"));
assert.ok(desk.includes('decodeAutoAvaliarFavoriteHash(fragment)'));
assert.ok(desk.includes('setFavoriteIncoming(captured)'));
assert.ok(desk.includes('setExpressOpen(true)'));
assert.ok(desk.includes("history.replaceState(null,'',window.location.pathname+window.location.search)"));
assert.ok(desk.includes('initialFavorite={favoriteIncoming}'));
assert.ok(desk.includes('onApply={acceptExpressPrint}'));
console.log('AutoAvaliar favorite: visible-only DOM capture, real Polo/Tera/Corolla fields, consent, domain check, customer data redaction, strict receiver and Mesa confirmation passed.');
