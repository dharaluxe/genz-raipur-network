-- GENZ Phase 2.3 operations: closing evidence, commission activity, builder payouts.

create table public.genz_closing_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  deal_id text not null references public.genz_deals(id) on delete cascade,
  closing_id uuid not null references public.genz_deal_closings(id) on delete cascade,
  document_type text not null check (document_type in ('booking','agreement','registry','builder_booking','invoice','payment_proof','other')),
  storage_bucket text not null default 'genz-property-docs',
  storage_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 240),
  mime_type text not null default 'application/octet-stream' check (char_length(mime_type) <= 120),
  size_bytes bigint not null default 0 check (size_bytes >= 0 and size_bytes <= 10485760),
  uploaded_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_genz_closing_documents_deal on public.genz_closing_documents(deal_id,created_at desc);
create index idx_genz_closing_documents_closing on public.genz_closing_documents(closing_id,created_at desc);
create index idx_genz_closing_documents_uploader on public.genz_closing_documents(uploaded_by_user_id,created_at desc);

alter table public.genz_closing_documents enable row level security;
create policy "commission participants read closing documents" on public.genz_closing_documents
for select to authenticated using (public.genz_can_access_commission_deal(deal_id));
grant select on public.genz_closing_documents to authenticated;
revoke insert,update,delete on public.genz_closing_documents from authenticated,anon;

-- Existing private bucket upload policy permits a member to upload below their own user-id folder.
-- This additional read policy lets the two deal brokers/admin read closing evidence stored as:
-- <uploader-user-id>/closing/<deal-id>/<file-name>
create policy "genz closing proof participant read" on storage.objects
for select to authenticated using (
  bucket_id='genz-property-docs'
  and (storage.foldername(name))[2]='closing'
  and public.genz_can_access_commission_deal((storage.foldername(name))[3])
);

create table public.genz_builder_payouts (
  id uuid primary key default extensions.gen_random_uuid(),
  deal_id text not null references public.genz_deals(id) on delete cascade,
  project_id uuid not null references public.genz_builder_projects(id) on delete restrict,
  broker_user_id uuid not null references public.genz_profiles(id) on delete restrict,
  amount numeric(16,2) not null check (amount > 0),
  status text not null default 'expected' check (status in ('expected','approved','paid','rejected')),
  reference text not null default '' check (char_length(reference) <= 500),
  note text not null default '' check (char_length(note) <= 1200),
  created_by_user_id uuid not null references auth.users(id),
  approved_by_user_id uuid references auth.users(id),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(deal_id,project_id,broker_user_id)
);

create index idx_genz_builder_payouts_deal on public.genz_builder_payouts(deal_id,updated_at desc);
create index idx_genz_builder_payouts_project on public.genz_builder_payouts(project_id,updated_at desc);
create index idx_genz_builder_payouts_broker on public.genz_builder_payouts(broker_user_id,updated_at desc);
create index idx_genz_builder_payouts_creator on public.genz_builder_payouts(created_by_user_id,updated_at desc);
create index idx_genz_builder_payouts_approver on public.genz_builder_payouts(approved_by_user_id,updated_at desc);

alter table public.genz_builder_payouts enable row level security;
create policy "builder payout participants read" on public.genz_builder_payouts
for select to authenticated using (
  broker_user_id=(select auth.uid())
  or public.genz_can_access_commission_deal(deal_id)
  or exists(
    select 1
    from public.genz_builder_projects p
    where p.id=project_id and public.genz_builder_can_manage(p.builder_id)
  )
);
grant select on public.genz_builder_payouts to authenticated;
revoke insert,update,delete on public.genz_builder_payouts from authenticated,anon;

create or replace function public.genz_register_closing_document(
  p_closing_id uuid,
  p_storage_path text,
  p_document_type text,
  p_original_name text,
  p_mime_type text default 'application/octet-stream',
  p_size_bytes bigint default 0
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  c public.genz_deal_closings%rowtype;
  d public.genz_deals%rowtype;
  document_id uuid;
  expected_prefix text;
begin
  if (select auth.uid()) is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into c from public.genz_deal_closings where id=p_closing_id;
  if not found then raise exception 'CLOSING_NOT_FOUND'; end if;
  select * into d from public.genz_deals where id=c.deal_id;
  if (select auth.uid()) not in (d.buyer_user_id,d.listing_user_id) and not public.genz_is_admin() then raise exception 'DEAL_ACCESS_DENIED'; end if;
  if p_document_type not in ('booking','agreement','registry','builder_booking','invoice','payment_proof','other') then raise exception 'INVALID_DOCUMENT_TYPE'; end if;
  if p_size_bytes is null or p_size_bytes<0 or p_size_bytes>10485760 then raise exception 'INVALID_DOCUMENT_SIZE'; end if;
  expected_prefix:=(select auth.uid())::text||'/closing/'||c.deal_id||'/';
  if p_storage_path is null or position(expected_prefix in p_storage_path)<>1 then raise exception 'INVALID_STORAGE_PATH'; end if;
  insert into public.genz_closing_documents(
    deal_id,closing_id,document_type,storage_path,original_name,mime_type,size_bytes,uploaded_by_user_id
  ) values(
    c.deal_id,c.id,p_document_type,left(coalesce(p_storage_path,''),600),left(coalesce(p_original_name,''),240),left(coalesce(p_mime_type,'application/octet-stream'),120),p_size_bytes,(select auth.uid())
  ) returning id into document_id;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
  values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),c.deal_id,(select auth.uid()),'closing_document_added','Closing evidence added: '||left(coalesce(p_document_type,'other'),40));
  return document_id;
end;
$$;
revoke all on function public.genz_register_closing_document(uuid,text,text,text,text,bigint) from public,anon;
grant execute on function public.genz_register_closing_document(uuid,text,text,text,text,bigint) to authenticated;

create or replace function public.genz_record_commission_activity(
  p_deal_id text,
  p_entry_type text,
  p_amount numeric,
  p_reference text default '',
  p_note text default '',
  p_broker_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  d public.genz_deals%rowtype;
  agreement_id uuid;
  target_user uuid;
  entry_id uuid;
  earned_total numeric(16,2);
  invoice_total numeric(16,2);
  payment_total numeric(16,2);
  refund_total numeric(16,2);
begin
  if (select auth.uid()) is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  if p_entry_type not in ('invoice','payment','refund') then raise exception 'INVALID_LEDGER_ENTRY_TYPE'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
  select * into d from public.genz_deals where id=p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if (select auth.uid()) not in (d.buyer_user_id,d.listing_user_id) and not public.genz_is_admin() then raise exception 'DEAL_ACCESS_DENIED'; end if;
  target_user:=coalesce(p_broker_user_id,(select auth.uid()));
  if not public.genz_is_admin() and target_user<>(select auth.uid()) then raise exception 'BROKER_TARGET_DENIED'; end if;
  select a.id into agreement_id
  from public.genz_commission_agreements a
  where a.deal_id=p_deal_id and a.status='accepted'
  order by a.version desc limit 1;
  if agreement_id is null then raise exception 'ACCEPTED_COMMISSION_AGREEMENT_REQUIRED'; end if;
  if not exists(select 1 from public.genz_commission_allocations x where x.agreement_id=agreement_id and x.broker_user_id=target_user) then
    raise exception 'BROKER_NOT_ALLOCATED';
  end if;
  select coalesce(sum(amount),0) into earned_total
  from public.genz_commission_ledger
  where deal_id=p_deal_id and broker_user_id=target_user and entry_type='earned' and status='confirmed';
  if earned_total<=0 then raise exception 'EARNED_ENTITLEMENT_REQUIRED'; end if;
  select coalesce(sum(amount),0) into invoice_total from public.genz_commission_ledger where deal_id=p_deal_id and broker_user_id=target_user and entry_type='invoice' and status in ('pending','confirmed');
  select coalesce(sum(amount),0) into payment_total from public.genz_commission_ledger where deal_id=p_deal_id and broker_user_id=target_user and entry_type='payment' and status in ('pending','confirmed');
  select coalesce(sum(amount),0) into refund_total from public.genz_commission_ledger where deal_id=p_deal_id and broker_user_id=target_user and entry_type='refund' and status in ('pending','confirmed');
  if p_entry_type='invoice' and invoice_total+p_amount>earned_total then raise exception 'INVOICE_EXCEEDS_ENTITLEMENT'; end if;
  if p_entry_type='payment' and payment_total+p_amount>earned_total+refund_total then raise exception 'PAYMENT_EXCEEDS_RECEIVABLE'; end if;
  if p_entry_type='refund' and refund_total+p_amount>payment_total then raise exception 'REFUND_EXCEEDS_RECORDED_PAYMENT'; end if;
  insert into public.genz_commission_ledger(
    deal_id,agreement_id,broker_user_id,entry_type,amount,status,reference,note,created_by_user_id,source_key
  ) values(
    p_deal_id,agreement_id,target_user,p_entry_type,round(p_amount,2),'pending',left(coalesce(p_reference,''),500),left(coalesce(p_note,''),1200),(select auth.uid()),
    'manual:'||p_entry_type||':'||extensions.gen_random_uuid()::text
  ) returning id into entry_id;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
  values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),p_deal_id,(select auth.uid()),'commission_'||p_entry_type||'_reported',initcap(p_entry_type)||' reported for ₹'||round(p_amount,2)::text||'; pending verification');
  return entry_id;
end;
$$;
revoke all on function public.genz_record_commission_activity(text,text,numeric,text,text,uuid) from public,anon;
grant execute on function public.genz_record_commission_activity(text,text,numeric,text,text,uuid) to authenticated;

create or replace function public.genz_admin_review_commission_entry(
  p_entry_id uuid,
  p_status text,
  p_note text default ''
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  e public.genz_commission_ledger%rowtype;
begin
  if (select auth.uid()) is null or not public.genz_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_status not in ('confirmed','disputed','void') then raise exception 'INVALID_LEDGER_STATUS'; end if;
  select * into e from public.genz_commission_ledger where id=p_entry_id for update;
  if not found then raise exception 'LEDGER_ENTRY_NOT_FOUND'; end if;
  if e.entry_type in ('earned','expected') then raise exception 'SYSTEM_ENTRY_REVIEW_NOT_ALLOWED'; end if;
  update public.genz_commission_ledger
  set status=p_status,note=left(trim(both from coalesce(note,'')||case when coalesce(p_note,'')='' then '' else E'\nAdmin: '||p_note end),1200)
  where id=p_entry_id;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
  values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),e.deal_id,(select auth.uid()),'commission_entry_reviewed',initcap(e.entry_type)||' entry marked '||p_status);
  return p_status;
end;
$$;
revoke all on function public.genz_admin_review_commission_entry(uuid,text,text) from public,anon;
grant execute on function public.genz_admin_review_commission_entry(uuid,text,text) to authenticated;

create or replace function public.genz_upsert_builder_payout(
  p_deal_id text,
  p_project_id uuid,
  p_broker_user_id uuid,
  p_amount numeric,
  p_status text default 'expected',
  p_reference text default '',
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  d public.genz_deals%rowtype;
  p public.genz_builder_projects%rowtype;
  payout_id uuid;
  entitlement numeric(16,2);
  existing_paid numeric(16,2);
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into p from public.genz_builder_projects where id=p_project_id;
  if not found then raise exception 'BUILDER_PROJECT_NOT_FOUND'; end if;
  if not public.genz_builder_can_manage(p.builder_id) then raise exception 'BUILDER_MANAGE_REQUIRED'; end if;
  if p_status not in ('expected','approved','paid','rejected') then raise exception 'INVALID_PAYOUT_STATUS'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
  select * into d from public.genz_deals where id=p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if not exists(
    select 1 from public.genz_commission_allocations x
    join public.genz_commission_agreements a on a.id=x.agreement_id
    where a.deal_id=p_deal_id and a.status='accepted' and x.broker_user_id=p_broker_user_id
  ) then raise exception 'BROKER_NOT_ALLOCATED'; end if;
  select coalesce(sum(amount),0) into entitlement
  from public.genz_commission_ledger
  where deal_id=p_deal_id and broker_user_id=p_broker_user_id and entry_type='earned' and status='confirmed';
  if entitlement<=0 then raise exception 'EARNED_ENTITLEMENT_REQUIRED'; end if;
  if p_amount>entitlement then raise exception 'PAYOUT_EXCEEDS_ENTITLEMENT'; end if;
  insert into public.genz_builder_payouts(deal_id,project_id,broker_user_id,amount,status,reference,note,created_by_user_id,approved_by_user_id,paid_at)
  values(p_deal_id,p_project_id,p_broker_user_id,round(p_amount,2),p_status,left(coalesce(p_reference,''),500),left(coalesce(p_note,''),1200),(select auth.uid()),case when p_status in ('approved','paid') then (select auth.uid()) else null end,case when p_status='paid' then now() else null end)
  on conflict(deal_id,project_id,broker_user_id) do update set
    amount=excluded.amount,status=excluded.status,reference=excluded.reference,note=excluded.note,
    approved_by_user_id=case when excluded.status in ('approved','paid') then (select auth.uid()) else public.genz_builder_payouts.approved_by_user_id end,
    paid_at=case when excluded.status='paid' then coalesce(public.genz_builder_payouts.paid_at,now()) else null end,
    updated_at=now()
  returning id into payout_id;
  if p_status='paid' then
    select coalesce(sum(amount),0) into existing_paid
    from public.genz_commission_ledger
    where deal_id=p_deal_id and broker_user_id=p_broker_user_id and entry_type='payment' and status='confirmed' and source_key<>'builder-payout:'||payout_id::text;
    if existing_paid+p_amount>entitlement then raise exception 'CONFIRMED_PAYMENTS_EXCEED_ENTITLEMENT'; end if;
    insert into public.genz_commission_ledger(deal_id,agreement_id,broker_user_id,entry_type,amount,status,reference,note,created_by_user_id,source_key)
    select p_deal_id,a.id,p_broker_user_id,'payment',round(p_amount,2),'confirmed',left(coalesce(p_reference,''),500),'Builder payout confirmed: '||left(coalesce(p_note,''),1000),(select auth.uid()),'builder-payout:'||payout_id::text
    from public.genz_commission_agreements a
    where a.deal_id=p_deal_id and a.status='accepted'
    order by a.version desc limit 1
    on conflict(source_key) where source_key is not null do update set amount=excluded.amount,reference=excluded.reference,note=excluded.note,status='confirmed';
  end if;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
  values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),p_deal_id,(select auth.uid()),'builder_payout_'||p_status,'Builder payout '||p_status||' for ₹'||round(p_amount,2)::text);
  return payout_id;
end;
$$;
revoke all on function public.genz_upsert_builder_payout(text,uuid,uuid,numeric,text,text,text) from public,anon;
grant execute on function public.genz_upsert_builder_payout(text,uuid,uuid,numeric,text,text,text) to authenticated;
