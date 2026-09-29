drop policy if exists "properties visible to network members" on public.genz_properties;
create policy "property managers read full property rows" on public.genz_properties
for select to authenticated
using (
  (select auth.uid()) = listing_user_id
  or public.genz_is_admin()
);

drop policy if exists "members read builder projects" on public.genz_builder_projects;
drop policy if exists "builder members read own projects" on public.genz_builder_projects;
create policy "builder team reads full project rows" on public.genz_builder_projects
for select to authenticated
using (
  public.genz_is_admin()
  or public.genz_is_builder_member(builder_id)
);

-- Full-row property/project tables are source-manager only.
-- Recipient brokers must use Phase 2.5 controlled share grants and reveal RPCs
-- for price, exact location, owner contact and private media.
