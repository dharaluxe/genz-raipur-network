create or replace function public.genz_propose_deal_closing(p_deal_id text, p_final_price numeric, p_proof_type text default 'other', p_proof_reference text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare
 d public.genz_deals%rowtype;
 v_agreement_id uuid;
 v_closing_id uuid;
 v_new_version integer;
 v_participant_count integer;
 v_accepted_count integer;
begin
 if (select auth.uid()) is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
 select * into d from public.genz_deals where id=p_deal_id for update;
 if not found then raise exception 'DEAL_NOT_FOUND'; end if;
 if (select auth.uid()) not in (d.buyer_user_id,d.listing_user_id) and not public.genz_is_admin() then raise exception 'DEAL_ACCESS_DENIED'; end if;
 if d.status='closed' then raise exception 'DEAL_ALREADY_CLOSED'; end if;
 if p_final_price is null or p_final_price<=0 then raise exception 'INVALID_FINAL_PRICE'; end if;
 if p_proof_type not in ('booking','agreement','registry','builder_booking','other') then raise exception 'INVALID_PROOF_TYPE'; end if;
 select a.id into v_agreement_id from public.genz_commission_agreements a where a.deal_id=p_deal_id and a.status='accepted' order by a.version desc limit 1;
 if v_agreement_id is null then raise exception 'ACCEPTED_COMMISSION_AGREEMENT_REQUIRED'; end if;
 select coalesce(max(c.version),0)+1 into v_new_version from public.genz_deal_closings c where c.deal_id=p_deal_id;
 insert into public.genz_deal_closings(deal_id,agreement_id,version,final_price,proof_type,proof_reference,proposed_by_user_id)
 values(p_deal_id,v_agreement_id,v_new_version,round(p_final_price,2),p_proof_type,left(coalesce(p_proof_reference,''),500),(select auth.uid())) returning id into v_closing_id;
 insert into public.genz_deal_closing_acceptances(closing_id,user_id,decision,note)
 values(v_closing_id,(select auth.uid()),'accepted','Closing proposer confirmation');
 select count(distinct x) into v_participant_count from unnest(array[d.buyer_user_id,d.listing_user_id]) x;
 select count(*) into v_accepted_count from public.genz_deal_closing_acceptances ca where ca.closing_id=v_closing_id and ca.decision='accepted' and ca.user_id in(d.buyer_user_id,d.listing_user_id);
 if v_accepted_count>=v_participant_count then
  update public.genz_deal_closings set status='confirmed',confirmed_at=now(),updated_at=now() where id=v_closing_id;
  update public.genz_deals set status='closed',last_offer=round(p_final_price,2),updated_at=now() where id=p_deal_id;
  perform public.genz_materialize_closing_entitlements(v_closing_id);
 end if;
 insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
 values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),p_deal_id,(select auth.uid()),'closing_proposed','Closing v'||v_new_version||' proposed at ₹'||round(p_final_price,2)::text);
 return v_closing_id;
end; $$;
revoke execute on function public.genz_propose_deal_closing(text,numeric,text,text) from public,anon;
grant execute on function public.genz_propose_deal_closing(text,numeric,text,text) to authenticated,service_role;
