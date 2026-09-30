import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('buyer master migration keeps requirement-level protection and budget ranges', async () => {
  const sql = await read('supabase/migrations/20260930013000_genz_phase_2_7_buyer_master_foundation.sql');
  assert.match(sql, /add column if not exists min_budget/i);
  assert.match(sql, /min_budget >= 0 and max_budget > 0 and min_budget <= max_budget/i);
  assert.match(sql, /add column if not exists protection_expires_at/i);
  assert.match(sql, /create table if not exists public\.genz_buyer_broker_relationships/i);
  assert.match(sql, /create table if not exists public\.genz_requirement_versions/i);
  assert.match(sql, /GENZ_REQUIREMENT_PROTECTED/i);
  assert.match(sql, /source_user_id <> v_uid/i);
});

test('requirement similarity includes size rather than phone alone', async () => {
  const sql = await read('supabase/migrations/20260930014500_genz_phase_2_7_requirement_similarity_size.sql');
  assert.match(sql, /genz_requirement_size_similar/i);
  assert.match(sql, /greatest\(200,/i);
  assert.match(sql, /0\.25/i);
  assert.match(sql, /greatest\(r\.min_budget,p_min_budget\)<=least\(r\.max_budget,p_max_budget\)/i);
});

test('buyer workspace exposes min and max budget and safe duplicate choices', async () => {
  const ui = await read('components/network/buyer-master-requirements.tsx');
  assert.match(ui, /Minimum budget/);
  assert.match(ui, /Maximum budget/);
  assert.match(ui, /Minimum budget cannot be greater than maximum budget/);
  assert.match(ui, /genz_requirement_candidate/);
  assert.match(ui, /Update existing/);
  assert.match(ui, /Add as separate requirement/);
  assert.match(ui, /Buyer identity and the other broker remain private/);
});

test('master property candidates never expose raw owner phone or candidate GPS', async () => {
  const sql = await read('supabase/migrations/20260930015500_genz_phase_2_7_master_property_foundation.sql');
  const signatureStart = sql.indexOf('create or replace function public.genz_property_master_candidates');
  const signatureEnd = sql.indexOf('language plpgsql', signatureStart);
  const returnSignature = sql.slice(signatureStart, signatureEnd);
  assert.ok(signatureStart >= 0);
  assert.doesNotMatch(returnSignature, /owner_phone_e164/i);
  assert.doesNotMatch(returnSignature, /canonical_latitude/i);
  assert.doesNotMatch(returnSignature, /canonical_longitude/i);
  assert.match(returnSignature, /match_score integer/i);
  assert.match(returnSignature, /evidence text/i);
  assert.match(sql, /Fuzzy matches never auto-merge/i);
  assert.match(sql, /genz_property_master_claims/i);
});

test('property creation is atomic and merge remains reviewed', async () => {
  const sql = await read('supabase/migrations/20260930021500_genz_phase_2_7_property_atomic_create.sql');
  assert.match(sql, /genz_create_property_mandate_v2/i);
  assert.match(sql, /insert into public\.genz_properties/i);
  assert.match(sql, /insert into public\.genz_property_private/i);
  assert.match(sql, /genz_request_property_master_merge/i);
  assert.match(sql, /revoke execute .* from public,anon/i);

  const masterSql = await read('supabase/migrations/20260930015500_genz_phase_2_7_master_property_foundation.sql');
  assert.match(masterSql, /genz_admin_review_property_master_claim/i);
  assert.match(masterSql, /p_decision not in \('approved','rejected'\)/i);
});

test('discovery v2 matches asking price inside requirement min-max range', async () => {
  const sql = await read('supabase/migrations/20260930022500_genz_phase_2_7_budget_range_discovery.sql');
  assert.match(sql, /genz_discover_property_supply_v2/i);
  assert.match(sql, /genz_discover_buyer_demand_v2/i);
  assert.match(sql, /p\.asking between r\.min_budget and r\.max_budget/i);
  assert.match(sql, /min_budget numeric, max_budget numeric/i);

  const ui = await read('components/network/privacy-discovery.tsx');
  assert.match(ui, /genz_discover_property_supply_v2/);
  assert.match(ui, /genz_discover_buyer_demand_v2/);
  assert.match(ui, /minimum–maximum budget range/i);
  assert.match(ui, /budget \{budgetRange\(item\)\}/);
});

test('master property workspace uses atomic create and reviewed candidate flow', async () => {
  const ui = await read('components/network/master-property-workspace-v2.tsx');
  assert.match(ui, /genz_property_master_candidates/);
  assert.match(ui, /genz_create_property_mandate_v2/);
  assert.match(ui, /genz_admin_review_property_master_claim/);
  assert.match(ui, /never an automatic fuzzy merge/i);
  assert.match(ui, /owner phone is hashed/i);
});
