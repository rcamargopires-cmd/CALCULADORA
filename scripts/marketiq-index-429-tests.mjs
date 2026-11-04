import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const api=readFileSync('api/marketiq-market-scan.ts','utf8');
const ui=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const from=api.indexOf('const riskWords =');
const to=api.indexOf('// Candidate prices',from);
assert.ok(from>0&&to>from);
const snippet=api.slice(from,to);
const result=ts.transpileModule(snippet+
 '\nresult={search,retryAfterSeconds,indexPausedResponse,paused:()=>marketIndexPausedUntil};',{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},
 reportDiagnostics:true
});
assert.equal((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);

let requests=0;
const response={
 status(code){this.statusCode=code;return this;},
 setHeader(name,value){this.headers[name]=value;return this;},
 json(data){this.data=data;return this;},
 headers:{}
};
const globals={
 result:null,
 fetch:async()=>{requests++;return {status:429,ok:false,headers:{get:()=> '240'}};},
 AbortSignal:{timeout:()=>undefined},Date,Math,JSON,URLSearchParams,
 Error,Object,Number,Set,Array,String,console
};
runInNewContext(result.outputText,globals);
const {search,indexPausedResponse,paused,retryAfterSeconds}=globals.result;
await assert.rejects(()=>search('jeep compass 2022','webmotors.com.br'),
 e=>e.rateLimited===true&&e.retryAfterSeconds===240);
assert.equal(requests,1,'A provider failure is not retried by the search function');
assert.ok(paused()>Date.now());
const rejected=indexPausedResponse(response);
assert.equal(rejected.statusCode,429);
assert.equal(rejected.data.code,'MARKET_SOURCE_RATE_LIMIT');
assert.ok(rejected.data.retryAfterSeconds>=60);
assert.ok(!/HTTP 429.*HTTP 429/.test(rejected.data.error),'Do not repeat provider errors');
assert.equal(retryAfterSeconds('60'),60);
assert.equal(retryAfterSeconds('7200'),3600);
assert.equal(retryAfterSeconds(null),900);
assert.ok(api.includes('for(const [query,domain] of queries)'),'Provider calls must be sequential');
assert.ok(api.includes("if((error as MarketIndexError)?.rateLimited){"),'Stop on first HTTP429');
assert.ok(api.includes("if(marketIndexPausedUntil>Date.now())return indexPausedResponse(res);"),'Warm instance circuit breaker');
assert.ok(!api.includes('await Promise.allSettled(vehicleType'), 'Avoid simultaneous quota exhaustion');
assert.ok(api.includes("if(results.length>=5)break"),'Avoid unnecessary successful queries');
assert.ok(ui.includes("marketCooldownUntil>Date.now()"),'No frontend fetch during cooldown');
assert.ok(ui.includes("response.status===429&&payload?.code==='MARKET_SOURCE_RATE_LIMIT'"));
assert.ok(ui.includes("sessionStorage.setItem(cooldownKey,String(until))"),'Pause survives page refresh within tab');
assert.ok(ui.includes("disabled={autoLoading||!searchReady||marketCooldownActive}"));
assert.ok(ui.includes("A busca pode continuar indisponível após esse período"),'Never promise provider recovery');
assert.ok(ui.includes("Abrir Webmotors para conferência manual"),'Webmotors fallback, not another source');
assert.ok(ui.includes('Referência histórica disponível:'),'Historical reference still shown');
assert.ok(ui.includes('marketReady?'),'Verified listings still determine definitive ceiling');
assert.ok(ui.includes('referenceAvg*.86*(repasse?.95:1)'),'No formula changes');
assert.ok(ui.includes('avg*.86*(repasse?.95:1)'),'No verified formula changes');
console.log('Motyq IQ index 429: one provider call, Retry-After, circuit breaker, browser cooldown, Webmotors fallback, FIPE/history preservation passed.');
