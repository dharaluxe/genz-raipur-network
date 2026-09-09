# GENZ migration operations

The user authorized reuse of the existing `construction` Supabase project and an already-connected hosting alternative to Cloudflare. ChatGPT Sites is the selected host; no paid hosting upgrade was purchased.

## Target configuration

- GitHub: `dharaluxe/genz-raipur-network` (public source repository created by the owner).
- Supabase: existing `construction` project, with seven GENZ tables in the private `genz` schema. Existing construction tables are retained separately in `public`.
- Hosting, dispatch authentication, and original evidence storage: existing GENZ ChatGPT Site.
- Database access: authenticated HTTPS Edge Function, exact query allowlist, parameterized queries, restricted role, serializable transactions.
- Runtime secrets and owner email: encrypted hosting settings, outside GitHub.

## Source preservation and import

Original D1 data is retained as the pre-cutover copy. Original R2 document bytes stay in the same private bucket; there is no file-byte migration to Supabase Storage in this configuration. Imported rows preserve IDs, member identities, agreement revisions, payment history, audit timestamps and existing invitation hashes because the Site identity and entry URL are unchanged.

Initial source snapshot: one member, one setting, six records, three file metadata rows, twenty audits and two invites. Import is transactional into empty GENZ tables. Compare all source rows against the target and re-read the old source around cutover to detect concurrent edits. Do not permit both databases to remain active writers.

## Provisioning

Apply `db/postgres-bootstrap.sql` then `db/postgres-security.sql`. The `genz_app` role has no login and no privilege to change database structure. PostgreSQL 16+ requires explicit `SET TRUE` membership for the Edge Function's built-in database role to assume it. Do not expose `genz` through the Data API.

Run `scripts/prepare-database-bridge.mjs`, generate a random 256-bit key, and replace only `__GENZ_KEY_SHA256__` in the deployed function source with its SHA-256 digest. Store the plaintext in the hosting secret `GENZ_DATABASE_KEY`. The function implements its own bearer-key authentication; platform JWT verification is disabled for this machine-to-machine endpoint. Unknown SQL templates are rejected before opening a database connection.

Set `GENZ_DATABASE_ENDPOINT`, `GENZ_AUTH_PROVIDER=sites`, `GENZ_STORAGE_PROVIDER=sites`, and the actual `GENZ_OWNER_EMAIL`. Keep `GENZ_LAUNCH_ENABLED=false` and `GENZ_PUBLIC_VERIFICATION=false` for owner-private staging. Keep the existing Site audience.

## Verification and rollback

Check schema and imported row equality, query the live authenticated Edge Function, verify anonymous and unlisted-query rejection, and run the PostgreSQL API workflow suite. Verify the build before publishing the exact pushed source. A successful hosting deployment alone does not establish multi-user launch acceptance.

Before reverting to the old D1-based publication, stop writes and export any new Supabase records. Reconcile them into D1 or repair the new deployment instead. Blind rollback after new writes would lose visible changes. Keep both the original source version and D1 copy until recovery has been rehearsed.

The inherited construction schema has separate legacy security-advisor findings; this migration does not claim to have audited or repaired that application. Its tables are not accessible through the GENZ query allowlist. GENZ's own schema should have RLS enabled and no direct anon/authenticated privileges.

Free-tier quotas and inactivity behavior still apply. No unlimited availability, independent security certification, legal review, automated backups, real external email delivery, or nationwide production readiness is claimed.
