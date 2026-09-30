drop policy if exists "genz property docs upload" on storage.objects;
create policy "genz property docs upload" on storage.objects
for insert to authenticated
with check (
  bucket_id='genz-property-docs'
  and (select public.genz_is_member())
  and split_part(name,'/',1)=(select auth.uid())::text
  and (
    (
      split_part(name,'/',2)='deal'
      and split_part(name,'/',3)<>''
      and public.genz_deal_has_permission(split_part(name,'/',3),'evidence')
    )
    or (
      split_part(name,'/',2)='closing'
      and split_part(name,'/',3)<>''
      and public.genz_can_access_commission_deal(split_part(name,'/',3))
    )
    or (
      split_part(name,'/',2)='dispute'
      and split_part(name,'/',3)<>''
      and public.genz_can_read_dispute_evidence(name)
    )
    or (
      split_part(name,'/',2) not in ('deal','closing','dispute')
      and split_part(name,'/',2)<>''
      and exists(
        select 1 from public.genz_properties p
        where p.id=split_part(name,'/',2)
          and (p.listing_user_id=(select auth.uid()) or (select public.genz_is_admin()))
      )
    )
  )
);

create or replace function public.genz_register_closing_document(
  p_closing_id uuid,
  p_storage_path text,
  p_document_type text,
  p_original_name text,
  p_mime_type text default 'application/octet-stream',
  p_size_bytes bigint default 0
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  c public.genz_deal_closings%rowtype;
  d public.genz_deals%rowtype;
  document_id uuid;
  expected_prefix text;
begin
  if (select auth.uid()) is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into c from public.genz_deal_closings where id=p_closing_id;
  if not found then raise exception 'CLOSING_NOT_FOUND'; end if;
  select * into d from public.genz_deals where id=c.deal_id;
  if (select auth.uid()) not in (d.buyer_user_id,d.listing_user_id) and not public.genz_is_admin() then raise exception 'DEAL_ACCESS_DENIED'; end if;
  if p_document_type not in ('booking','agreement','registry','builder_booking','invoice','payment_proof','other') then raise exception 'INVALID_DOCUMENT_TYPE'; end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png') then raise exception 'INVALID_DOCUMENT_MIME_TYPE'; end if;
  if p_size_bytes is null or p_size_bytes<1 or p_size_bytes>10485760 then raise exception 'INVALID_DOCUMENT_SIZE'; end if;
  expected_prefix:=(select auth.uid())::text||'/closing/'||c.deal_id||'/';
  if p_storage_path is null or position(expected_prefix in p_storage_path)<>1 then raise exception 'INVALID_STORAGE_PATH'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='genz-property-docs' and o.name=p_storage_path) then raise exception 'STORAGE_OBJECT_NOT_FOUND'; end if;
  insert into public.genz_closing_documents(
    deal_id,closing_id,document_type,storage_path,original_name,mime_type,size_bytes,uploaded_by_user_id
  ) values(
    c.deal_id,c.id,p_document_type,left(coalesce(p_storage_path,''),600),left(coalesce(p_original_name,''),240),p_mime_type,p_size_bytes,(select auth.uid())
  ) returning id into document_id;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label)
  values('EV-'||replace(extensions.gen_random_uuid()::text,'-',''),c.deal_id,(select auth.uid()),'closing_document_added','Closing evidence added: '||left(coalesce(p_document_type,'other'),40));
  return document_id;
end;
$$;

create or replace function public.genz_register_deal_evidence(
  p_deal_id text,
  p_evidence_type text,
  p_title text,
  p_note text default '',
  p_storage_path text default null,
  p_original_name text default '',
  p_mime_type text default '',
  p_size_bytes bigint default 0
)
returns uuid
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare v_uid uuid:=auth.uid(); v_id uuid; expected_prefix text;
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  if not public.genz_deal_has_permission(p_deal_id,'evidence') then raise exception 'DEAL_EVIDENCE_DENIED'; end if;
  if p_evidence_type not in ('note','document','image','visit','offer','payment','other') then raise exception 'INVALID_EVIDENCE_TYPE'; end if;
  if char_length(trim(coalesce(p_title,'')))<1 or char_length(trim(p_title))>160 then raise exception 'INVALID_EVIDENCE_TITLE'; end if;
  if p_evidence_type='note' then
    if p_storage_path is not null and trim(p_storage_path)<>'' then raise exception 'NOTE_CANNOT_HAVE_FILE'; end if;
    if coalesce(p_size_bytes,0)<>0 then raise exception 'INVALID_EVIDENCE_SIZE'; end if;
  else
    if p_size_bytes is null or p_size_bytes<1 or p_size_bytes>10485760 then raise exception 'INVALID_EVIDENCE_SIZE'; end if;
    expected_prefix:=v_uid::text||'/deal/'||p_deal_id||'/';
    if p_storage_path is null or position(expected_prefix in p_storage_path)<>1 then raise exception 'INVALID_EVIDENCE_STORAGE_PATH'; end if;
    if p_mime_type not in ('application/pdf','image/jpeg','image/png') then raise exception 'INVALID_EVIDENCE_MIME_TYPE'; end if;
    if not exists(select 1 from storage.objects o where o.bucket_id='genz-property-docs' and o.name=p_storage_path) then raise exception 'STORAGE_OBJECT_NOT_FOUND'; end if;
  end if;
  insert into public.genz_deal_evidence(deal_id,added_by_user_id,evidence_type,title,note,storage_path,original_name,mime_type,size_bytes)
  values(p_deal_id,v_uid,p_evidence_type,left(trim(p_title),160),left(coalesce(p_note,''),1200),nullif(p_storage_path,''),left(coalesce(p_original_name,''),240),left(coalesce(p_mime_type,''),120),coalesce(p_size_bytes,0)) returning id into v_id;
  insert into public.genz_deal_events(id,deal_id,actor_user_id,event_type,label) values('EV-'||replace(gen_random_uuid()::text,'-',''),p_deal_id,v_uid,'evidence_added','Evidence added · '||left(trim(p_title),100));
  return v_id;
end;
$$;

create or replace function public.genz_register_deal_dispute_evidence(
  p_dispute_id uuid,
  p_title text,
  p_note text,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare
  v_uid uuid:=auth.uid();
  v_dispute public.genz_deal_disputes%rowtype;
  v_title text:=trim(coalesce(p_title,''));
  v_note text:=trim(coalesce(p_note,''));
  v_name text:=trim(coalesce(p_original_name,''));
  v_path text:=trim(coalesce(p_storage_path,''));
  v_id uuid;
  v_case_id uuid;
  v_other uuid;
begin
  if v_uid is null or not public.genz_is_member() then raise exception 'GENZ_MEMBER_REQUIRED'; end if;
  select * into v_dispute from public.genz_deal_disputes where id=p_dispute_id for update;
  if v_dispute.id is null then raise exception 'DISPUTE_NOT_FOUND'; end if;
  if v_uid not in (v_dispute.raised_by_user_id,v_dispute.against_user_id) and not public.genz_is_admin() then raise exception 'DISPUTE_ACCESS_DENIED'; end if;
  if v_dispute.status not in ('open','in_review') then raise exception 'DISPUTE_CLOSED'; end if;
  if char_length(v_title)<1 or char_length(v_title)>160 then raise exception 'EVIDENCE_TITLE_LENGTH'; end if;
  if char_length(v_note)>1200 then raise exception 'EVIDENCE_NOTE_LENGTH'; end if;
  if char_length(v_name)<1 or char_length(v_name)>240 then raise exception 'EVIDENCE_NAME_LENGTH'; end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png') then raise exception 'EVIDENCE_MIME_NOT_ALLOWED'; end if;
  if p_size_bytes is null or p_size_bytes<1 or p_size_bytes>10485760 then raise exception 'EVIDENCE_SIZE_INVALID'; end if;
  if split_part(v_path,'/',1)<>v_uid::text or split_part(v_path,'/',2)<>'dispute' or split_part(v_path,'/',3)<>p_dispute_id::text then raise exception 'EVIDENCE_PATH_INVALID'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='genz-property-docs' and o.name=v_path) then raise exception 'STORAGE_OBJECT_NOT_FOUND'; end if;
  insert into public.genz_dispute_evidence(dispute_id,uploaded_by_user_id,title,note,storage_path,original_name,mime_type,size_bytes)
  values(p_dispute_id,v_uid,v_title,v_note,v_path,v_name,p_mime_type,p_size_bytes)
  returning id into v_id;
  select c.id into v_case_id from public.genz_admin_cases c where c.case_type='deal_dispute' and c.source_id=p_dispute_id::text;
  if v_case_id is not null then
    update public.genz_admin_cases set updated_at=now() where id=v_case_id;
    insert into public.genz_admin_case_events(case_id,actor_user_id,event_type,note)
    values(v_case_id,v_uid,'evidence_added',left(v_title,2000));
  end if;
  v_other:=case when v_uid=v_dispute.raised_by_user_id then v_dispute.against_user_id else v_dispute.raised_by_user_id end;
  if v_other is not null and v_other<>v_uid then
    perform public.genz_emit_notification(v_other,'system','Dispute evidence added','New private evidence was added for Deal Room '||v_dispute.deal_id||'.','deal_dispute',p_dispute_id::text,'/disputes','action','deal-dispute-evidence:'||v_id::text||':'||v_other::text);
  end if;
  return v_id;
end;
$$;

revoke execute on function public.genz_register_closing_document(uuid,text,text,text,text,bigint) from public,anon;
revoke execute on function public.genz_register_deal_evidence(text,text,text,text,text,text,text,bigint) from public,anon;
revoke execute on function public.genz_register_deal_dispute_evidence(uuid,text,text,text,text,text,bigint) from public,anon;
grant execute on function public.genz_register_closing_document(uuid,text,text,text,text,bigint) to authenticated,service_role;
grant execute on function public.genz_register_deal_evidence(text,text,text,text,text,text,text,bigint) to authenticated,service_role;
grant execute on function public.genz_register_deal_dispute_evidence(uuid,text,text,text,text,text,bigint) to authenticated,service_role;
