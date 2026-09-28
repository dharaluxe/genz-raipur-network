import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const output=join(await mkdtemp(join(tmpdir(),'genz-commission-')),'commission-v2.mjs');
await build({entryPoints:['lib/commission-v2.ts'],outfile:output,bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {calculateCommissionPool,allocateCommission,validateCommissionAllocations,summarizeCommissionLedger}=await import(pathToFileURL(output));

const base=[
  {brokerUserId:'buyer',role:'buyer_broker',sharePercent:50},
  {brokerUserId:'listing',role:'listing_broker',sharePercent:50},
];

test('fixed commission preserves exact rupee amount',()=>{
  assert.equal(calculateCommissionPool({method:'fixed',fixedAmount:125000}),125000);
});

test('percentage commission uses final selling price',()=>{
  assert.equal(calculateCommissionPool({method:'percentage',percentage:2,finalPrice:5000000}),100000);
});

test('allocation requires buyer and listing broker and totals exactly 100 percent',()=>{
  assert.equal(validateCommissionAllocations(base),true);
  assert.throws(()=>validateCommissionAllocations([
    {brokerUserId:'buyer',role:'buyer_broker',sharePercent:60},
    {brokerUserId:'listing',role:'listing_broker',sharePercent:30},
  ]),/100%/);
  assert.throws(()=>validateCommissionAllocations([
    {brokerUserId:'buyer',role:'buyer_broker',sharePercent:80},
    {brokerUserId:'ref',role:'referral_broker',sharePercent:20},
  ]),/listing broker/i);
});

test('referral broker can receive a disclosed slice without changing total commission',()=>{
  const rows=allocateCommission(100000,[
    {brokerUserId:'buyer',role:'buyer_broker',sharePercent:45},
    {brokerUserId:'listing',role:'listing_broker',sharePercent:45},
    {brokerUserId:'ref',role:'referral_broker',sharePercent:10},
  ]);
  assert.deepEqual(rows.map(x=>x.amount),[45000,45000,10000]);
  assert.equal(rows.reduce((sum,x)=>sum+x.amount,0),100000);
});

test('ledger shows earned, paid, outstanding and refund effects',()=>{
  const summary=summarizeCommissionLedger([
    {brokerUserId:'buyer',entryType:'earned',amount:50000,status:'confirmed'},
    {brokerUserId:'buyer',entryType:'invoice',amount:50000,status:'confirmed'},
    {brokerUserId:'buyer',entryType:'payment',amount:30000,status:'confirmed'},
    {brokerUserId:'buyer',entryType:'refund',amount:5000,status:'confirmed'},
  ]);
  assert.equal(summary.buyer.earned,50000);
  assert.equal(summary.buyer.paid,25000);
  assert.equal(summary.buyer.outstanding,25000);
  assert.equal(summary.buyer.overpaid,0);
});

test('void ledger entries do not affect totals',()=>{
  const summary=summarizeCommissionLedger([
    {brokerUserId:'listing',entryType:'earned',amount:40000,status:'confirmed'},
    {brokerUserId:'listing',entryType:'payment',amount:99999,status:'void'},
  ]);
  assert.equal(summary.listing.paid,0);
  assert.equal(summary.listing.outstanding,40000);
});
