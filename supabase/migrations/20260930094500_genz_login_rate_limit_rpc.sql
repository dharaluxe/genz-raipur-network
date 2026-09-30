create or replace function public.genz_check_login_rate_limit(p_identity_hash text)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','public','extensions'
as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_ip text := 'unknown';
  v_agent text := '';
  v_fingerprint text;
  v_window timestamptz := date_trunc('minute', clock_timestamp());
  v_hits integer;
begin
  if coalesce(p_identity_hash,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'GENZ_LOGIN_RATE_LIMIT_INPUT';
  end if;

  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true),'')::jsonb, '{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_ip := trim(split_part(coalesce(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip', v_headers->>'cf-connecting-ip', 'unknown'), ',', 1));
  v_agent := left(coalesce(v_headers->>'user-agent',''),180);
  v_fingerprint := encode(extensions.digest(v_ip || '|' || v_agent || '|' || p_identity_hash || '|genz-login-v1','sha256'),'hex');

  insert into public.genz_public_broker_lookup_rate_limits(request_fingerprint,window_start,hits,updated_at)
  values(v_fingerprint,v_window,1,clock_timestamp())
  on conflict(request_fingerprint,window_start)
  do update set hits=public.genz_public_broker_lookup_rate_limits.hits+1,updated_at=clock_timestamp()
  returning hits into v_hits;

  delete from public.genz_public_broker_lookup_rate_limits
  where updated_at < clock_timestamp()-interval '2 hours';

  if v_hits > 10 then
    raise exception 'GENZ_LOGIN_RATE_LIMIT';
  end if;

  return v_hits;
end;
$$;

revoke all on function public.genz_check_login_rate_limit(text) from public;
grant execute on function public.genz_check_login_rate_limit(text) to anon, authenticated;
