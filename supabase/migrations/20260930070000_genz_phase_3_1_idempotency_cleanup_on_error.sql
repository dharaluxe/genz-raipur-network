create or replace function public.genz_make_deal_offer_v2(p_deal_id text,p_amount numeric,p_note text default '',p_parent_offer_id uuid default null,p_valid_hours integer default 72,p_client_request_id uuid default null)
returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_uid uuid:=(select auth.uid()); v_existing uuid; v_created uuid;
begin
 if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
 if p_client_request_id is null then raise exception 'CLIENT_REQUEST_ID_REQUIRED'; end if;
 select o.id into v_existing from public.genz_deal_offers o where o.offered_by_user_id=v_uid and o.client_request_id=p_client_request_id;
 if v_existing is not null then return v_existing; end if;
 perform 1 from public.genz_deals d where d.id=p_deal_id for update;
 if not found then raise exception 'DEAL_NOT_FOUND'; end if;
 select o.id into v_existing from public.genz_deal_offers o where o.offered_by_user_id=v_uid and o.client_request_id=p_client_request_id;
 if v_existing is not null then return v_existing; end if;
 v_created:=public.genz_make_deal_offer(p_deal_id,p_amount,p_note,p_parent_offer_id,p_valid_hours);
 update public.genz_deal_offers set client_request_id=p_client_request_id where id=v_created and offered_by_user_id=v_uid;
 return v_created;
exception when unique_violation then
 select o.id into v_existing from public.genz_deal_offers o where o.offered_by_user_id=v_uid and o.client_request_id=p_client_request_id;
 if v_existing is not null then return v_existing; end if;
 raise;
end; $$;
revoke execute on function public.genz_make_deal_offer_v2(text,numeric,text,uuid,integer,uuid) from public,anon;
grant execute on function public.genz_make_deal_offer_v2(text,numeric,text,uuid,integer,uuid) to authenticated,service_role;

create or replace function public.genz_propose_commission_agreement_v2(p_deal_id text,p_method text,p_fixed_amount numeric,p_percentage numeric,p_fee_payer text,p_due_date date,p_terms text,p_allocations jsonb,p_client_request_id uuid)
returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_uid uuid:=(select auth.uid()); v_existing uuid; v_created uuid;
begin
 if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
 if p_client_request_id is null then raise exception 'CLIENT_REQUEST_ID_REQUIRED'; end if;
 perform 1 from public.genz_deals d where d.id=p_deal_id for update;
 if not found then raise exception 'DEAL_NOT_FOUND'; end if;
 select a.id into v_existing from public.genz_commission_agreements a where a.proposed_by_user_id=v_uid and a.client_request_id=p_client_request_id;
 if v_existing is not null then return v_existing; end if;
 v_created:=public.genz_propose_commission_agreement(p_deal_id,p_method,p_fixed_amount,p_percentage,p_fee_payer,p_due_date,p_terms,p_allocations);
 update public.genz_commission_agreements set client_request_id=p_client_request_id where id=v_created and proposed_by_user_id=v_uid;
 return v_created;
exception when unique_violation then
 select a.id into v_existing from public.genz_commission_agreements a where a.proposed_by_user_id=v_uid and a.client_request_id=p_client_request_id;
 if v_existing is not null then return v_existing; end if;
 raise;
end; $$;
revoke execute on function public.genz_propose_commission_agreement_v2(text,text,numeric,numeric,text,date,text,jsonb,uuid) from public,anon;
grant execute on function public.genz_propose_commission_agreement_v2(text,text,numeric,numeric,text,date,text,jsonb,uuid) to authenticated,service_role;

create or replace function public.genz_record_commission_activity_v2(p_deal_id text,p_entry_type text,p_amount numeric,p_reference text default '',p_note text default '',p_broker_user_id uuid default null,p_client_request_id uuid default null)
returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_uid uuid:=(select auth.uid()); v_key text; v_existing uuid; v_created uuid;
begin
 if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
 if p_client_request_id is null then raise exception 'CLIENT_REQUEST_ID_REQUIRED'; end if;
 v_key:='manual-v2:'||v_uid::text||':'||p_client_request_id::text;
 select l.id into v_existing from public.genz_commission_ledger l where l.source_key=v_key;
 if v_existing is not null then return v_existing; end if;
 perform 1 from public.genz_deals d where d.id=p_deal_id for update;
 if not found then raise exception 'DEAL_NOT_FOUND'; end if;
 select l.id into v_existing from public.genz_commission_ledger l where l.source_key=v_key;
 if v_existing is not null then return v_existing; end if;
 v_created:=public.genz_record_commission_activity(p_deal_id,p_entry_type,p_amount,p_reference,p_note,p_broker_user_id);
 update public.genz_commission_ledger set source_key=v_key where id=v_created and created_by_user_id=v_uid;
 return v_created;
exception when unique_violation then
 select l.id into v_existing from public.genz_commission_ledger l where l.source_key=v_key;
 if v_existing is not null then return v_existing; end if;
 raise;
end; $$;
revoke execute on function public.genz_record_commission_activity_v2(text,text,numeric,text,text,uuid,uuid) from public,anon;
grant execute on function public.genz_record_commission_activity_v2(text,text,numeric,text,text,uuid,uuid) to authenticated,service_role;
