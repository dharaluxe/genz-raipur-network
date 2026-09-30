create unique index if not exists genz_commission_ledger_source_key_uq
on public.genz_commission_ledger(source_key)
where source_key is not null;
