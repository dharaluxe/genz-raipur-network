'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Building2, CheckCircle2, GitMerge, LockKeyhole, MapPinned, RefreshCw, Search, ShieldCheck, XCircle } from 'lucide-react';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';
import { money, nextId, PROPERTY_TYPES } from '@/lib/demo-network';

const input='w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const primary='inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50';
const secondary='inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

type PropertyRow={id:string;title:string;city:string;locality:string|null;property_type:string;size:number;asking:number|string;mandate_status:string;latitude:number|string|null;longitude:number|string|null;master_property_id:string};
type PrivateRow={property_id:string;owner_name:string};
type MandateRow={property_id:string;master_property_id:string;mandate_status:string};
type MasterRow={id:string;master_code:string;status:string};
type Candidate={master_property_id:string;master_code:string;classification:'own_master'|'strong_candidate'|'possible_candidate';match_score:number;city:string;locality:string|null;property_type:string;size:number;active_mandates:number;evidence:string};
type ClaimRow={id:string;property_id:string;candidate_master_id:string;match_score:number;match_reason:string;broker_note:string;status:string;review_note:string;created_at:string;reviewed_at:string|null};
type FormState={title:string;city:string;locality:string;type:string;size:string;asking:string;ownerName:string;ownerPhone:string;latitude:string;longitude:string};
const emptyForm:FormState={title:'',city:'Raipur',locality:'',type:PROPERTY_TYPES[0],size:'1500',asking:'4500000',ownerName:'',ownerPhone:'',latitude:'',longitude:''};

function Pill({status}:{status:string}){const cls=status==='approved'||status==='verified'?'bg-emerald-100 text-emerald-800':status==='pending'?'bg-amber-100 text-amber-800':status==='rejected'?'bg-rose-100 text-rose-800':'bg-slate-100 text-slate-700';return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${cls}`}>{status}</span>;}

export default function MasterPropertyWorkspaceV2(){
  const supabase=useMemo(()=>getSupabaseNetworkClient(),[]);
  const [gate,setGate]=useState<'checking'|'member'|'blocked'>('checking');
  const [uid,setUid]=useState('');
  const [isAdmin,setIsAdmin]=useState(false);
  const [form,setForm]=useState<FormState>(emptyForm);
  const [properties,setProperties]=useState<PropertyRow[]>([]);
  const [privateRows,setPrivateRows]=useState<PrivateRow[]>([]);
  const [mandates,setMandates]=useState<MandateRow[]>([]);
  const [masters,setMasters]=useState<MasterRow[]>([]);
  const [claims,setClaims]=useState<ClaimRow[]>([]);
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [selected,setSelected]=useState('');
  const [checked,setChecked]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});

  const load=useCallback(async()=>{
    setError('');
    const auth=await supabase.auth.getUser();const userId=auth.data.user?.id;
    if(auth.error||!userId){setGate('blocked');return;}
    const profile=await supabase.from('genz_profiles').select('id,is_admin').eq('id',userId).maybeSingle();
    if(profile.error||!profile.data){setGate('blocked');return;}
    setUid(userId);setIsAdmin(Boolean(profile.data.is_admin));setGate('member');
    const [pRes,prRes,mRes,mpRes,cRes]=await Promise.all([
      supabase.from('genz_properties').select('id,title,city,locality,property_type,size,asking,mandate_status,latitude,longitude,master_property_id').eq('listing_user_id',userId).order('updated_at',{ascending:false}),
      supabase.from('genz_property_private').select('property_id,owner_name').eq('listing_user_id',userId),
      supabase.from('genz_property_mandates').select('property_id,master_property_id,mandate_status').eq('broker_user_id',userId),
      supabase.from('genz_master_properties').select('id,master_code,status'),
      supabase.from('genz_property_master_claims').select('id,property_id,candidate_master_id,match_score,match_reason,broker_note,status,review_note,created_at,reviewed_at').order('created_at',{ascending:false}),
    ]);
    for(const r of [pRes,prRes,mRes,mpRes,cRes]) if(r.error) throw r.error;
    setProperties((pRes.data||[]) as PropertyRow[]);setPrivateRows((prRes.data||[]) as PrivateRow[]);setMandates((mRes.data||[]) as MandateRow[]);setMasters((mpRes.data||[]) as MasterRow[]);setClaims((cRes.data||[]) as ClaimRow[]);
  },[supabase]);
  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Could not load properties.'));},[load]);

  const ownerMap=useMemo(()=>new Map(privateRows.map(x=>[x.property_id,x.owner_name])),[privateRows]);
  const mandateMap=useMemo(()=>new Map(mandates.map(x=>[x.property_id,x])),[mandates]);
  const masterMap=useMemo(()=>new Map(masters.map(x=>[x.id,x])),[masters]);

  function values(){
    const size=Number(form.size),asking=Number(form.asking),lat=form.latitude.trim()?Number(form.latitude):null,lng=form.longitude.trim()?Number(form.longitude):null;
    if(!form.title.trim()||!form.city.trim()||!form.type||!form.ownerName.trim()) throw new Error('Title, city, property type and owner name are required.');
    if(!Number.isFinite(size)||size<=0||!Number.isFinite(asking)||asking<=0) throw new Error('Enter valid size and asking price.');
    if(lat!==null&&(!Number.isFinite(lat)||lat< -90||lat>90)) throw new Error('Latitude must be between -90 and 90.');
    if(lng!==null&&(!Number.isFinite(lng)||lng< -180||lng>180)) throw new Error('Longitude must be between -180 and 180.');
    const digits=form.ownerPhone.replace(/\D/g,'');if(digits&&!(digits.length===10||(digits.length===12&&digits.startsWith('91')))) throw new Error('Enter a valid Indian owner mobile or leave it blank.');
    return {size,asking,lat,lng,phone:form.ownerPhone.trim()||null};
  }

  async function check(){
    setBusy(true);setError('');setMessage('');
    try{
      const v=values();
      const {data,error:rpcError}=await supabase.rpc('genz_property_master_candidates',{p_city:form.city.trim(),p_locality:form.locality.trim()||null,p_property_type:form.type,p_size:v.size,p_latitude:v.lat,p_longitude:v.lng,p_owner_phone:v.phone,p_limit:10});
      if(rpcError) throw rpcError;
      const rows=(data||[]) as Candidate[];setCandidates(rows);setChecked(true);
      const own=rows.find(x=>x.classification==='own_master');const strong=rows.find(x=>x.classification==='strong_candidate');setSelected(strong?.master_property_id||'');
      if(own)setMessage(`Existing own mandate found on ${own.master_code}. GENZ will not create another listing for the same broker.`);
      else if(strong)setMessage(`Strong duplicate candidate ${strong.master_code} found. Create the mandate and send it for reviewed merge.`);
      else if(rows.length)setMessage('Possible Master Property matches found. Select one only if it is the same real property.');
      else setMessage('No duplicate candidate found. A new Master Property will be created.');
    }catch(e){setChecked(false);setCandidates([]);setSelected('');setError(e instanceof Error?e.message:'Could not check duplicates.');}
    finally{setBusy(false);}
  }

  async function create(event:FormEvent){
    event.preventDefault();
    if(!checked){await check();return;}
    if(candidates.some(x=>x.classification==='own_master')){setError('A matching Master Property already has your mandate. Edit that listing instead of duplicating it.');return;}
    setBusy(true);setError('');setMessage('');
    try{
      const v=values();const id=nextId('PR');
      const {data,error:rpcError}=await supabase.rpc('genz_create_property_mandate_v2',{
        p_property_id:id,p_title:form.title.trim(),p_city:form.city.trim(),p_locality:form.locality.trim()||null,p_property_type:form.type,p_size:v.size,p_asking:v.asking,
        p_owner_name:form.ownerName.trim(),p_owner_phone:v.phone,p_latitude:v.lat,p_longitude:v.lng,p_candidate_master_id:selected||null,p_merge_note:'Submitted from Master Property workspace',
      });
      if(rpcError) throw rpcError;
      const row=Array.isArray(data)?data[0]:data;
      setMessage(row?.merge_claim_id?`${id} created atomically. Merge review requested; it remains a separate master until approval.`:`${id} created atomically with a new Master Property.`);
      setForm(emptyForm);setCandidates([]);setSelected('');setChecked(false);await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not create property mandate.');}
    finally{setBusy(false);}
  }

  async function review(id:string,decision:'approved'|'rejected'){
    setBusy(true);setError('');setMessage('');
    try{const {error:rpcError}=await supabase.rpc('genz_admin_review_property_master_claim',{p_claim_id:id,p_decision:decision,p_note:reviewNotes[id]||''});if(rpcError)throw rpcError;setMessage(decision==='approved'?'Merge approved: both broker listings are now mandates on one Master Property.':'Merge rejected: listing remains on its separate Master Property.');await load();}
    catch(e){setError(e instanceof Error?e.message:'Could not review claim.');}finally{setBusy(false);}
  }

  if(gate==='checking')return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Checking secure GENZ membership…</div>;
  if(gate==='blocked')return <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><LockKeyhole className="size-7 text-blue-600"/><h1 className="mt-4 text-xl font-bold">Broker sign-in required</h1><p className="mt-2 text-sm text-slate-600">Master Property tools are available only to approved GENZ brokers.</p><Link href="/dashboard" className={`${primary} mt-5`}>Go to secure sign in</Link></div>;

  return <div className="space-y-7">
    <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Master Property</div><h1 className="mt-1 text-3xl font-bold tracking-tight">Properties & Mandates</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">One real property can have multiple broker mandates. Similarity creates a review candidate—never an automatic fuzzy merge.</p></div><button className={secondary} onClick={()=>void load()}><RefreshCw className="size-4"/>Refresh</button></section>
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900"><ShieldCheck className="mr-1 inline size-4"/><b>Private dedupe:</b> owner phone is hashed for comparison and exact GPS is never returned in candidate results. Owner contact remains behind existing Sharing Controls.</div>
    {message&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div>}{error&&<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

    <section className="grid gap-5 xl:grid-cols-[430px_1fr]">
      <form onSubmit={e=>void create(e)} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Add property mandate</h2><p className="mt-1 text-xs text-slate-500">Property + private owner relation + optional merge claim commit atomically.</p><div className="mt-4 grid gap-3">
        <input className={input} required placeholder="Property title" value={form.title} onChange={e=>{setForm({...form,title:e.target.value});setChecked(false);}}/>
        <div className="grid grid-cols-2 gap-3"><input className={input} required placeholder="City" value={form.city} onChange={e=>{setForm({...form,city:e.target.value});setChecked(false);}}/><input className={input} placeholder="Locality" value={form.locality} onChange={e=>{setForm({...form,locality:e.target.value});setChecked(false);}}/></div>
        <select className={input} value={form.type} onChange={e=>{setForm({...form,type:e.target.value});setChecked(false);}}>{PROPERTY_TYPES.map(x=><option key={x}>{x}</option>)}</select>
        <div className="grid grid-cols-2 gap-3"><input className={input} required type="number" min="1" placeholder="Size sqft" value={form.size} onChange={e=>{setForm({...form,size:e.target.value});setChecked(false);}}/><input className={input} required type="number" min="1" placeholder="Asking ₹" value={form.asking} onChange={e=>setForm({...form,asking:e.target.value})}/></div>
        <input className={input} required placeholder="Owner name (private)" value={form.ownerName} onChange={e=>setForm({...form,ownerName:e.target.value})}/><input className={input} inputMode="numeric" placeholder="Owner mobile (private, optional)" value={form.ownerPhone} onChange={e=>{setForm({...form,ownerPhone:e.target.value});setChecked(false);}}/>
        <div className="grid grid-cols-2 gap-3"><input className={input} placeholder="Exact latitude (private)" value={form.latitude} onChange={e=>{setForm({...form,latitude:e.target.value});setChecked(false);}}/><input className={input} placeholder="Exact longitude (private)" value={form.longitude} onChange={e=>{setForm({...form,longitude:e.target.value});setChecked(false);}}/></div>
      </div><button type="button" className={`${secondary} mt-4 w-full`} disabled={busy} onClick={()=>void check()}><Search className="size-4"/>{busy?'Checking…':'Check Master Property duplicates'}</button>
      {checked&&<div className="mt-4 space-y-2">{candidates.map(c=><label key={c.master_property_id} className={`block rounded-xl border p-3 text-xs ${c.classification==='own_master'?'border-amber-200 bg-amber-50':c.classification==='strong_candidate'?'border-emerald-200 bg-emerald-50':'border-slate-200 bg-slate-50'}`}><div className="flex gap-2"><input type="radio" name="master" disabled={c.classification==='own_master'} checked={selected===c.master_property_id} onChange={()=>setSelected(c.master_property_id)}/><div><b>{c.master_code} · {c.match_score}% · {c.classification.replaceAll('_',' ')}</b><div className="mt-1 text-slate-600">{c.locality?`${c.locality}, `:''}{c.city} · {c.property_type} · {c.size} sqft · {c.active_mandates} mandate(s)</div><div className="mt-1 text-slate-500">{c.evidence||'Similarity signals'}</div></div></div></label>)}{candidates.length>0&&!candidates.some(c=>c.classification==='own_master')&&<label className="block rounded-xl border border-slate-200 p-3 text-xs"><input className="mr-2" type="radio" name="master" checked={!selected} onChange={()=>setSelected('')}/><b>Different real property</b> — create a new Master Property.</label>}{!candidates.length&&<div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">No candidate found.</div>}</div>}
      <button className={`${primary} mt-4 w-full`} disabled={busy||!checked||candidates.some(c=>c.classification==='own_master')}><Building2 className="size-4"/>{selected?'Create mandate & request merge':'Create property mandate'}</button></form>

      <div className="space-y-3">{properties.map(p=>{const mandate=mandateMap.get(p.id);const master=masterMap.get(p.master_property_id);const claim=claims.find(c=>c.property_id===p.id);return <article key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:justify-between"><div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{p.id}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{master?.master_code||'Master'}</span><Pill status={mandate?.mandate_status||p.mandate_status}/></div><h3 className="mt-3 text-lg font-bold">{p.title}</h3><p className="mt-1 text-sm text-slate-500">{p.locality?`${p.locality}, `:''}{p.city} · {p.property_type} · {p.size} sqft</p></div><div className="sm:text-right"><b>{money(Number(p.asking))}</b><div className="mt-1 text-xs text-slate-500">Owner: {ownerMap.get(p.id)||'Private'}</div></div></div><div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">{p.latitude!==null&&p.longitude!==null&&<span><MapPinned className="mr-1 inline size-4"/>Exact pin stored privately</span>}<span><ShieldCheck className="mr-1 inline size-4"/>Owner contact protected</span>{claim&&<span><GitMerge className="mr-1 inline size-4"/>Merge: <b className="capitalize">{claim.status}</b> · {claim.match_score}%</span>}</div></article>;})}{!properties.length&&<div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No properties yet.</div>}</div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><GitMerge className="size-5 text-blue-600"/><h2 className="font-bold">Master merge claims</h2></div><div className="mt-4 space-y-3">{claims.map(c=><article key={c.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-3"><div><b>{c.property_id} → {masterMap.get(c.candidate_master_id)?.master_code||'Master candidate'}</b><div className="mt-1 text-xs text-slate-500">{c.match_score}% · {c.match_reason||'Similarity evidence'} · {new Date(c.created_at).toLocaleString('en-IN')}</div></div><Pill status={c.status}/></div>{c.broker_note&&<p className="mt-2 text-sm text-slate-600">Broker: {c.broker_note}</p>}{c.review_note&&<p className="mt-2 text-sm text-slate-600">Review: {c.review_note}</p>}{isAdmin&&c.status==='pending'&&<div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto]"><input className={input} maxLength={600} placeholder="Admin review note" value={reviewNotes[c.id]||''} onChange={e=>setReviewNotes(v=>({...v,[c.id]:e.target.value}))}/><div className="flex gap-2"><button className={primary} disabled={busy} onClick={()=>void review(c.id,'approved')}><CheckCircle2 className="size-4"/>Approve</button><button className={secondary} disabled={busy} onClick={()=>void review(c.id,'rejected')}><XCircle className="size-4"/>Reject</button></div></div>}</article>)}{!claims.length&&<div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No merge claims yet.</div>}</div></section>
    <div className="text-[11px] text-slate-400">Signed-in broker {uid.slice(0,8)}… · candidate results never include raw owner contact or candidate exact GPS.</div>
  </div>;
}
