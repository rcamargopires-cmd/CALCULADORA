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
// Authenticated Desk only: summarize paid / approved outcomes, never
// confuse preliminary valuations with actual purchases.
const historyJs=transpile('services/marketIqExpressHistory.ts');
const history=await import('data:text/javascript;base64,'+Buffer.from(historyJs).toString('base64'));
const demoVehicle=lib.cleanExpressVehicle({
 brand:'TOYOTA',model:'RAV4 2.5 HYBRID AWD CVT',yearModel:'2020',yearManufacture:'2020',
 plate:'ABC1D23',km:34042,fipeReference:151680
});
const paidHistory=[
 {id:'1',plate:'ABC1D23',brand:'TOYOTA',model:'RAV4 2.5 HYBRID AWD CVT',year:'2020',km:'32000',date:'2026-10-05',approvedValue:120000},
 {id:'2',plate:'ABC1D23',brand:'TOYOTA',model:'RAV4 2.5 HYBRID AWD CVT',year:'2020',km:'34500',paidAt:'2026-11-10',paidValue:118000},
 {id:'2',plate:'ABC1D23',brand:'TOYOTA',model:'RAV4 2.5 HYBRID AWD CVT',year:'2020',km:'34500',paidAt:'2026-11-10',paidValue:118000},
 {id:'3',plate:'XYZ2A34',brand:'TOYOTA',model:'RAV4 2.5 HYBRID AWD CVT',year:'2020',km:'33000',paidAt:'2026-11-09',paidValue:121000},
 {id:'4',plate:'ABZ9Z88',brand:'TOYOTA',model:'RAV4 2.0 GASOLINA CVT',year:'2020',km:'33000',paidAt:'2026-11-02',paidValue:90000},
 {id:'5',plate:'ABC1D23',brand:'HYUNDAI',model:'HB20S 1.6 AUTOMATICO',year:'2020',km:'33000',paidAt:'2026-11-11',paidValue:70000},
 {id:'6',plate:'ABC1D23',brand:'TOYOTA',model:'RAV4 2.5 HYBRID AWD CVT',year:'2020',km:'36000',value:115000}
];
const exact=history.summarizeExpressHistory(demoVehicle,paidHistory);
assert.equal(exact.matchBy,'plate');assert.equal(exact.evaluations,3,'Duplicate ID and incompatible model excluded');
assert.equal(exact.paidCount,2,'Provisional value is not purchase');
assert.equal(exact.minPaid,118000);assert.equal(exact.maxPaid,120000);
assert.equal(exact.lastPaid,118000);
assert.equal(exact.repeatedPaid,null,'Never call repeated values from same plate a cross-vehicle pattern');
const otherPlate={...demoVehicle,plate:'DEF2G45'};
const comparable=history.summarizeExpressHistory(otherPlate,[
 ...paidHistory,
 {id:'7',plate:'QWE3R56',brand:'TOYOTA',model:'RAV4 2.5 HYBRID AWD CVT',year:'2020',km:'34000',approvedAt:'2026-11-12',approvedValue:121000},
 {id:'8',plate:'RTY4U67',brand:'TOYOTA',model:'RAV4 2.5 HYBRID AWD CVT',year:'2019',km:'34000',approvedValue:88000},
 {id:'9',plate:'BNM5K78',brand:'TOYOTA',model:'RAV4 2.5 HYBRID AWD CVT',year:'2020',km:'99000',approvedValue:91000},
 {id:'10',plate:'TYU6L89',brand:'TOYOTA',model:'RAV4 2.5 HYBRID AWD CVT',year:'2020',km:'35000',value:125000}
],true);
assert.equal(comparable.matchBy,'model');
assert.equal(comparable.paidCount,4);
assert.equal(comparable.repeatedPaid,121000);assert.equal(comparable.repeatCount,2);
assert.equal(comparable.incomplete,true);
const noHistory=history.summarizeExpressHistory({...demoVehicle,plate:'',model:'RAV4 2.0 GASOLINA CVT'},paidHistory);
assert.equal(noHistory.paidCount,1,'Trim-specific purchase should not leak from another version');
assert.equal(history.summarizeExpressHistory({...demoVehicle,brand:'JEEP'},paidHistory).paidCount,0);
const noPaid=history.summarizeExpressHistory(demoVehicle,[
 {id:'a',plate:'ABC1D23',brand:'TOYOTA',model:'RAV4 2.5 HYBRID AWD CVT',year:'2020',km:'34042',value:118000}
]);
assert.equal(noPaid.evaluations,1);
assert.equal(noPaid.paidCount,0);
assert.equal(noPaid.lastPaid,null);
const historyCard=src('components/MarketIqExpressHistoryCard.tsx');
transpile('components/MarketIqExpressHistoryCard.tsx');
assert.ok(historyCard.includes('Histórico rápido · valores efetivamente pagos'));
assert.ok(historyCard.includes('Último pagamento registrado'));
assert.ok(historyCard.includes('Não encontrei avaliações pagas comparáveis'));
assert.ok(historyCard.includes('Histórico indisponível agora: {error}'),'Do not mistake history API failure for no paid records');
assert.ok(src('components/ManualPricingWorkspace.tsx').includes('historyError={historyError}'),'Explicit history load errors reach the preview');
const deskSrc=src('components/ManualPricingWorkspace.tsx');
assert.ok(deskSrc.includes('history={saved} historyLoading={historyBusy} historyIncomplete={historyMore}'),
 'Express history must be passed from authenticated Desk scope only');
assert.ok(deskSrc.includes('setBrandCode(brandMatches.length===1?brandMatches[0].code:'),'Auto-select only exact brand');
assert.ok(deskSrc.includes("setModelCode('');setYearCode('');setFipe(null);"),'Never guess FIPE trim and price');
assert.ok(deskSrc.includes("switchDeskSection('plateHistory')"),'Plate history accessible without duplicating a screen');

// The Express handoff must NEVER erase a recognized model from the visible
// Mesa form when its FIPE code is pending. Unique equivalent trim suggestions
// remain opt-in; ambiguity or different fuel/trim must not be auto-selected.
const handoffJs=transpile('services/marketIqExpressFipeHandoff.ts');
const handoff=await import('data:text/javascript;base64,'+Buffer.from(handoffJs).toString('base64'));
const corollaCaptured='COROLLA 2.0 XEI 16V FLEX 4P AUTOMATICO';
const fipeModels=[
 {code:'cx',name:'Corolla XEi 2.0 Flex 16V Aut.'},
 {code:'ca',name:'Corolla Altis 2.0 Flex 16V Aut.'},
 {code:'cm',name:'Corolla XEi 2.0 Flex 16V Mec.'},
 {code:'cd',name:'Corolla XEi 2.0 Diesel 16V Aut.'},
 {code:'c18',name:'Corolla XEi 1.8 Flex 16V Aut.'}
];
// AutoAvaliar's "ARGO 1.0 FIREFLY FLEX DRIVE MANUAL" is published in the
// FIPE catalog as "ARGO DRIVE 1.0 6V Flex". Keep this narrowly-scoped alias
// and require a click and a separate year/fuel confirmation in the Mesa.
const argoFromScreenshot='ARGO 1.0 FIREFLY FLEX DRIVE MANUAL «';
const argoOptions=[
 {code:'001494-0',name:'ARGO DRIVE 1.0 6V Flex'},
 {code:'other1',name:'ARGO DRIVE 1.3 8V Flex'},
 {code:'other2',name:'ARGO DRIVE 1.0 6V Flex S-Design'},
 {code:'other3',name:'ARGO TREKKING 1.3 8V Flex'},
 {code:'other4',name:'ARGO DRIVE 1.0 6V Gasolina'},
 {code:'other5',name:'ARGO DRIVE 1.0 6V Flex Aut.'}
];
assert.deepEqual(handoff.suggestUniqueExpressFipeModel(argoFromScreenshot,argoOptions),argoOptions[0],
 'Show a uniquely recognized Argo Firefly Drive manual model despite a different FIPE name');
assert.deepEqual(handoff.suggestUniqueExpressFipeModel('ARGO DRIVE 1.0 FLEX MANUAL',argoOptions),argoOptions[0],
 'A clean AutoAvaliar title also supports the verified 1.0 manual alias');
assert.equal(handoff.suggestUniqueExpressFipeModel('ARGO 1.3 FIREFLY FLEX DRIVE MANUAL',argoOptions),null,
 'Never conflate Argo 1.3 with 1.0');
assert.equal(handoff.suggestUniqueExpressFipeModel('ARGO 1.0 FIREFLY GASOLINA DRIVE MANUAL',argoOptions),null,
 'Do not replace gasoline with flex');
assert.equal(handoff.suggestUniqueExpressFipeModel('ARGO 1.0 FIREFLY FLEX DRIVE AUTOMATICO',argoOptions),null,
 'Manual-only alias must never accept automatic transmission');
assert.equal(handoff.suggestUniqueExpressFipeModel('ARGO 1.0 FIREFLY FLEX TREKKING MANUAL',argoOptions),null,
 'Never conflate a different Argo trim');
assert.equal(handoff.suggestUniqueExpressFipeModel(argoFromScreenshot,[argoOptions[0],{...argoOptions[0],code:'duplicate'}]),null,
 'Ambiguous FIPE catalog choices require explicit search, not a suggested version');
assert.equal(handoff.suggestUniqueExpressFipeModel(argoFromScreenshot,[argoOptions[1],argoOptions[2],argoOptions[3]]),null,
 'Do not broaden the candidate if the approved version does not exist');
const sanitizedArgo=lib.cleanExpressVehicle({brand:'FIAT',model:argoFromScreenshot,plate:'ABC1D23',yearModel:'2020',km:62694});
assert.equal(sanitizedArgo.model,'ARGO 1.0 FIREFLY FLEX DRIVE MANUAL',
 'Strip OCR arrows from vehicle descriptions');
assert.equal(lib.cleanExpressVehicle({model:'COROLLA 2.0 XEI FLEX AUTOMATICO | (&'}).model,'COROLLA 2.0 XEI FLEX AUTOMATICO',
 'Clean trailing UI glyphs without changing engine or trim');
assert.deepEqual(handoff.suggestUniqueExpressFipeModel(corollaCaptured,fipeModels),fipeModels[0],
 'Identify the unique FIPE model with reordered trim/engine, without applying it');
assert.equal(handoff.suggestUniqueExpressFipeModel(corollaCaptured,[fipeModels[0],{...fipeModels[0],code:'cx2'}]),null,
 'Never choose between two equivalent FIPE codes');
assert.equal(handoff.suggestUniqueExpressFipeModel('COROLLA XEI',fipeModels),null,
 'Incomplete extraction requires manual FIPE choice');
assert.equal(handoff.suggestUniqueExpressFipeModel('COROLLA 2.0 XEI 16V GASOLINA AUTOMATICO',fipeModels),null,
 'Never match Flex to Gasolina/Diesel');
assert.equal(handoff.suggestUniqueExpressFipeModel('Q3 2.0 40 TFSI GASOLINA SPORTBACK PERFORMANCE QUATTRO TIPTRONIC',fipeModels),null);
assert.ok(deskSrc.includes("'Do print: '+expressReview!.vehicle.model")&&deskSrc.includes('expressModelPending'),
 'Mesa shows the captured model even with an unselected FIPE code');
assert.ok(deskSrc.includes('Reconhecido no AutoAvaliar:')&&deskSrc.includes('expressReview!.vehicle.model'),
 'The extracted description is visibly preserved next to the FIPE selector');
assert.ok(deskSrc.includes('Confirmar versão FIPE: {expressFipeSuggestion.name}')&&
 deskSrc.includes('onClick={()=>selectModel(expressFipeSuggestion.code)}'),
 'FIPE catalog suggestion needs an explicit operator click');
assert.ok(deskSrc.includes('Ano/modelo capturado:')&&deskSrc.includes('Escolha o ano e o combustível'),
 'Captured year remains visible but not selected without confirmation');
assert.ok(deskSrc.includes('setExpressReview(null);'),'New valuation must not display a previous car capture');

const api=src('api/analyze-deal.ts');
const localParserTranspiled=transpile('services/marketIqExpressOcrParser.ts');
const expressionUrl='data:text/javascript;base64,'+Buffer.from(actual).toString('base64');
const parserSrc=localParserTranspiled.replace(/from ['"]\.\/marketIqExpress['"]/, "from '"+expressionUrl+"'");
assert.ok(parserSrc.includes(expressionUrl),'Parser must import real Express validator');
const parser=await import('data:text/javascript;base64,'+Buffer.from(parserSrc).toString('base64'));

const parserUrl='data:text/javascript;base64,'+Buffer.from(parserSrc).toString('base64');
const clipboardJs=transpile('services/marketIqExpressClipboard.ts')
 .replace(/from ['"]\.\/marketIqExpressOcrParser['"]/, "from '"+parserUrl+"'")
 .replace(/from ['"]\.\/marketIqExpress['"]/, "from '"+expressionUrl+"'");
const clipboard=await import('data:text/javascript;base64,'+Buffer.from(clipboardJs).toString('base64'));
// Real-world screenshot structure: RAV4 Hybrid title wraps with CVT on the
// next line. Use a fictitious plate in tests; no private customer information.
const rav4Text=[
 'AutoAvaliar Avaliação',
 'Fotos Fotos Lista',
 'RAV4 2.5 VVT-IE HYBRID S CONNECT AWD',
 'CVT',
 'Origem IMPORTADO',
 'Placa ABC1D23',
 'Ano 2020/2020',
 'Cor BRANCO',
 'Comb. HIBRIDO',
 'Câmbio AUTOMÁTICO',
 'Km 34.042',
 'Referências',
 'FIPE',
 'Valor R$ 151.680,00'
].join('\n');
const rav4Direct=clipboard.parseAutoAvaliarClipboardText(rav4Text);
assert.equal(rav4Direct.brand,'TOYOTA','RAV4 must be recognized as Toyota');
assert.equal(rav4Direct.model,'RAV4 2.5 VVT-IE HYBRID S CONNECT AWD CVT');
assert.equal(rav4Direct.plate,'ABC1D23');
assert.equal(rav4Direct.yearManufacture,'2020');
assert.equal(rav4Direct.yearModel,'2020');
assert.equal(rav4Direct.km,34042);
assert.equal(rav4Direct.fipeReference,151680);
const rav4ImageText=parser.parseAutoAvaliarOcrText(
 'Fotos Fotos Lista\nRAV4 2.5 VVT-IE HYBRID S CONNECT AWD\nCVT\nPlaca ABC1D23\nAno 2020/2020\nKm 34.042',
 '',
 'RAV4 2.5 VVT-IE HYBRID S CONNECT AWD\nCVT\nPlaca ABC1D23\nAno 2020/2020\nKm 34.042',
 '',
 'REFERENCIAS\nFIPE\nR$ 151.680,00'
);
assert.equal(rav4ImageText.brand,'TOYOTA');
assert.equal(rav4ImageText.model,'RAV4 2.5 VVT-IE HYBRID S CONNECT AWD CVT');
assert.equal(rav4ImageText.km,34042);
assert.equal(rav4ImageText.fipeReference,151680);
// Real AutoAvaliar Audi Q3 Sportback layout: title wraps before the plate,
// and the brand is absent from the heading. Use a fictitious plate in tests.
const audiQ3Ocr=parser.parseAutoAvaliarOcrText(
 'Fotos Fotos Lista\nQ3 2.0 40 TFSI GASOLINA SPORTBACK\nPERFORMANCE QUATTRO TIPTRONIC\n# 116596479\nOrigem\nPlaca ABC1D23\nAno 2022/2023\nKM 62.500',
 '',
 'Q3 2.0 40 TFSI GASOLINA SPORTBACK\nPERFORMANCE QUATTRO TIPTRONIC\nOrigem\nPlaca ABC1D23\nAno 2022/2023\nKM 62.500',
 '',
 'REFERÊNCIAS\nFIPE\nValor R$ 209.876,00',
 '',
 undefined,
 '4,5/10'
);
assert.equal(audiQ3Ocr.brand,'AUDI','Q3 should identify Audi without an explicit make');
assert.equal(audiQ3Ocr.model,'Q3 2.0 40 TFSI GASOLINA SPORTBACK PERFORMANCE QUATTRO TIPTRONIC',
 'Preserve the wrapped Q3 Sportback version');
assert.equal(audiQ3Ocr.yearManufacture,'2022');
assert.equal(audiQ3Ocr.yearModel,'2023');
assert.equal(audiQ3Ocr.km,62500);
assert.equal(audiQ3Ocr.plate,'ABC1D23');
assert.equal(audiQ3Ocr.fipeReference,209876);
assert.equal(audiQ3Ocr.conditionScore,4.5);
const audiQ3Direct=clipboard.parseAutoAvaliarClipboardText(
 'Q3 2.0 40 TFSI GASOLINA SPORTBACK\nPERFORMANCE QUATTRO TIPTRONIC\nPlaca ABC1D23\nAno 2022/2023\nKm 62.500\nFIPE R$ 209.876,00');
assert.equal(audiQ3Direct.brand,'AUDI');
assert.equal(audiQ3Direct.model,audiQ3Ocr.model);
const noTrimLeak=parser.parseAutoAvaliarOcrText(
 'Q3 2.0 40 TFSI GASOLINA SPORTBACK\nCLIENTE EXEMPLO\nPlaca ABC1D23\nAno 2022/2023\nKM 62.500');
assert.equal(noTrimLeak.model,'Q3 2.0 40 TFSI GASOLINA SPORTBACK',
 'Unrelated customer text must never be appended to the vehicle version');

const unknownButWellLabelled=clipboard.parseAutoAvaliarClipboardText(
 'MITSUBISHI OUTLANDER 2.0 FLEX CVT\nPlaca ABC1D23\nAno 2022/2022\nKm 45.000'
);
assert.equal(unknownButWellLabelled.brand,'MITSUBISHI','Brand-prefixed unlisted models should still work');
assert.equal(unknownButWellLabelled.model,'OUTLANDER 2.0 FLEX CVT');
assert.equal(unknownButWellLabelled.km,45000);
// Never invent a manufacturer just because some model-like text has a motor.
const noBrandModel=parser.parseAutoAvaliarOcrText('MODELO DESCONHECIDO 2.5 FLEX CVT\nPlaca ABC1D23\nAno 2020/2020',
 '', 'MODELO DESCONHECIDO 2.5 FLEX CVT\nPlaca ABC1D23\nAno 2020/2020');
assert.equal(noBrandModel.brand,'');
assert.ok(noBrandModel.warnings.some(x=>x.includes('Marca não reconhecida')));
// Sanitized actual Tesseract output from the user's RAV4 screenshot crop.
// The OCR inserts icon junk before labels and concatenates "S CONNECT AWD".
const rav4ActualOcr=parser.parseAutoAvaliarOcrText([
 'RAV4 2.5 VVT-IE HYBRID SCONNECTAWD','CVT','# 116592614',
 '@ Origem IMPORTADO','® Placa ABC1D23','63 Ano 2020/2020',
 'A km 34.042','& Portas 4','% Motor 2487'
].join('\n'));
assert.equal(rav4ActualOcr.brand,'TOYOTA');
assert.equal(rav4ActualOcr.model,'RAV4 2.5 VVT-IE HYBRID SCONNECTAWD CVT');
assert.equal(rav4ActualOcr.yearModel,'2020');
assert.equal(rav4ActualOcr.plate,'ABC1D23');
assert.equal(rav4ActualOcr.km,34042,'KM must survive the tiny OCR artifact before its label');
const copiedHB20S=[
 'AutoAvaliar',
 'Avaliação',
 'HB20S 1.6 COMFORT PLUS 16V FLEX 4P',
 'AUTOMATICO',
 '# 116591873',
 'Origem NACIONAL',
 'Placa PXN3664',
 'Ano 2016/2016',
 'Comb. FLEX',
 'Câmbio AUTOMÁTICO',
 'Km 154.027',
 'Renavam 01082861470',
 'FIPE',
 'Valor R$ 60.921,00',
 'NOTAS DA AVALIAÇÃO',
 '7,1/10',
 'CLIENTE Teste Privado',
 'CPF 12345678900'
].join('\n');
const direct=clipboard.parseAutoAvaliarClipboardText(copiedHB20S);
assert.equal(direct.brand,'HYUNDAI');
assert.equal(direct.model,'HB20S 1.6 COMFORT PLUS 16V FLEX 4P AUTOMATICO');
assert.equal(direct.yearModel,'2016');
assert.equal(direct.km,154027);
assert.equal(direct.plate,'PXN3664');
assert.equal(direct.fipeReference,60921);
assert.equal(direct.conditionScore,7.1);
assert.ok(direct.warnings.some(x=>x.includes('texto copiado')));
assert.ok(!JSON.stringify(direct).includes('Teste Privado')&&!JSON.stringify(direct).includes('12345678900'),'Do not persist or expose copied client details');
const copiedToro=clipboard.parseAutoAvaliarClipboardText(
 'AutoAvaliar\nTORO 1.3 TURBO 270 FLEX VOLCANO AT6\nPlaca\nURC6A47\nAno\n2026/2026\nKm\n18.977\nREFERENCIAS\nFIPE\nValor\nR$ 156.118,00'
);
assert.equal(copiedToro.brand,'FIAT');assert.equal(copiedToro.plate,'URC6A47');
assert.equal(copiedToro.km,18977);assert.equal(copiedToro.fipeReference,156118);
assert.throws(()=>clipboard.parseAutoAvaliarClipboardText('um texto aleatório'),/Copie o quadro/);
assert.throws(()=>clipboard.parseAutoAvaliarClipboardText('Placa ABC1D23\nAno 2024/2024\nKM 15000'),/Não identifiquei marca/);
assert.ok(!src('services/marketIqExpressClipboard.ts').includes('fetch('),'Text clipboard must remain local');

// User's AutoAvaliar 1346x599 VW Tera screenshot: the source has no
// explicit manufacturer in its title. The initial OCR read the model,
// 2026/2026, KM 2.079, and FIPE but missed brand and plate.
const teraSourceText=[
 'TERA 1.0 MPI FLEX MANUAL =',
 '# 116600359',
 'Origem NACIONAL',
 'Placa UQR5I61',
 'Ano 2026/2026',
 'Cor PRATA',
 'Km 2.079',
 'REFERENCIAS',
 'FIPE R$ 92.652,00',
 'NOTAS DA AVALIACAO 2,8/10'
].join('\n');
const tera=parser.parseAutoAvaliarOcrText(teraSourceText);
assert.equal(tera.brand,'VOLKSWAGEN','Tera should resolve to Volkswagen');
assert.equal(tera.model,'TERA 1.0 MPI FLEX MANUAL','Do not retain trailing OCR equals sign');
assert.equal(tera.plate,'UQR5I61');
assert.equal(tera.yearManufacture,'2026');
assert.equal(tera.yearModel,'2026');
assert.equal(tera.km,2079);
assert.equal(tera.fipeReference,92652);
assert.equal(tera.conditionScore,2.8);
const teraMissingPlate=parser.parseAutoAvaliarOcrText(
 'TERA 1.0 MPI FLEX MANUAL =\nAno 2026/2026\nKm 2.079','',
 'TERA 1.0 MPI FLEX MANUAL =\nAno 2026/2026\nKm 2.079',
 '',
 'REFERENCIAS\nFIPE R$ 92.652,00');
assert.equal(teraMissingPlate.brand,'VOLKSWAGEN');
assert.equal(teraMissingPlate.plate,'');
assert.deepEqual(parser.plateFromLabelledVehicleText('Placa UQR5I61\nAno 2026/2026'),
 {plate:'UQR5I61',corrected:false});
assert.deepEqual(parser.plateFromLabelledVehicleText('® Piaca: UQR5I61'),
 {plate:'UQR5I61',corrected:false});
assert.deepEqual(parser.plateFromLabelledVehicleText('Placa\nUQR5I61\nAno 2026/2026'),
 {plate:'UQR5I61',corrected:false});
assert.equal(parser.plateFromLabelledVehicleText('Renavam 0150033418\nChassi 9BWB...\nAno 2026/2026'),
 null,'No plate label means no automatic plate suggestion');
assert.equal(parser.plateFromLabelledVehicleText('Placa 116600359'),
 null,'An appraisal ID must never be mistaken for a plate');
const teraContextTsv=[
 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
 '5\t1\t1\t1\t1\t1\t540\t100\t100\t24\t94\tOrigem',
 '5\t1\t1\t1\t1\t2\t1550\t100\t120\t24\t92\tNACIONAL',
 '5\t1\t1\t1\t2\t1\t540\t175\t90\t24\t93\tPlaca',
 '5\t1\t2\t1\t2\t1\t1510\t176\t124\t24\t87\tUQR5I61',
 '5\t1\t1\t1\t3\t1\t540\t250\t70\t24\t94\tAno',
 '5\t1\t2\t1\t3\t1\t1490\t251\t130\t24\t93\t2026/2026'
].join('\n');
assert.deepEqual(parser.plateFromLabelledVehicleText('',teraContextTsv),
 {plate:'UQR5I61',corrected:false},
 'A separate high-resolution context OCR pass must associate right-aligned value and label');
assert.deepEqual(parser.plateAnchorFromVehicleTsv(teraContextTsv),
 {top:175,height:24,left:540,width:90},
 'The enlarged Tera card has a crop anchor for the plate row');

const spatialTsv=[
 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
 '5\t1\t1\t1\t1\t1\t20\t100\t40\t15\t90\tAno',
 '5\t1\t2\t1\t1\t1\t600\t100\t90\t15\t90\t2017/2018',
 '5\t1\t1\t1\t2\t1\t20\t135\t35\t15\t92\tKm',
 '5\t1\t2\t1\t2\t1\t600\t135\t70\t15\t91\t95.800'
].join('\n');
assert.deepEqual(parser.spatialOcrRows(spatialTsv),['Ano 2017/2018','Km 95.800']);

const placaTsv=[
 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
 '5\t1\t1\t1\t1\t1\t160\t300\t95\t34\t91\tPlaca',
 '5\t1\t1\t1\t1\t2\t890\t301\t132\t34\t87\tURC6A47',
 '5\t1\t1\t1\t2\t1\t160\t410\t70\t34\t91\tAno'
].join('\n');
assert.deepEqual(parser.plateLabelFromTsv(placaTsv),{top:300,height:34,left:160,width:95},
 'Use the Placa label, not the row number in the screenshot');
assert.equal(parser.plateLabelFromTsv(placaTsv.replace(/\bPlaca\b/g,'Ano')),null,
 'Never assume a fixed position when the plate label is absent');
const fuzzyPlateLabel=placaTsv.replace(/\bPlaca\b/g,'Piaca');
assert.deepEqual(parser.plateLabelFromTsv(fuzzyPlateLabel),{top:300,height:34,left:160,width:95},
 'Small desktop screenshots may confuse the l in Placa with i');
const missingPlateLabel=[
 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
 '5\t1\t1\t1\t1\t1\t160\t240\t95\t34\t90\tOrigem',
 '5\t1\t1\t1\t2\t1\t160\t300\t95\t34\t35\tP@aca',
 '5\t1\t1\t1\t3\t1\t160\t360\t70\t34\t90\tAno'
].join('\n');
assert.equal(parser.plateLabelFromTsv(missingPlateLabel),null);
assert.deepEqual(parser.plateAnchorFromVehicleTsv(missingPlateLabel),{top:300,height:34,left:160,width:95},
 'When Placa is unreadable, use the vehicle-card row between Origem and Ano');
assert.equal(parser.plateAnchorFromVehicleTsv(placaTsv.replace(/\bPlaca\b/g,'Ano')),null,
 'Do not invent a plate row without both neighboring labels');


const plateColumns=[
 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
 '5\t1\t1\t1\t1\t1\t160\t170\t92\t26\t96\tPlaca',
 '5\t1\t2\t1\t1\t1\t860\t171\t148\t26\t90\tURC6A47',
 '5\t1\t1\t1\t2\t1\t160\t220\t50\t26\t95\tAno',
 '5\t1\t2\t1\t2\t1\t840\t221\t125\t26\t91\t2026/2026',
 '5\t1\t1\t1\t3\t1\t160\t265\t28\t26\t95\tKm',
 '5\t1\t2\t1\t3\t1\t870\t266\t110\t26\t90\t18.977',
 '5\t1\t1\t1\t4\t1\t160\t310\t75\t26\t95\tRenavam',
 '5\t1\t2\t1\t4\t1\t850\t310\t169\t26\t91\t01494104455'
].join('\n');
assert.deepEqual(parser.plateFromVehicleTsv(plateColumns.replace(/\bPlaca\b/g,'Piaca')),{plate:'URC6A47',corrected:false},
 'The value can still be read when the plate label is slightly distorted');
assert.deepEqual(parser.plateFromVehicleTsv(plateColumns),{plate:'URC6A47',corrected:false},
 'Find Toro plate horizontally aligned to Placa even if text-reading order differs');
const toroTsvOnly=parser.parseAutoAvaliarOcrText('TORO 1.3 TURBO 270 FLEX VOLCANO AT6','',
 'TORO 1.3 TURBO 270 FLEX VOLCANO AT6',plateColumns,
 'REFERENCIAS\nFIPE\nR$ 156.118,00');
assert.equal(toroTsvOnly.plate,'URC6A47');
assert.equal(toroTsvOnly.km,18977);
assert.equal(toroTsvOnly.yearModel,'2026');
assert.equal(toroTsvOnly.fipeReference,156118);
const noisyMercosul=plateColumns.replace('URC6A47','URCGA4T');
assert.equal(parser.plateFromVehicleTsv(noisyMercosul),null,
 'Do not hallucinate a plate when numeric slots cannot be recovered safely');
const shiftedPlate=plateColumns.replace('URC6A47','SVPGAG3');
assert.deepEqual(parser.plateFromVehicleTsv(shiftedPlate),{plate:'SVP0A03',corrected:true},
 'OCR can confuse G with zero only in numeric positions');
const otherRow=plateColumns.replace('URC6A47','').replace('01494104455','URC6A47');
assert.equal(parser.plateFromVehicleTsv(otherRow),null,
 'Never use chassis/Renavam row as plate');
const splitPlate=plateColumns.replace('5\t1\t2\t1\t1\t1\t860\t171\t148\t26\t90\tURC6A47',
 '5\t1\t2\t1\t1\t1\t860\t171\t64\t26\t90\tURC\n5\t1\t2\t1\t1\t2\t933\t171\t82\t26\t90\t6A47');
assert.deepEqual(parser.plateFromVehicleTsv(splitPlate),{plate:'URC6A47',corrected:false},
 'Join OCR tokens on the same plate row before validation');
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
// Regression based on the supplied 1129x537 AutoAvaliar HB20S screenshot.
// Model header wraps "AUTOMATICO" to a second line, and 7,1/10 is inside
// the separate colored sidebar. The plate/year/KM/FIPE are already legible.
const hb20s=parser.parseAutoAvaliarOcrText(
 'FOTOS FOTOS LISTA\nHB20S 1.6 COMFORT PLUS 16V FLEX 4P\nAUTOMATICO\nNOTAS DA AVALIACAO',
 '',
 'HB20S 1.6 COMFORT PLUS 16V FLEX 4P\nAUTOMATICO\nPlaca PXN3664\nAno 2016/2016\nKm 154.027',
 '',
 'REFERENCIAS\nFIPE\nValor R$ 60.921,00',
 '',
 '',
 'NOTAS DA AVALIACAO\n7,1/10'
);
assert.equal(hb20s.brand,'HYUNDAI');
assert.equal(hb20s.model,'HB20S 1.6 COMFORT PLUS 16V FLEX 4P AUTOMATICO');
assert.equal(hb20s.plate,'PXN3664');
assert.equal(hb20s.yearManufacture,'2016');
assert.equal(hb20s.yearModel,'2016');
assert.equal(hb20s.km,154027);
assert.equal(hb20s.fipeReference,60921);
assert.equal(hb20s.conditionScore,7.1);
const hb20x=parser.parseAutoAvaliarOcrText('HB20X 1.6 PREMIUM FLEX AUTOMATICO\nAno 2018/2019\nKm 35.000');
assert.equal(hb20x.brand,'HYUNDAI');
assert.ok(hb20x.model.startsWith('HB20X'));
const hb20NoScore=parser.parseAutoAvaliarOcrText('HB20S 1.6 COMFORT PLUS\nAno 2016/2016');
assert.equal(hb20NoScore.conditionScore,null,'Never invent a score when the rating region cannot be read');
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
// Capturing Motyq itself instead of the AutoAvaliar source can recover the
// vehicle model from a prior input but misread the plate/years. Reject it.
const guard=await import('data:text/javascript;base64,'+
 Buffer.from(transpile('services/marketIqExpressScreenshotGuard.ts')).toString('base64'));
assert.equal(guard.isMotyqInterfaceScreenshot(
 'Nova precificação\nPrévia por print\nBuscar por voz M.O.T.Y.Q.\nModelo ARGO 1.0 FIREFLY FLEX DRIVE MANUAL'),true,
 'A screenshot of Motyq own valuation form must be rejected');
assert.equal(guard.isMotyqInterfaceScreenshot(
 'MOTYQ IQ EXPRESS LABORATORIO\n1. Colar avaliação\nClique aqui e pressione Ctrl+V'),true,
 'A screenshot of the IQ Express modal itself must be rejected');
assert.equal(guard.isMotyqInterfaceScreenshot(
 'AUTOAVALIAR\nARGO 1.0 FIREFLY FLEX DRIVE MANUAL\nPlaca ABC1D23\nAno 2020/2020\nKM 62.694'),false,
 'A genuine AutoAvaliar vehicle card must remain accepted');
assert.equal(guard.isMotyqInterfaceScreenshot(
 'AutoAvaliar\nObservação: cliente mencionou Motyq'),false,
 'One isolated mention of Motyq should not reject a legitimate capture');
assert.equal(guard.isMotyqInterfaceScreenshot(
 'Fotos Fotos Lista\nQ3 2.0 40 TFSI GASOLINA SPORTBACK\nPlaca ABC1D23\nAno 2022/2023\nKm 62.500'),false);
const browserOcr=src('services/marketIqExpressBrowserOcr.ts');
assert.ok(browserOcr.includes('plateFromLabelledVehicleText(contextText,contextTsv)'),
 'Read a labelled plate from the enlarged context before manual entry');
assert.ok(browserOcr.includes('plateContextValueAt(contextAnchor)'),
 'When context has a plate anchor, crop the value at the correct row');
assert.ok(browserOcr.includes("if(!plateImage)return extracted"),
 'Do not read arbitrary full panel areas as a single plate line');
transpile('services/marketIqExpressBrowserOcr.ts');
assert.ok(browserOcr.includes('tesseract.js@7.0.0/dist/tesseract.min.js'));
assert.ok(browserOcr.includes("createWorker(['por','eng']"));
assert.ok(browserOcr.includes("recognize(image,{}, {tsv:true})"),'Collect word coordinates from OCR to reconstruct right-aligned values');
assert.ok(browserOcr.includes('screenshotRegions(file)'),'Full AutoAvaliar screenshots need magnified vehicle crop');
assert.ok(browserOcr.includes('isMotyqInterfaceScreenshot(output.data.text)'),'Reject self-screenshot immediately after initial OCR');

assert.ok(browserOcr.includes('regions=await screenshotRegions(file);'),'Region analysis must not depend on unreliable header OCR');
assert.ok(!browserOcr.includes('if(isAutoAvaliar)'),'Regional OCR must run even when tiny AutoAvaliar menu labels are missed');
assert.ok(browserOcr.includes('onPlateZoom?.(plateAnchor?regions.plateAt(plateAnchor):null)'),'Only show a labeled, verified plate-row crop; never display an arbitrary UI button as the plate');
assert.ok(browserOcr.includes('let configured=false;')&&browserOcr.includes('const plateResult=await worker.recognize(plateImage);'),'Run adaptive plate OCR even if setParameters fails');

assert.ok(browserOcr.includes('detailRect={x:0.49,y:0.005,w:0.28,h:0.745}'),'Include left label and right plate in detail OCR for menu/crop variants');
assert.ok(browserOcr.includes('reference:crop(0.775,0.59,0.21,0.41)'),'FIPE crop must reach the bottom of short AutoAvaliar screenshots');
assert.ok(browserOcr.includes('rating:crop(0.765,0.18,0.23,0.49)'),'Scan separate condition-score card if first pass misses it');
assert.ok(browserOcr.includes('if(extracted.conditionScore===null&&regions)'),'No extra rating OCR call when already read');
assert.ok(browserOcr.includes('ratingText'),'Pass sidebar OCR text to parser');

assert.ok(browserOcr.includes('plateContext:crop(0.50,0.06,0.27,0.22,6)'),'When label unreadable, show vehicle table not unrelated year row');
assert.ok(browserOcr.includes('plateAt:(anchor)=>')&&browserOcr.includes('const center=height*detailRect.y+(anchor.top+anchor.height/2)/detailScale;'),'Crop plate using detected text row rather than fixed screenshot coordinates');
assert.ok(browserOcr.includes('plateValueAt:(anchor)=>')&&browserOcr.includes('regions.plateValueAt(label)'), 'Target plate value only to avoid Placa label contamination');
assert.ok(browserOcr.includes("if(!extracted.plate&&regions)"),'Avoid slow plate OCR when first pass succeeds');
assert.ok(browserOcr.includes("tessedit_pageseg_mode:'7'"),'Single-line Tesseract mode for 7-char plate');
assert.ok(browserOcr.includes("tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'"),'Plate OCR should avoid symbols');
assert.ok(browserOcr.includes('plateAnchorFromVehicleTsv(detailTsv)'),'Try geometric plate row recovery');
assert.ok(browserOcr.includes('enhancePlateContrast(plateImage)'),'Retry unreadable plate locally at higher contrast');
assert.ok(browserOcr.includes("tessedit_pageseg_mode:'8'"),'Try single-word plate OCR only when standard reading fails');
assert.ok(browserOcr.includes('normalizePlateFromIsolatedCrop(isolatedPlateText)'),'Never use unvalidated text as a vehicle plate');


assert.ok(browserOcr.includes('detailText,detailTsv,referenceText,referenceTsv'),'Regional OCR must be passed to parser');

assert.ok(!browserOcr.includes('fetch('),'Local print engine must not upload images');
assert.ok(!browserOcr.includes('localStorage')&&!browserOcr.includes('indexedDB'),'OCR must not store screenshots in app storage');

const backend=src('server/motyqIqExpressPrint.ts');
const ui=src('components/MarketIqExpressPrintPanel.tsx');
assert.ok(ui.includes('readExpressPrintLocally(file,setReadStatus,setPlateZoom)'),'Show the isolated plate only in local UI');
assert.ok(ui.includes('if(isMotyqInterfaceScreenshot(raw))'),'Reject copied Motyq text before parsing');
assert.ok(ui.includes('placeholder="Digite a placa se não foi lida"'),'Do not display fictitious ABC1D23 as an actual plate');
assert.ok(ui.includes('Placa não reconhecida. Confira no AutoAvaliar.'),'Warn when no real plate was extracted');
assert.ok(ui.includes('Ano/modelo ou KM não reconhecidos.'),'Warn when the crop is incomplete');

assert.ok(ui.includes('history={history} loading={historyLoading} incomplete={historyIncomplete}'),'Same-screen preview includes paid history');
assert.ok(ui.includes('src={plateZoom}')&&ui.includes('Placa ampliada diretamente do seu print'),'Allow quick visual correction when OCR fails');
assert.ok(ui.includes("setMethod('local')"),'OCR local should be the normal workflow');
assert.ok(!ui.includes("fetch('/api/analyze-deal?action=iq-express-print'"),'No paid image API call by default');
assert.ok(!ui.includes('getIdToken()'),'No authentication token needed for local OCR');
assert.ok(ui.includes("if(image){event.preventDefault();void read(image);return;}"),'Image Ctrl+V works alongside copied page text');

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
assert.ok(ui.includes("getData('text/plain')"),'Paste text in the browser without OCR');
assert.ok(ui.indexOf('if(isVehicleText)')<ui.indexOf("find(x=>x.type.startsWith('image/'))"),'Prefer native copied text when clipboard has text and image');
assert.ok(ui.includes("lastInput==='image'")&&ui.includes("lastInput==='text'"),'Show whether AutoAvaliar supplied an image or text');

assert.ok(ui.includes("target.closest('input,textarea,select"),'Do not hijack paste in editing fields');
assert.ok(ui.includes("parseAutoAvaliarClipboardText(raw)"),'Read plain-text vehicle data locally');
assert.ok(ui.includes('Clique aqui e pressione Ctrl+V'));
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
assert.ok(ui.includes('Clique aqui e pressione Ctrl+V'),'Enable screenshot and text clipboard testing');

console.log('Motyq IQ Express: Prisma Showroom + Fleet D conflict, editable strategy, image privacy, authenticated Gemini extraction, copy/paste and Mesa handoff passed.');
