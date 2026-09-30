create or replace function public.genz_record_commission_activity(p_deal_id text, p_entry_type text, p_amount numeric, p_reference text default '', p_note text default '', p_broker_user_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 d public.genz_deals%rowtype;
 v_agreement_id uuid;
 target_user uuid;
 entry_id uuid;
 earned_total numeric(16,2);
 invoice_total numeric(16,2);
 payment_total numeric(16,2);
 refund_total numeric(16,2);
begin
 if (select auth.uid()) is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
 if p_entry_type not in ('invoice','payment','refund') then raise exception 'INVALID_LEDGER_ENTRY_TYPE'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
 select * into d from public.genz_deals where id=p_deal_id for update;
 if not found then raise exception 'DEAL_NOT_FOUND'; end if;
 if (select auth.uid()) not in (d.buyer_user_id,d.listing_user_id) and not public.genz_is_admin() then raise exception 'DEAL_ACCESS_DENIED'; end if;
 target_user:=coalesce(p_broker_user_id,(select auth.uid()));
 if not public.genz_is_admin() and target_user<>(select auth.uid()) then raise exception 'BROKER_TARGET_DENIED'; end if;
 select a.id into v_agreement_id from public.genz_commission_agreements a where a.deal_id=p_deal_id and a.status='accepted' order by a.version desc limit 1;
 if v_agreement_id is null then raise exception 'ACCEPTED_COMMISSION_AGREEMENT_REQUIRED'; end if;
 if not exists(select 1 from public.genz_commission_allocations x where x.agreement_id=v_agreement_id and x.broker_user_id=target_user) then raise exception 'BROKER_NOT_ALLOCATED'; end if;
 select coalesce(sum(amount),0) into earned_total from public.genz_commission_ledger where deal_id=p_deal_id and broker_user_id=target_user and entry_type='earned' and status='confirmed';
 if earned_total<=0 then raise exception 'EARNED_ENTITLEMENT_REQUIRED'; end if;
 select coalesce(sum(amount),0) into invoice_total from public.genz_commission_ledger where deal_id=p_deal_id and broker_user_id=target_user and entry_type='invoice' and status in ('pending','confirmed');
 select coalesce(sum(amount),0) into payment_total from public.genz_commission_ledger where deal_id=p_deal_id and broker_user_id=target_user and entry_type='payment' and status in ('pending','confirmed');
 select coalesce(sum(amount),0) into refund_total from public.genz_commission_ledger where deal_id=p_deal_id and broker_user_id=target_user and entry_type='refund' and status in ('pending','confirmed');
 if p_entry_type='invoice' and invoice_total+p_amount>earned_total then raise exception 'INVOICE_EXCEEDS_ENTITLEMENT'; end if;
 if p_entry_type='payment' and payment_total+p_amount>earned_total+refund_total then raise exception 'PAYMENT_EXCEEDS_RECEIVABLE'; end if;
 if p_entry_type='refund' and refund_total+p_amount>payment_total then raise exception 'REFUND_EXCEEDS_RECORDED_PAYMENT'; end if;
 insert into public.genz_commission_ledger(deal_id,agreement_id,broker_user_id,entry_type,amount,status,reference,note,created_by_user_id,source_key)
 values(p_deal_id,v_agreement_id,target_user,p_entry_type,round(p_amount,2),'pending',left(coalesce(p_reference,''),500),left(coalesce(p_note,''),1200),(select auth.uid()),'manual:'||p_entry_type||':'||extensions.gen_random_uuid()::text)
 returning id into entry_id;
 insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
 values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),p_deal_id,(select auth.uid()),'commission_'||p_entry_type||'_reported',initcap(p_entry_type)||' reported for ₹'||round(p_amount,2)::text||'; pending verification');
 return entry_id;
end; $$;
revoke execute on function public.genz_record_commission_activity(text,text,numeric,text,text,uuid) from public,anon;
grant execute on function public.genz_record_commission_activity(text,text,numeric,text,text,uuid) to authenticated,service_role;
