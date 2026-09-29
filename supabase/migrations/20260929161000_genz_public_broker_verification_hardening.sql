create index if not exists genz_broker_public_profiles_status_updated_by_idx
on public.genz_broker_public_profiles(status_updated_by);

create index if not exists genz_broker_status_events_actor_idx
on public.genz_broker_status_events(actor_user_id);

drop policy if exists "no direct client reads public broker profiles" on public.genz_broker_public_profiles;
create policy "no direct client reads public broker profiles"
on public.genz_broker_public_profiles
for select to anon, authenticated
using (false);

drop policy if exists "no direct client reads broker status events" on public.genz_broker_status_events;
create policy "no direct client reads broker status events"
on public.genz_broker_status_events
for select to anon, authenticated
using (false);
