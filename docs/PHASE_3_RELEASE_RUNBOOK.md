# GENZ Phase 3 release runbook

This runbook covers the combined release lineage in PR #13: Phase 2.6 → 2.7 → 2.8 → 2.9 → 3.0 → 3.1. The Contractor / Construction Lead module is intentionally excluded.

## 1. Hard stop: verify the runtime Supabase project

Before running **any** database migration, confirm the project ref from all three places:

1. Vercel `NEXT_PUBLIC_SUPABASE_URL` for the production environment.
2. The runtime URL used by `lib/supabase-network-client.ts`.
3. The Supabase management connection selected for migrations/advisors.

All three must refer to the same project.

The source currently has a fallback runtime URL for project ref `zvftcwinvbnavvjfmugr`. A management connection exposing only another project (for example `ccehcygsijayfpxmdfkk`) must **not** be used as a substitute. Stop the release until the actual runtime project is available.

Never infer that a project is correct from its display name alone.

## 2. Pin the exact release commit

Release only from `release/phase-3-integration` after PR #13 is green. Record the exact commit SHA before applying migrations. The deployed preview, CI run, migration audit and production merge must all refer to that same SHA.

Do not merge `main` while PR #13 is Draft.

## 3. Pre-migration backup and recovery readiness

Before production DDL:

- confirm a current database backup/recovery method appropriate to the Supabase plan;
- export or otherwise preserve critical GENZ business records if point-in-time recovery is not available;
- record current production deployment ID and Git SHA;
- record current migration history from the **runtime** Supabase project;
- confirm there are no unexpected failed/partial GENZ migrations;
- avoid running the release during active financial/closing operations;
- verify who can restore the database and who can roll Vercel back.

A Vercel rollback alone is not a database rollback.

## 4. Migration ordering

Migration filenames are the release ordering contract. CI runs `tests/migration-order.test.mjs` to reject duplicate 14-digit versions.

Relevant Phase 2.6–3.1 order:

```text
20260930002000  phase 2.6 privacy-safe discovery
20260930004500  phase 2.6 access requests
20260930005500  phase 2.6 access-request hardening
20260930013000  phase 2.7 Buyer Master foundation
20260930013500  phase 2.7 Buyer Master conflict fix
20260930014500  phase 2.7 requirement similarity / size
20260930015500  phase 2.7 Master Property foundation
20260930020500  phase 2.7 Master Property hardening
20260930021500  phase 2.7 atomic property creation
20260930022500  phase 2.7 budget-range discovery
20260930023500  phase 2.7 Master Property FK indexes
20260930040000  phase 2.8 Deal Room foundation
20260930041500  phase 2.8 negotiation actions
20260930043000  phase 2.8 security/index hardening
20260930044500  phase 2.8 participant management
20260930049000  phase 2.9 notifications/follow-ups
20260930050000  phase 3.0 Admin/Dispute foundation
20260930051000  phase 3.0 dispute evidence + SLA
20260930062000  phase 3.1 RLS init-plan hardening
20260930063000  phase 3.1 idempotent financial actions
20260930064000  phase 3.1 commission agreement ambiguity fix
20260930065000  phase 3.1 commission ledger concurrency fix
20260930070000  phase 3.1 idempotency cleanup-on-error
20260930071000  phase 3.1 ledger idempotency unique key
20260930072000  phase 3.1 duplicate ledger-index cleanup
20260930073000  phase 3.1 private Storage context hardening
20260930075000  phase 3.1 closing ambiguity fix
```

Notifications must precede Admin/Dispute because the admin-case trigger calls the notification emitter.

## 5. Staging / branch validation before production

On a Supabase development branch or other isolated environment that contains the correct predecessor schema:

1. apply the release migrations in filename order;
2. verify migration history has exactly one row/version per migration;
3. run Supabase security advisor;
4. run Supabase performance advisor;
5. run the controlled transaction smoke and roll it back;
6. verify storage policies for property, deal, closing and dispute evidence;
7. verify ordinary brokers cannot read Admin Control data or admin-only navigation;
8. verify two different buyer brokers can have separate Deal Rooms/offers for one property without cross-reading each other;
9. verify listing broker access remains scoped to its own property Deal Rooms;
10. verify retrying the same high-value request key does not create duplicate offers, commission agreements or manual ledger activity.

Do not use production customer PII as test fixtures.

## 6. Application release checks

For the exact release SHA:

- GitHub GENZ CI: success;
- Vercel preview: READY;
- root/public verification surfaces load;
- authenticated routes render correctly with a test member;
- ordinary broker direct access to `/admin-control` is denied;
- admin can open dispute evidence using short-lived signed URLs;
- response security headers are present;
- no new server/runtime error cluster appears during the smoke test.

## 7. Production migration

Only after sections 1–6 pass:

1. re-confirm the runtime project ref;
2. capture the pre-release migration history;
3. apply only migrations not already present;
4. do not manually mark unapplied migrations as complete;
5. re-read migration history and compare it with the release branch;
6. rerun security/performance advisors;
7. run read-only sanity checks before enabling real broker activity;
8. deploy/merge the exact tested application SHA;
9. run the smallest possible production smoke using approved non-sensitive test records.

## 8. Rollback decision

If the app deployment fails but database migrations are healthy and backward-compatible, roll Vercel back to the recorded previous deployment and keep writes restricted until compatibility is confirmed.

If a database migration is partially applied, produces incorrect authorization, or corrupts workflow state, stop writes first. Restore/reconcile the database using the pre-release recovery point rather than attempting ad-hoc destructive SQL.

Do not blindly run hand-written `DROP TABLE`, `DROP COLUMN`, policy deletion or data deletion commands as a rollback.

If production writes occurred after migration, database restoration can discard those writes. Reconcile them before restoring or choose a forward fix.

## 9. Post-release verification

After release:

- check GitHub/Vercel exact SHA alignment;
- inspect runtime errors;
- rerun Supabase security/performance advisors;
- verify invite-only membership and password reset;
- verify requirement/property dedupe and protected access;
- verify Deal Room offer isolation;
- verify commission closing/idempotency;
- verify disputes, evidence viewer and SLA ageing;
- verify ordinary brokers still cannot see Admin-only navigation;
- keep PR/release evidence with the final CI run, deployment ID and migration-history snapshot.

## 10. Current blocker policy

If the management connector cannot access the same Supabase project used by the runtime application, database release gates remain **not verified**. Code CI or a successful Vercel build does not replace live database validation.
