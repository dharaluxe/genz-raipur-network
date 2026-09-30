import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const migration='supabase/migrations/20260930050000_genz_phase_3_0_admin_dispute_control_foundation.sql';

test('deal disputes are private, participant-scoped and RPC-only writes',async()=>{
 const sql=await read(migration);
 assert.match(sql,/create table if not exists public\.genz_deal_disputes/i);
 assert.match(sql,/raised_by_user_id=\(select auth\.uid\(\)\) or against_user_id=\(select auth\.uid\(\)\)/i);
 assert.match(sql,/revoke insert,update,delete on public\.genz_deal_disputes from authenticated,anon/i);
 assert.match(sql,/genz_raise_deal_dispute/i);
 assert.match(sql,/genz_deal_has_permission\(p_deal_id,'read'\)/i);
 assert.match(sql,/COUNTERPARTY_NOT_IN_DEAL/i);
 assert.match(sql,/ACTIVE_DISPUTE_EXISTS/i);
});

test('raising a private dispute does not automatically alter public broker status',async()=>{
 const sql=await read(migration);
 const start=sql.indexOf('create or replace function public.genz_raise_deal_dispute');
 const end=sql.indexOf('create or replace function public.genz_list_my_deal_disputes');
 const block=sql.slice(start,end);
 assert.doesNotMatch(block,/genz_broker_public_profiles/i);
 assert.doesNotMatch(block,/fraud/i);
 assert.match(block,/Private admin dispute raised/i);
});

test('admin cases unify existing source queues without exposing direct table reads',async()=>{
 const sql=await read(migration);
 assert.match(sql,/create table if not exists public\.genz_admin_cases/i);
 assert.match(sql,/no direct client reads admin cases/i);
 assert.match(sql,/revoke all on public\.genz_admin_cases from anon,authenticated/i);
 for(const source of ['genz_deal_disputes','genz_commission_disputes','genz_broker_status_appeals','genz_property_master_claims','genz_property_verifications']) assert.match(sql,new RegExp(source+'_admin_case','i'));
 assert.match(sql,/genz_admin_case_snapshot/i);
 assert.match(sql,/ADMIN_REQUIRED/i);
});

test('case management supports assignment notes priority and audit without bypassing source decisions',async()=>{
 const sql=await read(migration);
 assert.match(sql,/genz_admin_case_notes/i);
 assert.match(sql,/genz_admin_case_events/i);
 assert.match(sql,/p_action not in\('start','wait','reopen','note'\)/i);
 assert.match(sql,/ADMIN_ASSIGNEE_NOT_FOUND/i);
 assert.match(sql,/genz_admin_case_history/i);
 assert.match(sql,/genz_admin_resolve_deal_dispute/i);
});

test('broker and admin UIs use controlled RPCs',async()=>{
 const broker=await read('components/network/dispute-center.tsx');
 const admin=await read('components/network/admin-control-center.tsx');
 const brokerRoute=await read('app/(network)/disputes/page.tsx');
 const adminRoute=await read('app/(network)/admin-control/page.tsx');
 assert.match(broker,/genz_raise_deal_dispute/);
 assert.match(broker,/genz_list_my_deal_disputes/);
 assert.match(broker,/does not create a public fraud label/i);
 assert.doesNotMatch(broker,/from\('genz_deal_disputes'\)\.insert/i);
 assert.match(admin,/genz_admin_case_snapshot/);
 assert.match(admin,/genz_admin_manage_case/);
 assert.match(admin,/genz_admin_resolve_deal_dispute/);
 assert.match(admin,/genz_admin_resolve_commission_dispute/);
 assert.match(admin,/genz_admin_resolve_broker_status_appeal/);
 assert.match(admin,/genz_admin_review_property_master_claim/);
 assert.match(admin,/genz_admin_review_property_verification/);
 assert.match(brokerRoute,/DisputeCenter/);
 assert.match(adminRoute,/AdminControlCenter/);
});
