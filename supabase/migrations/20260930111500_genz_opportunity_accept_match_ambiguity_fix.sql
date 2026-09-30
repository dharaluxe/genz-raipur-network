create or replace function public.genz_accept_opportunity_response(p_response_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  v_response public.genz_opportunity_responses%rowtype;
  v_post public.genz_opportunity_posts%rowtype;
  v_requirement_id text;
  v_property_id text;
  v_buyer_user_id uuid;
  v_listing_user_id uuid;
  v_deal_id text;
  v_created_new boolean := false;
begin
  if uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;

  select * into v_response
  from public.genz_opportunity_responses
  where id = p_response_id
  for update;
  if not found then raise exception 'RESPONSE_NOT_FOUND'; end if;

  select * into v_post
  from public.genz_opportunity_posts
  where id = v_response.opportunity_id
  for update;
  if not found then raise exception 'OPPORTUNITY_NOT_FOUND'; end if;

  if v_post.posted_by_user_id <> uid and not public.genz_is_admin() then raise exception 'POSTER_REVIEW_REQUIRED'; end if;
  if v_post.status not in ('open','matched') then raise exception 'OPPORTUNITY_NOT_OPEN'; end if;
  if v_response.response_type <> 'have_match' then raise exception 'CONCRETE_MATCH_REQUIRED'; end if;

  if v_post.source_type = 'requirement' then
    v_requirement_id := v_post.requirement_id;
    v_property_id := v_response.linked_property_id;
  else
    v_requirement_id := v_response.linked_requirement_id;
    v_property_id := v_post.property_id;
  end if;

  if v_requirement_id is null or v_property_id is null then raise exception 'LINKED_MATCH_REQUIRED'; end if;

  select r.source_user_id into v_buyer_user_id
  from public.genz_requirements r
  where r.id = v_requirement_id and r.status = 'active';

  select p.listing_user_id into v_listing_user_id
  from public.genz_properties p
  where p.id = v_property_id and p.status = 'active';

  if v_buyer_user_id is null or v_listing_user_id is null then raise exception 'ACTIVE_MATCH_REQUIRED'; end if;
  if v_buyer_user_id = v_listing_user_id then raise exception 'CROSS_BROKER_MATCH_REQUIRED'; end if;

  select d.id into v_deal_id
  from public.genz_deals d
  where d.requirement_id = v_requirement_id
    and d.property_id = v_property_id
  limit 1;

  if v_deal_id is null then
    v_deal_id := 'DL-' || upper(substr(replace(extensions.gen_random_uuid()::text,'-',''),1,10));
    insert into public.genz_deals(id,requirement_id,property_id,buyer_user_id,listing_user_id,status,listing_share)
    values(v_deal_id,v_requirement_id,v_property_id,v_buyer_user_id,v_listing_user_id,'requested',50);
    v_created_new := true;
  end if;

  update public.genz_opportunity_responses
  set status='accepted',updated_at=now()
  where id=v_response.id;

  update public.genz_opportunity_responses
  set status='rejected',updated_at=now()
  where opportunity_id=v_post.id and id<>v_response.id and status='active';

  update public.genz_opportunity_posts
  set status='matched',updated_at=now()
  where id=v_post.id;

  if v_created_new then
    insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
    values(
      'EV-'||upper(substr(replace(extensions.gen_random_uuid()::text,'-',''),1,12)),
      v_deal_id,uid,'opportunity_match_accepted',
      'Opportunity match accepted; deal room created from '||v_post.source_type||' opportunity'
    );
  end if;

  return v_deal_id;
end;
$function$;

revoke all on function public.genz_accept_opportunity_response(uuid) from public, anon;
grant execute on function public.genz_accept_opportunity_response(uuid) to authenticated;
