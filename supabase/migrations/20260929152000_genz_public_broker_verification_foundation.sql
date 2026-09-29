create table if not exists public.genz_broker_public_profiles (
  broker_user_id uuid primary key references public.genz_profiles(id) on delete cascade,
  avatar_url text null,
  account_status text not null default 'active' check (account_status in ('active','under_review','suspended','removed')),
  public_status_note text null,
  status_effective_at timestamptz not null default now(),
  status_updated_by uuid null references public.genz_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint genz_broker_public_profiles_avatar_url_len check (avatar_url is null or char_length(avatar_url) <= 2048),
  constraint genz_broker_public_profiles_status_note_len check (public_status_note is null or char_length(public_status_note) <= 500)
);
alter table public.genz_broker_public_profiles enable row level security;
revoke all on public.genz_broker_public_profiles from anon, authenticated;
create index if not exists genz_broker_public_profiles_status_idx on public.genz_broker_public_profiles(account_status);

create table if not exists public.genz_broker_status_events (
  id uuid primary key default gen_random_uuid(),
  broker_user_id uuid not null references public.genz_profiles(id) on delete cascade,
  account_status text not null check (account_status in ('active','under_review','suspended','removed')),
  public_note text null,
  actor_user_id uuid not null references public.genz_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint genz_broker_status_events_note_len check (public_note is null or char_length(public_note) <= 500)
);
alter table public.genz_broker_status_events enable row level security;
revoke all on public.genz_broker_status_events from anon, authenticated;
create index if not exists genz_broker_status_events_broker_created_idx on public.genz_broker_status_events(broker_user_id, created_at desc);

insert into public.genz_broker_public_profiles (broker_user_id)
select id from public.genz_profiles
on conflict (broker_user_id) do nothing;

create or replace function public.genz_seed_public_broker_profile()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.genz_broker_public_profiles (broker_user_id) values (new.id)
  on conflict (broker_user_id) do nothing;
  return new;
end; $$;
revoke all on function public.genz_seed_public_broker_profile() from public, anon, authenticated;
drop trigger if exists genz_profiles_seed_public_profile on public.genz_profiles;
create trigger genz_profiles_seed_public_profile after insert on public.genz_profiles
for each row execute function public.genz_seed_public_broker_profile();

create or replace function public.genz_public_broker_lookup(p_broker_code text)
returns table (
  broker_code text, display_name text, firm text, cities text[], specialties text[], verified boolean,
  rating numeric, review_count integer, completed_deals integer, successful_collaborations integer,
  verified_visits integer, owner_confirmed_listings integer, member_since timestamptz, avatar_url text,
  account_status text, public_status_note text, status_effective_at timestamptz,
  trust_score integer, trust_confidence text
)
language sql stable security definer set search_path=public,pg_temp as $$
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
select broker_code,display_name,firm,cities,specialties,verified,rating,review_count,completed_deals,successful_collaborations,verified_visits,owner_confirmed_listings,
  created_at,avatar_url,account_status,public_status_note,status_effective_at,computed_trust_score,computed_confidence
from scored; $$;
revoke all on function public.genz_public_broker_lookup(text) from public;
grant execute on function public.genz_public_broker_lookup(text) to anon,authenticated;

create or replace function public.genz_set_public_broker_avatar(p_avatar_url text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'Approved GENZ broker membership required'; end if;
  if p_avatar_url is not null and (char_length(p_avatar_url)>2048 or p_avatar_url !~ '^https://') then raise exception 'Avatar URL must be a valid HTTPS URL'; end if;
  insert into public.genz_broker_public_profiles(broker_user_id,avatar_url,updated_at) values(v_uid,p_avatar_url,now())
  on conflict(broker_user_id) do update set avatar_url=excluded.avatar_url,updated_at=now();
end; $$;
revoke all on function public.genz_set_public_broker_avatar(text) from public,anon;
grant execute on function public.genz_set_public_broker_avatar(text) to authenticated;

create or replace function public.genz_admin_set_broker_public_status(p_broker_code text,p_status text,p_public_note text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_broker uuid;
begin
  if v_actor is null or not public.genz_is_admin() then raise exception 'GENZ admin access required'; end if;
  if p_status not in ('active','under_review','suspended','removed') then raise exception 'Invalid account status'; end if;
  if p_public_note is not null and char_length(p_public_note)>500 then raise exception 'Public status note is too long'; end if;
  select id into v_broker from public.genz_profiles where upper(broker_code)=upper(trim(p_broker_code)) limit 1;
  if v_broker is null then raise exception 'Broker not found'; end if;
  insert into public.genz_broker_public_profiles(broker_user_id,account_status,public_status_note,status_effective_at,status_updated_by,updated_at)
  values(v_broker,p_status,nullif(trim(coalesce(p_public_note,'')),''),now(),v_actor,now())
  on conflict(broker_user_id) do update set account_status=excluded.account_status,public_status_note=excluded.public_status_note,status_effective_at=now(),status_updated_by=v_actor,updated_at=now();
  insert into public.genz_broker_status_events(broker_user_id,account_status,public_note,actor_user_id)
  values(v_broker,p_status,nullif(trim(coalesce(p_public_note,'')),''),v_actor);
end; $$;
revoke all on function public.genz_admin_set_broker_public_status(text,text,text) from public,anon;
grant execute on function public.genz_admin_set_broker_public_status(text,text,text) to authenticated;

create or replace function public.genz_admin_list_broker_public_statuses()
returns table(broker_code text,display_name text,firm text,account_status text,public_status_note text,status_effective_at timestamptz,avatar_url text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not public.genz_is_admin() then raise exception 'GENZ admin access required'; end if;
  return query select p.broker_code,p.display_name,p.firm,pp.account_status,pp.public_status_note,pp.status_effective_at,pp.avatar_url
  from public.genz_profiles p join public.genz_broker_public_profiles pp on pp.broker_user_id=p.id order by p.display_name;
end; $$;
revoke all on function public.genz_admin_list_broker_public_statuses() from public,anon;
grant execute on function public.genz_admin_list_broker_public_statuses() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('genz-broker-avatars','genz-broker-avatars',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "genz members upload own public avatar" on storage.objects;
create policy "genz members upload own public avatar" on storage.objects for insert to authenticated
with check(bucket_id='genz-broker-avatars' and public.genz_is_member() and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "genz members update own public avatar" on storage.objects;
create policy "genz members update own public avatar" on storage.objects for update to authenticated
using(bucket_id='genz-broker-avatars' and public.genz_is_member() and (storage.foldername(name))[1]=(select auth.uid())::text)
with check(bucket_id='genz-broker-avatars' and public.genz_is_member() and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "genz members delete own public avatar" on storage.objects;
create policy "genz members delete own public avatar" on storage.objects for delete to authenticated
using(bucket_id='genz-broker-avatars' and public.genz_is_member() and (storage.foldername(name))[1]=(select auth.uid())::text);
