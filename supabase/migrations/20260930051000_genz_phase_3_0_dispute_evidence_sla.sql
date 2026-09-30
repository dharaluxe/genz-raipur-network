create table if not exists public.genz_dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.genz_deal_disputes(id) on delete cascade,
  uploaded_by_user_id uuid not null references public.genz_profiles(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 160),
  note text not null default '' check (char_length(note) <= 1200),
  storage_path text not null unique check (char_length(storage_path) between 1 and 500),
  original_name text not null check (char_length(original_name) between 1 and 240),
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);
create index if not exists genz_dispute_evidence_dispute_idx on public.genz_dispute_evidence(dispute_id,created_at desc);
create index if not exists genz_dispute_evidence_uploader_idx on public.genz_dispute_evidence(uploaded_by_user_id,created_at desc);

alter table public.genz_dispute_evidence enable row level security;
drop policy if exists "dispute parties read evidence metadata" on public.genz_dispute_evidence;
create policy "dispute parties read evidence metadata" on public.genz_dispute_evidence
for select to authenticated using (
  exists(
    select 1 from public.genz_deal_disputes d
    where d.id=dispute_id
      and (d.raised_by_user_id=(select auth.uid()) or d.against_user_id=(select auth.uid()) or public.genz_is_admin())
  )
);
grant select on public.genz_dispute_evidence to authenticated;
revoke insert,update,delete on public.genz_dispute_evidence from authenticated,anon;

create or replace function public.genz_can_read_dispute_evidence(p_storage_path text)
returns boolean language sql stable security invoker set search_path='pg_catalog','public' as $$
  select (select auth.uid()) is not null
    and split_part(coalesce(p_storage_path,''),'/',2)='dispute'
    and exists(
      select 1 from public.genz_deal_disputes d
      where d.id::text=split_part(coalesce(p_storage_path,''),'/',3)
        and (d.raised_by_user_id=(select auth.uid()) or d.against_user_id=(select auth.uid()) or public.genz_is_admin())
    );
$$;
revoke execute on function public.genz_can_read_dispute_evidence(text) from public,anon;
grant execute on function public.genz_can_read_dispute_evidence(text) to authenticated,service_role;

drop policy if exists "genz dispute evidence parties read" on storage.objects;
create policy "genz dispute evidence parties read" on storage.objects
for select to authenticated using (
  bucket_id='genz-property-docs'
  and split_part(name,'/',2)='dispute'
  and public.genz_can_read_dispute_evidence(name)
);

create or replace function public.genz_register_deal_dispute_evidence(
  p_dispute_id uuid,
  p_title text,
  p_note text,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint
)
returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $$
declare
  v_uid uuid:=auth.uid();
  v_dispute public.genz_deal_disputes%rowtype;
  v_title text:=trim(coalesce(p_title,''));
  v_note text:=trim(coalesce(p_note,''));
  v_name text:=trim(coalesce(p_original_name,''));
  v_path text:=trim(coalesce(p_storage_path,''));
  v_id uuid;
  v_case_id uuid;
  v_other uuid;
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into v_dispute from public.genz_deal_disputes where id=p_dispute_id for update;
  if v_dispute.id is null then raise exception 'DISPUTE_NOT_FOUND'; end if;
  if v_uid not in (v_dispute.raised_by_user_id,v_dispute.against_user_id) and not public.genz_is_admin() then raise exception 'DISPUTE_ACCESS_DENIED'; end if;
  if v_dispute.status not in ('open','in_review') then raise exception 'DISPUTE_CLOSED'; end if;
  if char_length(v_title)<1 or char_length(v_title)>160 then raise exception 'EVIDENCE_TITLE_LENGTH'; end if;
  if char_length(v_note)>1200 then raise exception 'EVIDENCE_NOTE_LENGTH'; end if;
  if char_length(v_name)<1 or char_length(v_name)>240 then raise exception 'EVIDENCE_NAME_LENGTH'; end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png') then raise exception 'EVIDENCE_MIME_NOT_ALLOWED'; end if;
  if p_size_bytes is null or p_size_bytes<1 or p_size_bytes>10485760 then raise exception 'EVIDENCE_SIZE_INVALID'; end if;
  if split_part(v_path,'/',1)<>v_uid::text or split_part(v_path,'/',2)<>'dispute' or split_part(v_path,'/',3)<>p_dispute_id::text then raise exception 'EVIDENCE_PATH_INVALID'; end if;

  insert into public.genz_dispute_evidence(dispute_id,uploaded_by_user_id,title,note,storage_path,original_name,mime_type,size_bytes)
  values(p_dispute_id,v_uid,v_title,v_note,v_path,v_name,p_mime_type,p_size_bytes)
  returning id into v_id;

  select c.id into v_case_id from public.genz_admin_cases c where c.case_type='deal_dispute' and c.source_id=p_dispute_id::text;
  if v_case_id is not null then
    update public.genz_admin_cases set updated_at=now() where id=v_case_id;
    insert into public.genz_admin_case_events(case_id,actor_user_id,event_type,note)
    values(v_case_id,v_uid,'evidence_added',left(v_title,2000));
  end if;

  v_other:=case when v_uid=v_dispute.raised_by_user_id then v_dispute.against_user_id else v_dispute.raised_by_user_id end;
  if v_other is not null and v_other<>v_uid then
    perform public.genz_emit_notification(v_other,'system','Dispute evidence added','New private evidence was added for Deal Room '||v_dispute.deal_id||'.','deal_dispute',p_dispute_id::text,'/disputes','action','deal-dispute-evidence:'||v_id::text||':'||v_other::text);
  end if;
  return v_id;
end; $$;
revoke execute on function public.genz_register_deal_dispute_evidence(uuid,text,text,text,text,text,bigint) from public,anon;
grant execute on function public.genz_register_deal_dispute_evidence(uuid,text,text,text,text,text,bigint) to authenticated,service_role;

create or replace function public.genz_list_dispute_evidence(p_dispute_id uuid)
returns table(
  evidence_id uuid,
  dispute_id uuid,
  title text,
  note text,
  storage_path text,
  original_name text,
  mime_type text,
  size_bytes bigint,
  uploaded_by_broker_code text,
  uploaded_by_name text,
  is_mine boolean,
  created_at timestamptz
)
language plpgsql stable security definer set search_path='pg_catalog','public' as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.genz_deal_disputes d
    where d.id=p_dispute_id
      and (d.raised_by_user_id=v_uid or d.against_user_id=v_uid or public.genz_is_admin())
  ) then raise exception 'DISPUTE_ACCESS_DENIED'; end if;
  return query
  select e.id,e.dispute_id,e.title,e.note,e.storage_path,e.original_name,e.mime_type,e.size_bytes,p.broker_code,p.display_name,e.uploaded_by_user_id=v_uid,e.created_at
  from public.genz_dispute_evidence e
  join public.genz_profiles p on p.id=e.uploaded_by_user_id
  where e.dispute_id=p_dispute_id
  order by e.created_at desc;
end; $$;
revoke execute on function public.genz_list_dispute_evidence(uuid) from public,anon;
grant execute on function public.genz_list_dispute_evidence(uuid) to authenticated,service_role;

create or replace function public.genz_admin_case_snapshot_v2(p_status text default null,p_case_type text default null,p_limit integer default 200)
returns table(
  case_id uuid,
  case_type text,
  source_id text,
  workflow_status text,
  priority text,
  title text,
  assigned_admin_broker_code text,
  assigned_admin_name text,
  source_status text,
  primary_broker_code text,
  primary_broker_name text,
  secondary_broker_code text,
  secondary_broker_name text,
  deal_id text,
  property_id text,
  amount numeric,
  reason text,
  evidence_summary text,
  evidence_count bigint,
  age_hours numeric,
  sla_target_hours integer,
  sla_due_at timestamptz,
  sla_state text,
  escalation_level integer,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz
)
language plpgsql stable security definer set search_path='pg_catalog','public' as $$
begin
  if auth.uid() is null or not public.genz_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_status is not null and p_status not in('open','in_review','waiting','resolved') then raise exception 'INVALID_CASE_STATUS'; end if;
  if p_case_type is not null and p_case_type not in('deal_dispute','commission_dispute','broker_status_appeal','property_master_claim','property_verification') then raise exception 'INVALID_CASE_TYPE'; end if;
  return query
  select c.id,c.case_type,c.source_id,c.workflow_status,c.priority,c.title,aa.broker_code,aa.display_name,
    coalesce(dd.status,cd.status,ba.status,pmc.status,pv.status),
    p1.broker_code,p1.display_name,p2.broker_code,p2.display_name,
    coalesce(dd.deal_id,cd.deal_id),coalesce(pmc.property_id,pv.property_id),cd.amount_disputed,
    coalesce(dd.reason,cd.reason,ba.reason,pmc.broker_note,pv.notes,''),
    case c.case_type
      when 'deal_dispute' then 'Category: '||replace(coalesce(dd.category,'other'),'_',' ')||' · Evidence '||coalesce(ev.evidence_count,0)::text
      when 'commission_dispute' then case when cd.agreement_id is null then 'Commission disagreement' else 'Agreement '||cd.agreement_id::text end
      when 'broker_status_appeal' then 'Appealed status: '||coalesce(ba.appealed_status,'')
      when 'property_master_claim' then 'Match score '||coalesce(pmc.match_score,0)::text||'/100 · '||coalesce(pmc.match_reason,'')
      when 'property_verification' then 'Owner consent '||case when pv.owner_consent then 'yes' else 'no' end||' · Documents '||case when pv.documents_checked then 'checked' else 'not checked' end||' · Location '||case when pv.location_checked then 'checked' else 'not checked' end
      else '' end,
    coalesce(ev.evidence_count,0),
    round((extract(epoch from (coalesce(c.resolved_at,now())-c.created_at))/3600.0)::numeric,1),
    s.target_hours,
    c.created_at+make_interval(hours=>s.target_hours),
    case
      when c.workflow_status='resolved' and coalesce(c.resolved_at,c.updated_at)<=c.created_at+make_interval(hours=>s.target_hours) then 'resolved_on_time'
      when c.workflow_status='resolved' then 'resolved_late'
      when now()>c.created_at+make_interval(hours=>s.target_hours) then 'overdue'
      when now()>=c.created_at+make_interval(hours=>greatest(1,s.target_hours-(greatest(1,ceil(s.target_hours*0.25)::int)))) then 'due_soon'
      else 'on_track' end,
    case
      when c.workflow_status='resolved' or now()<=c.created_at+make_interval(hours=>s.target_hours) then 0
      when now()<=c.created_at+make_interval(hours=>s.target_hours*2) then 1
      when now()<=c.created_at+make_interval(hours=>s.target_hours*3) then 2
      else 3 end,
    c.created_at,c.updated_at,c.resolved_at
  from public.genz_admin_cases c
  cross join lateral (select case c.priority when 'critical' then 4 when 'high' then 24 when 'normal' then 72 else 120 end::integer as target_hours) s
  left join public.genz_deal_disputes dd on c.case_type='deal_dispute' and dd.id::text=c.source_id
  left join lateral (select count(*)::bigint as evidence_count from public.genz_dispute_evidence e where dd.id is not null and e.dispute_id=dd.id) ev on true
  left join public.genz_commission_disputes cd on c.case_type='commission_dispute' and cd.id::text=c.source_id
  left join public.genz_broker_status_appeals ba on c.case_type='broker_status_appeal' and ba.id::text=c.source_id
  left join public.genz_property_master_claims pmc on c.case_type='property_master_claim' and pmc.id::text=c.source_id
  left join public.genz_property_verifications pv on c.case_type='property_verification' and pv.property_id=c.source_id
  left join public.genz_profiles p1 on p1.id=coalesce(dd.raised_by_user_id,cd.raised_by_user_id,ba.broker_user_id,pmc.requested_by_user_id,pv.listing_user_id)
  left join public.genz_profiles p2 on p2.id=coalesce(dd.against_user_id,cd.against_user_id)
  left join public.genz_profiles aa on aa.id=c.assigned_admin_user_id
  where (p_status is null or c.workflow_status=p_status) and (p_case_type is null or c.case_type=p_case_type)
  order by case when c.workflow_status='resolved' then 1 else 0 end,
           case
             when c.workflow_status<>'resolved' and now()>c.created_at+make_interval(hours=>s.target_hours*3) then 3
             when c.workflow_status<>'resolved' and now()>c.created_at+make_interval(hours=>s.target_hours*2) then 2
             when c.workflow_status<>'resolved' and now()>c.created_at+make_interval(hours=>s.target_hours) then 1
             else 0 end desc,
           case c.priority when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
           c.created_at asc
  limit greatest(1,least(coalesce(p_limit,200),500));
end; $$;
revoke execute on function public.genz_admin_case_snapshot_v2(text,text,integer) from public,anon;
grant execute on function public.genz_admin_case_snapshot_v2(text,text,integer) to authenticated,service_role;
