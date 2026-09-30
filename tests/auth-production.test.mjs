import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const route=readFileSync(new URL('../app/api/auth/route.ts',import.meta.url),'utf8');
const auth=readFileSync(new URL('../lib/auth.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20260930094500_genz_login_rate_limit_rpc.sql',import.meta.url),'utf8');

test('broker auth is Supabase-native and does not require the legacy database bridge',()=>{
  assert.doesNotMatch(route,/limitRequests|GENZ_DATABASE_ENDPOINT|GENZ_DATABASE_KEY|SELECT id FROM members|SELECT id FROM invites/);
  assert.match(route,/genz_check_login_rate_limit/);
  assert.match(route,/genz_validate_invite/);
  assert.match(route,/genz_redeem_invite/);
});

test('server auth accepts the same production Supabase configuration as the browser client',()=>{
  assert.match(auth,/NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(auth,/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(auth,/zvftcwinvbnavvjfmugr\.supabase\.co/);
});

test('login limiter is callable without exposing direct rate-limit table reads',()=>{
  assert.match(migration,/security definer/i);
  assert.match(migration,/revoke all on function public\.genz_check_login_rate_limit\(text\) from public/i);
  assert.match(migration,/grant execute on function public\.genz_check_login_rate_limit\(text\) to anon, authenticated/i);
  assert.match(migration,/if v_hits > 10 then/i);
});
