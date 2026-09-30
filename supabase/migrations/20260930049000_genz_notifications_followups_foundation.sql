-- GENZ notifications + follow-up foundation. In-app only; no external delivery provider assumed.

create table if not exists public.genz_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in (
    'deal_requested','deal_status','offer_received','offer_response','message_received',
    'access_request','access_review','builder_invite','builder_invite_response',
    'opportunity_response','opportunity_response_status','commission_action','visit_scheduled','system'
  )),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 1200),
  entity_type text not null default '' check (char_length(entity_type) <= 80),
  entity_id text not null default '' check (char_length(entity_id) <= 160),
  action_path text not null default '' check (char_length(action_path) <= 500),
  severity text not null default 'info' check (severity in ('info','action','urgent')),
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 240),
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id,dedupe_key)
);
create index if not exists genz_notifications_user_created_idx on public.genz_notifications(user_id,created_at desc);
create index if not exists genz_notifications_user_unread_idx on public.genz_notifications(user_id,created_at desc) where read_at is null and dismissed_at is null;
alter table public.genz_notifications enable row level security;
drop policy if exists "users read own notifications" on public.genz_notifications;
create policy "users read own notifications" on public.genz_notifications for select to authenticated using(user_id=(select auth.uid()));
grant select on public.genz_notifications to authenticated;
revoke insert,update,delete on public.genz_notifications from authenticated,anon;

create table if not exists public.genz_followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('requirement_expiry','protection_expiry','visit_due','offer_expiry','commission_due','stale_deal','stale_requirement')),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id text not null check (char_length(entity_id) between 1 and 160),
  title text not null check (char_length(title) between 1 and 180),
  note text not null default '' check (char_length(note) <= 1200),
  action_path text not null default '' check (char_length(action_path) <= 500),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','snoozed','done','cancelled')),
  snoozed_until timestamptz,
  completed_at timestamptz,
  source_version text not null default '' check (char_length(source_version) <= 240),
  dedupe_key text not null check (char_length(dedupe_key) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,dedupe_key)
);
create index if not exists genz_followups_user_due_idx on public.genz_followups(user_id,status,due_at);
alter table public.genz_followups enable row level security;
drop policy if exists "users read own followups" on public.genz_followups;
create policy "users read own followups" on public.genz_followups for select to authenticated using(user_id=(select auth.uid()));
grant select on public.genz_followups to authenticated;
revoke insert,update,delete on public.genz_followups from authenticated,anon;

create or replace function public.genz_emit_notification(
  p_user_id uuid,p_kind text,p_title text,p_body text default '',p_entity_type text default '',p_entity_id text default '',p_action_path text default '',p_severity text default 'info',p_dedupe_key text default null
) returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_id uuid;
begin
  if p_user_id is null then return null; end if;
  if not exists(select 1 from auth.users u where u.id=p_user_id) then return null; end if;
  insert into public.genz_notifications(user_id,kind,title,body,entity_type,entity_id,action_path,severity,dedupe_key)
  values(p_user_id,p_kind,left(trim(p_title),160),left(coalesce(p_body,''),1200),left(coalesce(p_entity_type,''),80),left(coalesce(p_entity_id,''),160),left(coalesce(p_action_path,''),500),p_severity,p_dedupe_key)
  on conflict(user_id,dedupe_key) do update set
    title=excluded.title,body=excluded.body,entity_type=excluded.entity_type,entity_id=excluded.entity_id,
    action_path=excluded.action_path,severity=excluded.severity,dismissed_at=null,created_at=now()
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.genz_emit_notification(uuid,text,text,text,text,text,text,text,text) from public,anon,authenticated;

create or replace function public.genz_upsert_followup(
  p_user_id uuid,p_kind text,p_entity_type text,p_entity_id text,p_title text,p_note text,p_action_path text,p_due_at timestamptz,p_source_version text,p_dedupe_key text
) returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_id uuid;
begin
  if p_user_id is null or p_due_at is null then return null; end if;
  insert into public.genz_followups(user_id,kind,entity_type,entity_id,title,note,action_path,due_at,source_version,dedupe_key)
  values(p_user_id,p_kind,p_entity_type,p_entity_id,left(p_title,180),left(coalesce(p_note,''),1200),left(coalesce(p_action_path,''),500),p_due_at,left(coalesce(p_source_version,''),240),p_dedupe_key)
  on conflict(user_id,dedupe_key) do update set
    title=excluded.title,note=excluded.note,action_path=excluded.action_path,due_at=excluded.due_at,
    status=case when genz_followups.source_version is distinct from excluded.source_version then 'pending'
                when genz_followups.status='cancelled' then 'pending' else genz_followups.status end,
    snoozed_until=case when genz_followups.source_version is distinct from excluded.source_version then null else genz_followups.snoozed_until end,
    completed_at=case when genz_followups.source_version is distinct from excluded.source_version then null else genz_followups.completed_at end,
    source_version=excluded.source_version,updated_at=now()
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.genz_upsert_followup(uuid,text,text,text,text,text,text,timestamptz,text,text) from public,anon,authenticated;

create or replace function public.genz_notification_deal_trigger()
returns trigger language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_actor uuid:=auth.uid();
begin
  if tg_op='INSERT' then
    if new.listing_user_id is distinct from new.buyer_user_id then
      perform public.genz_emit_notification(new.listing_user_id,'deal_requested','New buyer collaboration request','A buyer broker opened a private Deal Room for one of your listings.','deal',new.id,'/deals?deal='||new.id,'action','deal:'||new.id||':requested');
    end if;
  elsif new.status is distinct from old.status then
    if new.buyer_user_id is distinct from v_actor then perform public.genz_emit_notification(new.buyer_user_id,'deal_status','Deal Room status updated','Deal '||new.id||' is now '||replace(new.status,'_',' ')||'.','deal',new.id,'/deals?deal='||new.id,'info','deal:'||new.id||':status:'||new.status); end if;
    if new.listing_user_id is distinct from v_actor and new.listing_user_id is distinct from new.buyer_user_id then perform public.genz_emit_notification(new.listing_user_id,'deal_status','Deal Room status updated','Deal '||new.id||' is now '||replace(new.status,'_',' ')||'.','deal',new.id,'/deals?deal='||new.id,'info','deal:'||new.id||':status:'||new.status); end if;
  end if;
  return new;
end; $$;
revoke all on function public.genz_notification_deal_trigger() from public,anon,authenticated;
drop trigger if exists genz_notify_deal_changes on public.genz_deals;
create trigger genz_notify_deal_changes after insert or update of status on public.genz_deals for each row execute function public.genz_notification_deal_trigger();

create or replace function public.genz_notification_offer_trigger()
returns trigger language plpgsql security definer set search_path='pg_catalog','public' as $$
declare r record;
begin
  if tg_op='INSERT' then
    for r in select dp.user_id from public.genz_deal_participants dp where dp.deal_id=new.deal_id and dp.status='active' and dp.can_view_financials and dp.user_id<>new.offered_by_user_id loop
      perform public.genz_emit_notification(r.user_id,'offer_received','New offer in Deal Room','A private offer of ₹'||trim(to_char(new.amount,'FM999999999999990.00'))||' was added to deal '||new.deal_id||'.','offer',new.id::text,'/deals?deal='||new.deal_id,'action','offer:'||new.id::text||':received:'||r.user_id::text);
    end loop;
  elsif new.status is distinct from old.status and new.status in ('accepted','rejected','countered','withdrawn','expired','superseded') then
    perform public.genz_emit_notification(new.offered_by_user_id,'offer_response','Offer status changed','Your offer in deal '||new.deal_id||' is now '||new.status||'.','offer',new.id::text,'/deals?deal='||new.deal_id,case when new.status in ('accepted','countered') then 'action' else 'info' end,'offer:'||new.id::text||':status:'||new.status);
  end if;
  return new;
end; $$;
revoke all on function public.genz_notification_offer_trigger() from public,anon,authenticated;
drop trigger if exists genz_notify_offer_changes on public.genz_deal_offers;
create trigger genz_notify_offer_changes after insert or update of status on public.genz_deal_offers for each row execute function public.genz_notification_offer_trigger();

create or replace function public.genz_notification_message_trigger()
returns trigger language plpgsql security definer set search_path='pg_catalog','public' as $$
declare r record;
begin
  for r in select dp.user_id from public.genz_deal_participants dp where dp.deal_id=new.deal_id and dp.status='active' and dp.user_id<>new.sender_user_id loop
    perform public.genz_emit_notification(r.user_id,'message_received','New Deal Room message',left(new.body,240),'message',new.id::text,'/deals?deal='||new.deal_id,'info','message:'||new.id::text||':'||r.user_id::text);
  end loop;
  return new;
end; $$;
revoke all on function public.genz_notification_message_trigger() from public,anon,authenticated;
drop trigger if exists genz_notify_deal_message on public.genz_deal_messages;
create trigger genz_notify_deal_message after insert on public.genz_deal_messages for each row execute function public.genz_notification_message_trigger();

create or replace function public.genz_notification_access_request_trigger()
returns trigger language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_listing uuid;
begin
  select p.listing_user_id into v_listing from public.genz_properties p where p.id=new.property_id;
  if tg_op='INSERT' then
    if v_listing is distinct from new.requester_user_id then perform public.genz_emit_notification(v_listing,'access_request','Protected listing access requested','A broker requested protected information for listing '||new.property_id||'.','access_request',new.id::text,'/access-requests','action','access:'||new.id::text||':pending'); end if;
  elsif new.status is distinct from old.status then
    perform public.genz_emit_notification(new.requester_user_id,'access_review','Listing access request updated','Your request for listing '||new.property_id||' is now '||new.status||'.','access_request',new.id::text,'/access-requests',case when new.status='approved' then 'action' else 'info' end,'access:'||new.id::text||':status:'||new.status);
  end if;
  return new;
end; $$;
revoke all on function public.genz_notification_access_request_trigger() from public,anon,authenticated;
drop trigger if exists genz_notify_access_request on public.genz_listing_access_requests;
create trigger genz_notify_access_request after insert or update of status on public.genz_listing_access_requests for each row execute function public.genz_notification_access_request_trigger();

create or replace function public.genz_notification_builder_invite_trigger()
returns trigger language plpgsql security definer set search_path='pg_catalog','public' as $$
begin
  if tg_op='INSERT' then
    perform public.genz_emit_notification(new.broker_user_id,'builder_invite','New builder project invite','A builder invited you to collaborate on a project.','builder_invite',new.id::text,'/project-invites','action','builder-invite:'||new.id::text||':new');
  elsif new.status is distinct from old.status and new.sent_by_user_id is not null then
    perform public.genz_emit_notification(new.sent_by_user_id,'builder_invite_response','Broker responded to project invite','Project invite response: '||new.status||'.','builder_invite',new.id::text,'/builder-portal','info','builder-invite:'||new.id::text||':status:'||new.status);
  end if;
  return new;
end; $$;
revoke all on function public.genz_notification_builder_invite_trigger() from public,anon,authenticated;
drop trigger if exists genz_notify_builder_invite on public.genz_builder_broker_invites;
create trigger genz_notify_builder_invite after insert or update of status on public.genz_builder_broker_invites for each row execute function public.genz_notification_builder_invite_trigger();

create or replace function public.genz_notification_opportunity_response_trigger()
returns trigger language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_owner uuid;
begin
  select o.posted_by_user_id into v_owner from public.genz_opportunity_posts o where o.id=new.opportunity_id;
  if tg_op='INSERT' then
    if v_owner is distinct from new.broker_user_id then perform public.genz_emit_notification(v_owner,'opportunity_response','New Opportunity response','A broker responded to one of your Opportunity Exchange posts.','opportunity_response',new.id::text,'/opportunities','action','opp-response:'||new.id::text||':new'); end if;
  elsif new.status is distinct from old.status then
    perform public.genz_emit_notification(new.broker_user_id,'opportunity_response_status','Opportunity response updated','Your Opportunity response is now '||new.status||'.','opportunity_response',new.id::text,'/opportunities','info','opp-response:'||new.id::text||':status:'||new.status);
  end if;
  return new;
end; $$;
revoke all on function public.genz_notification_opportunity_response_trigger() from public,anon,authenticated;
drop trigger if exists genz_notify_opportunity_response on public.genz_opportunity_responses;
create trigger genz_notify_opportunity_response after insert or update of status on public.genz_opportunity_responses for each row execute function public.genz_notification_opportunity_response_trigger();

create or replace function public.genz_notification_commission_trigger()
returns trigger language plpgsql security definer set search_path='pg_catalog','public' as $$
declare r record; v_actor uuid:=auth.uid();
begin
  if tg_op='INSERT' then
    for r in select dp.user_id from public.genz_deal_participants dp where dp.deal_id=new.deal_id and dp.status='active' and dp.can_view_financials and dp.user_id<>new.proposed_by_user_id loop
      perform public.genz_emit_notification(r.user_id,'commission_action','Commission agreement needs review','A commission agreement was proposed for deal '||new.deal_id||'.','commission_agreement',new.id::text,'/commissions','action','commission:'||new.id::text||':proposed:'||r.user_id::text);
    end loop;
  elsif new.status is distinct from old.status then
    for r in select dp.user_id from public.genz_deal_participants dp where dp.deal_id=new.deal_id and dp.status='active' and dp.can_view_financials and dp.user_id is distinct from v_actor loop
      perform public.genz_emit_notification(r.user_id,'commission_action','Commission agreement updated','Agreement for deal '||new.deal_id||' is now '||new.status||'.','commission_agreement',new.id::text,'/commissions','info','commission:'||new.id::text||':status:'||new.status||':'||r.user_id::text);
    end loop;
  end if;
  return new;
end; $$;
revoke all on function public.genz_notification_commission_trigger() from public,anon,authenticated;
drop trigger if exists genz_notify_commission_agreement on public.genz_commission_agreements;
create trigger genz_notify_commission_agreement after insert or update of status on public.genz_commission_agreements for each row execute function public.genz_notification_commission_trigger();

create or replace function public.genz_notification_visit_trigger()
returns trigger language plpgsql security definer set search_path='pg_catalog','public' as $$
declare r record;
begin
  if tg_op='INSERT' then
    for r in select dp.user_id from public.genz_deal_participants dp where dp.deal_id=new.deal_id and dp.status='active' and dp.can_manage_visit and dp.user_id<>new.created_by_user_id loop
      perform public.genz_emit_notification(r.user_id,'visit_scheduled','Site visit scheduled','A site visit is scheduled for '||to_char(new.scheduled_at at time zone 'Asia/Kolkata','DD Mon YYYY, HH12:MI AM')||'.','visit',new.id::text,'/visits','action','visit:'||new.id::text||':scheduled:'||r.user_id::text);
    end loop;
  end if;
  return new;
end; $$;
revoke all on function public.genz_notification_visit_trigger() from public,anon,authenticated;
drop trigger if exists genz_notify_visit on public.genz_visits;
create trigger genz_notify_visit after insert on public.genz_visits for each row execute function public.genz_notification_visit_trigger();

create or replace function public.genz_mark_notification(p_notification_id uuid,p_action text)
returns boolean language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_uid uuid:=auth.uid(); v_count int;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_action='read' then update public.genz_notifications set read_at=coalesce(read_at,now()) where id=p_notification_id and user_id=v_uid;
  elsif p_action='unread' then update public.genz_notifications set read_at=null where id=p_notification_id and user_id=v_uid;
  elsif p_action='dismiss' then update public.genz_notifications set dismissed_at=now(),read_at=coalesce(read_at,now()) where id=p_notification_id and user_id=v_uid;
  else raise exception 'INVALID_NOTIFICATION_ACTION'; end if;
  get diagnostics v_count=row_count; return v_count=1;
end; $$;
revoke all on function public.genz_mark_notification(uuid,text) from public,anon;
grant execute on function public.genz_mark_notification(uuid,text) to authenticated,service_role;

create or replace function public.genz_mark_all_notifications_read()
returns integer language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_uid uuid:=auth.uid(); v_count int;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.genz_notifications set read_at=now() where user_id=v_uid and read_at is null and dismissed_at is null;
  get diagnostics v_count=row_count; return v_count;
end; $$;
revoke all on function public.genz_mark_all_notifications_read() from public,anon;
grant execute on function public.genz_mark_all_notifications_read() to authenticated,service_role;

create or replace function public.genz_update_followup(p_followup_id uuid,p_action text,p_snooze_hours integer default 24)
returns boolean language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_uid uuid:=auth.uid(); v_count int; v_hours int:=greatest(1,least(coalesce(p_snooze_hours,24),720));
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_action='done' then update public.genz_followups set status='done',completed_at=now(),snoozed_until=null,updated_at=now() where id=p_followup_id and user_id=v_uid;
  elsif p_action='snooze' then update public.genz_followups set status='snoozed',snoozed_until=now()+make_interval(hours=>v_hours),updated_at=now() where id=p_followup_id and user_id=v_uid;
  elsif p_action='reopen' then update public.genz_followups set status='pending',completed_at=null,snoozed_until=null,updated_at=now() where id=p_followup_id and user_id=v_uid;
  elsif p_action='dismiss' then update public.genz_followups set status='cancelled',completed_at=null,snoozed_until=null,updated_at=now() where id=p_followup_id and user_id=v_uid;
  else raise exception 'INVALID_FOLLOWUP_ACTION'; end if;
  get diagnostics v_count=row_count; return v_count=1;
end; $$;
revoke all on function public.genz_update_followup(uuid,text,integer) from public,anon;
grant execute on function public.genz_update_followup(uuid,text,integer) to authenticated,service_role;

create or replace function public.genz_refresh_my_followups()
returns integer language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_uid uuid:=auth.uid(); r record; v_count int;
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;

  update public.genz_followups f set status='cancelled',updated_at=now()
  where f.user_id=v_uid and f.status in ('pending','snoozed') and (
    (f.kind='requirement_expiry' and not exists(select 1 from public.genz_requirements q where q.id=f.entity_id and q.source_user_id=v_uid and q.status='active' and q.expires_at is not null)) or
    (f.kind='protection_expiry' and not exists(select 1 from public.genz_requirements q where q.id=f.entity_id and q.source_user_id=v_uid and q.status='active' and q.protection_expires_at is not null)) or
    (f.kind='visit_due' and not exists(select 1 from public.genz_visits v join public.genz_deal_participants dp on dp.deal_id=v.deal_id and dp.user_id=v_uid and dp.status='active' where v.id::text=f.entity_id and v.status='scheduled')) or
    (f.kind='offer_expiry' and not exists(select 1 from public.genz_deal_offers o join public.genz_deal_participants dp on dp.deal_id=o.deal_id and dp.user_id=v_uid and dp.status='active' and dp.can_view_financials where o.id::text=f.entity_id and o.status='proposed' and o.offered_by_user_id<>v_uid)) or
    (f.kind='commission_due' and not exists(select 1 from public.genz_commission_agreements a join public.genz_deal_participants dp on dp.deal_id=a.deal_id and dp.user_id=v_uid and dp.status='active' and dp.can_view_financials where a.id::text=f.entity_id and a.status='accepted' and a.due_date is not null)) or
    (f.kind='stale_deal' and not exists(select 1 from public.genz_deals d join public.genz_deal_participants dp on dp.deal_id=d.id and dp.user_id=v_uid and dp.status='active' where d.id=f.entity_id and d.status in ('accepted','visit_verified','negotiation'))) or
    (f.kind='stale_requirement' and not exists(select 1 from public.genz_requirements q where q.id=f.entity_id and q.source_user_id=v_uid and q.status='active'))
  );

  for r in select q.id,q.expires_at from public.genz_requirements q where q.source_user_id=v_uid and q.status='active' and q.expires_at is not null loop
    perform public.genz_upsert_followup(v_uid,'requirement_expiry','requirement',r.id,'Buyer requirement expires soon','Renew, close or update this requirement before it goes stale.','/requirements',r.expires_at-interval '3 days',r.expires_at::text,'requirement-expiry:'||r.id);
  end loop;
  for r in select q.id,q.protection_expires_at from public.genz_requirements q where q.source_user_id=v_uid and q.status='active' and q.protection_expires_at is not null loop
    perform public.genz_upsert_followup(v_uid,'protection_expiry','requirement',r.id,'Buyer protection window ending','Review the protected buyer relationship before the protection window ends.','/requirements',r.protection_expires_at-interval '1 day',r.protection_expires_at::text,'protection-expiry:'||r.id);
  end loop;
  for r in select v.id,v.scheduled_at,v.deal_id from public.genz_visits v join public.genz_deal_participants dp on dp.deal_id=v.deal_id and dp.user_id=v_uid and dp.status='active' and dp.can_manage_visit where v.status='scheduled' loop
    perform public.genz_upsert_followup(v_uid,'visit_due','visit',r.id::text,'Upcoming site visit','Confirm participants and visit proof for deal '||r.deal_id||'.','/visits',r.scheduled_at-interval '2 hours',r.scheduled_at::text,'visit-due:'||r.id::text);
  end loop;
  for r in select o.id,o.valid_until,o.deal_id from public.genz_deal_offers o join public.genz_deal_participants dp on dp.deal_id=o.deal_id and dp.user_id=v_uid and dp.status='active' and dp.can_view_financials where o.status='proposed' and o.offered_by_user_id<>v_uid loop
    perform public.genz_upsert_followup(v_uid,'offer_expiry','offer',r.id::text,'Offer needs a response','This private offer will expire if no action is taken.','/deals?deal='||r.deal_id,r.valid_until-interval '2 hours',r.valid_until::text,'offer-expiry:'||r.id::text);
  end loop;
  for r in select a.id,a.due_date,a.deal_id from public.genz_commission_agreements a join public.genz_deal_participants dp on dp.deal_id=a.deal_id and dp.user_id=v_uid and dp.status='active' and dp.can_view_financials where a.status='accepted' and a.due_date is not null loop
    perform public.genz_upsert_followup(v_uid,'commission_due','commission_agreement',r.id::text,'Commission due date approaching','Review payment status for deal '||r.deal_id||'.','/commissions',(r.due_date::timestamp at time zone 'Asia/Kolkata')-interval '3 days',r.due_date::text,'commission-due:'||r.id::text);
  end loop;
  for r in select d.id,d.updated_at from public.genz_deals d join public.genz_deal_participants dp on dp.deal_id=d.id and dp.user_id=v_uid and dp.status='active' where d.status in ('accepted','visit_verified','negotiation') and d.updated_at<now()-interval '3 days' loop
    perform public.genz_upsert_followup(v_uid,'stale_deal','deal',r.id,'Deal Room needs follow-up','No Deal Room state change has been recorded for 3 days.','/deals?deal='||r.id,r.updated_at+interval '3 days',r.updated_at::text,'stale-deal:'||r.id);
  end loop;
  for r in select q.id,q.updated_at from public.genz_requirements q where q.source_user_id=v_uid and q.status='active' and q.updated_at<now()-interval '7 days' loop
    perform public.genz_upsert_followup(v_uid,'stale_requirement','requirement',r.id,'Buyer requirement needs follow-up','Confirm whether the buyer requirement is still current.','/requirements',r.updated_at+interval '7 days',r.updated_at::text,'stale-requirement:'||r.id);
  end loop;

  update public.genz_followups set status='pending',snoozed_until=null,updated_at=now() where user_id=v_uid and status='snoozed' and snoozed_until<=now();
  select count(*) into v_count from public.genz_followups where user_id=v_uid and status='pending' and due_at<=now();
  return v_count;
end; $$;
revoke all on function public.genz_refresh_my_followups() from public,anon;
grant execute on function public.genz_refresh_my_followups() to authenticated,service_role;
