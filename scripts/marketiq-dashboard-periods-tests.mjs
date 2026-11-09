import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const service=readFileSync('services/marketIqDashboardPeriods.ts','utf8');
const parser=readFileSync('services/marketIqManagementData.ts','utf8');
const ui=readFileSync('components/MarketIqManagementDashboard.tsx','utf8');
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const compile=(text)=>ts.transpileModule(text,{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX},
 reportDiagnostics:true
});
for(const file of [service,parser,ui]){
 const r=compile(file);
 assert.equal((r.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
}
const {readDashboardArchive,attachDashboardKeys,planDashboardMerge,emptyDashboardArchive,
 cleanDashboardRow}=await import('data:text/javascript;base64,'+Buffer.from(compile(service).outputText).toString('base64'));
const {parseDashboardData}=await import('data:text/javascript;base64,'+Buffer.from(compile(parser).outputText).toString('base64'));

const entry=(id,day,status='AVALIADO',value=70000,brand='CHEVROLET')=>({
 'ID Avaliação':id,'Data de Avaliação':day,'Marca':brand,'Modelo':'ONIX',
 'Tipo de Veículo':'AUTOMOVEL','Status':status,'Valor avaliado':value,'Ano modelo':2024,
 'Lojas':'SOROCABA','KM':25000,'FIPE':85000,'Gasto previsto':1000,'Finalidade':'SHOWROOM',
 'Cliente':'PRIVADO','Placa da Avaliação':'ABC1D23','Avaliador':'AVALIADOR'
});
const parse=async(rows)=>{const p=parseDashboardData(rows,'original');
 return await attachDashboardKeys(p.rows,p.sourceIds,'mesa@example.invalid')};
const oct=await parse([entry('A1','06/10/2026'),entry('A2','12/10/2026','UTILIZADO',68000)]);
const nov=await parse([entry('N1','05/11/2026'),entry('N2','09/11/2026','UTILIZADO',66000)]);
assert.equal(oct.length,2);
assert.equal(oct[0].month,'2026-10');
assert.equal(nov[0].month,'2026-11');
assert.ok(/^id:[a-f0-9]{64}$/.test(oct[0].recordKey));
assert.ok(!JSON.stringify(oct).includes('ABC1D23'));
assert.ok(!JSON.stringify(oct).includes('PRIVADO'));
const first=planDashboardMerge(emptyDashboardArchive(),oct,'outubro.xls','2026-11-01');
const second=planDashboardMerge(first.next,nov,'novembro.xls','2026-11-09');
assert.equal(second.next.records.length,4,'November must not overwrite October');
assert.deepEqual(Object.keys(second.next.months).sort(),['2026-10','2026-11']);
assert.equal(second.next.months['2026-10'].fileName,'outubro.xls');
assert.equal(second.next.months['2026-11'].fileName,'novembro.xls');
assert.equal(second.next.records.filter(r=>r.month==='2026-10').length,2);
assert.equal(second.next.records.filter(r=>r.month==='2026-11').length,2);
assert.deepEqual(second.replacedMonths,[]);
const sameNov=await parse([entry('N1','05/11/2026'),entry('N2','09/11/2026','UTILIZADO',63000)]);
const repeated=planDashboardMerge(second.next,sameNov,'novembro-atualizado.xlsx','2026-11-10');
assert.equal(repeated.next.records.length,4,'Reimporting same IDs must not duplicate records');
assert.equal(repeated.added,0);assert.equal(repeated.updated,2);
assert.equal(repeated.next.records.find(r=>r.recordKey===nov[1].recordKey)?.value,63000);
const moved=await parse([entry('N1','31/10/2026')]);
const movedPlan=planDashboardMerge(repeated.next,moved,'correcao.xlsx','2026-11-11');
assert.equal(movedPlan.next.records.length,4,'Date correction should update existing ID, not duplicate');
assert.equal(movedPlan.next.records.find(r=>r.recordKey===nov[0].recordKey)?.month,'2026-10');
const old=oct.map(({recordKey,...row})=>row);
const storage=new Map([['old',JSON.stringify(old)],['old-name','base 3110.xlsx']]);
const mem={getItem:key=>storage.get(key)||null};
const recovered=readDashboardArchive(mem,'v3','old');
assert.equal(recovered.records.length,2);
assert.equal(recovered.months['2026-10'].fileName,'base 3110.xlsx');
const afterRecovery=planDashboardMerge(recovered,nov,'novembro.xls','2026-11-09');
assert.equal(afterRecovery.next.records.length,4,'Legacy October must remain after November import');
assert.deepEqual(afterRecovery.replacedMonths,[]);
const legacySameMonth=planDashboardMerge(recovered,oct,'outubro atualizado.xlsx','2026-11-09');
assert.deepEqual(legacySameMonth.replacedMonths,['2026-10'],'Legacy same-month values need explicit replacement confirmation');
assert.equal(legacySameMonth.removedByReplacement,2);
assert.equal(legacySameMonth.next.records.length,2);
const withoutIds=nov.map(({recordKey,...row})=>row);
const noIdsFirst=planDashboardMerge(second.next,withoutIds,'sem-id.xlsx','2026-11-09');
assert.deepEqual(noIdsFirst.replacedMonths,['2026-11']);
assert.equal(noIdsFirst.next.records.filter(r=>r.month==='2026-10').length,2);
assert.equal(noIdsFirst.missingIds,2);
const privateInput={...oct[0],Client:'SIGILO',plate:'ABC1D23',phone:'999999999'};
const sanitized=cleanDashboardRow(privateInput);
assert.ok(sanitized);
assert.ok(!JSON.stringify(sanitized).includes('SIGILO'));
assert.ok(!JSON.stringify(sanitized).includes('ABC1D23'));
storage.set('v3',JSON.stringify(second.next));
const hydrated=readDashboardArchive(mem,'v3','old');
assert.equal(hydrated.records.length,4);
assert.equal(hydrated.months['2026-11'].count,2);
assert.ok(ui.includes('readDashboardArchive')&&ui.includes('planDashboardMerge'));
assert.ok(ui.includes('localStorage.setItem(periodStorageKey,JSON.stringify(planned.next))'));
assert.ok(ui.includes('window.confirm('),'ID-less period replacement requires confirmation');
assert.ok(ui.includes('Abrir Arquivo mensal na nuvem'),'Existing secure archive must be discoverable');
assert.ok(ui.includes('Meses disponíveis:'));
assert.ok(ui.includes('onOpenArchive'));
assert.ok(workspace.includes("onOpenArchive={()=>switchDeskSection('archive')}"));
assert.ok(!ui.includes("localStorage.setItem(storageKey,compact)"),'Legacy overwrite must be retired');
console.log('Motyq IQ dashboard multi-month: October/November preservation, hashed-ID update, legacy migration, same-month safeguards, privacy and Archive link passed.');
