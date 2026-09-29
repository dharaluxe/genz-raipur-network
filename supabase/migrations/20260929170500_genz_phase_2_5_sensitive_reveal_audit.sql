create or replace function public.genz_get_shared_listing(p_grant_id uuid)
returns table(
  grant_id uuid,
  source_type text,
  source_id text,
  title text,
  city text,
  locality text,
  property_type text,
  size integer,
  price numeric,
  latitude numeric,
  longitude numeric,
  owner_name text,
  owner_phone text,
  can_view_price boolean,
  can_view_photos boolean,
  can_view_videos boolean,
  can_view_approx_location boolean,
  can_view_exact_location boolean,
  can_view_documents boolean,
  can_view_owner_contact boolean,
  allow_download boolean,
  note text,
  expires_at timestamptz
)
language plpgsql security definer set search_path=''
as $$
declare g public.genz_listing_share_grants%rowtype; p public.genz_properties%rowtype; pr public.genz_builder_projects%rowtype; manager_access boolean;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into g from public.genz_listing_share_grants where id=p_grant_id;
  if not found then raise exception 'SHARE_NOT_FOUND'; end if;
  manager_access := public.genz_can_manage_listing_source(g.property_id,g.project_id) or public.genz_is_admin();
  if g.broker_user_id<>(select auth.uid()) and not manager_access then raise exception 'SHARE_ACCESS_DENIED'; end if;
  if g.status<>'active' or (g.expires_at is not null and g.expires_at<=now()) then raise exception 'SHARE_INACTIVE'; end if;

  if g.broker_user_id=(select auth.uid()) then
    insert into public.genz_listing_access_events(grant_id,viewer_user_id,event_type)
    values(g.id,(select auth.uid()),'open_share');
  end if;

  if g.property_id is not null then
    select * into p from public.genz_properties where id=g.property_id;
    return query select
      g.id,'property'::text,p.id,p.title,p.city,
      case when g.can_view_approx_location or g.can_view_exact_location or manager_access then p.locality else null end,
      p.property_type,p.size,
      case when manager_access then p.asking else null end,
      case when manager_access then p.latitude else null end,
      case when manager_access then p.longitude else null end,
      null::text,null::text,
      g.can_view_price,g.can_view_photos,g.can_view_videos,g.can_view_approx_location,g.can_view_exact_location,g.can_view_documents,g.can_view_owner_contact,g.allow_download,g.note,g.expires_at;
  else
    select * into pr from public.genz_builder_projects where id=g.project_id;
    return query select
      g.id,'project'::text,pr.id::text,pr.name,pr.city,
      case when g.can_view_approx_location or manager_access then pr.locality else null end,
      pr.property_type,pr.min_size,
      case when manager_access then pr.min_price else null end,
      null::numeric,null::numeric,null::text,null::text,
      g.can_view_price,g.can_view_photos,g.can_view_videos,g.can_view_approx_location,false,g.can_view_documents,false,g.allow_download,g.note,g.expires_at;
  end if;
end;
$$;
revoke all on function public.genz_get_shared_listing(uuid) from public,anon;
grant execute on function public.genz_get_shared_listing(uuid) to authenticated;

create or replace function public.genz_reveal_shared_listing_field(p_grant_id uuid,p_field text)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare g public.genz_listing_share_grants%rowtype; p public.genz_properties%rowtype; pr public.genz_builder_projects%rowtype; priv public.genz_property_private%rowtype; result jsonb; event_name text;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into g from public.genz_listing_share_grants where id=p_grant_id;
  if not found or g.broker_user_id<>(select auth.uid()) or g.status<>'active' or (g.expires_at is not null and g.expires_at<=now()) then raise exception 'SHARE_ACCESS_DENIED'; end if;

  if p_field='price' then
    if not g.can_view_price then raise exception 'PRICE_NOT_SHARED'; end if;
    if g.property_id is not null then
      select * into p from public.genz_properties where id=g.property_id;
      result:=jsonb_build_object('price',p.asking);
    else
      select * into pr from public.genz_builder_projects where id=g.project_id;
      result:=jsonb_build_object('min_price',pr.min_price,'max_price',pr.max_price);
    end if;
    event_name:='reveal_price';
  elsif p_field='exact_location' then
    if g.property_id is null or not g.can_view_exact_location then raise exception 'EXACT_LOCATION_NOT_SHARED'; end if;
    select * into p from public.genz_properties where id=g.property_id;
    result:=jsonb_build_object('latitude',p.latitude,'longitude',p.longitude,'locality',p.locality);
    event_name:='reveal_exact_location';
  elsif p_field='owner_contact' then
    if g.property_id is null or not g.can_view_owner_contact then raise exception 'OWNER_CONTACT_NOT_SHARED'; end if;
    select * into priv from public.genz_property_private where property_id=g.property_id;
    result:=jsonb_build_object('owner_name',priv.owner_name,'owner_phone',priv.owner_phone_e164);
    event_name:='reveal_owner_contact';
  else
    raise exception 'INVALID_REVEAL_FIELD';
  end if;

  insert into public.genz_listing_access_events(grant_id,viewer_user_id,event_type,resource_id)
  values(g.id,(select auth.uid()),event_name,p_field);
  return result;
end;
$$;
revoke all on function public.genz_reveal_shared_listing_field(uuid,text) from public,anon;
grant execute on function public.genz_reveal_shared_listing_field(uuid,text) to authenticated;
