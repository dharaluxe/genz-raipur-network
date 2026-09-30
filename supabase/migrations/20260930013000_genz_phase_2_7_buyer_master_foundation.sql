-- GENZ Phase 2.7: Buyer Master + multi-requirement foundation
-- One phone identity -> one buyer master -> many independent requirements.
-- Protection belongs to a requirement/time window, not permanently to the buyer.

alter table public.genz_requirements
  add column if not exists min_budget numeric(14,2);

update public.genz_requirements
set min_budget = 0
where min_budget is null;

alter table public.genz_requirements
  alter column min_budget set default 0,
  alter column min_budget set not null;

alter table public.genz_requirements
  add column if not exists protection_expires_at timestamptz;

update public.genz_requirements
set protection_expires_at = expires_at
where protection_expires_at is null;

alter table public.genz_requirements
  alter column protection_expires_at set not null;

alter table public.genz_requirements
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version_no integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'genz_requirements_budget_range_check'
      and conrelid = 'public.genz_requirements'::regclass
  ) then
    alter table public.genz_requirements
      add constraint genz_requirements_budget_range_check
      check (min_budget >= 0 and max_budget > 0 and min_budget <= max_budget);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'genz_requirements_version_no_check'
      and conrelid = 'public.genz_requirements'::regclass
  ) then
    alter table public.genz_requirements
      add constraint genz_requirements_version_no_check check (version_no > 0);
  end if;
end $$;

alter table public.genz_requirements
  drop constraint if exists genz_requirements_status_check;

alter table public.genz_requirements
  add constraint genz_requirements_status_check
  check (status in ('active','follow_up','paused','fulfilled','expired','superseded','closed'));

create index if not exists genz_requirements_buyer_active_idx
  on public.genz_requirements (buyer_id, status, protection_expires_at desc);
create index if not exists genz_requirements_source_active_idx
  on public.genz_requirements (source_user_id, status, updated_at desc);
create index if not exists genz_requirements_match_range_idx
  on public.genz_requirements (city, property_type, min_budget, max_budget)
  where status in ('active','follow_up','paused');

create table if not exists public.genz_buyer_broker_relationships (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.genz_buyers(id) on delete cascade,
  broker_user_id uuid not null references public.genz_profiles(id) on delete cascade,
  contact_name text not null,
  phone_e164 text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_id, broker_user_id)
);

create index if not exists genz_buyer_relationships_broker_idx
  on public.genz_buyer_broker_relationships (broker_user_id, last_seen_at desc);
create index if not exists genz_buyer_relationships_buyer_idx
  on public.genz_buyer_broker_relationships (buyer_id, status);

alter table public.genz_buyer_broker_relationships enable row level security;
revoke all on table public.genz_buyer_broker_relationships from anon;
revoke insert, update, delete on table public.genz_buyer_broker_relationships from authenticated;
grant select on table public.genz_buyer_broker_relationships to authenticated;
grant all on table public.genz_buyer_broker_relationships to service_role;

drop policy if exists "broker reads own buyer relationship" on public.genz_buyer_broker_relationships;
create policy "broker reads own buyer relationship"
on public.genz_buyer_broker_relationships
for select to authenticated
using (
  (select public.genz_is_member())
  and (
    broker_user_id = (select auth.uid())
    or (select public.genz_is_admin())
  )
);

create table if not exists public.genz_requirement_versions (
  id uuid primary key default gen_random_uuid(),
  requirement_id text not null references public.genz_requirements(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  changed_by_user_id uuid not null references public.genz_profiles(id) on delete restrict,
  city text not null,
  property_type text not null,
  min_budget numeric(14,2) not null,
  max_budget numeric(14,2) not null,
  min_size integer not null,
  status text not null,
  protection_expires_at timestamptz not null,
  expires_at timestamptz not null,
  change_reason text not null default '',
  created_at timestamptz not null default now(),
  unique (requirement_id, version_no),
  check (min_budget >= 0 and max_budget > 0 and min_budget <= max_budget)
);

create index if not exists genz_requirement_versions_requirement_idx
  on public.genz_requirement_versions (requirement_id, version_no desc);
create index if not exists genz_requirement_versions_actor_idx
  on public.genz_requirement_versions (changed_by_user_id, created_at desc);

alter table public.genz_requirement_versions enable row level security;
revoke all on table public.genz_requirement_versions from anon;
revoke insert, update, delete on table public.genz_requirement_versions from authenticated;
grant select on table public.genz_requirement_versions to authenticated;
grant all on table public.genz_requirement_versions to service_role;

drop policy if exists "source broker reads requirement versions" on public.genz_requirement_versions;
create policy "source broker reads requirement versions"
on public.genz_requirement_versions
for select to authenticated
using (
  (select public.genz_is_member())
  and exists (
    select 1
    from public.genz_requirements r
    where r.id = genz_requirement_versions.requirement_id
      and (
        r.source_user_id = (select auth.uid())
        or (select public.genz_is_admin())
      )
  )
);

-- Backfill the initial broker relationship for existing buyer masters.
insert into public.genz_buyer_broker_relationships (
  buyer_id, broker_user_id, contact_name, phone_e164, status,
  first_seen_at, last_seen_at, created_at, updated_at
)
select
  b.id, b.source_user_id, b.name, b.phone_e164, 'active',
  b.created_at, b.updated_at, b.created_at, b.updated_at
from public.genz_buyers b
on conflict (buyer_id, broker_user_id) do nothing;

-- Backfill version 1 for existing requirements.
insert into public.genz_requirement_versions (
  requirement_id, version_no, changed_by_user_id, city, property_type,
  min_budget, max_budget, min_size, status,
  protection_expires_at, expires_at, change_reason, created_at
)
select
  r.id, r.version_no, r.source_user_id, r.city, r.property_type,
  r.min_budget, r.max_budget, r.min_size, r.status,
  r.protection_expires_at, r.expires_at, 'Initial migrated version', r.created_at
from public.genz_requirements r
on conflict (requirement_id, version_no) do nothing;

create or replace function public.genz_requirement_candidate(
  p_phone text,
  p_city text,
  p_property_type text,
  p_min_budget numeric,
  p_max_budget numeric,
  p_min_size integer default 0
)
returns table (
  buyer_exists boolean,
  classification text,
  own_requirement_id text,
  protected_until timestamptz
)
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'genz_private', 'extensions'
as $$
declare
  v_uid uuid := auth.uid();
  v_digits text;
  v_pepper text;
  v_hash text;
  v_buyer_id uuid;
  v_own_id text;
  v_own_until timestamptz;
  v_other_until timestamptz;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.genz_is_member() then raise exception 'MEMBERSHIP_REQUIRED'; end if;

  v_digits := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
  if length(v_digits) = 12 and left(v_digits,2) = '91' then v_digits := right(v_digits,10); end if;
  if v_digits !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;
  if coalesce(trim(p_city),'') = '' or coalesce(trim(p_property_type),'') = '' then raise exception 'INVALID_REQUIREMENT'; end if;
  if p_min_budget is null or p_min_budget < 0 or p_max_budget is null or p_max_budget <= 0 or p_min_budget > p_max_budget then raise exception 'INVALID_BUDGET_RANGE'; end if;
  if p_min_size is null or p_min_size < 0 then raise exception 'INVALID_REQUIREMENT'; end if;

  select value into v_pepper from genz_private.config where key = 'phone_pepper';
  v_hash := encode(hmac(v_digits, v_pepper, 'sha256'), 'hex');

  select b.id into v_buyer_id
  from public.genz_buyers b
  where b.phone_hash = v_hash;

  if v_buyer_id is null then
    return query select false, 'new_buyer'::text, null::text, null::timestamptz;
    return;
  end if;

  select r.id, r.protection_expires_at
    into v_own_id, v_own_until
  from public.genz_requirements r
  where r.buyer_id = v_buyer_id
    and r.source_user_id = v_uid
    and r.status in ('active','follow_up','paused')
    and lower(trim(r.city)) = lower(trim(p_city))
    and lower(trim(r.property_type)) = lower(trim(p_property_type))
    and greatest(r.min_budget, p_min_budget) <= least(r.max_budget, p_max_budget)
  order by r.updated_at desc
  limit 1;

  if v_own_id is not null then
    return query select true, 'update_own_requirement'::text, v_own_id, v_own_until;
    return;
  end if;

  select max(r.protection_expires_at)
    into v_other_until
  from public.genz_requirements r
  where r.buyer_id = v_buyer_id
    and r.source_user_id <> v_uid
    and r.status in ('active','follow_up','paused')
    and r.protection_expires_at > now()
    and lower(trim(r.city)) = lower(trim(p_city))
    and lower(trim(r.property_type)) = lower(trim(p_property_type))
    and greatest(r.min_budget, p_min_budget) <= least(r.max_budget, p_max_budget);

  if v_other_until is not null then
    return query select true, 'protected_requirement'::text, null::text, v_other_until;
    return;
  end if;

  return query select true, 'new_requirement'::text, null::text, null::timestamptz;
end;
$$;

revoke execute on function public.genz_requirement_candidate(text,text,text,numeric,numeric,integer) from public, anon;
grant execute on function public.genz_requirement_candidate(text,text,text,numeric,numeric,integer) to authenticated, service_role;

create or replace function public.genz_register_requirement_v2(
  p_requirement_id text,
  p_buyer_name text,
  p_phone text,
  p_city text,
  p_property_type text,
  p_min_budget numeric,
  p_max_budget numeric,
  p_min_size integer,
  p_expires_at timestamptz,
  p_protection_expires_at timestamptz,
  p_force_separate boolean default false
)
returns table (
  requirement_id text,
  buyer_id uuid,
  version_no integer
)
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'genz_private', 'extensions'
as $$
declare
  v_uid uuid := auth.uid();
  v_digits text;
  v_pepper text;
  v_hash text;
  v_buyer_id uuid;
  v_existing_source uuid;
  v_own_similar text;
  v_other_until timestamptz;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.genz_is_member() then raise exception 'MEMBERSHIP_REQUIRED'; end if;

  v_digits := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
  if length(v_digits) = 12 and left(v_digits,2) = '91' then v_digits := right(v_digits,10); end if;
  if v_digits !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;
  if coalesce(trim(p_requirement_id),'') = '' or coalesce(trim(p_buyer_name),'') = '' or coalesce(trim(p_city),'') = '' or coalesce(trim(p_property_type),'') = '' then raise exception 'INVALID_REQUIREMENT'; end if;
  if p_min_budget is null or p_min_budget < 0 or p_max_budget is null or p_max_budget <= 0 or p_min_budget > p_max_budget then raise exception 'INVALID_BUDGET_RANGE'; end if;
  if p_min_size is null or p_min_size < 0 then raise exception 'INVALID_REQUIREMENT'; end if;
  if p_expires_at is null or p_expires_at <= now() then raise exception 'INVALID_REQUIREMENT_EXPIRY'; end if;
  if p_protection_expires_at is null or p_protection_expires_at <= now() then raise exception 'INVALID_PROTECTION_EXPIRY'; end if;
  if p_protection_expires_at > p_expires_at then raise exception 'PROTECTION_EXCEEDS_REQUIREMENT_EXPIRY'; end if;

  select value into v_pepper from genz_private.config where key = 'phone_pepper';
  v_hash := encode(hmac(v_digits, v_pepper, 'sha256'), 'hex');

  select b.id, b.source_user_id
    into v_buyer_id, v_existing_source
  from public.genz_buyers b
  where b.phone_hash = v_hash
  for update;

  if v_buyer_id is null then
    insert into public.genz_buyers(
      source_user_id, name, phone_e164, phone_hash, phone_masked,
      claim_expires_at, created_at, updated_at
    ) values (
      v_uid, trim(p_buyer_name), v_digits, v_hash,
      left(v_digits,2) || '******' || right(v_digits,2),
      p_protection_expires_at, now(), now()
    ) returning id into v_buyer_id;
  else
    -- Buyer master identity is global. A later broker relationship must not
    -- transfer ownership of that master record or overwrite another broker's private label.
    update public.genz_buyers
      set updated_at = now()
    where id = v_buyer_id;
  end if;

  select r.id into v_own_similar
  from public.genz_requirements r
  where r.buyer_id = v_buyer_id
    and r.source_user_id = v_uid
    and r.status in ('active','follow_up','paused')
    and lower(trim(r.city)) = lower(trim(p_city))
    and lower(trim(r.property_type)) = lower(trim(p_property_type))
    and greatest(r.min_budget, p_min_budget) <= least(r.max_budget, p_max_budget)
  order by r.updated_at desc
  limit 1;

  if v_own_similar is not null and not p_force_separate then
    raise exception 'GENZ_SIMILAR_REQUIREMENT_EXISTS:%', v_own_similar;
  end if;

  select max(r.protection_expires_at)
    into v_other_until
  from public.genz_requirements r
  where r.buyer_id = v_buyer_id
    and r.source_user_id <> v_uid
    and r.status in ('active','follow_up','paused')
    and r.protection_expires_at > now()
    and lower(trim(r.city)) = lower(trim(p_city))
    and lower(trim(r.property_type)) = lower(trim(p_property_type))
    and greatest(r.min_budget, p_min_budget) <= least(r.max_budget, p_max_budget);

  if v_other_until is not null then
    raise exception 'GENZ_REQUIREMENT_PROTECTED';
  end if;

  insert into public.genz_buyer_broker_relationships(
    buyer_id, broker_user_id, contact_name, phone_e164, status,
    first_seen_at, last_seen_at, created_at, updated_at
  ) values (
    v_buyer_id, v_uid, trim(p_buyer_name), v_digits, 'active',
    now(), now(), now(), now()
  )
  on conflict (buyer_id, broker_user_id) do update
    set contact_name = excluded.contact_name,
        phone_e164 = excluded.phone_e164,
        status = 'active',
        last_seen_at = now(),
        updated_at = now();

  insert into public.genz_requirements(
    id, buyer_id, source_user_id, buyer_label, buyer_phone_masked,
    city, property_type, min_budget, max_budget, min_size, status,
    created_at, updated_at, expires_at, protection_expires_at, version_no
  ) values (
    trim(p_requirement_id), v_buyer_id, v_uid,
    left(trim(p_buyer_name),1) || '***',
    left(v_digits,2) || '******' || right(v_digits,2),
    trim(p_city), trim(p_property_type), p_min_budget, p_max_budget,
    p_min_size, 'active', now(), now(), p_expires_at,
    p_protection_expires_at, 1
  );

  insert into public.genz_requirement_versions(
    requirement_id, version_no, changed_by_user_id, city, property_type,
    min_budget, max_budget, min_size, status,
    protection_expires_at, expires_at, change_reason, created_at
  ) values (
    trim(p_requirement_id), 1, v_uid, trim(p_city), trim(p_property_type),
    p_min_budget, p_max_budget, p_min_size, 'active',
    p_protection_expires_at, p_expires_at, 'Requirement created', now()
  );

  return query select trim(p_requirement_id), v_buyer_id, 1;
end;
$$;

revoke execute on function public.genz_register_requirement_v2(text,text,text,text,text,numeric,numeric,integer,timestamptz,timestamptz,boolean) from public, anon;
grant execute on function public.genz_register_requirement_v2(text,text,text,text,text,numeric,numeric,integer,timestamptz,timestamptz,boolean) to authenticated, service_role;

create or replace function public.genz_update_requirement_v2(
  p_requirement_id text,
  p_city text,
  p_property_type text,
  p_min_budget numeric,
  p_max_budget numeric,
  p_min_size integer,
  p_status text,
  p_expires_at timestamptz,
  p_protection_expires_at timestamptz,
  p_change_reason text default 'Requirement updated'
)
returns integer
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_next_version integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.genz_is_member() then raise exception 'MEMBERSHIP_REQUIRED'; end if;
  if p_min_budget is null or p_min_budget < 0 or p_max_budget is null or p_max_budget <= 0 or p_min_budget > p_max_budget then raise exception 'INVALID_BUDGET_RANGE'; end if;
  if p_min_size is null or p_min_size < 0 then raise exception 'INVALID_REQUIREMENT'; end if;
  if p_status not in ('active','follow_up','paused','fulfilled','expired','superseded','closed') then raise exception 'INVALID_STATUS'; end if;
  if p_expires_at is null then raise exception 'INVALID_REQUIREMENT_EXPIRY'; end if;
  if p_protection_expires_at is null or p_protection_expires_at > p_expires_at then raise exception 'INVALID_PROTECTION_EXPIRY'; end if;

  select r.version_no + 1 into v_next_version
  from public.genz_requirements r
  where r.id = p_requirement_id
    and r.source_user_id = v_uid
  for update;

  if v_next_version is null then raise exception 'REQUIREMENT_NOT_FOUND_OR_FORBIDDEN'; end if;

  update public.genz_requirements
  set city = trim(p_city),
      property_type = trim(p_property_type),
      min_budget = p_min_budget,
      max_budget = p_max_budget,
      min_size = p_min_size,
      status = p_status,
      expires_at = p_expires_at,
      protection_expires_at = p_protection_expires_at,
      version_no = v_next_version,
      updated_at = now()
  where id = p_requirement_id;

  insert into public.genz_requirement_versions(
    requirement_id, version_no, changed_by_user_id, city, property_type,
    min_budget, max_budget, min_size, status,
    protection_expires_at, expires_at, change_reason, created_at
  ) values (
    p_requirement_id, v_next_version, v_uid, trim(p_city), trim(p_property_type),
    p_min_budget, p_max_budget, p_min_size, p_status,
    p_protection_expires_at, p_expires_at, left(coalesce(p_change_reason,'Requirement updated'),300), now()
  );

  return v_next_version;
end;
$$;

revoke execute on function public.genz_update_requirement_v2(text,text,text,numeric,numeric,integer,text,timestamptz,timestamptz,text) from public, anon;
grant execute on function public.genz_update_requirement_v2(text,text,text,numeric,numeric,integer,text,timestamptz,timestamptz,text) to authenticated, service_role;

comment on column public.genz_requirements.min_budget is 'Buyer preferred minimum price. 0 means no minimum; must not exceed max_budget.';
comment on column public.genz_requirements.protection_expires_at is 'Source-broker protection expiry for this specific requirement. Buyer identity itself is not permanently owned.';
comment on table public.genz_buyer_broker_relationships is 'Private per-broker relationship to a shared buyer master; allows one buyer to work with multiple brokers on distinct requirements without exposing contact data.';
comment on table public.genz_requirement_versions is 'Append-only snapshots of requirement changes for protection/dispute evidence.';
