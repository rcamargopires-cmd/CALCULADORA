import assert from 'node:assert/strict';
import {
  canApproveOwn,proposalExpired,canCancelSale,canReverseFinance,
  stockStatusForProposalEvent,proposalStatusTransitionAllowed,
  purchaseStatusTransitionAllowed,saleStatusTransitionAllowed,
} from '../services/dmsFlowPolicy.mjs';

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('maker-checker blocks self approval for normal user',()=>{
  assert.equal(canApproveOwn({createdBy:'gestor@loja.com',actorEmail:'gestor@loja.com',actorRole:'manager'}),false);
  assert.equal(canApproveOwn({createdBy:'a@loja.com',actorEmail:'b@loja.com',actorRole:'manager'}),true);
  assert.equal(canApproveOwn({createdBy:'admin@loja.com',actorEmail:'admin@loja.com',actorRole:'admin'}),true);
});

test('proposal validity expires deterministically',()=>{
  const now=Date.parse('2026-10-02T15:00:00Z');
  assert.equal(proposalExpired('2026-10-02T14:59:59Z',now),true);
  assert.equal(proposalExpired('2026-10-02T15:00:01Z',now),false);
  assert.equal(proposalExpired('',now),false);
});

test('proposal reservation state is reversible',()=>{
  assert.equal(stockStatusForProposalEvent('sent'),'Reservado');
  assert.equal(stockStatusForProposalEvent('expired'),'Disponível');
  assert.equal(stockStatusForProposalEvent('rejected'),'Disponível');
  assert.equal(proposalStatusTransitionAllowed('draft','sent'),true);
  assert.equal(proposalStatusTransitionAllowed('sent','accepted'),true);
  assert.equal(proposalStatusTransitionAllowed('accepted','sent'),false);
});

test('delivered sale cannot be simply cancelled',()=>{
  assert.equal(canCancelSale('draft'),true);
  assert.equal(canCancelSale('invoiced'),true);
  assert.equal(canCancelSale('delivered'),false);
  assert.equal(saleStatusTransitionAllowed('invoiced','delivered'),true);
  assert.equal(saleStatusTransitionAllowed('delivered','cancelled'),false);
});

test('financial reversal only applies to settled entries',()=>{
  assert.equal(canReverseFinance('paid'),true);
  assert.equal(canReverseFinance('received'),true);
  assert.equal(canReverseFinance('pending'),false);
  assert.equal(canReverseFinance('cancelled'),false);
});

test('purchase flow cannot jump directly from draft to stocked',()=>{
  assert.equal(purchaseStatusTransitionAllowed('draft','approved'),true);
  assert.equal(purchaseStatusTransitionAllowed('ready_for_stock','stocked'),true);
  assert.equal(purchaseStatusTransitionAllowed('draft','stocked'),false);
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();passed+=1;console.log('✓',name);}
  catch(error){console.error('✗',name);throw error;}
}
console.log(`MOTYQ critical-flow tests passed: ${passed}/${tests.length}`);
