'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, UserRoundCog } from 'lucide-react';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';

const linkClass='flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white';

export default function AdminNavLinks(){
 const supabase=useMemo(()=>getSupabaseNetworkClient(),[]);
 const [isAdmin,setIsAdmin]=useState(false);
 useEffect(()=>{
  let active=true;
  void (async()=>{
   try{
    const {data,error}=await supabase.auth.getUser();
    if(error||!data.user?.id)return;
    const {data:profile,error:profileError}=await supabase.from('genz_profiles').select('is_admin').eq('id',data.user.id).maybeSingle();
    if(!profileError&&active)setIsAdmin(Boolean(profile?.is_admin));
   }catch{if(active)setIsAdmin(false);}
  })();
  return()=>{active=false;};
 },[supabase]);
 if(!isAdmin)return null;
 return <>
  <Link href="/broker-safety" className={linkClass}><ShieldCheck className="size-4"/>Broker Safety</Link>
  <Link href="/admin-control" className={linkClass}><UserRoundCog className="size-4"/>Admin Control</Link>
 </>;
}
