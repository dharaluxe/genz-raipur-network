import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Opportunity Exchange renders approved listing access and migration unlocks granted fields', async()=>{
  const gate=await readFile('components/network/opportunity-membership-gate.tsx','utf8');
  const panel=await readFile('components/network/granted-listing-access-summary.tsx','utf8');
  const migration=await readFile('supabase/migrations/20260930170500_fix_shared_listing_grant_unlocks.sql','utf8');
  assert.match(gate,/GrantedListingAccessSummary/);
  assert.match(panel,/genz_get_shared_listing/);
  assert.match(panel,/genz_listing_media/);
  assert.match(panel,/genz-listing-media/);
  assert.match(panel,/createSignedUrl/);
  assert.match(panel,/can_view_price/);
  assert.match(panel,/can_view_photos/);
  assert.doesNotMatch(panel,/owner_phone_e164/);
  assert.match(migration,/manager_access or g\.can_view_price/);
  assert.match(migration,/manager_access or g\.can_view_exact_location/);
  assert.match(migration,/grant execute on function public\.genz_get_shared_listing\(uuid\) to authenticated/);
});
