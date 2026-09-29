# GENZ Property Sharing Rooms

Phase 2.5 adds broker-specific controlled sharing for properties and builder projects.

## Permissions

A source manager can independently grant a recipient broker access to:
- price
- photos
- videos
- approximate location
- exact GPS location (property only)
- documents
- owner contact (property only)
- explicit download action

Each share may have an expiry and private note.

## Security model

- Media is stored in the private `genz-listing-media` bucket.
- Storage reads are checked against the active recipient grant through RLS.
- Sensitive price, exact GPS and owner-contact values are not returned in the initial recipient payload.
- The recipient must explicitly reveal those fields through a server-side RPC; each reveal writes an audit event.
- Opening a room, viewing media, revealing sensitive fields and using the download action are recorded in `genz_listing_access_events`.
- Source managers can revoke an active share immediately.
- Builder project sharing uses the existing privacy-safe matching-broker RPC; raw buyer identities are not exposed to builders.

## Product limitation

Preventing the in-app download action does not make viewable browser media impossible to copy or screen-capture. `allow_download` controls the GENZ download action; sensitive non-media data remains server-gated and audited.

## Privacy cutover still required before final release

Legacy property and map surfaces currently predate the grant model. Before Phase 2.5 is merged as final, direct network-wide reads of asking price and exact GPS must be removed from those legacy paths so the share grant becomes the authoritative reveal mechanism.
