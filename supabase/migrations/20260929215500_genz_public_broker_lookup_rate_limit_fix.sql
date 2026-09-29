create or replace function public.genz_public_broker_lookup(p_broker_code text)
returns table (
  broker_code text, display_name text, firm text, cities text[], specialties text[], verified boolean,
  rating numeric, review_count integer, completed_deals integer, successful_collaborations integer,
  verified_visits integer, owner_confirmed_listings integer, member_since timestamptz, avatar_url text,
  account_status text, public_status_note text, status_effective_at timestamptz,
  trust_score integer, trust_confidence text
)
language plpgsql volatile security definer set search_path=public,extensions,pg_temp as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_ip text := 'unknown';
  v_agent text := '';
  v_fingerprint text;
  v_window timestamptz := date_trunc('minute', clock_timestamp());
  v_hits integer;
begin
  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true),'')::jsonb, '{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_ip := trim(split_part(coalesce(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip', v_headers->>'cf-connecting-ip', 'unknown'), ',', 1));
  v_agent := left(coalesce(v_headers->>'user-agent',''), 180);
  v_fingerprint := encode(extensions.digest(v_ip || '|' || v_agent || '|genz-public-broker-lookup-v1','sha256'),'hex');

  insert into public.genz_public_broker_lookup_rate_limits(request_fingerprint,window_start,hits,updated_at)
  values(v_fingerprint,v_window,1,clock_timestamp())
  on conflict(request_fingerprint,window_start)
  do update set hits=public.genz_public_broker_lookup_rate_limits.hits+1,updated_at=clock_timestamp()
  returning hits into v_hits;

  delete from public.genz_public_broker_lookup_rate_limits
  where request_fingerprint=v_fingerprint and updated_at < clock_timestamp()-interval '2 hours';

  if v_hits > 30 then
    raise exception 'GENZ_PUBLIC_LOOKUP_RATE_LIMIT';
  end if;

  return query
  with matched as (
    select p.*, pp.avatar_url, pp.account_status, pp.public_status_note, pp.status_effective_at,
      case when p.verified then 10.0 else 0.0 end + least(greatest(coalesce(p.owner_confirmed_listings,0),0),5)::numeric as verification_points,
      least(greatest(coalesce(p.completed_deals,0),0),10)::numeric*2.0 as deal_points,
      least(greatest(coalesce(p.successful_collaborations,0),0),10)::numeric*2.0 as collaboration_points,
      least(greatest(coalesce(p.verified_visits,0),0),20)::numeric*0.5 as visit_points,
      case when coalesce(p.collaboration_requests,0)>0 then least(greatest(coalesce(p.collaboration_responses,0),0),p.collaboration_requests)::numeric/p.collaboration_requests::numeric*10.0 else 0.0 end as response_points,
      case when coalesce(p.review_count,0)>0 then (((coalesce(p.rating,0)::numeric*p.review_count::numeric)+20.0)/(p.review_count::numeric+5.0))/5.0*10.0 else 0.0 end as feedback_points,
      15.0-least(15.0,greatest(coalesce(p.unresolved_disputes,0),0)::numeric*2.0) as integrity_points
    from public.genz_profiles p join public.genz_broker_public_profiles pp on pp.broker_user_id=p.id
    where upper(p.broker_code)=upper(trim(p_broker_code)) and trim(p_broker_code) ~* '^BR-[A-Z0-9]{8}$' limit 1
  ), scored as (
    select m.*, round(greatest(0.0,least(100.0,m.verification_points+m.deal_points+m.collaboration_points+m.visit_points+m.response_points+m.feedback_points+m.integrity_points)))::integer as computed_trust_score,
      case
        when (greatest(coalesce(m.completed_deals,0),0)+greatest(coalesce(m.successful_collaborations,0),0)+greatest(coalesce(m.verified_visits,0),0)+least(5,greatest(coalesce(m.owner_confirmed_listings,0),0)))>=20 or coalesce(m.completed_deals,0)>=5 then 'established'
        when (greatest(coalesce(m.completed_deals,0),0)+greatest(coalesce(m.successful_collaborations,0),0)+greatest(coalesce(m.verified_visits,0),0)+least(5,greatest(coalesce(m.owner_confirmed_listings,0),0)))>=5 or coalesce(m.completed_deals,0)>=1 then 'developing'
        else 'new' end as computed_confidence
    from matched m
  )
  select s.broker_code,s.display_name,s.firm,s.cities,s.specialties,s.verified,s.rating,s.review_count,s.completed_deals,s.successful_collaborations,s.verified_visits,s.owner_confirmed_listings,
    s.created_at,s.avatar_url,s.account_status,s.public_status_note,s.status_effective_at,s.computed_trust_score,s.computed_confidence
  from scored s;
end; $$;
revoke all on function public.genz_public_broker_lookup(text) from public;
grant execute on function public.genz_public_broker_lookup(text) to anon,authenticated;
