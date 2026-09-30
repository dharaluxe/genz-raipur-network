-- Phase 2.7 performance hardening: cover the two new foreign keys flagged by
-- Supabase advisor. Do not touch unrelated shared-project tables.

create index if not exists genz_master_properties_created_by_idx
  on public.genz_master_properties (created_by_user_id);

create index if not exists genz_property_master_claim_current_idx
  on public.genz_property_master_claims (current_master_id);
