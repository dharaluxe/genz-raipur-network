'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, FileText, Gavel, LockKeyhole, Paperclip, RefreshCw, Send, ShieldCheck, Upload } from 'lucide-react';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';

const inputClass='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const primaryButton='inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50';
const secondaryButton='inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50';

type Deal={deal_id:string;buyer_broker_code:string;buyer_broker_name:string;listing_broker_code:string;listing_broker_name:string;property_title:string;property_city:string;status:string;participant_role:string};
type Dispute={dispute_id:string;deal_id:string;category:string;reason:string;status:string;resolution:string;raised_by_broker_code:string;raised_by_name:string;against_broker_code:string;against_name:string;is_raiser:boolean;created_at:string;resolved_at:string|null};
type Evidence={evidence_id:string;dispute_id:string;title:string;note:string;storage_path:string;original_name:string;mime_type:string;size_bytes:number|string;uploaded_by_broker_code:string;uploaded_by_name:string;is_mine:boolean;created_at:string};
type Profile={broker_code:string};

const categories=[
 ['broker_conduct','Broker conduct'],['property_information','Property information'],['site_visit','Site visit'],['introduction_protection','Introduction / protection'],['closure','Deal closure'],['other','Other'],
] as const;

function pretty(value:string){return value.replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());}
function when(value:string){return new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});}
function fileSize(value:number|string){const n=Number(value||0);return n>=1024*1024?`${(n/(1024*1024)).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1024))} KB`;}

export default function DisputeCenter(){
 const supabase=useMemo(()=>getSupabaseNetworkClient(),[]);
 const [gate,setGate]=useState<'checking'|'member'|'blocked'>('checking');
 const [ownCode,setOwnCode]=useState('');
 const [deals,setDeals]=useState<Deal[]>([]);
 const [disputes,setDisputes]=useState<Dispute[]>([]);
 const [evidence,setEvidence]=useState<Record<string,Evidence[]>>({});
 const [dealId,setDealId]=useState('');
 const [against,setAgainst]=useState('');
 const [category,setCategory]=useState('broker_conduct');
 const [reason,setReason]=useState('');
 const [busy,setBusy]=useState(false);
 const [evidenceBusy,setEvidenceBusy]=useState('');
 const [message,setMessage]=useState('');

 const load=useCallback(async()=>{
  setMessage('');
  try{
   const auth=await supabase.auth.getUser(); const uid=auth.data.user?.id;
   if(auth.error||!uid){setGate('blocked');return;}
   const [profileRes,dealsRes,disputesRes]=await Promise.all([
    supabase.from('genz_profiles').select('broker_code').eq('id',uid).maybeSingle(),
    supabase.rpc('genz_deal_room_snapshot'),
    supabase.rpc('genz_list_my_deal_disputes'),
   ]);
   if(profileRes.error)throw profileRes.error;if(!profileRes.data){setGate('blocked');return;}if(dealsRes.error)throw dealsRes.error;if(disputesRes.error)throw disputesRes.error;
   setGate('member'); const code=(profileRes.data as Profile).broker_code; setOwnCode(code);
   const rows=(dealsRes.data||[]) as Deal[]; setDeals(rows); setDisputes((disputesRes.data||[]) as Dispute[]);
   const chosen=dealId&&rows.some(x=>x.deal_id===dealId)?dealId:rows[0]?.deal_id||''; setDealId(chosen);
   const deal=rows.find(x=>x.deal_id===chosen); if(deal){const options=[deal.buyer_broker_code,deal.listing_broker_code].filter(x=>x&&x!==code);if(!against||!options.includes(against))setAgainst(options[0]||'');}
  }catch(e){setMessage(e instanceof Error?e.message:'Could not load disputes.');}
 },[supabase,dealId,against]);
 useEffect(()=>{void load();},[load]);

 const selected=deals.find(x=>x.deal_id===dealId)||null;
 const counterparties=selected?[{code:selected.buyer_broker_code,name:selected.buyer_broker_name},{code:selected.listing_broker_code,name:selected.listing_broker_name}].filter((x,i,a)=>x.code&&x.code!==ownCode&&a.findIndex(y=>y.code===x.code)===i):[];

 async function submit(){
  if(!dealId||!against){setMessage('Select a Deal Room and another broker.');return;} if(reason.trim().length<20){setMessage('Please describe the issue in at least 20 characters.');return;}
  setBusy(true);setMessage('');
  try{const {error}=await supabase.rpc('genz_raise_deal_dispute',{p_deal_id:dealId,p_against_broker_code:against,p_category:category,p_reason:reason.trim()});if(error)throw error;setReason('');setMessage('Private dispute submitted to GENZ admin review. You can add evidence from the dispute card below.');await load();}
  catch(e){const text=e instanceof Error?e.message:'Could not submit dispute.';setMessage(text.includes('ACTIVE_DISPUTE_EXISTS')?'An active dispute for this deal, broker and category already exists.':text);}
  finally{setBusy(false);}
 }

 async function loadEvidence(disputeId:string){
  setEvidenceBusy(disputeId);setMessage('');
  try{const {data,error}=await supabase.rpc('genz_list_dispute_evidence',{p_dispute_id:disputeId});if(error)throw error;setEvidence(v=>({...v,[disputeId]:(data||[]) as Evidence[]}));}
  catch(e){setMessage(e instanceof Error?e.message:'Could not load evidence.');}
  finally{setEvidenceBusy('');}
 }

 async function uploadEvidence(row:Dispute,file:File|null){
  if(!file)return;
  const allowed=['application/pdf','image/jpeg','image/png'];
  if(!allowed.includes(file.type)){setMessage('Evidence file must be PDF, JPG or PNG.');return;}
  if(file.size>10*1024*1024){setMessage('Evidence file must be 10 MB or smaller.');return;}
  setEvidenceBusy(row.dispute_id);setMessage('');
  try{
   const {data:auth,error:authError}=await supabase.auth.getUser();if(authError||!auth.user?.id)throw authError||new Error('Sign in required.');
   const safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,'-').slice(-120)||'evidence';
   const path=`${auth.user.id}/dispute/${row.dispute_id}/${crypto.randomUUID()}-${safeName}`;
   const {error:uploadError}=await supabase.storage.from('genz-property-docs').upload(path,file,{upsert:false,contentType:file.type});
   if(uploadError)throw uploadError;
   const {error}=await supabase.rpc('genz_register_deal_dispute_evidence',{p_dispute_id:row.dispute_id,p_title:file.name.slice(0,160),p_note:'',p_storage_path:path,p_original_name:file.name.slice(0,240),p_mime_type:file.type,p_size_bytes:file.size});
   if(error){await supabase.storage.from('genz-property-docs').remove([path]);throw error;}
   setMessage('Evidence uploaded privately. It is visible only to the two dispute parties and GENZ admins.');
   await loadEvidence(row.dispute_id);
  }catch(e){setMessage(e instanceof Error?e.message:'Evidence upload failed.');}
  finally{setEvidenceBusy('');}
 }

 async function openEvidence(item:Evidence){
  setMessage('');
  const {data,error}=await supabase.storage.from('genz-property-docs').createSignedUrl(item.storage_path,300);
  if(error){setMessage(error.message);return;}
  window.open(data.signedUrl,'_blank','noopener,noreferrer');
 }

 if(gate==='checking')return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading private dispute center…</div>;
 if(gate==='blocked')return <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"><LockKeyhole className="size-7 text-blue-600"/><h1 className="mt-4 text-xl font-black">Broker sign-in required</h1><p className="mt-2 text-sm text-slate-600">Deal disputes are private to approved GENZ members and involved brokers.</p><Link href="/login" className={`${primaryButton} mt-5`}>Sign in</Link></div>;

 return <div className="space-y-7">
  <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><div className="text-xs font-black uppercase tracking-[.18em] text-rose-600">Private support</div><h1 className="mt-1 text-3xl font-black">Disputes & Support</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Escalate a Deal Room issue to GENZ admin with an auditable private record. Raising a dispute does not create a public fraud label or automatically suspend any broker.</p></div><button className={secondaryButton} onClick={()=>void load()}><RefreshCw className="size-4"/>Refresh</button></header>
  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900"><ShieldCheck className="mr-1 inline size-4"/><b>Privacy rule:</b> dispute reason, evidence and resolution stay private to the two involved dispute parties and admins. Evidence files use short-lived signed links; other brokers do not gain access.</div>
  {message&&<div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">{message}</div>}

  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Gavel className="size-5 text-rose-600"/><h2 className="font-black">Raise a Deal Room dispute</h2></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><label className="text-xs font-bold text-slate-600">Deal Room<select className={`${inputClass} mt-1`} value={dealId} onChange={e=>{setDealId(e.target.value);setAgainst('');}}><option value="">Select Deal Room</option>{deals.map(d=><option key={d.deal_id} value={d.deal_id}>{d.deal_id} · {d.property_title} · {d.property_city}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Against broker<select className={`${inputClass} mt-1`} value={against} onChange={e=>setAgainst(e.target.value)}><option value="">Select broker</option>{counterparties.map(x=><option key={x.code} value={x.code}>{x.name} · {x.code}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Category<select className={`${inputClass} mt-1`} value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-bold text-slate-600 lg:col-span-2">What happened?<textarea className={`${inputClass} mt-1 min-h-28`} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Facts, dates, messages or evidence context. Avoid unsupported accusations."/></label></div><button className={`${primaryButton} mt-4`} disabled={busy||!dealId||!against} onClick={()=>void submit()}><Send className="size-4"/>{busy?'Submitting…':'Submit private dispute'}</button></section>

  <section><h2 className="text-xl font-black">Your dispute history</h2><div className="mt-3 grid gap-4">{disputes.map(row=>{
   const files=evidence[row.dispute_id];const working=evidenceBusy===row.dispute_id;const canUpload=row.status==='open'||row.status==='in_review';
   return <article key={row.dispute_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-black">{row.deal_id} · {pretty(row.category)}</div><div className="mt-1 text-xs text-slate-500">{row.is_raiser?`Raised against ${row.against_name} · ${row.against_broker_code}`:`Raised by ${row.raised_by_name} · ${row.raised_by_broker_code}`} · {when(row.created_at)}</div></div><span className={`rounded-full px-2.5 py-1 text-xs font-black ${row.status==='resolved'?'bg-emerald-50 text-emerald-700':row.status==='rejected'?'bg-slate-100 text-slate-700':'bg-amber-50 text-amber-700'}`}>{pretty(row.status)}</span></div><div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm whitespace-pre-wrap text-slate-700">{row.reason}</div>{row.resolution&&<div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><b>Admin resolution:</b> {row.resolution}</div>}
   <div className="mt-4 flex flex-wrap gap-2"><button className={secondaryButton} disabled={working} onClick={()=>void loadEvidence(row.dispute_id)}><Paperclip className="size-4"/>{working?'Loading…':'View evidence'}</button>{canUpload&&<label className={`${secondaryButton} cursor-pointer`}><Upload className="size-4"/>Add evidence<input type="file" className="hidden" accept="application/pdf,image/jpeg,image/png" disabled={working} onChange={e=>{const file=e.currentTarget.files?.[0]||null;e.currentTarget.value='';void uploadEvidence(row,file);}}/></label>}</div>
   {files&&<div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.12em] text-slate-500"><FileText className="size-4"/>Private evidence</div><div className="mt-3 space-y-2">{files.map(item=><div key={item.evidence_id} className="flex flex-col gap-2 rounded-xl bg-white p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-bold text-slate-800">{item.title}</div><div className="mt-1 text-[11px] text-slate-500">{item.uploaded_by_name} · {item.uploaded_by_broker_code} · {fileSize(item.size_bytes)} · {when(item.created_at)}</div>{item.note&&<div className="mt-1 text-xs text-slate-600">{item.note}</div>}</div><button className={secondaryButton} onClick={()=>void openEvidence(item)}><ExternalLink className="size-4"/>Open 5-min link</button></div>)}{!files.length&&<div className="text-xs text-slate-500">No evidence files added yet.</div>}</div></div>}
   </article>;
  })}{!disputes.length&&<div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500"><AlertTriangle className="mx-auto mb-2 size-5"/>No private Deal Room disputes yet.</div>}</div></section>
 </div>;
}
