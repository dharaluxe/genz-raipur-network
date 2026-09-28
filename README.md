# GENZ Network

GENZ Network is a broker-first real-estate collaboration system for protected buyer introductions, master properties, broker-to-broker deals, visit proof and evidence-based reputation across India.

## V2 shared beta

The V2 rebuild replaces the original monolithic pilot with separate Dashboard, Requirements, Properties, Broker Network and Deal Room modules.

The current live beta includes:

- Supabase email/password authentication for broker accounts
- shared multi-user PostgreSQL persistence instead of browser-local records
- buyer requirement registration with network-wide phone/source protection
- server-side HMAC phone fingerprinting with a database-private pepper
- 30-day buyer source-protection window
- masked buyer identity on network-visible requirement cards
- source-broker-only access to full buyer identity under Row Level Security (RLS)
- shared master property registration and duplicate checks
- listing-broker-only private owner identity vault under RLS
- explainable buyer-to-property matching by type, locality, budget and size
- broker directory with activity-based Trust Score inputs
- deal rooms restricted at database level to the buyer-side and listing-side brokers
- proof timeline, collaboration acceptance, visit verification, offers and closure states
- Realtime refresh for shared profiles, requirements, properties, deals and deal events
- nationwide market coverage rather than a Raipur-only access restriction

### Security boundary

All GENZ V2 network tables have RLS enabled. Anonymous clients have no direct table read access. Public network records contain only deliberately shareable fields; full buyer phone and owner identity are stored separately and are visible only to their authorized broker. Deal-room participant identities are bound by database policy to the requirement source broker and property listing broker.

The browser uses only the Supabase publishable client key. No service-role key or database-private phone pepper is exposed to the client.

## Quality gates

GitHub Actions runs `npm ci`, a Next.js production build and the V2 domain test suites for buyer identity/source claims, property matching and Trust Score. Vercel production deployment is connected to `main`.

## Open-source reuse

Only permissively licensed source patterns are adapted. See `docs/OSS_FEATURE_MAP.md` and `THIRD_PARTY_NOTICES.md`. Proprietary or no-license commercial source is not copied.
