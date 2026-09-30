-- GENZ Phase 2.7: Master Property + broker mandates.
-- Each broker-facing genz_properties row remains an independent listing/mandate,
-- while master_property_id identifies the real-world property across brokers.
-- Fuzzy matches never auto-merge; they create a reviewable merge claim.

alter table public.genz_properties
  add column if not exists master_property_id uuid;

create table if not exists public.genz_master_properties (
  id uuid primary key default gen_random_uuid(),
  master_code text not null unique default ('MP-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  seed_property_id text unique,
  city text not null,
  locality text,
  property_type text not null,
  size integer not null check (size > 0),
  canonical_latitude numeric,
  canonical_longitude numeric,
  owner_phone_hash text,
  status text not null default 'active' check (status in ('active','merged','archived')),
  merged_into_master_id uuid references public.genz_master_properties(id) on delete set null,
  created_by_user_id uuid not null references public.genz_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (canonical_latitude is null or (canonical_latitude between -90 and 90)),
  check (canonical_longitude is null or (canonical_longitude between -180 and 180)),
  check ((status='merged' and merged_into_master_id is not null) or status<>'merged')
);

create index if not exists genz_master_properties_search_idx
  on public.genz_master_properties (city, property_type, size, status);
create index if not exists genz_master_properties_owner_hash_idx
  on public.genz_master_properties (owner_phone_hash)
  where owner_phone_hash is not null and status='active';
create index if not exists genz_master_properties_merged_into_idx
  on public.genz_master_properties (merged_into_master_id)
  where merged_into_master_id is not null;

create table if not exists public.genz_property_mandates (
  id uuid primary key default gen_random_uuid(),
  master_property_id uuid not null references public.genz_master_properties(id) on delete restrict,
  property_id text not null unique references public.genz_properties(id) on delete cascade,
  broker_user_id uuid not null references public.genz_profiles(id) on delete cascade,
  mandate_status text not null default 'pending' check (mandate_status in ('pending','verified','revoked','expired')),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists genz_property_mandates_master_idx
  on public.genz_property_mandates (master_property_id, mandate_status);
create index if not exists genz_property_mandates_broker_idx
  on public.genz_property_mandates (broker_user_id, updated_at desc);

create table if not exists public.genz_property_master_claims (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references public.genz_properties(id) on delete cascade,
  current_master_id uuid not null references public.genz_master_properties(id) on delete restrict,
  candidate_master_id uuid not null references public.genz_master_properties(id) on delete restrict,
  requested_by_user_id uuid not null references public.genz_profiles(id) on delete cascade,
  match_score integer not null check (match_score between 0 and 100),
  match_reason text not null default '',
  broker_note text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  reviewed_by_user_id uuid references public.genz_profiles(id) on delete set null,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (current_master_id <> candidate_master_id)
);

create unique index if not exists genz_property_master_claim_pending_uq
  on public.genz_property_master_claims (property_id, candidate_master_id)
  where status='pending';
create index if not exists genz_property_master_claim_requester_idx
  on public.genz_property_master_claims (requested_by_user_id, created_at desc);
create index if not exists genz_property_master_claim_candidate_idx
  on public.genz_property_master_claims (candidate_master_id, status, created_at desc);
create index if not exists genz_property_master_claim_reviewer_idx
  on public.genz_property_master_claims (reviewed_by_user_id)
  where reviewed_by_user_id is not null;

-- Backfill one provisional Master Property per existing listing. We deliberately
-- do not fuzzy-merge historical rows automatically.
insert into public.genz_master_properties(
  seed_property_id,city,locality,property_type,size,canonical_latitude,canonical_longitude,
  owner_phone_hash,status,created_by_user_id,created_at,updated_at
)
select
  p.id,p.city,p.locality,p.property_type,p.size,p.latitude,p.longitude,
  case
    when pp.owner_phone_e164 is not null and regexp_replace(pp.owner_phone_e164,'[^0-9]','','g') <> '' then
      encode(hmac('owner:' || regexp_replace(pp.owner_phone_e164,'[^0-9]','','g'),
        (select value from genz_private.config where key='phone_pepper'),'sha256'),'hex')
    else null
  end,
  'active',p.listing_user_id,p.created_at,p.updated_at
from public.genz_properties p
left join public.genz_property_private pp on pp.property_id=p.id
where not exists(select 1 from public.genz_master_properties mp where mp.seed_property_id=p.id)
on conflict (seed_property_id) do nothing;

update public.genz_properties p
set master_property_id=mp.id
from public.genz_master_properties mp
where p.master_property_id is null and mp.seed_property_id=p.id;

alter table public.genz_properties
  add constraint genz_properties_master_property_id_fkey
  foreign key (master_property_id) references public.genz_master_properties(id) on delete restrict;

create index if not exists genz_properties_master_property_idx
  on public.genz_properties (master_property_id);

insert into public.genz_property_mandates(master_property_id,property_id,broker_user_id,mandate_status,created_at,updated_at)
select p.master_property_id,p.id,p.listing_user_id,
  case when p.mandate_status='verified' then 'verified' else 'pending' end,
  p.created_at,p.updated_at
from public.genz_properties p
where p.master_property_id is not null
on conflict (property_id) do nothing;

-- Master/mandate support tables are not network-wide direct data sources.
alter table public.genz_master_properties enable row level security;
alter table public.genz_property_mandates enable row level security;
alter table public.genz_property_master_claims enable row level security;

revoke all on table public.genz_master_properties from anon;
revoke all on table public.genz_property_mandates from anon;
revoke all on table public.genz_property_master_claims from anon;
revoke insert,update,delete on table public.genz_master_properties from authenticated;
revoke insert,update,delete on table public.genz_property_mandates from authenticated;
revoke insert,update,delete on table public.genz_property_master_claims from authenticated;
grant select on table public.genz_master_properties to authenticated;
grant select on table public.genz_property_mandates to authenticated;
grant select on table public.genz_property_master_claims to authenticated;
grant all on table public.genz_master_properties to service_role;
grant all on table public.genz_property_mandates to service_role;
grant all on table public.genz_property_master_claims to service_role;

drop policy if exists "broker reads own master properties" on public.genz_master_properties;
create policy "broker reads own master properties"
on public.genz_master_properties for select to authenticated
using (
  (select public.genz_is_admin())
  or exists(
    select 1 from public.genz_property_mandates pm
    where pm.master_property_id=genz_master_properties.id
      and pm.broker_user_id=(select auth.uid())
  )
);

drop policy if exists "broker reads own mandates" on public.genz_property_mandates;
create policy "broker reads own mandates"
on public.genz_property_mandates for select to authenticated
using (broker_user_id=(select auth.uid()) or (select public.genz_is_admin()));

drop policy if exists "broker reads own master claims" on public.genz_property_master_claims;
create policy "broker reads own master claims"
on public.genz_property_master_claims for select to authenticated
using (requested_by_user_id=(select auth.uid()) or (select public.genz_is_admin()));

-- Haversine distance helper (meters); internal only.
create or replace function public.genz_geo_distance_m(lat1 numeric,lon1 numeric,lat2 numeric,lon2 numeric)
returns numeric language sql immutable set search_path='pg_catalog' as $$
  select case when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
  else 6371000 * 2 * asin(sqrt(
    power(sin(radians((lat2-lat1)::double precision)/2),2) +
    cos(radians(lat1::double precision))*cos(radians(lat2::double precision))*
    power(sin(radians((lon2-lon1)::double precision)/2),2)
  )) end::numeric;
$$;
revoke execute on function public.genz_geo_distance_m(numeric,numeric,numeric,numeric) from public,anon,authenticated;
grant execute on function public.genz_geo_distance_m(numeric,numeric,numeric,numeric) to service_role;

create or replace function public.genz_property_master_candidates(
  p_city text,
  p_locality text,
  p_property_type text,
  p_size integer,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_owner_phone text default null,
  p_limit integer default 10
)
returns table(
  master_property_id uuid,
  master_code text,
  classification text,
  match_score integer,
  city text,
  locality text,
  property_type text,
  size integer,
  active_mandates bigint,
  evidence text
)
language plpgsql security definer
set search_path='pg_catalog','public','genz_private','extensions'
as $$
declare
  v_uid uuid:=auth.uid();
  v_owner_digits text;
  v_owner_hash text;
  v_pepper text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.genz_is_member() then raise exception 'MEMBERSHIP_REQUIRED'; end if;
  if coalesce(trim(p_city),'')='' or coalesce(trim(p_property_type),'')='' or p_size is null or p_size<=0 then raise exception 'INVALID_PROPERTY'; end if;
  if p_latitude is not null and not (p_latitude between -90 and 90) then raise exception 'INVALID_LATITUDE'; end if;
  if p_longitude is not null and not (p_longitude between -180 and 180) then raise exception 'INVALID_LONGITUDE'; end if;
  v_owner_digits:=regexp_replace(coalesce(p_owner_phone,''),'[^0-9]','','g');
  if length(v_owner_digits)=12 and left(v_owner_digits,2)='91' then v_owner_digits:=right(v_owner_digits,10); end if;
  if v_owner_digits<>'' then
    select value into v_pepper from genz_private.config where key='phone_pepper';
    v_owner_hash:=encode(hmac('owner:'||v_owner_digits,v_pepper,'sha256'),'hex');
  end if;

  return query
  with scored as (
    select mp.*,
      public.genz_geo_distance_m(mp.canonical_latitude,mp.canonical_longitude,p_latitude,p_longitude) as distance_m,
      (case when v_owner_hash is not null and mp.owner_phone_hash=v_owner_hash then 45 else 0 end) +
      (case when coalesce(lower(trim(mp.locality)),'')<>'' and coalesce(lower(trim(mp.locality)),'')=coalesce(lower(trim(p_locality)),'') then 20 else 0 end) +
      (case when abs(mp.size-p_size)<=greatest(100,ceil(greatest(mp.size,p_size)*0.05)::integer) then 20
            when abs(mp.size-p_size)<=greatest(250,ceil(greatest(mp.size,p_size)*0.15)::integer) then 10 else 0 end) +
      (case when public.genz_geo_distance_m(mp.canonical_latitude,mp.canonical_longitude,p_latitude,p_longitude)<=75 then 25
            when public.genz_geo_distance_m(mp.canonical_latitude,mp.canonical_longitude,p_latitude,p_longitude)<=250 then 10 else 0 end) as score
    from public.genz_master_properties mp
    where mp.status='active'
      and lower(trim(mp.city))=lower(trim(p_city))
      and lower(trim(mp.property_type))=lower(trim(p_property_type))
  )
  select s.id,s.master_code,
    case
      when exists(select 1 from public.genz_property_mandates ownm where ownm.master_property_id=s.id and ownm.broker_user_id=v_uid and ownm.mandate_status in ('pending','verified')) then 'own_master'
      when s.score>=70 and v_owner_hash is not null and s.owner_phone_hash=v_owner_hash then 'strong_candidate'
      else 'possible_candidate'
    end,
    least(100,s.score)::integer,s.city,s.locality,s.property_type,s.size,
    (select count(*) from public.genz_property_mandates pm where pm.master_property_id=s.id and pm.mandate_status in ('pending','verified')),
    concat_ws(' · ',
      case when v_owner_hash is not null and s.owner_phone_hash=v_owner_hash then 'owner signal matches' end,
      case when coalesce(lower(trim(s.locality)),'')<>'' and coalesce(lower(trim(s.locality)),'')=coalesce(lower(trim(p_locality)),'') then 'locality matches' end,
      case when abs(s.size-p_size)<=greatest(100,ceil(greatest(s.size,p_size)*0.05)::integer) then 'size closely matches' end,
      case when s.distance_m is not null and s.distance_m<=75 then 'location pin nearby' when s.distance_m is not null and s.distance_m<=250 then 'location area nearby' end
    )
  from scored s
  where s.score>=40
  order by (case when exists(select 1 from public.genz_property_mandates ownm where ownm.master_property_id=s.id and ownm.broker_user_id=v_uid) then 1 else 0 end) desc,
           s.score desc,s.updated_at desc
  limit greatest(1,least(coalesce(p_limit,10),25));
end;
$$;
revoke execute on function public.genz_property_master_candidates(text,text,text,integer,numeric,numeric,text,integer) from public,anon;
grant execute on function public.genz_property_master_candidates(text,text,text,integer,numeric,numeric,text,integer) to authenticated,service_role;

-- Legacy/new property inserts always get a provisional master before the private owner row exists.
create or replace function public.genz_seed_master_property_before_insert()
returns trigger language plpgsql security definer
set search_path='pg_catalog','public'
as $$
declare v_master uuid;
begin
  if new.master_property_id is null then
    insert into public.genz_master_properties(seed_property_id,city,locality,property_type,size,canonical_latitude,canonical_longitude,status,created_by_user_id,created_at,updated_at)
    values(new.id,new.city,new.locality,new.property_type,new.size,new.latitude,new.longitude,'active',new.listing_user_id,coalesce(new.created_at,now()),coalesce(new.updated_at,now()))
    returning id into v_master;
    new.master_property_id:=v_master;
  end if;
  return new;
end;
$$;

drop trigger if exists genz_properties_seed_master_before_insert on public.genz_properties;
create trigger genz_properties_seed_master_before_insert
before insert on public.genz_properties
for each row execute function public.genz_seed_master_property_before_insert();

create or replace function public.genz_seed_mandate_after_property_insert()
returns trigger language plpgsql security definer
set search_path='pg_catalog','public'
as $$
begin
  insert into public.genz_property_mandates(master_property_id,property_id,broker_user_id,mandate_status,created_at,updated_at)
  values(new.master_property_id,new.id,new.listing_user_id,case when new.mandate_status='verified' then 'verified' else 'pending' end,coalesce(new.created_at,now()),coalesce(new.updated_at,now()))
  on conflict(property_id) do nothing;
  return new;
end;
$$;

drop trigger if exists genz_properties_seed_mandate_after_insert on public.genz_properties;
create trigger genz_properties_seed_mandate_after_insert
after insert on public.genz_properties
for each row execute function public.genz_seed_mandate_after_property_insert();

create or replace function public.genz_sync_master_owner_hash()
returns trigger language plpgsql security definer
set search_path='pg_catalog','public','genz_private','extensions'
as $$
declare v_digits text; v_hash text; v_master uuid; v_pepper text;
begin
  v_digits:=regexp_replace(coalesce(new.owner_phone_e164,''),'[^0-9]','','g');
  if length(v_digits)=12 and left(v_digits,2)='91' then v_digits:=right(v_digits,10); end if;
  if v_digits='' then return new; end if;
  select p.master_property_id into v_master from public.genz_properties p where p.id=new.property_id;
  if v_master is null then return new; end if;
  select value into v_pepper from genz_private.config where key='phone_pepper';
  v_hash:=encode(hmac('owner:'||v_digits,v_pepper,'sha256'),'hex');
  update public.genz_master_properties
  set owner_phone_hash=coalesce(owner_phone_hash,v_hash),updated_at=now()
  where id=v_master and (owner_phone_hash is null or owner_phone_hash=v_hash);
  return new;
end;
$$;

drop trigger if exists genz_property_private_sync_master_owner on public.genz_property_private;
create trigger genz_property_private_sync_master_owner
after insert or update of owner_phone_e164 on public.genz_property_private
for each row execute function public.genz_sync_master_owner_hash();

create or replace function public.genz_request_property_master_merge(
  p_property_id text,
  p_candidate_master_id uuid,
  p_note text default ''
)
returns uuid
language plpgsql security definer
set search_path='pg_catalog','public'
as $$
declare
  v_uid uuid:=auth.uid();
  v_current uuid;
  v_property public.genz_properties%rowtype;
  v_private public.genz_property_private%rowtype;
  v_candidate record;
  v_claim uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.genz_is_member() then raise exception 'MEMBERSHIP_REQUIRED'; end if;
  select * into v_property from public.genz_properties p where p.id=p_property_id and p.listing_user_id=v_uid;
  if v_property.id is null then raise exception 'PROPERTY_NOT_FOUND_OR_FORBIDDEN'; end if;
  v_current:=v_property.master_property_id;
  if v_current=p_candidate_master_id then raise exception 'ALREADY_SAME_MASTER'; end if;
  select * into v_private from public.genz_property_private pp where pp.property_id=p_property_id and pp.listing_user_id=v_uid;
  select c.* into v_candidate
  from public.genz_property_master_candidates(v_property.city,v_property.locality,v_property.property_type,v_property.size,v_property.latitude,v_property.longitude,v_private.owner_phone_e164,25) c
  where c.master_property_id=p_candidate_master_id and c.classification<>'own_master'
  limit 1;
  if v_candidate.master_property_id is null then raise exception 'MASTER_NOT_A_VALID_CANDIDATE'; end if;
  insert into public.genz_property_master_claims(property_id,current_master_id,candidate_master_id,requested_by_user_id,match_score,match_reason,broker_note,status)
  values(p_property_id,v_current,p_candidate_master_id,v_uid,v_candidate.match_score,v_candidate.evidence,left(coalesce(p_note,''),600),'pending')
  on conflict(property_id,candidate_master_id) where status='pending' do update
    set match_score=excluded.match_score,match_reason=excluded.match_reason,broker_note=excluded.broker_note,created_at=now()
  returning id into v_claim;
  return v_claim;
end;
$$;
revoke execute on function public.genz_request_property_master_merge(text,uuid,text) from public,anon;
grant execute on function public.genz_request_property_master_merge(text,uuid,text) to authenticated,service_role;

create or replace function public.genz_admin_review_property_master_claim(p_claim_id uuid,p_decision text,p_note text default '')
returns void
language plpgsql security definer
set search_path='pg_catalog','public'
as $$
declare v_uid uuid:=auth.uid(); v_claim public.genz_property_master_claims%rowtype; v_remaining bigint;
begin
  if v_uid is null or not public.genz_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'INVALID_DECISION'; end if;
  select * into v_claim from public.genz_property_master_claims c where c.id=p_claim_id and c.status='pending' for update;
  if v_claim.id is null then raise exception 'CLAIM_NOT_FOUND'; end if;
  if p_decision='approved' then
    if exists(select 1 from public.genz_property_mandates pm where pm.master_property_id=v_claim.candidate_master_id and pm.broker_user_id=v_claim.requested_by_user_id and pm.property_id<>v_claim.property_id and pm.mandate_status in ('pending','verified')) then
      raise exception 'BROKER_ALREADY_HAS_MASTER_MANDATE';
    end if;
    update public.genz_properties set master_property_id=v_claim.candidate_master_id,updated_at=now() where id=v_claim.property_id;
    update public.genz_property_mandates set master_property_id=v_claim.candidate_master_id,updated_at=now() where property_id=v_claim.property_id;
    select count(*) into v_remaining from public.genz_property_mandates pm where pm.master_property_id=v_claim.current_master_id;
    if v_remaining=0 then
      update public.genz_master_properties set status='merged',merged_into_master_id=v_claim.candidate_master_id,updated_at=now() where id=v_claim.current_master_id;
    end if;
  end if;
  update public.genz_property_master_claims set status=p_decision,reviewed_by_user_id=v_uid,review_note=left(coalesce(p_note,''),600),reviewed_at=now() where id=p_claim_id;
end;
$$;
revoke execute on function public.genz_admin_review_property_master_claim(uuid,text,text) from public,anon;
grant execute on function public.genz_admin_review_property_master_claim(uuid,text,text) to authenticated,service_role;

comment on table public.genz_master_properties is 'Canonical real-world property identity. Sensitive canonical GPS/owner hash are not network-wide direct data.';
comment on table public.genz_property_mandates is 'Broker-specific listing/mandate attached to one Master Property.';
comment on table public.genz_property_master_claims is 'Evidence-backed request to merge a provisional property master into an existing Master Property; fuzzy matches never auto-merge.';
