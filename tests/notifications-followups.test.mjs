import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('notifications are private to the signed-in user and client writes stay RPC-only',async()=>{
  const sql=await read('supabase/migrations/20260930050000_genz_notifications_followups_foundation.sql');
  assert.match(sql,/create table if not exists public\.genz_notifications/i);
  assert.match(sql,/user_id uuid not null references auth\.users\(id\)/i);
  assert.match(sql,/create policy "users read own notifications"[\s\S]*user_id=\(select auth\.uid\(\)\)/i);
  assert.match(sql,/revoke insert,update,delete on public\.genz_notifications from authenticated,anon/i);
  assert.match(sql,/genz_mark_notification/i);
  assert.match(sql,/genz_mark_all_notifications_read/i);
});

test('multiple buyer offers remain isolated by Deal Room while listing broker receives each room notification',async()=>{
  const dealSql=await read('supabase/migrations/20260930040000_genz_phase_2_8_deal_room_foundation.sql');
  const notifySql=await read('supabase/migrations/20260930050000_genz_notifications_followups_foundation.sql');
  assert.match(dealSql,/create policy "deal participants read offers"[\s\S]*genz_deal_has_permission\(deal_id,'read'\)/i);
  assert.match(dealSql,/select id into v_existing from public\.genz_deals where requirement_id=r\.id and property_id=p\.id/i);
  assert.doesNotMatch(dealSql,/where property_id=p\.id\s*;/i);
  assert.match(notifySql,/from public\.genz_deal_participants dp where dp\.deal_id=new\.deal_id/i);
  assert.match(notifySql,/dp\.can_view_financials/i);
  assert.match(notifySql,/dp\.user_id<>new\.offered_by_user_id/i);
  assert.doesNotMatch(notifySql,/from public\.genz_deal_offers o where o\.property_id/i);
});

test('follow-up engine covers expiry, visits, offers, commission and stale work',async()=>{
  const sql=await read('supabase/migrations/20260930050000_genz_notifications_followups_foundation.sql');
  for(const kind of ['requirement_expiry','protection_expiry','visit_due','offer_expiry','commission_due','stale_deal','stale_requirement']) assert.match(sql,new RegExp(kind));
  assert.match(sql,/genz_refresh_my_followups/i);
  assert.match(sql,/genz_update_followup/i);
  assert.match(sql,/status='snoozed'/i);
  assert.match(sql,/status='done'/i);
});

test('notification triggers cover the core collaboration events',async()=>{
  const sql=await read('supabase/migrations/20260930050000_genz_notifications_followups_foundation.sql');
  for(const fn of ['genz_notification_deal_trigger','genz_notification_offer_trigger','genz_notification_message_trigger','genz_notification_access_request_trigger','genz_notification_builder_invite_trigger','genz_notification_opportunity_response_trigger','genz_notification_commission_trigger','genz_notification_visit_trigger']) assert.match(sql,new RegExp(fn));
});

test('notification center exposes in-app workflow only and no fake external delivery claim',async()=>{
  const ui=await read('components/network/notification-center.tsx');
  const page=await read('app/(network)/notifications/page.tsx');
  assert.match(page,/NotificationCenter/);
  assert.match(ui,/Notifications & Follow-ups/);
  assert.match(ui,/Offer privacy:/);
  assert.match(ui,/genz_refresh_my_followups/);
  assert.match(ui,/genz_mark_notification/);
  assert.match(ui,/genz_update_followup/);
  assert.doesNotMatch(ui,/sendSms|sendWhatsApp|sendEmail/i);
});
