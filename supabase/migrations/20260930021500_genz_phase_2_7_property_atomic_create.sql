-- Normalize existing owner signals and provide an atomic property+private+claim create API.

update public.genz_master_properties mp
set owner_phone_hash = src.owner_hash,
    updated_at = now()
from (
  select p.master_property_id,
         encode(
           hmac(
             'owner:' || case
               when length(regexp_replace(pp.owner_phone_e164,'[^0-9]','','g'))=12
                    and left(regexp_replace(pp.owner_phone_e164,'[^0-9]','','g'),2)='91'
                 then right(regexp_replace(pp.owner_phone_e164,'[^0-9]','','g'),10)
               else regexp_replace(pp.owner_phone_e164,'[^0-9]','','g')
             end,
             (select value from genz_private.config where key='phone_pepper'),
             'sha256'
           ),
           'hex'
         ) as owner_hash
  from public.genz_properties p
  join public.genz_property_private pp on pp.property_id=p.id
  where pp.owner_phone_e164 is not null
    and regexp_replace(pp.owner_phone_e164,'[^0-9]','','g')<>''
) src
where mp.id=src.master_property_id
  and src.owner_hash is not null;

create or replace function public.genz_create_property_mandate_v2(
  p_property_id text,
  p_title text,
  p_city text,
  p_locality text,
  p_property_type text,
  p_size integer,
  p_asking numeric,
  p_owner_name text,
  p_owner_phone text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_candidate_master_id uuid default null,
  p_merge_note text default ''
)
returns table(
  property_id text,
  master_property_id uuid,
  merge_claim_id uuid
)
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare
  v_uid uuid:=auth.uid();
  v_owner_digits text;
  v_master uuid;
  v_claim uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.genz_is_member() then raise exception 'MEMBERSHIP_REQUIRED'; end if;
  if coalesce(trim(p_property_id),'')='' or coalesce(trim(p_title),'')='' or coalesce(trim(p_city),'')='' or coalesce(trim(p_property_type),'')='' or coalesce(trim(p_owner_name),'')='' then
    raise exception 'INVALID_PROPERTY';
  end if;
  if p_size is null or p_size<=0 or p_asking is null or p_asking<=0 then raise exception 'INVALID_PROPERTY'; end if;
  if p_latitude is not null and not(p_latitude between -90 and 90) then raise exception 'INVALID_LATITUDE'; end if;
  if p_longitude is not null and not(p_longitude between -180 and 180) then raise exception 'INVALID_LONGITUDE'; end if;

  v_owner_digits:=regexp_replace(coalesce(p_owner_phone,''),'[^0-9]','','g');
  if length(v_owner_digits)=12 and left(v_owner_digits,2)='91' then v_owner_digits:=right(v_owner_digits,10); end if;
  if v_owner_digits<>'' and v_owner_digits !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_OWNER_PHONE'; end if;

  if exists(select 1 from public.genz_properties p where p.id=trim(p_property_id)) then raise exception 'PROPERTY_ID_EXISTS'; end if;

  insert into public.genz_properties(
    id,listing_user_id,title,city,locality,property_type,size,asking,
    owner_label,mandate_status,status,latitude,longitude
  ) values (
    trim(p_property_id),v_uid,trim(p_title),trim(p_city),nullif(trim(coalesce(p_locality,'')),''),trim(p_property_type),p_size,p_asking,
    'Owner protected','pending','active',p_latitude,p_longitude
  ) returning genz_properties.master_property_id into v_master;

  insert into public.genz_property_private(property_id,listing_user_id,owner_name,owner_phone_e164)
  values(trim(p_property_id),v_uid,trim(p_owner_name),nullif(v_owner_digits,''));

  if p_candidate_master_id is not null then
    v_claim:=public.genz_request_property_master_merge(trim(p_property_id),p_candidate_master_id,left(coalesce(p_merge_note,''),600));
  end if;

  return query select trim(p_property_id),v_master,v_claim;
end;
$$;

revoke execute on function public.genz_create_property_mandate_v2(text,text,text,text,text,integer,numeric,text,text,numeric,numeric,uuid,text) from public,anon;
grant execute on function public.genz_create_property_mandate_v2(text,text,text,text,text,integer,numeric,text,text,numeric,numeric,uuid,text) to authenticated,service_role;

comment on function public.genz_create_property_mandate_v2(text,text,text,text,text,integer,numeric,text,text,numeric,numeric,uuid,text)
is 'Atomic broker property mandate creation. Property, private owner relationship and optional Master merge claim commit together or roll back together.';
