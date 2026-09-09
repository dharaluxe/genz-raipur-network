# GENZ Raipur private pilot

This implementation is a private, durable broker operations pilot. It has no paid external integrations. The hosting platform's quotas and account entitlements still apply.

## First use

The owner opens the owner-only Site and uses Set up workspace. The initial account becomes the administrator. Keep the Site owner-only until this step is complete. An administrator is not independently identity-verified just by creating the workspace.

After setup, create email-bound invitations for trusted brokers. The Site access policy must separately permit those visitors before the invitation can be used. Signing in identifies a ChatGPT account; it does not by itself grant broker membership. Invitation acceptance requires the same email, an unused code and an unexpired invitation. Pending members require administrator review.

## Supported workflow

Property submission → private evidence upload → manual admin activation → private buyer requirement → matching → co-broke request → listing broker acceptance → recorded visit and manual evidence acknowledgment → offers → matching closing confirmations → payment records and admin review → verified-deal broker feedback.

Payments are recorded against a deal. Cash is party-acknowledged rather than bank-verified. Property cash records cannot be cleared in this pilot. For mixed payments, use separate entries for the actual modes. Recorded brokerage is distinct from co-broker transfers and property consideration; do not sum all payment modes and purposes as earned commission.

## Access and evidence

Customer contacts are visible only to their originating broker and admin. Owner contact, exact address, net price and owner evidence stay with the listing broker and admin. Co-broker deal participants share deal evidence. Financial values and permission checks are validated on the server. Identity changes reset a broker's verification. Evidence cannot be replaced in finalized records. There is no audit edit/delete endpoint.

## Deliberate limits

- Private access by default; no anonymous customer-facing deployment yet.
- ChatGPT identity, not SMS OTP or independent KYC. No eSign or liveness integration.
- No imported real listings, fabricated users, reviews or trust scores.
- Protection days are explicitly proposed per deal, accepted by the listing broker and dated from a manually acknowledged visit. This is not a claim of legal enforceability. The unresolved network-wide 30-day policy is not silently imposed.
- Duplicate customer/property introductions are blocked and require manual admin investigation. An automated reassignment/release workflow is not implemented.
- Broker feedback is attributed to deal participants, not labelled as customer feedback. Owner ratings and an aggregate trust-score formula are not implemented.
- No QR payee has been configured; the app never collects or holds property money.
- No automated registry checks, legal review, bank reconciliation, contractual fee enforcement, certified immutable audit vault or automatic backups. Printable agreement/payment records support browser Save as PDF; these are not eSigned contracts or tax invoices.
- Snapshot screens stop at 2,000 records rather than showing incomplete financial totals. Member lists cap at 1,000 and admin audit screens show the latest 150 entries. Admin export includes up to 10,000 records and document metadata, not document bytes. Restore has not been tested.
- A solo-broker legacy closing has no bilateral amendment counterpart; do not use it to test the two-broker correction process.
- PWA manifest and responsive interface provided; no offline caching of private records.

## Verification

Run `node --test tests/network-api.test.mjs tests/brokerage.test.mjs` for isolated SQLite/R2-mock API tests and exact financial calculations. These exercise membership/invitation rules, privacy, duplicate introductions, evidence, payments, bilateral amendments, stale revisions, mismatch holds, refunds and closing. This does not substitute for live multi-user acceptance testing or an independent security review.

## Brokerage correction rules

- Choose fixed amount, percentage of final price, or final price minus approved owner net; store fee payer, due date and broker split in each accepted version.
- Existing fixed-fee deals remain fixed. Asking-price calculations are estimates. Final entitlements require matching broker declarations for the same agreement version.
- Below-net closings and conflicting prices remain on settlement hold. An accepted closing cannot be silently changed.
- Amendments require the other broker's acceptance, retain the previous terms/closing and actual payments, and require fresh evidence and closing declarations. Rejection keeps current terms.
- Brokerage credits the named receiving broker. Co-broker transfers move that credit without counting new revenue. Refunds link to finalized original records and cannot cumulatively exceed them. Legacy unallocated payments hold reconciliation.
- Visit protection duration is snapshotted when the visit is recorded; a later commission amendment does not silently rewrite it.
- Admin launch checklist, printable records, sensitive-data export and request throttling are available. No external access, paid integration, bank recipient or automatic backup is enabled by this release.

## Before inviting a live pilot

Owner must approve the Site audience, invite named brokers, review operational agreements and privacy/retention/contact details, verify payment recipients, and run a two-account real-world acceptance walkthrough with non-sensitive sample records. Test data export and document recovery, confirm platform quotas, and arrange an independent security review before broader launch.
