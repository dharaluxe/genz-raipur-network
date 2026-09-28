-- GENZ Network Phase 2 indexes and RLS performance hardening.
-- Applied to Supabase project zvftcwinvbnavvjfmugr on 2026-09-28.

create index if not exists idx_genz_reviews_reviewer on public.genz_reviews(reviewer_user_id, created_at desc);
create index if not exists idx_genz_reviews_reviewed on public.genz_reviews(reviewed_user_id, created_at desc);
create index if not exists idx_genz_visits_creator on public.genz_visits(created_by_user_id, created_at desc);
create index if not exists idx_genz_visits_verifier on public.genz_visits(verifier_user_id) where verifier_user_id is not null;
create index if not exists idx_genz_property_verifications_listing on public.genz_property_verifications(listing_user_id, updated_at desc);
create index if not exists idx_genz_property_verifications_reviewer on public.genz_property_verifications(reviewed_by_user_id) where reviewed_by_user_id is not null;
create index if not exists idx_genz_property_documents_property on public.genz_property_documents(property_id, created_at desc);
create index if not exists idx_genz_property_documents_uploader on public.genz_property_documents(uploaded_by_user_id, created_at desc);
create index if not exists idx_genz_builders_creator on public.genz_builders(created_by_user_id, created_at desc);
create index if not exists idx_genz_builder_projects_builder on public.genz_builder_projects(builder_id, status);
create index if not exists idx_genz_builder_projects_creator on public.genz_builder_projects(created_by_user_id, created_at desc);

drop policy if exists "deal participant creates verified review" on public.genz_reviews;
create policy "deal participant creates verified review" on public.genz_reviews for insert to authenticated
with check (
  (select public.genz_is_member())
  and (select auth.uid()) = reviewer_user_id
  and exists (
    select 1 from public.genz_deals d
    where d.id = deal_id and d.status='closed'
      and ((d.buyer_user_id = reviewer_user_id and d.listing_user_id = reviewed_user_id)
        or (d.listing_user_id = reviewer_user_id and d.buyer_user_id = reviewed_user_id))
  )
);

drop policy if exists "deal participants read visits" on public.genz_visits;
create policy "deal participants read visits" on public.genz_visits for select to authenticated
using ((select public.genz_is_member()) and exists (
  select 1 from public.genz_deals d where d.id=deal_id
  and ((select auth.uid()) in (d.buyer_user_id,d.listing_user_id) or (select public.genz_is_admin()))
));

drop policy if exists "listing broker or admin reads verification" on public.genz_property_verifications;
create policy "listing broker or admin reads verification" on public.genz_property_verifications for select to authenticated
using ((select public.genz_is_member()) and ((select auth.uid())=listing_user_id or (select public.genz_is_admin())));

drop policy if exists "listing broker or admin reads document metadata" on public.genz_property_documents;
create policy "listing broker or admin reads document metadata" on public.genz_property_documents for select to authenticated
using ((select public.genz_is_member()) and (uploaded_by_user_id=(select auth.uid()) or (select public.genz_is_admin())));

drop policy if exists "listing broker inserts own document metadata" on public.genz_property_documents;
create policy "listing broker inserts own document metadata" on public.genz_property_documents for insert to authenticated
with check ((select public.genz_is_member()) and uploaded_by_user_id=(select auth.uid()) and exists(select 1 from public.genz_properties p where p.id=property_id and p.listing_user_id=(select auth.uid())));

drop policy if exists "listing broker deletes own document metadata" on public.genz_property_documents;
create policy "listing broker deletes own document metadata" on public.genz_property_documents for delete to authenticated
using ((select public.genz_is_member()) and (uploaded_by_user_id=(select auth.uid()) or (select public.genz_is_admin())));

drop policy if exists "admin creates builders" on public.genz_builders;
create policy "admin creates builders" on public.genz_builders for insert to authenticated
with check ((select public.genz_is_admin()) and created_by_user_id=(select auth.uid()));

drop policy if exists "admin creates builder projects" on public.genz_builder_projects;
create policy "admin creates builder projects" on public.genz_builder_projects for insert to authenticated
with check ((select public.genz_is_admin()) and created_by_user_id=(select auth.uid()));
