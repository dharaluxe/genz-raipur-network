alter table public.genz_properties add column if not exists description text not null default '';
alter table public.genz_property_private add column if not exists address text not null default '';

do $$ begin
  if not exists (select 1 from pg_constraint where conname='genz_properties_description_len_check' and conrelid='public.genz_properties'::regclass) then
    alter table public.genz_properties add constraint genz_properties_description_len_check check (char_length(description)<=5000);
  end if;
  if not exists (select 1 from pg_constraint where conname='genz_property_private_address_len_check' and conrelid='public.genz_property_private'::regclass) then
    alter table public.genz_property_private add constraint genz_property_private_address_len_check check (char_length(address)<=1000);
  end if;
end $$;

create or replace function public.genz_update_property_listing_v1(
  p_property_id text,
  p_title text,
  p_city text,
  p_locality text,
  p_property_type text,
  p_size integer,
  p_asking numeric,
  p_description text,
  p_owner_name text,
  p_owner_phone text default null,
  p_address text default '',
  p_latitude numeric default null,
  p_longitude numeric default null
) returns void
language plpgsql
security definer
set search_path='pg_catalog','public','genz_private','extensions'
as $$
declare
  v_uid uuid:=auth.uid();
  v_digits text;
  v_master uuid;
  v_mandates bigint;
  v_pepper text;
  v_owner_hash text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.genz_is_member() then raise exception 'MEMBERSHIP_REQUIRED'; end if;
  if not public.genz_can_manage_listing_source(trim(p_property_id),null) then raise exception 'LISTING_MANAGER_REQUIRED'; end if;
  if coalesce(trim(p_title),'')='' or coalesce(trim(p_city),'')='' or coalesce(trim(p_property_type),'')='' or coalesce(trim(p_owner_name),'')='' then raise exception 'INVALID_PROPERTY'; end if;
  if p_size is null or p_size<=0 or p_asking is null or p_asking<=0 then raise exception 'INVALID_PROPERTY'; end if;
  if char_length(coalesce(p_description,''))>5000 then raise exception 'DESCRIPTION_TOO_LONG'; end if;
  if char_length(coalesce(p_address,''))>1000 then raise exception 'ADDRESS_TOO_LONG'; end if;
  if p_latitude is not null and not (p_latitude between -90 and 90) then raise exception 'INVALID_LATITUDE'; end if;
  if p_longitude is not null and not (p_longitude between -180 and 180) then raise exception 'INVALID_LONGITUDE'; end if;

  v_digits:=regexp_replace(coalesce(p_owner_phone,''),'[^0-9]','','g');
  if length(v_digits)=12 and left(v_digits,2)='91' then v_digits:=right(v_digits,10); end if;
  if v_digits<>'' and v_digits !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_OWNER_PHONE'; end if;

  update public.genz_properties p
     set title=trim(p_title),city=trim(p_city),locality=nullif(trim(coalesce(p_locality,'')),''),
         property_type=trim(p_property_type),size=p_size,asking=p_asking,
         description=trim(coalesce(p_description,'')),latitude=p_latitude,longitude=p_longitude,updated_at=now()
   where p.id=trim(p_property_id)
   returning p.master_property_id into v_master;
  if v_master is null then raise exception 'PROPERTY_NOT_FOUND'; end if;

  update public.genz_property_private pp
     set owner_name=trim(p_owner_name),owner_phone_e164=nullif(v_digits,''),address=trim(coalesce(p_address,'')),updated_at=now()
   where pp.property_id=trim(p_property_id);

  select count(*) into v_mandates from public.genz_property_mandates pm
   where pm.master_property_id=v_master and pm.mandate_status in ('pending','verified');
  if v_mandates<=1 then
    update public.genz_master_properties mp set city=trim(p_city),locality=nullif(trim(coalesce(p_locality,'')),''),
      property_type=trim(p_property_type),size=p_size,canonical_latitude=p_latitude,canonical_longitude=p_longitude,updated_at=now()
    where mp.id=v_master;
    if v_digits='' then
      update public.genz_master_properties set owner_phone_hash=null,updated_at=now() where id=v_master;
    else
      select value into v_pepper from genz_private.config where key='phone_pepper';
      v_owner_hash:=encode(hmac('owner:'||v_digits,v_pepper,'sha256'),'hex');
      update public.genz_master_properties set owner_phone_hash=v_owner_hash,updated_at=now() where id=v_master;
    end if;
  end if;
end;
$$;

create or replace function public.genz_set_property_cover_v1(p_property_id text,p_media_id uuid)
returns void
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.genz_can_manage_listing_source(trim(p_property_id),null) then raise exception 'LISTING_MANAGER_REQUIRED'; end if;
  if not exists(select 1 from public.genz_listing_media m where m.id=p_media_id and m.property_id=trim(p_property_id) and m.asset_type='photo') then raise exception 'PHOTO_NOT_FOUND'; end if;
  update public.genz_listing_media set is_cover=false where property_id=trim(p_property_id) and asset_type='photo';
  update public.genz_listing_media set is_cover=true where id=p_media_id;
end;
$$;

revoke all on function public.genz_update_property_listing_v1(text,text,text,text,text,integer,numeric,text,text,text,text,numeric,numeric) from public,anon;
revoke all on function public.genz_set_property_cover_v1(text,uuid) from public,anon;
grant execute on function public.genz_update_property_listing_v1(text,text,text,text,text,integer,numeric,text,text,text,text,numeric,numeric) to authenticated;
grant execute on function public.genz_set_property_cover_v1(text,uuid) to authenticated;
