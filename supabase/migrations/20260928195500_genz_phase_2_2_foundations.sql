alter table public.genz_profiles add column if not exists owner_confirmed_listings integer not null default 0;
alter table public.genz_property_private add column if not exists owner_phone_e164 text;
alter table public.genz_visits add column if not exists qr_token_hash text;
alter table public.genz_visits add column if not exists qr_expires_at timestamptz;
alter table public.genz_visits add column if not exists qr_issued_by_user_id uuid references auth.users(id) on delete set null;
alter table public.genz_visits add column if not exists checkin_method text;

create table if not exists public.genz_builder_memberships (
  id uuid primary key default extensions.gen_random_uuid(),
  builder_id uuid not null references public.genz_builders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'sales' check (role in ('owner','admin','sales')),
  status text not null default 'active' check (status in ('active','disabled')),
  invited_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(builder_id,user_id)
);

create table if not exists public.genz_builder_account_invites (
  id uuid primary key default extensions.gen_random_uuid(),
  builder_id uuid not null references public.genz_builders(id) on delete cascade,
  email text not null,
  role text not null default 'sales' check (role in ('owner','admin','sales')),
  token_hash text not null unique,
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','redeemed','revoked','expired')),
  expires_at timestamptz not null,
  redeemed_by_user_id uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.genz_builder_broker_invites (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.genz_builder_projects(id) on delete cascade,
  broker_user_id uuid not null references public.genz_profiles(id) on delete cascade,
  sent_by_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked','expired')),
  message text,
  matched_requirements integer not null default 0,
  expires_at timestamptz not null default (now() + interval '14 days'),
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.genz_owner_confirmations (
  id uuid primary key default extensions.gen_random_uuid(),
  property_id text not null references public.genz_properties(id) on delete cascade,
  requested_by_user_id uuid not null references auth.users(id) on delete cascade,
  owner_phone_masked text not null,
  token_hash text not null unique,
  otp_hash text not null,
  status text not null default 'pending' check (status in ('pending','verified','expired','revoked')),
  attempts smallint not null default 0,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_genz_builder_memberships_user on public.genz_builder_memberships(user_id,status);
create index if not exists idx_genz_builder_memberships_builder on public.genz_builder_memberships(builder_id,status);
create index if not exists idx_genz_builder_account_invites_builder on public.genz_builder_account_invites(builder_id,status);
create index if not exists idx_genz_builder_broker_invites_broker on public.genz_builder_broker_invites(broker_user_id,status);
create index if not exists idx_genz_builder_broker_invites_project on public.genz_builder_broker_invites(project_id,status);
create index if not exists idx_genz_owner_confirmations_property on public.genz_owner_confirmations(property_id,status);
create index if not exists idx_genz_visits_qr_hash on public.genz_visits(qr_token_hash) where qr_token_hash is not null;

alter table public.genz_builder_memberships enable row level security;
alter table public.genz_builder_account_invites enable row level security;
alter table public.genz_builder_broker_invites enable row level security;
alter table public.genz_owner_confirmations enable row level security;

create or replace function public.genz_is_builder_member(p_builder_id uuid default null)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.genz_builder_memberships m
    where m.user_id=(select auth.uid()) and m.status='active'
      and (p_builder_id is null or m.builder_id=p_builder_id)
  );
$$;
revoke all on function public.genz_is_builder_member(uuid) from public,anon;
grant execute on function public.genz_is_builder_member(uuid) to authenticated;

create or replace function public.genz_builder_can_manage(p_builder_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.genz_is_admin() or exists(
    select 1 from public.genz_builder_memberships m
    where m.user_id=(select auth.uid()) and m.builder_id=p_builder_id and m.status='active' and m.role in ('owner','admin')
  );
$$;
revoke all on function public.genz_builder_can_manage(uuid) from public,anon;
grant execute on function public.genz_builder_can_manage(uuid) to authenticated;

create or replace function public.genz_create_builder_account_invite(p_builder_id uuid,p_email text,p_role text default 'sales',p_expires_hours integer default 168)
returns table(invite_id uuid, invite_token text) language plpgsql security definer set search_path=public,extensions as $$
declare raw_token text; iid uuid; normalized_email text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.genz_builder_can_manage(p_builder_id) then raise exception 'BUILDER_MANAGE_REQUIRED'; end if;
  if p_role not in ('owner','admin','sales') then raise exception 'INVALID_ROLE'; end if;
  normalized_email:=lower(trim(p_email));
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'INVALID_EMAIL'; end if;
  if exists(select 1 from public.genz_builder_account_invites where builder_id=p_builder_id and email=normalized_email and status='pending' and expires_at>now()) then raise exception 'ACTIVE_INVITE_EXISTS'; end if;
  raw_token:=encode(extensions.gen_random_bytes(24),'hex');
  insert into public.genz_builder_account_invites(builder_id,email,role,token_hash,invited_by_user_id,expires_at)
  values(p_builder_id,normalized_email,p_role,encode(extensions.digest(raw_token,'sha256'),'hex'),auth.uid(),now()+make_interval(hours=>greatest(1,least(p_expires_hours,336)))) returning id into iid;
  return query select iid,raw_token;
end;$$;
revoke all on function public.genz_create_builder_account_invite(uuid,text,text,integer) from public,anon;
grant execute on function public.genz_create_builder_account_invite(uuid,text,text,integer) to authenticated;

create or replace function public.genz_redeem_builder_invite(p_token text)
returns table(builder_id uuid, role text) language plpgsql security definer set search_path=public,extensions as $$
declare inv public.genz_builder_account_invites%rowtype; user_email text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select lower(email) into user_email from auth.users where id=auth.uid();
  select * into inv from public.genz_builder_account_invites where token_hash=encode(extensions.digest(trim(p_token),'sha256'),'hex') for update;
  if not found or inv.status<>'pending' then raise exception 'INVALID_INVITE'; end if;
  if inv.expires_at<=now() then update public.genz_builder_account_invites set status='expired' where id=inv.id; raise exception 'INVITE_EXPIRED'; end if;
  if lower(inv.email)<>user_email then raise exception 'INVITE_EMAIL_MISMATCH'; end if;
  insert into public.genz_builder_memberships(builder_id,user_id,role,status,invited_by_user_id)
  values(inv.builder_id,auth.uid(),inv.role,'active',inv.invited_by_user_id)
  on conflict(builder_id,user_id) do update set role=excluded.role,status='active',updated_at=now();
  update public.genz_builder_account_invites set status='redeemed',redeemed_by_user_id=auth.uid(),redeemed_at=now() where id=inv.id;
  return query select inv.builder_id,inv.role;
end;$$;
revoke all on function public.genz_redeem_builder_invite(text) from public,anon;
grant execute on function public.genz_redeem_builder_invite(text) to authenticated;

create or replace function public.genz_issue_visit_qr(p_visit_id uuid,p_minutes integer default 30)
returns table(qr_token text, expires_at timestamptz) language plpgsql security definer set search_path=public,extensions as $$
declare v public.genz_visits%rowtype; d public.genz_deals%rowtype; raw_token text; exp timestamptz;
begin
  if auth.uid() is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into v from public.genz_visits where id=p_visit_id for update;
  if not found then raise exception 'VISIT_NOT_FOUND'; end if;
  select * into d from public.genz_deals where id=v.deal_id;
  if auth.uid() not in (d.buyer_user_id,d.listing_user_id) and not public.genz_is_admin() then raise exception 'DEAL_ACCESS_DENIED'; end if;
  if v.status='verified' then raise exception 'VISIT_ALREADY_VERIFIED'; end if;
  raw_token:=encode(extensions.gen_random_bytes(24),'hex');
  exp:=now()+make_interval(mins=>greatest(5,least(p_minutes,120)));
  update public.genz_visits set qr_token_hash=encode(extensions.digest(raw_token || ':' || id::text,'sha256'),'hex'),qr_expires_at=exp,qr_issued_by_user_id=auth.uid() where id=p_visit_id;
  return query select raw_token,exp;
end;$$;
revoke all on function public.genz_issue_visit_qr(uuid,integer) from public,anon;
grant execute on function public.genz_issue_visit_qr(uuid,integer) to authenticated;

create or replace function public.genz_verify_visit_qr(p_visit_id uuid,p_token text,p_latitude numeric default null,p_longitude numeric default null)
returns table(verified boolean,message text) language plpgsql security definer set search_path=public,extensions as $$
declare v public.genz_visits%rowtype; d public.genz_deals%rowtype; expected text;
begin
  if auth.uid() is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into v from public.genz_visits where id=p_visit_id for update;
  if not found then return query select false,'Visit not found'; return; end if;
  select * into d from public.genz_deals where id=v.deal_id;
  if auth.uid() not in (d.buyer_user_id,d.listing_user_id) and not public.genz_is_admin() then raise exception 'DEAL_ACCESS_DENIED'; end if;
  if not public.genz_is_admin() and auth.uid()=v.qr_issued_by_user_id then return query select false,'The other deal participant must scan this QR'; return; end if;
  if v.status='verified' then return query select true,'Visit already verified'; return; end if;
  if v.qr_token_hash is null or v.qr_expires_at is null or v.qr_expires_at<now() then return query select false,'QR expired or not issued'; return; end if;
  expected:=encode(extensions.digest(trim(p_token) || ':' || v.id::text,'sha256'),'hex');
  if expected<>v.qr_token_hash then return query select false,'Invalid QR token'; return; end if;
  update public.genz_visits set status='verified',verifier_user_id=auth.uid(),verified_at=now(),latitude=p_latitude,longitude=p_longitude,checkin_method='qr',qr_token_hash=null where id=v.id;
  update public.genz_deals set status=case when status='accepted' then 'visit_verified' else status end,updated_at=now() where id=v.deal_id;
  update public.genz_profiles set verified_visits=verified_visits+1,updated_at=now() where id in (d.buyer_user_id,d.listing_user_id);
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label) values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),v.deal_id,auth.uid(),'visit_verified','Site visit verified by QR check-in');
  return query select true,'Visit verified by QR';
end;$$;
revoke all on function public.genz_verify_visit_qr(uuid,text,numeric,numeric) from public,anon;
grant execute on function public.genz_verify_visit_qr(uuid,text,numeric,numeric) to authenticated;

create or replace function public.genz_create_owner_confirmation(p_property_id text,p_owner_phone text,p_expires_minutes integer default 15)
returns table(confirmation_id uuid, owner_token text, consent_code text, expires_at timestamptz) language plpgsql security definer set search_path=public,extensions as $$
declare prop public.genz_properties%rowtype; digits text; raw_token text; otp text; cid uuid; exp timestamptz;
begin
  if auth.uid() is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into prop from public.genz_properties where id=p_property_id;
  if not found or (prop.listing_user_id<>auth.uid() and not public.genz_is_admin()) then raise exception 'PROPERTY_ACCESS_DENIED'; end if;
  digits:=regexp_replace(coalesce(p_owner_phone,''),'\D','','g'); if length(digits)=12 and left(digits,2)='91' then digits:=right(digits,10); end if;
  if digits !~ '^[6-9][0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;
  raw_token:=encode(extensions.gen_random_bytes(24),'hex'); otp:=lpad((floor(random()*1000000))::int::text,6,'0'); exp:=now()+make_interval(mins=>greatest(5,least(p_expires_minutes,60)));
  update public.genz_owner_confirmations set status='revoked' where property_id=p_property_id and status='pending';
  insert into public.genz_owner_confirmations(property_id,requested_by_user_id,owner_phone_masked,token_hash,otp_hash,expires_at)
  values(p_property_id,auth.uid(),left(digits,2)||'******'||right(digits,2),encode(extensions.digest(raw_token,'sha256'),'hex'),encode(extensions.digest(otp||':'||p_property_id,'sha256'),'hex'),exp) returning id into cid;
  update public.genz_property_private set owner_phone_e164='+91'||digits,updated_at=now() where property_id=p_property_id and listing_user_id=prop.listing_user_id;
  return query select cid,raw_token,otp,exp;
end;$$;
revoke all on function public.genz_create_owner_confirmation(text,text,integer) from public,anon;
grant execute on function public.genz_create_owner_confirmation(text,text,integer) to authenticated;

create or replace function public.genz_confirm_owner_consent(p_token text,p_code text)
returns table(verified boolean,property_id text,message text) language plpgsql security definer set search_path=public,extensions as $$
declare c public.genz_owner_confirmations%rowtype; expected text; prop public.genz_properties%rowtype;
begin
  select * into c from public.genz_owner_confirmations where token_hash=encode(extensions.digest(trim(p_token),'sha256'),'hex') for update;
  if not found then return query select false,null::text,'Confirmation not found'; return; end if;
  if c.status='verified' then return query select true,c.property_id,'Already confirmed'; return; end if;
  if c.status<>'pending' or c.expires_at<now() then update public.genz_owner_confirmations set status='expired' where id=c.id and status='pending'; return query select false,c.property_id,'Confirmation expired'; return; end if;
  if c.attempts>=5 then return query select false,c.property_id,'Too many attempts'; return; end if;
  expected:=encode(extensions.digest(trim(p_code)||':'||c.property_id,'sha256'),'hex');
  if expected<>c.otp_hash then update public.genz_owner_confirmations set attempts=least(attempts+1,5) where id=c.id; return query select false,c.property_id,'Incorrect code'; return; end if;
  update public.genz_owner_confirmations set status='verified',verified_at=now() where id=c.id;
  select * into prop from public.genz_properties where id=c.property_id;
  update public.genz_profiles set owner_confirmed_listings=owner_confirmed_listings+1,updated_at=now() where id=prop.listing_user_id;
  return query select true,c.property_id,'Owner consent confirmed';
end;$$;
revoke all on function public.genz_confirm_owner_consent(text,text) from public,authenticated;
grant execute on function public.genz_confirm_owner_consent(text,text) to anon;

alter table public.genz_builder_memberships force row level security;
alter table public.genz_builder_account_invites force row level security;
alter table public.genz_builder_broker_invites force row level security;
alter table public.genz_owner_confirmations force row level security;

create policy "builder members read own team" on public.genz_builder_memberships for select to authenticated using (public.genz_is_admin() or user_id=(select auth.uid()) or public.genz_builder_can_manage(builder_id));
create policy "builder managers read invites" on public.genz_builder_account_invites for select to authenticated using (public.genz_is_admin() or public.genz_builder_can_manage(builder_id));
create policy "builder broker invite visibility" on public.genz_builder_broker_invites for select to authenticated using (public.genz_is_admin() or broker_user_id=(select auth.uid()) or exists(select 1 from public.genz_builder_projects p where p.id=project_id and public.genz_builder_can_manage(p.builder_id)));
create policy "builder manager creates broker invite" on public.genz_builder_broker_invites for insert to authenticated with check (exists(select 1 from public.genz_builder_projects p where p.id=project_id and public.genz_builder_can_manage(p.builder_id)) and sent_by_user_id=(select auth.uid()));
create policy "broker responds to project invite" on public.genz_builder_broker_invites for update to authenticated using (broker_user_id=(select auth.uid()) or public.genz_is_admin() or exists(select 1 from public.genz_builder_projects p where p.id=project_id and public.genz_builder_can_manage(p.builder_id))) with check (broker_user_id=(select auth.uid()) or public.genz_is_admin() or exists(select 1 from public.genz_builder_projects p where p.id=project_id and public.genz_builder_can_manage(p.builder_id)));
create policy "listing broker reads owner confirmations" on public.genz_owner_confirmations for select to authenticated using (public.genz_is_admin() or requested_by_user_id=(select auth.uid()));

create policy "builder members read own builder" on public.genz_builders for select to authenticated using (public.genz_is_member() or public.genz_is_admin() or public.genz_is_builder_member(id));
create policy "builder members read own projects" on public.genz_builder_projects for select to authenticated using (public.genz_is_member() or public.genz_is_admin() or public.genz_is_builder_member(builder_id));
create policy "builder managers insert own projects" on public.genz_builder_projects for insert to authenticated with check (public.genz_builder_can_manage(builder_id) and created_by_user_id=(select auth.uid()));
create policy "builder managers update own projects" on public.genz_builder_projects for update to authenticated using (public.genz_builder_can_manage(builder_id)) with check (public.genz_builder_can_manage(builder_id));

grant select on public.genz_builder_memberships,public.genz_builder_account_invites,public.genz_builder_broker_invites,public.genz_owner_confirmations to authenticated;
grant insert,update on public.genz_builder_broker_invites to authenticated;
grant select,insert,update on public.genz_builder_projects to authenticated;
