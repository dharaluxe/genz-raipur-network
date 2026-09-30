import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('deal room foundation keeps permissions server-side and fixes listing ownership correlation', async () => {
  const sql = await read('supabase/migrations/20260930040000_genz_phase_2_8_deal_room_foundation.sql');
  assert.match(sql, /create table if not exists public\.genz_deal_participants/i);
  assert.match(sql, /can_offer boolean/i);
  assert.match(sql, /can_add_evidence boolean/i);
  assert.match(sql, /genz_deal_has_permission/i);
  assert.match(sql, /p\.listing_user_id=genz_deals\.listing_user_id/i);
  assert.doesNotMatch(sql, /p\.listing_user_id\s*=\s*p\.listing_user_id/i);
  assert.match(sql, /revoke insert,update,delete on public\.genz_deal_offers from authenticated,anon/i);
});

test('negotiation is append-style offer history with other-party response and counter linkage', async () => {
  const sql = await read('supabase/migrations/20260930041500_genz_phase_2_8_negotiation_actions.sql');
  assert.match(sql, /genz_make_deal_offer/i);
  assert.match(sql, /parent_offer_id/i);
  assert.match(sql, /CANNOT_COUNTER_OWN_OFFER/i);
  assert.match(sql, /CANNOT_RESPOND_OWN_OFFER/i);
  assert.match(sql, /status='countered'/i);
  assert.match(sql, /genz_respond_deal_offer/i);
  assert.match(sql, /genz_withdraw_deal_offer/i);
});

test('unsuccessful closeout requires structured reason and two-party confirmation', async () => {
  const foundation = await read('supabase/migrations/20260930040000_genz_phase_2_8_deal_room_foundation.sql');
  const actions = await read('supabase/migrations/20260930041500_genz_phase_2_8_negotiation_actions.sql');
  assert.match(foundation, /price_not_agreed/i);
  assert.match(foundation, /documentation_issue/i);
  assert.match(foundation, /commission_not_agreed/i);
  assert.match(foundation, /genz_deal_closeout_acceptances/i);
  assert.match(actions, /genz_propose_deal_closeout/i);
  assert.match(actions, /genz_respond_deal_closeout/i);
  assert.match(actions, /count\(distinct x\).*unnest\(array\[d\.buyer_user_id,d\.listing_user_id\]\)/is);
  assert.match(actions, /status='confirmed'/i);
});

test('deal evidence stays private, permission checked and storage-path scoped', async () => {
  const sql = await read('supabase/migrations/20260930041500_genz_phase_2_8_negotiation_actions.sql');
  assert.match(sql, /genz_register_deal_evidence/i);
  assert.match(sql, /genz_deal_has_permission\(p_deal_id,'evidence'\)/i);
  assert.match(sql, /v_uid::text\|\|'\/deal\/'\|\|p_deal_id\|\|'\/'/i);
  assert.match(sql, /application\/pdf/i);
  assert.match(sql, /image\/jpeg/i);
  assert.match(sql, /10485760/i);
  assert.match(sql, /genz deal evidence participant read/i);
});

test('hardening keeps trigger helpers internal and blocks arbitrary permission probing', async () => {
  const sql = await read('supabase/migrations/20260930043000_genz_phase_2_8_security_index_hardening.sql');
  assert.match(sql, /genz_deal_offers_responded_by_idx/i);
  assert.match(sql, /revoke all on function public\.genz_seed_deal_participants\(\) from public,anon,authenticated/i);
  assert.match(sql, /revoke all on function public\.genz_sync_closeouts_on_deal_close\(\) from public,anon,authenticated/i);
  assert.match(sql, /p_user_id<>v_caller/i);
  assert.match(sql, /can_manage_participants/i);
  assert.match(sql, /return false/i);
});

test('referral and observer access is least privilege and core brokers are immutable', async () => {
  const sql = await read('supabase/migrations/20260930044500_genz_phase_2_8_participant_management.sql');
  const ui = await read('components/network/deal-participant-access.tsx');
  assert.match(sql, /genz_upsert_deal_participant/i);
  assert.match(sql, /p_role not in \('referral_broker','observer'\)/i);
  assert.match(sql, /CORE_PARTICIPANT_IMMUTABLE/i);
  assert.match(sql, /can_close=false/i);
  assert.match(sql, /can_manage_participants=false/i);
  assert.match(sql, /genz_remove_deal_participant/i);
  assert.match(ui, /Referral broker/i);
  assert.match(ui, /Financials/i);
  assert.match(ui, /genz_upsert_deal_participant/i);
  assert.match(ui, /genz_remove_deal_participant/i);
});

test('advanced deal room UI uses RPC actions rather than direct support-table mutations', async () => {
  const ui = await read('components/network/advanced-deal-room.tsx');
  const route = await read('app/(network)/deals/page.tsx');
  assert.match(route, /AdvancedDealRoom/);
  assert.match(route, /DealParticipantAccess/);
  assert.match(ui, /genz_deal_room_snapshot/);
  assert.match(ui, /genz_create_deal_room_v2/);
  assert.match(ui, /genz_accept_deal_room/);
  assert.match(ui, /genz_make_deal_offer/);
  assert.match(ui, /genz_respond_deal_offer/);
  assert.match(ui, /genz_post_deal_message/);
  assert.match(ui, /genz_register_deal_evidence/);
  assert.match(ui, /genz_propose_deal_closeout/);
  assert.match(ui, /genz_respond_deal_closeout/);
  assert.doesNotMatch(ui, /from\('genz_deal_offers'\)\.insert/i);
  assert.doesNotMatch(ui, /from\('genz_deal_closeouts'\)\.insert/i);
});

test('successful closing remains delegated to commission closing flow', async () => {
  const ui = await read('components/network/advanced-deal-room.tsx');
  const closing = await read('supabase/migrations/20260928235000_genz_phase_2_3_closing_ledger.sql');
  assert.match(ui, /Successful closing & commission confirmation/i);
  assert.match(ui, /href="\/commissions"/i);
  assert.match(closing, /genz_propose_deal_closing/i);
  assert.match(closing, /genz_respond_deal_closing/i);
  assert.match(closing, /genz_materialize_closing_entitlements/i);
});
