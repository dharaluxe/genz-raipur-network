import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Properties page exposes listing broker edit, location and media controls', async () => {
  const page = await readFile('app/(network)/properties/page.tsx', 'utf8');
  const ui = await readFile('components/network/property-listing-manager.tsx', 'utf8');
  const migration = await readFile('supabase/migrations/20260930170000_genz_property_listing_management.sql', 'utf8');

  assert.match(page, /PropertyListingManager/);
  assert.match(ui, /genz_update_property_listing_v1/);
  assert.match(ui, /genz-listing-media/);
  assert.match(ui, /genz_set_property_cover_v1/);
  assert.match(ui, /Use current GPS/);
  assert.match(ui, /Detailed property description/);
  assert.match(ui, /Exact property address/);
  assert.match(migration, /add column if not exists description/);
  assert.match(migration, /add column if not exists address/);
  assert.match(migration, /LISTING_MANAGER_REQUIRED/);
  assert.match(migration, /revoke all on function public\.genz_update_property_listing_v1/);
  assert.match(migration, /grant execute .* to authenticated/i);
});
