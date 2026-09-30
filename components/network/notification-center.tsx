'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Check, CheckCircle2, Clock3, ExternalLink, RefreshCw, RotateCcw, X } from 'lucide-react';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';

const primaryButton='inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50';
const secondaryButton='inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

type NotificationRow={
  id:string;kind:string;title:string;body:string;entity_type:string;entity_id:string;action_path:string;severity:'info'|'action'|'urgent';read_at:string|null;dismissed_at:string|null;created_at:string;
};
type FollowupRow={
  id:string;kind:string;entity_type:string;entity_id:string;title:string;note:string;action_path:string;due_at:string;status:'pending'|'snoozed'|'done'|'cancelled';snoozed_until:string|null;completed_at:string|null;created_at:string;updated_at:string;
};

function formatTime(value:string|null){
  if(!value)return '—';
  return new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
}
function severityClass(severity:string){
  if(severity==='urgent')return 'bg-rose-100 text-rose-800';
  if(severity==='action')return 'bg-amber-100 text-amber-800';
  return 'bg-blue-50 text-blue-700';
}
function followupClass(row:FollowupRow){
  if(row.status==='done')return 'bg-emerald-100 text-emerald-800';
  if(row.status==='snoozed')return 'bg-violet-100 text-violet-800';
  return new Date(row.due_at).getTime()<=Date.now()?'bg-rose-100 text-rose-800':'bg-amber-100 text-amber-800';
}

export default function NotificationCenter(){
  const supabase=useMemo(()=>getSupabaseNetworkClient(),[]);
  const [gate,setGate]=useState<'checking'|'member'|'blocked'>('checking');
  const [notifications,setNotifications]=useState<NotificationRow[]>([]);
  const [followups,setFollowups]=useState<FollowupRow[]>([]);
  const [tab,setTab]=useState<'notifications'|'followups'>('notifications');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');

  const load=useCallback(async()=>{
    setMessage('');
    try{
      const auth=await supabase.auth.getUser();
      const uid=auth.data.user?.id;
      if(auth.error||!uid){setGate('blocked');return;}
      const member=await supabase.from('genz_profiles').select('id').eq('id',uid).maybeSingle();
      if(member.error||!member.data){setGate('blocked');return;}
      setGate('member');
      const refresh=await supabase.rpc('genz_refresh_my_followups');
      if(refresh.error)throw refresh.error;
      const [notificationRes,followupRes]=await Promise.all([
        supabase.from('genz_notifications').select('id,kind,title,body,entity_type,entity_id,action_path,severity,read_at,dismissed_at,created_at').is('dismissed_at',null).order('created_at',{ascending:false}).limit(100),
        supabase.from('genz_followups').select('id,kind,entity_type,entity_id,title,note,action_path,due_at,status,snoozed_until,completed_at,created_at,updated_at').neq('status','cancelled').order('due_at',{ascending:true}).limit(100),
      ]);
      if(notificationRes.error)throw notificationRes.error;
      if(followupRes.error)throw followupRes.error;
      setNotifications((notificationRes.data||[]) as NotificationRow[]);
      setFollowups((followupRes.data||[]) as FollowupRow[]);
    }catch(error){setMessage(error instanceof Error?error.message:'Could not load notifications.');}
  },[supabase]);

  useEffect(()=>{void load();},[load]);

  async function notificationAction(id:string,action:'read'|'unread'|'dismiss'){
    setBusy(true);setMessage('');
    try{const {error}=await supabase.rpc('genz_mark_notification',{p_notification_id:id,p_action:action});if(error)throw error;await load();}
    catch(error){setMessage(error instanceof Error?error.message:'Could not update notification.');}
    finally{setBusy(false);}
  }
  async function readAll(){
    setBusy(true);setMessage('');
    try{const {error}=await supabase.rpc('genz_mark_all_notifications_read');if(error)throw error;await load();}
    catch(error){setMessage(error instanceof Error?error.message:'Could not mark notifications read.');}
    finally{setBusy(false);}
  }
  async function followupAction(id:string,action:'done'|'snooze'|'reopen'|'dismiss',hours=24){
    setBusy(true);setMessage('');
    try{const {error}=await supabase.rpc('genz_update_followup',{p_followup_id:id,p_action:action,p_snooze_hours:hours});if(error)throw error;await load();}
    catch(error){setMessage(error instanceof Error?error.message:'Could not update follow-up.');}
    finally{setBusy(false);}
  }

  const unread=notifications.filter(x=>!x.read_at).length;
  const due=followups.filter(x=>x.status==='pending'&&new Date(x.due_at).getTime()<=Date.now()).length;
  const activeFollowups=followups.filter(x=>x.status!=='done');
  const completedFollowups=followups.filter(x=>x.status==='done');

  if(gate==='checking')return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading notification center…</div>;
  if(gate==='blocked')return <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><Bell className="size-7 text-blue-600"/><h1 className="mt-4 text-xl font-bold">Broker sign-in required</h1><p className="mt-2 text-sm text-slate-600">Notifications and follow-ups are private to the signed-in GENZ broker.</p><Link href="/dashboard" className={`${primaryButton} mt-5`}>Go to secure sign in</Link></div>;

  return <div className="space-y-7">
    <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Broker workflow</div><h1 className="mt-1 text-3xl font-bold tracking-tight">Notifications & Follow-ups</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Private action inbox for broker collaboration. Notifications only expose records your account is already allowed to access.</p></div>
      <div className="flex flex-wrap gap-2"><button className={secondaryButton} disabled={busy} onClick={()=>void load()}><RefreshCw className="size-4"/>Refresh</button><button className={secondaryButton} disabled={busy||unread===0} onClick={()=>void readAll()}><Check className="size-4"/>Mark all read</button></div>
    </section>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-semibold text-slate-500">Unread notifications</div><div className="mt-1 text-2xl font-black">{unread}</div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-semibold text-slate-500">Due follow-ups</div><div className="mt-1 text-2xl font-black">{due}</div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs font-semibold text-slate-500">Active follow-ups</div><div className="mt-1 text-2xl font-black">{activeFollowups.length}</div></div>
    </div>

    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900"><b>Offer privacy:</b> each buyer broker operates inside a separate Deal Room for that property. The listing broker can receive offers from multiple buyer brokers, but one buyer broker cannot see another buyer broker&apos;s Deal Room or offer unless explicitly added to that specific room as an authorized participant.</div>
    {message&&<div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{message}</div>}

    <div className="flex flex-wrap gap-2"><button className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab==='notifications'?'bg-slate-950 text-white':'bg-slate-100 text-slate-700'}`} onClick={()=>setTab('notifications')}>Notifications ({unread} unread)</button><button className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab==='followups'?'bg-slate-950 text-white':'bg-slate-100 text-slate-700'}`} onClick={()=>setTab('followups')}>Follow-ups ({due} due)</button></div>

    {tab==='notifications'&&<section className="grid gap-3">{notifications.map(row=><article key={row.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${row.read_at?'border-slate-200':'border-blue-300 ring-1 ring-blue-100'}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${severityClass(row.severity)}`}>{row.severity}</span>{!row.read_at&&<span className="rounded-full bg-blue-600 px-2 py-1 text-[10px] font-bold uppercase text-white">New</span>}</div><h2 className="mt-3 font-bold text-slate-950">{row.title}</h2>{row.body&&<p className="mt-1 text-sm leading-6 text-slate-600">{row.body}</p>}<p className="mt-2 text-xs text-slate-400">{formatTime(row.created_at)}</p></div><div className="flex shrink-0 flex-wrap gap-2">{row.action_path&&<Link href={row.action_path} className={secondaryButton}><ExternalLink className="size-4"/>Open</Link>}{row.read_at?<button className={secondaryButton} disabled={busy} onClick={()=>void notificationAction(row.id,'unread')}><RotateCcw className="size-4"/>Unread</button>:<button className={secondaryButton} disabled={busy} onClick={()=>void notificationAction(row.id,'read')}><Check className="size-4"/>Read</button>}<button className={secondaryButton} disabled={busy} onClick={()=>void notificationAction(row.id,'dismiss')}><X className="size-4"/>Dismiss</button></div></div></article>)}{notifications.length===0&&<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No active notifications.</div>}</section>}

    {tab==='followups'&&<div className="space-y-6"><section className="grid gap-3">{activeFollowups.map(row=><article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${followupClass(row)}`}>{row.status==='pending'&&new Date(row.due_at).getTime()<=Date.now()?'due':row.status}</span><span className="text-xs font-semibold text-slate-400">{row.kind.replaceAll('_',' ')}</span></div><h2 className="mt-3 font-bold">{row.title}</h2>{row.note&&<p className="mt-1 text-sm leading-6 text-slate-600">{row.note}</p>}<p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><Clock3 className="size-3.5"/>Due {formatTime(row.due_at)}{row.status==='snoozed'&&row.snoozed_until?` · snoozed until ${formatTime(row.snoozed_until)}`:''}</p></div><div className="flex shrink-0 flex-wrap gap-2">{row.action_path&&<Link href={row.action_path} className={secondaryButton}><ExternalLink className="size-4"/>Open</Link>}<button className={secondaryButton} disabled={busy} onClick={()=>void followupAction(row.id,'snooze',4)}><Clock3 className="size-4"/>4h</button><button className={secondaryButton} disabled={busy} onClick={()=>void followupAction(row.id,'snooze',24)}><Clock3 className="size-4"/>1d</button><button className={primaryButton} disabled={busy} onClick={()=>void followupAction(row.id,'done')}><CheckCircle2 className="size-4"/>Done</button></div></div></article>)}{activeFollowups.length===0&&<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No active follow-ups.</div>}</section>{completedFollowups.length>0&&<section><h2 className="mb-3 text-sm font-bold text-slate-500">Completed</h2><div className="grid gap-2">{completedFollowups.slice(0,20).map(row=><div key={row.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-semibold text-slate-700">{row.title}</div><div className="mt-1 text-xs text-slate-400">Completed {formatTime(row.completed_at)}</div></div><button className={secondaryButton} disabled={busy} onClick={()=>void followupAction(row.id,'reopen')}><RotateCcw className="size-4"/>Reopen</button></div>)}</div></section>}</div>}
  </div>;
}
