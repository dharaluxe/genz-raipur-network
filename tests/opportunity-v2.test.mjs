import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const output=join(await mkdtemp(join(tmpdir(),'genz-opportunity-')),'opportunity-v2.mjs');
await build({entryPoints:['lib/opportunity-v2.ts'],outfile:output,bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {opportunityMatchesQuery,daysUntilExpiry,rankBrokerRelevance}=await import(pathToFileURL(output));

test('opportunity search matches across city, type and broker fields',()=>{
  const record={id:'DEMO-REQ-001',headline:'Residential plot wanted in Raipur',note:'Buyer demand',city:'Raipur',propertyType:'Residential plot',brokerName:'Krishna',brokerFirm:'GENZ'};
  assert.equal(opportunityMatchesQuery(record,'raipur plot'),true);
  assert.equal(opportunityMatchesQuery(record,'krishna residential'),true);
  assert.equal(opportunityMatchesQuery(record,'bhopal'),false);
});

test('expiry helper returns whole days and supports expired records',()=>{
  const now=Date.parse('2026-09-29T00:00:00Z');
  assert.equal(daysUntilExpiry('2026-10-01T00:00:00Z',now),2);
  assert.equal(daysUntilExpiry('2026-09-28T23:59:59Z',now),0);
  assert.equal(daysUntilExpiry(null,now),null);
});

test('broker relevance rewards city and specialty match without ignoring trust',()=>{
  const ranked=rankBrokerRelevance([
    {id:'a',name:'A',cities:['Raipur'],specialties:['Residential plot'],verified:true,trustScore:70},
    {id:'b',name:'B',cities:['Bhopal'],specialties:['Apartment'],verified:true,trustScore:95},
  ],{city:'Raipur',propertyType:'Residential plot'});
  assert.equal(ranked[0].id,'a');
  assert.ok(ranked[0].reasons.includes('location match'));
  assert.ok(ranked[0].reasons.includes('specialty match'));
});
