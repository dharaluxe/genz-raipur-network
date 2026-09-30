-- The commission foundation already provides the identical unique partial index
-- `idx_genz_commission_ledger_source_key`. Keep one copy only.
drop index if exists public.genz_commission_ledger_source_key_uq;
