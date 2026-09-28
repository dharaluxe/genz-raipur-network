-- GENZ Phase 2.3: two-party closing confirmation and idempotent earned entitlements.

alter table public.genz_commission_ledger
  add column if not exists source_key text;
create unique index if not exists idx_genz_commission_ledger_source_key
  on public.genz_commission_ledger(source_key) where source_key is not null;

create table if not exists public.genz_deal_closings (
  id uuid primary key default extensions.gen_random_uuid(),
  deal_id text not null references public.genz_deals(id) on delete cascade,
  agreement_id uuid not null references public.genz_commission_agreements(id) on delete restrict,
  version integer not null check (version > 0),
  final_price numeric(16,2) not null check (final_price > 0),
  status text not null default 'proposed' check (status in ('proposed','confirmed','rejected','superseded')),
  proof_type text not null default 'other' check (proof_type in ('booking','agreement','registry','builder_booking','other')),
  proof_reference text not null default '' check (char_length(proof_reference) <= 500),
  proposed_by_user_id uuid not null references auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(deal_id,version)
);

create table if not exists public.genz_deal_closing_acceptances (
  closing_id uuid not null references public.genz_deal_closings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null check (decision in ('accepted','rejected')),
  note text not null default '' check (char_length(note) <= 800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(closing_id,user_id)
);

create index if not exists idx_genz_deal_closings_deal on public.genz_deal_closings(deal_id,version desc);
create index if not exists idx_genz_deal_closings_agreement on public.genz_deal_closings(agreement_id,created_at desc);
create index if not exists idx_genz_deal_closings_proposer on public.genz_deal_closings(proposed_by_user_id,created_at desc);
create index if not exists idx_genz_closing_acceptances_user on public.genz_deal_closing_acceptances(user_id,updated_at desc);

alter table public.genz_deal_closings enable row level security;
alter table public.genz_deal_closing_acceptances enable row level security;

create policy "commission participants read closings" on public.genz_deal_closings
for select to authenticated using (public.genz_can_access_commission_deal(deal_id));
create policy "commission participants read closing acceptances" on public.genz_deal_closing_acceptances
for select to authenticated using (
  exists(select 1 from public.genz_deal_closings c where c.id=closing_id and public.genz_can_access_commission_deal(c.deal_id))
);

grant select on public.genz_deal_closings,public.genz_deal_closing_acceptances to authenticated;
revoke insert,update,delete on public.genz_deal_closings,public.genz_deal_closing_acceptances from authenticated,anon;

create or replace function public.genz_materialize_closing_entitlements(p_closing_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  c public.genz_deal_closings%rowtype;
  a public.genz_commission_agreements%rowtype;
  pool numeric(16,2);
  r record;
  allocated numeric(16,2):=0;
  broker_amount numeric(16,2);
  row_count integer;
  row_index integer:=0;
begin
  select * into c from public.genz_deal_closings where id=p_closing_id;
  if not found or c.status<>'confirmed' then raise exception 'CONFIRMED_CLOSING_REQUIRED'; end if;
  select * into a from public.genz_commission_agreements where id=c.agreement_id;
  if not found or a.status<>'accepted' then raise exception 'ACCEPTED_COMMISSION_AGREEMENT_REQUIRED'; end if;
  pool:=case when a.method='fixed' then round(a.fixed_amount,2) else round(c.final_price*a.percentage/100.0,2) end;
  if pool is null or pool<=0 then raise exception 'INVALID_COMMISSION_POOL'; end if;
  select count(*) into row_count from public.genz_commission_allocations x where x.agreement_id=a.id;
  if row_count<2 then raise exception 'COMMISSION_ALLOCATIONS_REQUIRED'; end if;
  for r in select * from public.genz_commission_allocations x where x.agreement_id=a.id order by x.sequence,x.id loop
    row_index:=row_index+1;
    if row_index=row_count then broker_amount:=round(pool-allocated,2); else broker_amount:=round(pool*r.share_percent/100.0,2); allocated:=allocated+broker_amount; end if;
    insert into public.genz_commission_ledger(deal_id,agreement_id,broker_user_id,entry_type,amount,status,reference,note,created_by_user_id,source_key)
    values(c.deal_id,a.id,r.broker_user_id,'earned',broker_amount,'confirmed','Closing v'||c.version,'Earned from confirmed GENZ closing at ₹'||c.final_price::text,c.proposed_by_user_id,'closing:'||c.id::text||':earned:'||r.broker_user_id::text)
    on conflict (source_key) where source_key is not null do nothing;
  end loop;
end;
$$;
revoke all on function public.genz_materialize_closing_entitlements(uuid) from public,anon,authenticated;

create or replace function public.genz_propose_deal_closing(
  p_deal_id text,
  p_final_price numeric,
  p_proof_type text default 'other',
  p_proof_reference text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  d public.genz_deals%rowtype;
  agreement_id uuid;
  closing_id uuid;
  new_version integer;
  participant_count integer;
  accepted_count integer;
begin
  if (select auth.uid()) is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into d from public.genz_deals where id=p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if (select auth.uid()) not in (d.buyer_user_id,d.listing_user_id) and not public.genz_is_admin() then raise exception 'DEAL_ACCESS_DENIED'; end if;
  if d.status='closed' then raise exception 'DEAL_ALREADY_CLOSED'; end if;
  if p_final_price is null or p_final_price<=0 then raise exception 'INVALID_FINAL_PRICE'; end if;
  if p_proof_type not in ('booking','agreement','registry','builder_booking','other') then raise exception 'INVALID_PROOF_TYPE'; end if;
  select a.id into agreement_id from public.genz_commission_agreements a where a.deal_id=p_deal_id and a.status='accepted' order by a.version desc limit 1;
  if agreement_id is null then raise exception 'ACCEPTED_COMMISSION_AGREEMENT_REQUIRED'; end if;
  select coalesce(max(version),0)+1 into new_version from public.genz_deal_closings where deal_id=p_deal_id;
  insert into public.genz_deal_closings(deal_id,agreement_id,version,final_price,proof_type,proof_reference,proposed_by_user_id)
  values(p_deal_id,agreement_id,new_version,round(p_final_price,2),p_proof_type,left(coalesce(p_proof_reference,''),500),(select auth.uid()))
  returning id into closing_id;
  insert into public.genz_deal_closing_acceptances(closing_id,user_id,decision,note)
  values(closing_id,(select auth.uid()),'accepted','Closing proposer confirmation');
  select count(distinct x) into participant_count from unnest(array[d.buyer_user_id,d.listing_user_id]) x;
  select count(*) into accepted_count from public.genz_deal_closing_acceptances ca where ca.closing_id=closing_id and ca.decision='accepted' and ca.user_id in (d.buyer_user_id,d.listing_user_id);
  if accepted_count>=participant_count then
    update public.genz_deal_closings set status='confirmed',confirmed_at=now(),updated_at=now() where id=closing_id;
    update public.genz_deals set status='closed',last_offer=round(p_final_price,2),updated_at=now() where id=p_deal_id;
    perform public.genz_materialize_closing_entitlements(closing_id);
  end if;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
  values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),p_deal_id,(select auth.uid()),'closing_proposed','Closing v'||new_version||' proposed at ₹'||round(p_final_price,2)::text);
  return closing_id;
end;
$$;
revoke all on function public.genz_propose_deal_closing(text,numeric,text,text) from public,anon;
grant execute on function public.genz_propose_deal_closing(text,numeric,text,text) to authenticated;

create or replace function public.genz_respond_deal_closing(
  p_closing_id uuid,
  p_accept boolean,
  p_note text default ''
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  c public.genz_deal_closings%rowtype;
  d public.genz_deals%rowtype;
  participant_count integer;
  accepted_count integer;
begin
  if (select auth.uid()) is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into c from public.genz_deal_closings where id=p_closing_id for update;
  if not found then raise exception 'CLOSING_NOT_FOUND'; end if;
  select * into d from public.genz_deals where id=c.deal_id for update;
  if (select auth.uid()) not in (d.buyer_user_id,d.listing_user_id) and not public.genz_is_admin() then raise exception 'DEAL_ACCESS_DENIED'; end if;
  if c.status<>'proposed' then return c.status; end if;
  insert into public.genz_deal_closing_acceptances(closing_id,user_id,decision,note)
  values(c.id,(select auth.uid()),case when p_accept then 'accepted' else 'rejected' end,left(coalesce(p_note,''),800))
  on conflict(closing_id,user_id) do update set decision=excluded.decision,note=excluded.note,updated_at=now();
  if not p_accept then
    update public.genz_deal_closings set status='rejected',updated_at=now() where id=c.id;
    insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
    values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),c.deal_id,(select auth.uid()),'closing_rejected','Closing v'||c.version||' rejected; revised closing required');
    return 'rejected';
  end if;
  select count(distinct x) into participant_count from unnest(array[d.buyer_user_id,d.listing_user_id]) x;
  select count(*) into accepted_count from public.genz_deal_closing_acceptances ca where ca.closing_id=c.id and ca.decision='accepted' and ca.user_id in (d.buyer_user_id,d.listing_user_id);
  if accepted_count>=participant_count then
    update public.genz_deal_closings set status='superseded',updated_at=now() where deal_id=c.deal_id and status='confirmed' and id<>c.id;
    update public.genz_deal_closings set status='confirmed',confirmed_at=now(),updated_at=now() where id=c.id;
    update public.genz_deals set status='closed',last_offer=c.final_price,updated_at=now() where id=c.deal_id;
    perform public.genz_materialize_closing_entitlements(c.id);
    insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
    values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),c.deal_id,(select auth.uid()),'closing_confirmed','Closing v'||c.version||' confirmed at ₹'||c.final_price::text||'; commission entitlements earned');
    return 'confirmed';
  end if;
  return 'proposed';
end;
$$;
revoke all on function public.genz_respond_deal_closing(uuid,boolean,text) from public,anon;
grant execute on function public.genz_respond_deal_closing(uuid,boolean,text) to authenticated;
