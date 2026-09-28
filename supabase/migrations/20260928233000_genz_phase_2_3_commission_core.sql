-- GENZ Network Phase 2.3: commission, referral and dispute foundation.
-- New agreements support transparent fixed or percentage brokerage only.
-- Legacy above-owner-net records remain readable in the old pilot model but are not a V2 agreement method.

create table if not exists public.genz_commission_agreements (
  id uuid primary key default extensions.gen_random_uuid(),
  deal_id text not null references public.genz_deals(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected','superseded')),
  method text not null check (method in ('fixed','percentage')),
  fixed_amount numeric(14,2),
  percentage numeric(7,4),
  fee_payer text not null check (fee_payer in ('seller','buyer','builder','both','other')),
  due_date date,
  terms text not null default '' check (char_length(terms) <= 2500),
  proposed_by_user_id uuid not null references auth.users(id),
  effective_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(deal_id,version),
  check (
    (method='fixed' and fixed_amount is not null and fixed_amount > 0 and percentage is null)
    or
    (method='percentage' and percentage is not null and percentage > 0 and percentage <= 100 and fixed_amount is null)
  )
);

create table if not exists public.genz_commission_allocations (
  id uuid primary key default extensions.gen_random_uuid(),
  agreement_id uuid not null references public.genz_commission_agreements(id) on delete cascade,
  deal_id text not null references public.genz_deals(id) on delete cascade,
  broker_user_id uuid not null references public.genz_profiles(id) on delete cascade,
  role text not null check (role in ('buyer_broker','listing_broker','referral_broker')),
  share_percent numeric(5,2) not null check (share_percent > 0 and share_percent <= 100),
  sequence integer not null default 1 check (sequence > 0),
  created_at timestamptz not null default now(),
  unique(agreement_id,broker_user_id,role)
);

create table if not exists public.genz_commission_acceptances (
  agreement_id uuid not null references public.genz_commission_agreements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null check (decision in ('accepted','rejected')),
  note text not null default '' check (char_length(note) <= 800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(agreement_id,user_id)
);

create table if not exists public.genz_referral_links (
  id uuid primary key default extensions.gen_random_uuid(),
  deal_id text not null references public.genz_deals(id) on delete cascade,
  broker_user_id uuid not null references public.genz_profiles(id) on delete cascade,
  introduced_by_user_id uuid not null references auth.users(id),
  protection_expires_at timestamptz,
  note text not null default '' check (char_length(note) <= 800),
  created_at timestamptz not null default now(),
  unique(deal_id,broker_user_id)
);

create table if not exists public.genz_commission_ledger (
  id uuid primary key default extensions.gen_random_uuid(),
  deal_id text not null references public.genz_deals(id) on delete cascade,
  agreement_id uuid references public.genz_commission_agreements(id) on delete set null,
  broker_user_id uuid not null references public.genz_profiles(id) on delete cascade,
  entry_type text not null check (entry_type in ('expected','earned','invoice','payment','refund','adjustment')),
  amount numeric(14,2) not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','confirmed','disputed','void')),
  reference text,
  note text not null default '' check (char_length(note) <= 1200),
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.genz_commission_disputes (
  id uuid primary key default extensions.gen_random_uuid(),
  deal_id text not null references public.genz_deals(id) on delete cascade,
  agreement_id uuid references public.genz_commission_agreements(id) on delete set null,
  raised_by_user_id uuid not null references auth.users(id),
  against_user_id uuid references public.genz_profiles(id) on delete set null,
  amount_disputed numeric(14,2) check (amount_disputed is null or amount_disputed >= 0),
  reason text not null check (char_length(reason) between 10 and 2000),
  status text not null default 'open' check (status in ('open','evidence_requested','resolved','rejected')),
  resolution text not null default '' check (char_length(resolution) <= 2000),
  resolved_by_user_id uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_genz_commission_agreements_deal on public.genz_commission_agreements(deal_id,version desc);
create index if not exists idx_genz_commission_allocations_deal on public.genz_commission_allocations(deal_id,agreement_id);
create index if not exists idx_genz_commission_allocations_broker on public.genz_commission_allocations(broker_user_id,created_at desc);
create index if not exists idx_genz_commission_acceptances_user on public.genz_commission_acceptances(user_id,updated_at desc);
create index if not exists idx_genz_referral_links_broker on public.genz_referral_links(broker_user_id,created_at desc);
create index if not exists idx_genz_commission_ledger_broker on public.genz_commission_ledger(broker_user_id,created_at desc);
create index if not exists idx_genz_commission_ledger_deal on public.genz_commission_ledger(deal_id,created_at desc);
create index if not exists idx_genz_commission_disputes_deal on public.genz_commission_disputes(deal_id,status,created_at desc);
create index if not exists idx_genz_commission_disputes_raised_by on public.genz_commission_disputes(raised_by_user_id,created_at desc);
create index if not exists idx_genz_commission_disputes_against on public.genz_commission_disputes(against_user_id,created_at desc) where against_user_id is not null;

create or replace function public.genz_can_access_commission_deal(p_deal_id text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    public.genz_is_admin()
    or exists(
      select 1 from public.genz_deals d
      where d.id=p_deal_id and (select auth.uid()) in (d.buyer_user_id,d.listing_user_id)
    )
    or exists(
      select 1 from public.genz_referral_links r
      where r.deal_id=p_deal_id and ((select auth.uid())=r.broker_user_id or (select auth.uid())=r.introduced_by_user_id)
    )
    or exists(
      select 1 from public.genz_commission_allocations a
      where a.deal_id=p_deal_id and a.broker_user_id=(select auth.uid())
    );
$$;
revoke all on function public.genz_can_access_commission_deal(text) from public,anon;
grant execute on function public.genz_can_access_commission_deal(text) to authenticated;

alter table public.genz_commission_agreements enable row level security;
alter table public.genz_commission_allocations enable row level security;
alter table public.genz_commission_acceptances enable row level security;
alter table public.genz_referral_links enable row level security;
alter table public.genz_commission_ledger enable row level security;
alter table public.genz_commission_disputes enable row level security;

create policy "commission deal members read agreements" on public.genz_commission_agreements for select to authenticated
using (public.genz_can_access_commission_deal(deal_id));
create policy "commission deal members read allocations" on public.genz_commission_allocations for select to authenticated
using (public.genz_can_access_commission_deal(deal_id) or broker_user_id=(select auth.uid()));
create policy "commission deal members read acceptances" on public.genz_commission_acceptances for select to authenticated
using (exists(select 1 from public.genz_commission_agreements a where a.id=agreement_id and public.genz_can_access_commission_deal(a.deal_id)));
create policy "referral participants read links" on public.genz_referral_links for select to authenticated
using (public.genz_can_access_commission_deal(deal_id) or broker_user_id=(select auth.uid()) or introduced_by_user_id=(select auth.uid()));
create policy "commission participants read ledger" on public.genz_commission_ledger for select to authenticated
using (public.genz_can_access_commission_deal(deal_id) or broker_user_id=(select auth.uid()));
create policy "commission participants read disputes" on public.genz_commission_disputes for select to authenticated
using (public.genz_can_access_commission_deal(deal_id) or raised_by_user_id=(select auth.uid()) or against_user_id=(select auth.uid()));

grant select on public.genz_commission_agreements,public.genz_commission_allocations,public.genz_commission_acceptances,public.genz_referral_links,public.genz_commission_ledger,public.genz_commission_disputes to authenticated;
revoke insert,update,delete on public.genz_commission_agreements,public.genz_commission_allocations,public.genz_commission_acceptances,public.genz_referral_links,public.genz_commission_ledger,public.genz_commission_disputes from authenticated,anon;

create or replace function public.genz_register_referral_link(
  p_deal_id text,
  p_broker_user_id uuid,
  p_note text default '',
  p_protection_days integer default 30
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  d public.genz_deals%rowtype;
  link_id uuid;
begin
  if (select auth.uid()) is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into d from public.genz_deals where id=p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if (select auth.uid()) not in (d.buyer_user_id,d.listing_user_id) and not public.genz_is_admin() then raise exception 'DEAL_ACCESS_DENIED'; end if;
  if p_broker_user_id in (d.buyer_user_id,d.listing_user_id) then raise exception 'REFERRAL_BROKER_ALREADY_DEAL_PARTICIPANT'; end if;
  if not exists(select 1 from public.genz_profiles p where p.id=p_broker_user_id) then raise exception 'BROKER_NOT_FOUND'; end if;
  insert into public.genz_referral_links(deal_id,broker_user_id,introduced_by_user_id,protection_expires_at,note)
  values(p_deal_id,p_broker_user_id,(select auth.uid()),now()+make_interval(days=>greatest(1,least(p_protection_days,180))),left(coalesce(p_note,''),800))
  on conflict(deal_id,broker_user_id) do update set
    introduced_by_user_id=excluded.introduced_by_user_id,
    protection_expires_at=excluded.protection_expires_at,
    note=excluded.note
  returning id into link_id;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
  values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),p_deal_id,(select auth.uid()),'referral_registered','Referral broker link registered');
  return link_id;
end;
$$;
revoke all on function public.genz_register_referral_link(text,uuid,text,integer) from public,anon;
grant execute on function public.genz_register_referral_link(text,uuid,text,integer) to authenticated;

create or replace function public.genz_propose_commission_agreement(
  p_deal_id text,
  p_method text,
  p_fixed_amount numeric,
  p_percentage numeric,
  p_fee_payer text,
  p_due_date date,
  p_terms text,
  p_allocations jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  d public.genz_deals%rowtype;
  agreement_id uuid;
  new_version integer;
  item jsonb;
  broker_id uuid;
  allocation_role text;
  allocation_share numeric;
  allocation_sequence integer:=0;
  share_total numeric:=0;
  has_buyer boolean:=false;
  has_listing boolean:=false;
  participant_count integer;
  accepted_count integer;
begin
  if (select auth.uid()) is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into d from public.genz_deals where id=p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if (select auth.uid()) not in (d.buyer_user_id,d.listing_user_id) and not public.genz_is_admin() then raise exception 'DEAL_ACCESS_DENIED'; end if;
  if d.status='declined' then raise exception 'DEAL_DECLINED'; end if;
  if p_method not in ('fixed','percentage') then raise exception 'INVALID_COMMISSION_METHOD'; end if;
  if p_method='fixed' and (p_fixed_amount is null or p_fixed_amount<=0 or p_percentage is not null) then raise exception 'INVALID_FIXED_COMMISSION'; end if;
  if p_method='percentage' and (p_percentage is null or p_percentage<=0 or p_percentage>100 or p_fixed_amount is not null) then raise exception 'INVALID_PERCENTAGE_COMMISSION'; end if;
  if p_fee_payer not in ('seller','buyer','builder','both','other') then raise exception 'INVALID_FEE_PAYER'; end if;
  if char_length(coalesce(p_terms,''))>2500 then raise exception 'TERMS_TOO_LONG'; end if;
  if jsonb_typeof(p_allocations)<>'array' or jsonb_array_length(p_allocations)<2 or jsonb_array_length(p_allocations)>10 then raise exception 'INVALID_ALLOCATIONS'; end if;

  for item in select value from jsonb_array_elements(p_allocations) loop
    allocation_sequence:=allocation_sequence+1;
    begin broker_id:=(item->>'brokerUserId')::uuid; exception when others then raise exception 'INVALID_ALLOCATION_BROKER'; end;
    allocation_role:=item->>'role';
    begin allocation_share:=(item->>'sharePercent')::numeric; exception when others then raise exception 'INVALID_ALLOCATION_SHARE'; end;
    if allocation_role not in ('buyer_broker','listing_broker','referral_broker') then raise exception 'INVALID_ALLOCATION_ROLE'; end if;
    if allocation_share is null or allocation_share<=0 or allocation_share>100 then raise exception 'INVALID_ALLOCATION_SHARE'; end if;
    if not exists(select 1 from public.genz_profiles p where p.id=broker_id) then raise exception 'ALLOCATION_BROKER_NOT_FOUND'; end if;
    if allocation_role='buyer_broker' and broker_id<>d.buyer_user_id then raise exception 'BUYER_BROKER_ALLOCATION_MISMATCH'; end if;
    if allocation_role='listing_broker' and broker_id<>d.listing_user_id then raise exception 'LISTING_BROKER_ALLOCATION_MISMATCH'; end if;
    if allocation_role='referral_broker' then
      if broker_id in (d.buyer_user_id,d.listing_user_id) then raise exception 'REFERRAL_BROKER_ALREADY_DEAL_PARTICIPANT'; end if;
      if not exists(select 1 from public.genz_referral_links r where r.deal_id=p_deal_id and r.broker_user_id=broker_id) then raise exception 'REFERRAL_LINK_REQUIRED'; end if;
    end if;
    if allocation_role='buyer_broker' then has_buyer:=true; end if;
    if allocation_role='listing_broker' then has_listing:=true; end if;
    share_total:=share_total+allocation_share;
  end loop;
  if not has_buyer or not has_listing then raise exception 'BUYER_AND_LISTING_ALLOCATIONS_REQUIRED'; end if;
  if round(share_total,2)<>100.00 then raise exception 'ALLOCATIONS_MUST_TOTAL_100'; end if;

  select coalesce(max(version),0)+1 into new_version from public.genz_commission_agreements where deal_id=p_deal_id;
  insert into public.genz_commission_agreements(deal_id,version,method,fixed_amount,percentage,fee_payer,due_date,terms,proposed_by_user_id)
  values(p_deal_id,new_version,p_method,case when p_method='fixed' then round(p_fixed_amount,2) else null end,case when p_method='percentage' then round(p_percentage,4) else null end,p_fee_payer,p_due_date,left(coalesce(p_terms,''),2500),(select auth.uid()))
  returning id into agreement_id;

  allocation_sequence:=0;
  for item in select value from jsonb_array_elements(p_allocations) loop
    allocation_sequence:=allocation_sequence+1;
    broker_id:=(item->>'brokerUserId')::uuid;
    allocation_role:=item->>'role';
    allocation_share:=(item->>'sharePercent')::numeric;
    insert into public.genz_commission_allocations(agreement_id,deal_id,broker_user_id,role,share_percent,sequence)
    values(agreement_id,p_deal_id,broker_id,allocation_role,round(allocation_share,2),allocation_sequence);
  end loop;

  insert into public.genz_commission_acceptances(agreement_id,user_id,decision,note)
  values(agreement_id,(select auth.uid()),'accepted','Proposer acceptance')
  on conflict(agreement_id,user_id) do update set decision='accepted',note='Proposer acceptance',updated_at=now();

  select count(distinct x) into participant_count from unnest(array[d.buyer_user_id,d.listing_user_id]) x;
  select count(*) into accepted_count from public.genz_commission_acceptances a where a.agreement_id=agreement_id and a.decision='accepted' and a.user_id in (d.buyer_user_id,d.listing_user_id);
  if accepted_count>=participant_count then
    update public.genz_commission_agreements set status='superseded',updated_at=now() where deal_id=p_deal_id and status='accepted' and id<>agreement_id;
    update public.genz_commission_agreements set status='accepted',effective_at=now(),updated_at=now() where id=agreement_id;
  end if;

  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
  values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),p_deal_id,(select auth.uid()),'commission_proposed','Commission agreement v'||new_version||' proposed');
  return agreement_id;
end;
$$;
revoke all on function public.genz_propose_commission_agreement(text,text,numeric,numeric,text,date,text,jsonb) from public,anon;
grant execute on function public.genz_propose_commission_agreement(text,text,numeric,numeric,text,date,text,jsonb) to authenticated;

create or replace function public.genz_respond_commission_agreement(
  p_agreement_id uuid,
  p_accept boolean,
  p_note text default ''
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  a public.genz_commission_agreements%rowtype;
  d public.genz_deals%rowtype;
  participant_count integer;
  accepted_count integer;
begin
  if (select auth.uid()) is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into a from public.genz_commission_agreements where id=p_agreement_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  select * into d from public.genz_deals where id=a.deal_id;
  if (select auth.uid()) not in (d.buyer_user_id,d.listing_user_id) and not public.genz_is_admin() then raise exception 'DEAL_ACCESS_DENIED'; end if;
  if a.status<>'proposed' then return a.status; end if;

  insert into public.genz_commission_acceptances(agreement_id,user_id,decision,note)
  values(a.id,(select auth.uid()),case when p_accept then 'accepted' else 'rejected' end,left(coalesce(p_note,''),800))
  on conflict(agreement_id,user_id) do update set decision=excluded.decision,note=excluded.note,updated_at=now();

  if not p_accept then
    update public.genz_commission_agreements set status='rejected',updated_at=now() where id=a.id;
    insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
    values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),a.deal_id,(select auth.uid()),'commission_rejected','Commission agreement v'||a.version||' rejected');
    return 'rejected';
  end if;

  select count(distinct x) into participant_count from unnest(array[d.buyer_user_id,d.listing_user_id]) x;
  select count(*) into accepted_count from public.genz_commission_acceptances ca where ca.agreement_id=a.id and ca.decision='accepted' and ca.user_id in (d.buyer_user_id,d.listing_user_id);
  if accepted_count>=participant_count then
    update public.genz_commission_agreements set status='superseded',updated_at=now() where deal_id=a.deal_id and status='accepted' and id<>a.id;
    update public.genz_commission_agreements set status='accepted',effective_at=now(),updated_at=now() where id=a.id;
    insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
    values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),a.deal_id,(select auth.uid()),'commission_accepted','Commission agreement v'||a.version||' accepted by deal participants');
    return 'accepted';
  end if;
  return 'proposed';
end;
$$;
revoke all on function public.genz_respond_commission_agreement(uuid,boolean,text) from public,anon;
grant execute on function public.genz_respond_commission_agreement(uuid,boolean,text) to authenticated;

create or replace function public.genz_raise_commission_dispute(
  p_deal_id text,
  p_agreement_id uuid default null,
  p_against_user_id uuid default null,
  p_amount_disputed numeric default null,
  p_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare dispute_id uuid;
begin
  if (select auth.uid()) is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  if not public.genz_can_access_commission_deal(p_deal_id) then raise exception 'COMMISSION_ACCESS_DENIED'; end if;
  if char_length(trim(coalesce(p_reason,'')))<10 then raise exception 'DISPUTE_REASON_TOO_SHORT'; end if;
  if p_amount_disputed is not null and p_amount_disputed<0 then raise exception 'INVALID_DISPUTE_AMOUNT'; end if;
  if p_agreement_id is not null and not exists(select 1 from public.genz_commission_agreements a where a.id=p_agreement_id and a.deal_id=p_deal_id) then raise exception 'AGREEMENT_DEAL_MISMATCH'; end if;
  if p_against_user_id is not null and not exists(select 1 from public.genz_profiles p where p.id=p_against_user_id) then raise exception 'BROKER_NOT_FOUND'; end if;
  insert into public.genz_commission_disputes(deal_id,agreement_id,raised_by_user_id,against_user_id,amount_disputed,reason)
  values(p_deal_id,p_agreement_id,(select auth.uid()),p_against_user_id,case when p_amount_disputed is null then null else round(p_amount_disputed,2) end,left(trim(p_reason),2000))
  returning id into dispute_id;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
  values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),p_deal_id,(select auth.uid()),'commission_dispute_opened','Commission dispute opened for admin review');
  return dispute_id;
end;
$$;
revoke all on function public.genz_raise_commission_dispute(text,uuid,uuid,numeric,text) from public,anon;
grant execute on function public.genz_raise_commission_dispute(text,uuid,uuid,numeric,text) to authenticated;

create or replace function public.genz_admin_resolve_commission_dispute(
  p_dispute_id uuid,
  p_status text,
  p_resolution text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare d public.genz_commission_disputes%rowtype;
begin
  if not public.genz_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_status not in ('resolved','rejected') then raise exception 'INVALID_RESOLUTION_STATUS'; end if;
  if char_length(trim(coalesce(p_resolution,'')))<5 then raise exception 'RESOLUTION_REQUIRED'; end if;
  select * into d from public.genz_commission_disputes where id=p_dispute_id for update;
  if not found then raise exception 'DISPUTE_NOT_FOUND'; end if;
  update public.genz_commission_disputes set status=p_status,resolution=left(trim(p_resolution),2000),resolved_by_user_id=(select auth.uid()),resolved_at=now(),updated_at=now() where id=p_dispute_id;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
  values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),d.deal_id,(select auth.uid()),'commission_dispute_resolved','Commission dispute '||p_status||' by admin');
end;
$$;
revoke all on function public.genz_admin_resolve_commission_dispute(uuid,text,text) from public,anon;
grant execute on function public.genz_admin_resolve_commission_dispute(uuid,text,text) to authenticated;
