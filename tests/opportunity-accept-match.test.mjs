import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const migration='supabase/migrations/20260930111500_genz_opportunity_accept_match_ambiguity_fix.sql';

test('opportunity accept-match RPC uses unambiguous v_ variables and keeps authenticated-only execute',async()=>{
  const sql=await readFile(migration,'utf8');
  assert.match(sql,/v_requirement_id text;/);
  assert.match(sql,/v_property_id text;/);
  assert.match(sql,/d\.requirement_id = v_requirement_id/);
  assert.match(sql,/d\.property_id = v_property_id/);
  assert.doesNotMatch(sql,/d\.requirement_id\s*=\s*requirement_id/);
  assert.doesNotMatch(sql,/d\.property_id\s*=\s*property_id/);
  assert.match(sql,/revoke all on function public\.genz_accept_opportunity_response\(uuid\) from public, anon;/);
  assert.match(sql,/grant execute on function public\.genz_accept_opportunity_response\(uuid\) to authenticated;/);
});
