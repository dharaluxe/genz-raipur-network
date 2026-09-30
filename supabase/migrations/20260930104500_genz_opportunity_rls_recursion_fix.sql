create or replace function public.genz_can_read_opportunity(p_opportunity_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  if not exists (select 1 from public.genz_profiles gp where gp.id = v_uid) then return false; end if;
  return exists (
    select 1
    from public.genz_opportunity_posts p
    where p.id = p_opportunity_id
      and (
        p.audience = 'network'
        or p.posted_by_user_id = v_uid
        or exists (select 1 from public.genz_profiles a where a.id = v_uid and a.is_admin)
        or exists (
          select 1 from public.genz_opportunity_recipients r
          where r.opportunity_id = p.id and r.broker_user_id = v_uid
        )
      )
  );
end;
$$;

create or replace function public.genz_can_read_opportunity_private_row(p_opportunity_id uuid, p_row_broker_user_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  if not exists (select 1 from public.genz_profiles gp where gp.id = v_uid) then return false; end if;
  if p_row_broker_user_id = v_uid then return true; end if;
  if exists (select 1 from public.genz_profiles a where a.id = v_uid and a.is_admin) then return true; end if;
  return exists (
    select 1
    from public.genz_opportunity_posts p
    where p.id = p_opportunity_id and p.posted_by_user_id = v_uid
  );
end;
$$;

revoke all on function public.genz_can_read_opportunity(uuid) from public;
revoke all on function public.genz_can_read_opportunity_private_row(uuid,uuid) from public;
grant execute on function public.genz_can_read_opportunity(uuid) to authenticated;
grant execute on function public.genz_can_read_opportunity_private_row(uuid,uuid) to authenticated;

drop policy if exists "members read visible opportunities" on public.genz_opportunity_posts;
create policy "members read visible opportunities"
on public.genz_opportunity_posts
for select
to authenticated
using (public.genz_can_read_opportunity(id));

drop policy if exists "participants read opportunity recipients" on public.genz_opportunity_recipients;
create policy "participants read opportunity recipients"
on public.genz_opportunity_recipients
for select
to authenticated
using (public.genz_can_read_opportunity_private_row(opportunity_id, broker_user_id));

drop policy if exists "participants read opportunity responses" on public.genz_opportunity_responses;
create policy "participants read opportunity responses"
on public.genz_opportunity_responses
for select
to authenticated
using (public.genz_can_read_opportunity_private_row(opportunity_id, broker_user_id));
