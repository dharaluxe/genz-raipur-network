create or replace function public.genz_respond_builder_project_invite(p_invite_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare inv public.genz_builder_broker_invites%rowtype;
begin
  if auth.uid() is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  if p_status not in ('accepted','declined') then raise exception 'INVALID_RESPONSE'; end if;
  select * into inv from public.genz_builder_broker_invites where id=p_invite_id for update;
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;
  if inv.broker_user_id<>auth.uid() and not public.genz_is_admin() then raise exception 'INVITE_ACCESS_DENIED'; end if;
  if inv.status<>'pending' then raise exception 'INVITE_NOT_PENDING'; end if;
  if inv.expires_at<=now() then update public.genz_builder_broker_invites set status='expired',responded_at=now() where id=inv.id; raise exception 'INVITE_EXPIRED'; end if;
  update public.genz_builder_broker_invites set status=p_status,responded_at=now() where id=inv.id;
  return true;
end;$$;
revoke all on function public.genz_respond_builder_project_invite(uuid,text) from public,anon;
grant execute on function public.genz_respond_builder_project_invite(uuid,text) to authenticated;

create or replace function public.genz_revoke_builder_project_invite(p_invite_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare inv public.genz_builder_broker_invites%rowtype; pr public.genz_builder_projects%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into inv from public.genz_builder_broker_invites where id=p_invite_id for update;
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;
  select * into pr from public.genz_builder_projects where id=inv.project_id;
  if not public.genz_builder_can_manage(pr.builder_id) then raise exception 'BUILDER_MANAGE_REQUIRED'; end if;
  if inv.status<>'pending' then raise exception 'INVITE_NOT_PENDING'; end if;
  update public.genz_builder_broker_invites set status='revoked',responded_at=now() where id=inv.id;
  return true;
end;$$;
revoke all on function public.genz_revoke_builder_project_invite(uuid) from public,anon;
grant execute on function public.genz_revoke_builder_project_invite(uuid) to authenticated;

revoke insert,update on public.genz_builder_broker_invites from authenticated;
grant execute on function public.genz_confirm_owner_consent(text,text) to anon,authenticated;

create or replace function public.genz_create_owner_confirmation(p_property_id text,p_owner_phone text,p_expires_minutes integer default 15)
returns table(confirmation_id uuid, owner_token text, consent_code text, expires_at timestamptz) language plpgsql security definer set search_path=public,extensions as $$
declare prop public.genz_properties%rowtype; digits text; raw_token text; otp text; cid uuid; exp timestamptz; entropy bigint;
begin
  if auth.uid() is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into prop from public.genz_properties where id=p_property_id;
  if not found or (prop.listing_user_id<>auth.uid() and not public.genz_is_admin()) then raise exception 'PROPERTY_ACCESS_DENIED'; end if;
  digits:=regexp_replace(coalesce(p_owner_phone,''),'\D','','g'); if length(digits)=12 and left(digits,2)='91' then digits:=right(digits,10); end if;
  if digits !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;
  raw_token:=encode(extensions.gen_random_bytes(24),'hex');
  entropy:=('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint;
  otp:=lpad((entropy%1000000)::text,6,'0');
  exp:=now()+make_interval(mins=>greatest(5,least(p_expires_minutes,60)));
  update public.genz_owner_confirmations set status='revoked' where property_id=p_property_id and status='pending';
  insert into public.genz_owner_confirmations(property_id,requested_by_user_id,owner_phone_masked,token_hash,otp_hash,expires_at)
  values(p_property_id,auth.uid(),left(digits,2)||'******'||right(digits,2),encode(extensions.digest(raw_token,'sha256'),'hex'),encode(extensions.digest(otp||':'||p_property_id,'sha256'),'hex'),exp) returning id into cid;
  update public.genz_property_private set owner_phone_e164='+91'||digits,updated_at=now() where property_id=p_property_id and listing_user_id=prop.listing_user_id;
  return query select cid,raw_token,otp,exp;
end;$$;
revoke all on function public.genz_create_owner_confirmation(text,text,integer) from public,anon;
grant execute on function public.genz_create_owner_confirmation(text,text,integer) to authenticated;
