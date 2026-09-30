-- GENZ advanced Deal Room actions: acceptance, offer history, messaging, evidence and two-party unsuccessful closeout.

create or replace function public.genz_accept_deal_room(p_deal_id text)
returns text language plpgsql security definer set search_path='pg_catalog','public' as $$
declare d public.genz_deals%rowtype; v_uid uuid:=auth.uid(); v_requester uuid;
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into d from public.genz_deals where id=p_deal_id for update;
  if d.id is null then raise exception 'DEAL_NOT_FOUND'; end if;
  if not public.genz_deal_has_permission(p_deal_id,'read') then raise exception 'DEAL_ACCESS_DENIED'; end if;
  if d.status<>'requested' then return d.status; end if;
  select e.actor_user_id into v_requester from public.genz_deal_events e where e.deal_id=p_deal_id and e.event_type='introduction' order by e.created_at asc limit 1;
  if v_requester=v_uid and d.buyer_user_id<>d.listing_user_id then raise exception 'OTHER_BROKER_MUST_ACCEPT'; end if;
  update public.genz_deals set status='accepted',updated_at=now() where id=p_deal_id;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label) values('EV-'||replace(gen_random_uuid()::text,'-',''),p_deal_id,v_uid,'accepted','Broker collaboration accepted');
  return 'accepted';
end; $$;
revoke execute on function public.genz_accept_deal_room(text) from public,anon;
grant execute on function public.genz_accept_deal_room(text) to authenticated,service_role;

create or replace function public.genz_make_deal_offer(p_deal_id text,p_amount numeric,p_note text default '',p_parent_offer_id uuid default null,p_valid_hours integer default 72)
returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $$
declare d public.genz_deals%rowtype; parent public.genz_deal_offers%rowtype; v_uid uuid:=auth.uid(); v_id uuid; v_hours integer:=greatest(1,least(coalesce(p_valid_hours,72),168));
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  if not public.genz_deal_has_permission(p_deal_id,'offer') then raise exception 'DEAL_OFFER_DENIED'; end if;
  select * into d from public.genz_deals where id=p_deal_id for update;
  if d.id is null then raise exception 'DEAL_NOT_FOUND'; end if;
  if d.status not in ('accepted','visit_verified','negotiation') then raise exception 'DEAL_NOT_READY_FOR_OFFER'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'INVALID_OFFER_AMOUNT'; end if;
  update public.genz_deal_offers set status='expired',updated_at=now() where deal_id=p_deal_id and status='proposed' and valid_until<=now();
  if p_parent_offer_id is not null then
    select * into parent from public.genz_deal_offers where id=p_parent_offer_id for update;
    if parent.id is null or parent.deal_id<>p_deal_id then raise exception 'PARENT_OFFER_NOT_FOUND'; end if;
    if parent.status<>'proposed' or parent.valid_until<=now() then raise exception 'PARENT_OFFER_NOT_OPEN'; end if;
    if parent.offered_by_user_id=v_uid then raise exception 'CANNOT_COUNTER_OWN_OFFER'; end if;
    update public.genz_deal_offers set status='countered',responded_by_user_id=v_uid,responded_at=now(),updated_at=now() where id=parent.id;
  end if;
  insert into public.genz_deal_offers(deal_id,parent_offer_id,offered_by_user_id,amount,note,valid_until)
  values(p_deal_id,p_parent_offer_id,v_uid,round(p_amount,2),left(coalesce(p_note,''),800),now()+make_interval(hours=>v_hours)) returning id into v_id;
  update public.genz_deals set status='negotiation',last_offer=round(p_amount,2),updated_at=now() where id=p_deal_id;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
  values('EV-'||replace(gen_random_uuid()::text,'-',''),p_deal_id,v_uid,case when p_parent_offer_id is null then 'offer_proposed' else 'offer_countered' end,case when p_parent_offer_id is null then 'Offer proposed at ₹' else 'Counter-offer proposed at ₹' end||round(p_amount,2)::text);
  return v_id;
end; $$;
revoke execute on function public.genz_make_deal_offer(text,numeric,text,uuid,integer) from public,anon;
grant execute on function public.genz_make_deal_offer(text,numeric,text,uuid,integer) to authenticated,service_role;

create or replace function public.genz_respond_deal_offer(p_offer_id uuid,p_decision text,p_note text default '')
returns text language plpgsql security definer set search_path='pg_catalog','public' as $$
declare o public.genz_deal_offers%rowtype; v_uid uuid:=auth.uid();
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  if p_decision not in ('accepted','rejected') then raise exception 'INVALID_OFFER_DECISION'; end if;
  select * into o from public.genz_deal_offers where id=p_offer_id for update;
  if o.id is null then raise exception 'OFFER_NOT_FOUND'; end if;
  if not public.genz_deal_has_permission(o.deal_id,'offer') then raise exception 'DEAL_OFFER_DENIED'; end if;
  if o.offered_by_user_id=v_uid then raise exception 'CANNOT_RESPOND_OWN_OFFER'; end if;
  if o.status<>'proposed' then return o.status; end if;
  if o.valid_until<=now() then update public.genz_deal_offers set status='expired',updated_at=now() where id=o.id; return 'expired'; end if;
  update public.genz_deal_offers set status=p_decision,responded_by_user_id=v_uid,responded_at=now(),note=left(case when coalesce(p_note,'')='' then note else note||case when note='' then '' else E'\n' end||'Response: '||p_note end,800),updated_at=now() where id=o.id;
  if p_decision='accepted' then
    update public.genz_deal_offers set status='superseded',updated_at=now() where deal_id=o.deal_id and status='proposed' and id<>o.id;
    update public.genz_deals set status='negotiation',last_offer=o.amount,updated_at=now() where id=o.deal_id;
  end if;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label) values('EV-'||replace(gen_random_uuid()::text,'-',''),o.deal_id,v_uid,'offer_'||p_decision,'Offer ₹'||o.amount::text||' '||p_decision);
  return p_decision;
end; $$;
revoke execute on function public.genz_respond_deal_offer(uuid,text,text) from public,anon;
grant execute on function public.genz_respond_deal_offer(uuid,text,text) to authenticated,service_role;

create or replace function public.genz_withdraw_deal_offer(p_offer_id uuid)
returns text language plpgsql security definer set search_path='pg_catalog','public' as $$
declare o public.genz_deal_offers%rowtype; v_uid uuid:=auth.uid();
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into o from public.genz_deal_offers where id=p_offer_id for update;
  if o.id is null then raise exception 'OFFER_NOT_FOUND'; end if;
  if o.offered_by_user_id<>v_uid and not public.genz_is_admin() then raise exception 'OFFER_WITHDRAW_DENIED'; end if;
  if o.status<>'proposed' then return o.status; end if;
  update public.genz_deal_offers set status='withdrawn',responded_by_user_id=v_uid,responded_at=now(),updated_at=now() where id=o.id;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label) values('EV-'||replace(gen_random_uuid()::text,'-',''),o.deal_id,v_uid,'offer_withdrawn','Offer ₹'||o.amount::text||' withdrawn');
  return 'withdrawn';
end; $$;
revoke execute on function public.genz_withdraw_deal_offer(uuid) from public,anon;
grant execute on function public.genz_withdraw_deal_offer(uuid) to authenticated,service_role;

create or replace function public.genz_post_deal_message(p_deal_id text,p_body text,p_reply_to_message_id uuid default null)
returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_uid uuid:=auth.uid(); v_id uuid; v_body text:=trim(coalesce(p_body,''));
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  if not public.genz_deal_has_permission(p_deal_id,'message') then raise exception 'DEAL_MESSAGE_DENIED'; end if;
  if char_length(v_body)<1 or char_length(v_body)>2000 then raise exception 'INVALID_MESSAGE'; end if;
  if p_reply_to_message_id is not null and not exists(select 1 from public.genz_deal_messages m where m.id=p_reply_to_message_id and m.deal_id=p_deal_id) then raise exception 'REPLY_MESSAGE_NOT_FOUND'; end if;
  insert into public.genz_deal_messages(deal_id,sender_user_id,reply_to_message_id,body) values(p_deal_id,v_uid,p_reply_to_message_id,v_body) returning id into v_id;
  return v_id;
end; $$;
revoke execute on function public.genz_post_deal_message(text,text,uuid) from public,anon;
grant execute on function public.genz_post_deal_message(text,text,uuid) to authenticated,service_role;

create or replace function public.genz_register_deal_evidence(p_deal_id text,p_evidence_type text,p_title text,p_note text default '',p_storage_path text default null,p_original_name text default '',p_mime_type text default '',p_size_bytes bigint default 0)
returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_uid uuid:=auth.uid(); v_id uuid; expected_prefix text;
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  if not public.genz_deal_has_permission(p_deal_id,'evidence') then raise exception 'DEAL_EVIDENCE_DENIED'; end if;
  if p_evidence_type not in ('note','document','image','visit','offer','payment','other') then raise exception 'INVALID_EVIDENCE_TYPE'; end if;
  if char_length(trim(coalesce(p_title,'')))<1 or char_length(trim(p_title))>160 then raise exception 'INVALID_EVIDENCE_TITLE'; end if;
  if p_size_bytes is null or p_size_bytes<0 or p_size_bytes>10485760 then raise exception 'INVALID_EVIDENCE_SIZE'; end if;
  if p_evidence_type<>'note' then
    expected_prefix:=v_uid::text||'/deal/'||p_deal_id||'/';
    if p_storage_path is null or position(expected_prefix in p_storage_path)<>1 then raise exception 'INVALID_EVIDENCE_STORAGE_PATH'; end if;
    if p_mime_type not in ('application/pdf','image/jpeg','image/png') then raise exception 'INVALID_EVIDENCE_MIME_TYPE'; end if;
  end if;
  insert into public.genz_deal_evidence(deal_id,added_by_user_id,evidence_type,title,note,storage_path,original_name,mime_type,size_bytes)
  values(p_deal_id,v_uid,p_evidence_type,left(trim(p_title),160),left(coalesce(p_note,''),1200),p_storage_path,left(coalesce(p_original_name,''),240),left(coalesce(p_mime_type,''),120),p_size_bytes) returning id into v_id;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label) values('EV-'||replace(gen_random_uuid()::text,'-',''),p_deal_id,v_uid,'evidence_added','Evidence added · '||left(trim(p_title),100));
  return v_id;
end; $$;
revoke execute on function public.genz_register_deal_evidence(text,text,text,text,text,text,text,bigint) from public,anon;
grant execute on function public.genz_register_deal_evidence(text,text,text,text,text,text,text,bigint) to authenticated,service_role;

create or replace function public.genz_propose_deal_closeout(p_deal_id text,p_outcome text,p_reason_code text,p_note text default '')
returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $$
declare d public.genz_deals%rowtype; v_uid uuid:=auth.uid(); v_id uuid; v_version integer; participant_count integer; accepted_count integer;
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  if not public.genz_deal_has_permission(p_deal_id,'close') then raise exception 'DEAL_CLOSE_DENIED'; end if;
  if p_outcome not in ('failed','withdrawn','expired','duplicate') then raise exception 'INVALID_CLOSEOUT_OUTCOME'; end if;
  if p_reason_code not in ('price_not_agreed','buyer_unresponsive','seller_unresponsive','property_unavailable','financing_failed','documentation_issue','commission_not_agreed','duplicate_opportunity','expired_requirement','other') then raise exception 'INVALID_CLOSEOUT_REASON'; end if;
  select * into d from public.genz_deals where id=p_deal_id for update;
  if d.id is null then raise exception 'DEAL_NOT_FOUND'; end if;
  if d.status='closed' then raise exception 'DEAL_ALREADY_CLOSED'; end if;
  update public.genz_deal_closeouts set status='superseded',updated_at=now() where deal_id=p_deal_id and status='proposed';
  select coalesce(max(version),0)+1 into v_version from public.genz_deal_closeouts where deal_id=p_deal_id;
  insert into public.genz_deal_closeouts(deal_id,version,outcome,reason_code,note,proposed_by_user_id) values(p_deal_id,v_version,p_outcome,p_reason_code,left(coalesce(p_note,''),1200),v_uid) returning id into v_id;
  insert into public.genz_deal_closeout_acceptances(closeout_id,user_id,decision,note) values(v_id,v_uid,'accepted','Closeout proposer confirmation');
  select count(distinct x) into participant_count from unnest(array[d.buyer_user_id,d.listing_user_id]) x;
  select count(*) into accepted_count from public.genz_deal_closeout_acceptances a where a.closeout_id=v_id and a.decision='accepted' and a.user_id in(d.buyer_user_id,d.listing_user_id);
  if accepted_count>=participant_count then
    update public.genz_deal_closeouts set status='confirmed',confirmed_at=now(),updated_at=now() where id=v_id;
    update public.genz_deal_offers set status='superseded',updated_at=now() where deal_id=p_deal_id and status='proposed';
    update public.genz_deals set status='closed',updated_at=now() where id=p_deal_id;
  end if;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label) values('EV-'||replace(gen_random_uuid()::text,'-',''),p_deal_id,v_uid,'closeout_proposed','Closeout proposed · '||replace(p_reason_code,'_',' '));
  return v_id;
end; $$;
revoke execute on function public.genz_propose_deal_closeout(text,text,text,text) from public,anon;
grant execute on function public.genz_propose_deal_closeout(text,text,text,text) to authenticated,service_role;

create or replace function public.genz_respond_deal_closeout(p_closeout_id uuid,p_accept boolean,p_note text default '')
returns text language plpgsql security definer set search_path='pg_catalog','public' as $$
declare c public.genz_deal_closeouts%rowtype; d public.genz_deals%rowtype; v_uid uuid:=auth.uid(); participant_count integer; accepted_count integer;
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into c from public.genz_deal_closeouts where id=p_closeout_id for update;
  if c.id is null then raise exception 'CLOSEOUT_NOT_FOUND'; end if;
  select * into d from public.genz_deals where id=c.deal_id for update;
  if v_uid not in(d.buyer_user_id,d.listing_user_id) and not public.genz_is_admin() then raise exception 'DEAL_CLOSE_DENIED'; end if;
  if c.status<>'proposed' then return c.status; end if;
  insert into public.genz_deal_closeout_acceptances(closeout_id,user_id,decision,note) values(c.id,v_uid,case when p_accept then 'accepted' else 'rejected' end,left(coalesce(p_note,''),800)) on conflict(closeout_id,user_id) do update set decision=excluded.decision,note=excluded.note,updated_at=now();
  if not p_accept then
    update public.genz_deal_closeouts set status='rejected',updated_at=now() where id=c.id;
    insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label) values('EV-'||replace(gen_random_uuid()::text,'-',''),c.deal_id,v_uid,'closeout_rejected','Closeout rejected; deal remains open');
    return 'rejected';
  end if;
  select count(distinct x) into participant_count from unnest(array[d.buyer_user_id,d.listing_user_id]) x;
  select count(*) into accepted_count from public.genz_deal_closeout_acceptances a where a.closeout_id=c.id and a.decision='accepted' and a.user_id in(d.buyer_user_id,d.listing_user_id);
  if accepted_count>=participant_count then
    update public.genz_deal_closeouts set status='confirmed',confirmed_at=now(),updated_at=now() where id=c.id;
    update public.genz_deal_offers set status='superseded',updated_at=now() where deal_id=c.deal_id and status='proposed';
    update public.genz_deals set status='closed',updated_at=now() where id=c.deal_id;
    insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label) values('EV-'||replace(gen_random_uuid()::text,'-',''),c.deal_id,v_uid,'closeout_confirmed','Deal closed · '||replace(c.reason_code,'_',' '));
    return 'confirmed';
  end if;
  return 'proposed';
end; $$;
revoke execute on function public.genz_respond_deal_closeout(uuid,boolean,text) from public,anon;
grant execute on function public.genz_respond_deal_closeout(uuid,boolean,text) to authenticated,service_role;

create or replace function public.genz_sync_closeouts_on_deal_close()
returns trigger language plpgsql security definer set search_path='pg_catalog','public' as $$
begin
  if new.status='closed' and old.status is distinct from 'closed' and exists(select 1 from public.genz_deal_closings c where c.deal_id=new.id and c.status='confirmed') then
    update public.genz_deal_closeouts set status='superseded',updated_at=now() where deal_id=new.id and status='proposed';
  end if;
  return new;
end; $$;
drop trigger if exists genz_deals_sync_closeouts_after_close on public.genz_deals;
create trigger genz_deals_sync_closeouts_after_close after update of status on public.genz_deals for each row execute function public.genz_sync_closeouts_on_deal_close();

drop policy if exists "genz deal evidence participant read" on storage.objects;
create policy "genz deal evidence participant read" on storage.objects for select to authenticated using(
  bucket_id='genz-property-docs' and (storage.foldername(name))[2]='deal' and public.genz_deal_has_permission((storage.foldername(name))[3],'read')
);
