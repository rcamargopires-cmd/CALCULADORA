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
const spatialTsv=[
 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
 '5\t1\t1\t1\t1\t1\t20\t100\t40\t15\t90\tAno',
 '5\t1\t2\t1\t1\t1\t600\t100\t90\t15\t90\t2017/2018',
 '5\t1\t1\t1\t2\t1\t20\t135\t35\t15\t92\tKm',
 '5\t1\t2\t1\t2\t1\t600\t135\t70\t15\t91\t95.800'
].join('\n');
assert.deepEqual(parser.spatialOcrRows(spatialTsv),['Ano 2017/2018','Km 95.800']);
const spatialVehicle=parser.parseAutoAvaliarOcrText('PRISMA LTZ AUTOMATICO',spatialTsv);
assert.equal(spatialVehicle.yearModel,'2018');assert.equal(spatialVehicle.km,95800);
// Regression from the Taos screenshot feedback: photo tabs must not become model.
const taosNoisy=parser.parseAutoAvaliarOcrText(
  'AUT OAVALIAR\nBIA FOTOS LISTA TAOS 1.4 250 TSI TOTAL FLE\nNOTAS DA AVALIACAO 7,1/10',
  '',
  'TAOS 1.4 250 TSI TOTAL FLEX AUTOMATICO\nPlaca ABC1D23\nAno 2022/2023\nKm 43.500',
  '',
  'REFERENCIAS\nFIPE R$ 151.500,00'
);
assert.equal(taosNoisy.brand,'VOLKSWAGEN');
assert.equal(taosNoisy.model,'TAOS 1.4 250 TSI TOTAL FLEX AUTOMATICO');
assert.ok(!taosNoisy.model.includes('FOTOS'));
assert.equal(taosNoisy.yearModel,'2023');
assert.equal(taosNoisy.km,43500);
assert.equal(taosNoisy.plate,'ABC1D23');
assert.equal(taosNoisy.fipeReference,151500);
assert.equal(taosNoisy.conditionScore,7.1);
// Synthetic values shaped like the real AutoAvaliar Taos print (2024/2024,
// short screen where the FIPE amount is below 90% of the screenshot height).
const taosLayout=parser.parseAutoAvaliarOcrText(
  'TAOS 1.4 250 TSI TOTAL FLEX COMFORTLINE AUTOMATICO\nNOTAS 7,1/10',
  '',
  'TAOS 1.4 250 TSI TOTAL FLEX COMFORTLINE AUTOMATICO\nPlaca ABC1D23\nAno 2024/2024\nKm 26.472',
  '',
  'REFERENCIAS\nFIPE\nValor R$ 133.328,00\nFIPE 0KM'
);
assert.equal(taosLayout.brand,'VOLKSWAGEN');
assert.equal(taosLayout.yearModel,'2024');
assert.equal(taosLayout.plate,'ABC1D23');
assert.equal(taosLayout.km,26472);
assert.equal(taosLayout.fipeReference,133328);
// When OCR recognizes only the printed values, don't invent data outside
// the cropped vehicle card, but allow a strong standalone plate/km there.
const taosValuesOnly=parser.parseAutoAvaliarOcrText(
 'TAOS 1.4 250 TSI TOTAL FLEX COMFORTLINE AUTOMATICO',
 '',
 'TAOS 1.4 250 TSI TOTAL FLEX COMFORTLINE AUTOMATICO\nABC1D23\n2024/2024\n26.472',
 '',
 'REFERENCIAS\nFIPE\nValor RS 133.328,00'
);
assert.equal(taosValuesOnly.plate,'ABC1D23');
assert.equal(taosValuesOnly.km,26472);
assert.equal(taosValuesOnly.fipeReference,133328);
const taosO0=parser.parseAutoAvaliarOcrText(
 'TAOS 1.4 250 TSI AUTOMATICO',
 '',
 'TAOS 1.4 250 TSI AUTOMATICO\nABCOA03\n2024/2024\n26.472'
);
assert.equal(taosO0.plate,'ABC0A03');
assert.ok(taosO0.warnings.some(w=>w.includes('O e 0')));
const noAccidentalMileage=parser.parseAutoAvaliarOcrText(
 'TAOS 1.4 250 TSI AUTOMATICO\nFIPE R$ 133.328,00\nRenavam 0114101016',
 '',
 'TAOS 1.4 250 TSI AUTOMATICO\nRenavam 0114101016\nMotor 1395'
);
assert.equal(noAccidentalMileage.km,null);
// Diagnostic reproduction from the real Taos screenshot: targeted OCR on
// the narrow plate crop reads SVPGAG3, substituting G for numeric zeros.
assert.deepEqual(parser.normalizePlateFromIsolatedCrop('SVPGAG3'),{plate:'SVP0A03',corrected:true});
assert.deepEqual(parser.normalizePlateFromIsolatedCrop('SVP0A03'),{plate:'SVP0A03',corrected:false});
assert.equal(parser.normalizePlateFromIsolatedCrop('116583889'),null,'Never accept evaluation ID as a plate');
assert.equal(parser.normalizePlateFromIsolatedCrop('WAVB6B2B8A817868'),null,'Never accept a chassis as a plate');
assert.equal(parser.normalizePlateFromIsolatedCrop('TAOS 1.4 250 TSI'),null,'Never guess a plate from model description');
const taosPlateFallback=parser.parseAutoAvaliarOcrText(
 'TAOS 1.4 250 TSI TOTAL FLEX COMFORTLINE AUTOMATICO\nNOTAS 7,1/10',
 '',
 'TAOS 1.4 250 TSI TOTAL FLEX COMFORTLINE AUTOMATICO\n2024/2024\n26.472',
 '',
 'REFERENCIAS\nFIPE\nR$ 133.328,00',
 '',
 'SVPGAG3'
);
assert.equal(taosPlateFallback.plate,'SVP0A03');
assert.equal(taosPlateFallback.km,26472);
assert.equal(taosPlateFallback.fipeReference,133328);
assert.ok(taosPlateFallback.warnings.some(w=>w.includes('Confirma')||w.includes('Confira visualmente')));
const taosIncomplete=parser.parseAutoAvaliarOcrText('FOTOS LISTA TAOS 1.4 250 TSI TOTAL FLE');
assert.equal(taosIncomplete.brand,'VOLKSWAGEN');
assert.ok(taosIncomplete.model.startsWith('TAOS'));
assert.ok(!taosIncomplete.model.includes('FOTOS'));
assert.equal(taosIncomplete.yearModel,'');
assert.equal(taosIncomplete.km,null);
assert.ok(taosIncomplete.warnings.some(w=>w.includes('cortado')));
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
assert.ok(browserOcr.includes("recognize(image,{}, {tsv:true})"),'Collect word coordinates from OCR to reconstruct right-aligned values');
assert.ok(browserOcr.includes('screenshotRegions(file)'),'Full AutoAvaliar screenshots need magnified vehicle crop');
assert.ok(browserOcr.includes('regions=await screenshotRegions(file);'),'Region analysis must not depend on unreliable header OCR');
assert.ok(!browserOcr.includes('if(isAutoAvaliar)'),'Regional OCR must run even when tiny AutoAvaliar menu labels are missed');
assert.ok(browserOcr.includes('onPlateZoom?.(regions.plate)'),'Send only the isolated plate preview to the local UI');
assert.ok(browserOcr.includes('let configured=false;')&&browserOcr.includes('const plateResult=await worker.recognize(regions.plate);'),'Run plate OCR even if setParameters fails');

assert.ok(browserOcr.includes('detail:crop(0.555,0.005,0.215,0.745)'),'Detail crop must include plate and KM rows');
assert.ok(browserOcr.includes('reference:crop(0.775,0.59,0.21,0.41)'),'FIPE crop must reach the bottom of short AutoAvaliar screenshots');
assert.ok(browserOcr.includes('plate:crop(0.708,0.153,0.058,0.047,10)'),'Target the plate value row at 10x');
assert.ok(browserOcr.includes("if(!extracted.plate&&regions)"),'Avoid slow plate OCR when first pass succeeds');
assert.ok(browserOcr.includes("tessedit_pageseg_mode:'7'"),'Single-line Tesseract mode for 7-char plate');
assert.ok(browserOcr.includes("tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'"),'Plate OCR should avoid symbols');

assert.ok(browserOcr.includes('detailText,detailTsv,referenceText,referenceTsv'),'Regional OCR must be passed to parser');

assert.ok(!browserOcr.includes('fetch('),'Local print engine must not upload images');
assert.ok(!browserOcr.includes('localStorage')&&!browserOcr.includes('indexedDB'),'OCR must not store screenshots in app storage');

const backend=src('server/motyqIqExpressPrint.ts');
const ui=src('components/MarketIqExpressPrintPanel.tsx');
assert.ok(ui.includes('readExpressPrintLocally(file,setReadStatus,setPlateZoom)'),'Show the isolated plate only in local UI');
assert.ok(ui.includes('src={plateZoom}')&&ui.includes('Placa ampliada diretamente do seu print'),'Allow quick visual correction when OCR fails');
assert.ok(ui.includes("setMethod('local')")&&ui.includes("setMethod('ai')"));
assert.ok(ui.includes("response.status!==503"),'Use local OCR when server AI is unavailable');
assert.ok(ui.includes("if(file){event.preventDefault();void read(file);}"),'Ctrl+V works also in demo');

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
assert.ok(ui.includes('Escolher print ou colar Ctrl+V'));
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
