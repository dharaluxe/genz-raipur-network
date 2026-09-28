create or replace function public.genz_validate_builder_invite(p_token text)
returns table(valid boolean,email text,builder_name text,role text,expires_at timestamptz)
language plpgsql security definer set search_path=public,extensions as $$
declare inv public.genz_builder_account_invites%rowtype; bname text;
begin
  select * into inv from public.genz_builder_account_invites where token_hash=encode(extensions.digest(trim(p_token),'sha256'),'hex');
  if not found then return query select false,null::text,null::text,null::text,null::timestamptz; return; end if;
  if inv.status<>'pending' or inv.expires_at<=now() then return query select false,null::text,null::text,null::text,inv.expires_at; return; end if;
  select name into bname from public.genz_builders where id=inv.builder_id;
  return query select true,inv.email,bname,inv.role,inv.expires_at;
end;$$;
revoke all on function public.genz_validate_builder_invite(text) from public;
grant execute on function public.genz_validate_builder_invite(text) to anon,authenticated;
