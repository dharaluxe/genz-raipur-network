import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const sql=await readFile('supabase/migrations/20260930004500_genz_phase_2_6_access_requests.sql','utf8');
const hardening=await readFile('supabase/migrations/20260930005500_genz_phase_2_6_access_request_hardening.sql','utf8');

test('request requires at least one explicit permission',()=>{
  assert.match(sql,/SELECT_AT_LEAST_ONE_PERMISSION/);
  assert.match(sql,/genz_listing_access_requests_any_permission/);
});

test('approval converts request through the existing sharing grant engine',()=>{
  assert.match(sql,/genz_upsert_listing_share\(/);
  assert.match(sql,/approved_grant_id=v_grant/);
});

test('requester cannot directly read the support table',()=>{
  assert.match(sql,/revoke all on public\.genz_listing_access_requests from anon,authenticated/);
  assert.match(hardening,/access requests deny direct client access/);
  assert.match(hardening,/using \(false\)/);
});

test('only a listing source manager can approve a request',()=>{
  assert.match(sql,/genz_can_manage_listing_source\(v_req\.property_id,null\)/);
  assert.match(sql,/SHARE_SOURCE_ACCESS_DENIED/);
});
