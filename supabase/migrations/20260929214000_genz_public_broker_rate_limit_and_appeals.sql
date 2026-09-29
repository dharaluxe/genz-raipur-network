create table if not exists public.genz_public_broker_lookup_rate_limits (
  request_fingerprint text not null,
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  updated_at timestamptz not null default now(),
  primary key (request_fingerprint, window_start)
);
alter table public.genz_public_broker_lookup_rate_limits enable row level security;
revoke all on public.genz_public_broker_lookup_rate_limits from anon, authenticated;
drop policy if exists "no direct client reads public broker lookup limits" on public.genz_public_broker_lookup_rate_limits;
create policy "no direct client reads public broker lookup limits"
on public.genz_public_broker_lookup_rate_limits
for select to anon, authenticated
using (false);
create index if not exists genz_public_broker_lookup_rate_limits_updated_idx
on public.genz_public_broker_lookup_rate_limits(updated_at);

create table if not exists public.genz_broker_status_appeals (
  id uuid primary key default gen_random_uuid(),
  broker_user_id uuid not null references public.genz_profiles(id) on delete cascade,
  appealed_status text not null check (appealed_status in ('suspended','removed')),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  admin_note text null,
  submitted_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by uuid null references public.genz_profiles(id) on delete set null,
  constraint genz_broker_status_appeals_reason_len check (char_length(reason) between 20 and 2000),
  constraint genz_broker_status_appeals_admin_note_len check (admin_note is null or char_length(admin_note) <= 2000)
);
alter table public.genz_broker_status_appeals enable row level security;
revoke all on public.genz_broker_status_appeals from anon, authenticated;
drop policy if exists "no direct client reads broker status appeals" on public.genz_broker_status_appeals;
create policy "no direct client reads broker status appeals"
on public.genz_broker_status_appeals
for select to anon, authenticated
using (false);
create unique index if not exists genz_broker_status_appeals_one_pending_idx
on public.genz_broker_status_appeals(broker_user_id)
where status='pending';
create index if not exists genz_broker_status_appeals_broker_submitted_idx
on public.genz_broker_status_appeals(broker_user_id, submitted_at desc);
create index if not exists genz_broker_status_appeals_resolved_by_idx
on public.genz_broker_status_appeals(resolved_by);

create or replace function public.genz_public_broker_lookup(p_broker_code text)
returns table (
  broker_code text, display_name text, firm text, cities text[], specialties text[], verified boolean,
  rating numeric, review_count integer, completed_deals integer, successful_collaborations integer,
  verified_visits integer, owner_confirmed_listings integer, member_since timestamptz, avatar_url text,
  account_status text, public_status_note text, status_effective_at timestamptz,
  trust_score integer, trust_confidence text
)
language plpgsql volatile security definer set search_path=public,extensions,pg_temp as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_ip text := 'unknown';
  v_agent text := '';
  v_fingerprint text;
  v_window timestamptz := date_trunc('minute', clock_timestamp());
  v_hits integer;
begin
  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true),'')::jsonb, '{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_ip := trim(split_part(coalesce(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip', v_headers->>'cf-connecting-ip', 'unknown'), ',', 1));
  v_agent := left(coalesce(v_headers->>'user-agent',''), 180);
  v_fingerprint := encode(extensions.digest(v_ip || '|' || v_agent || '|genz-public-broker-lookup-v1','sha256'),'hex');

  insert into public.genz_public_broker_lookup_rate_limits(request_fingerprint,window_start,hits,updated_at)
  values(v_fingerprint,v_window,1,clock_timestamp())
  on conflict(request_fingerprint,window_start)
  do update set hits=public.genz_public_broker_lookup_rate_limits.hits+1,updated_at=clock_timestamp()
  returning hits into v_hits;

  delete from public.genz_public_broker_lookup_rate_limits
  where request_fingerprint=v_fingerprint and updated_at < clock_timestamp()-interval '2 hours';

  if v_hits > 30 then
    raise exception 'GENZ_PUBLIC_LOOKUP_RATE_LIMIT';
  end if;

  return query
  with matched as (
    select p.*, pp.avatar_url, pp.account_status, pp.public_status_note, pp.status_effective_at,
      case when p.verified then 10.0 else 0.0 end + least(greatest(coalesce(p.owner_confirmed_listings,0),0),5)::numeric as verification_points,
      least(greatest(coalesce(p.completed_deals,0),0),10)::numeric*2.0 as deal_points,
      least(greatest(coalesce(p.successful_collaborations,0),0),10)::numeric*2.0 as collaboration_points,
      least(greatest(coalesce(p.verified_visits,0),0),20)::numeric*0.5 as visit_points,
      case when coalesce(p.collaboration_requests,0)>0 then least(greatest(coalesce(p.collaboration_responses,0),0),p.collaboration_requests)::numeric/p.collaboration_requests::numeric*10.0 else 0.0 end as response_points,
      case when coalesce(p.review_count,0)>0 then (((coalesce(p.rating,0)::numeric*p.review_count::numeric)+20.0)/(p.review_count::numeric+5.0))/5.0*10.0 else 0.0 end as feedback_points,
      15.0-least(15.0,greatest(coalesce(p.unresolved_disputes,0),0)::numeric*2.0) as integrity_points
    from public.genz_profiles p join public.genz_broker_public_profiles pp on pp.broker_user_id=p.id
    where upper(p.broker_code)=upper(trim(p_broker_code)) and trim(p_broker_code) ~* '^BR-[A-Z0-9]{8}$' limit 1
  ), scored as (
    select *, round(greatest(0.0,least(100.0,verification_points+deal_points+collaboration_points+visit_points+response_points+feedback_points+integrity_points)))::integer as computed_trust_score,
      case
        when (greatest(coalesce(completed_deals,0),0)+greatest(coalesce(successful_collaborations,0),0)+greatest(coalesce(verified_visits,0),0)+least(5,greatest(coalesce(owner_confirmed_listings,0),0)))>=20 or coalesce(completed_deals,0)>=5 then 'established'
        when (greatest(coalesce(completed_deals,0),0)+greatest(coalesce(successful_collaborations,0),0)+greatest(coalesce(verified_visits,0),0)+least(5,greatest(coalesce(owner_confirmed_listings,0),0)))>=5 or coalesce(completed_deals,0)>=1 then 'developing'
        else 'new' end as computed_confidence
    from matched
  )
  select scored.broker_code,scored.display_name,scored.firm,scored.cities,scored.specialties,scored.verified,scored.rating,scored.review_count,scored.completed_deals,scored.successful_collaborations,scored.verified_visits,scored.owner_confirmed_listings,
    scored.created_at,scored.avatar_url,scored.account_status,scored.public_status_note,scored.status_effective_at,scored.computed_trust_score,scored.computed_confidence
  from scored;
end; $$;
revoke all on function public.genz_public_broker_lookup(text) from public;
grant execute on function public.genz_public_broker_lookup(text) to anon,authenticated;

create or replace function public.genz_submit_broker_status_appeal(p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_uid uuid:=auth.uid();
  v_status text;
  v_reason text:=trim(coalesce(p_reason,''));
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.genz_profiles where id=v_uid) then raise exception 'GENZ broker profile required'; end if;
  select account_status into v_status from public.genz_broker_public_profiles where broker_user_id=v_uid;
  if v_status not in ('suspended','removed') then raise exception 'Appeals are available only for suspended or removed broker accounts'; end if;
  if char_length(v_reason)<20 or char_length(v_reason)>2000 then raise exception 'Appeal reason must be between 20 and 2000 characters'; end if;
  if exists(select 1 from public.genz_broker_status_appeals where broker_user_id=v_uid and status='pending') then raise exception 'A pending appeal already exists'; end if;
  insert into public.genz_broker_status_appeals(broker_user_id,appealed_status,reason)
  values(v_uid,v_status,v_reason) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.genz_submit_broker_status_appeal(text) from public,anon;
grant execute on function public.genz_submit_broker_status_appeal(text) to authenticated;

create or replace function public.genz_list_my_broker_status_appeals()
returns table(id uuid,appealed_status text,reason text,status text,admin_note text,submitted_at timestamptz,resolved_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  return query select a.id,a.appealed_status,a.reason,a.status,a.admin_note,a.submitted_at,a.resolved_at
  from public.genz_broker_status_appeals a where a.broker_user_id=auth.uid() order by a.submitted_at desc;
end; $$;
revoke all on function public.genz_list_my_broker_status_appeals() from public,anon;
grant execute on function public.genz_list_my_broker_status_appeals() to authenticated;

create or replace function public.genz_admin_list_broker_status_appeals()
returns table(id uuid,broker_code text,display_name text,firm text,appealed_status text,reason text,status text,admin_note text,submitted_at timestamptz,resolved_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not public.genz_is_admin() then raise exception 'GENZ admin access required'; end if;
  return query select a.id,p.broker_code,p.display_name,p.firm,a.appealed_status,a.reason,a.status,a.admin_note,a.submitted_at,a.resolved_at
  from public.genz_broker_status_appeals a join public.genz_profiles p on p.id=a.broker_user_id
  order by case when a.status='pending' then 0 else 1 end,a.submitted_at desc;
end; $$;
revoke all on function public.genz_admin_list_broker_status_appeals() from public,anon;
grant execute on function public.genz_admin_list_broker_status_appeals() to authenticated;

create or replace function public.genz_admin_resolve_broker_status_appeal(p_appeal_id uuid,p_decision text,p_admin_note text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid();
  v_broker uuid;
  v_note text:=nullif(trim(coalesce(p_admin_note,'')),'');
begin
  if v_actor is null or not public.genz_is_admin() then raise exception 'GENZ admin access required'; end if;
  if p_decision not in ('accepted','rejected') then raise exception 'Decision must be accepted or rejected'; end if;
  if v_note is not null and char_length(v_note)>2000 then raise exception 'Admin note is too long'; end if;
  select broker_user_id into v_broker from public.genz_broker_status_appeals where id=p_appeal_id and status='pending' for update;
  if v_broker is null then raise exception 'Pending appeal not found'; end if;

  update public.genz_broker_status_appeals
  set status=p_decision,admin_note=v_note,resolved_at=now(),resolved_by=v_actor
  where id=p_appeal_id;

  if p_decision='accepted' then
    update public.genz_broker_public_profiles
    set account_status='active',public_status_note=null,status_effective_at=now(),status_updated_by=v_actor,updated_at=now()
    where broker_user_id=v_broker;
    insert into public.genz_broker_status_events(broker_user_id,account_status,public_note,actor_user_id)
    values(v_broker,'active','Account restored after appeal review.',v_actor);
  end if;
end; $$;
revoke all on function public.genz_admin_resolve_broker_status_appeal(uuid,text,text) from public,anon;
grant execute on function public.genz_admin_resolve_broker_status_appeal(uuid,text,text) to authenticated;
