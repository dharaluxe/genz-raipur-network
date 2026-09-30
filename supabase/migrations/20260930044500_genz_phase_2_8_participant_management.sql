-- Core brokers can add/remove referral brokers or observers with least-privilege permissions.

create or replace function public.genz_upsert_deal_participant(
  p_deal_id text,
  p_broker_code text,
  p_role text default 'observer',
  p_can_offer boolean default false,
  p_can_message boolean default true,
  p_can_add_evidence boolean default false,
  p_can_manage_visit boolean default false,
  p_can_view_financials boolean default false
)
returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $$
declare
  v_uid uuid:=auth.uid();
  d public.genz_deals%rowtype;
  target public.genz_profiles%rowtype;
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  if not public.genz_deal_has_permission(p_deal_id,'manage_participants') then raise exception 'DEAL_PARTICIPANT_MANAGE_DENIED'; end if;
  if p_role not in ('referral_broker','observer') then raise exception 'INVALID_PARTICIPANT_ROLE'; end if;
  select * into d from public.genz_deals where id=p_deal_id;
  if d.id is null then raise exception 'DEAL_NOT_FOUND'; end if;
  select * into target from public.genz_profiles where upper(broker_code)=upper(trim(coalesce(p_broker_code,''))) limit 1;
  if target.id is null then raise exception 'BROKER_NOT_FOUND'; end if;
  if target.id in(d.buyer_user_id,d.listing_user_id) then raise exception 'CORE_PARTICIPANT_IMMUTABLE'; end if;
  insert into public.genz_deal_participants(deal_id,user_id,role,status,can_offer,can_message,can_add_evidence,can_manage_visit,can_close,can_view_financials,can_manage_participants)
  values(p_deal_id,target.id,p_role,'active',coalesce(p_can_offer,false),coalesce(p_can_message,true),coalesce(p_can_add_evidence,false),coalesce(p_can_manage_visit,false),false,coalesce(p_can_view_financials,false),false)
  on conflict(deal_id,user_id) do update set
    role=excluded.role,status='active',can_offer=excluded.can_offer,can_message=excluded.can_message,can_add_evidence=excluded.can_add_evidence,can_manage_visit=excluded.can_manage_visit,can_close=false,can_view_financials=excluded.can_view_financials,can_manage_participants=false,updated_at=now();
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
  values('EV-'||replace(gen_random_uuid()::text,'-',''),p_deal_id,v_uid,'participant_updated',target.broker_code||' added/updated as '||replace(p_role,'_',' '));
  return target.id;
end; $$;
revoke execute on function public.genz_upsert_deal_participant(text,text,text,boolean,boolean,boolean,boolean,boolean) from public,anon;
grant execute on function public.genz_upsert_deal_participant(text,text,text,boolean,boolean,boolean,boolean,boolean) to authenticated,service_role;

create or replace function public.genz_remove_deal_participant(p_deal_id text,p_user_id uuid)
returns void language plpgsql security definer set search_path='pg_catalog','public' as $$
declare
  v_uid uuid:=auth.uid();
  d public.genz_deals%rowtype;
  target public.genz_profiles%rowtype;
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  if not public.genz_deal_has_permission(p_deal_id,'manage_participants') then raise exception 'DEAL_PARTICIPANT_MANAGE_DENIED'; end if;
  select * into d from public.genz_deals where id=p_deal_id;
  if d.id is null then raise exception 'DEAL_NOT_FOUND'; end if;
  if p_user_id in(d.buyer_user_id,d.listing_user_id) then raise exception 'CORE_PARTICIPANT_IMMUTABLE'; end if;
  select * into target from public.genz_profiles where id=p_user_id;
  if target.id is null then raise exception 'BROKER_NOT_FOUND'; end if;
  update public.genz_deal_participants
  set status='removed',can_offer=false,can_message=false,can_add_evidence=false,can_manage_visit=false,can_close=false,can_view_financials=false,can_manage_participants=false,updated_at=now()
  where deal_id=p_deal_id and user_id=p_user_id and role in('referral_broker','observer');
  if not found then raise exception 'REMOVABLE_PARTICIPANT_NOT_FOUND'; end if;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
  values('EV-'||replace(gen_random_uuid()::text,'-',''),p_deal_id,v_uid,'participant_removed',target.broker_code||' removed from Deal Room');
end; $$;
revoke execute on function public.genz_remove_deal_participant(text,uuid) from public,anon;
grant execute on function public.genz_remove_deal_participant(text,uuid) to authenticated,service_role;
