import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const output=join(await mkdtemp(join(tmpdir(),'genz-match-')),'matching-v2.mjs');
await build({entryPoints:['lib/matching-v2.ts'],outfile:output,bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {scorePropertyMatch,rankPropertyMatches}=await import(pathToFileURL(output));

const requirement={type:'Residential plot',areas:['Shankar Nagar, Raipur'],maxBudget:5000000,minSize:1500,idealSize:1800};

test('exact locality, budget and size produces a strong explainable match',()=>{
  const result=scorePropertyMatch({id:'p1',type:'Residential plot',area:'Shankar Nagar, Raipur',asking:4700000,size:1800,status:'active'},requirement);
  assert.equal(result.eligible,true);
  assert.equal(result.score,100);
  assert.equal(result.components.location,100);
  assert.equal(result.components.price,100);
  assert.equal(result.components.size,100);
});

test('wrong property type is a hard rejection',()=>{
  const result=scorePropertyMatch({id:'p2',type:'Apartment',area:'Shankar Nagar, Raipur',asking:4500000,size:1800,status:'active'},requirement);
  assert.equal(result.eligible,false);
  assert.equal(result.score,0);
  assert.ok(result.reasons.some((reason)=>reason.includes('type')));
});

test('small near-budget tolerance can surface negotiable options but ranks them lower',()=>{
  const exact={id:'p1',type:'Residential plot',area:'Shankar Nagar, Raipur',asking:4900000,size:1800,status:'active'};
  const near={id:'p2',type:'Residential plot',area:'Shankar Nagar, Raipur',asking:5250000,size:1800,status:'active'};
  const matches=rankPropertyMatches([near,exact],requirement);
  assert.deepEqual(matches.map((item)=>item.propertyId),['p1','p2']);
  assert.ok(matches[1].components.price<100);
});

test('materially over-budget or undersized property is excluded',()=>{
  const expensive=scorePropertyMatch({id:'p3',type:'Residential plot',area:'Shankar Nagar, Raipur',asking:6000000,size:1800,status:'active'},requirement);
  const tiny=scorePropertyMatch({id:'p4',type:'Residential plot',area:'Shankar Nagar, Raipur',asking:4500000,size:1000,status:'active'},requirement);
  assert.equal(expensive.eligible,false);
  assert.equal(tiny.eligible,false);
});

test('partial locality match is eligible but scored below exact locality',()=>{
  const broad=scorePropertyMatch({id:'p2',type:'Residential plot',area:'Shankar Nagar',asking:4700000,size:1800,status:'active'},requirement);
  const exact=scorePropertyMatch({id:'p1',type:'Residential plot',area:'Shankar Nagar, Raipur',asking:4700000,size:1800,status:'active'},requirement);
  assert.equal(broad.eligible,true);
  assert.ok(broad.score<exact.score);
});
