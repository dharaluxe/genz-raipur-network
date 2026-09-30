-- Master Property follow-up hardening.
-- Every listing must have a Master Property; BEFORE INSERT trigger supplies it.
-- Trigger helpers are not API endpoints and must not be directly executable.

alter table public.genz_properties
  alter column master_property_id set not null;

revoke execute on function public.genz_seed_master_property_before_insert() from public, anon, authenticated;
revoke execute on function public.genz_seed_mandate_after_property_insert() from public, anon, authenticated;
revoke execute on function public.genz_sync_master_owner_hash() from public, anon, authenticated;
grant execute on function public.genz_seed_master_property_before_insert() to service_role;
grant execute on function public.genz_seed_mandate_after_property_insert() to service_role;
grant execute on function public.genz_sync_master_owner_hash() to service_role;

-- Keep the master foreign-key relationship synchronized if a listing mandate is
-- explicitly re-pointed by the reviewed merge workflow.
create or replace function public.genz_sync_property_mandate_fields()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
begin
  update public.genz_property_mandates
  set mandate_status = case
        when new.mandate_status = 'verified' then 'verified'
        when new.status = 'archived' then 'expired'
        else 'pending'
      end,
      updated_at = now()
  where property_id = new.id;
  return new;
end;
$$;

revoke execute on function public.genz_sync_property_mandate_fields() from public, anon, authenticated;
grant execute on function public.genz_sync_property_mandate_fields() to service_role;

drop trigger if exists genz_properties_sync_mandate_after_update on public.genz_properties;
create trigger genz_properties_sync_mandate_after_update
after update of mandate_status, status on public.genz_properties
for each row execute function public.genz_sync_property_mandate_fields();
