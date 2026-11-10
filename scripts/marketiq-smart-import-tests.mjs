import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as XLSX from 'xlsx';

const source=readFileSync('services/marketIqSmartImport.ts','utf8');
const home=readFileSync('components/MarketIqSimpleHome.tsx','utf8');
const workspace=readFileSync('components/ManualPricingWorkspace.tsx','utf8');
const dealer=readFileSync('components/MarketIqDealerRadarPanel.tsx','utf8');
const archive=readFileSync('components/MarketIqMonthlyArchivePanel.tsx','utf8');
const toJs=(src,jsx=false)=>{
 const output=ts.transpileModule(src,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  ...(jsx?{jsx:ts.JsxEmit.ReactJSX}:{})
 },reportDiagnostics:true});
 const errors=(output.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
 assert.equal(errors.length,0,errors.map(x=>String(x.messageText)).join('; '));
 return output.outputText;
};
for(const ui of [home,workspace,dealer,archive])toJs(ui,true);
globalThis.__smartImportTestXlsx=XLSX;
const compiled=toJs(source).replace(/import \* as XLSX from ['"]xlsx['"];?/, 'const XLSX=globalThis.__smartImportTestXlsx;');
assert.ok(compiled.includes('__smartImportTestXlsx'));
const api=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));

const inventoryHead=['Empresa Compra','Estoque Atual','Modelo','Placa','Km','Dias','Preço Sugerido',
 'Marca','Ano Fab/Mod','Chassis','Valor Compra','Valor Custo'];
const appraisalHead=['ID Avaliação','Data de Avaliação','Placa da Avaliação','Marca','Modelo','Valor avaliado','Status'];
const buildBook=(sheets)=>{
 const wb=XLSX.utils.book_new();
 for(const [name,rows] of Object.entries(sheets))
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),name);
 return wb;
};
const check=(sheets)=>api.classifyMarketIqWorkbook(buildBook(sheets));
const dealerBook={Consulta:[['Atualizado: 10/11/2026'],inventoryHead,
 ['LOJA','Sorocaba','HB20','ABC1D23',18000,47,97000,'HYUNDAI','2024/2025','',85000,92000]]};
const evaluationBook={Worksheet:[appraisalHead,
 [116389084,'10/11/2026 09:00','ABC1D23','HYUNDAI','HB20',76000,'AVALIADO']]};
assert.equal(check(dealerBook).kind,'dealer');
assert.equal(check(dealerBook).sheet,'Consulta');
assert.equal(check(evaluationBook).kind,'evaluations');
assert.equal(check(evaluationBook).sheet,'Worksheet');
assert.equal(check({Notas:[['Este é o relatório']],Consulta:dealerBook.Consulta}).kind,'dealer');
assert.equal(check({Notas:[['Notas']],Historico:evaluationBook.Worksheet}).sheet,'Historico');
assert.throws(()=>check({Worksheet:[['Placa','Modelo','Valor avaliado']]}),/Formato não identificado/);
assert.throws(()=>check({Consulta:[['Placa','Preço Sugerido','Valor Custo']]}),/Formato não identificado/);
assert.throws(()=>check({...dealerBook,...evaluationBook}),/estoque e de avaliações/);
assert.throws(()=>check({Jan:evaluationBook.Worksheet,Fev:evaluationBook.Worksheet}),/Mais de uma aba/);
const file=(wb,name)=>{
 const bytes=XLSX.write(buildBook(wb),{type:'array',bookType:'xlsx'});
 return new File([bytes],name,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
};
assert.equal((await api.detectMarketIqWorkbook(file(dealerBook,'ConsultaEstoqueVeiculos_V44.xlsx'))).kind,'dealer');
assert.equal((await api.detectMarketIqWorkbook(file(evaluationBook,'relatorio_avaliacoes 1011.xlsx'))).sheet,'Worksheet');
await assert.rejects(api.detectMarketIqWorkbook(file(evaluationBook,'completo.pdf')),/Formato não permitido/);
await assert.rejects(api.detectMarketIqWorkbook(new File([], 'vazio.xlsx')),/arquivo está vazio/);
assert.ok(source.includes("bookVBA:false"),'VBA must not run while sniffing');
assert.ok(!source.includes('fetch(')&&!source.includes('localStorage')&&!source.includes('indexedDB'),
 'Detection never contacts backend or persists raw file');
assert.ok(home.includes('onSmartImport(detected.file,detected.result.kind,detected.result.sheet)'),
 'User must confirm the detected type before import');
assert.ok(home.includes("onChange={event=>{const file=event.target.files?.[0]"),'Home has one file picker');
assert.ok(home.includes('onSelectImport'), 'Fallback manual import remains');
assert.ok(workspace.includes("setSmartIncomingFile({token:Date.now()+'-'+Math.random(),file,kind,sheet})"));
assert.ok(workspace.includes("smartIncomingFile?.kind==='dealer'")&&
 workspace.includes("smartIncomingFile?.kind==='evaluations'"),
 'Importer dispatch cannot mix workbook kinds');
assert.ok(dealer.includes('processedIncomingToken.current===incoming.token')&&
 dealer.includes('void importFile(incoming.file)'));
assert.ok(archive.includes('processedIncomingToken.current===file.token')&&
 archive.includes('void importFile(file.file,file.sheet)'));
assert.ok(archive.includes("const remote=await archiveRequest('months');")&&
 archive.includes('const previous=incomingMonths.filter(m=>savedMonths.some(item=>item.month===m));'),
 'Never rely on mount-time empty month state for overwrite prevention');
assert.ok(archive.includes('window.confirm('),'Overwriting existing month requires consent');
assert.ok(archive.includes("await archiveRequest('commit'"),'Cloud archive still uses staged commit');
console.log('Motyq IQ smart import: Dealer/AutoAvaliar recognition, ambiguous/invalid rejection, explicit handoff, cloud-month overwrite protection and no raw uploads passed.');
