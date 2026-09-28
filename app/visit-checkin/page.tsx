'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { LogIn, MapPinned, QrCode, ShieldCheck } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';

const inputClass='w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

export default function VisitCheckinPage(){
  const supabase=useMemo(()=>getSupabaseNetworkClient(),[]);
  const [user,setUser]=useState<User|null>(null);
  const [visitId,setVisitId]=useState('');
  const [token,setToken]=useState('');
  const [coords,setCoords]=useState<{lat?:number;lng?:number}>({});
  const [auth,setAuth]=useState({email:'',password:''});
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    setVisitId(params.get('visit')||'');setToken(params.get('token')||'');
    void supabase.auth.getUser().then(({data})=>setUser(data.user));
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>setUser(session?.user||null));
    return()=>data.subscription.unsubscribe();
  },[supabase]);

  const signIn=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setMessage('');try{const {error}=await supabase.auth.signInWithPassword({email:auth.email.trim(),password:auth.password});if(error)throw error;setMessage('Signed in. You can verify the visit now.');}catch(err){setMessage(err instanceof Error?err.message:'Sign in failed.');}finally{setBusy(false);}};

  const captureLocation=()=>{
    if(!navigator.geolocation){setMessage('Location is not available in this browser.');return;}
    navigator.geolocation.getCurrentPosition(pos=>{setCoords({lat:pos.coords.latitude,lng:pos.coords.longitude});setMessage('Current location captured.');},()=>setMessage('Location permission was not granted.'),{enableHighAccuracy:true,timeout:10000});
  };

  const verify=async()=>{setBusy(true);setMessage('');try{if(!user)throw new Error('Sign in with the invited GENZ broker account first.');if(!visitId||!token)throw new Error('This QR/check-in link is incomplete.');const {data,error}=await supabase.rpc('genz_verify_visit_qr',{p_visit_id:visitId,p_token:token,p_latitude:coords.lat??null,p_longitude:coords.lng??null});if(error)throw error;const row=Array.isArray(data)?data[0]:data;if(!row?.verified)throw new Error(row?.message||'Visit could not be verified.');setMessage(row.message||'Visit verified by QR.');}catch(err){setMessage(err instanceof Error?err.message:'Visit verification failed.');}finally{setBusy(false);}};

  return <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-950"><div className="mx-auto max-w-lg space-y-5">
    <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm"><div className="grid size-12 place-items-center rounded-2xl bg-blue-600 text-white"><QrCode className="size-6"/></div><h1 className="mt-5 text-2xl font-bold">GENZ site-visit QR check-in</h1><p className="mt-2 text-sm leading-6 text-slate-600">Only the other approved broker on the deal can confirm a visit. The broker who issued the QR cannot self-verify it.</p><div className="mt-5 rounded-xl bg-slate-50 p-4 text-xs text-slate-600"><b>Visit:</b> {visitId||'Missing'}<br/><b>Token:</b> {token?'Secure token loaded':'Missing'}</div></section>
    {!user?<form onSubmit={signIn} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm"><div className="flex items-center gap-2"><LogIn className="size-5 text-blue-600"/><h2 className="font-bold">Broker sign in</h2></div><p className="mt-2 text-xs leading-5 text-slate-500">Public or uninvited accounts cannot verify visits even if they have the QR link.</p><div className="mt-4 space-y-3"><input required type="email" className={inputClass} placeholder="Email" value={auth.email} onChange={e=>setAuth({...auth,email:e.target.value})}/><input required type="password" className={inputClass} placeholder="Password" value={auth.password} onChange={e=>setAuth({...auth,password:e.target.value})}/><button disabled={busy} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Sign in</button></div></form>:
    <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-emerald-600"/><h2 className="font-bold">Signed in as {user.email}</h2></div><button type="button" onClick={captureLocation} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold"><MapPinned className="size-4"/>Attach current GPS</button>{coords.lat&&<div className="mt-2 text-center text-xs text-slate-500">{coords.lat.toFixed(5)}, {coords.lng?.toFixed(5)}</div>}<button disabled={busy||!visitId||!token} onClick={()=>void verify()} className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy?'Verifying…':'Verify this site visit'}</button></section>}
    {message&&<div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{message}</div>}
  </div></main>;
}
