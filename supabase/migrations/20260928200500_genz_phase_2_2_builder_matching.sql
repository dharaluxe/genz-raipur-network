create or replace function public.genz_builder_matching_brokers(p_project_id uuid)
returns table(
  broker_user_id uuid,
  broker_code text,
  display_name text,
  firm text,
  cities text[],
  specialties text[],
  rating numeric,
  review_count integer,
  completed_deals integer,
  verified_visits integer,
  owner_confirmed_listings integer,
  matched_requirements bigint
) language plpgsql security definer set search_path=public,pg_temp as $$
declare pr public.genz_builder_projects%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into pr from public.genz_builder_projects where id=p_project_id;
  if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
  if not public.genz_builder_can_manage(pr.builder_id) then raise exception 'BUILDER_MANAGE_REQUIRED'; end if;
  return query
  select p.id,p.broker_code,p.display_name,p.firm,p.cities,p.specialties,p.rating,p.review_count,p.completed_deals,p.verified_visits,p.owner_confirmed_listings,
    count(r.id)::bigint as matched_requirements
  from public.genz_profiles p
  left join public.genz_requirements r on r.source_user_id=p.id and r.status='active'
    and lower(trim(r.property_type))=lower(trim(pr.property_type))
    and lower(trim(r.city))=lower(trim(pr.city))
    and r.max_budget>=pr.min_price
    and r.min_size<=pr.max_size
  where p.verified=true
  group by p.id,p.broker_code,p.display_name,p.firm,p.cities,p.specialties,p.rating,p.review_count,p.completed_deals,p.verified_visits,p.owner_confirmed_listings
  having count(r.id)>0
  order by count(r.id) desc,p.rating desc,p.completed_deals desc;
end;$$;
revoke all on function public.genz_builder_matching_brokers(uuid) from public,anon;
grant execute on function public.genz_builder_matching_brokers(uuid) to authenticated;

create or replace function public.genz_invite_broker_to_project(p_project_id uuid,p_broker_user_id uuid,p_message text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare pr public.genz_builder_projects%rowtype; match_count integer; invite_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into pr from public.genz_builder_projects where id=p_project_id;
  if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
  if not public.genz_builder_can_manage(pr.builder_id) then raise exception 'BUILDER_MANAGE_REQUIRED'; end if;
  if not exists(select 1 from public.genz_profiles where id=p_broker_user_id and verified=true) then raise exception 'BROKER_NOT_ELIGIBLE'; end if;
  if exists(select 1 from public.genz_builder_broker_invites where project_id=p_project_id and broker_user_id=p_broker_user_id and status='pending' and expires_at>now()) then raise exception 'ACTIVE_PROJECT_INVITE_EXISTS'; end if;
  select count(*) into match_count from public.genz_requirements r where r.source_user_id=p_broker_user_id and r.status='active'
    and lower(trim(r.property_type))=lower(trim(pr.property_type)) and lower(trim(r.city))=lower(trim(pr.city))
    and r.max_budget>=pr.min_price and r.min_size<=pr.max_size;
  insert into public.genz_builder_broker_invites(project_id,broker_user_id,sent_by_user_id,status,message,matched_requirements)
  values(p_project_id,p_broker_user_id,auth.uid(),'pending',nullif(trim(coalesce(p_message,'')),''),match_count)
  returning id into invite_id;
  return invite_id;
end;$$;
revoke all on function public.genz_invite_broker_to_project(uuid,uuid,text) from public,anon;
grant execute on function public.genz_invite_broker_to_project(uuid,uuid,text) to authenticated;
