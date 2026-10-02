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

console.log('MOTYQ smoke tests passed:',ids.length,'roadmap checks and core DMS guards.');
