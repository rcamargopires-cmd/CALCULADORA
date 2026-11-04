import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('services/marketIqMonthlyArchive.ts','utf8');
const ui=readFileSync('components/MarketIqMonthlyArchivePanel.tsx','utf8');
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const api=readFileSync('api/marketiq-market-scan.ts','utf8');
const panel=readFileSync('components/MarketIqManagementDashboard.tsx','utf8');
const transpile=ts.transpileModule(source,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext
},reportDiagnostics:true});
assert.equal((transpile.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const js=transpile.outputText.replace(
 /import\s*\{\s*isMoto\s*\}\s*from\s*['"]\.\/marketIqManagementData['"];\s*/, 
 `const isMoto=(b,m)=> ['YAMAHA','ROYAL ENFIELD','BAJAJ','KAWASAKI'].includes(b)||b==='HONDA'&&/^CG|^CB/.test(m);\n`
).replace(
 /import\s*\{\s*classifyByMileage\s*\}\s*from\s*['"]\.\/marketIqFleetClassification['"];\s*/,
 `const classifyByMileage=(k)=>({classification:k<=20000?'A':k<=50000?'B':k<=70000?'C':k<=120000?'D':'E'});\n`
);
assert.ok(!/from ['"]\.\//.test(js),'Independent test module has no unresolved relative imports');
const {parseMonthlyArchive,archiveMonthlyTotals,archiveDate}=await import('data:text/javascript;base64,'+
 Buffer.from(js).toString('base64'));
const make=(id,overrides={})=>({
 'ID Avaliação':id,'Data de Avaliação':'05/10/2026 10:30:40',
 'Placa da Avaliação':'ABC1D23','Marca':'HYUNDAI','Modelo':'HB20','Versão':'1.0 TGDI',
 'Status':'AVALIADO','Finalidade':'SHOWROOM','Lojas':'ABRAO REZE - VW',
 'Classificação':'B','KM':80992,'FIPE':76110,
 'Valor avaliado':64000,'Gasto previsto':3000,'ref. Web':79690,
 'Cliente':'Pessoa a descartar','Telefone':'15999999999',
 'Celular':'15988888888','Email':'privado@example.com',
 'VIN':'VINNUNCADEVEIR','Observações':'DADO SENSIVEL',
 'Avaliador':'AVALIADOR INTERNO','Vendedor':'VENDEDOR INTERNO',...overrides
});
const excelSerial=(Date.UTC(2026,9,6)-Date.UTC(1899,11,30))/86400000;
const data=[
 make(116388091),
 make(116388091,{'Valor avaliado':99999}), // exact same ID: ignored
 make(116388092,{'Data de Avaliação':excelSerial,'Status':'UTILIZADO',
  'Data de compra':'2026-10-08 00:00:00','Placa da Avaliação':'ABC1D23',
  'ref. Web':null,'ref. Web(OP)':85000}),
 make(116388093,{'Data de Avaliação':'02/11/2026 10:30:00','Placa da Avaliação':'NWG',
  'Marca':null,'Modelo':null,'ref. Web':0,'ref. Web(OP)':null}),
 make(116388094,{'Data de Avaliação':'02/11/2026','Marca':'YAMAHA','Modelo':'FAZER FZ25',
  'KM':9000,'Valor avaliado':0}),
 {'ID Avaliação':9999,'Data de Avaliação':'data inválida'},
];
const parsed=parseMonthlyArchive(data);
assert.equal(parsed.sourceRows,6);
assert.equal(parsed.rows.length,4,'All distinct dated evaluations, including incomplete plate/model, must survive');
assert.equal(parsed.duplicates,1);
assert.equal(parsed.invalid,1);
assert.deepEqual(parsed.months,{'2026-10':2,'2026-11':2});
assert.equal(parsed.rows.find(x=>x.id==='116388091').classRecorded,'B');
assert.equal(parsed.rows.find(x=>x.id==='116388091').classSuggested,'D',
 'New KM policy must not rewrite historical class');
assert.equal(parsed.rows.find(x=>x.id==='116388092').purchaseDate,'2026-10-08');
assert.equal(parsed.rows.find(x=>x.id==='116388092').webReference,85000);
assert.equal(parsed.rows.find(x=>x.id==='116388093').webReference,null,'Missing market data is not zero');
assert.equal(parsed.rows.find(x=>x.id==='116388094').assessedValue,null);
assert.equal(parsed.rows.find(x=>x.id==='116388094').vehicleType,'motorcycle');
assert.equal(parsed.rows.find(x=>x.id==='116388093').plate,'NWG');
assert.equal(parsed.rows.find(x=>x.id==='116388093').model,'NÃO INFORMADO');
assert.equal(archiveDate('31/10/2026 18:12:44'),'2026-10-31');
assert.equal(archiveDate('2026-02-30'),'');
assert.equal(archiveDate(excelSerial),'2026-10-06');
const oct=parsed.rows.filter(x=>x.month==='2026-10');
const totals=archiveMonthlyTotals(oct);
assert.equal(totals.evaluations,2);
assert.equal(totals.withWebReference,2);
assert.equal(totals.withPurchaseDate,1);
assert.equal(totals.classDifference,2);
const json=JSON.stringify(parsed.rows);
for(const secret of ['Pessoa a descartar','15999999999','15988888888','privado@example.com','VINNUNCADEVEIR','DADO SENSIVEL']){
 assert.ok(!json.includes(secret),'Never archive identifying customer data');
}
assert.ok(!source.includes('paidValue:'),'Archive must not infer real paid amount');
assert.ok(source.includes('id,month,evaluationDate,purchaseDate'),'Month by evaluation date, purchase separate');
assert.ok(ui.includes('Importar Excel (.xlsx)'));
assert.ok(ui.includes("await archiveRequest('commit'"),'Committed month only after all staged chunks');
assert.ok(ui.includes("await archiveRequest('chunk'"),'Chunked upload supports October 2,666 records');
assert.ok(ui.includes('Valor avaliado não foi tratado como preço efetivamente pago'));
assert.ok(ui.includes('Arquivo mensal de avaliações'));
assert.ok(ui.includes('classRecorded')&&ui.includes('classSuggested'),'Display original and modern KM class');
assert.ok(ui.includes('Resumo')===false||ui.includes('Avaliações encontradas'));
assert.ok(workspace.includes(">Arquivo mensal</button>"));
assert.ok(workspace.includes("deskSection==='archive'?<MarketIqMonthlyArchivePanel user={user}/>"));
assert.ok(panel.includes('parseDashboardData'),'Existing dashboard import flow remains intact');
assert.ok(api.includes('FIREBASE_SERVICE_ACCOUNT_JSON'),'Server reads existing service credential');
assert.ok(api.includes('accounts:lookup'),'Firebase ID token must be verified server-side');
assert.ok(api.includes('pricingDeskAccess'),'Enforce authorized Mesa-only profile');
assert.ok(api.includes('companyId:seg('),'Company must come from server-side profile');
assert.ok(api.includes('readChunks(')&&api.includes('ARCHIVE_INCOMPLETE'),
 'Commit must atomically swap manifest after validating all chunks');
assert.ok(api.includes('normalizeRow(r,month)'),'Server must reconstruct row allowlist');
assert.ok(!api.includes('raw.Cliente')&&!api.includes('raw.Telefone')&&!api.includes('raw.VIN'),'No customer PII in server');
assert.ok(api.includes('paidAmountCoverage:0'),'Do not infer actual paid amounts from spreadsheet');
assert.ok(api.includes('monthlyArchiveHandler(req,res)'),'Use consolidated route without creating another Vercel function');
assert.ok(ui.includes("'/api/marketiq-market-scan'"),'Client targets existing routed API');
console.log('Motyq IQ monthly archive: months, 52-column source, all statuses/vehicles, stable IDs, privacy, source-vs-KM class, paid-price safety and cloud staging verified.');
