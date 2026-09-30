import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../supabase/migrations/20260930104500_genz_opportunity_rls_recursion_fix.sql',import.meta.url),'utf8');

test('opportunity visibility policies use recursion-free security-definer helpers',()=>{
  assert.match(migration,/security definer/i);
  assert.match(migration,/genz_can_read_opportunity\(p_opportunity_id uuid\)/i);
  assert.match(migration,/genz_can_read_opportunity_private_row\(p_opportunity_id uuid, p_row_broker_user_id uuid\)/i);
  assert.match(migration,/using \(public\.genz_can_read_opportunity\(id\)\)/i);
  assert.match(migration,/using \(public\.genz_can_read_opportunity_private_row\(opportunity_id, broker_user_id\)\)/i);
});

test('public does not receive execute access to opportunity visibility helpers',()=>{
  assert.match(migration,/revoke all on function public\.genz_can_read_opportunity\(uuid\) from public/i);
  assert.match(migration,/revoke all on function public\.genz_can_read_opportunity_private_row\(uuid,uuid\) from public/i);
  assert.match(migration,/grant execute on function public\.genz_can_read_opportunity\(uuid\) to authenticated/i);
  assert.match(migration,/grant execute on function public\.genz_can_read_opportunity_private_row\(uuid,uuid\) to authenticated/i);
});
