create or replace function public.genz_propose_commission_agreement(p_deal_id text, p_method text, p_fixed_amount numeric, p_percentage numeric, p_fee_payer text, p_due_date date, p_terms text, p_allocations jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 d public.genz_deals%rowtype;
 v_agreement_id uuid;
 new_version integer;
 item jsonb;
 broker_id uuid;
 allocation_role text;
 allocation_share numeric;
 allocation_sequence integer:=0;
 share_total numeric:=0;
 has_buyer boolean:=false;
 has_listing boolean:=false;
 participant_count integer;
 accepted_count integer;
begin
 if (select auth.uid()) is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
 select * into d from public.genz_deals where id=p_deal_id for update;
 if not found then raise exception 'DEAL_NOT_FOUND'; end if;
 if (select auth.uid()) not in (d.buyer_user_id,d.listing_user_id) and not public.genz_is_admin() then raise exception 'DEAL_ACCESS_DENIED'; end if;
 if d.status='declined' then raise exception 'DEAL_DECLINED'; end if;
 if p_method not in ('fixed','percentage') then raise exception 'INVALID_COMMISSION_METHOD'; end if;
 if p_method='fixed' and (p_fixed_amount is null or p_fixed_amount<=0 or p_percentage is not null) then raise exception 'INVALID_FIXED_COMMISSION'; end if;
 if p_method='percentage' and (p_percentage is null or p_percentage<=0 or p_percentage>100 or p_fixed_amount is not null) then raise exception 'INVALID_PERCENTAGE_COMMISSION'; end if;
 if p_fee_payer not in ('seller','buyer','builder','both','other') then raise exception 'INVALID_FEE_PAYER'; end if;
 if char_length(coalesce(p_terms,''))>2500 then raise exception 'TERMS_TOO_LONG'; end if;
 if jsonb_typeof(p_allocations)<>'array' or jsonb_array_length(p_allocations)<2 or jsonb_array_length(p_allocations)>10 then raise exception 'INVALID_ALLOCATIONS'; end if;
 for item in select value from jsonb_array_elements(p_allocations) loop
  allocation_sequence:=allocation_sequence+1;
  begin broker_id:=(item->>'brokerUserId')::uuid; exception when others then raise exception 'INVALID_ALLOCATION_BROKER'; end;
  allocation_role:=item->>'role';
  begin allocation_share:=(item->>'sharePercent')::numeric; exception when others then raise exception 'INVALID_ALLOCATION_SHARE'; end;
  if allocation_role not in ('buyer_broker','listing_broker','referral_broker') then raise exception 'INVALID_ALLOCATION_ROLE'; end if;
  if allocation_share is null or allocation_share<=0 or allocation_share>100 then raise exception 'INVALID_ALLOCATION_SHARE'; end if;
  if not exists(select 1 from public.genz_profiles p where p.id=broker_id) then raise exception 'ALLOCATION_BROKER_NOT_FOUND'; end if;
  if allocation_role='buyer_broker' and broker_id<>d.buyer_user_id then raise exception 'BUYER_BROKER_ALLOCATION_MISMATCH'; end if;
  if allocation_role='listing_broker' and broker_id<>d.listing_user_id then raise exception 'LISTING_BROKER_ALLOCATION_MISMATCH'; end if;
  if allocation_role='referral_broker' then
   if broker_id in (d.buyer_user_id,d.listing_user_id) then raise exception 'REFERRAL_BROKER_ALREADY_DEAL_PARTICIPANT'; end if;
   if not exists(select 1 from public.genz_referral_links r where r.deal_id=p_deal_id and r.broker_user_id=broker_id) then raise exception 'REFERRAL_LINK_REQUIRED'; end if;
  end if;
  if allocation_role='buyer_broker' then has_buyer:=true; end if;
  if allocation_role='listing_broker' then has_listing:=true; end if;
  share_total:=share_total+allocation_share;
 end loop;
 if not has_buyer or not has_listing then raise exception 'BUYER_AND_LISTING_ALLOCATIONS_REQUIRED'; end if;
 if round(share_total,2)<>100.00 then raise exception 'ALLOCATIONS_MUST_TOTAL_100'; end if;
 select coalesce(max(version),0)+1 into new_version from public.genz_commission_agreements where deal_id=p_deal_id;
 insert into public.genz_commission_agreements(deal_id,version,method,fixed_amount,percentage,fee_payer,due_date,terms,proposed_by_user_id)
 values(p_deal_id,new_version,p_method,case when p_method='fixed' then round(p_fixed_amount,2) else null end,case when p_method='percentage' then round(p_percentage,4) else null end,p_fee_payer,p_due_date,left(coalesce(p_terms,''),2500),(select auth.uid()))
 returning id into v_agreement_id;
 allocation_sequence:=0;
 for item in select value from jsonb_array_elements(p_allocations) loop
  allocation_sequence:=allocation_sequence+1;
  broker_id:=(item->>'brokerUserId')::uuid;
  allocation_role:=item->>'role';
  allocation_share:=(item->>'sharePercent')::numeric;
  insert into public.genz_commission_allocations(agreement_id,deal_id,broker_user_id,role,share_percent,sequence)
  values(v_agreement_id,p_deal_id,broker_id,allocation_role,round(allocation_share,2),allocation_sequence);
 end loop;
 insert into public.genz_commission_acceptances(agreement_id,user_id,decision,note)
 values(v_agreement_id,(select auth.uid()),'accepted','Proposer acceptance')
 on conflict on constraint genz_commission_acceptances_pkey do update set decision='accepted',note='Proposer acceptance',updated_at=now();
 select count(distinct x) into participant_count from unnest(array[d.buyer_user_id,d.listing_user_id]) x;
 select count(*) into accepted_count from public.genz_commission_acceptances a where a.agreement_id=v_agreement_id and a.decision='accepted' and a.user_id in (d.buyer_user_id,d.listing_user_id);
 if accepted_count>=participant_count then
  update public.genz_commission_agreements set status='superseded',updated_at=now() where deal_id=p_deal_id and status='accepted' and id<>v_agreement_id;
  update public.genz_commission_agreements set status='accepted',effective_at=now(),updated_at=now() where id=v_agreement_id;
 end if;
 insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
 values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),p_deal_id,(select auth.uid()),'commission_proposed','Commission agreement v'||new_version||' proposed');
 return v_agreement_id;
end; $$;
revoke execute on function public.genz_propose_commission_agreement(text,text,numeric,numeric,text,date,text,jsonb) from public,anon;
grant execute on function public.genz_propose_commission_agreement(text,text,numeric,numeric,text,date,text,jsonb) to authenticated,service_role;
