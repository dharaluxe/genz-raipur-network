import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const output=join(await mkdtemp(join(tmpdir(),'genz-identity-')),'network-identity.mjs');
await build({entryPoints:['lib/network-identity.ts'],outfile:output,bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {customerFingerprint,maskedPhone,protectionExpiry,claimStateAt,canCreateSourceClaim}=await import(pathToFileURL(output));

const secret='0123456789abcdef0123456789abcdef';

test('same Indian mobile normalizes to the same keyed fingerprint',async()=>{
  const a=await customerFingerprint('98765 43210',secret);
  const b=await customerFingerprint('+91-98765-43210',secret);
  assert.equal(a,b);
  assert.match(a,/^v1:[0-9a-f]{64}$/);
  assert.equal(maskedPhone('9876543210'),'98******10');
});

test('different network secret produces a different fingerprint',async()=>{
  const a=await customerFingerprint('9876543210',secret);
  const b=await customerFingerprint('9876543210','abcdef0123456789abcdef0123456789');
  assert.notEqual(a,b);
});

test('weak fingerprint keys are rejected',async()=>{
  await assert.rejects(()=>customerFingerprint('9876543210','too-short'),/at least 32/);
});

test('protection window expires deterministically',()=>{
  const starts='2026-09-28T00:00:00.000Z';
  const expires=protectionExpiry(starts,30);
  assert.equal(expires,'2026-10-28T00:00:00.000Z');
  const claim={brokerId:'broker-a',startsAt:starts,expiresAt:expires,state:'active'};
  assert.equal(claimStateAt(claim,new Date('2026-10-27T23:59:59.000Z')),'active');
  assert.equal(claimStateAt(claim,new Date('2026-10-28T00:00:00.000Z')),'expired');
});

test('active source claim blocks another broker but expired claim can be reclaimed',()=>{
  const claim={brokerId:'broker-a',startsAt:'2026-09-01T00:00:00.000Z',expiresAt:'2026-10-01T00:00:00.000Z',state:'active'};
  assert.deepEqual(canCreateSourceClaim(claim,'broker-b',new Date('2026-09-20T00:00:00.000Z')),{allowed:false,reason:'protected_by_other_broker'});
  assert.deepEqual(canCreateSourceClaim(claim,'broker-b',new Date('2026-10-02T00:00:00.000Z')),{allowed:true,reason:'expired'});
});
