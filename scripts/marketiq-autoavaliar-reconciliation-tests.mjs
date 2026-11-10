import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('services/marketIqManagementData.ts','utf8');
const dashboard=readFileSync('components/MarketIqManagementDashboard.tsx','utf8');
const compile=(s,jsx=false)=>{
 const out=ts.transpileModule(s,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  ...(jsx?{jsx:ts.JsxEmit.ReactJSX}:{})
 },reportDiagnostics:true});
 assert.equal((out.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,
  (out.diagnostics||[]).map(x=>String(x.messageText)).join('; '));
 return out.outputText;
};
const {parseDashboardData,aggregateDashboard}=await import('data:text/javascript;base64,'+
 Buffer.from(compile(source)).toString('base64'));
compile(dashboard,true);
const row=(id,date,status,evaluator,value=70000)=>({
 'ID Avaliação':id,'Data de Avaliação':date,
 'Marca':'HYUNDAI','Modelo':'HB20 1.0', 'Ano modelo':2025,
 'Status':status,'Valor avaliado':value,'Avaliador':evaluator,
 'Lojas':'SOROCABA','Placa da Avaliação':'', 'FIPE':80000
});
const sourceRows=[
 row('N1','01/11/2026','AVALIADO','MARIA'),
 row('N2','02/11/2026','UTILIZADO','MARIA'),
 row('N3','03/11/2026','UTILIZADO','DANIEL BARRUCHELLI DA SILVA'),
 row('N4','04/11/2026','AVALIADO','DANIEL BARRUCHELLI DA SILVA'),
 row('N5','05/11/2026','UTILIZADO','MARIA',0),
 row('N6','06/11/2026','REPASSE','MARIA'),
 row('N6','06/11/2026','REPASSE','MARIA'),
 row('N7','07/11/2026','', 'MARIA')
];
const parsed=parseDashboardData(sourceRows,'original');
assert.equal(parsed.inputCount,8);
assert.equal(parsed.excludedEvaluator,2,'Keep the specifically requested evaluator exclusion');
assert.equal(parsed.reconciliation.rawStatuses['UTILIZADO'],3);
assert.equal(parsed.reconciliation.excludedStatuses['UTILIZADO'],1);
assert.equal(parsed.reconciliation.afterEvaluatorStatuses['UTILIZADO'],2);
assert.equal(parsed.reconciliation.rawStatuses['AVALIADO'],2);
assert.equal(parsed.reconciliation.excludedStatuses['AVALIADO'],1);
assert.equal(parsed.reconciliation.rawStatuses['REPASSE'],2);
assert.equal(parsed.reconciliation.missingStatusRows,1);
assert.equal(parsed.reconciliation.firstEvaluationDate,'2026-11-01');
assert.equal(parsed.reconciliation.lastEvaluationDate,'2026-11-07');
assert.equal(parsed.reconciliation.retainedRows,5);
assert.equal(parsed.reconciliation.classifiedPurchases,1);
assert.equal(parsed.reconciliation.classifiedQuotes,1);
assert.equal(parsed.invalidPurchases,1);
assert.equal(parsed.duplicates,1);
assert.equal(aggregateDashboard(parsed.rows).purchaseCount,1);
assert.equal(aggregateDashboard(parsed.rows).evaluations,5);
assert.ok(!JSON.stringify(parsed.reconciliation).includes('MARIA'),
 'Reconciliation cannot store reviewer, customer, plate or other PII');
assert.ok(!JSON.stringify(parsed.reconciliation).includes('DANIEL'),
 'Reconciliation stores only aggregate counts, not evaluator names');
assert.ok(dashboard.includes('Conciliação com AutoAvaliar: status originais e exclusões'));
assert.ok(dashboard.includes("importInfo.reconciliation.rawStatuses['UTILIZADO']"));
assert.ok(dashboard.includes('importInfo.reconciliation.excludedStatuses[status]'));
assert.ok(dashboard.includes('importInfo.reconciliation.classifiedPurchases'));
assert.ok(dashboard.includes('Esta conciliação permanece apenas em memória'));
assert.ok(dashboard.includes('localStorage.setItem(periodStorageKey,JSON.stringify(planned.next))'));
console.log('Motyq IQ reconciliation: export statuses, intentional evaluator exclusion, duplicate IDs, invalid purchases, date range and PII-free audit passed.');
