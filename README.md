# GENZ Network

GENZ Network is a broker-first real-estate collaboration system for protected buyer introductions, master properties, broker-to-broker deals, visit proof and evidence-based reputation across India.

## V2 live beta

The V2 rebuild replaces the original monolithic pilot with separate Dashboard, Requirements, Properties, Broker Network and Deal Room modules.

The current live beta includes:

- buyer requirement registration with duplicate phone/source protection checks
- 30-day protection window in the beta workflow
- masked buyer identity in network cards
- master property registration and duplicate checks
- explainable buyer-to-property matching by type, locality, budget and size
- broker directory with objective Trust Score calculation
- deal-room creation, collaboration acceptance, visit verification, offers and proof timeline
- nationwide market coverage rather than a Raipur-only access restriction
- synthetic sample data only; no sample person is represented as a real verified broker

### Persistence boundary

The interactive V2 beta currently persists beta records in the user's browser while the shared authenticated Supabase V2 data model is cut over. This is deliberate: an unfinished shared database must not expose buyer PII or create false network-wide source claims. The UI explicitly labels this boundary.

Production multi-user persistence requires authenticated broker accounts, server-side HMAC buyer dedupe, typed V2 tables and permission-scoped reveal rules. Those should be treated as the next backend release, not as already-live functionality.

## Quality gates

GitHub Actions runs `npm ci`, a Next.js production build and the V2 domain test suites for buyer identity/source claims, property matching and Trust Score before production changes are merged.

## Open-source reuse

Only permissively licensed source patterns are adapted. See `docs/OSS_FEATURE_MAP.md` and `THIRD_PARTY_NOTICES.md`. Proprietary or no-license commercial source is not copied.
