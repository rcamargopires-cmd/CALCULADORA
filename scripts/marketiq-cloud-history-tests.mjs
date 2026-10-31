import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const server=readFileSync('services/marketiqPricingHistoryServer.ts','utf8');
const ui=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const api=readFileSync('api/marketiq-market-scan.ts','utf8');
const pure=server.slice(server.indexOf('const text='),server.indexOf('const email='))+
  '\n'+server.slice(server.indexOf('const validAdUrl='),server.indexOf('const historyPath='))+
  '\nresult={finite,normalizePayload};';
const output=ts.transpileModule(pure,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},reportDiagnostics:true});
assert.equal((output.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const ctx={result:null,URL};
runInNewContext(output.outputText,ctx);
const {finite,normalizePayload}=ctx.result;
assert.equal(finite('R$ 89.900',1,2000000),89900,'BRL thousands preserved');
assert.equal(finite('45.000',1,999999),45000,'odometer thousands preserved');
assert.equal(finite('2.500,50',0,50000),2500.50,'Brazilian cost decimals preserved');
assert.equal(finite(48000,1,999999),48000);
const example={
 date:'2026-10-31T17:00:00.000Z',plate:'ABC1D23',brand:'FIAT',model:'MOBI LIKE',
 year:'2024',km:'45.000',cost:'2.500,50',value:76000,repasse:false,
 ads:[{source:'webmotors',url:'https://www.webmotors.com.br/comprar/fiat/mobi/like/2024/12345678',
  price:'89.900',km:'41.000',status:'valid',note:'Conferido'},
  {source:'webmotors',url:'https://fake-webmotors.com/comprar/fiat/mobi/like/2024/12345678',
  price:'1.000',km:'30.000',status:'valid'}]
};
const normalized=normalizePayload(example);
assert.equal(normalized.km,'45000');
assert.equal(normalized.cost,'2500.5');
assert.equal(normalized.ads.length,1,'Remove non-Webmotors origin');
assert.equal(normalized.ads[0].price,'89900');
assert.equal(normalized.ads[0].km,'41000');
assert.equal(normalized.ads[0].status,'valid');
const draft=normalizePayload({...example,value:0,ads:[]});
assert.equal(draft.value,0,'Allow draft without price');
assert.throws(()=>normalizePayload({...example,plate:'BADPLATE'}));
assert.throws(()=>normalizePayload({...example,model:''}));
assert.throws(()=>normalizePayload({...example,ads:[{price:90000,url:'http://example.com'}],date:'invalid'}));
assert.ok(server.includes("accountFromToken(idToken)"));
assert.ok(server.includes("userContext(sa,token,fb)"));
assert.ok(server.includes("['admin','manager','pricing']"));
assert.ok(server.includes("scope.companyId,storeId:scope.storeId"));
assert.ok(!api.includes('api/marketiq-pricing-history'));
assert.ok(api.includes("pricingHistoryHandler(req,res)"));
assert.ok(ui.includes("Histórico de avaliações"));
assert.ok(ui.includes("Salvar avaliação no histórico"));
assert.ok(ui.includes("historyRequest('save',record)"));
assert.ok(ui.includes("historyRequest('list')"));
assert.ok(ui.includes("Copiar avaliações antigas para o histórico"));
assert.ok(ui.includes("switchDeskSection('pricing')"));
console.log('Motyq IQ history: price/KM parsing, validation, security and UI integration checks passed.');
