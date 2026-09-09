import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const output=join(await mkdtemp(join(tmpdir(),'genz-finance-')),'brokerage.mjs');
await build({entryPoints:['lib/brokerage.ts'],outfile:output,bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {agreement,calculateBrokerage:calc,summarizeSettlement:summary}=await import(pathToFileURL(output));
const terms={method:'fixed',fixedAmount:100000,percentage:2,ownerNet:4200000,listingShare:60,protectionDays:30,feePayer:'Owner',dueDate:'2026-10-01',terms:'Test'};
test('fixed, percentage and above-net formulas preserve paise and split totals',()=>{
 assert.equal(calc(terms,4400000).pool,100000);assert.equal(calc(terms,4300000).pool,100000);
 assert.equal(calc({...terms,method:'percentage'},4300000).pool,86000);
 assert.equal(calc({...terms,method:'above_net'},4300000).pool,100000);
 assert.equal(calc({...terms,method:'above_net'},4100000).belowNet,true);
 assert.equal(calc({...terms,method:'percentage',percentage:1.25},12345.67).pool,154.32);
 for(const amount of [0,.01,1.01,99.99,100000.55])for(const split of [0,33.33,50,60,100]){const c=calc({...terms,fixedAmount:amount,listingShare:split},1);assert.equal(Math.round((c.listing+c.buyer)*100),Math.round(amount*100));}
 assert.equal(agreement({pool:75000,listingShare:40}).method,'fixed');assert.equal(calc(agreement({pool:75000,listingShare:40}),3000000).pool,75000);
});
test('transfers are not extra revenue; linked refunds and legacy holds are explicit',()=>{
 const deal={id:'d',owner_id:'buyer',partner_id:'listing',status:'closed',data:{agreement:terms,asking:4500000,finalPrice:4300000}};
 const payment=(id,purpose,amount,extra={})=>({id,status:'verified',data:{dealId:'d',purpose,amount,...extra}});
 const receipts=[payment('r','Brokerage',100000,{beneficiaryId:'listing'}),payment('t','Co-broker settlement',40000,{fromBrokerId:'listing',toBrokerId:'buyer'}),payment('sale','Sale consideration',4300000)];
 let x=summary(deal,receipts);assert.equal(x.collected,100000);assert.equal(x.balances.listing.received,60000);assert.equal(x.balances.buyer.received,40000);assert.equal(x.balances.buyer.outstanding,0);
 x=summary(deal,[...receipts,payment('refund','Refund',10000,{originalPaymentId:'r'})]);assert.equal(x.collected,90000);assert.equal(x.balances.listing.outstanding,10000);
 x=summary(deal,[...receipts,payment('undo-transfer','Refund',10000,{originalPaymentId:'t'})]);assert.equal(x.collected,100000);assert.equal(x.balances.listing.overpaid,10000);assert.equal(x.balances.buyer.outstanding,10000);
 x=summary(deal,[payment('legacy','Brokerage',5000)]);assert.equal(x.unallocated,1);assert.equal(x.final,false);
 x=summary({...deal,data:{...deal.data,pendingAmendment:{id:'a'}}},receipts);assert.equal(x.final,false);assert.equal(x.holds.length,1);
});
