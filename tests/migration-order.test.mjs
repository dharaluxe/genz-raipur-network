import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);

test('timestamped Supabase migration versions are unique and dependency order is deterministic', async () => {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  const timestampVersions = new Map();

  for (const file of files) {
    const match = file.match(/^(\d+)_/);
    assert.ok(match, `Migration filename must start with a numeric version: ${file}`);
    const version = match[1];

    // Early GENZ migrations used a YYYYMMDD (8-digit) prefix and some of those
    // legacy files intentionally share that historical date prefix. Do not
    // rewrite already-shipped history. Newer migrations use a 14-digit
    // timestamp version; those must be globally unique to keep release order
    // deterministic and avoid the duplicate-version bug caught in PR #13.
    assert.ok(version.length === 8 || version.length === 14, `Unsupported migration version format ${version}: ${file}`);
    if (version.length === 14) {
      assert.ok(!timestampVersions.has(version), `Duplicate Supabase migration version ${version}: ${timestampVersions.get(version)} and ${file}`);
      timestampVersions.set(version, file);
    }
  }

  const notificationsFile = '20260930049000_genz_notifications_followups_foundation.sql';
  const adminFile = '20260930050000_genz_phase_3_0_admin_dispute_control_foundation.sql';
  assert.ok(files.includes(notificationsFile), 'Notifications migration missing');
  assert.ok(files.includes(adminFile), 'Admin/Dispute migration missing');

  const notificationsVersion = BigInt(notificationsFile.split('_', 1)[0]);
  const adminVersion = BigInt(adminFile.split('_', 1)[0]);
  assert.ok(notificationsVersion < adminVersion, 'Notifications must migrate before Admin/Dispute because admin cases emit notifications');
});
