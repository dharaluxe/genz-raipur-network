-- Explicit deny policy documents the RPC-only boundary and keeps RLS advisory clean.
create policy "access requests deny direct client access"
on public.genz_listing_access_requests
for all to anon,authenticated
using (false)
with check (false);

create index if not exists genz_listing_access_requests_grant_idx
  on public.genz_listing_access_requests(approved_grant_id)
  where approved_grant_id is not null;
