# Third-party notices

GENZ includes or adapts ideas/code from open-source projects only when the applicable license permits it. This file records substantial direct ports and algorithmic adaptations.

## InsulaCRM

- Repository: `InsulaCRM/InsulaCRM`
- License: MIT
- Copyright: 2024-2026 InsulaCRM (Mark Janssen)
- Source reviewed: `app/Services/BuyerMatchService.php`
- GENZ use: `lib/matching-v2.ts` adapts the explicit weighted-criteria matching pattern while changing the data model, eligibility gates, criteria, scoring weights, near-match tolerances, explanations and implementation language.

MIT License notice:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to inclusion of the copyright and permission notice.

See the upstream repository for the complete license text.

## radcrew/real-estate-consultant

- Repository: `radcrew/real-estate-consultant`
- License: MIT
- Copyright: 2026 Radcrew
- Source reviewed: `backend/app/domain/search_sql.py`
- GENZ use: `lib/matching-v2.ts` adapts the concept of separate explainable component scores blended into a total match score. GENZ uses different components/weights, TypeScript, India-oriented locality handling and deterministic near-match eligibility.

MIT License notice:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to inclusion of the copyright and permission notice.

See the upstream repository for the complete license text.

## Sources approved but not yet directly ported

The following repositories have been license-reviewed and may be used later. Their presence here does not mean their source code has already been copied into GENZ.

- `MoveHome/MoveHome.Org` — Apache-2.0 — candidate for property discovery/search UI patterns.
- `ezanelato/PartnerHub` — Boost Software License 1.0 — candidate for partner/referral KPI and leaderboard patterns.
- `supabase/supabase` — Apache-2.0 — official examples/patterns for Supabase platform features.
