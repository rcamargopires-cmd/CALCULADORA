import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const opts={module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX};
const src=(path)=>readFileSync(path,'utf8');
const transpile=(file)=>{
 const result=ts.transpileModule(src(file),{compilerOptions:opts,reportDiagnostics:true});
 assert.equal((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,file+' syntax');
 return result.outputText;
};
const fleet='data:text/javascript;base64,'+Buffer.from(transpile('services/marketIqFleetClassification.ts')).toString('base64');
const expressTranspiled=transpile('services/marketIqExpress.ts');
const actual=expressTranspiled.replace(/from ['"]\.\/marketIqFleetClassification['"]/,"from '"+fleet+"'");
assert.ok(actual.includes(fleet),'Run fleet policy from real module, not mock');
const lib=await import('data:text/javascript;base64,'+Buffer.from(actual).toString('base64'));
const prisma=lib.cleanExpressVehicle({
 brand:'CHEVROLET',model:'PRISMA LTZ 1.4 FLEX AUTOMÁTICO',yearManufacture:'2017',yearModel:'2018',
 km:95800,plate:'ABC1D23',fipeReference:62291,conditionScore:5.8,repairTotal:2000,
 repairDetails:['Lataria R$ 1.500','Motor R$ 500'],warnings:[]
});
assert.equal(prisma.yearModel,'2018');assert.equal(prisma.km,95800);
assert.equal(prisma.fipeReference,62291);assert.equal(prisma.repairTotal,2000);
const showroom=lib.assessExpressCommercial(prisma,{demandConfirmed:true,stockZeroConfirmed:true});
assert.equal(showroom.priority,'SHOWROOM');
assert.equal(showroom.source,'operator_signals');
assert.equal(showroom.fleetClass,'D');
assert.equal(showroom.fleetGuideline,'REPASSE');
assert.equal(showroom.policyConflict,true);
assert.equal(showroom.needsReview,true);
assert.equal(lib.assessExpressCommercial(prisma,{demandConfirmed:true,stockZeroConfirmed:false}).priority,'NORMAL');
assert.equal(lib.assessExpressCommercial(prisma,{demandConfirmed:false,stockZeroConfirmed:true}).priority,'NORMAL');
const repasse=lib.assessExpressCommercial(prisma,{demandConfirmed:true,stockZeroConfirmed:true,manualClass:'REPASSE',manualReason:'Cautelar reprovada'});
assert.equal(repasse.priority,'REPASSE');assert.equal(repasse.source,'operator_override');
assert.ok(repasse.reason.includes('Cautelar reprovada'));
assert.equal(repasse.policyConflict,false);
const missing=lib.cleanExpressVehicle({brand:'VW',model:'GOL',yearModel:'2020',km:null,fipeReference:null,conditionScore:null});
assert.equal(missing.km,null);assert.equal(missing.fipeReference,null);assert.equal(missing.conditionScore,null);
const blanks=lib.cleanExpressVehicle({brand:'GM',model:'PRISMA',km:'',fipeReference:'',conditionScore:''});
assert.equal(blanks.km,null);assert.equal(blanks.fipeReference,null);assert.equal(blanks.conditionScore,null);
const noConfidence=lib.assessExpressCommercial(missing,{demandConfirmed:false,stockZeroConfirmed:false});
assert.equal(noConfidence.priority,'NORMAL');assert.equal(noConfidence.needsReview,true);
assert.equal(lib.cleanExpressVehicle({plate:'INVALID#123',km:1234567}).plate,'');
const api=src('api/analyze-deal.ts');
const localParserTranspiled=transpile('services/marketIqExpressOcrParser.ts');
const expressionUrl='data:text/javascript;base64,'+Buffer.from(actual).toString('base64');
const parserSrc=localParserTranspiled.replace(/from ['"]\.\/marketIqExpress['"]/, "from '"+expressionUrl+"'");
assert.ok(parserSrc.includes(expressionUrl),'Parser must import real Express validator');
const parser=await import('data:text/javascript;base64,'+Buffer.from(parserSrc).toString('base64'));
const exampleOcr=[
 'PRISMA 1.4 MPFI LTZ 8V FLEX 4P AUTOMATICO',
 'Placa FOT9835',
 'Ano 2017/2018',
 'Km 95.800',
 'ITENS AVALIADOS',
 'LATARIA R$ 1.500,00',
 'MOTOR R$ 500,00',
 'OPCIONAIS',
 'REFERENCIAS',
 'FIPE',
 'Valor R$ 62.291,00',
 'NOTAS DA AVALIACAO 5.8/10',
 'CLIENTE nome omitido'
].join('\n');
const parsedOcr=parser.parseAutoAvaliarOcrText(exampleOcr);
assert.equal(parsedOcr.brand,'CHEVROLET');assert.ok(parsedOcr.model.includes('PRISMA'));
assert.equal(parsedOcr.yearManufacture,'2017');assert.equal(parsedOcr.yearModel,'2018');
assert.equal(parsedOcr.plate,'FOT9835');assert.equal(parsedOcr.km,95800);
assert.equal(parsedOcr.fipeReference,62291);assert.equal(parsedOcr.repairTotal,2000);
assert.equal(parsedOcr.conditionScore,5.8);
assert.ok(parsedOcr.warnings.some(x=>x.includes('experimental')));
assert.equal(parser.parseAutoAvaliarOcrText('VW POLO\nPlaca ABC1D23\nAno 2020/2021\nKM 65.300\nFIPE 0KM\nFIPE\nValor R$ 78.300,00').fipeReference,78300);
assert.equal(parser.parseAutoAvaliarOcrText('VW POLO\nAno 2020/2021\nKM indefinido').km,null);
assert.throws(()=>parser.parseAutoAvaliarOcrText('cliente Joao CPF 12345678900'),/Não encontrei/);
const browserOcr=src('services/marketIqExpressBrowserOcr.ts');
transpile('services/marketIqExpressBrowserOcr.ts');
assert.ok(browserOcr.includes('tesseract.js@7.0.0/dist/tesseract.min.js'));
assert.ok(browserOcr.includes("createWorker(['por','eng']"));
assert.ok(!browserOcr.includes('fetch('),'Local print engine must not upload images');
assert.ok(!browserOcr.includes('localStorage')&&!browserOcr.includes('indexedDB'),'OCR must not store screenshots in app storage');
assert.ok(ui.includes('readExpressPrintLocally(file,setReadStatus)'));
assert.ok(ui.includes("setMethod('local')")&&ui.includes("setMethod('ai')"));
assert.ok(ui.includes("response.status!==503"),'Use local OCR when server AI is unavailable');
assert.ok(ui.includes("if(file){event.preventDefault();void read(file);}"),'Ctrl+V works also in demo');

const backend=src('server/motyqIqExpressPrint.ts');
const ui=src('components/MarketIqExpressPrintPanel.tsx');
const workspace=src('components/ManualPricingWorkspace.tsx');
const home=src('components/MarketIqSimpleHome.tsx');
const demo=src('components/MarketIqExpressDemoRoute.tsx');
const entry=src('index.tsx');
const rewrites=JSON.parse(src('vercel.json')).rewrites;
transpile('server/motyqIqExpressPrint.ts');transpile('components/MarketIqExpressPrintPanel.tsx');
transpile('components/MarketIqExpressDemoRoute.tsx');
assert.ok(api.includes("action||'')==='iq-express-print'"));
assert.ok(api.includes('await managementActor(req)'),'Only authenticated Mesa staff may read screenshots');
assert.ok(api.includes('actor.pricingDeskAccess===true'));
assert.ok(backend.includes('GEMINI_API_KEY')&&backend.includes('gemini-2.5-flash'));
assert.ok(backend.includes('NÃO extraia dados do cliente')&&backend.includes('NÃO atribua alta procura'));
assert.ok(backend.includes("if(data.length<200||data.length>2450000"));
assert.ok(!backend.includes('motyqFirestore.patch')&&!backend.includes('writeFile('),'Images should never be persisted');
assert.ok(ui.includes("window.addEventListener('paste',handler)"));
assert.ok(ui.includes('Selecionar print ou colar Ctrl+V'));
assert.ok(ui.includes('setDemand(true);setZeroStock(true)'),'Explicitly approved Prisma demo');
assert.ok(ui.includes('setOverride(e.target.value')&&ui.includes('option value="SHOWROOM"'));
assert.ok(ui.includes('Diretriz técnica por KM')&&ui.includes('Requer análise e autorização do gestor'));
assert.ok(ui.includes('Usar dados conferidos na Mesa'));
assert.ok(workspace.includes('onApply={acceptExpressPrint}')&&workspace.includes("setYearCode('');setFipe(null)"));
assert.ok(workspace.includes('Exceção: SHOWROOM')&&workspace.includes('destino oficial não foi alterado'));
assert.ok(home.includes('onOpenExpress')&&home.includes('Motyq IQ Express · Prévia por print'));
assert.ok(demo.includes('<MarketIqExpressPrintPanel demoOnly'),'Standalone preview must not call live OCR');
assert.ok(demo.includes('sem enviar a imagem para o Motyq'),'Explain browser-only screenshot processing');
assert.ok(entry.indexOf("==='/iq-express/laboratorio'?<MarketIqExpressDemoRoute/>")>=0);
assert.ok(rewrites.some(x=>x.source==='/iq-express/laboratorio'&&x.destination==='/index.html'));
assert.ok(ui.includes('if(!file||reading)return'),'Image input works in the demo');
assert.ok(ui.includes('Escolher print ou colar Ctrl+V'),'Enable genuine screenshot testing');

console.log('Motyq IQ Express: Prisma Showroom + Fleet D conflict, editable strategy, image privacy, authenticated Gemini extraction, copy/paste and Mesa handoff passed.');
