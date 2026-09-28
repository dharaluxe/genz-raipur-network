import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const output=join(await mkdtemp(join(tmpdir(),'genz-trust-')),'trust-score.mjs');
await build({entryPoints:['lib/trust-score.ts'],outfile:output,bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {calculateTrustScore}=await import(pathToFileURL(output));

test('new broker has low-confidence score without fake activity',()=>{
  const result=calculateTrustScore({
    profileVerified:true,
    completedDeals:0,
    successfulCollaborations:0,
    verifiedVisits:0,
    collaborationRequests:0,
    collaborationResponses:0,
  });
  assert.equal(result.confidence,'new');
  assert.equal(result.components.verification,10);
  assert.equal(result.components.feedback,0);
  assert.equal(result.components.integrity,15);
  assert.equal(result.score,25);
});

test('owner-confirmed listings add capped verification trust without dominating score',()=>{
  const one=calculateTrustScore({
    profileVerified:true,
    ownerConfirmedListings:1,
    completedDeals:0,
    successfulCollaborations:0,
    verifiedVisits:0,
    collaborationRequests:0,
    collaborationResponses:0,
  });
  const many=calculateTrustScore({
    profileVerified:true,
    ownerConfirmedListings:50,
    completedDeals:0,
    successfulCollaborations:0,
    verifiedVisits:0,
    collaborationRequests:0,
    collaborationResponses:0,
  });
  assert.equal(one.components.verification,11);
  assert.equal(many.components.verification,15);
  assert.equal(many.score,30);
});

test('verified platform activity raises trust score deterministically',()=>{
  const result=calculateTrustScore({
    profileVerified:true,
    ownerConfirmedListings:5,
    completedDeals:8,
    successfulCollaborations:9,
    verifiedVisits:20,
    collaborationRequests:20,
    collaborationResponses:19,
    verifiedReviewAverage:4.8,
    verifiedReviewCount:18,
  });
  assert.equal(result.confidence,'established');
  assert.ok(result.score>=85);
  assert.ok(result.score<=100);
});

test('disputes and duplicate claim violations reduce integrity, never below zero',()=>{
  const clean=calculateTrustScore({
    profileVerified:true,
    ownerConfirmedListings:5,
    completedDeals:10,
    successfulCollaborations:10,
    verifiedVisits:20,
    collaborationRequests:10,
    collaborationResponses:10,
    verifiedReviewAverage:5,
    verifiedReviewCount:20,
  });
  const penalized=calculateTrustScore({
    profileVerified:true,
    ownerConfirmedListings:5,
    completedDeals:10,
    successfulCollaborations:10,
    verifiedVisits:20,
    collaborationRequests:10,
    collaborationResponses:10,
    verifiedReviewAverage:5,
    verifiedReviewCount:20,
    unresolvedDisputes:5,
    upheldDisputesAgainst:3,
    duplicateClaimViolations:4,
  });
  assert.equal(penalized.components.integrity,0);
  assert.ok(penalized.score<clean.score);
  assert.ok(penalized.score>=0);
});

test('verified review score is Bayesian-shrunk and cannot dominate objective history',()=>{
  const oneReview=calculateTrustScore({
    profileVerified:true,
    completedDeals:0,
    successfulCollaborations:0,
    verifiedVisits:0,
    collaborationRequests:0,
    collaborationResponses:0,
    verifiedReviewAverage:5,
    verifiedReviewCount:1,
  });
  assert.ok(oneReview.components.feedback<10);
  assert.ok(oneReview.components.feedback>0);
});
