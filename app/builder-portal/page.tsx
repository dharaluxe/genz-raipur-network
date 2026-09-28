'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { BadgeCheck, Building2, Copy, LogIn, RefreshCw, Send, ShieldCheck, UsersRound } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';

type InviteInfo={valid:boolean;email:string|null;builder_name:string|null;role:string|null;expires_at:string|null};
type Membership={builder_id:string;role:'owner'|'admin'|'sales';status:string};
type Builder={id:string;name:string;city:string;rera_number:string|null;verified:boolean};
type Project={id:string;builder_id:string;name:string;city:string;locality:string|null;property_type:string;min_price:number|string;max_price:number|string;inventory_units:number;brokerage_pct:number|string;status:string};
type BrokerMatch={broker_user_id:string;broker_code:string;display_name:string;firm:string;cities:string[];specialties:string[];rating:number|string;review_count:number;completed_deals:number;verified_visits:number;owner_confirmed_listings:number;matched_requirements:number};

const inputClass='w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const primary='inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50';
const secondary='inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const money=(v:number|string)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(v||0));

export default function BuilderPortalPage(){
  const supabase=useMemo(()=>getSupabaseNetworkClient(),[]);
  const [user,setUser]=useState<User|null>(null);
  const [inviteToken,setInviteToken]=useState('');
  const [inviteInfo,setInviteInfo]=useState<InviteInfo|null>(null);
  const [auth,setAuth]=useState({email:'',password:''});
  const [memberships,setMemberships]=useState<Membership[]>([]);
  const [builders,setBuilders]=useState<Builder[]>([]);
  const [projects,setProjects]=useState<Project[]>([]);
  const [isAdmin,setIsAdmin]=useState(false);
  const [selectedBuilder,setSelectedBuilder]=useState('');
  const [selectedProject,setSelectedProject]=useState('');
  const [matches,setMatches]=useState<BrokerMatch[]>([]);
  const [staffInvite,setStaffInvite]=useState({email:'',role:'sales'});
  const [staffInviteLink,setStaffInviteLink]=useState('');
  const [brokerMessage,setBrokerMessage]=useState('We have a project matching your active GENZ buyer requirements.');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);

  const validateInvite=useCallback(async(token:string)=>{
    if(!token){setInviteInfo(null);return;}
    const {data,error}=await supabase.rpc('genz_validate_builder_invite',{p_token:token});
    if(error){setMessage(error.message);return;}
    const row=(Array.isArray(data)?data[0]:data) as InviteInfo|undefined;
    setInviteInfo(row||null);
    if(row?.email)setAuth(a=>({...a,email:row.email||''}));
  },[supabase]);

  const loadPortal=useCallback(async(activeUser?:User|null)=>{
    setLoading(true);
    try{
      const resolved=activeUser??(await supabase.auth.getUser()).data.user;
      setUser(resolved||null);
      if(!resolved){setMemberships([]);setBuilders([]);setProjects([]);return;}
      const [memberRes,profileRes,builderRes,projectRes]=await Promise.all([
        supabase.from('genz_builder_memberships').select('builder_id,role,status').eq('status','active'),
        supabase.from('genz_profiles').select('is_admin').eq('id',resolved.id).maybeSingle(),
        supabase.from('genz_builders').select('id,name,city,rera_number,verified').order('name'),
        supabase.from('genz_builder_projects').select('id,builder_id,name,city,locality,property_type,min_price,max_price,inventory_units,brokerage_pct,status').order('created_at',{ascending:false}),
      ]);
      if(memberRes.error)throw memberRes.error;
      if(builderRes.error)throw builderRes.error;
      if(projectRes.error)throw projectRes.error;
      const ms=(memberRes.data||[]) as Membership[];const bs=(builderRes.data||[]) as Builder[];const ps=(projectRes.data||[]) as Project[];
      setMemberships(ms);setIsAdmin(Boolean(profileRes.data?.is_admin));setBuilders(bs);setProjects(ps);
      const firstBuilder=selectedBuilder||ms[0]?.builder_id||bs[0]?.id||'';
      setSelectedBuilder(firstBuilder);
      const firstProject=selectedProject||ps.find(p=>p.builder_id===firstBuilder)?.id||'';
      setSelectedProject(firstProject);
    }catch(err){setMessage(err instanceof Error?err.message:'Could not load builder portal.');}
    finally{setLoading(false);}
  },[selectedBuilder,selectedProject,supabase]);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);const token=params.get('invite')||'';setInviteToken(token);void validateInvite(token);
    void loadPortal();
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{void loadPortal(session?.user||null);});
    return()=>data.subscription.unsubscribe();
  },[loadPortal,supabase,validateInvite]);

  const signIn=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setMessage('');try{const {data,error}=await supabase.auth.signInWithPassword({email:auth.email.trim(),password:auth.password});if(error)throw error;setUser(data.user);setMessage('Signed in.');await loadPortal(data.user);}catch(err){setMessage(err instanceof Error?err.message:'Sign in failed.');}finally{setBusy(false);}};
  const createAccount=async()=>{setBusy(true);setMessage('');try{if(!inviteInfo?.valid||!inviteInfo.email)throw new Error('A valid builder invite is required.');if(auth.password.length<8)throw new Error('Use a password with at least 8 characters.');const {data,error}=await supabase.auth.signUp({email:inviteInfo.email,password:auth.password});if(error)throw error;if(data.session){const {error:redeemError}=await supabase.rpc('genz_redeem_builder_invite',{p_token:inviteToken});if(redeemError)throw redeemError;setMessage('Builder account activated.');await loadPortal(data.user);}else setMessage('Account created. Confirm the email, return to this invite link, then sign in and activate the invite.');}catch(err){setMessage(err instanceof Error?err.message:'Could not create builder account.');}finally{setBusy(false);}};
  const redeemInvite=async()=>{setBusy(true);setMessage('');try{if(!inviteToken)throw new Error('Builder invite token is missing.');const {error}=await supabase.rpc('genz_redeem_builder_invite',{p_token:inviteToken});if(error)throw error;setMessage('Builder invite activated.');await loadPortal(user);}catch(err){setMessage(err instanceof Error?err.message:'Could not activate invite.');}finally{setBusy(false);}};

  const loadMatches=async(projectId:string)=>{setSelectedProject(projectId);setMatches([]);if(!projectId)return;setBusy(true);setMessage('');try{const {data,error}=await supabase.rpc('genz_builder_matching_brokers',{p_project_id:projectId});if(error)throw error;setMatches((data||[]) as BrokerMatch[]);}catch(err){setMessage(err instanceof Error?err.message:'Could not load broker matches.');}finally{setBusy(false);}};
  const inviteBroker=async(brokerUserId:string)=>{setBusy(true);setMessage('');try{const {error}=await supabase.rpc('genz_invite_broker_to_project',{p_project_id:selectedProject,p_broker_user_id:brokerUserId,p_message:brokerMessage});if(error)throw error;setMessage('Project invitation sent to broker.');}catch(err){setMessage(err instanceof Error?err.message:'Could not invite broker.');}finally{setBusy(false);}};
  const createStaffInvite=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setMessage('');setStaffInviteLink('');try{if(!selectedBuilder)throw new Error('Select a builder.');const {data,error}=await supabase.rpc('genz_create_builder_account_invite',{p_builder_id:selectedBuilder,p_email:staffInvite.email.trim(),p_role:staffInvite.role,p_expires_hours:168});if(error)throw error;const row=Array.isArray(data)?data[0]:data;const link=`${window.location.origin}/builder-portal?invite=${row?.invite_token}`;setStaffInviteLink(link);setStaffInvite({...staffInvite,email:''});setMessage('One-time builder account invite created.');}catch(err){setMessage(err instanceof Error?err.message:'Could not create builder invite.');}finally{setBusy(false);}};

  const selectedMembership=memberships.find(m=>m.builder_id===selectedBuilder);const canManage=isAdmin||selectedMembership?.role==='owner'||selectedMembership?.role==='admin';const visibleProjects=projects.filter(p=>!selectedBuilder||p.builder_id===selectedBuilder);

  if(loading)return <main className="min-h-screen bg-slate-50 p-8 text-sm text-slate-500">Loading secure builder portal…</main>;
  return <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950"><div className="mx-auto max-w-6xl space-y-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-2xl bg-blue-600 text-white"><Building2 className="size-6"/></div><div><div className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">GENZ Network · Phase 2.2</div><h1 className="text-2xl font-bold">Builder Portal</h1></div></div><p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">Builders get project distribution and privacy-safe demand intelligence. Buyer names and phone numbers are never exposed here.</p></header>
    {message&&<div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{message}</div>}

    {!user&&<section className="grid gap-5 lg:grid-cols-2"><form onSubmit={signIn} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><LogIn className="size-5 text-blue-600"/><h2 className="font-bold">Builder sign in</h2></div><div className="mt-4 space-y-3"><input className={inputClass} type="email" required placeholder="Email" value={auth.email} onChange={e=>setAuth({...auth,email:e.target.value})}/><input className={inputClass} type="password" required placeholder="Password" value={auth.password} onChange={e=>setAuth({...auth,password:e.target.value})}/><button disabled={busy} className={`${primary} w-full`}>Sign in</button></div></form><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-emerald-600"/><h2 className="font-bold">Activate invited builder account</h2></div>{inviteInfo?.valid?<><div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"><b>{inviteInfo.builder_name}</b><br/>{inviteInfo.email} · role {inviteInfo.role}</div><p className="mt-3 text-xs text-slate-500">Only this invited email can redeem the token.</p><button type="button" disabled={busy||auth.password.length<8} onClick={()=>void createAccount()} className={`${primary} mt-4 w-full`}>Create invited account</button></>:<p className="mt-4 text-sm leading-6 text-slate-600">A valid builder invite link from GENZ admin or an authorized builder manager is required. Public builder signup is disabled.</p>}</div></section>}

    {user&&<><section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><b>{user.email}</b><div className="text-xs text-slate-500">{isAdmin?'GENZ admin access':memberships.length?`${memberships.length} active builder membership(s)`:'No builder membership yet'}</div></div><div className="flex gap-2">{inviteInfo?.valid&&!memberships.some(m=>m.builder_id===builders.find(b=>b.name===inviteInfo.builder_name)?.id)&&<button className={primary} disabled={busy} onClick={()=>void redeemInvite()}>Activate invite</button>}<button className={secondary} onClick={()=>void loadPortal(user)}><RefreshCw className="size-4"/>Refresh</button></div></section>

    {(memberships.length>0||isAdmin)&&<section className="grid gap-5 xl:grid-cols-[320px_1fr]"><aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Builder workspace</h2><select className={inputClass} value={selectedBuilder} onChange={e=>{setSelectedBuilder(e.target.value);const p=projects.find(x=>x.builder_id===e.target.value);setSelectedProject(p?.id||'');setMatches([]);}}>{builders.map(b=><option key={b.id} value={b.id}>{b.name} · {b.city}</option>)}</select><select className={inputClass} value={selectedProject} onChange={e=>void loadMatches(e.target.value)}><option value="">Select project</option>{visibleProjects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>{selectedProject&&<button className={`${primary} w-full`} disabled={busy} onClick={()=>void loadMatches(selectedProject)}>Find matching brokers</button>}<div className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600"><b>Privacy rule:</b> matching is calculated against protected requirements inside GENZ. Builders see broker-level demand counts, not buyer identities.</div></aside><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2">{visibleProjects.map(p=><article key={p.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${p.id===selectedProject?'border-blue-300':'border-slate-200'}`}><div className="flex items-start justify-between gap-3"><div><b>{p.name}</b><div className="mt-1 text-xs text-slate-500">{p.city}{p.locality?` · ${p.locality}`:''} · {p.property_type}</div></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{p.status}</span></div><div className="mt-4 text-sm">{money(p.min_price)} – {money(p.max_price)}</div><div className="mt-1 text-xs text-slate-500">Inventory {p.inventory_units} · Brokerage {Number(p.brokerage_pct)}%</div></article>)}</div>{selectedProject&&<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><UsersRound className="size-5 text-blue-600"/><h2 className="font-bold">Matching broker distribution</h2></div><textarea className={`${inputClass} mt-4`} rows={2} value={brokerMessage} onChange={e=>setBrokerMessage(e.target.value)} maxLength={400}/><div className="mt-4 space-y-3">{matches.map(m=><div key={m.broker_user_id} className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><b>{m.display_name}</b><BadgeCheck className="size-4 text-emerald-600"/></div><div className="text-xs text-slate-500">{m.firm} · {m.broker_code} · ★ {Number(m.rating||0).toFixed(1)} ({m.review_count})</div><div className="mt-1 text-xs font-semibold text-blue-700">{m.matched_requirements} matching active requirement(s)</div></div><button className={primary} disabled={busy||!canManage} onClick={()=>void inviteBroker(m.broker_user_id)}><Send className="size-4"/>Invite broker</button></div>)}{!matches.length&&<div className="rounded-xl border border-dashed p-7 text-center text-sm text-slate-500">Select a project and run privacy-safe matching.</div>}</div></div>}</div></section>}

    {user&&canManage&&selectedBuilder&&<form onSubmit={createStaffInvite} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Invite builder team member</h2><div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto]"><input required type="email" className={inputClass} placeholder="team@builder.com" value={staffInvite.email} onChange={e=>setStaffInvite({...staffInvite,email:e.target.value})}/><select className={inputClass} value={staffInvite.role} onChange={e=>setStaffInvite({...staffInvite,role:e.target.value})}><option value="sales">Sales</option><option value="admin">Admin</option><option value="owner">Owner</option></select><button disabled={busy} className={primary}>Create invite</button></div>{staffInviteLink&&<div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"><div className="break-all">{staffInviteLink}</div><button type="button" className={`${secondary} mt-3`} onClick={()=>void navigator.clipboard.writeText(staffInviteLink)}><Copy className="size-4"/>Copy invite link</button></div>}</form>}
    </>}
  </div></main>;
}
