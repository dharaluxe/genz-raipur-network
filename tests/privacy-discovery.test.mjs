import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const sql=await readFile('supabase/migrations/20260930002000_genz_phase_2_6_privacy_safe_discovery.sql','utf8');

function between(start,end){
  const tail=sql.split(start)[1]||'';
  return (tail.split(end)[0]||tail);
}

test('property opportunity text no longer copies asking price',()=>{
  const section=between('create or replace function public.genz_autopost_property_opportunity()','-- Redact existing property opportunity text');
  assert.match(section,/Price protected/);
  assert.doesNotMatch(section,/new\.asking/i);
});

test('property discovery return contract omits sensitive property fields',()=>{
  const signature=between('create or replace function public.genz_discover_property_supply','language plpgsql');
  assert.doesNotMatch(signature,/\basking\b/i);
  assert.doesNotMatch(signature,/\bowner_label\b/i);
  assert.doesNotMatch(signature,/\blatitude\b/i);
  assert.doesNotMatch(signature,/\blongitude\b/i);
});

test('buyer discovery return contract omits buyer identity and phone',()=>{
  const signature=between('create or replace function public.genz_discover_buyer_demand','language plpgsql');
  assert.doesNotMatch(signature,/buyer_label/i);
  assert.doesNotMatch(signature,/buyer_phone/i);
});

test('raw requirement rows are source broker or admin only',()=>{
  assert.match(sql,/create policy "source broker reads full requirement rows"/);
  assert.match(sql,/auth\.uid\(\)\) = source_user_id/);
});
