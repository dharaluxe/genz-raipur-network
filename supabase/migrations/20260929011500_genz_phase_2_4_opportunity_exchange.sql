-- GENZ Phase 2.4: network opportunity exchange, responses and auto-publishing.

create table if not exists public.genz_opportunity_posts (
  id uuid primary key default extensions.gen_random_uuid(),
  source_type text not null check (source_type in ('requirement','property')),
  requirement_id text references public.genz_requirements(id) on delete cascade,
  property_id text references public.genz_properties(id) on delete cascade,
  posted_by_user_id uuid not null references public.genz_profiles(id) on delete cascade,
  audience text not null default 'network' check (audience in ('network','selected','private')),
  headline text not null check (char_length(headline) between 5 and 180),
  note text not null default '' check (char_length(note) <= 1200),
  status text not null default 'open' check (status in ('open','matched','paused','closed')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source_type='requirement' and requirement_id is not null and property_id is null)
    or
    (source_type='property' and property_id is not null and requirement_id is null)
  )
);

create unique index if not exists idx_genz_opportunity_requirement_unique
  on public.genz_opportunity_posts(requirement_id) where requirement_id is not null;
create unique index if not exists idx_genz_opportunity_property_unique
  on public.genz_opportunity_posts(property_id) where property_id is not null;
create index if not exists idx_genz_opportunity_feed
  on public.genz_opportunity_posts(status,created_at desc);
create index if not exists idx_genz_opportunity_poster
  on public.genz_opportunity_posts(posted_by_user_id,created_at desc);
create index if not exists idx_genz_opportunity_expiry
  on public.genz_opportunity_posts(expires_at) where expires_at is not null;

create table if not exists public.genz_opportunity_recipients (
  opportunity_id uuid not null references public.genz_opportunity_posts(id) on delete cascade,
  broker_user_id uuid not null references public.genz_profiles(id) on delete cascade,
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(opportunity_id,broker_user_id)
);
create index if not exists idx_genz_opportunity_recipients_broker
  on public.genz_opportunity_recipients(broker_user_id,created_at desc);
create index if not exists idx_genz_opportunity_recipients_inviter
  on public.genz_opportunity_recipients(invited_by_user_id,created_at desc);

create table if not exists public.genz_opportunity_responses (
  id uuid primary key default extensions.gen_random_uuid(),
  opportunity_id uuid not null references public.genz_opportunity_posts(id) on delete cascade,
  broker_user_id uuid not null references public.genz_profiles(id) on delete cascade,
  response_type text not null check (response_type in ('have_match','interested','pass')),
  message text not null default '' check (char_length(message) <= 1000),
  linked_requirement_id text references public.genz_requirements(id) on delete set null,
  linked_property_id text references public.genz_properties(id) on delete set null,
  status text not null default 'active' check (status in ('active','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(opportunity_id,broker_user_id),
  check (not (linked_requirement_id is not null and linked_property_id is not null))
);
create index if not exists idx_genz_opportunity_responses_broker
  on public.genz_opportunity_responses(broker_user_id,updated_at desc);
create index if not exists idx_genz_opportunity_responses_status
  on public.genz_opportunity_responses(opportunity_id,status,updated_at desc);
create index if not exists idx_genz_opportunity_responses_requirement
  on public.genz_opportunity_responses(linked_requirement_id) where linked_requirement_id is not null;
create index if not exists idx_genz_opportunity_responses_property
  on public.genz_opportunity_responses(linked_property_id) where linked_property_id is not null;

alter table public.genz_opportunity_posts enable row level security;
alter table public.genz_opportunity_recipients enable row level security;
alter table public.genz_opportunity_responses enable row level security;

create policy "members read visible opportunities" on public.genz_opportunity_posts
for select to authenticated using (
  public.genz_is_member()
  and (
    audience='network'
    or posted_by_user_id=(select auth.uid())
    or public.genz_is_admin()
    or exists(
      select 1 from public.genz_opportunity_recipients r
      where r.opportunity_id=id and r.broker_user_id=(select auth.uid())
    )
  )
);

create policy "participants read opportunity recipients" on public.genz_opportunity_recipients
for select to authenticated using (
  public.genz_is_member()
  and (
    broker_user_id=(select auth.uid())
    or public.genz_is_admin()
    or exists(
      select 1 from public.genz_opportunity_posts p
      where p.id=opportunity_id and p.posted_by_user_id=(select auth.uid())
    )
  )
);

create policy "participants read opportunity responses" on public.genz_opportunity_responses
for select to authenticated using (
  public.genz_is_member()
  and (
    broker_user_id=(select auth.uid())
    or public.genz_is_admin()
    or exists(
      select 1 from public.genz_opportunity_posts p
      where p.id=opportunity_id and p.posted_by_user_id=(select auth.uid())
    )
  )
);

grant select on public.genz_opportunity_posts,public.genz_opportunity_recipients,public.genz_opportunity_responses to authenticated;
revoke insert,update,delete on public.genz_opportunity_posts,public.genz_opportunity_recipients,public.genz_opportunity_responses from authenticated,anon;

create or replace function public.genz_configure_opportunity(
  p_opportunity_id uuid,
  p_audience text,
  p_headline text,
  p_note text default '',
  p_status text default 'open',
  p_expires_at timestamptz default null,
  p_recipient_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := (select auth.uid());
  post public.genz_opportunity_posts%rowtype;
  valid_recipient_count integer := 0;
begin
  if uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into post from public.genz_opportunity_posts where id=p_opportunity_id for update;
  if not found then raise exception 'OPPORTUNITY_NOT_FOUND'; end if;
  if post.posted_by_user_id<>uid and not public.genz_is_admin() then raise exception 'OPPORTUNITY_ACCESS_DENIED'; end if;
  if p_audience not in ('network','selected','private') then raise exception 'INVALID_AUDIENCE'; end if;
  if p_status not in ('open','matched','paused','closed') then raise exception 'INVALID_STATUS'; end if;
  if char_length(trim(coalesce(p_headline,'')))<5 or char_length(trim(coalesce(p_headline,'')))>180 then raise exception 'INVALID_HEADLINE'; end if;
  if char_length(coalesce(p_note,''))>1200 then raise exception 'NOTE_TOO_LONG'; end if;

  if p_audience='selected' then
    select count(*) into valid_recipient_count
    from unnest(coalesce(p_recipient_ids,'{}'::uuid[])) x
    join public.genz_profiles p on p.id=x
    where x<>post.posted_by_user_id;
    if valid_recipient_count=0 then raise exception 'SELECTED_RECIPIENT_REQUIRED'; end if;
  end if;

  update public.genz_opportunity_posts
  set audience=p_audience,
      headline=trim(p_headline),
      note=left(coalesce(p_note,''),1200),
      status=p_status,
      expires_at=p_expires_at,
      updated_at=now()
  where id=post.id;

  delete from public.genz_opportunity_recipients where opportunity_id=post.id;
  if p_audience='selected' then
    insert into public.genz_opportunity_recipients(opportunity_id,broker_user_id,invited_by_user_id)
    select post.id,p.id,uid
    from public.genz_profiles p
    where p.id=any(coalesce(p_recipient_ids,'{}'::uuid[])) and p.id<>post.posted_by_user_id
    on conflict(opportunity_id,broker_user_id) do nothing;
  end if;

  return post.id;
end;
$$;
revoke all on function public.genz_configure_opportunity(uuid,text,text,text,text,timestamptz,uuid[]) from public,anon;
grant execute on function public.genz_configure_opportunity(uuid,text,text,text,text,timestamptz,uuid[]) to authenticated;

create or replace function public.genz_respond_opportunity(
  p_opportunity_id uuid,
  p_response_type text,
  p_message text default '',
  p_linked_source_id text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := (select auth.uid());
  post public.genz_opportunity_posts%rowtype;
  response_id uuid;
  is_visible boolean := false;
begin
  if uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  if p_response_type not in ('have_match','interested','pass') then raise exception 'INVALID_RESPONSE_TYPE'; end if;
  if char_length(coalesce(p_message,''))>1000 then raise exception 'MESSAGE_TOO_LONG'; end if;

  select * into post from public.genz_opportunity_posts where id=p_opportunity_id;
  if not found then raise exception 'OPPORTUNITY_NOT_FOUND'; end if;

  is_visible := post.audience='network'
    or post.posted_by_user_id=uid
    or public.genz_is_admin()
    or exists(select 1 from public.genz_opportunity_recipients r where r.opportunity_id=post.id and r.broker_user_id=uid);
  if not is_visible then raise exception 'OPPORTUNITY_ACCESS_DENIED'; end if;
  if post.status<>'open' then raise exception 'OPPORTUNITY_NOT_OPEN'; end if;
  if post.expires_at is not null and post.expires_at<now() then raise exception 'OPPORTUNITY_EXPIRED'; end if;
  if post.posted_by_user_id=uid and not public.genz_is_admin() then raise exception 'CANNOT_RESPOND_TO_OWN_OPPORTUNITY'; end if;

  if p_linked_source_id is not null then
    if post.source_type='requirement' then
      if not exists(select 1 from public.genz_properties p where p.id=p_linked_source_id and p.listing_user_id=uid and p.status='active') then
        raise exception 'LINKED_PROPERTY_NOT_OWNED';
      end if;
    else
      if not exists(select 1 from public.genz_requirements r where r.id=p_linked_source_id and r.source_user_id=uid and r.status='active') then
        raise exception 'LINKED_REQUIREMENT_NOT_OWNED';
      end if;
    end if;
  end if;

  insert into public.genz_opportunity_responses(
    opportunity_id,broker_user_id,response_type,message,linked_requirement_id,linked_property_id,status
  ) values(
    post.id,uid,p_response_type,left(coalesce(p_message,''),1000),
    case when post.source_type='property' then p_linked_source_id else null end,
    case when post.source_type='requirement' then p_linked_source_id else null end,
    'active'
  )
  on conflict(opportunity_id,broker_user_id) do update set
    response_type=excluded.response_type,
    message=excluded.message,
    linked_requirement_id=excluded.linked_requirement_id,
    linked_property_id=excluded.linked_property_id,
    status='active',
    updated_at=now()
  returning id into response_id;

  return response_id;
end;
$$;
revoke all on function public.genz_respond_opportunity(uuid,text,text,text) from public,anon;
grant execute on function public.genz_respond_opportunity(uuid,text,text,text) to authenticated;

create or replace function public.genz_review_opportunity_response(
  p_response_id uuid,
  p_status text
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := (select auth.uid());
  response public.genz_opportunity_responses%rowtype;
  post public.genz_opportunity_posts%rowtype;
begin
  if uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  if p_status not in ('active','accepted','rejected','withdrawn') then raise exception 'INVALID_RESPONSE_STATUS'; end if;
  select * into response from public.genz_opportunity_responses where id=p_response_id for update;
  if not found then raise exception 'RESPONSE_NOT_FOUND'; end if;
  select * into post from public.genz_opportunity_posts where id=response.opportunity_id for update;
  if post.posted_by_user_id<>uid and response.broker_user_id<>uid and not public.genz_is_admin() then raise exception 'RESPONSE_ACCESS_DENIED'; end if;
  if response.broker_user_id=uid and p_status in ('accepted','rejected') and not public.genz_is_admin() then raise exception 'POSTER_REVIEW_REQUIRED'; end if;
  if post.posted_by_user_id=uid and p_status='withdrawn' and response.broker_user_id<>uid and not public.genz_is_admin() then raise exception 'RESPONDER_WITHDRAWAL_REQUIRED'; end if;

  update public.genz_opportunity_responses set status=p_status,updated_at=now() where id=response.id;
  if p_status='accepted' then
    update public.genz_opportunity_posts set status='matched',updated_at=now() where id=post.id;
  elsif post.status='matched' and not exists(
    select 1 from public.genz_opportunity_responses x where x.opportunity_id=post.id and x.id<>response.id and x.status='accepted'
  ) then
    update public.genz_opportunity_posts set status='open',updated_at=now() where id=post.id;
  end if;
  return p_status;
end;
$$;
revoke all on function public.genz_review_opportunity_response(uuid,text) from public,anon;
grant execute on function public.genz_review_opportunity_response(uuid,text) to authenticated;

create or replace function public.genz_autopost_requirement_opportunity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.genz_opportunity_posts(
    source_type,requirement_id,posted_by_user_id,audience,headline,note,status,expires_at
  ) values(
    'requirement',new.id,new.source_user_id,'network',
    new.property_type||' wanted in '||new.city,
    'Buyer demand up to ₹'||trim(to_char(new.max_budget,'FM999999999999990D00'))||' · minimum '||new.min_size::text||' sqft',
    case when new.status='active' then 'open' else 'closed' end,
    new.expires_at
  )
  on conflict(requirement_id) where requirement_id is not null do update set
    headline=excluded.headline,
    note=excluded.note,
    status=excluded.status,
    expires_at=excluded.expires_at,
    updated_at=now();
  return new;
end;
$$;
revoke all on function public.genz_autopost_requirement_opportunity() from public,anon,authenticated;

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
    new.title||' · ₹'||trim(to_char(new.asking,'FM999999999999990D00'))||' · '||new.size::text||' sqft',
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

drop trigger if exists trg_genz_requirement_opportunity on public.genz_requirements;
create trigger trg_genz_requirement_opportunity
after insert or update of city,property_type,max_budget,min_size,status,expires_at on public.genz_requirements
for each row execute function public.genz_autopost_requirement_opportunity();

drop trigger if exists trg_genz_property_opportunity on public.genz_properties;
create trigger trg_genz_property_opportunity
after insert or update of title,city,property_type,size,asking,status on public.genz_properties
for each row execute function public.genz_autopost_property_opportunity();

-- Backfill existing live records into the Phase 2.4 feed.
insert into public.genz_opportunity_posts(source_type,requirement_id,posted_by_user_id,audience,headline,note,status,expires_at)
select 'requirement',r.id,r.source_user_id,'network',
       r.property_type||' wanted in '||r.city,
       'Buyer demand up to ₹'||trim(to_char(r.max_budget,'FM999999999999990D00'))||' · minimum '||r.min_size::text||' sqft',
       case when r.status='active' then 'open' else 'closed' end,
       r.expires_at
from public.genz_requirements r
on conflict(requirement_id) where requirement_id is not null do nothing;

insert into public.genz_opportunity_posts(source_type,property_id,posted_by_user_id,audience,headline,note,status)
select 'property',p.id,p.listing_user_id,'network',
       p.property_type||' available in '||p.city,
       p.title||' · ₹'||trim(to_char(p.asking,'FM999999999999990D00'))||' · '||p.size::text||' sqft',
       case when p.status='active' then 'open' else 'closed' end
from public.genz_properties p
on conflict(property_id) where property_id is not null do nothing;
