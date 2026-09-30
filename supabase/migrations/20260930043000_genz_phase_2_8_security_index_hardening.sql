-- GENZ advanced Deal Room hardening: cover the remaining FK, keep trigger functions internal, and prevent arbitrary permission probing.

create index if not exists genz_deal_offers_responded_by_idx
  on public.genz_deal_offers(responded_by_user_id,responded_at desc)
  where responded_by_user_id is not null;

revoke all on function public.genz_seed_deal_participants() from public,anon,authenticated;
revoke all on function public.genz_sync_closeouts_on_deal_close() from public,anon,authenticated;
grant execute on function public.genz_seed_deal_participants() to service_role;
grant execute on function public.genz_sync_closeouts_on_deal_close() to service_role;

create or replace function public.genz_deal_has_permission(p_deal_id text,p_permission text,p_user_id uuid default null)
returns boolean language plpgsql stable security definer set search_path='pg_catalog','public' as $$
declare
  v_caller uuid:=auth.uid();
  v_user uuid:=coalesce(p_user_id,auth.uid());
  v_allowed boolean:=false;
  v_caller_can_manage boolean:=false;
begin
  if v_caller is null or v_user is null then return false; end if;
  if public.genz_is_admin() then return true; end if;

  if p_user_id is not null and p_user_id<>v_caller then
    select coalesce(dp.can_manage_participants,false) into v_caller_can_manage
    from public.genz_deal_participants dp
    where dp.deal_id=p_deal_id and dp.user_id=v_caller and dp.status='active';
    if not coalesce(v_caller_can_manage,false) then return false; end if;
  end if;

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
  from public.genz_deal_participants dp
  where dp.deal_id=p_deal_id and dp.user_id=v_user and dp.status='active';

  return coalesce(v_allowed,false);
end; $$;
revoke all on function public.genz_deal_has_permission(text,text,uuid) from public,anon;
grant execute on function public.genz_deal_has_permission(text,text,uuid) to authenticated,service_role;
