-- Phase 2.3 covering indexes for foreign-key joins flagged by the Supabase advisor.
create index if not exists idx_genz_commission_agreements_proposer on public.genz_commission_agreements(proposed_by_user_id,created_at desc);
create index if not exists idx_genz_commission_disputes_agreement on public.genz_commission_disputes(agreement_id) where agreement_id is not null;
create index if not exists idx_genz_commission_disputes_resolver on public.genz_commission_disputes(resolved_by_user_id) where resolved_by_user_id is not null;
create index if not exists idx_genz_commission_ledger_agreement on public.genz_commission_ledger(agreement_id) where agreement_id is not null;
create index if not exists idx_genz_commission_ledger_creator on public.genz_commission_ledger(created_by_user_id,created_at desc);
create index if not exists idx_genz_referral_links_introducer on public.genz_referral_links(introduced_by_user_id,created_at desc);
