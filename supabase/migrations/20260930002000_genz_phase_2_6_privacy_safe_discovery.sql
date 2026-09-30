-- GENZ Phase 2.6: privacy-safe discovery and server-side matching.
-- Full requirement/property rows remain source-manager only. Network members discover
-- safe projections through scoped RPCs; hidden price is used only for server-side scoring.

-- Buyer identity/phone must not be broadly readable from raw requirement rows.
drop policy if exists "requirements visible to network members" on public.genz_requirements;
drop policy if exists "source broker reads full requirement rows" on public.genz_requirements;
create policy "source broker reads full requirement rows" on public.genz_requirements
for select to authenticated
using (
  (select auth.uid()) = source_user_id
  or public.genz_is_admin()
);

-- Property opportunities must never copy protected price into the network-visible post text.
create or replace function public.genz_autopost_property_opportunity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.genz_opportunity_posts(
    source_type,property_id,posted_by_user_id,audience,headline,note,status,expires_at
  ) values(
    'property',new.id,new.listing_user_id,'network',
    new.property_type||' available in '||new.city,
    concat_ws(' · ',
      nullif(trim(coalesce(new.locality,'')),''),
      new.size::text||' sqft',
      'Price protected'
    ),
    case when new.status='active' then 'open' else 'closed' end,
    null
  )
  on conflict(property_id) where property_id is not null do update set
    headline=excluded.headline,
    note=excluded.note,
    status=excluded.status,
    updated_at=now();
  return new;
end;
$$;
revoke all on function public.genz_autopost_property_opportunity() from public,anon,authenticated;

-- Redact existing property opportunity text that may contain asking price.
update public.genz_opportunity_posts op
set note = concat_ws(' · ',
      nullif(trim(coalesce(p.locality,'')),''),
      p.size::text||' sqft',
      'Price protected'
    ),
    updated_at = now()
from public.genz_properties p
where op.source_type='property'
  and op.property_id=p.id;

-- Safe network property discovery. Asking price, owner label, exact GPS and documents are
-- intentionally absent. Asking is used only inside the function to calculate compatibility.
create or replace function public.genz_discover_property_supply(
  p_query text default null,
  p_city text default null,
  p_property_type text default null,
  p_limit integer default 50
)
returns table(
  opportunity_id uuid,
  property_id text,
  headline text,
  city text,
  locality text,
  property_type text,
  size integer,
  mandate_status text,
  posted_at timestamptz,
  listing_broker_code text,
  listing_broker_name text,
  listing_broker_firm text,
  listing_broker_verified boolean,
  listing_broker_rating numeric,
  listing_broker_review_count integer,
  listing_broker_account_status text,
  my_match_count integer,
  best_match_score integer,
  share_grant_id uuid,
  has_active_share boolean,
  can_view_price boolean,
  can_view_photos boolean,
  can_view_videos boolean,
  can_view_approx_location boolean,
  can_view_exact_location boolean,
  can_view_documents boolean,
  can_view_owner_contact boolean,
  allow_download boolean,
  is_own_listing boolean
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean := false;
  v_limit integer := greatest(1,least(coalesce(p_limit,50),100));
begin
  if v_uid is null or not public.genz_is_member() then
    raise exception 'GENZ_MEMBER_REQUIRED';
  end if;
  select public.genz_is_admin() into v_is_admin;

  return query
  select
    op.id,
    p.id,
    op.headline,
    p.city,
    p.locality,
    p.property_type,
    p.size,
    p.mandate_status,
    op.created_at,
    prof.broker_code,
    prof.display_name,
    prof.firm,
    prof.verified,
    prof.rating,
    prof.review_count,
    coalesce(pub.account_status,'active'),
    coalesce(matches.match_count,0),
    coalesce(matches.best_score,0),
    share_row.id,
    (share_row.id is not null),
    coalesce(share_row.can_view_price,false),
    coalesce(share_row.can_view_photos,false),
    coalesce(share_row.can_view_videos,false),
    coalesce(share_row.can_view_approx_location,false),
    coalesce(share_row.can_view_exact_location,false),
    coalesce(share_row.can_view_documents,false),
    coalesce(share_row.can_view_owner_contact,false),
    coalesce(share_row.allow_download,false),
    p.listing_user_id=v_uid
  from public.genz_opportunity_posts op
  join public.genz_properties p on p.id=op.property_id
  join public.genz_profiles prof on prof.id=p.listing_user_id
  left join public.genz_broker_public_profiles pub on pub.broker_user_id=prof.id
  left join lateral (
    select g.*
    from public.genz_listing_share_grants g
    where g.property_id=p.id
      and g.broker_user_id=v_uid
      and g.status='active'
      and (g.expires_at is null or g.expires_at>now())
    order by g.updated_at desc
    limit 1
  ) share_row on true
  left join lateral (
    select
      count(*) filter (
        where lower(trim(r.city))=lower(trim(p.city))
          and lower(trim(r.property_type))=lower(trim(p.property_type))
          and r.max_budget>=p.asking
          and p.size>=r.min_size
      )::integer as match_count,
      coalesce(max(
        (case when lower(trim(r.city))=lower(trim(p.city)) then 30 else 0 end)
        +(case when lower(trim(r.property_type))=lower(trim(p.property_type)) then 30 else 0 end)
        +(case when r.max_budget>=p.asking then 25 when r.max_budget>=p.asking*0.90 then 12 else 0 end)
        +(case when p.size>=r.min_size then 15 when p.size>=round(r.min_size*0.90) then 7 else 0 end)
      ),0)::integer as best_score
    from public.genz_requirements r
    where r.source_user_id=v_uid
      and r.status='active'
      and (r.expires_at is null or r.expires_at>now())
  ) matches on true
  where op.source_type='property'
    and op.property_id is not null
    and op.status='open'
    and p.status='active'
    and (v_is_admin or coalesce(pub.account_status,'active') in ('active','under_review'))
    and (
      op.audience='network'
      or op.posted_by_user_id=v_uid
      or v_is_admin
      or exists(
        select 1 from public.genz_opportunity_recipients rec
        where rec.opportunity_id=op.id and rec.broker_user_id=v_uid
      )
    )
    and (p_city is null or trim(p_city)='' or lower(trim(p.city))=lower(trim(p_city)))
    and (p_property_type is null or trim(p_property_type)='' or lower(trim(p.property_type))=lower(trim(p_property_type)))
    and (
      p_query is null or trim(p_query)=''
      or op.headline ilike '%'||trim(p_query)||'%'
      or p.id ilike '%'||trim(p_query)||'%'
      or p.city ilike '%'||trim(p_query)||'%'
      or coalesce(p.locality,'') ilike '%'||trim(p_query)||'%'
      or p.property_type ilike '%'||trim(p_query)||'%'
      or prof.broker_code ilike '%'||trim(p_query)||'%'
      or prof.display_name ilike '%'||trim(p_query)||'%'
      or prof.firm ilike '%'||trim(p_query)||'%'
    )
  order by coalesce(matches.best_score,0) desc,op.created_at desc
  limit v_limit;
end;
$$;
revoke all on function public.genz_discover_property_supply(text,text,text,integer) from public,anon;
grant execute on function public.genz_discover_property_supply(text,text,text,integer) to authenticated;

-- Safe buyer-demand discovery. Buyer name/label and phone are never returned.
create or replace function public.genz_discover_buyer_demand(
  p_query text default null,
  p_city text default null,
  p_property_type text default null,
  p_limit integer default 50
)
returns table(
  opportunity_id uuid,
  requirement_id text,
  headline text,
  city text,
  property_type text,
  max_budget numeric,
  min_size integer,
  expires_at timestamptz,
  posted_at timestamptz,
  source_broker_code text,
  source_broker_name text,
  source_broker_firm text,
  source_broker_verified boolean,
  source_broker_rating numeric,
  source_broker_review_count integer,
  source_broker_account_status text,
  my_match_count integer,
  best_match_score integer,
  is_own_requirement boolean
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean := false;
  v_limit integer := greatest(1,least(coalesce(p_limit,50),100));
begin
  if v_uid is null or not public.genz_is_member() then
    raise exception 'GENZ_MEMBER_REQUIRED';
  end if;
  select public.genz_is_admin() into v_is_admin;

  return query
  select
    op.id,
    r.id,
    op.headline,
    r.city,
    r.property_type,
    r.max_budget,
    r.min_size,
    r.expires_at,
    op.created_at,
    prof.broker_code,
    prof.display_name,
    prof.firm,
    prof.verified,
    prof.rating,
    prof.review_count,
    coalesce(pub.account_status,'active'),
    coalesce(matches.match_count,0),
    coalesce(matches.best_score,0),
    r.source_user_id=v_uid
  from public.genz_opportunity_posts op
  join public.genz_requirements r on r.id=op.requirement_id
  join public.genz_profiles prof on prof.id=r.source_user_id
  left join public.genz_broker_public_profiles pub on pub.broker_user_id=prof.id
  left join lateral (
    select
      count(*) filter (
        where lower(trim(p.city))=lower(trim(r.city))
          and lower(trim(p.property_type))=lower(trim(r.property_type))
          and p.asking<=r.max_budget
          and p.size>=r.min_size
      )::integer as match_count,
      coalesce(max(
        (case when lower(trim(p.city))=lower(trim(r.city)) then 30 else 0 end)
        +(case when lower(trim(p.property_type))=lower(trim(r.property_type)) then 30 else 0 end)
        +(case when p.asking<=r.max_budget then 25 when p.asking<=r.max_budget*1.10 then 12 else 0 end)
        +(case when p.size>=r.min_size then 15 when p.size>=round(r.min_size*0.90) then 7 else 0 end)
      ),0)::integer as best_score
    from public.genz_properties p
    where p.listing_user_id=v_uid
      and p.status='active'
  ) matches on true
  where op.source_type='requirement'
    and op.requirement_id is not null
    and op.status='open'
    and r.status='active'
    and (r.expires_at is null or r.expires_at>now())
    and (v_is_admin or coalesce(pub.account_status,'active') in ('active','under_review'))
    and (
      op.audience='network'
      or op.posted_by_user_id=v_uid
      or v_is_admin
      or exists(
        select 1 from public.genz_opportunity_recipients rec
        where rec.opportunity_id=op.id and rec.broker_user_id=v_uid
      )
    )
    and (p_city is null or trim(p_city)='' or lower(trim(r.city))=lower(trim(p_city)))
    and (p_property_type is null or trim(p_property_type)='' or lower(trim(r.property_type))=lower(trim(p_property_type)))
    and (
      p_query is null or trim(p_query)=''
      or op.headline ilike '%'||trim(p_query)||'%'
      or r.id ilike '%'||trim(p_query)||'%'
      or r.city ilike '%'||trim(p_query)||'%'
      or r.property_type ilike '%'||trim(p_query)||'%'
      or prof.broker_code ilike '%'||trim(p_query)||'%'
      or prof.display_name ilike '%'||trim(p_query)||'%'
      or prof.firm ilike '%'||trim(p_query)||'%'
    )
  order by coalesce(matches.best_score,0) desc,op.created_at desc
  limit v_limit;
end;
$$;
revoke all on function public.genz_discover_buyer_demand(text,text,text,integer) from public,anon;
grant execute on function public.genz_discover_buyer_demand(text,text,text,integer) to authenticated;
