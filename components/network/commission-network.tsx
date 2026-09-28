'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, ClipboardCheck, Handshake, Plus, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';
import { calculateCommissionPool } from '@/lib/commission-v2';

const inputClass='w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const primaryButton='inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50';
const secondaryButton='inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

const money=(value:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(value||0);

type Profile={id:string;broker_code:string;display_name:string;firm:string};
type Deal={id:string;buyer_user_id:string;listing_user_id:string;status:string;last_offer:number|null;property_id:string;requirement_id:string};
type Agreement={id:string;deal_id:string;version:number;status:'proposed'|'accepted'|'rejected'|'superseded';method:'fixed'|'percentage';fixed_amount:number|null;percentage:number|null;fee_payer:string;due_date:string|null;terms:string;proposed_by_user_id:string;effective_at:string|null;created_at:string};
type Allocation={id:string;agreement_id:string;deal_id:string;broker_user_id:string;role:'buyer_broker'|'listing_broker'|'referral_broker';share_percent:number;sequence:number};
type Acceptance={agreement_id:string;user_id:string;decision:'accepted'|'rejected';note:string};
type Referral={id:string;deal_id:string;broker_user_id:string;introduced_by_user_id:string;protection_expires_at:string|null;note:string};
type Dispute={id:string;deal_id:string;agreement_id:string|null;raised_by_user_id:string;against_user_id:string|null;amount_disputed:number|null;reason:string;status:string;resolution:string;created_at:string};

function brokerLabel(profiles:Profile[],id:string){const p=profiles.find(x=>x.id===id);return p?`${p.display_name} · ${p.firm}`:id.slice(0,8);}
function roleLabel(role:string){return role==='buyer_broker'?'Buyer broker':role==='listing_broker'?'Listing broker':'Referral broker';}

export default function CommissionNetwork(){
 const supabase=useMemo(()=>getSupabaseNetworkClient(),[]);
 const [userId,setUserId]=useState('');
 const [profiles,setProfiles]=useState<Profile[]>([]),[deals,setDeals]=useState<Deal[]>([]),[agreements,setAgreements]=useState<Agreement[]>([]),[allocations,setAllocations]=useState<Allocation[]>([]),[acceptances,setAcceptances]=useState<Acceptance[]>([]),[referrals,setReferrals]=useState<Referral[]>([]),[disputes,setDisputes]=useState<Dispute[]>([]);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [form,setForm]=useState({dealId:'',method:'fixed' as 'fixed'|'percentage',fixedAmount:'100000',percentage:'2',listingShare:'50',referralBrokerId:'',referralShare:'0',feePayer:'seller',dueDate:'',terms:'Brokerage becomes payable on successful closing against the accepted GENZ deal record.'});
 const [referralNote,setReferralNote]=useState('Referral source recorded before commission allocation.');
 const [dispute,setDispute]=useState({dealId:'',agreementId:'',againstUserId:'',amount:'',reason:''});

 const load=useCallback(async()=>{
  setMessage('');
  const auth=await supabase.auth.getUser(); if(auth.error)throw auth.error; const uid=auth.data.user?.id||''; setUserId(uid); if(!uid)return;
  const results=await Promise.all([
   supabase.from('genz_profiles').select('id,broker_code,display_name,firm').order('display_name'),
   supabase.from('genz_deals').select('id,buyer_user_id,listing_user_id,status,last_offer,property_id,requirement_id').order('created_at',{ascending:false}),
   supabase.from('genz_commission_agreements').select('*').order('version',{ascending:false}),
   supabase.from('genz_commission_allocations').select('*').order('sequence'),
   supabase.from('genz_commission_acceptances').select('*'),
   supabase.from('genz_referral_links').select('*').order('created_at',{ascending:false}),
   supabase.from('genz_commission_disputes').select('*').order('created_at',{ascending:false}),
  ]);
  for(const r of results)if(r.error)throw r.error;
  setProfiles((results[0].data||[]) as Profile[]); const ds=(results[1].data||[]) as Deal[]; setDeals(ds);
  setAgreements((results[2].data||[]) as Agreement[]); setAllocations((results[3].data||[]) as Allocation[]); setAcceptances((results[4].data||[]) as Acceptance[]); setReferrals((results[5].data||[]) as Referral[]); setDisputes((results[6].data||[]) as Dispute[]);
  setForm(v=>({...v,dealId:v.dealId||ds[0]?.id||''})); setDispute(v=>({...v,dealId:v.dealId||ds[0]?.id||''}));
 },[supabase]);
 useEffect(()=>{void load().catch(e=>setMessage(e instanceof Error?e.message:'Could not load commission workspace.'));},[load]);

 const selectedDeal=deals.find(d=>d.id===form.dealId);
 const referralShare=Number(form.referralShare||0),listingShare=Number(form.listingShare||0),buyerShare=100-listingShare-referralShare;
 const availableReferralBrokers=selectedDeal?profiles.filter(p=>![selectedDeal.buyer_user_id,selectedDeal.listing_user_id].includes(p.id)):[];

 async function registerReferral(){
  if(!form.dealId||!form.referralBrokerId)return setMessage('Choose a deal and referral broker first.');
  setBusy(true);setMessage('');try{const {error}=await supabase.rpc('genz_register_referral_link',{p_deal_id:form.dealId,p_broker_user_id:form.referralBrokerId,p_note:referralNote,p_protection_days:30});if(error)throw error;setMessage('Referral link protected and timestamped.');await load();}catch(e){setMessage(e instanceof Error?e.message:'Could not register referral.');}finally{setBusy(false);}
 }

 async function propose(event:FormEvent){
  event.preventDefault(); if(!selectedDeal)return;
  if(buyerShare<=0||listingShare<=0||referralShare<0)return setMessage('Buyer/listing shares must stay above 0 and all shares must total 100%.');
  if(referralShare>0&&!form.referralBrokerId)return setMessage('Choose a protected referral broker or set referral share to 0.');
  const rows:any[]=[{brokerUserId:selectedDeal.buyer_user_id,role:'buyer_broker',sharePercent:buyerShare},{brokerUserId:selectedDeal.listing_user_id,role:'listing_broker',sharePercent:listingShare}];
  if(referralShare>0)rows.push({brokerUserId:form.referralBrokerId,role:'referral_broker',sharePercent:referralShare});
  setBusy(true);setMessage('');try{const {error}=await supabase.rpc('genz_propose_commission_agreement',{p_deal_id:selectedDeal.id,p_method:form.method,p_fixed_amount:form.method==='fixed'?Number(form.fixedAmount):null,p_percentage:form.method==='percentage'?Number(form.percentage):null,p_fee_payer:form.feePayer,p_due_date:form.dueDate||null,p_terms:form.terms,p_allocations:rows});if(error)throw error;setMessage('Commission agreement proposed. Your acceptance is recorded; the other deal broker must accept.');await load();}catch(e){setMessage(e instanceof Error?e.message:'Could not propose agreement.');}finally{setBusy(false);}
 }

 async function respond(id:string,accept:boolean){setBusy(true);setMessage('');try{const {data,error}=await supabase.rpc('genz_respond_commission_agreement',{p_agreement_id:id,p_accept:accept,p_note:accept?'Accepted from Commission workspace':'Rejected; revised terms required'});if(error)throw error;setMessage(`Agreement ${String(data||accept?'accepted':'rejected')}.`);await load();}catch(e){setMessage(e instanceof Error?e.message:'Could not record decision.');}finally{setBusy(false);}}

 async function raiseDispute(event:FormEvent){event.preventDefault();setBusy(true);setMessage('');try{const {error}=await supabase.rpc('genz_raise_commission_dispute',{p_deal_id:dispute.dealId,p_agreement_id:dispute.agreementId||null,p_against_user_id:dispute.againstUserId||null,p_amount_disputed:dispute.amount?Number(dispute.amount):null,p_reason:dispute.reason});if(error)throw error;setDispute(v=>({...v,amount:'',reason:''}));setMessage('Commission dispute opened with a timestamped audit event.');await load();}catch(e){setMessage(e instanceof Error?e.message:'Could not open dispute.');}finally{setBusy(false);}}

 return <div className="space-y-7">
  <section><div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Phase 2.3</div><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="mt-1 text-3xl font-bold tracking-tight">Commission & Referral Protection</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Lock transparent brokerage terms, protect referral brokers and keep both deal participants on the same accepted version. GENZ records entitlement evidence; it does not hold client money.</p></div><button className={secondaryButton} onClick={()=>void load()}><RefreshCw className="size-4"/>Refresh</button></div></section>
  {message&&<div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{message}</div>}
  <div className="grid gap-5 xl:grid-cols-[430px_1fr]">
   <form onSubmit={propose} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Handshake className="size-5 text-blue-600"/><h2 className="font-bold">Propose commission terms</h2></div><div className="mt-4 grid gap-3">
    <select className={inputClass} value={form.dealId} onChange={e=>setForm({...form,dealId:e.target.value,referralBrokerId:''})}><option value="">Select deal room</option>{deals.map(d=><option key={d.id} value={d.id}>{d.id} · {d.status}</option>)}</select>
    <select className={inputClass} value={form.method} onChange={e=>setForm({...form,method:e.target.value as 'fixed'|'percentage'})}><option value="fixed">Fixed total brokerage</option><option value="percentage">Percentage of final selling price</option></select>
    {form.method==='fixed'?<input className={inputClass} type="number" min="1" step="0.01" value={form.fixedAmount} onChange={e=>setForm({...form,fixedAmount:e.target.value})} placeholder="Total brokerage ₹"/>:<input className={inputClass} type="number" min="0.01" max="100" step="0.01" value={form.percentage} onChange={e=>setForm({...form,percentage:e.target.value})} placeholder="Brokerage %"/>}
    <label className="text-xs font-semibold text-slate-600">Listing broker share %<input className={`${inputClass} mt-1`} type="number" min="0.01" max="99.99" step="0.01" value={form.listingShare} onChange={e=>setForm({...form,listingShare:e.target.value})}/></label>
    <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Buyer broker <b>{buyerShare.toFixed(2)}%</b> · Listing broker <b>{listingShare.toFixed(2)}%</b>{referralShare>0?<> · Referral <b>{referralShare.toFixed(2)}%</b></>:null}</div>
    <select className={inputClass} value={form.referralBrokerId} onChange={e=>setForm({...form,referralBrokerId:e.target.value})}><option value="">No referral broker</option>{availableReferralBrokers.map(p=><option key={p.id} value={p.id}>{p.display_name} · {p.broker_code}</option>)}</select>
    <input className={inputClass} type="number" min="0" max="98" step="0.01" value={form.referralShare} onChange={e=>setForm({...form,referralShare:e.target.value})} placeholder="Referral share %"/>
    {form.referralBrokerId&&<div className="rounded-xl border border-slate-200 p-3"><textarea className={inputClass} maxLength={800} value={referralNote} onChange={e=>setReferralNote(e.target.value)}/><button type="button" disabled={busy} className={`${secondaryButton} mt-2 w-full`} onClick={()=>void registerReferral()}><ShieldCheck className="size-4"/>Protect referral first</button></div>}
    <select className={inputClass} value={form.feePayer} onChange={e=>setForm({...form,feePayer:e.target.value})}><option value="seller">Seller / owner pays</option><option value="buyer">Buyer pays</option><option value="builder">Builder pays</option><option value="both">Buyer + seller split</option><option value="other">Other documented payer</option></select>
    <input className={inputClass} type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/>
    <textarea required className={inputClass} maxLength={2500} rows={4} value={form.terms} onChange={e=>setForm({...form,terms:e.target.value})}/>
    <button disabled={busy||!selectedDeal} className={primaryButton}><Plus className="size-4"/>{busy?'Saving…':'Propose & accept my terms'}</button>
   </div></form>
   <section className="space-y-4"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><ClipboardCheck className="size-5 text-blue-600"/><h2 className="font-bold">Agreement versions</h2></div><p className="mt-1 text-xs text-slate-500">An accepted version stays effective until both deal participants accept a replacement.</p></div>
    {deals.map(deal=>{const versions=agreements.filter(a=>a.deal_id===deal.id);if(!versions.length)return null;return <article key={deal.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div><b>{deal.id}</b><div className="text-xs text-slate-500">{brokerLabel(profiles,deal.buyer_user_id)} ↔ {brokerLabel(profiles,deal.listing_user_id)}</div></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{deal.status}</span></div><div className="mt-4 space-y-3">{versions.map(a=>{const rows=allocations.filter(x=>x.agreement_id===a.id);const decisions=acceptances.filter(x=>x.agreement_id===a.id);const myDecision=decisions.find(x=>x.user_id===userId);let estimate:number|null=null;try{estimate=calculateCommissionPool(a.method==='fixed'?{method:'fixed',fixedAmount:Number(a.fixed_amount)}:{method:'percentage',percentage:Number(a.percentage),finalPrice:Number(deal.last_offer||0)});}catch{}return <div key={a.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><b>Version {a.version} · {a.method==='fixed'?money(Number(a.fixed_amount)):`${Number(a.percentage)}% of final price`}</b><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${a.status==='accepted'?'bg-emerald-50 text-emerald-700':a.status==='proposed'?'bg-blue-50 text-blue-700':'bg-slate-100 text-slate-600'}`}>{a.status}</span></div>{estimate!==null&&<div className="mt-2 text-xs text-slate-500">{a.method==='fixed'?'Locked commission pool':'Illustration at latest offer'}: <b className="text-slate-800">{money(estimate)}</b></div>}<div className="mt-3 grid gap-2 sm:grid-cols-3">{rows.map(r=><div key={r.id} className="rounded-lg bg-slate-50 p-2 text-xs"><b>{roleLabel(r.role)}</b><div>{brokerLabel(profiles,r.broker_user_id)}</div><div className="text-blue-700">{Number(r.share_percent)}%</div></div>)}</div><div className="mt-3 text-xs leading-5 text-slate-600">Fee payer: <b>{a.fee_payer}</b>{a.due_date?<> · Due <b>{a.due_date}</b></>:null}<br/>{a.terms}</div><div className="mt-3 flex flex-wrap gap-2 text-xs">{decisions.map(x=><span key={x.user_id} className="rounded-full bg-slate-100 px-2 py-1">{brokerLabel(profiles,x.user_id)} · {x.decision}</span>)}</div>{a.status==='proposed'&&[deal.buyer_user_id,deal.listing_user_id].includes(userId)&&!myDecision&&<div className="mt-3 flex gap-2"><button disabled={busy} className={primaryButton} onClick={()=>void respond(a.id,true)}><CheckCircle2 className="size-4"/>Accept</button><button disabled={busy} className={secondaryButton} onClick={()=>void respond(a.id,false)}><XCircle className="size-4"/>Reject</button></div>}</div>})}</div></article>})}
    {!agreements.length&&<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No commission agreement yet. Select a Deal Room and propose the first transparent version.</div>}
   </section>
  </div>
  <section className="grid gap-5 xl:grid-cols-[1fr_1fr]"><form onSubmit={raiseDispute} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Open commission dispute</h2><p className="mt-1 text-xs text-slate-500">Opening a dispute records evidence workflow; it does not automatically penalize the other broker's Trust Score.</p><div className="mt-4 grid gap-3"><select required className={inputClass} value={dispute.dealId} onChange={e=>setDispute({...dispute,dealId:e.target.value,agreementId:''})}><option value="">Deal room</option>{deals.map(d=><option key={d.id} value={d.id}>{d.id}</option>)}</select><select className={inputClass} value={dispute.agreementId} onChange={e=>setDispute({...dispute,agreementId:e.target.value})}><option value="">Any agreement version</option>{agreements.filter(a=>a.deal_id===dispute.dealId).map(a=><option key={a.id} value={a.id}>Version {a.version} · {a.status}</option>)}</select><select className={inputClass} value={dispute.againstUserId} onChange={e=>setDispute({...dispute,againstUserId:e.target.value})}><option value="">No broker specified</option>{profiles.filter(p=>p.id!==userId).map(p=><option key={p.id} value={p.id}>{p.display_name} · {p.broker_code}</option>)}</select><input className={inputClass} type="number" min="0" step="0.01" placeholder="Amount disputed (optional)" value={dispute.amount} onChange={e=>setDispute({...dispute,amount:e.target.value})}/><textarea required minLength={10} maxLength={2000} rows={4} className={inputClass} placeholder="What is disputed and what evidence should admin review?" value={dispute.reason} onChange={e=>setDispute({...dispute,reason:e.target.value})}/><button disabled={busy} className={secondaryButton}>Open dispute</button></div></form>
   <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Referral & dispute audit</h2><div className="mt-4 space-y-3">{referrals.map(r=><div key={r.id} className="rounded-xl bg-slate-50 p-3 text-xs"><b>Referral · {brokerLabel(profiles,r.broker_user_id)}</b><div>Deal {r.deal_id}</div><div className="text-slate-500">Protected until {r.protection_expires_at?new Date(r.protection_expires_at).toLocaleString('en-IN'):'not set'}</div></div>)}{disputes.map(d=><div key={d.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><b>Dispute · {d.status}</b><div>Deal {d.deal_id}{d.amount_disputed!==null?` · ${money(Number(d.amount_disputed))}`:''}</div><div className="mt-1">{d.reason}</div>{d.resolution&&<div className="mt-1 font-semibold">Resolution: {d.resolution}</div>}</div>)}{!referrals.length&&!disputes.length&&<div className="text-sm text-slate-500">No referral or dispute audit events yet.</div>}</div></div>
  </section>
 </div>;
}
