# GENZ Network v2 — Open-source feature intake map

This document tracks external open-source projects that may be used as implementation sources or behavioral references for GENZ. No code is copied until its license and the exact source file are recorded here.

## Reuse rules

1. **Direct port** only from permissive licenses (MIT, Apache-2.0, Boost-1.0 or similarly approved licenses).
2. Keep required copyright/license notices for copied or substantially derived code.
3. For Apache-2.0 sources, mark modified files and preserve NOTICE/attribution requirements where applicable.
4. **Reference-only / clean-room reimplementation** when the source stack is incompatible or the license is copyleft/restrictive/unclear.
5. Never use leaked/proprietary source from REBAX, PartnerOS, Sell.Do, BrokerBay, RESAAS, Propy or any other closed product.
6. Do not copy branding, trademarks, proprietary datasets, screenshots, or protected text/content.

## Approved source candidates

| Source | License | Stack fit | GENZ features to use | Intake mode |
|---|---|---|---|---|
| `InsulaCRM/InsulaCRM` | MIT | Different backend (Laravel), concepts highly relevant | buyer/property matching, address normalization and dedupe, global search, activity timeline, tags, lead distribution/claiming, team analytics | Clean-room TypeScript implementation; port algorithms only where practical |
| `MoveHome/MoveHome.Org` | Apache-2.0 | Excellent: Next.js + Supabase | property search/listing UX, filter patterns, property cards, map/search patterns, Supabase read models | Direct-port candidate after file-by-file review and attribution |
| `ezanelato/PartnerHub` | Boost-1.0 | Good: React + TS + Supabase | partner/broker profiles, referral Kanban, partner KPIs, leaderboard/ranking patterns, referral links | Direct-port/adapt React logic to Next.js |
| `radcrew/real-estate-consultant` | MIT | Good: Next.js + Supabase frontend | fit-based property ranking, saved searches, watchlists, normalized listing intake, draft outreach workflow | Direct-port frontend utilities where compatible; clean-room backend adaptation |
| `supabase/supabase` examples | Apache-2.0 | Native platform dependency | OTP/auth patterns, Realtime, Storage, RLS/authorization examples, Postgres patterns | Prefer official SDK/API patterns; copy example code only with attribution when substantial |

## Feature-by-feature plan

### Broker network
- Broker directory and broker profile — GENZ-native domain model.
- Referral pipeline and broker KPIs — adapt PartnerHub patterns.
- Public rating + private/system Trust Score — GENZ-native scoring; no subjective admin-only score.
- Badges/leaderboard — adapt PartnerHub patterns; objective metrics only.

### Buyer registry
- Universal buyer identity using normalized phone + server-side HMAC/hash.
- Network duplicate detection without revealing raw phone/name to unrelated brokers.
- First-source claim, protection timer, renewal rules and dispute evidence.
- Requirement history and expiry/refresh.
- Matching model inspired by InsulaCRM preference matching, implemented in TypeScript/Postgres.

### Property registry
- Master Property ID and duplicate detection using normalized address/location identifiers.
- Multiple authorized listing brokers on one master property.
- Owner mandate and confirmation history.
- Search/filter/listing UX can reuse MoveHome components after license/file review.

### Opportunity exchange
- Requirement feed: buyer requirement -> relevant broker network.
- Property feed: listing -> matching buyer requirements.
- Open / selected-brokers / team-only visibility.
- Accept/decline collaboration and referral lifecycle based on PartnerHub-style pipeline patterns.

### Deal room
- Structured events: property shared, requirement shared, collaboration accepted, visit proposed, visit verified, offer, counter-offer, split agreement, closed/lost.
- Realtime messages/notifications use Supabase Realtime patterns.
- All material deal events also write immutable audit entries.

### Visits
- OTP confirmation as primary proof.
- Optional QR check-in and optional GPS evidence with explicit user permission.
- Owner/listing-broker approve/reschedule/decline workflow.
- Never make GPS mandatory when OTP or another valid proof method is available.

### Search and matching
- Universal search across brokers, requirements, properties, builders/projects and deals.
- Rule-based deterministic matching first: geography, property type, budget, size, freshness.
- Optional explainable fit score inspired by InsulaCRM and real-estate-consultant.
- Saved searches/watchlists adapted from real-estate-consultant patterns.

### Builder layer (after broker network core)
- Builder/project profile, project inventory, brokerage rules, project updates.
- Match project to aggregate buyer demand without exposing raw buyer PII.
- Builder can invite matching brokers; contact release follows attribution/permission rules.

## Features to build natively instead of copy

These are core GENZ differentiation and should remain GENZ-owned domain logic:

- universal buyer passport and privacy-safe duplicate check
- first-source claim protection and renewal
- cross-broker property master/dedupe
- proof-of-introduction timeline
- broker-to-broker collaboration agreement
- commission split acknowledgement
- objective Trust Score
- cross-city requirement exchange
- builder-to-network demand matching
- customer data visibility/consent policy

## Repositories not approved for code intake yet

Any repository without an explicit license is **reference-only until clarified**. AGPL/GPL/SSPL/BSL-business-source or other restrictive/copyleft projects must not be merged into the proprietary GENZ codebase without a deliberate licensing decision.

## Attribution process

When a source file is directly ported:

1. Add an entry to `THIRD_PARTY_NOTICES.md`.
2. Add a short source/attribution comment in the derived file when appropriate.
3. Record original repository, original path, original commit SHA, license and GENZ modifications.
4. Keep the copied portion minimal; prefer using maintained upstream packages/APIs over vendoring code.
