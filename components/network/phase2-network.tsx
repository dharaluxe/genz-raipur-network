'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BadgeCheck,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  LocateFixed,
  MapPinned,
  RefreshCw,
  ShieldCheck,
  Star,
  Upload,
  UserRoundCheck,
  XCircle,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';

export type Phase2View = 'visits' | 'reviews' | 'verification' | 'builders' | 'map';

type MemberProfile = {
  id: string;
  broker_code: string;
  display_name: string;
  firm: string;
  is_admin: boolean;
  rating: number | string | null;
  review_count: number;
};

type DealRow = {
  id: string;
  requirement_id: string;
  property_id: string;
  buyer_user_id: string;
  listing_user_id: string;
  status: string;
};

type VisitRow = {
  id: string;
  deal_id: string;
  created_by_user_id: string;
  scheduled_at: string;
  status: string;
  otp_expires_at: string;
  attempts: number;
  verifier_user_id: string | null;
  verified_at: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};

type ReviewRow = {
  id: string;
  deal_id: string;
  reviewer_user_id: string;
  reviewed_user_id: string;
  rating: number;
  communication: number | null;
  professionalism: number | null;
  comment: string;
  created_at: string;
};

type PropertyRow = {
  id: string;
  listing_user_id: string;
  title: string;
  city: string;
  locality: string | null;
  property_type: string;
  size: number;
  asking: number | string;
  mandate_status: string;
  status: string;
  latitude: number | string | null;
  longitude: number | string | null;
};

type VerificationRow = {
  property_id: string;
  listing_user_id: string;
  status: string;
  owner_consent: boolean;
  documents_checked: boolean;
  location_checked: boolean;
  notes: string;
  submitted_at: string | null;
  reviewed_at: string | null;
};

type DocumentRow = {
  id: string;
  property_id: string;
  document_type: string;
  file_name: string;
  storage_path: string;
  created_at: string;
};

type BuilderRow = {
  id: string;
  name: string;
  city: string;
  rera_number: string | null;
  website: string | null;
  verified: boolean;
  created_by_user_id: string;
};

type ProjectRow = {
  id: string;
  builder_id: string;
  name: string;
  city: string;
  locality: string | null;
  property_type: string;
  min_price: number | string;
  max_price: number | string;
  min_size: number;
  max_size: number;
  brokerage_pct: number | string;
  inventory_units: number;
  status: string;
};

type RequirementRow = {
  id: string;
  city: string;
  property_type: string;
  max_budget: number | string;
  min_size: number;
  status: string;
};

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <section>
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">{eyebrow}</div>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
    </section>
  );
}

function Notice({ message, tone = 'info' }: { message: string; tone?: 'info' | 'success' | 'error' }) {
  const cls = tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-blue-200 bg-blue-50 text-blue-900';
  return <div className={`rounded-xl border px-4 py-3 text-xs leading-5 ${cls}`}>{message}</div>;
}

function brokerLabel(profiles: MemberProfile[], id: string | null | undefined) {
  if (!id) return '—';
  const profile = profiles.find((item) => item.id === id);
  return profile ? `${profile.display_name} · ${profile.broker_code}` : 'Broker';
}

function usePhase2Member() {
  const supabase = useMemo(() => getSupabaseNetworkClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const activeUser = sessionData.session?.user || null;
      setUser(activeUser);
      if (!activeUser) { setProfile(null); return; }
      const { data, error: profileError } = await supabase
        .from('genz_profiles')
        .select('id,broker_code,display_name,firm,is_admin,rating,review_count')
        .eq('id', activeUser.id)
        .maybeSingle();
      if (profileError) throw profileError;
      setProfile((data || null) as MemberProfile | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify GENZ membership.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void refresh();
    const { data } = supabase.auth.onAuthStateChange(() => { void refresh(); });
    return () => data.subscription.unsubscribe();
  }, [refresh, supabase]);

  return { supabase, user, profile, loading, error, refresh };
}

function Phase2Gate({ children }: { children: (ctx: ReturnType<typeof usePhase2Member> & { user: User; profile: MemberProfile }) => React.ReactNode }) {
  const ctx = usePhase2Member();
  if (ctx.loading) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Checking secure GENZ membership…</div>;
  if (ctx.error) return <Notice tone="error" message={`Membership check failed: ${ctx.error}`} />;
  if (!ctx.user) return <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><ShieldCheck className="size-8 text-blue-600"/><h1 className="mt-4 text-2xl font-bold">Sign in required</h1><p className="mt-2 text-sm leading-6 text-slate-600">Phase 2 tools are available only to approved GENZ members.</p><Link className={`${primaryButton} mt-5`} href="/dashboard">Go to secure sign in</Link></div>;
  if (!ctx.profile) return <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm"><ShieldCheck className="size-8 text-amber-600"/><h1 className="mt-4 text-2xl font-bold">Broker invite required</h1><p className="mt-2 text-sm leading-6 text-slate-600">This signed-in account is not an approved GENZ member. Use the invite link issued by an existing broker or admin.</p><Link className={`${secondaryButton} mt-5`} href="/dashboard">Back to membership</Link></div>;
  return <>{children({ ...ctx, user: ctx.user, profile: ctx.profile })}</>;
}

function VisitsView() {
  return <Phase2Gate>{({ supabase, user, profile }) => <VisitsMemberView supabase={supabase} user={user} profile={profile} />}</Phase2Gate>;
}

function VisitsMemberView({ supabase, user, profile }: { supabase: ReturnType<typeof getSupabaseNetworkClient>; user: User; profile: MemberProfile }) {
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [profiles, setProfiles] = useState<MemberProfile[]>([]);
  const [dealId, setDealId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [secretCode, setSecretCode] = useState('');
  const [verifyVisitId, setVerifyVisitId] = useState('');
  const [otp, setOtp] = useState('');
  const [coords, setCoords] = useState<{ lat?: number; lng?: number }>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [dealsRes, visitsRes, profilesRes] = await Promise.all([
      supabase.from('genz_deals').select('id,requirement_id,property_id,buyer_user_id,listing_user_id,status').order('updated_at', { ascending: false }),
      supabase.from('genz_visits').select('*').order('created_at', { ascending: false }),
      supabase.from('genz_profiles').select('id,broker_code,display_name,firm,is_admin,rating,review_count'),
    ]);
    if (dealsRes.error) throw dealsRes.error;
    if (visitsRes.error) throw visitsRes.error;
    if (profilesRes.error) throw profilesRes.error;
    setDeals((dealsRes.data || []) as DealRow[]);
    setVisits((visitsRes.data || []) as VisitRow[]);
    setProfiles((profilesRes.data || []) as MemberProfile[]);
  }, [supabase]);

  useEffect(() => { void load().catch((e) => setMessage(e.message)); }, [load]);

  const createVisit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(''); setSecretCode('');
    try {
      if (!dealId || !scheduledAt) throw new Error('Select a deal and visit time.');
      const iso = new Date(scheduledAt).toISOString();
      const { data, error } = await supabase.rpc('genz_create_visit', { p_deal_id: dealId, p_scheduled_at: iso });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setSecretCode(String(row?.otp || ''));
      setMessage('Visit created. Share the one-time code only with the other broker at the site.');
      await load();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not schedule visit.'); }
    finally { setBusy(false); }
  };

  const useLocation = () => {
    if (!navigator.geolocation) { setMessage('Location is not supported in this browser.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setMessage('Current location captured for visit proof.'); },
      () => setMessage('Location permission was not granted.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const verifyVisit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      if (!verifyVisitId || !/^\d{6}$/.test(otp)) throw new Error('Select a visit and enter its 6-digit code.');
      const { data, error } = await supabase.rpc('genz_verify_visit', { p_visit_id: verifyVisitId, p_otp: otp, p_latitude: coords.lat ?? null, p_longitude: coords.lng ?? null });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.verified) throw new Error(row?.message || 'Visit could not be verified.');
      setOtp(''); setMessage(row.message || 'Visit verified.'); await load();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not verify visit.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-7">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><SectionTitle eyebrow="Phase 2 · Proof" title="Site Visit OTP" description="Create a one-time visit code, require the other deal participant to verify it, and optionally attach on-site GPS coordinates."/><button className={secondaryButton} onClick={() => void load()}><RefreshCw className="size-4"/>Refresh</button></div>
    {message && <Notice tone={message.toLowerCase().includes('verified') ? 'success' : 'info'} message={message}/>} 
    <section className="grid gap-5 xl:grid-cols-2">
      <form className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={createVisit}><div className="flex items-center gap-2"><CalendarCheck2 className="size-5 text-blue-600"/><h2 className="font-bold">Schedule / issue visit code</h2></div><div className="mt-4 grid gap-3"><select className={inputClass} required value={dealId} onChange={(e)=>setDealId(e.target.value)}><option value="">Select eligible deal</option>{deals.filter((d)=>['accepted','visit_verified','negotiation'].includes(d.status)).map((d)=><option key={d.id} value={d.id}>{d.id} · {brokerLabel(profiles,d.buyer_user_id)} ↔ {brokerLabel(profiles,d.listing_user_id)}</option>)}</select><input className={inputClass} type="datetime-local" required value={scheduledAt} onChange={(e)=>setScheduledAt(e.target.value)}/></div><button className={`${primaryButton} mt-4`} disabled={busy}>Create visit proof</button>{secretCode && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-emerald-700">One-time visit code</div><div className="mt-2 font-mono text-4xl font-black tracking-[0.25em] text-emerald-900">{secretCode}</div><p className="mt-2 text-xs leading-5 text-emerald-800">Code is shown once here. The creator cannot self-verify; the other deal participant must enter it.</p></div>}</form>
      <form className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={verifyVisit}><div className="flex items-center gap-2"><LocateFixed className="size-5 text-blue-600"/><h2 className="font-bold">Verify at site</h2></div><div className="mt-4 grid gap-3"><select className={inputClass} required value={verifyVisitId} onChange={(e)=>setVerifyVisitId(e.target.value)}><option value="">Select scheduled visit</option>{visits.filter((v)=>v.status==='scheduled' && v.created_by_user_id!==user.id).map((v)=><option key={v.id} value={v.id}>{v.deal_id} · {new Date(v.scheduled_at).toLocaleString('en-IN')}</option>)}</select><input className={inputClass} inputMode="numeric" maxLength={6} placeholder="6-digit visit code" value={otp} onChange={(e)=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}/><button className={secondaryButton} type="button" onClick={useLocation}><MapPinned className="size-4"/>Use current location</button>{coords.lat && <div className="text-xs text-slate-500">GPS: {coords.lat.toFixed(5)}, {coords.lng?.toFixed(5)}</div>}</div><button className={`${primaryButton} mt-4`} disabled={busy}>Verify visit</button></form>
    </section>
    <section className="space-y-3"><h2 className="font-bold">My deal visit history</h2>{visits.map((v)=><article key={v.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><b>{v.deal_id}</b><div className="text-xs text-slate-500">{new Date(v.scheduled_at).toLocaleString('en-IN')} · created by {brokerLabel(profiles,v.created_by_user_id)}</div></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${v.status==='verified'?'bg-emerald-50 text-emerald-700':'bg-blue-50 text-blue-700'}`}>{v.status}</span></div>{v.verified_at && <div className="mt-2 text-xs text-slate-500">Verified {new Date(v.verified_at).toLocaleString('en-IN')} by {brokerLabel(profiles,v.verifier_user_id)}</div>}</article>)}{!visits.length&&<div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No visit proofs yet.</div>}</section>
  </div>;
}

function ReviewsView() {
  return <Phase2Gate>{({ supabase, user }) => <ReviewsMemberView supabase={supabase} user={user} />}</Phase2Gate>;
}

function ReviewsMemberView({ supabase, user }: { supabase: ReturnType<typeof getSupabaseNetworkClient>; user: User }) {
  const [deals,setDeals]=useState<DealRow[]>([]); const [reviews,setReviews]=useState<ReviewRow[]>([]); const [profiles,setProfiles]=useState<MemberProfile[]>([]); const [dealId,setDealId]=useState(''); const [rating,setRating]=useState(5); const [communication,setCommunication]=useState(5); const [professionalism,setProfessionalism]=useState(5); const [comment,setComment]=useState(''); const [message,setMessage]=useState(''); const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{const [d,r,p]=await Promise.all([supabase.from('genz_deals').select('id,requirement_id,property_id,buyer_user_id,listing_user_id,status').order('updated_at',{ascending:false}),supabase.from('genz_reviews').select('*').order('created_at',{ascending:false}),supabase.from('genz_profiles').select('id,broker_code,display_name,firm,is_admin,rating,review_count')]); if(d.error)throw d.error;if(r.error)throw r.error;if(p.error)throw p.error;setDeals((d.data||[]) as DealRow[]);setReviews((r.data||[]) as ReviewRow[]);setProfiles((p.data||[]) as MemberProfile[]);},[supabase]);
  useEffect(()=>{void load().catch(e=>setMessage(e.message));},[load]);
  const reviewedDealIds=new Set(reviews.filter(r=>r.reviewer_user_id===user.id).map(r=>r.deal_id));
  const eligible=deals.filter(d=>d.status==='closed'&&!reviewedDealIds.has(d.id));
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setMessage('');try{const deal=deals.find(d=>d.id===dealId);if(!deal)throw new Error('Select a closed deal.');const reviewed=deal.buyer_user_id===user.id?deal.listing_user_id:deal.buyer_user_id;const {error}=await supabase.from('genz_reviews').insert({deal_id:deal.id,reviewer_user_id:user.id,reviewed_user_id:reviewed,rating,communication,professionalism,comment:comment.trim()});if(error)throw error;setDealId('');setComment('');setMessage('Verified deal review published and broker rating recalculated.');await load();}catch(err){setMessage(err instanceof Error?err.message:'Could not publish review.');}finally{setBusy(false);}};
  return <div className="space-y-7"><SectionTitle eyebrow="Phase 2 · Reputation" title="Verified Broker Reviews" description="Only brokers who actually participated in a closed GENZ deal can review each other. Ratings automatically feed the broker profile and Trust Score inputs."/>{message&&<Notice message={message} tone={message.includes('published')?'success':'info'}/>}<section className="grid gap-5 xl:grid-cols-[390px_1fr]"><form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Star className="size-5 text-amber-500"/><h2 className="font-bold">Rate completed collaboration</h2></div><div className="mt-4 grid gap-3"><select className={inputClass} value={dealId} required onChange={e=>setDealId(e.target.value)}><option value="">Closed deal</option>{eligible.map(d=><option key={d.id} value={d.id}>{d.id} · review {brokerLabel(profiles,d.buyer_user_id===user.id?d.listing_user_id:d.buyer_user_id)}</option>)}</select><label className="text-xs font-semibold text-slate-600">Overall rating<select className={`${inputClass} mt-1`} value={rating} onChange={e=>setRating(Number(e.target.value))}>{[5,4,3,2,1].map(x=><option key={x} value={x}>{x} / 5</option>)}</select></label><label className="text-xs font-semibold text-slate-600">Communication<select className={`${inputClass} mt-1`} value={communication} onChange={e=>setCommunication(Number(e.target.value))}>{[5,4,3,2,1].map(x=><option key={x}>{x}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">Professionalism<select className={`${inputClass} mt-1`} value={professionalism} onChange={e=>setProfessionalism(Number(e.target.value))}>{[5,4,3,2,1].map(x=><option key={x}>{x}</option>)}</select></label><textarea className={inputClass} rows={4} maxLength={800} placeholder="Short factual review" value={comment} onChange={e=>setComment(e.target.value)}/></div><button disabled={busy||!eligible.length} className={`${primaryButton} mt-4 w-full`}>Publish verified review</button>{!eligible.length&&<p className="mt-3 text-xs text-slate-500">A deal must be marked closed before either broker can review the other.</p>}</form><div className="space-y-3">{reviews.map(r=><article key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><BadgeCheck className="size-4 text-emerald-600"/><b>{brokerLabel(profiles,r.reviewer_user_id)}</b></div><div className="mt-1 text-xs text-slate-500">reviewed {brokerLabel(profiles,r.reviewed_user_id)} · deal {r.deal_id}</div></div><div className="rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-700">★ {r.rating}/5</div></div>{r.comment&&<p className="mt-4 text-sm leading-6 text-slate-700">{r.comment}</p>}<div className="mt-3 text-xs text-slate-400">Communication {r.communication||'—'}/5 · Professionalism {r.professionalism||'—'}/5 · {new Date(r.created_at).toLocaleDateString('en-IN')}</div></article>)}{!reviews.length&&<div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No verified reviews yet.</div>}</div></section></div>;
}

function VerificationView(){return <Phase2Gate>{({supabase,user,profile})=><VerificationMemberView supabase={supabase} user={user} profile={profile}/>}</Phase2Gate>;}

function VerificationMemberView({supabase,user,profile}:{supabase:ReturnType<typeof getSupabaseNetworkClient>;user:User;profile:MemberProfile}){
  const [properties,setProperties]=useState<PropertyRow[]>([]);const [verifications,setVerifications]=useState<VerificationRow[]>([]);const [documents,setDocuments]=useState<DocumentRow[]>([]);const [propertyId,setPropertyId]=useState('');const [checks,setChecks]=useState({owner:false,docs:false,location:false});const [notes,setNotes]=useState('');const [docType,setDocType]=useState('ownership');const [file,setFile]=useState<File|null>(null);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{const [p,v,d]=await Promise.all([supabase.from('genz_properties').select('id,listing_user_id,title,city,locality,property_type,size,asking,mandate_status,status,latitude,longitude').order('created_at',{ascending:false}),supabase.from('genz_property_verifications').select('*').order('updated_at',{ascending:false}),supabase.from('genz_property_documents').select('*').order('created_at',{ascending:false})]);if(p.error)throw p.error;if(v.error)throw v.error;if(d.error)throw d.error;setProperties((p.data||[]) as PropertyRow[]);setVerifications((v.data||[]) as VerificationRow[]);setDocuments((d.data||[]) as DocumentRow[]);},[supabase]);
  useEffect(()=>{void load().catch(e=>setMessage(e.message));},[load]);
  const editable=properties.filter(p=>profile.is_admin||p.listing_user_id===user.id);
  const upload=async()=>{if(!propertyId||!file)throw new Error('Select a property and document.');const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${user.id}/${propertyId}/${crypto.randomUUID()}-${safe}`;const {error:upErr}=await supabase.storage.from('genz-property-docs').upload(path,file,{upsert:false});if(upErr)throw upErr;const {error:metaErr}=await supabase.from('genz_property_documents').insert({property_id:propertyId,uploaded_by_user_id:user.id,document_type:docType,file_name:file.name,storage_path:path});if(metaErr){await supabase.storage.from('genz-property-docs').remove([path]);throw metaErr;}setFile(null);};
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setMessage('');try{if(!propertyId)throw new Error('Select your listing.');if(file)await upload();const {error}=await supabase.rpc('genz_submit_property_verification',{p_property_id:propertyId,p_owner_consent:checks.owner,p_documents_checked:checks.docs,p_location_checked:checks.location,p_notes:notes});if(error)throw error;setMessage('Verification submitted to GENZ admin. Property mandate remains pending until review.');await load();}catch(err){setMessage(err instanceof Error?err.message:'Could not submit verification.');}finally{setBusy(false);}};
  const review=async(id:string,status:'verified'|'rejected')=>{setMessage('');const {error}=await supabase.rpc('genz_admin_review_property_verification',{p_property_id:id,p_status:status});if(error){setMessage(error.message);return;}setMessage(`Property ${status}.`);await load();};
  const openDoc=async(path:string)=>{const {data,error}=await supabase.storage.from('genz-property-docs').createSignedUrl(path,600);if(error){setMessage(error.message);return;}window.open(data.signedUrl,'_blank','noopener,noreferrer');};
  return <div className="space-y-7"><SectionTitle eyebrow="Phase 2 · Verification" title="Owner & Property Verification" description="Listing brokers submit owner consent, location proof and private documents. Only the listing broker and GENZ admin can access the verification file; the network sees only the resulting mandate status."/>{message&&<Notice message={message} tone={message.includes('verified')||message.includes('submitted')?'success':'info'}/>}<section className="grid gap-5 xl:grid-cols-[430px_1fr]"><form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><ClipboardCheck className="size-5 text-blue-600"/><h2 className="font-bold">Submit property proof</h2></div><div className="mt-4 grid gap-3"><select className={inputClass} required value={propertyId} onChange={e=>setPropertyId(e.target.value)}><option value="">Select your property</option>{editable.map(p=><option key={p.id} value={p.id}>{p.id} · {p.title}</option>)}</select>{[['owner','Owner consent obtained'],['docs','Ownership / mandate documents checked'],['location','Property location checked']].map(([key,label])=><label key={key} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm"><input type="checkbox" checked={checks[key as keyof typeof checks]} onChange={e=>setChecks({...checks,[key]:e.target.checked})}/>{label}</label>)}<textarea className={inputClass} maxLength={1200} rows={4} placeholder="Verification notes" value={notes} onChange={e=>setNotes(e.target.value)}/><div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold text-slate-600">Optional private document</div><select className={`${inputClass} mt-2`} value={docType} onChange={e=>setDocType(e.target.value)}><option value="ownership">Ownership document</option><option value="mandate">Broker mandate</option><option value="identity">Owner identity</option><option value="location">Location proof</option></select><input className="mt-2 block w-full text-xs" type="file" accept="application/pdf,image/jpeg,image/png" onChange={e=>setFile(e.target.files?.[0]||null)}/><p className="mt-2 text-[11px] text-slate-500">Private bucket · PDF/JPG/PNG · max 10 MB.</p></div></div><button disabled={busy} className={`${primaryButton} mt-4 w-full`}><Upload className="size-4"/>Submit verification</button></form><div className="space-y-3">{editable.map(p=>{const v=verifications.find(x=>x.property_id===p.id);const docs=documents.filter(x=>x.property_id===p.id);return <article key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-xs font-bold text-blue-600">{p.id}</div><h3 className="mt-1 font-bold">{p.title}</h3><div className="text-xs text-slate-500">{p.city}{p.locality?` · ${p.locality}`:''} · mandate {p.mandate_status}</div></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${v?.status==='verified'?'bg-emerald-50 text-emerald-700':v?.status==='rejected'?'bg-red-50 text-red-700':'bg-amber-50 text-amber-700'}`}>{v?.status||'not submitted'}</span></div>{v&&<div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-3"><div>Owner consent: <b>{v.owner_consent?'Yes':'No'}</b></div><div>Docs: <b>{v.documents_checked?'Checked':'Pending'}</b></div><div>Location: <b>{v.location_checked?'Checked':'Pending'}</b></div></div>}{docs.length>0&&<div className="mt-4 flex flex-wrap gap-2">{docs.map(d=><button key={d.id} className={secondaryButton} type="button" onClick={()=>void openDoc(d.storage_path)}><FileText className="size-4"/>{d.document_type}</button>)}</div>}{profile.is_admin&&v?.status==='submitted'&&<div className="mt-4 flex gap-2"><button className={primaryButton} onClick={()=>void review(p.id,'verified')}><CheckCircle2 className="size-4"/>Verify</button><button className={secondaryButton} onClick={()=>void review(p.id,'rejected')}><XCircle className="size-4"/>Reject</button></div>}</article>})}{!editable.length&&<div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Add a property listing first.</div>}</div></section></div>;
}

function BuildersView(){return <Phase2Gate>{({supabase,user,profile})=><BuildersMemberView supabase={supabase} user={user} profile={profile}/>}</Phase2Gate>;}
function BuildersMemberView({supabase,user,profile}:{supabase:ReturnType<typeof getSupabaseNetworkClient>;user:User;profile:MemberProfile}){
  const [builders,setBuilders]=useState<BuilderRow[]>([]);const [projects,setProjects]=useState<ProjectRow[]>([]);const [requirements,setRequirements]=useState<RequirementRow[]>([]);const [message,setMessage]=useState('');const [builderForm,setBuilderForm]=useState({name:'',city:'Raipur',rera:'',website:''});const [projectForm,setProjectForm]=useState({builderId:'',name:'',city:'Raipur',locality:'',type:'Apartment',minPrice:'4000000',maxPrice:'8000000',minSize:'800',maxSize:'1600',brokerage:'2',inventory:'0'});
  const load=useCallback(async()=>{const [b,p,r]=await Promise.all([supabase.from('genz_builders').select('*').order('created_at',{ascending:false}),supabase.from('genz_builder_projects').select('*').order('created_at',{ascending:false}),supabase.from('genz_requirements').select('id,city,property_type,max_budget,min_size,status').eq('status','active')]);if(b.error)throw b.error;if(p.error)throw p.error;if(r.error)throw r.error;setBuilders((b.data||[]) as BuilderRow[]);setProjects((p.data||[]) as ProjectRow[]);setRequirements((r.data||[]) as RequirementRow[]);},[supabase]);useEffect(()=>{void load().catch(e=>setMessage(e.message));},[load]);
  const addBuilder=async(e:FormEvent)=>{e.preventDefault();setMessage('');const {error}=await supabase.from('genz_builders').insert({name:builderForm.name.trim(),city:builderForm.city.trim(),rera_number:builderForm.rera.trim()||null,website:builderForm.website.trim()||null,created_by_user_id:user.id});if(error){setMessage(error.message);return;}setBuilderForm({name:'',city:'Raipur',rera:'',website:''});setMessage('Builder added to GENZ directory.');await load();};
  const addProject=async(e:FormEvent)=>{e.preventDefault();setMessage('');const {error}=await supabase.from('genz_builder_projects').insert({builder_id:projectForm.builderId,name:projectForm.name.trim(),city:projectForm.city.trim(),locality:projectForm.locality.trim()||null,property_type:projectForm.type,min_price:Number(projectForm.minPrice),max_price:Number(projectForm.maxPrice),min_size:Number(projectForm.minSize),max_size:Number(projectForm.maxSize),brokerage_pct:Number(projectForm.brokerage),inventory_units:Number(projectForm.inventory),created_by_user_id:user.id});if(error){setMessage(error.message);return;}setProjectForm({...projectForm,name:'',builderId:''});setMessage('Builder project published to the broker network.');await load();};
  const matchCount=(p:ProjectRow)=>requirements.filter(r=>r.city.toLowerCase()===p.city.toLowerCase()&&r.property_type.toLowerCase()===p.property_type.toLowerCase()&&Number(r.max_budget)>=Number(p.min_price)&&(Number(p.max_size)<=0||r.min_size<=Number(p.max_size))).length;
  return <div className="space-y-7"><SectionTitle eyebrow="Phase 2 · Distribution" title="Builder Console" description="Verified project inventory can be distributed to the broker network and matched against existing protected buyer demand without exposing buyer phone numbers."/>{message&&<Notice message={message} tone={message.includes('added')||message.includes('published')?'success':'info'}/>} {profile.is_admin&&<section className="grid gap-5 xl:grid-cols-2"><form onSubmit={addBuilder} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Building2 className="size-5 text-blue-600"/><h2 className="font-bold">Add builder</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><input className={inputClass} required placeholder="Builder / developer name" value={builderForm.name} onChange={e=>setBuilderForm({...builderForm,name:e.target.value})}/><input className={inputClass} required placeholder="City" value={builderForm.city} onChange={e=>setBuilderForm({...builderForm,city:e.target.value})}/><input className={inputClass} placeholder="RERA number" value={builderForm.rera} onChange={e=>setBuilderForm({...builderForm,rera:e.target.value})}/><input className={inputClass} placeholder="Website" value={builderForm.website} onChange={e=>setBuilderForm({...builderForm,website:e.target.value})}/></div><button className={`${primaryButton} mt-4`}>Add builder</button></form><form onSubmit={addProject} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><FileCheck2 className="size-5 text-blue-600"/><h2 className="font-bold">Publish project</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><select className={inputClass} required value={projectForm.builderId} onChange={e=>setProjectForm({...projectForm,builderId:e.target.value})}><option value="">Builder</option>{builders.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><input className={inputClass} required placeholder="Project name" value={projectForm.name} onChange={e=>setProjectForm({...projectForm,name:e.target.value})}/><input className={inputClass} required placeholder="City" value={projectForm.city} onChange={e=>setProjectForm({...projectForm,city:e.target.value})}/><input className={inputClass} placeholder="Locality" value={projectForm.locality} onChange={e=>setProjectForm({...projectForm,locality:e.target.value})}/><select className={inputClass} value={projectForm.type} onChange={e=>setProjectForm({...projectForm,type:e.target.value})}><option>Apartment</option><option>Residential plot</option><option>Independent house</option><option>Commercial</option></select><input className={inputClass} type="number" placeholder="Min price" value={projectForm.minPrice} onChange={e=>setProjectForm({...projectForm,minPrice:e.target.value})}/><input className={inputClass} type="number" placeholder="Max price" value={projectForm.maxPrice} onChange={e=>setProjectForm({...projectForm,maxPrice:e.target.value})}/><input className={inputClass} type="number" placeholder="Min size" value={projectForm.minSize} onChange={e=>setProjectForm({...projectForm,minSize:e.target.value})}/><input className={inputClass} type="number" placeholder="Max size" value={projectForm.maxSize} onChange={e=>setProjectForm({...projectForm,maxSize:e.target.value})}/><input className={inputClass} type="number" step="0.01" placeholder="Brokerage %" value={projectForm.brokerage} onChange={e=>setProjectForm({...projectForm,brokerage:e.target.value})}/><input className={inputClass} type="number" placeholder="Inventory units" value={projectForm.inventory} onChange={e=>setProjectForm({...projectForm,inventory:e.target.value})}/></div><button className={`${primaryButton} mt-4`}>Publish to GENZ brokers</button></form></section>}
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map(p=>{const b=builders.find(x=>x.id===p.builder_id);const matches=matchCount(p);return <article key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wide text-blue-600">{b?.name||'Builder project'}</div><h3 className="mt-1 text-lg font-bold">{p.name}</h3><div className="text-xs text-slate-500">{p.city}{p.locality?` · ${p.locality}`:''}</div></div>{b?.verified&&<BadgeCheck className="size-5 text-emerald-600"/>}</div><div className="mt-4 text-sm"><b>{p.property_type}</b> · {p.min_size}-{p.max_size||'+'} sqft</div><div className="mt-1 text-sm text-slate-500">{money(p.min_price)} – {money(p.max_price)}</div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-slate-50 p-2"><div className="text-lg font-bold">{p.inventory_units}</div><div className="text-[10px] text-slate-500">Units</div></div><div className="rounded-lg bg-slate-50 p-2"><div className="text-lg font-bold">{Number(p.brokerage_pct)}%</div><div className="text-[10px] text-slate-500">Brokerage</div></div><div className="rounded-lg bg-emerald-50 p-2"><div className="text-lg font-bold text-emerald-700">{matches}</div><div className="text-[10px] text-emerald-700">Buyer matches</div></div></div></article>})}{!projects.length&&<div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No builder projects published yet.</div>}</section></div>;
}

function MapView(){return <Phase2Gate>{({supabase,user})=><MapMemberView supabase={supabase} user={user}/>}</Phase2Gate>;}
function MapMemberView({supabase,user}:{supabase:ReturnType<typeof getSupabaseNetworkClient>;user:User}){
  const [properties,setProperties]=useState<PropertyRow[]>([]);const [query,setQuery]=useState('');const [selectedId,setSelectedId]=useState('');const [locality,setLocality]=useState('');const [message,setMessage]=useState('');
  const load=useCallback(async()=>{const {data,error}=await supabase.from('genz_properties').select('id,listing_user_id,title,city,locality,property_type,size,asking,mandate_status,status,latitude,longitude').eq('status','active').order('created_at',{ascending:false});if(error)throw error;setProperties((data||[]) as PropertyRow[]);},[supabase]);useEffect(()=>{void load().catch(e=>setMessage(e.message));},[load]);
  const filtered=properties.filter(p=>`${p.title} ${p.city} ${p.locality||''} ${p.property_type}`.toLowerCase().includes(query.toLowerCase()));const selected=properties.find(p=>p.id===selectedId)||filtered.find(p=>p.latitude&&p.longitude)||filtered[0];
  const setCurrentLocation=()=>{if(!selected||selected.listing_user_id!==user.id){setMessage('Only the listing broker can update this property location.');return;}if(!navigator.geolocation){setMessage('Location is not supported.');return;}navigator.geolocation.getCurrentPosition(async pos=>{const {error}=await supabase.from('genz_properties').update({latitude:pos.coords.latitude,longitude:pos.coords.longitude,locality:locality.trim()||selected.locality,updated_at:new Date().toISOString()}).eq('id',selected.id);if(error){setMessage(error.message);return;}setMessage('Exact property coordinates saved.');await load();},()=>setMessage('Location permission was not granted.'),{enableHighAccuracy:true,timeout:10000});};
  const lat=selected?.latitude?Number(selected.latitude):null,lng=selected?.longitude?Number(selected.longitude):null;const mapUrl=lat&&lng?`https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.01}%2C${lat-0.01}%2C${lng+0.01}%2C${lat+0.01}&layer=mapnik&marker=${lat}%2C${lng}`:'';const osmLink=lat&&lng?`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`:'';
  return <div className="space-y-7"><SectionTitle eyebrow="Phase 2 · Discovery" title="Map & Location Search" description="Search nationwide inventory by city, locality or property type. Listing brokers can attach exact coordinates from the site; other brokers can inspect the location without seeing private owner data."/>{message&&<Notice message={message}/>}<section className="grid gap-5 xl:grid-cols-[390px_1fr]"><div className="space-y-3"><input className={inputClass} placeholder="Search city, locality, project or type" value={query} onChange={e=>setQuery(e.target.value)}/>{filtered.map(p=><button key={p.id} type="button" onClick={()=>{setSelectedId(p.id);setLocality(p.locality||'');}} className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition ${selected?.id===p.id?'border-blue-400 ring-2 ring-blue-100':'border-slate-200 hover:border-slate-300'}`}><div className="flex justify-between gap-3"><div><b>{p.title}</b><div className="mt-1 text-xs text-slate-500">{p.city}{p.locality?` · ${p.locality}`:''} · {p.property_type}</div></div><div className="text-right text-sm font-bold">{money(p.asking)}</div></div><div className="mt-2 text-xs text-slate-400">{p.latitude&&p.longitude?'Mapped':'Location not pinned'}</div></button>)}{!filtered.length&&<div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No matching properties.</div>}</div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">{selected?<><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-xs font-bold text-blue-600">{selected.id}</div><h2 className="mt-1 text-xl font-bold">{selected.title}</h2><div className="text-sm text-slate-500">{selected.city}{selected.locality?` · ${selected.locality}`:''}</div></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{selected.mandate_status}</span></div>{mapUrl?<><iframe title={`Map for ${selected.title}`} className="mt-5 h-[430px] w-full rounded-xl border border-slate-200" src={mapUrl}/><a className={`${secondaryButton} mt-3`} href={osmLink} target="_blank" rel="noreferrer"><MapPinned className="size-4"/>Open full map</a></>:<div className="mt-5 grid h-[340px] place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500"><div><MapPinned className="mx-auto mb-2 size-8"/>This listing has no exact coordinates yet.</div></div>}{selected.listing_user_id===user.id&&<div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-blue-700">Listing broker location control</div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input className={inputClass} placeholder="Locality / landmark" value={locality} onChange={e=>setLocality(e.target.value)}/><button className={primaryButton} type="button" onClick={setCurrentLocation}><LocateFixed className="size-4"/>Pin current site</button></div><p className="mt-2 text-xs text-blue-800">Use this while physically at the property for the strongest location proof.</p></div>}</>:<div className="text-sm text-slate-500">Select a property.</div>}</div></section></div>;
}

export default function Phase2Network({ view }: { view: Phase2View }) {
  if (view === 'visits') return <VisitsView/>;
  if (view === 'reviews') return <ReviewsView/>;
  if (view === 'verification') return <VerificationView/>;
  if (view === 'builders') return <BuildersView/>;
  return <MapView/>;
}
