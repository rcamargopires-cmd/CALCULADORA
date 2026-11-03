import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const helper=readFileSync('services/marketIqFipeFreshness.ts','utf8');
const server=readFileSync('api/marketiq-fipe.ts','utf8');
const ui=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const transpile=(s,module=ts.ModuleKind.CommonJS)=>ts.transpileModule(s,{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module},reportDiagnostics:true
});
const js=transpile(helper);
assert.equal((js.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const module={exports:{}};
runInNewContext(js.outputText,{module,exports:module.exports,Date,Intl,Number,String,Math});
const {referencePeriod,monthInSaoPaulo,monthLabel,validatedAlternative,withFipeFreshness}=module.exports;
const now=new Date('2026-11-03T17:00:00.000Z');
assert.equal(referencePeriod('outubro de 2026'),'2026-10');
assert.equal(referencePeriod('NOVEMBRO/2026'),'2026-11');
assert.equal(referencePeriod('novembro de 2026'),'2026-11');
assert.equal(referencePeriod('2026-11'),'2026-11');
assert.equal(referencePeriod('março de 2026'),'2026-03');
assert.equal(monthLabel('2026-11'),'novembro de 2026');
assert.equal(monthInSaoPaulo(now),'2026-11');
assert.equal(monthInSaoPaulo(new Date('2026-11-01T02:30:00Z')),'2026-10','Brazil midnight cutoff must use Sao Paulo time');

const primary={
 value:49451,brand:'GM - Chevrolet',model:'ONIX HATCH LT 1.4 8V FlexPower 5p Mec.',
 year:2016,fuel:'Flex',referenceMonth:'outubro de 2026',fipeCode:'004425-3'
};
const alternative={
 codigo_fipe:'004425-3',
 atual:{codigo_fipe:'004425-3',value_cents:5100700,
   periodo:'2026-11',mes:'novembro de 2026',model_year:2016,brand_name:'GM - Chevrolet'}
};
const valid=validatedAlternative(alternative,primary,now);
assert.equal(valid?.value,51007,'November price cannot be inferred from October');
assert.equal(valid.referenceMonth,'novembro de 2026');
const fresh=withFipeFreshness(primary,valid,now);
assert.equal(fresh.value,51007);
assert.equal(fresh.referenceStatus,'current');
assert.equal(fresh.referenceSource,'tabelafipe.info');
assert.equal(fresh.fipeCode,'004425-3','FIPE identity must stay unchanged');
assert.equal(fresh.year,2016);
const stale=withFipeFreshness(primary,null,now);
assert.equal(stale.value,49451,'Do not invent November FIPE when source is unreachable');
assert.equal(stale.referenceStatus,'outdated');
assert.equal(stale.expectedReference,'novembro de 2026');
assert.equal(validatedAlternative({...alternative,atual:{...alternative.atual,model_year:2017}},primary,now),null,'Wrong year must be rejected');
assert.equal(validatedAlternative({...alternative,atual:{...alternative.atual,codigo_fipe:'004426-1'}},primary,now),null,'Wrong FIPE version must be rejected');
assert.equal(validatedAlternative({...alternative,atual:{...alternative.atual,periodo:'2026-10'}},primary,now),null,'A stale alternative never becomes current');
assert.equal(validatedAlternative({...alternative,atual:{...alternative.atual,value_cents:12000000}},primary,now),null,'Sudden >50% changes require independent review');
assert.equal(withFipeFreshness({...primary,referenceMonth:'novembro de 2026',value:51007},null,now).value,51007,'Primary API must win when it catches up');

assert.ok(server.includes("const quote=await freshQuote("),'Catalog detail should use fresh quote');
assert.ok(server.includes("json(await freshQuote(result))"),'Search by FIPE code should use fresh quote');
assert.ok(server.includes("validatedAlternative(await response.json(),primary)"),'Alternative value must be validated');
assert.ok(server.includes("'https://api.tabelafipe.info/api/v1/fipe/'"),'No-cost reference provider must be supported');
assert.ok(ui.includes("const stored=action==='detail'?null:"),'FIPE prices must never reuse stale sessionStorage');
assert.ok(ui.includes('Atualizar FIPE'),'Operator must be able to refresh FIPE explicitly');
assert.ok(ui.includes("fipe.referenceStatus==='outdated'"),'Stale month must be visible');
assert.ok(ui.includes('Dados via tabelafipe.info'),'Alternative attribution required');

// Full endpoint smoke test: mock primary October and alternative November
// to ensure API returns the newer verified quote to the UI.
const script=transpile(server.replace(/^import \{.*\} from .*;\s*$/gm,'').replace('export default async function handler','async function handler')+'\nhandlerResult=handler;',ts.ModuleKind.None);
assert.equal((script.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const primaryApi={
 price:'R$ 49.451,00',brand:primary.brand,model:primary.model,modelYear:2016,
 fuel:'Flex',referenceMonth:primary.referenceMonth,codeFipe:primary.fipeCode
};
let altOnline=true,requests=[];
const fakeFetch=async(url,opts={})=>{
 const u=String(url);requests.push(u);
 if(u.includes('fipe.parallelum.com.br'))return {ok:true,status:200,json:async()=>primaryApi};
 if(u.includes('api.tabelafipe.info'))return altOnline?
  {ok:true,status:200,json:async()=>alternative}:
  {ok:false,status:503,json:async()=>({erro:'unavailable'})};
 throw Error('unexpected API '+u);
};
const mockResponse=()=>({
 statusCode:200,body:null,headers:{},
 status(code){this.statusCode=code;return this;},
 setHeader(key,value){this.headers[key]=value;},
 json(json){this.body=json;return this;}
});
const sandbox={handlerResult:null,fetch:fakeFetch,AbortSignal,Date,Intl,Number,String,Math,Promise,console,
 process:{env:{}},setTimeout,...module.exports};
runInNewContext(script.outputText,sandbox);
const req={method:'GET',query:{action:'detail',vehicleType:'car',brandCode:'23',modelCode:'5049',yearCode:'2016-5'}};
let res=mockResponse();await sandbox.handlerResult(req,res);
assert.equal(res.statusCode,200);
assert.equal(res.body.value,51007,'Real API handler uses validated November response');
assert.equal(res.body.referenceStatus,'current');
assert.equal(res.headers['Cache-Control'],'private, no-store');
assert.ok(requests.some(u=>u.endsWith('/fipe/004425-3?ano=2016')));
altOnline=false;requests=[];
res=mockResponse();await sandbox.handlerResult(req,res);
assert.equal(res.statusCode,200,'Unreachable optional provider cannot break the FIPE screen');
assert.equal(res.body.value,49451);
assert.equal(res.body.referenceStatus,'outdated','Do not call October the current FIPE');
console.log('MarketIQ FIPE freshness: monthly references, source fallback, server validation, no stale cache and operator warning passed.');
