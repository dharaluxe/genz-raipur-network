'use client';

import { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, MapPin, ShieldCheck } from 'lucide-react';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';

const money=(value:number|string|null)=>value==null?'—':new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(value));

type Grant={
  id:string; property_id:string|null; status:string; can_view_price:boolean; can_view_photos:boolean;
  can_view_videos:boolean; can_view_approx_location:boolean; can_view_exact_location:boolean;
  can_view_documents:boolean; can_view_owner_contact:boolean; allow_download:boolean; expires_at:string|null;
};
type Shared={
  grant_id:string; source_type:string; source_id:string; title:string; city:string; locality:string|null;
  property_type:string; size:number; price:number|string|null; latitude:number|string|null; longitude:number|string|null;
  can_view_price:boolean; can_view_photos:boolean; can_view_videos:boolean; can_view_approx_location:boolean;
  can_view_exact_location:boolean; can_view_documents:boolean; can_view_owner_contact:boolean; allow_download:boolean;
  note:string; expires_at:string|null;
};
type Media={id:string;property_id:string|null;asset_type:string;file_name:string;storage_path:string;caption:string;is_cover:boolean;sort_order:number};
type Card={grant:Grant;shared:Shared;photos:Array<Media&{url:string}>};

export default function GrantedListingAccessSummary(){
  const supabase=useMemo(()=>getSupabaseNetworkClient(),[]);
  const [cards,setCards]=useState<Card[]>([]);
  const [error,setError]=useState('');

  useEffect(()=>{
    let cancelled=false;
    void(async()=>{
      try{
        const auth=await supabase.auth.getUser();
        const uid=auth.data.user?.id;
        if(auth.error||!uid)return;
        const {data:grantRows,error:grantError}=await supabase
          .from('genz_listing_share_grants')
          .select('id,property_id,status,can_view_price,can_view_photos,can_view_videos,can_view_approx_location,can_view_exact_location,can_view_documents,can_view_owner_contact,allow_download,expires_at')
          .eq('broker_user_id',uid)
          .eq('status','active')
          .not('property_id','is',null)
          .order('created_at',{ascending:false});
        if(grantError)throw grantError;
        const now=Date.now();
        const grants=((grantRows||[]) as Grant[]).filter(g=>!g.expires_at||new Date(g.expires_at).getTime()>now);
        const next:Card[]=[];
        for(const grant of grants){
          const {data:sharedRows,error:sharedError}=await supabase.rpc('genz_get_shared_listing',{p_grant_id:grant.id});
          if(sharedError)continue;
          const shared=(Array.isArray(sharedRows)?sharedRows[0]:sharedRows) as Shared|undefined;
          if(!shared||shared.source_type!=='property')continue;
          const photos:Array<Media&{url:string}>=[];
          if(grant.can_view_photos&&grant.property_id){
            const {data:mediaRows,error:mediaError}=await supabase
              .from('genz_listing_media')
              .select('id,property_id,asset_type,file_name,storage_path,caption,is_cover,sort_order')
              .eq('property_id',grant.property_id)
              .eq('asset_type','photo')
              .order('is_cover',{ascending:false})
              .order('sort_order',{ascending:true})
              .limit(6);
            if(!mediaError){
              for(const item of (mediaRows||[]) as Media[]){
                const {data:urlData}=await supabase.storage.from('genz-listing-media').createSignedUrl(item.storage_path,900);
                if(urlData?.signedUrl)photos.push({...item,url:urlData.signedUrl});
              }
            }
          }
          next.push({grant,shared,photos});
        }
        if(!cancelled){setCards(next);setError('');}
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Could not load approved listing access.');}
    })();
    return()=>{cancelled=true;};
  },[supabase]);

  if(!cards.length&&!error)return null;
  return <section className="mb-7 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm">
    <div className="flex items-start gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><ShieldCheck className="size-5"/></div>
      <div><div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Approved listing access</div><h2 className="mt-1 text-xl font-bold text-slate-950">Unlocked property details</h2><p className="mt-1 text-xs leading-5 text-slate-600">Only fields explicitly approved by the listing broker appear here. Owner contact and exact pin remain hidden unless separately granted.</p></div>
    </div>
    {error&&<div className="mt-4 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700">{error}</div>}
    <div className="mt-4 grid gap-4 xl:grid-cols-2">{cards.map(({grant,shared,photos})=><article key={grant.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {grant.can_view_photos&&photos[0]?<img src={photos[0].url} alt={photos[0].caption||shared.title} className="h-52 w-full object-cover"/>:grant.can_view_photos?<div className="grid h-28 place-items-center bg-slate-50 text-xs text-slate-500"><span className="inline-flex items-center gap-2"><ImageIcon className="size-4"/>Photo access granted; no photo uploaded yet.</span></div>:null}
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[11px] font-bold uppercase tracking-wide text-blue-600">{shared.source_id}</div><h3 className="mt-1 text-lg font-bold text-slate-950">{shared.title}</h3><div className="mt-1 text-xs text-slate-500">{shared.property_type} · {Number(shared.size).toLocaleString('en-IN')} sqft</div></div>{grant.can_view_price&&<div className="text-right"><div className="text-[10px] uppercase text-slate-400">Asking</div><div className="text-lg font-black text-slate-950">{money(shared.price)}</div></div>}</div>
        {(grant.can_view_approx_location||grant.can_view_exact_location)&&<div className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-700"><MapPin className="size-4 text-blue-600"/>{shared.locality?`${shared.locality}, `:''}{shared.city}</div>}
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide">{grant.can_view_price&&<span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Price unlocked</span>}{grant.can_view_photos&&<span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">Photos unlocked</span>}{grant.can_view_approx_location&&<span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">Approx location</span>}{grant.can_view_exact_location&&<span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">Exact pin</span>}</div>
        {grant.can_view_photos&&photos.length>1&&<div className="mt-3 grid grid-cols-4 gap-2">{photos.slice(1,5).map(photo=><img key={photo.id} src={photo.url} alt={photo.caption||photo.file_name} className="h-16 w-full rounded-lg object-cover"/>)}</div>}
      </div>
    </article>)}</div>
  </section>;
}
