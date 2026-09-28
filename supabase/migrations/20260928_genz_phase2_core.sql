-- GENZ Network Phase 2 core schema.
-- Applied to Supabase project zvftcwinvbnavvjfmugr on 2026-09-28.
-- This file records the production migration for reproducibility.

create table if not exists public.genz_reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  deal_id text not null references public.genz_deals(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  reviewed_user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  communication smallint check (communication between 1 and 5),
  professionalism smallint check (professionalism between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 800),
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  unique (deal_id, reviewer_user_id, reviewed_user_id),
  check (reviewer_user_id <> reviewed_user_id)
);
alter table public.genz_reviews enable row level security;
create policy "members read visible verified reviews" on public.genz_reviews for select to authenticated
using (public.genz_is_member() and is_visible);
create policy "deal participant creates verified review" on public.genz_reviews for insert to authenticated
with check (
  public.genz_is_member()
  and auth.uid() = reviewer_user_id
  and exists (
    select 1 from public.genz_deals d
    where d.id = deal_id
      and d.status = 'closed'
      and ((d.buyer_user_id = reviewer_user_id and d.listing_user_id = reviewed_user_id)
        or (d.listing_user_id = reviewer_user_id and d.buyer_user_id = reviewed_user_id))
  )
);
grant select, insert on public.genz_reviews to authenticated;

create or replace function public.genz_recompute_broker_rating(p_user_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.genz_profiles p
  set rating = coalesce((select round(avg(r.rating)::numeric, 2) from public.genz_reviews r where r.reviewed_user_id = p_user_id and r.is_visible), 0),
      review_count = (select count(*)::int from public.genz_reviews r where r.reviewed_user_id = p_user_id and r.is_visible),
      updated_at = now()
  where p.id = p_user_id;
$$;
revoke all on function public.genz_recompute_broker_rating(uuid) from public, anon, authenticated;

create or replace function public.genz_reviews_recompute_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.genz_recompute_broker_rating(coalesce(new.reviewed_user_id, old.reviewed_user_id));
  if tg_op = 'UPDATE' and old.reviewed_user_id is distinct from new.reviewed_user_id then
    perform public.genz_recompute_broker_rating(old.reviewed_user_id);
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.genz_reviews_recompute_trigger() from public, anon, authenticated;
drop trigger if exists trg_genz_reviews_recompute on public.genz_reviews;
create trigger trg_genz_reviews_recompute after insert or update or delete on public.genz_reviews
for each row execute function public.genz_reviews_recompute_trigger();

create table if not exists public.genz_visits (
  id uuid primary key default extensions.gen_random_uuid(),
  deal_id text not null references public.genz_deals(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id),
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','verified','cancelled','no_show')),
  otp_hash text not null,
  otp_expires_at timestamptz not null,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  verifier_user_id uuid references auth.users(id),
  verified_at timestamptz,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default now()
);
create index if not exists idx_genz_visits_deal on public.genz_visits(deal_id, created_at desc);
alter table public.genz_visits enable row level security;
create policy "deal participants read visits" on public.genz_visits for select to authenticated
using (public.genz_is_member() and exists (
  select 1 from public.genz_deals d where d.id = deal_id
  and (auth.uid() in (d.buyer_user_id, d.listing_user_id) or public.genz_is_admin())
));
grant select on public.genz_visits to authenticated;

create or replace function public.genz_create_visit(p_deal_id text, p_scheduled_at timestamptz)
returns table(visit_id uuid, otp text, expires_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
declare
  d public.genz_deals%rowtype;
  v_id uuid := extensions.gen_random_uuid();
  b bytea := extensions.gen_random_bytes(4);
  n bigint;
  code text;
  exp timestamptz;
begin
  if auth.uid() is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into d from public.genz_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if auth.uid() not in (d.buyer_user_id, d.listing_user_id) and not public.genz_is_admin() then raise exception 'DEAL_ACCESS_DENIED'; end if;
  if d.status not in ('accepted','visit_verified','negotiation') then raise exception 'DEAL_NOT_READY_FOR_VISIT'; end if;
  if p_scheduled_at < now() - interval '30 minutes' then raise exception 'INVALID_VISIT_TIME'; end if;
  n := get_byte(b,0)::bigint*16777216 + get_byte(b,1)::bigint*65536 + get_byte(b,2)::bigint*256 + get_byte(b,3)::bigint;
  code := lpad((n % 1000000)::text, 6, '0');
  exp := p_scheduled_at + interval '4 hours';
  insert into public.genz_visits(id, deal_id, created_by_user_id, scheduled_at, otp_hash, otp_expires_at)
  values (v_id, p_deal_id, auth.uid(), p_scheduled_at, encode(extensions.digest(code || ':' || v_id::text, 'sha256'), 'hex'), exp);
  insert into public.genz_deal_events(id, deal_id, actor_user_id, event_type, label)
  values ('EV-' || replace(extensions.gen_random_uuid()::text,'-',''), p_deal_id, auth.uid(), 'visit_scheduled', 'Site visit scheduled for ' || to_char(p_scheduled_at at time zone 'Asia/Kolkata','DD Mon YYYY HH24:MI'));
  return query select v_id, code, exp;
end;
$$;
revoke all on function public.genz_create_visit(text,timestamptz) from public, anon;
grant execute on function public.genz_create_visit(text,timestamptz) to authenticated;

create or replace function public.genz_verify_visit(p_visit_id uuid, p_otp text, p_latitude numeric default null, p_longitude numeric default null)
returns table(verified boolean, message text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v public.genz_visits%rowtype;
  d public.genz_deals%rowtype;
  expected text;
begin
  if auth.uid() is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into v from public.genz_visits where id = p_visit_id for update;
  if not found then return query select false, 'Visit not found'; return; end if;
  select * into d from public.genz_deals where id = v.deal_id;
  if auth.uid() not in (d.buyer_user_id, d.listing_user_id) and not public.genz_is_admin() then raise exception 'DEAL_ACCESS_DENIED'; end if;
  if not public.genz_is_admin() and auth.uid() = v.created_by_user_id then return query select false, 'The other deal participant must verify this visit'; return; end if;
  if v.status = 'verified' then return query select true, 'Visit already verified'; return; end if;
  if v.attempts >= 5 then return query select false, 'Too many incorrect attempts'; return; end if;
  if now() < v.scheduled_at - interval '2 hours' then return query select false, 'Verification opens two hours before the visit'; return; end if;
  if now() > v.otp_expires_at then return query select false, 'Visit code expired'; return; end if;
  expected := encode(extensions.digest(trim(p_otp) || ':' || v.id::text, 'sha256'), 'hex');
  if expected <> v.otp_hash then
    update public.genz_visits set attempts = least(attempts + 1, 5) where id = v.id;
    return query select false, 'Incorrect visit code'; return;
  end if;
  update public.genz_visits set status='verified', verifier_user_id=auth.uid(), verified_at=now(), latitude=p_latitude, longitude=p_longitude where id=v.id;
  update public.genz_deals set status = case when status='accepted' then 'visit_verified' else status end, updated_at=now() where id=v.deal_id;
  update public.genz_profiles set verified_visits = verified_visits + 1, updated_at=now() where id in (d.buyer_user_id, d.listing_user_id);
  insert into public.genz_deal_events(id, deal_id, actor_user_id, event_type, label)
  values ('EV-' || replace(extensions.gen_random_uuid()::text,'-',''), v.deal_id, auth.uid(), 'visit_verified', 'Site visit verified by one-time code');
  return query select true, 'Visit verified';
end;
$$;
revoke all on function public.genz_verify_visit(uuid,text,numeric,numeric) from public, anon;
grant execute on function public.genz_verify_visit(uuid,text,numeric,numeric) to authenticated;

alter table public.genz_properties add column if not exists locality text;
alter table public.genz_properties add column if not exists latitude numeric(9,6);
alter table public.genz_properties add column if not exists longitude numeric(9,6);
create index if not exists idx_genz_properties_geo on public.genz_properties(city, locality) where status='active';

create table if not exists public.genz_property_verifications (
  property_id text primary key references public.genz_properties(id) on delete cascade,
  listing_user_id uuid not null references auth.users(id),
  status text not null default 'draft' check (status in ('draft','submitted','verified','rejected')),
  owner_consent boolean not null default false,
  documents_checked boolean not null default false,
  location_checked boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 1200),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.genz_property_verifications enable row level security;
create policy "listing broker or admin reads verification" on public.genz_property_verifications for select to authenticated
using (public.genz_is_member() and (auth.uid() = listing_user_id or public.genz_is_admin()));
grant select on public.genz_property_verifications to authenticated;

create table if not exists public.genz_property_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  property_id text not null references public.genz_properties(id) on delete cascade,
  uploaded_by_user_id uuid not null references auth.users(id),
  document_type text not null,
  file_name text not null,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
alter table public.genz_property_documents enable row level security;
create policy "listing broker or admin reads document metadata" on public.genz_property_documents for select to authenticated
using (public.genz_is_member() and (uploaded_by_user_id = auth.uid() or public.genz_is_admin()));
create policy "listing broker inserts own document metadata" on public.genz_property_documents for insert to authenticated
with check (public.genz_is_member() and uploaded_by_user_id=auth.uid() and exists(select 1 from public.genz_properties p where p.id=property_id and p.listing_user_id=auth.uid()));
create policy "listing broker deletes own document metadata" on public.genz_property_documents for delete to authenticated
using (public.genz_is_member() and (uploaded_by_user_id=auth.uid() or public.genz_is_admin()));
grant select, insert, delete on public.genz_property_documents to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('genz-property-docs','genz-property-docs',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public=false, file_size_limit=10485760, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "genz property docs upload" on storage.objects;
create policy "genz property docs upload" on storage.objects for insert to authenticated
with check (bucket_id='genz-property-docs' and public.genz_is_member() and split_part(name,'/',1)=auth.uid()::text);
drop policy if exists "genz property docs read" on storage.objects;
create policy "genz property docs read" on storage.objects for select to authenticated
using (bucket_id='genz-property-docs' and public.genz_is_member() and (split_part(name,'/',1)=auth.uid()::text or public.genz_is_admin()));
drop policy if exists "genz property docs delete" on storage.objects;
create policy "genz property docs delete" on storage.objects for delete to authenticated
using (bucket_id='genz-property-docs' and public.genz_is_member() and (split_part(name,'/',1)=auth.uid()::text or public.genz_is_admin()));

create or replace function public.genz_submit_property_verification(p_property_id text, p_owner_consent boolean, p_documents_checked boolean, p_location_checked boolean, p_notes text default '')
returns void language plpgsql security definer set search_path=public as $$
declare p public.genz_properties%rowtype;
begin
  if auth.uid() is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into p from public.genz_properties where id=p_property_id;
  if not found then raise exception 'PROPERTY_NOT_FOUND'; end if;
  if p.listing_user_id <> auth.uid() and not public.genz_is_admin() then raise exception 'PROPERTY_ACCESS_DENIED'; end if;
  insert into public.genz_property_verifications(property_id,listing_user_id,status,owner_consent,documents_checked,location_checked,notes,submitted_at,updated_at)
  values (p.id,p.listing_user_id,'submitted',p_owner_consent,p_documents_checked,p_location_checked,left(coalesce(p_notes,''),1200),now(),now())
  on conflict(property_id) do update set status='submitted', owner_consent=excluded.owner_consent, documents_checked=excluded.documents_checked, location_checked=excluded.location_checked, notes=excluded.notes, submitted_at=now(), updated_at=now(), reviewed_at=null, reviewed_by_user_id=null;
  update public.genz_properties set mandate_status='pending', updated_at=now() where id=p.id;
end;
$$;
revoke all on function public.genz_submit_property_verification(text,boolean,boolean,boolean,text) from public, anon;
grant execute on function public.genz_submit_property_verification(text,boolean,boolean,boolean,text) to authenticated;

create or replace function public.genz_admin_review_property_verification(p_property_id text, p_status text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.genz_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_status not in ('verified','rejected') then raise exception 'INVALID_STATUS'; end if;
  update public.genz_property_verifications set status=p_status, reviewed_at=now(), reviewed_by_user_id=auth.uid(), updated_at=now() where property_id=p_property_id;
  if not found then raise exception 'VERIFICATION_NOT_FOUND'; end if;
  update public.genz_properties set mandate_status=case when p_status='verified' then 'verified' else 'pending' end, updated_at=now() where id=p_property_id;
end;
$$;
revoke all on function public.genz_admin_review_property_verification(text,text) from public, anon;
grant execute on function public.genz_admin_review_property_verification(text,text) to authenticated;

create table if not exists public.genz_builders (
  id uuid primary key default extensions.gen_random_uuid(), name text not null, city text not null,
  rera_number text, website text, verified boolean not null default false,
  created_by_user_id uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.genz_builder_projects (
  id uuid primary key default extensions.gen_random_uuid(), builder_id uuid not null references public.genz_builders(id) on delete cascade,
  name text not null, city text not null, locality text, property_type text not null,
  min_price numeric not null check (min_price >= 0), max_price numeric not null check (max_price >= min_price),
  min_size integer not null default 0 check (min_size >= 0), max_size integer not null default 0 check (max_size >= 0),
  brokerage_pct numeric(5,2) not null default 0 check (brokerage_pct between 0 and 100), inventory_units integer not null default 0 check (inventory_units >= 0),
  status text not null default 'active' check (status in ('active','paused','sold_out','archived')),
  created_by_user_id uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.genz_builders enable row level security;
alter table public.genz_builder_projects enable row level security;
create policy "members read builders" on public.genz_builders for select to authenticated using (public.genz_is_member());
create policy "admin creates builders" on public.genz_builders for insert to authenticated with check (public.genz_is_admin() and created_by_user_id=auth.uid());
create policy "admin updates builders" on public.genz_builders for update to authenticated using (public.genz_is_admin()) with check (public.genz_is_admin());
create policy "members read builder projects" on public.genz_builder_projects for select to authenticated using (public.genz_is_member());
create policy "admin creates builder projects" on public.genz_builder_projects for insert to authenticated with check (public.genz_is_admin() and created_by_user_id=auth.uid());
create policy "admin updates builder projects" on public.genz_builder_projects for update to authenticated using (public.genz_is_admin()) with check (public.genz_is_admin());
grant select, insert, update on public.genz_builders to authenticated;
grant select, insert, update on public.genz_builder_projects to authenticated;

-- Bind a deal's listing broker to the selected property's real listing broker.
drop policy if exists "deal participant creates valid room" on public.genz_deals;
create policy "deal participant creates valid room" on public.genz_deals for insert to authenticated
with check (
  public.genz_is_member()
  and (auth.uid() = buyer_user_id or auth.uid() = listing_user_id)
  and exists (
    select 1 from public.genz_requirements r
    join public.genz_properties p on p.id = property_id
    where r.id = requirement_id and r.source_user_id = buyer_user_id and p.listing_user_id = listing_user_id and r.status='active' and p.status='active'
  )
);
