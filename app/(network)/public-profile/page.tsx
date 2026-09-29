'use client';

import Link from 'next/link';
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, Copy, Download, ExternalLink, Gavel, Share2, ShieldCheck } from 'lucide-react';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';
import { brokerInitials } from '@/lib/public-broker-verification';

type PublicBroker = { broker_code:string; display_name:string; firm:string; avatar_url:string|null; account_status:string };
type Appeal = { id:string; appealed_status:'suspended'|'removed'; reason:string; status:'pending'|'accepted'|'rejected'; admin_note:string|null; submitted_at:string; resolved_at:string|null };

export default function PublicProfileManagerPage(){
  const supabase=useMemo(()=>getSupabaseNetworkClient(),[]);
  const [userId,setUserId]=useState('');
  const [profile,setProfile]=useState<PublicBroker|null>(null);
  const [appeals,setAppeals]=useState<Appeal[]>([]);
  const [appealReason,setAppealReason]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [appealBusy,setAppealBusy]=useState(false);
  const [message,setMessage]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);setMessage('');
    try{
      const {data:auth,error:authError}=await supabase.auth.getUser();if(authError)throw authError;
      const uid=auth.user?.id||'';setUserId(uid);if(!uid)return;
      const {data:member,error:memberError}=await supabase.from('genz_profiles').select('broker_code').eq('id',uid).maybeSingle();
      if(memberError)throw memberError;if(!member)throw new Error('Approved GENZ broker membership required.');
      const {data,error}=await supabase.rpc('genz_public_broker_lookup',{p_broker_code:member.broker_code});if(error)throw error;
      const row=(Array.isArray(data)?data[0]:data) as PublicBroker|undefined;if(!row)throw new Error('Public broker profile could not be loaded.');
      setProfile(row);
      const {data:appealData,error:appealError}=await supabase.rpc('genz_list_my_broker_status_appeals');
      if(!appealError)setAppeals((appealData||[]) as Appeal[]);
    }catch(error){setMessage(error instanceof Error?error.message:'Could not load public profile.');}
    finally{setLoading(false);}
  },[supabase]);

  useEffect(()=>{void load();},[load]);

  const uploadAvatar=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];event.target.value='';if(!file||!userId)return;
    setBusy(true);setMessage('');
    try{
      if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Use JPG, PNG or WebP image.');
      if(file.size>5*1024*1024)throw new Error('Profile photo must be 5 MB or smaller.');
      const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
      const path=`${userId}/avatar-${Date.now()}.${ext}`;
      const {error:uploadError}=await supabase.storage.from('genz-broker-avatars').upload(path,file,{contentType:file.type,upsert:false});if(uploadError)throw uploadError;
      const {data:urlData}=supabase.storage.from('genz-broker-avatars').getPublicUrl(path);
      const avatarUrl=urlData.publicUrl;
      const {error}=await supabase.rpc('genz_set_public_broker_avatar',{p_avatar_url:avatarUrl});if(error)throw error;
      setMessage('Public broker photo updated.');await load();
    }catch(error){setMessage(error instanceof Error?error.message:'Photo upload failed.');}
    finally{setBusy(false);}
  };

  if(loading)return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading public broker profile…</div>;
  if(!userId)return <div className="rounded-xl border border-slate-200 bg-white p-6"><h1 className="text-xl font-black">Sign in required</h1><p className="mt-2 text-sm text-slate-600">Public profile settings are available to approved GENZ brokers.</p></div>;
  if(!profile)return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">{message||'Public profile unavailable.'}</div>;

  const publicPath=`/broker/${profile.broker_code}`;
  const qrPath=`/api/public-broker-qr?code=${encodeURIComponent(profile.broker_code)}`;
  const pendingAppeal=appeals.find(item=>item.status==='pending');
  const canAppeal=profile.account_status==='suspended'||profile.account_status==='removed';
  const copyLink=async()=>{const url=`${window.location.origin}${publicPath}`;await navigator.clipboard.writeText(url);setMessage('Public verification link copied.');};
  const shareLink=async()=>{
    const url=`${window.location.origin}${publicPath}`;
    try{
      if(navigator.share){await navigator.share({title:`Verify ${profile.display_name} on GENZ`,text:`GENZ Broker ID ${profile.broker_code}`,url});}
      else{await navigator.clipboard.writeText(url);setMessage('Public verification link copied for sharing.');}
    }catch(error){if(error instanceof Error&&error.name!=='AbortError')setMessage('Could not open sharing. You can copy the verification link instead.');}
  };
  const submitAppeal=async()=>{
    const reason=appealReason.trim();
    if(reason.length<20){setMessage('Appeal reason must be at least 20 characters.');return;}
    setAppealBusy(true);setMessage('');
    try{
      const {error}=await supabase.rpc('genz_submit_broker_status_appeal',{p_reason:reason});if(error)throw error;
      setAppealReason('');setMessage('Appeal submitted privately to GENZ admin for review.');await load();
    }catch(error){setMessage(error instanceof Error?error.message:'Appeal could not be submitted.');}
    finally{setAppealBusy(false);}
  };

  return <div className="space-y-6">
    <section><div className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">Public identity</div><h1 className="mt-1 text-3xl font-black">Public Broker Profile</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">This is the identity people can verify without logging in. Private phone, email, buyer data and internal dispute evidence are not published.</p></section>
    {message&&<div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{message}</div>}
    <section className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          {profile.avatar_url?<img src={profile.avatar_url} alt="Public broker avatar" className="size-20 rounded-2xl border border-slate-200 object-cover"/>:<div className="grid size-20 place-items-center rounded-2xl bg-blue-50 text-2xl font-black text-blue-700">{brokerInitials(profile.display_name)}</div>}
          <div><div className="font-black">{profile.display_name}</div><div className="text-sm text-slate-500">{profile.firm}</div><div className="mt-1 font-mono text-xs font-bold">{profile.broker_code}</div></div>
        </div>
        <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800">
          <Camera className="size-4"/>{busy?'Uploading…':'Upload public photo'}<input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={uploadAvatar}/>
        </label>
        <p className="mt-3 text-xs leading-5 text-slate-500">JPG, PNG or WebP · max 5 MB. This image is intentionally public because it is used for Broker-ID verification.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 font-black"><ShieldCheck className="size-5 text-blue-600"/>Public verification card</div>
        <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_170px] sm:items-center">
          <div><div className="rounded-xl bg-slate-50 p-4 font-mono text-sm break-all">{publicPath}</div><div className="mt-4 flex flex-wrap gap-3"><button onClick={()=>void copyLink()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black hover:bg-slate-50"><Copy className="size-4"/>Copy link</button><button onClick={()=>void shareLink()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black hover:bg-slate-50"><Share2 className="size-4"/>Share</button><Link href={publicPath} target="_blank" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-700">Open profile<ExternalLink className="size-4"/></Link></div></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center"><img src={qrPath} alt={`QR to verify ${profile.broker_code}`} className="mx-auto aspect-square w-full max-w-36 rounded-lg"/><a href={qrPath} download={`${profile.broker_code}-verification-qr.png`} className="mt-2 inline-flex items-center gap-1 text-xs font-black text-blue-700"><Download className="size-3.5"/>Download QR</a></div>
        </div>
        <div className="mt-6 rounded-xl border border-slate-200 p-4 text-sm"><b>Current public status:</b> <span className="capitalize">{profile.account_status.replace('_',' ')}</span></div>
      </div>
    </section>

    {(canAppeal||appeals.length>0)&&<section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 font-black"><Gavel className="size-5 text-rose-600"/>Account status appeal</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">Appeals are private between the broker and GENZ admin. Appeal text is not shown on the public verification page.</p>
      {canAppeal&&!pendingAppeal&&<div className="mt-5"><textarea value={appealReason} onChange={e=>setAppealReason(e.target.value.slice(0,2000))} rows={5} placeholder="Explain why the suspension/removal should be reviewed. Include factual context and references; do not include unnecessary third-party personal data." className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"/><div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-slate-400">{appealReason.trim().length}/2000 · minimum 20 characters</span><button disabled={appealBusy||appealReason.trim().length<20} onClick={()=>void submitAppeal()} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">{appealBusy?'Submitting…':'Submit appeal'}</button></div></div>}
      {pendingAppeal&&<div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Appeal pending.</b> Submitted {new Date(pendingAppeal.submitted_at).toLocaleString('en-IN')}. You cannot submit another appeal until this one is resolved.</div>}
      {appeals.length>0&&<div className="mt-5 space-y-3"><h2 className="text-sm font-black">Appeal history</h2>{appeals.map(item=><article key={item.id} className="rounded-xl border border-slate-200 p-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-black capitalize">{item.appealed_status} appeal</span><span className={`rounded-full px-2.5 py-1 text-xs font-black capitalize ${item.status==='accepted'?'bg-emerald-50 text-emerald-700':item.status==='rejected'?'bg-rose-50 text-rose-700':'bg-amber-50 text-amber-700'}`}>{item.status}</span></div><p className="mt-2 whitespace-pre-wrap text-slate-600">{item.reason}</p><div className="mt-3 text-xs text-slate-400">Submitted {new Date(item.submitted_at).toLocaleString('en-IN')}{item.resolved_at?` · Resolved ${new Date(item.resolved_at).toLocaleString('en-IN')}`:''}</div>{item.admin_note&&<div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-700"><b>GENZ review note:</b> {item.admin_note}</div>}</article>)}</div>}
    </section>}
  </div>;
}
