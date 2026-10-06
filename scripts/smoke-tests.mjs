import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const fail=(message)=>{throw new Error(message);};

const types=read('types.ts');
const names=[...types.matchAll(/export\s+(?:type|interface)\s+([A-Za-z0-9_]+)/g)].map(match=>match[1]);
const duplicates=[...new Set(names.filter((name,index)=>names.indexOf(name)!==index))];
if(duplicates.length)fail('Duplicate exported domain types: '+duplicates.join(', '));

const roadmap=read('services/dmsRoadmap.ts');
const ids=[...roadmap.matchAll(/\{id:'(F\d+\.\d+)'/g)].map(match=>match[1]);
if(!ids.length)fail('DMS roadmap has no checklist items.');
const duplicateIds=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
if(duplicateIds.length)fail('Duplicate roadmap ids: '+duplicateIds.join(', '));

const currentStock=read('services/currentStockService.ts');
if(!currentStock.includes("currentRecord===true"))fail('Current stock no longer filters canonical records.');
if(currentStock.includes('operational_current_stock'))fail('Legacy parallel current-stock collection returned.');

const migrationSource=read('services/dmsMigrationService.ts');
if(!migrationSource.includes('duplicateDocumentsArchived')||!migrationSource.includes("vehicle_document_case_archived"))fail('Safe migration no longer archives duplicate document dossiers.');

const vehicleMaster=read('services/dmsVehicleService.ts');
if(!vehicleMaster.includes('claimVehicleId(input.companyId,input.storeId,plate,preferredVehicleId)'))fail('Purchase flow no longer claims plate-index identity.');

const purchase=read('services/vehiclePurchaseService.ts');
for(const required of ['createFromEvaluation','approve:async','enterStock:async']){
  if(!purchase.includes(required))fail('Vehicle purchase critical step missing: '+required);
}

const sales=read('services/salesOrderService.ts');
for(const required of ['createFromAcceptedProposal','approve:async','invoice:async','deliver:async','cancel:async']){
  if(!sales.includes(required))fail('Sales order critical step missing: '+required);
}

const prep=read('services/prepFinanceService.ts');
for(const required of ['registerApproval','markPaid']){
  if(!prep.includes(required))fail('Preparation finance critical step missing: '+required);
}

const proposals=read('services/crmProposalService.ts');
for(const required of ['acceptDigitally','expireLeadReservations','reservationExpiresAt']){
  if(!proposals.includes(required))fail('CRM proposal critical step missing: '+required);
}

const attachments=read('services/dmsAttachmentService.ts');
for(const required of ['upload:async','list:async','remove:async']){
  if(!attachments.includes(required))fail('DMS attachment critical step missing: '+required);
}

const integrity=read('services/dmsIntegrityService.ts');
if(!integrity.includes('runAndStore:async'))fail('Automatic integrity report persistence missing.');

const migrations=read('services/dmsMigrationRegistry.ts');
if(!migrations.includes('runPending:async'))fail('Versioned migration runner missing.');

const rules=read('firestore.rules');
const openBraces=(rules.match(/\{/g)||[]).length;
const closeBraces=(rules.match(/\}/g)||[]).length;
if(openBraces!==closeBraces)fail(`Firestore rules braces unbalanced: ${openBraces} open / ${closeBraces} close.`);
if(!rules.includes("match /operational_meta/{itemId}"))fail('operational_meta rule missing.');
if(!rules.includes("allow update: if opKind(resource.data) != 'audit_event' && ("))fail('Audit events are not protected against update.');
const dealsStart=rules.indexOf("match /deals/{dealId}");
const dealsEnd=rules.indexOf("match /evaluation_requests/{requestId}",dealsStart);
const dealsBlock=dealsStart>=0&&dealsEnd>dealsStart?rules.slice(dealsStart,dealsEnd):'';
if(!dealsBlock)fail('Deals rules block missing.');
if(dealsBlock.includes("opKind(resource.data) != 'audit_event'"))fail('Audit guard leaked into deals rule.');

const appShell=read('App.tsx');
if(!appShell.includes('currentStockService.getCurrent(companyIdForUser(user),storeIdForUser(user))'))fail('Negotiation stock autofill guard missing.');

const voiceUi=read('components/MotyqVoiceAssistant.tsx');
for(const required of ['extractCustomerNameFromSpeech','Encontrei o nome ${inferredName} na sua fala','Tentei falar com William']){if(!voiceUi.includes(required)&&required!=='Tentei falar com William')fail('Speech customer-name fallback guard missing: '+required);}
for(const required of ['r.continuous=true','r.interimResults=true','toggleListening','Toque para falar · toque novamente para enviar']){if(!voiceUi.includes(required))fail('Tap-to-talk Voice guard missing: '+required);}
const voiceApi=read('api/motyq-voice.ts');
for(const required of ['GEMINI_INTENT_MODEL','gemini-2.5-flash','provider:\'gemini\'','responseMimeType:\'application/json\'']){if(!voiceApi.includes(required))fail('Gemini intent-engine guard missing: '+required);}
for(const required of ['GEMINI_API_KEY','gemini-3.8-flash-tts','responseModalities','pt-BR','action===\'tts\'']){if(!voiceApi.includes(required))fail('Gemini neural TTS guard missing: '+required);}
for(const required of ['/api/motyq-voice','speakResponse']){if(!voiceUi.includes(required))fail('Neural voice playback guard missing: '+required);}
for(const required of ['lastCustomerName','crm_contact_note_followup','Tentativa de contato sem sucesso']){if(!voiceUi.includes(required))fail('Voice short-memory guard missing: '+required);}
for(const required of ['voiceOptions','selectedVoiceName','voiceschanged','TESTAR ESTA VOZ','motyq.voice.name']){if(!voiceUi.includes(required))fail('Voice selector guard missing: '+required);}
for(const required of ['chooseNaturalPtBrVoice','francisca','luciana','u.rate=.96','u.pitch=1.04']){if(!voiceUi.includes(required))fail('Natural female pt-BR voice guard missing: '+required);}
for(const required of ["case'stock_count'","Modelos:","Encontrei ${matches.length} opção"]){if(!voiceUi.includes(required))fail('Voice model result guard missing: '+required);}
for(const required of ['isSimilarName','levenshtein','stock_search','SUV_TERMS','listStorePassages']){if(!voiceUi.includes(required)&&!read('services/showroomFlowService.ts').includes(required))fail('Voice fuzzy CRM guard missing: '+required);}
for(const required of ['InfinityIcon','Ouvindo...','Entendendo...','Respondendo...','Toque para falar · toque novamente para enviar','Encerrar','backdrop-blur-xl']){if(!voiceUi.includes(required))fail('Immersive Voice UI guard missing: '+required);}
for(const required of ['crm_contact_note_followup','contextCustomerName','tentei falar']){if(!voiceApi.includes(required))fail('Conversational Voice context guard missing: '+required);}
for(const required of ['stock_count','quantos Creta','Vou contar esse modelo no estoque']){if(!voiceApi.includes(required))fail('Voice model-count guard missing: '+required);}
for(const required of ['stock_search','category','maxPrice','maxKm','transmission','suv']){if(!voiceApi.includes(required))fail('Voice stock-profile intent guard missing: '+required);}
for(const required of ['consultar estoque','me mostra o estoque','quantos carros','stock_summary','stock_find_vehicle']){if(!voiceApi.includes(required))fail('Voice basic-language guard missing: '+required);}
for(const required of ['Motyq Voice','SpeechRecognition','crm_create_lead','crm_add_note','crm_schedule_followup','stock_oldest','stock_summary']){if(!voiceUi.includes(required)&&!voiceApi.includes(required))fail('Motyq Voice guard missing: '+required);}
for(const forbidden of ["intent:'finance_settle'","intent:'sale_close'","intent:'delete'"]){if(voiceApi.includes(forbidden))fail('Unsafe Motyq Voice intent exposed: '+forbidden);}
if(!voiceApi.includes('verifyFirebaseToken')||!voiceApi.includes("model=gatewayKey?'openai/gpt-6-luna':'gpt-6-luna'"))fail('Motyq Voice authenticated AI parser guard missing.');

const demoSeed=read('services/demoSeedService.ts');
for(const required of ['seedFormalDms','seedFinance','seedDocuments','seedMarketIq','seedAfterSales','PV-DEMO-0997','demo_fin_bank','vehicle_document_case','marketiq_evaluation','after_sales_case']){if(!demoSeed.includes(required))fail('Demo showcase guard missing: '+required);}

const appSource=read('App.tsx');
if(!appSource.includes('Negociação arquivada com histórico preservado.'))fail('Negotiation archival UX guard missing.');

const dealGuard=read('services/dealTenantService.ts');
for(const required of ["Informe uma placa válida antes de salvar a negociação.","O total das formas de pagamento deve conferir com o valor da venda.","cleanupKnownQaRecords","kind:'deal_archived'","archiveReason","qaCleanup:true"]){
  if(!dealGuard.includes(required))fail('Negotiation data guard missing: '+required);
}

const financeGuard=read('services/financeService.ts');
for(const required of ['withoutUndefined','Informe o primeiro vencimento do lançamento.','Selecione o Plano de Contas do lançamento.','Selecione o Centro de Custo do lançamento.']){
  if(!financeGuard.includes(required))fail('Finance persistence guard missing: '+required);
}

const marketIqBridge=read('components/MarketIQLookupBridge.tsx');
if(marketIqBridge.includes('VALIDAR CRLV-E')||marketIqBridge.includes('ENVIAR CRLV-E'))fail('CRLV fallback UX guard missing: mandatory upload UI returned.');
if(!marketIqBridge.includes('Selecione fabricante, modelo e ano/modelo para continuar.'))fail('MarketIQ manual catalog fallback message missing.');

const marketIq=read('components/MarketIQ.tsx');
for(const required of ["action=brands","action=models","action=years","action=detail","Fabricante","Selecione o fabricante","Escolha primeiro o fabricante","Escolha primeiro o modelo"]){if(!marketIq.includes(required))fail('MarketIQ catalog guard missing: '+required);}
if(!marketIq.includes('plate,vehicle,year,km,fipe,notes,value:calc.recommendedBuy'))fail('MarketIQ approval no longer sends complete evaluation context.');
const marketIqPersistenceBridge=read('components/MarketIQPersistenceBridge.tsx');
if(!marketIqPersistenceBridge.includes('Complete veículo, ano/modelo, KM e FIPE antes de concluir a avaliação.'))fail('MarketIQ incomplete-decision guard missing.');

const prepTrackPanel=read('components/PrepTrackPanel.tsx');
if(!prepTrackPanel.includes('Carregando ordens...')||!prepTrackPanel.includes("loading?'—'"))fail('PrepTrack loading-state guard missing.');
const multiStorePanel=read('components/MultiStorePanel.tsx');
if(!multiStorePanel.includes('Carregando unidades...'))fail('Units loading-state guard missing.');
if(!prepTrackPanel.includes('stockByVehicleId'))fail('PrepTrack no longer resolves canonical stock by vehicleId.');

const dashboard=read('components/ExecutiveDashboard.tsx');
if(!dashboard.includes('salesOrderService.subscribe'))fail('Dashboard is no longer driven by formal DMS sales orders.');

const integrityServiceSource=read('services/dmsIntegrityService.ts');
for(const required of ['duplicate-document-','invalid-closed-deal-','manual-finance-structure-','fipe-mismatch-']){if(!integrityServiceSource.includes(required))fail('Expanded DMS integrity guard missing: '+required);}

const importService=read('services/dmsExternalImportService.ts');
for(const required of ['duplicateCount','uniqueByPlate','a última ocorrência de cada placa será usada']){if(!importService.includes(required))fail('Stock import duplicate guard missing: '+required);}

const readinessApi=read('api/integrations.ts');
for(const required of ['ASAAS_API_KEY','ASAAS_WEBHOOK_TOKEN','FOCUS_NFE_TOKEN ou FOCUS_NFE_TOKENS_JSON','GitHub Environment']){if(!readinessApi.includes(required))fail('Readiness blocker detail guard missing: '+required);}

const afterSalesPanel=read('components/AfterSalesPanel.tsx');
for(const required of ['Nenhuma venda DMS elegível','Pedidos de Venda DMS faturados ou entregues','busy||!sales.length']){if(!afterSalesPanel.includes(required))fail('After-sales eligibility UX guard missing: '+required);}

const permissionEditor=read('components/DmsPermissionEditor.tsx');
const permissionSource=read('services/dmsPermissions.ts');
for(const required of ['stockWrite','prepApprove','financeCreate','financeSettle','documentsView','afterSalesView','reportsView']){if(!permissionEditor.includes(required)&&!permissionSource.includes(required))fail('Granular permission editor guard missing: '+required);}

const financeAccountSource=read('services/financeAccountService.ts');
if(!financeAccountSource.includes('cleanupKnownQaAccounts')||!financeAccountSource.includes('QA TEMPORÁRIA - REMOVER')||!financeAccountSource.includes('CAIXA TESTE MOTYQ CHECKLIST — TEMPORÁRIO'))fail('QA finance cleanup guard missing.');

const autoHealth=read('components/DmsIntegrityAutoRunner.tsx');
for(const required of ['TST0Z01','currentStockService.markOut','prepTrackService.deleteOrder']){if(!autoHealth.includes(required))fail('Synthetic QA vehicle cleanup guard missing: '+required);}
if(!autoHealth.includes('cleanupKnownQaRecords'))fail('Automatic DMS health no longer cleans known QA deals before diagnosis.');

for(const filePath of ['components/SmartAlerts.tsx','components/ExecutiveInsights.tsx','components/AssetGuardPanel.tsx']){const source=read(filePath);if(source.includes('DealMaster'))fail('Legacy DealMaster label guard missing in '+filePath);}

const aiManager=read('components/AIManagerV2.tsx');
if(!aiManager.includes('Dados pendentes'))fail('AI Manager data-pending guard missing.');

const rulesText=read('firestore.rules');
for(const required of ['function sameCompany(data)','function sameStore(data)','match /deals/{dealId}','match /operational_stock/{itemId}','match /prep_orders/{itemId}','match /showroom_passages/{passageId}','match /operational_meta/{itemId}','sameStore(request.resource.data)','sameStore(resource.data)']){if(!rulesText.includes(required))fail('Tenant isolation guard missing: '+required);}
if(!rulesText.includes("['vehicle_master','vehicle_plate_index','stock_movement']"))fail('Stock write rules no longer authorize vehicle plate index.');

const stockSource=read('services/currentStockService.ts');
for(const required of ['diffDays(entryDate,today)','snapshotDate:today','stockDays,','updateFipe:async']){
  if(!stockSource.includes(required))fail('Canonical stock consistency guard missing: '+required);
}

const fipeApi=read('api/marketiq-fipe.ts');
if(!fipeApi.includes('year>=1900&&year<=maxYear'))fail('Manual stock catalog can accept invalid FIPE year options.');

const marketIqLookup=read('components/MarketIQLookupBridge.tsx');
if(!marketIqLookup.includes('currentStockService.updateFipe'))fail('Resolved FIPE no longer synchronizes into canonical stock.');

const docsPanel=read('components/VehicleDocumentsPanel.tsx');
if(!docsPanel.includes('const unique=new Map<string,VehicleMaster>()'))fail('Vehicle documents list no longer deduplicates canonical vehicles.');

const firebaseConfig=JSON.parse(read('firebase.json'));
if(!firebaseConfig.firestore?.[0]?.rules||!firebaseConfig.firestore?.[0]?.indexes)fail('Firebase rules/index deploy config missing.');
const indexes=JSON.parse(read('firestore.indexes.json'));
if(!Array.isArray(indexes.indexes)||!indexes.indexes.length)fail('Versioned Firestore indexes missing.');

const integrations=read('api/integrations.ts');
for(const required of ["domain==='fiscal'","FOCUS_NFE_TOKEN","FOCUS_NFE_TOKENS_JSON","/v2/nfe?ref=","action==='status'"]){
  if(!integrations.includes(required))fail('Consolidated billing/fiscal integration missing: '+required);
}
if(integrations.includes('process.env.FOCUS_NFE_TOKEN')===false)fail('Fiscal token is not server-side.');
const fiscalClient=read('services/fiscalIntegrationService.ts');
if(fiscalClient.includes('FOCUS_NFE_TOKEN'))fail('Fiscal credential leaked to browser client.');
if(!fiscalClient.includes("fetch('/api/integrations'"))fail('Fiscal client is not using consolidated integrations API.');
const fiscalPanel=read('components/FiscalInvoicePanel.tsx');
if(fiscalPanel.includes('companyService.getAll'))fail('Fiscal panel must not read cross-tenant company config.');
const salesService=read('services/salesOrderService.ts');
if(salesService.includes('companyService.getAll'))fail('Sales invoicing must not read cross-tenant company config.');
if(!salesService.includes("fiscalStatus!=='authorized'"))fail('Integrated fiscal authorization guard missing before invoicing.');

const apiTree=fs.readdirSync(new URL('../api',import.meta.url)).filter(name=>/\.ts$/.test(name));
if(apiTree.length>12)fail('Too many Vercel API functions: '+apiTree.length+'. Consolidate routes before deploying.');

console.log('MOTYQ smoke tests passed:',ids.length,'roadmap checks and core DMS guards.');

const marketScanBridge=read('components/MarketIQMarketScanBridge.tsx');
for(const required of ['fieldValue','input, select, textarea','fieldValue(\'Modelo / versão\')','fieldValue(\'Ano/modelo\')']){if(!marketScanBridge.includes(required))fail('MarketScan select-value guard missing: '+required);}

const evaluationQueueService=read('services/evaluationQueueService.ts');
for(const required of ["'inspection'","'awaiting_pricing'","'pricing'","completeInspection","startPricing"]){if(!evaluationQueueService.includes(required))fail('Three-stage evaluation flow guard missing: '+required);}
const pricingDesk=read('components/PricingDesk.tsx');
for(const required of ['Mesa de Precificação','ETAPA 3 DE 3','awaiting_pricing','startPricing']){if(!pricingDesk.includes(required))fail('Pricing desk guard missing: '+required);}
const evaluatorWorkspace=read('components/EvaluatorWorkspace.tsx');
for(const required of ['ENVIAR PARA MESA DE PRECIFICAÇÃO','completeInspection','inspection']){if(!evaluatorWorkspace.includes(required))fail('Evaluator handoff guard missing: '+required);}
const evaluationCenter=read('components/EvaluationCenter.tsx');
for(const required of ['AGUARDANDO PREÇO','EM PRECIFICAÇÃO','ENVIAR PARA MESA']){if(!evaluationCenter.includes(required))fail('Evaluation center stage guard missing: '+required);}
const roleAwareRoot=read('components/RoleAwareRoot.tsx');
if(!roleAwareRoot.includes('<PricingDesk user={user}/>'))fail('Pricing desk is not mounted for manager/admin.');
const marketIqShell=read('components/MarketIQShell.tsx');
if(!marketIqShell.includes('{!evaluator&&<><MarketIQMarketScanBridge'))fail('Evaluator still has MarketScan mounted.');

const visualAi=read('components/MarketIQVisualAI.tsx');
for(const required of ['ANÁLISE IA','visual_analysis','SCORE VISUAL','PREPARAÇÃO VISUAL','IMPACTO SUGERIDO','safetyNote']){if(!visualAi.includes(required))fail('Visual AI pricing guard missing: '+required);}
const marketScanApi=read('api/marketiq-market-scan.ts');
for(const required of ["action === 'visual_analysis'","GEMINI_VISION_MODEL","responseMimeType: 'application/json'","não substitui inspeção presencial"]){if(!marketScanApi.includes(required))fail('Visual AI backend guard missing: '+required);}
if(!marketIqShell.includes('<MarketIQVisualAI currentUser={user} companyId={companyId} storeId={storeId}/>'))fail('Visual AI not mounted in MarketIQ pricing workflow.');
if(!marketIqShell.includes('{!evaluator&&<>'))fail('Visual AI pricing-only guard missing.');

const motyqShell=read('components/MotyqShell.tsx');
for(const required of ["launcher('Solicitar avaliação')",'<span>Avaliações</span>',"title==='Solicitar avaliação'"]){if(!motyqShell.includes(required))fail('Seller evaluation sidebar guard missing: '+required);}
