-- GENZ advanced Deal Room foundation: explicit participant permissions, immutable negotiation records, proof evidence and structured closeouts.

create table if not exists public.genz_deal_participants (
  deal_id text not null references public.genz_deals(id) on delete cascade,
  user_id uuid not null references public.genz_profiles(id) on delete cascade,
  role text not null check (role in ('buyer_broker','listing_broker','referral_broker','observer')),
  status text not null default 'active' check (status in ('active','invited','declined','removed')),
  can_offer boolean not null default false,
  can_message boolean not null default true,
  can_add_evidence boolean not null default false,
  can_manage_visit boolean not null default false,
  can_close boolean not null default false,
  can_view_financials boolean not null default false,
  can_manage_participants boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (deal_id,user_id)
);
create index if not exists genz_deal_participants_user_idx on public.genz_deal_participants(user_id,status,updated_at desc);

create or replace function public.genz_seed_deal_participants()
returns trigger language plpgsql security definer set search_path='pg_catalog','public' as $$
begin
  insert into public.genz_deal_participants(deal_id,user_id,role,status,can_offer,can_message,can_add_evidence,can_manage_visit,can_close,can_view_financials,can_manage_participants)
  values(new.id,new.buyer_user_id,'buyer_broker','active',true,true,true,true,true,true,true)
  on conflict(deal_id,user_id) do update set role='buyer_broker',status='active',can_offer=true,can_message=true,can_add_evidence=true,can_manage_visit=true,can_close=true,can_view_financials=true,can_manage_participants=true,updated_at=now();
  insert into public.genz_deal_participants(deal_id,user_id,role,status,can_offer,can_message,can_add_evidence,can_manage_visit,can_close,can_view_financials,can_manage_participants)
  values(new.id,new.listing_user_id,'listing_broker','active',true,true,true,true,true,true,true)
  on conflict(deal_id,user_id) do update set role=case when genz_deal_participants.role='buyer_broker' then genz_deal_participants.role else 'listing_broker' end,status='active',can_offer=true,can_message=true,can_add_evidence=true,can_manage_visit=true,can_close=true,can_view_financials=true,can_manage_participants=true,updated_at=now();
  return new;
end; $$;
drop trigger if exists genz_deals_seed_participants_after_insert on public.genz_deals;
create trigger genz_deals_seed_participants_after_insert after insert on public.genz_deals for each row execute function public.genz_seed_deal_participants();

insert into public.genz_deal_participants(deal_id,user_id,role,status,can_offer,can_message,can_add_evidence,can_manage_visit,can_close,can_view_financials,can_manage_participants)
select d.id,d.buyer_user_id,'buyer_broker','active',true,true,true,true,true,true,true from public.genz_deals d
on conflict(deal_id,user_id) do nothing;
insert into public.genz_deal_participants(deal_id,user_id,role,status,can_offer,can_message,can_add_evidence,can_manage_visit,can_close,can_view_financials,can_manage_participants)
select d.id,d.listing_user_id,'listing_broker','active',true,true,true,true,true,true,true from public.genz_deals d
on conflict(deal_id,user_id) do nothing;

create or replace function public.genz_deal_has_permission(p_deal_id text,p_permission text,p_user_id uuid default null)
returns boolean language plpgsql stable security definer set search_path='pg_catalog','public' as $$
declare v_user uuid:=coalesce(p_user_id,auth.uid()); v_allowed boolean:=false;
begin
  if v_user is null then return false; end if;
  if public.genz_is_admin() and (p_user_id is null or p_user_id=auth.uid()) then return true; end if;
  select case p_permission
    when 'read' then true
    when 'offer' then dp.can_offer
    when 'message' then dp.can_message
    when 'evidence' then dp.can_add_evidence
    when 'visit' then dp.can_manage_visit
    when 'close' then dp.can_close
    when 'financials' then dp.can_view_financials
    when 'manage_participants' then dp.can_manage_participants
    else false end into v_allowed
  from public.genz_deal_participants dp where dp.deal_id=p_deal_id and dp.user_id=v_user and dp.status='active';
  return coalesce(v_allowed,false);
end; $$;
revoke all on function public.genz_deal_has_permission(text,text,uuid) from public,anon;
grant execute on function public.genz_deal_has_permission(text,text,uuid) to authenticated,service_role;

alter table public.genz_deal_participants enable row level security;
drop policy if exists "deal participants read participant matrix" on public.genz_deal_participants;
create policy "deal participants read participant matrix" on public.genz_deal_participants for select to authenticated using(public.genz_deal_has_permission(deal_id,'read') or user_id=(select auth.uid()));
grant select on public.genz_deal_participants to authenticated;
revoke insert,update,delete on public.genz_deal_participants from authenticated,anon;

-- Correct the old direct-room policy so the selected property must really belong to listing_user_id.
drop policy if exists "deal participant creates valid room" on public.genz_deals;
create policy "deal participant creates valid room" on public.genz_deals for insert to authenticated with check(
  public.genz_is_member()
  and (select auth.uid()) in (buyer_user_id,listing_user_id)
  and exists(
    select 1 from public.genz_requirements r join public.genz_properties p on p.id=genz_deals.property_id
    where r.id=genz_deals.requirement_id
      and r.source_user_id=genz_deals.buyer_user_id
      and p.listing_user_id=genz_deals.listing_user_id
      and r.status='active' and p.status='active'
  )
);

create table if not exists public.genz_deal_offers (
  id uuid primary key default gen_random_uuid(),
  deal_id text not null references public.genz_deals(id) on delete cascade,
  parent_offer_id uuid references public.genz_deal_offers(id) on delete set null,
  offered_by_user_id uuid not null references public.genz_profiles(id) on delete restrict,
  amount numeric(16,2) not null check(amount>0),
  note text not null default '' check(char_length(note)<=800),
  status text not null default 'proposed' check(status in ('proposed','accepted','rejected','countered','withdrawn','expired','superseded')),
  valid_until timestamptz not null,
  responded_by_user_id uuid references public.genz_profiles(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists genz_deal_offers_deal_idx on public.genz_deal_offers(deal_id,created_at desc);
create index if not exists genz_deal_offers_status_idx on public.genz_deal_offers(deal_id,status,valid_until);
create index if not exists genz_deal_offers_offered_by_idx on public.genz_deal_offers(offered_by_user_id,created_at desc);
create index if not exists genz_deal_offers_parent_idx on public.genz_deal_offers(parent_offer_id) where parent_offer_id is not null;
alter table public.genz_deal_offers enable row level security;
create policy "deal participants read offers" on public.genz_deal_offers for select to authenticated using(public.genz_deal_has_permission(deal_id,'read'));
grant select on public.genz_deal_offers to authenticated;
revoke insert,update,delete on public.genz_deal_offers from authenticated,anon;

create table if not exists public.genz_deal_messages (
  id uuid primary key default gen_random_uuid(),
  deal_id text not null references public.genz_deals(id) on delete cascade,
  sender_user_id uuid not null references public.genz_profiles(id) on delete restrict,
  reply_to_message_id uuid references public.genz_deal_messages(id) on delete set null,
  body text not null check(char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists genz_deal_messages_deal_idx on public.genz_deal_messages(deal_id,created_at);
create index if not exists genz_deal_messages_sender_idx on public.genz_deal_messages(sender_user_id,created_at desc);
create index if not exists genz_deal_messages_reply_idx on public.genz_deal_messages(reply_to_message_id) where reply_to_message_id is not null;
alter table public.genz_deal_messages enable row level security;
create policy "deal participants read messages" on public.genz_deal_messages for select to authenticated using(public.genz_deal_has_permission(deal_id,'read'));
grant select on public.genz_deal_messages to authenticated;
revoke insert,update,delete on public.genz_deal_messages from authenticated,anon;

create table if not exists public.genz_deal_evidence (
  id uuid primary key default gen_random_uuid(),
  deal_id text not null references public.genz_deals(id) on delete cascade,
  added_by_user_id uuid not null references public.genz_profiles(id) on delete restrict,
  evidence_type text not null check(evidence_type in ('note','document','image','visit','offer','payment','other')),
  title text not null check(char_length(title) between 1 and 160),
  note text not null default '' check(char_length(note)<=1200),
  storage_bucket text not null default 'genz-property-docs',
  storage_path text,
  original_name text not null default '' check(char_length(original_name)<=240),
  mime_type text not null default '' check(char_length(mime_type)<=120),
  size_bytes bigint not null default 0 check(size_bytes between 0 and 10485760),
  created_at timestamptz not null default now(),
  check(storage_path is not null or evidence_type='note')
);
create unique index if not exists genz_deal_evidence_storage_uq on public.genz_deal_evidence(storage_path) where storage_path is not null;
create index if not exists genz_deal_evidence_deal_idx on public.genz_deal_evidence(deal_id,created_at desc);
create index if not exists genz_deal_evidence_actor_idx on public.genz_deal_evidence(added_by_user_id,created_at desc);
alter table public.genz_deal_evidence enable row level security;
create policy "deal participants read evidence" on public.genz_deal_evidence for select to authenticated using(public.genz_deal_has_permission(deal_id,'read'));
grant select on public.genz_deal_evidence to authenticated;
revoke insert,update,delete on public.genz_deal_evidence from authenticated,anon;

create table if not exists public.genz_deal_closeouts (
  id uuid primary key default gen_random_uuid(),
  deal_id text not null references public.genz_deals(id) on delete cascade,
  version integer not null check(version>0),
  outcome text not null check(outcome in ('failed','withdrawn','expired','duplicate')),
  reason_code text not null check(reason_code in ('price_not_agreed','buyer_unresponsive','seller_unresponsive','property_unavailable','financing_failed','documentation_issue','commission_not_agreed','duplicate_opportunity','expired_requirement','other')),
  note text not null default '' check(char_length(note)<=1200),
  status text not null default 'proposed' check(status in ('proposed','confirmed','rejected','superseded')),
  proposed_by_user_id uuid not null references public.genz_profiles(id) on delete restrict,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(deal_id,version)
);
create table if not exists public.genz_deal_closeout_acceptances (
  closeout_id uuid not null references public.genz_deal_closeouts(id) on delete cascade,
  user_id uuid not null references public.genz_profiles(id) on delete cascade,
  decision text not null check(decision in ('accepted','rejected')),
  note text not null default '' check(char_length(note)<=800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(closeout_id,user_id)
);
create index if not exists genz_deal_closeouts_deal_idx on public.genz_deal_closeouts(deal_id,version desc);
create index if not exists genz_deal_closeouts_proposer_idx on public.genz_deal_closeouts(proposed_by_user_id,created_at desc);
create index if not exists genz_deal_closeout_accept_user_idx on public.genz_deal_closeout_acceptances(user_id,updated_at desc);
alter table public.genz_deal_closeouts enable row level security;
alter table public.genz_deal_closeout_acceptances enable row level security;
create policy "deal participants read closeouts" on public.genz_deal_closeouts for select to authenticated using(public.genz_deal_has_permission(deal_id,'read'));
create policy "deal participants read closeout decisions" on public.genz_deal_closeout_acceptances for select to authenticated using(exists(select 1 from public.genz_deal_closeouts c where c.id=closeout_id and public.genz_deal_has_permission(c.deal_id,'read')));
grant select on public.genz_deal_closeouts,public.genz_deal_closeout_acceptances to authenticated;
revoke insert,update,delete on public.genz_deal_closeouts,public.genz_deal_closeout_acceptances from authenticated,anon;

create or replace function public.genz_create_deal_room_v2(p_requirement_id text,p_property_id text)
returns text language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_uid uuid:=auth.uid(); r public.genz_requirements%rowtype; p public.genz_properties%rowtype; v_id text; v_existing text;
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into r from public.genz_requirements where id=p_requirement_id;
  select * into p from public.genz_properties where id=p_property_id;
  if r.id is null or p.id is null then raise exception 'REQUIREMENT_OR_PROPERTY_NOT_FOUND'; end if;
  if r.status<>'active' or p.status<>'active' then raise exception 'SOURCE_NOT_ACTIVE'; end if;
  if v_uid not in (r.source_user_id,p.listing_user_id) and not public.genz_is_admin() then raise exception 'DEAL_CREATE_DENIED'; end if;
  select id into v_existing from public.genz_deals where requirement_id=r.id and property_id=p.id;
  if v_existing is not null then return v_existing; end if;
  v_id:='DL-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into public.genz_deals(id,requirement_id,property_id,buyer_user_id,listing_user_id,status,listing_share) values(v_id,r.id,p.id,r.source_user_id,p.listing_user_id,'requested',50);
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label) values('EV-'||replace(gen_random_uuid()::text,'-',''),v_id,v_uid,'introduction','Protected broker collaboration requested');
  return v_id;
end; $$;
revoke execute on function public.genz_create_deal_room_v2(text,text) from public,anon;
grant execute on function public.genz_create_deal_room_v2(text,text) to authenticated,service_role;

create or replace function public.genz_deal_room_snapshot()
returns table(deal_id text,requirement_id text,property_id text,status text,last_offer numeric,listing_share integer,created_at timestamptz,requirement_city text,requirement_type text,property_title text,property_city text,property_type text,buyer_broker_code text,buyer_broker_name text,listing_broker_code text,listing_broker_name text,participant_role text,can_offer boolean,can_message boolean,can_add_evidence boolean,can_manage_visit boolean,can_close boolean)
language sql stable security definer set search_path='pg_catalog','public' as $$
  select d.id,d.requirement_id,d.property_id,d.status,d.last_offer,d.listing_share,d.created_at,r.city,r.property_type,p.title,p.city,p.property_type,bp.broker_code,bp.display_name,lp.broker_code,lp.display_name,dp.role,dp.can_offer,dp.can_message,dp.can_add_evidence,dp.can_manage_visit,dp.can_close
  from public.genz_deals d
  join public.genz_deal_participants dp on dp.deal_id=d.id and dp.user_id=auth.uid() and dp.status='active'
  join public.genz_requirements r on r.id=d.requirement_id
  join public.genz_properties p on p.id=d.property_id
  join public.genz_profiles bp on bp.id=d.buyer_user_id
  join public.genz_profiles lp on lp.id=d.listing_user_id
  where public.genz_is_member()
  order by d.updated_at desc,d.created_at desc;
$$;
revoke execute on function public.genz_deal_room_snapshot() from public,anon;
grant execute on function public.genz_deal_room_snapshot() to authenticated,service_role;
