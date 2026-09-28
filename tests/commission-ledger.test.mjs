import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const output=join(await mkdtemp(join(tmpdir(),'genz-ledger-')),'commission-ledger.mjs');
await build({entryPoints:['lib/commission-ledger.ts'],outfile:output,bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {summarizeCommissionLedger}=await import(pathToFileURL(output));

test('confirmed earned amount drives outstanding receivable',()=>{
  const result=summarizeCommissionLedger([
    {entry_type:'earned',status:'confirmed',amount:100000},
    {entry_type:'invoice',status:'pending',amount:60000},
    {entry_type:'payment',status:'confirmed',amount:40000},
  ]);
  assert.equal(result.earned,100000);
  assert.equal(result.invoiced,60000);
  assert.equal(result.paymentsConfirmed,40000);
  assert.equal(result.outstanding,60000);
  assert.equal(result.availableToInvoice,40000);
  assert.equal(result.availableToReportPayment,60000);
});

test('pending payments reserve receivable without pretending they are confirmed cash',()=>{
  const result=summarizeCommissionLedger([
    {entry_type:'earned',status:'confirmed',amount:75000},
    {entry_type:'payment',status:'pending',amount:25000},
  ]);
  assert.equal(result.outstanding,75000);
  assert.equal(result.paymentsPending,25000);
  assert.equal(result.availableToReportPayment,50000);
});

test('confirmed refund re-opens outstanding receivable',()=>{
  const result=summarizeCommissionLedger([
    {entry_type:'earned',status:'confirmed',amount:50000},
    {entry_type:'payment',status:'confirmed',amount:50000},
    {entry_type:'refund',status:'confirmed',amount:10000},
  ]);
  assert.equal(result.outstanding,10000);
  assert.equal(result.availableToReportPayment,10000);
});

test('void and disputed manual entries do not affect active totals',()=>{
  const result=summarizeCommissionLedger([
    {entry_type:'earned',status:'confirmed',amount:10000},
    {entry_type:'invoice',status:'void',amount:9000},
    {entry_type:'payment',status:'disputed',amount:8000},
  ]);
  assert.equal(result.invoiced,0);
  assert.equal(result.paymentsConfirmed,0);
  assert.equal(result.paymentsPending,0);
  assert.equal(result.outstanding,10000);
});
