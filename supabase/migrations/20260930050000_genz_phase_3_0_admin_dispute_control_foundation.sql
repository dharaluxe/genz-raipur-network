create table if not exists public.genz_deal_disputes (
  id uuid primary key default gen_random_uuid(),
  deal_id text not null references public.genz_deals(id) on delete cascade,
  raised_by_user_id uuid not null references public.genz_profiles(id) on delete restrict,
  against_user_id uuid not null references public.genz_profiles(id) on delete restrict,
  category text not null check (category in ('broker_conduct','property_information','site_visit','introduction_protection','closure','other')),
  reason text not null check (char_length(reason) between 20 and 2000),
  status text not null default 'open' check (status in ('open','in_review','resolved','rejected')),
  resolution text not null default '' check (char_length(resolution) <= 2500),
  resolved_by_user_id uuid references public.genz_profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (raised_by_user_id <> against_user_id)
);
create index if not exists genz_deal_disputes_deal_status_idx on public.genz_deal_disputes(deal_id,status,created_at desc);
create index if not exists genz_deal_disputes_raised_by_idx on public.genz_deal_disputes(raised_by_user_id,created_at desc);
create index if not exists genz_deal_disputes_against_idx on public.genz_deal_disputes(against_user_id,status,created_at desc);
create index if not exists genz_deal_disputes_resolver_idx on public.genz_deal_disputes(resolved_by_user_id) where resolved_by_user_id is not null;
create unique index if not exists genz_deal_disputes_active_unique on public.genz_deal_disputes(deal_id,raised_by_user_id,against_user_id,category) where status in ('open','in_review');

alter table public.genz_deal_disputes enable row level security;
drop policy if exists "deal dispute parties read own disputes" on public.genz_deal_disputes;
create policy "deal dispute parties read own disputes" on public.genz_deal_disputes for select to authenticated using(
  raised_by_user_id=(select auth.uid()) or against_user_id=(select auth.uid()) or public.genz_is_admin()
);
grant select on public.genz_deal_disputes to authenticated;
revoke insert,update,delete on public.genz_deal_disputes from authenticated,anon;

create table if not exists public.genz_admin_cases (
  id uuid primary key default gen_random_uuid(),
  case_type text not null check (case_type in ('deal_dispute','commission_dispute','broker_status_appeal','property_master_claim','property_verification')),
  source_id text not null check (char_length(source_id) between 1 and 160),
  title text not null check (char_length(title) between 1 and 200),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  workflow_status text not null default 'open' check (workflow_status in ('open','in_review','waiting','resolved')),
  assigned_admin_user_id uuid references public.genz_profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(case_type,source_id)
);
create index if not exists genz_admin_cases_queue_idx on public.genz_admin_cases(workflow_status,priority,created_at desc);
create index if not exists genz_admin_cases_assignee_idx on public.genz_admin_cases(assigned_admin_user_id,workflow_status,updated_at desc) where assigned_admin_user_id is not null;
alter table public.genz_admin_cases enable row level security;
drop policy if exists "no direct client reads admin cases" on public.genz_admin_cases;
create policy "no direct client reads admin cases" on public.genz_admin_cases for select to authenticated using(false);
revoke all on public.genz_admin_cases from anon,authenticated;

create table if not exists public.genz_admin_case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.genz_admin_cases(id) on delete cascade,
  actor_user_id uuid not null references public.genz_profiles(id) on delete restrict,
  note text not null check (char_length(note) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists genz_admin_case_notes_case_idx on public.genz_admin_case_notes(case_id,created_at desc);
create index if not exists genz_admin_case_notes_actor_idx on public.genz_admin_case_notes(actor_user_id,created_at desc);
alter table public.genz_admin_case_notes enable row level security;
drop policy if exists "no direct client reads admin case notes" on public.genz_admin_case_notes;
create policy "no direct client reads admin case notes" on public.genz_admin_case_notes for select to authenticated using(false);
revoke all on public.genz_admin_case_notes from anon,authenticated;

create table if not exists public.genz_admin_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.genz_admin_cases(id) on delete cascade,
  actor_user_id uuid references public.genz_profiles(id) on delete set null,
  event_type text not null check (char_length(event_type) between 1 and 80),
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists genz_admin_case_events_case_idx on public.genz_admin_case_events(case_id,created_at desc);
create index if not exists genz_admin_case_events_actor_idx on public.genz_admin_case_events(actor_user_id,created_at desc) where actor_user_id is not null;
alter table public.genz_admin_case_events enable row level security;
drop policy if exists "no direct client reads admin case events" on public.genz_admin_case_events;
create policy "no direct client reads admin case events" on public.genz_admin_case_events for select to authenticated using(false);
revoke all on public.genz_admin_case_events from anon,authenticated;

create or replace function public.genz_sync_admin_case_from_source()
returns trigger language plpgsql security definer set search_path='pg_catalog','public' as $$
declare
  v_type text; v_source text; v_title text; v_priority text:='normal'; v_flow text:='open'; v_case uuid; v_old_status text; v_new_status text; v_admin record;
begin
  if tg_table_name='genz_deal_disputes' then
    v_type:='deal_dispute'; v_source:=new.id::text; v_title:='Deal dispute · '||new.deal_id; v_priority:='high'; v_new_status:=new.status;
    v_flow:=case new.status when 'resolved' then 'resolved' when 'rejected' then 'resolved' when 'in_review' then 'in_review' else 'open' end;
  elsif tg_table_name='genz_commission_disputes' then
    v_type:='commission_dispute'; v_source:=new.id::text; v_title:='Commission dispute · '||new.deal_id; v_priority:='high'; v_new_status:=new.status;
    v_flow:=case when new.status in ('resolved','rejected') then 'resolved' when new.status='evidence_requested' then 'waiting' else 'open' end;
  elsif tg_table_name='genz_broker_status_appeals' then
    v_type:='broker_status_appeal'; v_source:=new.id::text; v_title:='Broker status appeal'; v_priority:='high'; v_new_status:=new.status;
    v_flow:=case when new.status in ('accepted','rejected') then 'resolved' else 'open' end;
  elsif tg_table_name='genz_property_master_claims' then
    v_type:='property_master_claim'; v_source:=new.id::text; v_title:='Property duplicate / merge review · '||new.property_id; v_priority:='normal'; v_new_status:=new.status;
    v_flow:=case when new.status in ('approved','rejected','withdrawn') then 'resolved' else 'open' end;
  elsif tg_table_name='genz_property_verifications' then
    if new.status='draft' then return new; end if;
    v_type:='property_verification'; v_source:=new.property_id; v_title:='Property verification · '||new.property_id; v_priority:='normal'; v_new_status:=new.status;
    v_flow:=case when new.status in ('verified','rejected') then 'resolved' else 'open' end;
  else
    return new;
  end if;
  if tg_op='UPDATE' then v_old_status:=old.status; end if;

  insert into public.genz_admin_cases(case_type,source_id,title,priority,workflow_status,resolved_at)
  values(v_type,v_source,left(v_title,200),v_priority,v_flow,case when v_flow='resolved' then now() else null end)
  on conflict(case_type,source_id) do update set
    title=excluded.title,
    workflow_status=case
      when excluded.workflow_status='resolved' then 'resolved'
      when genz_admin_cases.workflow_status in ('in_review','waiting') and excluded.workflow_status='open' then genz_admin_cases.workflow_status
      else excluded.workflow_status end,
    resolved_at=case when excluded.workflow_status='resolved' then coalesce(genz_admin_cases.resolved_at,now()) else null end,
    updated_at=now()
  returning id into v_case;

  if tg_op='INSERT' or v_old_status is distinct from v_new_status then
    insert into public.genz_admin_case_events(case_id,actor_user_id,event_type,note)
    values(v_case,null,'source_status',tg_table_name||' status: '||coalesce(v_new_status,'unknown'));
  end if;

  if tg_op='INSERT' and v_flow<>'resolved' then
    for v_admin in select p.id from public.genz_profiles p where p.is_admin=true loop
      perform public.genz_emit_notification(v_admin.id,'system','Admin case opened',left(v_title,160),v_type,v_source,'/admin-control','action','admin-case:'||v_case::text);
    end loop;
  end if;
  return new;
end; $$;
revoke all on function public.genz_sync_admin_case_from_source() from public,anon,authenticated;

drop trigger if exists genz_deal_disputes_admin_case on public.genz_deal_disputes;
create trigger genz_deal_disputes_admin_case after insert or update of status on public.genz_deal_disputes for each row execute function public.genz_sync_admin_case_from_source();
drop trigger if exists genz_commission_disputes_admin_case on public.genz_commission_disputes;
create trigger genz_commission_disputes_admin_case after insert or update of status on public.genz_commission_disputes for each row execute function public.genz_sync_admin_case_from_source();
drop trigger if exists genz_broker_status_appeals_admin_case on public.genz_broker_status_appeals;
create trigger genz_broker_status_appeals_admin_case after insert or update of status on public.genz_broker_status_appeals for each row execute function public.genz_sync_admin_case_from_source();
drop trigger if exists genz_property_master_claims_admin_case on public.genz_property_master_claims;
create trigger genz_property_master_claims_admin_case after insert or update of status on public.genz_property_master_claims for each row execute function public.genz_sync_admin_case_from_source();
drop trigger if exists genz_property_verifications_admin_case on public.genz_property_verifications;
create trigger genz_property_verifications_admin_case after insert or update of status on public.genz_property_verifications for each row execute function public.genz_sync_admin_case_from_source();

insert into public.genz_admin_cases(case_type,source_id,title,priority,workflow_status,resolved_at)
select 'commission_dispute',d.id::text,left('Commission dispute · '||d.deal_id,200),'high',case when d.status in('resolved','rejected') then 'resolved' when d.status='evidence_requested' then 'waiting' else 'open' end,case when d.status in('resolved','rejected') then d.resolved_at else null end from public.genz_commission_disputes d
on conflict(case_type,source_id) do nothing;
insert into public.genz_admin_cases(case_type,source_id,title,priority,workflow_status,resolved_at)
select 'broker_status_appeal',a.id::text,'Broker status appeal','high',case when a.status in('accepted','rejected') then 'resolved' else 'open' end,a.resolved_at from public.genz_broker_status_appeals a
on conflict(case_type,source_id) do nothing;
insert into public.genz_admin_cases(case_type,source_id,title,priority,workflow_status,resolved_at)
select 'property_master_claim',c.id::text,left('Property duplicate / merge review · '||c.property_id,200),'normal',case when c.status in('approved','rejected','withdrawn') then 'resolved' else 'open' end,c.reviewed_at from public.genz_property_master_claims c
on conflict(case_type,source_id) do nothing;
insert into public.genz_admin_cases(case_type,source_id,title,priority,workflow_status,resolved_at)
select 'property_verification',v.property_id,left('Property verification · '||v.property_id,200),'normal',case when v.status in('verified','rejected') then 'resolved' else 'open' end,v.reviewed_at from public.genz_property_verifications v where v.status<>'draft'
on conflict(case_type,source_id) do nothing;

create or replace function public.genz_raise_deal_dispute(p_deal_id text,p_against_broker_code text,p_category text,p_reason text)
returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_uid uuid:=auth.uid(); v_against uuid; v_id uuid; v_reason text:=trim(coalesce(p_reason,''));
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  if not public.genz_deal_has_permission(p_deal_id,'read') then raise exception 'DEAL_ACCESS_DENIED'; end if;
  if p_category not in ('broker_conduct','property_information','site_visit','introduction_protection','closure','other') then raise exception 'INVALID_DISPUTE_CATEGORY'; end if;
  if char_length(v_reason)<20 or char_length(v_reason)>2000 then raise exception 'DISPUTE_REASON_LENGTH'; end if;
  select p.id into v_against from public.genz_profiles p where upper(p.broker_code)=upper(trim(p_against_broker_code));
  if v_against is null or v_against=v_uid then raise exception 'INVALID_COUNTERPARTY'; end if;
  if not exists(select 1 from public.genz_deal_participants dp where dp.deal_id=p_deal_id and dp.user_id=v_against and dp.status='active') then raise exception 'COUNTERPARTY_NOT_IN_DEAL'; end if;
  if exists(select 1 from public.genz_deal_disputes d where d.deal_id=p_deal_id and d.raised_by_user_id=v_uid and d.against_user_id=v_against and d.category=p_category and d.status in('open','in_review')) then raise exception 'ACTIVE_DISPUTE_EXISTS'; end if;
  insert into public.genz_deal_disputes(deal_id,raised_by_user_id,against_user_id,category,reason) values(p_deal_id,v_uid,v_against,p_category,v_reason) returning id into v_id;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label) values('EV-'||replace(gen_random_uuid()::text,'-',''),p_deal_id,v_uid,'dispute_raised','Private admin dispute raised');
  perform public.genz_emit_notification(v_against,'system','Private Deal Room dispute opened','A participant opened a private admin-reviewed dispute for '||p_deal_id||'.', 'deal_dispute',v_id::text,'/disputes','action','deal-dispute:'||v_id::text||':counterparty');
  return v_id;
end; $$;
revoke execute on function public.genz_raise_deal_dispute(text,text,text,text) from public,anon;
grant execute on function public.genz_raise_deal_dispute(text,text,text,text) to authenticated,service_role;

create or replace function public.genz_list_my_deal_disputes()
returns table(dispute_id uuid,deal_id text,category text,reason text,status text,resolution text,raised_by_broker_code text,raised_by_name text,against_broker_code text,against_name text,is_raiser boolean,created_at timestamptz,resolved_at timestamptz)
language sql stable security definer set search_path='pg_catalog','public' as $$
  select d.id,d.deal_id,d.category,d.reason,d.status,d.resolution,rp.broker_code,rp.display_name,ap.broker_code,ap.display_name,d.raised_by_user_id=auth.uid(),d.created_at,d.resolved_at
  from public.genz_deal_disputes d
  join public.genz_profiles rp on rp.id=d.raised_by_user_id
  join public.genz_profiles ap on ap.id=d.against_user_id
  where auth.uid() is not null and (d.raised_by_user_id=auth.uid() or d.against_user_id=auth.uid())
  order by d.created_at desc;
$$;
revoke execute on function public.genz_list_my_deal_disputes() from public,anon;
grant execute on function public.genz_list_my_deal_disputes() to authenticated,service_role;

create or replace function public.genz_admin_case_snapshot(p_status text default null,p_case_type text default null,p_limit integer default 200)
returns table(case_id uuid,case_type text,source_id text,workflow_status text,priority text,title text,assigned_admin_broker_code text,assigned_admin_name text,source_status text,primary_broker_code text,primary_broker_name text,secondary_broker_code text,secondary_broker_name text,deal_id text,property_id text,amount numeric,reason text,evidence_summary text,created_at timestamptz,updated_at timestamptz,resolved_at timestamptz)
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
      when 'deal_dispute' then 'Category: '||replace(coalesce(dd.category,'other'),'_',' ')
      when 'commission_dispute' then case when cd.agreement_id is null then 'Commission disagreement' else 'Agreement '||cd.agreement_id::text end
      when 'broker_status_appeal' then 'Appealed status: '||coalesce(ba.appealed_status,'')
      when 'property_master_claim' then 'Match score '||coalesce(pmc.match_score,0)::text||'/100 · '||coalesce(pmc.match_reason,'')
      when 'property_verification' then 'Owner consent '||case when pv.owner_consent then 'yes' else 'no' end||' · Documents '||case when pv.documents_checked then 'checked' else 'not checked' end||' · Location '||case when pv.location_checked then 'checked' else 'not checked' end
      else '' end,
    c.created_at,c.updated_at,c.resolved_at
  from public.genz_admin_cases c
  left join public.genz_deal_disputes dd on c.case_type='deal_dispute' and dd.id::text=c.source_id
  left join public.genz_commission_disputes cd on c.case_type='commission_dispute' and cd.id::text=c.source_id
  left join public.genz_broker_status_appeals ba on c.case_type='broker_status_appeal' and ba.id::text=c.source_id
  left join public.genz_property_master_claims pmc on c.case_type='property_master_claim' and pmc.id::text=c.source_id
  left join public.genz_property_verifications pv on c.case_type='property_verification' and pv.property_id=c.source_id
  left join public.genz_profiles p1 on p1.id=coalesce(dd.raised_by_user_id,cd.raised_by_user_id,ba.broker_user_id,pmc.requested_by_user_id,pv.listing_user_id)
  left join public.genz_profiles p2 on p2.id=coalesce(dd.against_user_id,cd.against_user_id)
  left join public.genz_profiles aa on aa.id=c.assigned_admin_user_id
  where (p_status is null or c.workflow_status=p_status) and (p_case_type is null or c.case_type=p_case_type)
  order by case c.workflow_status when 'open' then 0 when 'in_review' then 1 when 'waiting' then 2 else 3 end,
           case c.priority when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,c.created_at desc
  limit greatest(1,least(coalesce(p_limit,200),500));
end; $$;
revoke execute on function public.genz_admin_case_snapshot(text,text,integer) from public,anon;
grant execute on function public.genz_admin_case_snapshot(text,text,integer) to authenticated,service_role;

create or replace function public.genz_admin_case_history(p_case_id uuid)
returns table(event_type text,note text,actor_broker_code text,actor_name text,created_at timestamptz)
language plpgsql stable security definer set search_path='pg_catalog','public' as $$
begin
  if auth.uid() is null or not public.genz_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return query
    select e.event_type,e.note,p.broker_code,p.display_name,e.created_at from public.genz_admin_case_events e left join public.genz_profiles p on p.id=e.actor_user_id where e.case_id=p_case_id
    union all
    select 'internal_note',n.note,p.broker_code,p.display_name,n.created_at from public.genz_admin_case_notes n left join public.genz_profiles p on p.id=n.actor_user_id where n.case_id=p_case_id
    order by created_at desc;
end; $$;
revoke execute on function public.genz_admin_case_history(uuid) from public,anon;
grant execute on function public.genz_admin_case_history(uuid) to authenticated,service_role;

create or replace function public.genz_admin_manage_case(p_case_id uuid,p_action text,p_priority text default null,p_assignee_broker_code text default null,p_note text default null)
returns void language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_uid uuid:=auth.uid(); v_case public.genz_admin_cases%rowtype; v_assignee uuid; v_note text:=nullif(trim(coalesce(p_note,'')),'');
begin
  if v_uid is null or not public.genz_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_action not in('start','wait','reopen','note') then raise exception 'INVALID_CASE_ACTION'; end if;
  if p_priority is not null and p_priority not in('low','normal','high','critical') then raise exception 'INVALID_PRIORITY'; end if;
  if v_note is not null and char_length(v_note)>2000 then raise exception 'NOTE_TOO_LONG'; end if;
  select * into v_case from public.genz_admin_cases where id=p_case_id for update;
  if v_case.id is null then raise exception 'CASE_NOT_FOUND'; end if;
  if v_case.workflow_status='resolved' and p_action not in('reopen','note') then raise exception 'CASE_ALREADY_RESOLVED'; end if;
  if p_assignee_broker_code is not null then
    if trim(p_assignee_broker_code)='' then v_assignee:=null;
    else select p.id into v_assignee from public.genz_profiles p where upper(p.broker_code)=upper(trim(p_assignee_broker_code)) and p.is_admin=true;
      if v_assignee is null then raise exception 'ADMIN_ASSIGNEE_NOT_FOUND'; end if;
    end if;
  else v_assignee:=v_case.assigned_admin_user_id; end if;
  update public.genz_admin_cases set
    workflow_status=case p_action when 'start' then 'in_review' when 'wait' then 'waiting' when 'reopen' then 'open' else workflow_status end,
    priority=coalesce(p_priority,priority),assigned_admin_user_id=v_assignee,
    resolved_at=case when p_action='reopen' then null else resolved_at end,updated_at=now()
  where id=p_case_id;
  if v_note is not null then insert into public.genz_admin_case_notes(case_id,actor_user_id,note) values(p_case_id,v_uid,v_note); end if;
  insert into public.genz_admin_case_events(case_id,actor_user_id,event_type,note) values(p_case_id,v_uid,'case_'||p_action,coalesce(v_note,''));
end; $$;
revoke execute on function public.genz_admin_manage_case(uuid,text,text,text,text) from public,anon;
grant execute on function public.genz_admin_manage_case(uuid,text,text,text,text) to authenticated,service_role;

create or replace function public.genz_admin_resolve_deal_dispute(p_dispute_id uuid,p_status text,p_resolution text)
returns void language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_uid uuid:=auth.uid(); v_row public.genz_deal_disputes%rowtype; v_text text:=trim(coalesce(p_resolution,''));
begin
  if v_uid is null or not public.genz_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_status not in('resolved','rejected') then raise exception 'INVALID_RESOLUTION_STATUS'; end if;
  if char_length(v_text)<5 or char_length(v_text)>2500 then raise exception 'RESOLUTION_REQUIRED'; end if;
  select * into v_row from public.genz_deal_disputes where id=p_dispute_id and status in('open','in_review') for update;
  if v_row.id is null then raise exception 'ACTIVE_DISPUTE_NOT_FOUND'; end if;
  update public.genz_deal_disputes set status=p_status,resolution=v_text,resolved_by_user_id=v_uid,resolved_at=now(),updated_at=now() where id=p_dispute_id;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label) values('EV-'||replace(gen_random_uuid()::text,'-',''),v_row.deal_id,v_uid,'dispute_resolved','Private admin dispute '||p_status);
  perform public.genz_emit_notification(v_row.raised_by_user_id,'system','Deal dispute reviewed','Admin review for '||v_row.deal_id||' is complete.','deal_dispute',p_dispute_id::text,'/disputes','action','deal-dispute:'||p_dispute_id::text||':raiser-resolution');
  perform public.genz_emit_notification(v_row.against_user_id,'system','Deal dispute reviewed','Admin review for '||v_row.deal_id||' is complete.','deal_dispute',p_dispute_id::text,'/disputes','action','deal-dispute:'||p_dispute_id::text||':counterparty-resolution');
end; $$;
revoke execute on function public.genz_admin_resolve_deal_dispute(uuid,text,text) from public,anon;
grant execute on function public.genz_admin_resolve_deal_dispute(uuid,text,text) to authenticated,service_role;
