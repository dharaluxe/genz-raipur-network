create table if not exists public.genz_listing_media (
  id uuid primary key default extensions.gen_random_uuid(),
  property_id text references public.genz_properties(id) on delete cascade,
  project_id uuid references public.genz_builder_projects(id) on delete cascade,
  uploaded_by_user_id uuid not null references auth.users(id) on delete cascade,
  asset_type text not null check (asset_type in ('photo','video','document')),
  document_kind text,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  caption text not null default '' check (char_length(caption) <= 300),
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  check ((property_id is not null and project_id is null) or (property_id is null and project_id is not null))
);

create table if not exists public.genz_listing_share_grants (
  id uuid primary key default extensions.gen_random_uuid(),
  property_id text references public.genz_properties(id) on delete cascade,
  project_id uuid references public.genz_builder_projects(id) on delete cascade,
  granted_by_user_id uuid not null references auth.users(id) on delete cascade,
  broker_user_id uuid not null references public.genz_profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  can_view_price boolean not null default false,
  can_view_photos boolean not null default true,
  can_view_videos boolean not null default false,
  can_view_approx_location boolean not null default true,
  can_view_exact_location boolean not null default false,
  can_view_documents boolean not null default false,
  can_view_owner_contact boolean not null default false,
  allow_download boolean not null default false,
  note text not null default '' check (char_length(note) <= 600),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((property_id is not null and project_id is null) or (property_id is null and project_id is not null))
);

create unique index if not exists idx_genz_listing_share_active_property
  on public.genz_listing_share_grants(property_id, broker_user_id)
  where property_id is not null and status='active';
create unique index if not exists idx_genz_listing_share_active_project
  on public.genz_listing_share_grants(project_id, broker_user_id)
  where project_id is not null and status='active';
create index if not exists idx_genz_listing_media_property on public.genz_listing_media(property_id,asset_type,sort_order) where property_id is not null;
create index if not exists idx_genz_listing_media_project on public.genz_listing_media(project_id,asset_type,sort_order) where project_id is not null;
create index if not exists idx_genz_listing_media_uploader on public.genz_listing_media(uploaded_by_user_id,created_at desc);
create index if not exists idx_genz_listing_share_broker on public.genz_listing_share_grants(broker_user_id,status,updated_at desc);
create index if not exists idx_genz_listing_share_grantor on public.genz_listing_share_grants(granted_by_user_id,status,updated_at desc);

create table if not exists public.genz_listing_access_events (
  id uuid primary key default extensions.gen_random_uuid(),
  grant_id uuid not null references public.genz_listing_share_grants(id) on delete cascade,
  viewer_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('open_share','view_photo','view_video','view_document','download_asset','reveal_price','reveal_exact_location','reveal_owner_contact')),
  resource_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_genz_listing_access_grant on public.genz_listing_access_events(grant_id,created_at desc);
create index if not exists idx_genz_listing_access_viewer on public.genz_listing_access_events(viewer_user_id,created_at desc);

alter table public.genz_listing_media enable row level security;
alter table public.genz_listing_share_grants enable row level security;
alter table public.genz_listing_access_events enable row level security;

create or replace function public.genz_can_manage_listing_source(p_property_id text default null, p_project_id uuid default null)
returns boolean
language plpgsql stable security definer set search_path=''
as $$
declare uid uuid := (select auth.uid()); bid uuid;
begin
  if uid is null then return false; end if;
  if public.genz_is_admin() then return true; end if;
  if p_property_id is not null and p_project_id is null then
    return exists(select 1 from public.genz_properties p where p.id=p_property_id and p.listing_user_id=uid);
  end if;
  if p_project_id is not null and p_property_id is null then
    select builder_id into bid from public.genz_builder_projects where id=p_project_id;
    if bid is null then return false; end if;
    return public.genz_builder_can_manage(bid);
  end if;
  return false;
end;
$$;
revoke all on function public.genz_can_manage_listing_source(text,uuid) from public,anon;
grant execute on function public.genz_can_manage_listing_source(text,uuid) to authenticated;

create or replace function public.genz_is_active_listing_share_recipient(p_property_id text default null, p_project_id uuid default null, p_permission text default null)
returns boolean
language plpgsql stable security definer set search_path=''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then return false; end if;
  return exists(
    select 1 from public.genz_listing_share_grants g
    where g.broker_user_id=uid and g.status='active'
      and (g.expires_at is null or g.expires_at>now())
      and ((p_property_id is not null and g.property_id=p_property_id) or (p_project_id is not null and g.project_id=p_project_id))
      and case p_permission
        when 'photo' then g.can_view_photos
        when 'video' then g.can_view_videos
        when 'document' then g.can_view_documents
        when 'price' then g.can_view_price
        when 'approx_location' then g.can_view_approx_location
        when 'exact_location' then g.can_view_exact_location
        when 'owner_contact' then g.can_view_owner_contact
        when 'download' then g.allow_download
        else true
      end
  );
end;
$$;
revoke all on function public.genz_is_active_listing_share_recipient(text,uuid,text) from public,anon;
grant execute on function public.genz_is_active_listing_share_recipient(text,uuid,text) to authenticated;

create policy "managers upload listing media metadata" on public.genz_listing_media
for insert to authenticated with check (
  uploaded_by_user_id=(select auth.uid())
  and public.genz_can_manage_listing_source(property_id,project_id)
);
create policy "managers and granted brokers read listing media" on public.genz_listing_media
for select to authenticated using (
  public.genz_can_manage_listing_source(property_id,project_id)
  or public.genz_is_active_listing_share_recipient(property_id,project_id,asset_type)
);
create policy "managers update listing media metadata" on public.genz_listing_media
for update to authenticated using (public.genz_can_manage_listing_source(property_id,project_id))
with check (public.genz_can_manage_listing_source(property_id,project_id));
create policy "managers delete listing media metadata" on public.genz_listing_media
for delete to authenticated using (public.genz_can_manage_listing_source(property_id,project_id));

grant select,insert,update,delete on public.genz_listing_media to authenticated;

create policy "share participants read grants" on public.genz_listing_share_grants
for select to authenticated using (
  broker_user_id=(select auth.uid())
  or granted_by_user_id=(select auth.uid())
  or public.genz_can_manage_listing_source(property_id,project_id)
  or public.genz_is_admin()
);
grant select on public.genz_listing_share_grants to authenticated;
revoke insert,update,delete on public.genz_listing_share_grants from authenticated,anon;

create policy "share participants read audit" on public.genz_listing_access_events
for select to authenticated using (
  viewer_user_id=(select auth.uid())
  or public.genz_is_admin()
  or exists(
    select 1 from public.genz_listing_share_grants g
    where g.id=grant_id and public.genz_can_manage_listing_source(g.property_id,g.project_id)
  )
);
grant select on public.genz_listing_access_events to authenticated;
revoke insert,update,delete on public.genz_listing_access_events from authenticated,anon;

create or replace function public.genz_upsert_listing_share(
  p_property_id text,
  p_project_id uuid,
  p_broker_user_id uuid,
  p_can_view_price boolean default false,
  p_can_view_photos boolean default true,
  p_can_view_videos boolean default false,
  p_can_view_approx_location boolean default true,
  p_can_view_exact_location boolean default false,
  p_can_view_documents boolean default false,
  p_can_view_owner_contact boolean default false,
  p_allow_download boolean default false,
  p_note text default '',
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare uid uuid := (select auth.uid()); gid uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if (p_property_id is null)=(p_project_id is null) then raise exception 'EXACTLY_ONE_SHARE_SOURCE_REQUIRED'; end if;
  if not public.genz_can_manage_listing_source(p_property_id,p_project_id) then raise exception 'SHARE_SOURCE_ACCESS_DENIED'; end if;
  if not exists(select 1 from public.genz_profiles p where p.id=p_broker_user_id) then raise exception 'BROKER_NOT_FOUND'; end if;
  if p_broker_user_id=uid then raise exception 'CANNOT_SHARE_TO_SELF'; end if;
  if p_expires_at is not null and p_expires_at<=now() then raise exception 'INVALID_EXPIRY'; end if;

  if p_property_id is not null then
    select id into gid from public.genz_listing_share_grants
    where property_id=p_property_id and broker_user_id=p_broker_user_id and status='active' for update;
  else
    select id into gid from public.genz_listing_share_grants
    where project_id=p_project_id and broker_user_id=p_broker_user_id and status='active' for update;
  end if;

  if gid is null then
    insert into public.genz_listing_share_grants(
      property_id,project_id,granted_by_user_id,broker_user_id,status,
      can_view_price,can_view_photos,can_view_videos,can_view_approx_location,can_view_exact_location,
      can_view_documents,can_view_owner_contact,allow_download,note,expires_at
    ) values(
      p_property_id,p_project_id,uid,p_broker_user_id,'active',
      p_can_view_price,p_can_view_photos,p_can_view_videos,p_can_view_approx_location,p_can_view_exact_location,
      p_can_view_documents,p_can_view_owner_contact,p_allow_download,left(coalesce(p_note,''),600),p_expires_at
    ) returning id into gid;
  else
    update public.genz_listing_share_grants set
      can_view_price=p_can_view_price,
      can_view_photos=p_can_view_photos,
      can_view_videos=p_can_view_videos,
      can_view_approx_location=p_can_view_approx_location,
      can_view_exact_location=p_can_view_exact_location,
      can_view_documents=p_can_view_documents,
      can_view_owner_contact=p_can_view_owner_contact,
      allow_download=p_allow_download,
      note=left(coalesce(p_note,''),600),
      expires_at=p_expires_at,
      updated_at=now()
    where id=gid;
  end if;
  return gid;
end;
$$;
revoke all on function public.genz_upsert_listing_share(text,uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,timestamptz) from public,anon;
grant execute on function public.genz_upsert_listing_share(text,uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,timestamptz) to authenticated;

create or replace function public.genz_revoke_listing_share(p_grant_id uuid)
returns void
language plpgsql security definer set search_path=''
as $$
declare g public.genz_listing_share_grants%rowtype;
begin
  select * into g from public.genz_listing_share_grants where id=p_grant_id for update;
  if not found then raise exception 'SHARE_NOT_FOUND'; end if;
  if not public.genz_can_manage_listing_source(g.property_id,g.project_id) then raise exception 'SHARE_ACCESS_DENIED'; end if;
  update public.genz_listing_share_grants set status='revoked',updated_at=now() where id=g.id;
end;
$$;
revoke all on function public.genz_revoke_listing_share(uuid) from public,anon;
grant execute on function public.genz_revoke_listing_share(uuid) to authenticated;

create or replace function public.genz_log_listing_access(p_grant_id uuid,p_event_type text,p_resource_id text default null)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare g public.genz_listing_share_grants%rowtype; eid uuid;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into g from public.genz_listing_share_grants where id=p_grant_id;
  if not found or g.broker_user_id<>(select auth.uid()) or g.status<>'active' or (g.expires_at is not null and g.expires_at<=now()) then raise exception 'SHARE_ACCESS_DENIED'; end if;
  if p_event_type not in ('open_share','view_photo','view_video','view_document','download_asset','reveal_price','reveal_exact_location','reveal_owner_contact') then raise exception 'INVALID_EVENT_TYPE'; end if;
  insert into public.genz_listing_access_events(grant_id,viewer_user_id,event_type,resource_id)
  values(g.id,(select auth.uid()),p_event_type,left(coalesce(p_resource_id,''),200)) returning id into eid;
  return eid;
end;
$$;
revoke all on function public.genz_log_listing_access(uuid,text,text) from public,anon;
grant execute on function public.genz_log_listing_access(uuid,text,text) to authenticated;

create or replace function public.genz_can_read_listing_asset(p_storage_path text)
returns boolean
language plpgsql stable security definer set search_path=''
as $$
declare m public.genz_listing_media%rowtype;
begin
  if (select auth.uid()) is null then return false; end if;
  select * into m from public.genz_listing_media where storage_path=p_storage_path;
  if not found then return false; end if;
  return public.genz_can_manage_listing_source(m.property_id,m.project_id)
    or public.genz_is_active_listing_share_recipient(m.property_id,m.project_id,m.asset_type);
end;
$$;
revoke all on function public.genz_can_read_listing_asset(text) from public,anon;
grant execute on function public.genz_can_read_listing_asset(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'genz-listing-media','genz-listing-media',false,104857600,
  array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm','application/pdf']
)
on conflict(id) do update set public=false,file_size_limit=104857600,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "genz listing media upload" on storage.objects;
create policy "genz listing media upload" on storage.objects
for insert to authenticated with check (
  bucket_id='genz-listing-media'
  and split_part(name,'/',1)=(select auth.uid())::text
  and (public.genz_is_member() or public.genz_is_builder_member(null))
);

drop policy if exists "genz listing media read" on storage.objects;
create policy "genz listing media read" on storage.objects
for select to authenticated using (
  bucket_id='genz-listing-media'
  and public.genz_can_read_listing_asset(name)
);

drop policy if exists "genz listing media delete" on storage.objects;
create policy "genz listing media delete" on storage.objects
for delete to authenticated using (
  bucket_id='genz-listing-media'
  and split_part(name,'/',1)=(select auth.uid())::text
);
