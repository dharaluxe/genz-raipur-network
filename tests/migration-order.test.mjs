import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);

test('Supabase migration versions are unique and dependency order is deterministic', async () => {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  const versions = new Map();

  for (const file of files) {
    // Legacy GENZ migrations used YYYYMMDD versions while newer migrations use
    // timestamp-style versions. Supabase treats the numeric prefix before the
    // first underscore as the migration version, so preserve legacy filenames
    // and enforce uniqueness across both formats.
    const match = file.match(/^(\d+)_/);
    assert.ok(match, `Migration filename must start with a numeric version: ${file}`);
    const version = match[1];
    assert.ok(!versions.has(version), `Duplicate Supabase migration version ${version}: ${versions.get(version)} and ${file}`);
    versions.set(version, file);
  }

  const notificationsFile = '20260930049000_genz_notifications_followups_foundation.sql';
  const adminFile = '20260930050000_genz_phase_3_0_admin_dispute_control_foundation.sql';
  assert.ok(files.includes(notificationsFile), 'Notifications migration missing');
  assert.ok(files.includes(adminFile), 'Admin/Dispute migration missing');

  const notificationsVersion = BigInt(notificationsFile.split('_', 1)[0]);
  const adminVersion = BigInt(adminFile.split('_', 1)[0]);
  assert.ok(notificationsVersion < adminVersion, 'Notifications must migrate before Admin/Dispute because admin cases emit notifications');
});
