-- GENZ Phase 2.4: accepting a concrete opportunity match creates/reuses a deal room.

create or replace function public.genz_accept_opportunity_response(p_response_id uuid)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := (select auth.uid());
  response public.genz_opportunity_responses%rowtype;
  post public.genz_opportunity_posts%rowtype;
  requirement_id text;
  property_id text;
  buyer_user_id uuid;
  listing_user_id uuid;
  deal_id text;
  created_new boolean := false;
begin
  if uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into response from public.genz_opportunity_responses where id=p_response_id for update;
  if not found then raise exception 'RESPONSE_NOT_FOUND'; end if;
  select * into post from public.genz_opportunity_posts where id=response.opportunity_id for update;
  if not found then raise exception 'OPPORTUNITY_NOT_FOUND'; end if;
  if post.posted_by_user_id<>uid and not public.genz_is_admin() then raise exception 'POSTER_REVIEW_REQUIRED'; end if;
  if post.status not in ('open','matched') then raise exception 'OPPORTUNITY_NOT_OPEN'; end if;
  if response.response_type<>'have_match' then raise exception 'CONCRETE_MATCH_REQUIRED'; end if;

  if post.source_type='requirement' then
    requirement_id:=post.requirement_id;
    property_id:=response.linked_property_id;
  else
    requirement_id:=response.linked_requirement_id;
    property_id:=post.property_id;
  end if;
  if requirement_id is null or property_id is null then raise exception 'LINKED_MATCH_REQUIRED'; end if;

  select r.source_user_id into buyer_user_id from public.genz_requirements r where r.id=requirement_id and r.status='active';
  select p.listing_user_id into listing_user_id from public.genz_properties p where p.id=property_id and p.status='active';
  if buyer_user_id is null or listing_user_id is null then raise exception 'ACTIVE_MATCH_REQUIRED'; end if;
  if buyer_user_id=listing_user_id then raise exception 'CROSS_BROKER_MATCH_REQUIRED'; end if;

  select d.id into deal_id from public.genz_deals d where d.requirement_id=requirement_id and d.property_id=property_id limit 1;
  if deal_id is null then
    deal_id:='DL-'||upper(substr(replace(extensions.gen_random_uuid()::text,'-',''),1,10));
    insert into public.genz_deals(id,requirement_id,property_id,buyer_user_id,listing_user_id,status,listing_share)
    values(deal_id,requirement_id,property_id,buyer_user_id,listing_user_id,'requested',50);
    created_new:=true;
  end if;

  update public.genz_opportunity_responses
  set status='accepted',updated_at=now()
  where id=response.id;
  update public.genz_opportunity_responses
  set status='rejected',updated_at=now()
  where opportunity_id=post.id and id<>response.id and status='active';
  update public.genz_opportunity_posts set status='matched',updated_at=now() where id=post.id;

  if created_new then
    insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
    values(
      'EV-'||upper(substr(replace(extensions.gen_random_uuid()::text,'-',''),1,12)),
      deal_id,uid,'opportunity_match_accepted',
      'Opportunity match accepted; deal room created from '||post.source_type||' opportunity'
    );
  end if;
  return deal_id;
end;
$$;
revoke all on function public.genz_accept_opportunity_response(uuid) from public,anon;
grant execute on function public.genz_accept_opportunity_response(uuid) to authenticated;
