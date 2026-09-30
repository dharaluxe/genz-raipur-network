-- Refine requirement dedupe so materially different size needs can coexist.
-- Two requirements are similar only when city/type/budget overlap AND minimum
-- size is reasonably close. If either side has no size preference (0), size
-- does not split the requirement.

create or replace function public.genz_requirement_size_similar(p_existing integer, p_candidate integer)
returns boolean
language sql
immutable
set search_path = 'pg_catalog'
as $$
  select case
    when coalesce(p_existing,0) = 0 or coalesce(p_candidate,0) = 0 then true
    else abs(p_existing - p_candidate) <= greatest(200, ceil(greatest(p_existing,p_candidate) * 0.25)::integer)
  end;
$$;

revoke execute on function public.genz_requirement_size_similar(integer,integer) from public, anon, authenticated;
grant execute on function public.genz_requirement_size_similar(integer,integer) to service_role;

create or replace function public.genz_requirement_candidate(
  p_phone text,
  p_city text,
  p_property_type text,
  p_min_budget numeric,
  p_max_budget numeric,
  p_min_size integer default 0
)
returns table (
  buyer_exists boolean,
  classification text,
  own_requirement_id text,
  protected_until timestamptz
)
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'genz_private', 'extensions'
as $$
declare
  v_uid uuid := auth.uid();
  v_digits text;
  v_pepper text;
  v_hash text;
  v_buyer_id uuid;
  v_own_id text;
  v_own_until timestamptz;
  v_other_until timestamptz;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.genz_is_member() then raise exception 'MEMBERSHIP_REQUIRED'; end if;
  v_digits := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
  if length(v_digits) = 12 and left(v_digits,2) = '91' then v_digits := right(v_digits,10); end if;
  if v_digits !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;
  if coalesce(trim(p_city),'') = '' or coalesce(trim(p_property_type),'') = '' then raise exception 'INVALID_REQUIREMENT'; end if;
  if p_min_budget is null or p_min_budget < 0 or p_max_budget is null or p_max_budget <= 0 or p_min_budget > p_max_budget then raise exception 'INVALID_BUDGET_RANGE'; end if;
  if p_min_size is null or p_min_size < 0 then raise exception 'INVALID_REQUIREMENT'; end if;
  select value into v_pepper from genz_private.config where key='phone_pepper';
  v_hash := encode(hmac(v_digits,v_pepper,'sha256'),'hex');
  select b.id into v_buyer_id from public.genz_buyers b where b.phone_hash=v_hash;
  if v_buyer_id is null then return query select false,'new_buyer'::text,null::text,null::timestamptz; return; end if;

  select r.id,r.protection_expires_at into v_own_id,v_own_until
  from public.genz_requirements r
  where r.buyer_id=v_buyer_id and r.source_user_id=v_uid
    and r.status in ('active','follow_up','paused')
    and lower(trim(r.city))=lower(trim(p_city))
    and lower(trim(r.property_type))=lower(trim(p_property_type))
    and greatest(r.min_budget,p_min_budget)<=least(r.max_budget,p_max_budget)
    and public.genz_requirement_size_similar(r.min_size,p_min_size)
  order by r.updated_at desc limit 1;
  if v_own_id is not null then return query select true,'update_own_requirement'::text,v_own_id,v_own_until; return; end if;

  select max(r.protection_expires_at) into v_other_until
  from public.genz_requirements r
  where r.buyer_id=v_buyer_id and r.source_user_id<>v_uid
    and r.status in ('active','follow_up','paused') and r.protection_expires_at>now()
    and lower(trim(r.city))=lower(trim(p_city))
    and lower(trim(r.property_type))=lower(trim(p_property_type))
    and greatest(r.min_budget,p_min_budget)<=least(r.max_budget,p_max_budget)
    and public.genz_requirement_size_similar(r.min_size,p_min_size);
  if v_other_until is not null then return query select true,'protected_requirement'::text,null::text,v_other_until; return; end if;
  return query select true,'new_requirement'::text,null::text,null::timestamptz;
end;
$$;

revoke execute on function public.genz_requirement_candidate(text,text,text,numeric,numeric,integer) from public, anon;
grant execute on function public.genz_requirement_candidate(text,text,text,numeric,numeric,integer) to authenticated, service_role;

-- Register V2: same refinement for both own-duplicate and other-broker protection checks.
create or replace function public.genz_register_requirement_v2(
  p_requirement_id text,
  p_buyer_name text,
  p_phone text,
  p_city text,
  p_property_type text,
  p_min_budget numeric,
  p_max_budget numeric,
  p_min_size integer,
  p_expires_at timestamptz,
  p_protection_expires_at timestamptz,
  p_force_separate boolean default false
)
returns table (requirement_id text,buyer_id uuid,version_no integer)
language plpgsql
security definer
set search_path='pg_catalog','public','genz_private','extensions'
as $$
declare
  v_uid uuid:=auth.uid(); v_digits text; v_pepper text; v_hash text; v_buyer_id uuid;
  v_own_similar text; v_other_until timestamptz;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.genz_is_member() then raise exception 'MEMBERSHIP_REQUIRED'; end if;
  v_digits:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if length(v_digits)=12 and left(v_digits,2)='91' then v_digits:=right(v_digits,10); end if;
  if v_digits !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;
  if coalesce(trim(p_requirement_id),'')='' or coalesce(trim(p_buyer_name),'')='' or coalesce(trim(p_city),'')='' or coalesce(trim(p_property_type),'')='' then raise exception 'INVALID_REQUIREMENT'; end if;
  if p_min_budget is null or p_min_budget<0 or p_max_budget is null or p_max_budget<=0 or p_min_budget>p_max_budget then raise exception 'INVALID_BUDGET_RANGE'; end if;
  if p_min_size is null or p_min_size<0 then raise exception 'INVALID_REQUIREMENT'; end if;
  if p_expires_at is null or p_expires_at<=now() then raise exception 'INVALID_REQUIREMENT_EXPIRY'; end if;
  if p_protection_expires_at is null or p_protection_expires_at<=now() then raise exception 'INVALID_PROTECTION_EXPIRY'; end if;
  if p_protection_expires_at>p_expires_at then raise exception 'PROTECTION_EXCEEDS_REQUIREMENT_EXPIRY'; end if;
  select value into v_pepper from genz_private.config where key='phone_pepper';
  v_hash:=encode(hmac(v_digits,v_pepper,'sha256'),'hex');
  select b.id into v_buyer_id from public.genz_buyers b where b.phone_hash=v_hash for update;
  if v_buyer_id is null then
    insert into public.genz_buyers(source_user_id,name,phone_e164,phone_hash,phone_masked,claim_expires_at,created_at,updated_at)
    values(v_uid,trim(p_buyer_name),v_digits,v_hash,left(v_digits,2)||'******'||right(v_digits,2),p_protection_expires_at,now(),now()) returning id into v_buyer_id;
  else update public.genz_buyers set updated_at=now() where id=v_buyer_id; end if;

  select r.id into v_own_similar from public.genz_requirements r
  where r.buyer_id=v_buyer_id and r.source_user_id=v_uid and r.status in ('active','follow_up','paused')
    and lower(trim(r.city))=lower(trim(p_city)) and lower(trim(r.property_type))=lower(trim(p_property_type))
    and greatest(r.min_budget,p_min_budget)<=least(r.max_budget,p_max_budget)
    and public.genz_requirement_size_similar(r.min_size,p_min_size)
  order by r.updated_at desc limit 1;
  if v_own_similar is not null and not p_force_separate then raise exception 'GENZ_SIMILAR_REQUIREMENT_EXISTS:%',v_own_similar; end if;

  select max(r.protection_expires_at) into v_other_until from public.genz_requirements r
  where r.buyer_id=v_buyer_id and r.source_user_id<>v_uid and r.status in ('active','follow_up','paused')
    and r.protection_expires_at>now() and lower(trim(r.city))=lower(trim(p_city))
    and lower(trim(r.property_type))=lower(trim(p_property_type))
    and greatest(r.min_budget,p_min_budget)<=least(r.max_budget,p_max_budget)
    and public.genz_requirement_size_similar(r.min_size,p_min_size);
  if v_other_until is not null then raise exception 'GENZ_REQUIREMENT_PROTECTED'; end if;

  insert into public.genz_buyer_broker_relationships(buyer_id,broker_user_id,contact_name,phone_e164,status,first_seen_at,last_seen_at,created_at,updated_at)
  values(v_buyer_id,v_uid,trim(p_buyer_name),v_digits,'active',now(),now(),now(),now())
  on conflict on constraint genz_buyer_broker_relationships_buyer_id_broker_user_id_key do update
    set contact_name=excluded.contact_name,phone_e164=excluded.phone_e164,status='active',last_seen_at=now(),updated_at=now();
  insert into public.genz_requirements(id,buyer_id,source_user_id,buyer_label,buyer_phone_masked,city,property_type,min_budget,max_budget,min_size,status,created_at,updated_at,expires_at,protection_expires_at,version_no)
  values(trim(p_requirement_id),v_buyer_id,v_uid,left(trim(p_buyer_name),1)||'***',left(v_digits,2)||'******'||right(v_digits,2),trim(p_city),trim(p_property_type),p_min_budget,p_max_budget,p_min_size,'active',now(),now(),p_expires_at,p_protection_expires_at,1);
  insert into public.genz_requirement_versions(requirement_id,version_no,changed_by_user_id,city,property_type,min_budget,max_budget,min_size,status,protection_expires_at,expires_at,change_reason,created_at)
  values(trim(p_requirement_id),1,v_uid,trim(p_city),trim(p_property_type),p_min_budget,p_max_budget,p_min_size,'active',p_protection_expires_at,p_expires_at,'Requirement created',now());
  return query select trim(p_requirement_id),v_buyer_id,1;
end;
$$;

revoke execute on function public.genz_register_requirement_v2(text,text,text,text,text,numeric,numeric,integer,timestamptz,timestamptz,boolean) from public, anon;
grant execute on function public.genz_register_requirement_v2(text,text,text,text,text,numeric,numeric,integer,timestamptz,timestamptz,boolean) to authenticated, service_role;
