import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX};
const transpile=source=>{
 const result=ts.transpileModule(source,{compilerOptions:options,reportDiagnostics:true});
 assert.equal((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
 return result.outputText;
};
const moduleData=source=>'data:text/javascript;base64,'+Buffer.from(transpile(source)).toString('base64');
const rawBuyer=readFileSync('services/marketIqCotacaoMesaBuyers.ts','utf8');
const service=readFileSync('services/marketIqConsultedRepasse.ts','utf8');
const panel=readFileSync('components/MarketIqConsultedRepasse.tsx','utf8');
const radar=readFileSync('components/MarketIqDealerRadarPanel.tsx','utf8');
const desk=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
for(const file of [rawBuyer,service,panel,radar,desk])transpile(file);
const memory=new Map();
globalThis.localStorage={getItem:key=>memory.get(key)||null,setItem:(key,val)=>memory.set(key,val),removeItem:key=>memory.delete(key)};
const buyers=await import(moduleData(rawBuyer));
const quote=await import(moduleData(service));
const B=(id,shop,brands,models,type='both',optedIn=true)=>({
 ...buyers.blankBuyer(),id,shop,contact:'Contato',whatsapp:'(15) 99999-1234',
 brands,models,vehicleType:type,yearFrom:'2018',yearTo:'2026',optedIn,
 active:true,region:'Sorocaba',updatedAt:'2026-11-10T12:00:00Z'
});
const first=B('b1','Comprador Jeep','Jeep','Renegade');
const second=B('b2','Comprador Hilux','Toyota','Hilux');
const broad=B('b3','Comprador Geral','','','both',false);
const wrongType=B('b4','Motos Honda','Honda','CB 500','motorcycle');
const scopeA='abrao-reze|outlet|usuario-a';
const scopeB='abrao-reze|outlet|usuario-b';
buyers.saveCotacaoBuyers(scopeA,[first,second,broad,wrongType]);
assert.equal(buyers.loadCotacaoBuyers(scopeA).length,4);
assert.equal(buyers.loadCotacaoBuyers(scopeB).length,0,'No cross-user buyer directory');
const v={plate:'TIN6C49',brand:'Jeep',model:'Renegade 1.3 T270',year:'2022/2023',km:'32000',fipe:90000,vehicleType:'car'};
const ranked=buyers.rankCotacaoBuyers([first,second,broad,wrongType],v,'car');
assert.deepEqual(ranked.map(x=>x.buyer.id),['b1','b3'],'Only matching opt-in and generic dealers ranked');
assert.ok(ranked[0].score>ranked[1].score);
assert.equal(buyers.rankCotacaoBuyers([first],{...v,year:'2015'},'car').length,0);
assert.equal(buyers.rankCotacaoBuyers([wrongType],v,'car').length,0);
assert.equal(buyers.buyerWhatsAppUrl(broad,v),null,'No consent means no outbound link');
assert.equal(buyers.buyerWhatsAppUrl({...first,whatsapp:'abc'},v),null);
const link=buyers.buyerWhatsAppUrl(first,v);
assert.ok(link?.startsWith('https://wa.me/5515999991234?text='));
const message=decodeURIComponent(link.split('text=')[1]);
assert.ok(message.includes('Jeep')&&message.includes('Renegade')&&message.includes('32.000 km'));
assert.ok(!message.includes('TIN6C49'),'Never share plate without further approval');
assert.ok(!message.includes('90.000'),'Never share internal FIPE');
assert.ok(!message.includes('loja comprou'));
assert.ok(panel.includes('Abrir WhatsApp')&&panel.includes('Registrar resposta'));
assert.ok(panel.includes("updateRequest(buyer,'preparado')"),'Opening WhatsApp must not imply sent');
assert.ok(panel.includes('Contatado pela Mesa')&&panel.includes('Sem interesse'));
assert.ok(panel.includes('Salvar lojista')&&panel.includes('Cotação Mesa'));
assert.ok(panel.includes('registerClosedSale')&&panel.includes('Registrar fechamento'));
assert.ok(panel.includes("if(!before||changed)"),'Sale close must follow persisted quote with audit');
assert.ok(panel.includes("if(!window.confirm('Registrar venda"),'Sale requires manual confirmation');
assert.ok(panel.includes('paymentReceived:salePaid'),'Payment separated from sale price');
assert.ok(!panel.includes('fetch('),'No unsolicited API or automatic WhatsApp messaging');
assert.ok(!panel.includes('window.open('),'No background messaging');
assert.ok(desk.includes('Cotação Mesa</button>'));
assert.ok(desk.includes('incomingVehicle={quoteFromRadar}'));
assert.ok(desk.includes("switchDeskSection('consulted')"));
assert.ok(radar.includes('onQuoteVehicle?:(vehicle:DealerStockVehicle)=>void'));
assert.ok(radar.includes('Cotar na Mesa'));
const caseRow={
 id:'c1',createdAt:'2026-11-10T09:00:00Z',updatedAt:'2026-11-10T09:00:00Z',
 version:0,vehicle:v,
 offers:[{id:'o1',buyer:'Comprador Jeep',value:'60000',channel:'whatsapp',
 status:'confirmada',receivedAt:'2026-11-10',validUntil:'2099-12-31',note:''}],
 costs:{invoice:'0',taxesFixed:'0',taxesPercent:'0',transport:'0',
 preparation:'0',other:'0',marginMode:'reais',margin:'0'},
 selectedOfferId:'o1',proposedBuy:'52000',state:'consulta',requests:[],events:[]
};
const one=quote.appendConsultedAudit(null,caseRow,'Mesa');
const closed=quote.appendConsultedAudit(one,{...one,state:'vendido',sale:{
 buyer:'Comprador Jeep',offerId:'o1',finalValue:59000,closedAt:'2026-11-10',
 paymentReceived:false,registeredBy:'Mesa'
}},'Mesa');
assert.equal(closed.version,2);
assert.equal(closed.sale.finalValue,59000);
assert.equal(closed.sale.paymentReceived,false);
assert.ok(closed.events[1].changes.some(x=>x.includes('Fechamento de venda')));
const csv=quote.exportConsultedReportCsv([closed]);
assert.ok(csv.includes('Comprador Jeep')&&csv.includes('59000'));
assert.ok(csv.includes('Pagamento recebido conforme informado'));
assert.ok(!csv.includes('TIN6C49'),'No vehicle plate in the management report');
const reopened=quote.appendConsultedAudit(closed,{...closed,state:'negociacao',sale:null},'Mesa');
assert.equal(reopened.events.length,3);
assert.equal(reopened.sale,null);
assert.ok(reopened.events[2].changes.some(x=>x.includes('Fechamento de venda')));
assert.equal(quote.loadConsultedCases('nobody').length,0);
console.log('Cotação Mesa v1: buyer interest matching, scoped directory, consent, WhatsApp preview, handoff, operator sale closing, audit and no-auto-send passed.');
