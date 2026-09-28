'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BadgeCheck, ShieldCheck } from 'lucide-react';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';

const inputClass='w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

export default function OwnerConfirmPage(){
  const supabase=useMemo(()=>getSupabaseNetworkClient(),[]);
  const [token,setToken]=useState('');
  const [code,setCode]=useState('');
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<{ok:boolean;message:string;propertyId?:string}>({ok:false,message:''});

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    setToken(params.get('token')||'');
  },[]);

  const submit=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setResult({ok:false,message:''});
    try{
      if(!token.trim()) throw new Error('Confirmation link is missing its secure token.');
      if(!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit consent code.');
      const {data,error}=await supabase.rpc('genz_confirm_owner_consent',{p_token:token.trim(),p_code:code});
      if(error) throw error;
      const row=Array.isArray(data)?data[0]:data;
      setResult({ok:Boolean(row?.verified),message:row?.message||'Could not confirm consent.',propertyId:row?.property_id||undefined});
      if(row?.verified) setCode('');
    }catch(err){setResult({ok:false,message:err instanceof Error?err.message:'Confirmation failed.'});}
    finally{setBusy(false);}
  };

  return <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-950">
    <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
      <div className="grid size-12 place-items-center rounded-2xl bg-blue-600 text-white"><ShieldCheck className="size-6"/></div>
      <h1 className="mt-5 text-2xl font-bold">Confirm property-owner consent</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Enter the one-time code issued for this GENZ property confirmation. The code can be used only for the linked property and expires automatically.</p>
      <form className="mt-6 space-y-3" onSubmit={submit}>
        {!token&&<input className={inputClass} placeholder="Secure confirmation token" value={token} onChange={e=>setToken(e.target.value)}/>} 
        <input className={inputClass} inputMode="numeric" maxLength={6} placeholder="6-digit consent code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))}/>
        <button disabled={busy} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{busy?'Checking…':'Confirm consent'}</button>
      </form>
      {result.message&&<div className={`mt-5 rounded-xl border p-4 text-sm ${result.ok?'border-emerald-200 bg-emerald-50 text-emerald-900':'border-amber-200 bg-amber-50 text-amber-900'}`}>
        <div className="flex items-center gap-2 font-bold">{result.ok&&<BadgeCheck className="size-4"/>}{result.ok?'Consent recorded':'Confirmation status'}</div>
        <p className="mt-1">{result.message}</p>{result.propertyId&&<p className="mt-1 text-xs opacity-75">Property: {result.propertyId}</p>}
      </div>}
      <div className="mt-6 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600"><b>Important:</b> this records owner consent to the GENZ listing/mandate workflow. It is not a legal title certificate, ownership guarantee, or substitute for document due diligence.</div>
    </div>
  </main>;
}
