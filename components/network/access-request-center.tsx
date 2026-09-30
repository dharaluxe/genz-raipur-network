'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, LockKeyhole, RefreshCw, Send, ShieldCheck, XCircle } from 'lucide-react';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';

const inputClass='w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const primaryButton='inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50';
const secondaryButton='inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

type Supply={property_id:string;headline:string;city:string;locality:string|null;property_type:string;size:number;listing_broker_code:string;listing_broker_name:string;listing_broker_firm:string;is_own_listing:boolean;has_active_share:boolean};
type MyRequest={request_id:string;property_id:string;property_headline:string;property_city:string;property_locality:string|null;property_type:string;source_broker_code:string;source_broker_name:string;source_broker_firm:string;status:string;request_price:boolean;request_photos:boolean;request_videos:boolean;request_approx_location:boolean;request_exact_location:boolean;request_documents:boolean;request_owner_contact:boolean;request_download:boolean;requester_note:string;review_note:string;approved_grant_id:string|null;created_at:string;reviewed_at:string|null};
type IncomingRequest={request_id:string;property_id:string;property_headline:string;requester_broker_code:string;requester_name:string;requester_firm:string;requester_verified:boolean;requester_rating:number|string;requester_review_count:number;status:string;request_price:boolean;request_photos:boolean;request_videos:boolean;request_approx_location:boolean;request_exact_location:boolean;request_documents:boolean;request_owner_contact:boolean;request_download:boolean;requester_note:string;review_note:string;approved_grant_id:string|null;created_at:string;reviewed_at:string|null};

type PermissionKey='price'|'photos'|'videos'|'approx'|'exact'|'documents'|'owner'|'download';
const permissionLabels:Record<PermissionKey,string>={price:'Price',photos:'Photos',videos:'Videos',approx:'Approx location',exact:'Exact pin',documents:'Documents',owner:'Owner contact',download:'Download'};
const defaultPermissions:Record<PermissionKey,boolean>={price:true,photos:true,videos:false,approx:false,exact:false,documents:false,owner:false,download:false};

function requestedLabels(row:MyRequest|IncomingRequest){
  const pairs:[PermissionKey,boolean][]=[['price',row.request_price],['photos',row.request_photos],['videos',row.request_videos],['approx',row.request_approx_location],['exact',row.request_exact_location],['documents',row.request_documents],['owner',row.request_owner_contact],['download',row.request_download]];
  return pairs.filter(([,yes])=>yes).map(([key])=>permissionLabels[key]);
}

function StatusPill({status}:{status:string}){
  const cls=status==='approved'?'bg-emerald-100 text-emerald-800':status==='rejected'?'bg-rose-100 text-rose-800':status==='pending'?'bg-amber-100 text-amber-800':'bg-slate-100 text-slate-700';
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${cls}`}>{status}</span>;
}

export default function AccessRequestCenter(){
  const supabase=useMemo(()=>getSupabaseNetworkClient(),[]);
  const [gate,setGate]=useState<'checking'|'member'|'blocked'>('checking');
  const [supply,setSupply]=useState<Supply[]>([]);
  const [mine,setMine]=useState<MyRequest[]>([]);
  const [incoming,setIncoming]=useState<IncomingRequest[]>([]);
  const [propertyId,setPropertyId]=useState('');
  const [permissions,setPermissions]=useState(defaultPermissions);
  const [note,setNote]=useState('');
  const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
  const [expiryDays,setExpiryDays]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [tab,setTab]=useState<'request'|'mine'|'incoming'>('request');

  const load=useCallback(async()=>{
    setMessage('');
    try{
      const auth=await supabase.auth.getUser();
      const uid=auth.data.user?.id;
      if(auth.error||!uid){setGate('blocked');return;}
      const member=await supabase.from('genz_profiles').select('id').eq('id',uid).maybeSingle();
      if(member.error||!member.data){setGate('blocked');return;}
      setGate('member');
      const [supplyRes,mineRes,incomingRes]=await Promise.all([
        supabase.rpc('genz_discover_property_supply',{p_query:null,p_city:null,p_property_type:null,p_limit:100}),
        supabase.rpc('genz_list_my_listing_access_requests'),
        supabase.rpc('genz_list_incoming_listing_access_requests'),
      ]);
      if(supplyRes.error)throw supplyRes.error;if(mineRes.error)throw mineRes.error;if(incomingRes.error)throw incomingRes.error;
      setSupply(((supplyRes.data||[]) as Supply[]).filter(x=>!x.is_own_listing));
      setMine((mineRes.data||[]) as MyRequest[]);
      setIncoming((incomingRes.data||[]) as IncomingRequest[]);
      if(!propertyId){const first=((supplyRes.data||[]) as Supply[]).find(x=>!x.is_own_listing);if(first)setPropertyId(first.property_id);}
    }catch(error){setMessage(error instanceof Error?error.message:'Could not load access requests.');}
  },[supabase,propertyId]);

  useEffect(()=>{void load();},[load]);

  async function submitRequest(){
    if(!propertyId){setMessage('Select a property first.');return;}
    if(!Object.values(permissions).some(Boolean)){setMessage('Select at least one access permission.');return;}
    setBusy(true);setMessage('');
    try{
      const {error}=await supabase.rpc('genz_request_listing_access',{
        p_property_id:propertyId,p_request_price:permissions.price,p_request_photos:permissions.photos,p_request_videos:permissions.videos,
        p_request_approx_location:permissions.approx,p_request_exact_location:permissions.exact,p_request_documents:permissions.documents,
        p_request_owner_contact:permissions.owner,p_request_download:permissions.download,p_note:note,
      });
      if(error)throw error;
      setMessage('Access request sent to the listing broker.');setNote('');setTab('mine');await load();
    }catch(error){setMessage(error instanceof Error?error.message:'Could not send access request.');}finally{setBusy(false);}
  }

  async function withdraw(id:string){
    setBusy(true);setMessage('');try{const {error}=await supabase.rpc('genz_withdraw_listing_access_request',{p_request_id:id});if(error)throw error;setMessage('Pending request withdrawn.');await load();}catch(error){setMessage(error instanceof Error?error.message:'Could not withdraw request.');}finally{setBusy(false);}
  }

  async function review(id:string,decision:'approved'|'rejected'){
    setBusy(true);setMessage('');
    try{
      const days=Math.max(1,Math.min(30,Number(expiryDays[id]||7)));
      const expires=decision==='approved'?new Date(Date.now()+days*86400000).toISOString():null;
      const {error}=await supabase.rpc('genz_review_listing_access_request',{p_request_id:id,p_decision:decision,p_note:reviewNotes[id]||'',p_expires_at:expires});
      if(error)throw error;
      setMessage(decision==='approved'?`Access approved for ${days} day${days===1?'':'s'}.`:'Access request rejected.');await load();
    }catch(error){setMessage(error instanceof Error?error.message:'Could not review request.');}finally{setBusy(false);}
  }

  if(gate==='checking')return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Checking secure GENZ membership…</div>;
  if(gate==='blocked')return <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><LockKeyhole className="size-7 text-blue-600"/><h1 className="mt-4 text-xl font-bold">Broker sign-in required</h1><p className="mt-2 text-sm text-slate-600">Access requests are available only to approved GENZ brokers.</p><Link href="/dashboard" className={`${primaryButton} mt-5`}>Go to secure sign in</Link></div>;

  return <div className="space-y-7">
    <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-3xl font-bold tracking-tight">Access Requests</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Request only the protected property information you need. Nothing unlocks until the listing broker explicitly approves it.</p></div><button className={secondaryButton} onClick={()=>void load()}><RefreshCw className="size-4"/>Refresh</button></section>
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900"><ShieldCheck className="mr-1 inline size-4"/><b>Controlled release:</b> approved requests become the same audited, expiring Sharing Control grant used for price, media, exact pin, documents and owner contact.</div>
    {message&&<div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{message}</div>}

    <div className="flex flex-wrap gap-2"><button className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab==='request'?'bg-slate-950 text-white':'bg-slate-100 text-slate-700'}`} onClick={()=>setTab('request')}>Request access</button><button className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab==='mine'?'bg-slate-950 text-white':'bg-slate-100 text-slate-700'}`} onClick={()=>setTab('mine')}>My requests ({mine.length})</button><button className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab==='incoming'?'bg-slate-950 text-white':'bg-slate-100 text-slate-700'}`} onClick={()=>setTab('incoming')}>Incoming ({incoming.filter(x=>x.status==='pending').length})</button></div>

    {tab==='request'&&<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Request protected listing access</h2><div className="mt-4 grid gap-4 lg:grid-cols-2"><div><label className="text-xs font-semibold text-slate-600">Property</label><select className={`${inputClass} mt-1`} value={propertyId} onChange={e=>setPropertyId(e.target.value)}><option value="">Select a network property</option>{supply.map(x=><option key={x.property_id} value={x.property_id}>{x.property_id} · {x.headline} · {x.listing_broker_name}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-600">Note to listing broker</label><input className={`${inputClass} mt-1`} maxLength={600} value={note} onChange={e=>setNote(e.target.value)} placeholder="Why you need this access / buyer context"/></div></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{(Object.keys(permissionLabels) as PermissionKey[]).map(key=><label key={key} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><input type="checkbox" checked={permissions[key]} onChange={e=>setPermissions(v=>({...v,[key]:e.target.checked}))}/>{permissionLabels[key]}</label>)}</div><button className={`${primaryButton} mt-4`} disabled={busy||!propertyId} onClick={()=>void submitRequest()}><Send className="size-4"/>{busy?'Sending…':'Send access request'}</button></section>}

    {tab==='mine'&&<section className="grid gap-4">{mine.map(row=><article key={row.request_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">{row.property_headline}</h2><p className="mt-1 text-xs text-slate-500">{row.property_id} · {row.property_locality?`${row.property_locality}, `:''}{row.property_city} · {row.source_broker_name} / {row.source_broker_code}</p></div><StatusPill status={row.status}/></div><div className="mt-3 flex flex-wrap gap-2">{requestedLabels(row).map(x=><span key={x} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{x}</span>)}</div>{row.requester_note&&<p className="mt-3 text-sm text-slate-600">Your note: {row.requester_note}</p>}{row.review_note&&<p className="mt-2 text-sm text-slate-600">Broker response: {row.review_note}</p>}<div className="mt-4 flex gap-2">{row.status==='pending'&&<button className={secondaryButton} disabled={busy} onClick={()=>void withdraw(row.request_id)}><XCircle className="size-4"/>Withdraw</button>}{row.status==='approved'&&row.approved_grant_id&&<Link href="/sharing" className={secondaryButton}><CheckCircle2 className="size-4"/>Open shared access</Link>}</div></article>)}{mine.length===0&&<div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">You have not requested protected property access yet.</div>}</section>}

    {tab==='incoming'&&<section className="grid gap-4">{incoming.map(row=><article key={row.request_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">{row.property_headline}</h2><p className="mt-1 text-xs text-slate-500">{row.property_id} · requested by {row.requester_name} / {row.requester_broker_code} · ★ {Number(row.requester_rating||0).toFixed(1)} ({row.requester_review_count||0})</p></div><StatusPill status={row.status}/></div><div className="mt-3 flex flex-wrap gap-2">{requestedLabels(row).map(x=><span key={x} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{x}</span>)}</div>{row.requester_note&&<p className="mt-3 text-sm text-slate-600">Broker note: {row.requester_note}</p>}{row.status==='pending'&&<div className="mt-4 grid gap-3 lg:grid-cols-[120px_1fr_auto]"><div><label className="text-xs font-semibold text-slate-600">Access days</label><input className={`${inputClass} mt-1`} type="number" min={1} max={30} value={expiryDays[row.request_id]||'7'} onChange={e=>setExpiryDays(v=>({...v,[row.request_id]:e.target.value}))}/></div><div><label className="text-xs font-semibold text-slate-600">Decision note</label><input className={`${inputClass} mt-1`} maxLength={600} value={reviewNotes[row.request_id]||''} onChange={e=>setReviewNotes(v=>({...v,[row.request_id]:e.target.value}))} placeholder="Optional reason / conditions"/></div><div className="flex items-end gap-2"><button className={primaryButton} disabled={busy} onClick={()=>void review(row.request_id,'approved')}><CheckCircle2 className="size-4"/>Approve</button><button className={secondaryButton} disabled={busy} onClick={()=>void review(row.request_id,'rejected')}><XCircle className="size-4"/>Reject</button></div></div>}{row.status!=='pending'&&<p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Clock3 className="size-4"/>Reviewed {row.reviewed_at?new Date(row.reviewed_at).toLocaleString('en-IN'):'—'}{row.review_note?` · ${row.review_note}`:''}</p>}</article>)}{incoming.length===0&&<div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No incoming listing access requests.</div>}</section>}
  </div>;
}
