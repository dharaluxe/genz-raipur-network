import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const output=join(await mkdtemp(join(tmpdir(),'genz-public-broker-')),'public-broker-verification.mjs');
await build({entryPoints:['lib/public-broker-verification.ts'],outfile:output,bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {normalizeBrokerCode,isValidBrokerCode,brokerInitials,publicLookupErrorMessage,publicStatusPresentation}=await import(pathToFileURL(output));

test('broker id normalization is exact and case-insensitive',()=>{
  assert.equal(normalizeBrokerCode(' br-f442afac '),'BR-F442AFAC');
  assert.equal(isValidBrokerCode('BR-F442AFAC'),true);
  assert.equal(isValidBrokerCode('BR-123'),false);
});

test('public status language does not call review status fraud',()=>{
  const review=publicStatusPresentation('under_review');
  assert.equal(review.label,'Under review');
  assert.match(review.explanation,/not a finding/i);
});

test('suspended and removed states are visibly distinct from active',()=>{
  assert.equal(publicStatusPresentation('active').tone,'emerald');
  assert.equal(publicStatusPresentation('suspended').tone,'rose');
  assert.equal(publicStatusPresentation('removed').tone,'rose');
});

test('broker initials support one or two word names',()=>{
  assert.equal(brokerInitials('Krishna Tripathi'),'KT');
  assert.equal(brokerInitials('Krishna'),'K');
});

test('public lookup rate limit is translated to visitor-safe copy',()=>{
  const message=publicLookupErrorMessage(new Error('GENZ_PUBLIC_LOOKUP_RATE_LIMIT'));
  assert.match(message,/too many verification checks/i);
  assert.doesNotMatch(message,/GENZ_PUBLIC_LOOKUP_RATE_LIMIT/);
});
