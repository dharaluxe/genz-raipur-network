# GENZ Network v2 architecture

## Product goal

GENZ is not a generic CRM or listing portal. The core product is a trusted transaction network for independent brokers where demand, inventory, introductions, visits and collaboration claims are attributable without exposing customer data unnecessarily.

## Core product loop

1. Verified broker joins.
2. Broker registers a buyer requirement or a property.
3. GENZ checks duplicates and protects the original valid source claim.
4. Matching engine finds relevant properties/requirements and relevant brokers.
5. Brokers enter a structured collaboration/deal room.
6. Site visit is scheduled and verified.
7. Offers, mandate changes and collaboration terms are recorded.
8. Deal closes or records a loss reason.
9. Verified events update broker performance metrics, ratings and Trust Score.

## Domain modules

### 1. Identity and membership
- broker onboarding/invite
- KYC/verification status
- firm/team membership
- specialties, service areas and languages
- public profile vs private identity fields

### 2. Buyer passport
- canonical phone normalization
- server-side privacy-safe network fingerprint
- broker-specific customer relationship record
- first-source claim and protection window
- active/inactive/expired requirement state
- source-claim dispute and evidence timeline
- no raw phone disclosure to unrelated brokers

### 3. Requirement exchange
- property type
- target cities/localities
- budget range
- min/max size
- financing/timeline/preferences
- visibility: network / selected brokers / team-only
- matching-property proposals
- freshness/expiry and renewal

### 4. Property passport
- master property ID
- canonical location/address identifiers
- owner and mandate version history
- multiple authorized brokers without duplicating the property itself
- photos/docs/evidence
- asking price and mandate history
- listing status and availability refresh

### 5. Matching engine
- deterministic rule eligibility first
- explainable relevance score second
- geography, type, budget, size and preference factors
- requirement-to-property and property-to-requirement matching
- broker recommendation based on specialization and verified activity

### 6. Opportunity feed
- requirement opportunities
- property opportunities
- builder/project opportunities later
- relevance-ranked, not pay-to-win
- broker can respond with a property/requirement instead of an unstructured message

### 7. Deal room
- participants and roles
- structured collaboration agreement
- in-room messages
- property/requirement attachments
- visit proposals
- offer/counter-offer timeline
- commission split acknowledgment
- immutable material-event audit trail

### 8. Visit proof
- visit proposal + approve/reschedule/decline
- OTP verification
- optional QR
- optional GPS evidence with explicit permission
- proof event belongs to the deal timeline

### 9. Reputation
- public star rating from eligible verified interactions
- objective Trust Score calculated from verified platform events
- response rate, verified visits, successful collaborations and closed deals
- dispute/duplicate-claim penalties only after structured records exist
- confidence label for new brokers so a new account is not falsely compared with an established broker

### 10. Builder console (phase after core liquidity)
- builder/project profile
- inventory and project updates
- brokerage rules
- aggregate demand matching
- invite matching brokers without raw buyer database access
- direct-lead duplicate/source checks when CRM integration exists

## Privacy model

- Raw buyer phone/email is visible only to the broker/customer relationship and authorized deal participants.
- Network dedupe uses a keyed server-side fingerprint, not a public unsalted phone hash.
- Opportunity feeds show requirement summaries, not customer identity.
- Contact release must be an explicit collaboration/permission event.
- GPS is optional evidence and is not stored unless the user intentionally submits it for a visit.
- Public reputation never publishes complaint allegations or personal customer data.

## Event model

Material events should be append-only audit entries:

- buyer.registered
- buyer.requirement_updated
- buyer.claim_created
- buyer.claim_renewed
- buyer.claim_disputed
- property.created
- property.owner_confirmed
- property.mandate_updated
- collaboration.requested
- collaboration.accepted
- visit.proposed
- visit.verified
- offer.created
- offer.countered
- agreement.amended
- deal.closed
- deal.lost
- review.submitted
- dispute.resolved

Editable records hold the current state; audit events preserve how that state was reached.

## Delivery order

### Foundation
1. universal buyer fingerprint + privacy-safe duplicate check
2. broker profile/specialties + rating/review schema
3. property master/dedupe
4. requirement visibility and opportunity feed

### Network transaction flow
5. matching v2
6. structured deal room
7. visit OTP/QR proof
8. proof timeline
9. Trust Score aggregation

### Expansion
10. saved searches/watchlists/alerts
11. broker directory and badges/leaderboard
12. builder/project console
13. CRM/API integrations

## Compatibility rule

Do not replace the existing GENZ transaction/mandate/audit code wholesale. New V2 modules must be introduced behind migrations and feature flags, with existing pilot records preserved and rollback documented.
