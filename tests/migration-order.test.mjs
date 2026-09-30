import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);

test('Supabase migration versions are unique and dependency order is deterministic', async () => {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  const versions = new Map();
  for (const file of files) {
    const match = file.match(/^(\d{14})_/);
    assert.ok(match, `Migration filename must start with a 14-digit version: ${file}`);
    const version = match[1];
    assert.ok(!versions.has(version), `Duplicate Supabase migration version ${version}: ${versions.get(version)} and ${file}`);
    versions.set(version, file);
  }

  const notifications = files.indexOf('20260930049000_genz_notifications_followups_foundation.sql');
  const admin = files.indexOf('20260930050000_genz_phase_3_0_admin_dispute_control_foundation.sql');
  assert.ok(notifications >= 0, 'Notifications migration missing');
  assert.ok(admin >= 0, 'Admin/Dispute migration missing');
  assert.ok(notifications < admin, 'Notifications must migrate before Admin/Dispute because admin cases emit notifications');
});
