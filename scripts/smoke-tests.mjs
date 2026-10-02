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
