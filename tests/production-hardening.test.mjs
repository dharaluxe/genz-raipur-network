import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

const rls='supabase/migrations/20260930062000_genz_phase_3_1_rls_initplan_hardening.sql';
const idem='supabase/migrations/20260930063000_genz_phase_3_1_idempotent_financial_actions.sql';
const agreementFix='supabase/migrations/20260930064000_genz_phase_3_1_commission_agreement_ambiguity_fix.sql';
const ledgerFix='supabase/migrations/20260930065000_genz_phase_3_1_commission_ledger_concurrency_fix.sql';
const retryFix='supabase/migrations/20260930070000_genz_phase_3_1_idempotency_cleanup_on_error.sql';
const ledgerKey='supabase/migrations/20260930071000_genz_phase_3_1_ledger_idempotency_unique_key.sql';

test('core GENZ RLS policies use init-plan-safe auth/member lookups',async()=>{
 const sql=await read(rls);
 assert.match(sql,/\(select auth\.uid\(\)\)/i);
 assert.match(sql,/\(select public\.genz_is_member\(\)\)/i);
 assert.match(sql,/\(select public\.genz_is_admin\(\)\)/i);
 assert.doesNotMatch(sql,/[^a-z_]auth\.uid\(\)\s*=\s*(?:source_user_id|listing_user_id|buyer_user_id|id)/i);
 for(const policy of ['source broker reads private buyer','brokers update own profile','listing broker creates property','deal participants read room','invite visibility']){
  assert.ok(sql.includes(`alter policy "${policy}"`),`${policy} policy hardening missing`);
 }
});

test('high-value actions expose retry-safe V2 RPCs with client request keys',async()=>{
 const sql=await read(idem);
 assert.match(sql,/client_request_id uuid/i);
 assert.match(sql,/genz_deal_offers_client_request_uq/i);
 assert.match(sql,/genz_commission_agreements_client_request_uq/i);
 assert.match(sql,/genz_make_deal_offer_v2/i);
 assert.match(sql,/genz_propose_commission_agreement_v2/i);
 assert.match(sql,/genz_record_commission_activity_v2/i);
 assert.match(sql,/CLIENT_REQUEST_ID_REQUIRED/i);
 assert.match(sql,/manual-v2:/i);
 assert.match(sql,/for update/i);
 for(const fn of ['genz_make_deal_offer_v2','genz_propose_commission_agreement_v2','genz_record_commission_activity_v2']){
  const start=sql.indexOf(`function public.${fn}`);
  assert.ok(start>=0,`${fn} missing`);
  const next=sql.indexOf('create or replace function public.',start+30);
  const block=sql.slice(start,next>0?next:sql.length);
  assert.match(block,/revoke execute|revoke execute on function/i);
 }
});

test('concurrent retries recover their existing idempotent record',async()=>{
 const sql=await read(retryFix);
 assert.match(sql,/exception when unique_violation/i);
 assert.match(sql,/offered_by_user_id=v_uid and o\.client_request_id=p_client_request_id/i);
 assert.match(sql,/proposed_by_user_id=v_uid and a\.client_request_id=p_client_request_id/i);
 assert.match(sql,/source_key=v_key/i);
 const keySql=await read(ledgerKey);
 assert.match(keySql,/unique index if not exists genz_commission_ledger_source_key_uq/i);
});

test('commission agreement bugfix uses unambiguous agreement variable',async()=>{
 const sql=await read(agreementFix);
 assert.match(sql,/v_agreement_id uuid/i);
 assert.match(sql,/values\(v_agreement_id,/i);
 assert.match(sql,/a\.agreement_id=v_agreement_id/i);
 assert.doesNotMatch(sql,/declare[\s\S]{0,500}\bagreement_id uuid;/i);
});

test('commission ledger arithmetic is serialized per deal and unambiguous',async()=>{
 const sql=await read(ledgerFix);
 assert.match(sql,/v_agreement_id uuid/i);
 assert.match(sql,/where id=p_deal_id for update/i);
 assert.match(sql,/x\.agreement_id=v_agreement_id/i);
 assert.match(sql,/values\(p_deal_id,v_agreement_id/i);
 assert.match(sql,/INVOICE_EXCEEDS_ENTITLEMENT/i);
 assert.match(sql,/PAYMENT_EXCEEDS_RECEIVABLE/i);
 assert.match(sql,/REFUND_EXCEEDS_RECORDED_PAYMENT/i);
});

test('Next.js responses ship conservative browser security headers',async()=>{
 const config=await read('next.config.ts');
 for(const header of ['X-Content-Type-Options','Referrer-Policy','X-Frame-Options','Permissions-Policy','Cross-Origin-Opener-Policy','X-Permitted-Cross-Domain-Policies','Strict-Transport-Security']) assert.match(config,new RegExp(header,'i'));
 assert.match(config,/poweredByHeader:\s*false/i);
 assert.match(config,/private, no-store/i);
});

test('public broker QR proxy pins trusted origin and bounds upstream fetch',async()=>{
 const route=await read('app/api/public-broker-qr/route.ts');
 assert.match(route,/NEXT_PUBLIC_SITE_URL/i);
 assert.match(route,/https:\/\/genz-raipur-network\.vercel\.app/i);
 assert.doesNotMatch(route,/request\.nextUrl\.origin\/broker/i);
 assert.match(route,/AbortSignal\.timeout\(5000\)/i);
 assert.match(route,/MAX_QR_BYTES/i);
 assert.match(route,/image\/png/i);
});
