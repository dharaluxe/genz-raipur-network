-- GENZ Phase 2.6: recipient-initiated access requests that convert into existing
-- Phase 2.5 listing share grants only after source-broker approval.

create table if not exists public.genz_listing_access_requests (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references public.genz_properties(id) on delete cascade,
  requester_user_id uuid not null references public.genz_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn','expired')),
  request_price boolean not null default false,
  request_photos boolean not null default false,
  request_videos boolean not null default false,
  request_approx_location boolean not null default false,
  request_exact_location boolean not null default false,
  request_documents boolean not null default false,
  request_owner_contact boolean not null default false,
  request_download boolean not null default false,
  requester_note text not null default '',
  reviewed_by_user_id uuid null references public.genz_profiles(id) on delete set null,
  reviewed_at timestamptz null,
  review_note text not null default '',
  approved_grant_id uuid null references public.genz_listing_share_grants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint genz_listing_access_requests_note_len check (char_length(requester_note)<=600),
  constraint genz_listing_access_requests_review_note_len check (char_length(review_note)<=600),
  constraint genz_listing_access_requests_any_permission check (
    request_price or request_photos or request_videos or request_approx_location or request_exact_location
    or request_documents or request_owner_contact or request_download
  )
);
alter table public.genz_listing_access_requests enable row level security;
revoke all on public.genz_listing_access_requests from anon,authenticated;
create unique index if not exists genz_listing_access_requests_pending_unique
  on public.genz_listing_access_requests(property_id,requester_user_id) where status='pending';
create index if not exists genz_listing_access_requests_property_created_idx
  on public.genz_listing_access_requests(property_id,created_at desc);
create index if not exists genz_listing_access_requests_requester_created_idx
  on public.genz_listing_access_requests(requester_user_id,created_at desc);
create index if not exists genz_listing_access_requests_reviewer_idx
  on public.genz_listing_access_requests(reviewed_by_user_id) where reviewed_by_user_id is not null;

create or replace function public.genz_request_listing_access(
  p_property_id text,
  p_request_price boolean default false,
  p_request_photos boolean default false,
  p_request_videos boolean default false,
  p_request_approx_location boolean default false,
  p_request_exact_location boolean default false,
  p_request_documents boolean default false,
  p_request_owner_contact boolean default false,
  p_request_download boolean default false,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_listing_user uuid;
  v_request_id uuid;
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  if not (coalesce(p_request_price,false) or coalesce(p_request_photos,false) or coalesce(p_request_videos,false)
    or coalesce(p_request_approx_location,false) or coalesce(p_request_exact_location,false)
    or coalesce(p_request_documents,false) or coalesce(p_request_owner_contact,false) or coalesce(p_request_download,false))
  then raise exception 'SELECT_AT_LEAST_ONE_PERMISSION'; end if;
  if char_length(coalesce(p_note,''))>600 then raise exception 'REQUEST_NOTE_TOO_LONG'; end if;

  select listing_user_id into v_listing_user from public.genz_properties
  where id=p_property_id and status='active';
  if v_listing_user is null then raise exception 'PROPERTY_NOT_FOUND_OR_INACTIVE'; end if;
  if v_listing_user=v_uid then raise exception 'CANNOT_REQUEST_OWN_LISTING'; end if;

  if not exists(
    select 1 from public.genz_opportunity_posts op
    where op.property_id=p_property_id and op.status='open'
      and (
        op.audience='network' or op.posted_by_user_id=v_uid or public.genz_is_admin()
        or exists(select 1 from public.genz_opportunity_recipients rec where rec.opportunity_id=op.id and rec.broker_user_id=v_uid)
      )
  ) then raise exception 'PROPERTY_NOT_DISCOVERABLE'; end if;

  insert into public.genz_listing_access_requests(
    property_id,requester_user_id,status,
    request_price,request_photos,request_videos,request_approx_location,request_exact_location,
    request_documents,request_owner_contact,request_download,requester_note
  ) values(
    p_property_id,v_uid,'pending',
    coalesce(p_request_price,false),coalesce(p_request_photos,false),coalesce(p_request_videos,false),coalesce(p_request_approx_location,false),coalesce(p_request_exact_location,false),
    coalesce(p_request_documents,false),coalesce(p_request_owner_contact,false),coalesce(p_request_download,false),left(coalesce(p_note,''),600)
  )
  on conflict(property_id,requester_user_id) where status='pending'
  do update set
    request_price=excluded.request_price,
    request_photos=excluded.request_photos,
    request_videos=excluded.request_videos,
    request_approx_location=excluded.request_approx_location,
    request_exact_location=excluded.request_exact_location,
    request_documents=excluded.request_documents,
    request_owner_contact=excluded.request_owner_contact,
    request_download=excluded.request_download,
    requester_note=excluded.requester_note,
    updated_at=now()
  returning id into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.genz_request_listing_access(text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text) from public,anon;
grant execute on function public.genz_request_listing_access(text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text) to authenticated;

create or replace function public.genz_list_my_listing_access_requests()
returns table(
  request_id uuid,property_id text,property_headline text,property_city text,property_locality text,property_type text,
  source_broker_code text,source_broker_name text,source_broker_firm text,status text,
  request_price boolean,request_photos boolean,request_videos boolean,request_approx_location boolean,request_exact_location boolean,
  request_documents boolean,request_owner_contact boolean,request_download boolean,requester_note text,
  review_note text,approved_grant_id uuid,created_at timestamptz,reviewed_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  return query
  select ar.id,p.id,coalesce(op.headline,p.property_type||' in '||p.city),p.city,p.locality,p.property_type,
    prof.broker_code,prof.display_name,prof.firm,ar.status,
    ar.request_price,ar.request_photos,ar.request_videos,ar.request_approx_location,ar.request_exact_location,
    ar.request_documents,ar.request_owner_contact,ar.request_download,ar.requester_note,
    ar.review_note,ar.approved_grant_id,ar.created_at,ar.reviewed_at
  from public.genz_listing_access_requests ar
  join public.genz_properties p on p.id=ar.property_id
  join public.genz_profiles prof on prof.id=p.listing_user_id
  left join public.genz_opportunity_posts op on op.property_id=p.id
  where ar.requester_user_id=v_uid
  order by ar.created_at desc;
end;
$$;
revoke all on function public.genz_list_my_listing_access_requests() from public,anon;
grant execute on function public.genz_list_my_listing_access_requests() to authenticated;

create or replace function public.genz_list_incoming_listing_access_requests()
returns table(
  request_id uuid,property_id text,property_headline text,requester_broker_code text,requester_name text,requester_firm text,
  requester_verified boolean,requester_rating numeric,requester_review_count integer,status text,
  request_price boolean,request_photos boolean,request_videos boolean,request_approx_location boolean,request_exact_location boolean,
  request_documents boolean,request_owner_contact boolean,request_download boolean,requester_note text,
  review_note text,approved_grant_id uuid,created_at timestamptz,reviewed_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $$
declare v_uid uuid := (select auth.uid()); v_admin boolean := false;
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select public.genz_is_admin() into v_admin;
  return query
  select ar.id,p.id,coalesce(op.headline,p.property_type||' in '||p.city),
    prof.broker_code,prof.display_name,prof.firm,prof.verified,prof.rating,prof.review_count,ar.status,
    ar.request_price,ar.request_photos,ar.request_videos,ar.request_approx_location,ar.request_exact_location,
    ar.request_documents,ar.request_owner_contact,ar.request_download,ar.requester_note,
    ar.review_note,ar.approved_grant_id,ar.created_at,ar.reviewed_at
  from public.genz_listing_access_requests ar
  join public.genz_properties p on p.id=ar.property_id
  join public.genz_profiles prof on prof.id=ar.requester_user_id
  left join public.genz_opportunity_posts op on op.property_id=p.id
  where p.listing_user_id=v_uid or v_admin
  order by (ar.status='pending') desc,ar.created_at desc;
end;
$$;
revoke all on function public.genz_list_incoming_listing_access_requests() from public,anon;
grant execute on function public.genz_list_incoming_listing_access_requests() to authenticated;

create or replace function public.genz_review_listing_access_request(
  p_request_id uuid,
  p_decision text,
  p_note text default '',
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req public.genz_listing_access_requests%rowtype;
  v_grant uuid := null;
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'INVALID_DECISION'; end if;
  if char_length(coalesce(p_note,''))>600 then raise exception 'REVIEW_NOTE_TOO_LONG'; end if;
  if p_expires_at is not null and p_expires_at<=now() then raise exception 'INVALID_EXPIRY'; end if;

  select * into v_req from public.genz_listing_access_requests where id=p_request_id for update;
  if v_req.id is null then raise exception 'ACCESS_REQUEST_NOT_FOUND'; end if;
  if v_req.status<>'pending' then raise exception 'ACCESS_REQUEST_ALREADY_REVIEWED'; end if;
  if not public.genz_can_manage_listing_source(v_req.property_id,null) then raise exception 'SHARE_SOURCE_ACCESS_DENIED'; end if;

  if p_decision='approved' then
    v_grant := public.genz_upsert_listing_share(
      v_req.property_id,null,v_req.requester_user_id,
      v_req.request_price,v_req.request_photos,v_req.request_videos,v_req.request_approx_location,v_req.request_exact_location,
      v_req.request_documents,v_req.request_owner_contact,v_req.request_download,
      concat('Approved access request ',v_req.id::text,case when nullif(trim(coalesce(p_note,'')),'') is not null then ' · '||trim(p_note) else '' end),
      p_expires_at
    );
  end if;

  update public.genz_listing_access_requests set
    status=p_decision,
    reviewed_by_user_id=v_uid,
    reviewed_at=now(),
    review_note=left(coalesce(p_note,''),600),
    approved_grant_id=v_grant,
    updated_at=now()
  where id=v_req.id;
  return v_grant;
end;
$$;
revoke all on function public.genz_review_listing_access_request(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.genz_review_listing_access_request(uuid,text,text,timestamptz) to authenticated;

create or replace function public.genz_withdraw_listing_access_request(p_request_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  update public.genz_listing_access_requests
  set status='withdrawn',updated_at=now()
  where id=p_request_id and requester_user_id=v_uid and status='pending';
  if not found then raise exception 'PENDING_ACCESS_REQUEST_NOT_FOUND'; end if;
end;
$$;
revoke all on function public.genz_withdraw_listing_access_request(uuid) from public,anon;
grant execute on function public.genz_withdraw_listing_access_request(uuid) to authenticated;
