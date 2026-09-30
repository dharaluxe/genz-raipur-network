'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Building2, CheckCircle2, Clock3, GitMerge, LockKeyhole, MapPinned, RefreshCw, Search, ShieldCheck, XCircle } from 'lucide-react';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';
import { money, nextId, PROPERTY_TYPES } from '@/lib/demo-network';

const inputClass='w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const primaryButton='inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton='inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

type PropertyRow={id:string;listing_user_id:string;title:string;city:string;locality:string|null;property_type:string;size:number;asking:number|string;owner_label:string;mandate_status:string;status:string;latitude:number|string|null;longitude:number|string|null;master_property_id:string;created_at:string;updated_at:string};
type PrivateRow={property_id:string;owner_name:string;owner_phone_e164:string|null};
type MandateRow={property_id:string;master_property_id:string;mandate_status:string;valid_until:string|null};
type MasterRow={id:string;master_code:string;status:string};
type Candidate={master_property_id:string;master_code:string;classification:'own_master'|'strong_candidate'|'possible_candidate';match_score:number;city:string;locality:string|null;property_type:string;size:number;active_mandates:number;evidence:string};
type ClaimRow={id:string;property_id:string;current_master_id:string;candidate_master_id:string;requested_by_user_id:string;match_score:number;match_reason:string;broker_note:string;status:string;review_note:string;created_at:string;reviewed_at:string|null};

type FormState={title:string;city:string;locality:string;type:string;size:string;asking:string;ownerName:string;ownerPhone:string;latitude:string;longitude:string};
const defaultForm:FormState={title:'',city:'Raipur',locality:'',type:PROPERTY_TYPES[0],size:'1500',asking:'4500000',ownerName:'',ownerPhone:'',latitude:'',longitude:''};

function statusPill(status:string){
  const cls=status==='approved'||status==='verified'?'bg-emerald-100 text-emerald-800':status==='pending'?'bg-amber-100 text-amber-800':status==='rejected'?'bg-rose-100 text-rose-800':'bg-slate-100 text-slate-700';
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${cls}`}>{status}</span>;
}

export default function MasterPropertyWorkspace(){
  const supabase=useMemo(()=>getSupabaseNetworkClient(),[]);
  const [gate,setGate]=useState<'checking'|'member'|'blocked'>('checking');
  const [uid,setUid]=useState('');
  const [isAdmin,setIsAdmin]=useState(false);
  const [properties,setProperties]=useState<PropertyRow[]>([]);
  const [privateRows,setPrivateRows]=useState<PrivateRow[]>([]);
  const [mandates,setMandates]=useState<MandateRow[]>([]);
  const [masters,setMasters]=useState<MasterRow[]>([]);
  const [claims,setClaims]=useState<ClaimRow[]>([]);
  const [form,setForm]=useState<FormState>(defaultForm);
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [selectedCandidate,setSelectedCandidate]=useState('');
  const [checked,setChecked]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [adminNotes,setAdminNotes]=useState<Record<string,string>>({});

  const load=useCallback(async()=>{
    setError('');
    const auth=await supabase.auth.getUser();
    const activeUid=auth.data.user?.id;
    if(auth.error||!activeUid){setGate('blocked');return;}
    const profile=await supabase.from('genz_profiles').select('id,is_admin').eq('id',activeUid).maybeSingle();
    if(profile.error||!profile.data){setGate('blocked');return;}
    setUid(activeUid);setIsAdmin(Boolean(profile.data.is_admin));setGate('member');
    const [propertyRes,privateRes,mandateRes,masterRes,claimRes]=await Promise.all([
      supabase.from('genz_properties').select('id,listing_user_id,title,city,locality,property_type,size,asking,owner_label,mandate_status,status,latitude,longitude,master_property_id,created_at,updated_at').eq('listing_user_id',activeUid).order('updated_at',{ascending:false}),
      supabase.from('genz_property_private').select('property_id,owner_name,owner_phone_e164').eq('listing_user_id',activeUid),
      supabase.from('genz_property_mandates').select('property_id,master_property_id,mandate_status,valid_until').eq('broker_user_id',activeUid),
      supabase.from('genz_master_properties').select('id,master_code,status'),
      supabase.from('genz_property_master_claims').select('id,property_id,current_master_id,candidate_master_id,requested_by_user_id,match_score,match_reason,broker_note,status,review_note,created_at,reviewed_at').order('created_at',{ascending:false}),
    ]);
    for(const result of [propertyRes,privateRes,mandateRes,masterRes,claimRes]) if(result.error) throw result.error;
    setProperties((propertyRes.data||[]) as PropertyRow[]);
    setPrivateRows((privateRes.data||[]) as PrivateRow[]);
    setMandates((mandateRes.data||[]) as MandateRow[]);
    setMasters((masterRes.data||[]) as MasterRow[]);
    setClaims((claimRes.data||[]) as ClaimRow[]);
  },[supabase]);

  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Could not load properties.'));},[load]);

  const privateByProperty=useMemo(()=>new Map(privateRows.map(x=>[x.property_id,x])),[privateRows]);
  const mandateByProperty=useMemo(()=>new Map(mandates.map(x=>[x.property_id,x])),[mandates]);
  const masterById=useMemo(()=>new Map(masters.map(x=>[x.id,x])),[masters]);

  function parsedForm(){
    const size=Number(form.size),asking=Number(form.asking);
    const latitude=form.latitude.trim()===''?null:Number(form.latitude);
    const longitude=form.longitude.trim()===''?null:Number(form.longitude);
    if(!form.title.trim()||!form.city.trim()||!form.type.trim()||!form.ownerName.trim()) throw new Error('Title, city, property type and owner name are required.');
    if(!Number.isFinite(size)||size<=0) throw new Error('Enter a valid property size.');
    if(!Number.isFinite(asking)||asking<=0) throw new Error('Enter a valid asking price.');
    if(latitude!==null&&(!Number.isFinite(latitude)||latitude < -90||latitude > 90)) throw new Error('Latitude must be between -90 and 90.');
    if(longitude!==null&&(!Number.isFinite(longitude)||longitude < -180||longitude > 180)) throw new Error('Longitude must be between -180 and 180.');
    const ownerDigits=form.ownerPhone.replace(/\D/g,'');
    if(ownerDigits&&!(ownerDigits.length===10||ownerDigits.length===12)) throw new Error('Enter a valid owner mobile number or leave it blank.');
    return {size,asking,latitude,longitude,ownerPhone:form.ownerPhone.trim()||null};
  }

  async function checkDuplicates(){
    setBusy(true);setError('');setMessage('');
    try{
      const p=parsedForm();
      const {data,error:rpcError}=await supabase.rpc('genz_property_master_candidates',{
        p_city:form.city.trim(),p_locality:form.locality.trim()||null,p_property_type:form.type,p_size:p.size,
        p_latitude:p.latitude,p_longitude:p.longitude,p_owner_phone:p.ownerPhone,p_limit:10,
      });
      if(rpcError) throw rpcError;
      const rows=(data||[]) as Candidate[];
      setCandidates(rows);setChecked(true);
      const own=rows.find(x=>x.classification==='own_master');
      const strong=rows.find(x=>x.classification==='strong_candidate');
      setSelectedCandidate(strong?.master_property_id||'');
      if(own) setMessage(`You already have a mandate/listing connected to ${own.master_code}. Review your existing listing instead of creating a duplicate.`);
      else if(strong) setMessage(`Strong duplicate candidate found: ${strong.master_code}. New listing can be created as a separate mandate and sent for merge review.`);
      else if(rows.length) setMessage('Possible matching Master Properties found. Select one only if it appears to be the same real property.');
      else setMessage('No matching Master Property found. A new Master Property will be created with this listing.');
    }catch(e){setError(e instanceof Error?e.message:'Could not check duplicates.');setChecked(false);}
    finally{setBusy(false);}
  }

  async function createProperty(event?:FormEvent){
    event?.preventDefault();
    if(!checked){await checkDuplicates();return;}
    if(candidates.some(x=>x.classification==='own_master')){setError('You already have a listing/mandate on a matching Master Property. Open that existing property instead of duplicating it.');return;}
    setBusy(true);setError('');setMessage('');
    try{
      const p=parsedForm();
      const id=nextId('PR');
      const {error:propertyError}=await supabase.from('genz_properties').insert({
        id,listing_user_id:uid,title:form.title.trim(),city:form.city.trim(),locality:form.locality.trim()||null,
        property_type:form.type,size:p.size,asking:p.asking,owner_label:'Owner protected',mandate_status:'pending',status:'active',
        latitude:p.latitude,longitude:p.longitude,
      });
      if(propertyError) throw propertyError;
      const {error:privateError}=await supabase.from('genz_property_private').insert({
        property_id:id,listing_user_id:uid,owner_name:form.ownerName.trim(),owner_phone_e164:p.ownerPhone,
      });
      if(privateError) throw privateError;
      if(selectedCandidate){
        const {error:claimError}=await supabase.rpc('genz_request_property_master_merge',{p_property_id:id,p_candidate_master_id:selectedCandidate,p_note:'Submitted from Master Property workspace'});
        if(claimError) throw claimError;
        setMessage(`${id} created. Duplicate merge review sent; listing remains separate until approved.`);
      }else{
        setMessage(`${id} created with a new Master Property.`);
      }
      setForm(defaultForm);setCandidates([]);setSelectedCandidate('');setChecked(false);await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not create property.');}
    finally{setBusy(false);}
  }

  async function reviewClaim(id:string,decision:'approved'|'rejected'){
    setBusy(true);setError('');setMessage('');
    try{
      const {error:rpcError}=await supabase.rpc('genz_admin_review_property_master_claim',{p_claim_id:id,p_decision:decision,p_note:adminNotes[id]||''});
      if(rpcError) throw rpcError;
      setMessage(decision==='approved'?'Master merge approved. The broker listing is now another mandate on the existing Master Property.':'Master merge rejected. The broker listing keeps its separate Master Property.');
      await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not review merge claim.');}
    finally{setBusy(false);}
  }

  if(gate==='checking') return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Checking secure GENZ membership…</div>;
  if(gate==='blocked') return <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><LockKeyhole className="size-7 text-blue-600"/><h1 className="mt-4 text-xl font-bold">Broker sign-in required</h1><p className="mt-2 text-sm text-slate-600">Master Property tools are available only to approved GENZ brokers.</p><Link href="/dashboard" className={`${primaryButton} mt-5`}>Go to secure sign in</Link></div>;

  return <div className="space-y-7">
    <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Master Property</div><h1 className="mt-1 text-3xl font-bold tracking-tight">Properties & Mandates</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">One real property can have multiple authorized broker mandates. GENZ detects likely duplicates without exposing another broker's owner contact or exact stored pin.</p></div><button className={secondaryButton} onClick={()=>void load()}><RefreshCw className="size-4"/>Refresh</button></section>
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900"><ShieldCheck className="mr-1 inline size-4"/><b>No fuzzy auto-merge:</b> location, size, locality and hashed owner signals only produce candidates. Different brokers remain separate until a reviewed merge is approved.</div>
    {message&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div>}
    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

    <section className="grid gap-5 xl:grid-cols-[430px_1fr]">
      <form onSubmit={(e)=>void createProperty(e)} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Add property mandate</h2><p className="mt-1 text-xs text-slate-500">Check Master Property candidates before creating a listing.</p><div className="mt-4 grid gap-3">
        <div><label className="text-xs font-semibold text-slate-600">Property title</label><input required className={`${inputClass} mt-1`} value={form.title} onChange={e=>{setForm({...form,title:e.target.value});setChecked(false);}} placeholder="1500 sqft plot, Kamal Vihar"/></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-slate-600">City</label><input required className={`${inputClass} mt-1`} value={form.city} onChange={e=>{setForm({...form,city:e.target.value});setChecked(false);}}/></div><div><label className="text-xs font-semibold text-slate-600">Locality</label><input className={`${inputClass} mt-1`} value={form.locality} onChange={e=>{setForm({...form,locality:e.target.value});setChecked(false);}}/></div></div>
        <div><label className="text-xs font-semibold text-slate-600">Property type</label><select className={`${inputClass} mt-1`} value={form.type} onChange={e=>{setForm({...form,type:e.target.value});setChecked(false);}}>{PROPERTY_TYPES.map(x=><option key={x}>{x}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-slate-600">Size (sqft)</label><input required type="number" min="1" className={`${inputClass} mt-1`} value={form.size} onChange={e=>{setForm({...form,size:e.target.value});setChecked(false);}}/></div><div><label className="text-xs font-semibold text-slate-600">Asking price (₹)</label><input required type="number" min="1" className={`${inputClass} mt-1`} value={form.asking} onChange={e=>setForm({...form,asking:e.target.value})}/></div></div>
        <div><label className="text-xs font-semibold text-slate-600">Owner name (private)</label><input required className={`${inputClass} mt-1`} value={form.ownerName} onChange={e=>setForm({...form,ownerName:e.target.value})}/></div>
        <div><label className="text-xs font-semibold text-slate-600">Owner mobile (private, optional but improves dedupe)</label><input inputMode="numeric" className={`${inputClass} mt-1`} value={form.ownerPhone} onChange={e=>{setForm({...form,ownerPhone:e.target.value});setChecked(false);}} placeholder="10-digit mobile"/></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-slate-600">Exact latitude (private)</label><input className={`${inputClass} mt-1`} value={form.latitude} onChange={e=>{setForm({...form,latitude:e.target.value});setChecked(false);}} placeholder="optional"/></div><div><label className="text-xs font-semibold text-slate-600">Exact longitude (private)</label><input className={`${inputClass} mt-1`} value={form.longitude} onChange={e=>{setForm({...form,longitude:e.target.value});setChecked(false);}} placeholder="optional"/></div></div>
      </div>
      <button type="button" className={`${secondaryButton} mt-4 w-full`} disabled={busy} onClick={()=>void checkDuplicates()}><Search className="size-4"/>{busy?'Checking…':'Check duplicate / Master Property'}</button>
      {checked&&<div className="mt-4 space-y-2">{candidates.map(c=><label key={c.master_property_id} className={`block rounded-xl border p-3 text-xs ${c.classification==='own_master'?'border-amber-200 bg-amber-50':c.classification==='strong_candidate'?'border-emerald-200 bg-emerald-50':'border-slate-200 bg-slate-50'}`}><div className="flex items-start gap-2"><input type="radio" name="candidate" disabled={c.classification==='own_master'} checked={selectedCandidate===c.master_property_id} onChange={()=>setSelectedCandidate(c.master_property_id)}/><div><div className="font-bold">{c.master_code} · {c.match_score}% · {c.classification.replaceAll('_',' ')}</div><div className="mt-1 text-slate-600">{c.locality?`${c.locality}, `:''}{c.city} · {c.property_type} · {c.size} sqft · {c.active_mandates} active mandate(s)</div><div className="mt-1 text-slate-500">{c.evidence||'Similarity signals only'}</div></div></div></label>)}{candidates.length>0&&!candidates.some(c=>c.classification==='own_master')&&<label className="block rounded-xl border border-slate-200 p-3 text-xs"><input className="mr-2" type="radio" name="candidate" checked={selectedCandidate===''} onChange={()=>setSelectedCandidate('')}/><b>This is a different property</b> — keep a separate Master Property.</label>}{candidates.length===0&&<div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">No candidate found. A new Master Property will be created.</div>}</div>}
      <button className={`${primaryButton} mt-4 w-full`} disabled={busy||!checked||candidates.some(c=>c.classification==='own_master')}><Building2 className="size-4"/>{selectedCandidate?'Create mandate & request merge':'Create property mandate'}</button>
      </form>

      <div className="space-y-3">{properties.map(p=>{const priv=privateByProperty.get(p.id);const mandate=mandateByProperty.get(p.id);const master=masterById.get(p.master_property_id);const claim=claims.find(c=>c.property_id===p.id);return <article key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{p.id}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{master?.master_code||'Master pending'}</span>{statusPill(mandate?.mandate_status||p.mandate_status)}</div><h3 className="mt-3 text-lg font-bold">{p.title}</h3><p className="mt-1 text-sm text-slate-500">{p.locality?`${p.locality}, `:''}{p.city} · {p.property_type} · {p.size} sqft</p></div><div className="sm:text-right"><b>{money(Number(p.asking))}</b><div className="mt-1 text-xs text-slate-500">Owner: {priv?.owner_name||'Private'}</div></div></div><div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">{p.latitude!==null&&p.longitude!==null&&<span><MapPinned className="mr-1 inline size-4"/>Exact pin stored privately</span>}<span><ShieldCheck className="mr-1 inline size-4"/>Owner contact protected</span>{claim&&<span><GitMerge className="mr-1 inline size-4"/>Merge claim: <b className="capitalize">{claim.status}</b>{claim.match_score?` · ${claim.match_score}%`:''}</span>}</div></article>;})}{properties.length===0&&<div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No properties yet.</div>}</div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><GitMerge className="size-5 text-blue-600"/><h2 className="font-bold">Master merge claims</h2></div><p className="mt-1 text-xs text-slate-500">Brokers see their own claims. Admin can review network claims using evidence signals; approval never exposes another owner's phone.</p><div className="mt-4 space-y-3">{claims.map(c=><div key={c.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold">{c.property_id} → {masterById.get(c.candidate_master_id)?.master_code||'Master candidate'}</div><div className="mt-1 text-xs text-slate-500">Score {c.match_score}% · {c.match_reason||'Similarity evidence'} · {new Date(c.created_at).toLocaleString('en-IN')}</div></div>{statusPill(c.status)}</div>{c.broker_note&&<div className="mt-2 text-sm text-slate-600">Broker note: {c.broker_note}</div>}{c.review_note&&<div className="mt-2 text-sm text-slate-600">Review: {c.review_note}</div>}{isAdmin&&c.status==='pending'&&<div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto]"><input className={inputClass} maxLength={600} value={adminNotes[c.id]||''} onChange={e=>setAdminNotes(v=>({...v,[c.id]:e.target.value}))} placeholder="Admin review note"/><div className="flex gap-2"><button className={primaryButton} disabled={busy} onClick={()=>void reviewClaim(c.id,'approved')}><CheckCircle2 className="size-4"/>Approve</button><button className={secondaryButton} disabled={busy} onClick={()=>void reviewClaim(c.id,'rejected')}><XCircle className="size-4"/>Reject</button></div></div>}{c.status!=='pending'&&<div className="mt-2 flex items-center gap-1 text-xs text-slate-500"><Clock3 className="size-4"/>Reviewed {c.reviewed_at?new Date(c.reviewed_at).toLocaleString('en-IN'):'—'}</div>}</div>)}{claims.length===0&&<div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No Master Property merge claims yet.</div>}</div></section>
  </div>;
}
