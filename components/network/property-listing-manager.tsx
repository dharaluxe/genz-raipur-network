'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ExternalLink, FileText, Image as ImageIcon, MapPin, RefreshCw, Save, ShieldCheck, Star, Trash2, Upload, Video } from 'lucide-react';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';
import { money, PROPERTY_TYPES } from '@/lib/demo-network';

const input='w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const primary='inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50';
const secondary='inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

type PropertyRow={
  id:string; title:string; city:string; locality:string|null; property_type:string; size:number; asking:number|string;
  description:string; latitude:number|string|null; longitude:number|string|null; mandate_status:string;
};
type PrivateRow={property_id:string; owner_name:string; owner_phone_e164:string|null; address:string};
type MediaRow={
  id:string; property_id:string|null; uploaded_by_user_id:string; asset_type:'photo'|'video'|'document'; file_name:string;
  storage_path:string; mime_type:string; size_bytes:number; caption:string; sort_order:number; is_cover:boolean; created_at:string;
};
type EditState={title:string;city:string;locality:string;type:string;size:string;asking:string;description:string;ownerName:string;ownerPhone:string;address:string;latitude:string;longitude:string};
const blank:EditState={title:'',city:'',locality:'',type:PROPERTY_TYPES[0],size:'',asking:'',description:'',ownerName:'',ownerPhone:'',address:'',latitude:'',longitude:''};

export default function PropertyListingManager(){
  const supabase=useMemo(()=>getSupabaseNetworkClient(),[]);
  const [uid,setUid]=useState('');
  const [properties,setProperties]=useState<PropertyRow[]>([]);
  const [privateRows,setPrivateRows]=useState<PrivateRow[]>([]);
  const [media,setMedia]=useState<MediaRow[]>([]);
  const [activeId,setActiveId]=useState('');
  const [edit,setEdit]=useState<EditState>(blank);
  const [assetType,setAssetType]=useState<'photo'|'video'|'document'>('photo');
  const [documentKind,setDocumentKind]=useState('brochure');
  const [file,setFile]=useState<File|null>(null);
  const [caption,setCaption]=useState('');
  const [signed,setSigned]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  const load=useCallback(async()=>{
    setError('');
    const auth=await supabase.auth.getUser();
    const userId=auth.data.user?.id;
    if(auth.error||!userId){setProperties([]);return;}
    setUid(userId);
    const [pRes,prRes,mRes]=await Promise.all([
      supabase.from('genz_properties').select('id,title,city,locality,property_type,size,asking,description,latitude,longitude,mandate_status').eq('listing_user_id',userId).order('updated_at',{ascending:false}),
      supabase.from('genz_property_private').select('property_id,owner_name,owner_phone_e164,address').eq('listing_user_id',userId),
      supabase.from('genz_listing_media').select('id,property_id,uploaded_by_user_id,asset_type,file_name,storage_path,mime_type,size_bytes,caption,sort_order,is_cover,created_at').order('sort_order').order('created_at',{ascending:false}),
    ]);
    if(pRes.error)throw pRes.error;if(prRes.error)throw prRes.error;if(mRes.error)throw mRes.error;
    const rows=(pRes.data||[]) as PropertyRow[];
    setProperties(rows);setPrivateRows((prRes.data||[]) as PrivateRow[]);setMedia((mRes.data||[]) as MediaRow[]);
    setActiveId(prev=>rows.some(x=>x.id===prev)?prev:(rows[0]?.id||''));
  },[supabase]);

  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Could not load listing manager.'));},[load]);

  const active=useMemo(()=>properties.find(x=>x.id===activeId)||null,[properties,activeId]);
  const privateRow=useMemo(()=>privateRows.find(x=>x.property_id===activeId)||null,[privateRows,activeId]);
  const activeMedia=useMemo(()=>media.filter(x=>x.property_id===activeId),[media,activeId]);

  useEffect(()=>{
    if(!active){setEdit(blank);return;}
    setEdit({
      title:active.title,city:active.city,locality:active.locality||'',type:active.property_type,size:String(active.size),asking:String(active.asking),description:active.description||'',
      ownerName:privateRow?.owner_name||'',ownerPhone:privateRow?.owner_phone_e164||'',address:privateRow?.address||'',
      latitude:active.latitude==null?'':String(active.latitude),longitude:active.longitude==null?'':String(active.longitude),
    });
  },[active,privateRow]);

  useEffect(()=>{
    let dead=false;
    void (async()=>{
      const next:Record<string,string>={};
      for(const item of activeMedia){
        const {data}=await supabase.storage.from('genz-listing-media').createSignedUrl(item.storage_path,900);
        if(data?.signedUrl)next[item.id]=data.signedUrl;
      }
      if(!dead)setSigned(next);
    })();
    return()=>{dead=true;};
  },[activeMedia,supabase]);

  function numbers(){
    const size=Number(edit.size),asking=Number(edit.asking),lat=edit.latitude.trim()?Number(edit.latitude):null,lng=edit.longitude.trim()?Number(edit.longitude):null;
    if(!edit.title.trim()||!edit.city.trim()||!edit.type||!edit.ownerName.trim())throw new Error('Title, city, property type and owner name are required.');
    if(!Number.isFinite(size)||size<=0||!Number.isFinite(asking)||asking<=0)throw new Error('Enter valid size and asking price.');
    if(lat!==null&&(!Number.isFinite(lat)||lat< -90||lat>90))throw new Error('Latitude must be between -90 and 90.');
    if(lng!==null&&(!Number.isFinite(lng)||lng< -180||lng>180))throw new Error('Longitude must be between -180 and 180.');
    return{size,asking,lat,lng};
  }

  async function save(event:FormEvent){
    event.preventDefault();if(!activeId)return;
    setBusy(true);setError('');setMessage('');
    try{
      const n=numbers();
      const {error:rpcError}=await supabase.rpc('genz_update_property_listing_v1',{
        p_property_id:activeId,p_title:edit.title.trim(),p_city:edit.city.trim(),p_locality:edit.locality.trim()||null,p_property_type:edit.type,
        p_size:n.size,p_asking:n.asking,p_description:edit.description.trim(),p_owner_name:edit.ownerName.trim(),p_owner_phone:edit.ownerPhone.trim()||null,
        p_address:edit.address.trim(),p_latitude:n.lat,p_longitude:n.lng,
      });
      if(rpcError)throw rpcError;
      setMessage('Listing details, private owner information and location updated.');await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not update listing.');}finally{setBusy(false);}
  }

  function useCurrentLocation(){
    setError('');
    if(!navigator.geolocation){setError('Browser location is not available.');return;}
    navigator.geolocation.getCurrentPosition(
      pos=>setEdit(v=>({...v,latitude:pos.coords.latitude.toFixed(6),longitude:pos.coords.longitude.toFixed(6)})),
      ()=>setError('Location permission was not granted. You can enter the pin manually.'),
      {enableHighAccuracy:true,timeout:12000,maximumAge:30000},
    );
  }

  async function upload(event:FormEvent){
    event.preventDefault();if(!activeId||!uid||!file)return;
    setBusy(true);setError('');setMessage('');
    try{
      const allowed=assetType==='photo'?['image/jpeg','image/png','image/webp']:assetType==='video'?['video/mp4','video/quicktime','video/webm']:['application/pdf','image/jpeg','image/png','image/webp'];
      if(!allowed.includes(file.type))throw new Error(`Unsupported ${assetType} format.`);
      const limit=assetType==='video'?100*1024*1024:20*1024*1024;
      if(file.size>limit)throw new Error(assetType==='video'?'Video must be 100 MB or smaller.':'File must be 20 MB or smaller.');
      const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const path=`${uid}/property/${activeId}/${crypto.randomUUID()}-${safe}`;
      const {error:uploadError}=await supabase.storage.from('genz-listing-media').upload(path,file,{upsert:false,contentType:file.type});
      if(uploadError)throw uploadError;
      const isFirstPhoto=assetType==='photo'&&!activeMedia.some(x=>x.asset_type==='photo');
      const {error:metaError}=await supabase.from('genz_listing_media').insert({
        property_id:activeId,project_id:null,uploaded_by_user_id:uid,asset_type:assetType,document_kind:assetType==='document'?documentKind:null,file_name:file.name,storage_path:path,mime_type:file.type,size_bytes:file.size,
        caption:caption.trim(),sort_order:activeMedia.length,is_cover:isFirstPhoto,
      });
      if(metaError){await supabase.storage.from('genz-listing-media').remove([path]);throw metaError;}
      setFile(null);setCaption('');setMessage(`${assetType==='photo'?'Photo':assetType==='video'?'Video':'Document'} uploaded to this listing.`);await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not upload media.');}finally{setBusy(false);}
  }

  async function setCover(id:string){
    if(!activeId)return;setBusy(true);setError('');setMessage('');
    try{const {error:rpcError}=await supabase.rpc('genz_set_property_cover_v1',{p_property_id:activeId,p_media_id:id});if(rpcError)throw rpcError;setMessage('Cover photo updated.');await load();}
    catch(e){setError(e instanceof Error?e.message:'Could not set cover photo.');}finally{setBusy(false);}
  }

  async function remove(item:MediaRow){
    if(item.uploaded_by_user_id!==uid)return;
    if(!window.confirm(`Remove ${item.file_name} from this listing?`))return;
    setBusy(true);setError('');setMessage('');
    try{
      const {error:storageError}=await supabase.storage.from('genz-listing-media').remove([item.storage_path]);if(storageError)throw storageError;
      const {error:metaError}=await supabase.from('genz_listing_media').delete().eq('id',item.id);if(metaError)throw metaError;
      setMessage('Media removed.');await load();
    }catch(e){setError(e instanceof Error?e.message:'Could not remove media.');}finally{setBusy(false);}
  }

  async function open(item:MediaRow){
    const cached=signed[item.id];
    if(cached){window.open(cached,'_blank','noopener,noreferrer');return;}
    const {data,error:urlError}=await supabase.storage.from('genz-listing-media').createSignedUrl(item.storage_path,600);
    if(urlError){setError(urlError.message);return;}window.open(data.signedUrl,'_blank','noopener,noreferrer');
  }

  if(!properties.length)return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Manage my listings</h2><p className="mt-2 text-sm text-slate-500">Create your first property mandate below. Once created, its details, pin and media can be managed here.</p></section>;

  return <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Listing broker controls</div><h2 className="mt-1 text-2xl font-bold">Manage my listings</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">Update property details, exact private location and owner information, then upload photos/videos for controlled sharing.</p></div>
      <button className={secondary} onClick={()=>void load()} disabled={busy}><RefreshCw className="size-4"/>Refresh</button>
    </div>
    <div className="mt-4 rounded-xl border border-blue-200 bg-white px-4 py-3 text-xs text-blue-900"><ShieldCheck className="mr-1 inline size-4"/><b>Privacy:</b> exact address, owner mobile and GPS remain private. Other brokers receive them only through explicit Sharing Controls / approved access.</div>
    {message&&<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div>}
    {error&&<div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

    <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold">Listing details & location</h3><p className="text-xs text-slate-500">Only properties listed by your broker account appear here.</p></div><select className={`${input} sm:max-w-sm`} value={activeId} onChange={e=>setActiveId(e.target.value)}>{properties.map(p=><option key={p.id} value={p.id}>{p.id} · {p.title}</option>)}</select></div>
        {active&&<div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Current asking: <b>{money(active.asking)}</b> · Mandate: <b className="capitalize">{active.mandate_status}</b></div>}
        <div className="mt-4 grid gap-3">
          <input className={input} required placeholder="Property title" value={edit.title} onChange={e=>setEdit({...edit,title:e.target.value})}/>
          <textarea className={`${input} min-h-28 resize-y`} maxLength={5000} placeholder="Detailed property description: road width, facing, floor, amenities, possession, nearby landmarks…" value={edit.description} onChange={e=>setEdit({...edit,description:e.target.value})}/>
          <div className="grid gap-3 sm:grid-cols-2"><input className={input} required placeholder="City" value={edit.city} onChange={e=>setEdit({...edit,city:e.target.value})}/><input className={input} placeholder="Locality / area" value={edit.locality} onChange={e=>setEdit({...edit,locality:e.target.value})}/></div>
          <select className={input} value={edit.type} onChange={e=>setEdit({...edit,type:e.target.value})}>{PROPERTY_TYPES.map(x=><option key={x}>{x}</option>)}</select>
          <div className="grid gap-3 sm:grid-cols-2"><input className={input} type="number" min="1" required placeholder="Size sqft" value={edit.size} onChange={e=>setEdit({...edit,size:e.target.value})}/><input className={input} type="number" min="1" required placeholder="Asking price ₹" value={edit.asking} onChange={e=>setEdit({...edit,asking:e.target.value})}/></div>
          <div className="mt-2 border-t border-slate-100 pt-4"><div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Private owner & exact location</div><div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2"><input className={input} required placeholder="Owner name (private)" value={edit.ownerName} onChange={e=>setEdit({...edit,ownerName:e.target.value})}/><input className={input} inputMode="numeric" placeholder="Owner mobile (private)" value={edit.ownerPhone} onChange={e=>setEdit({...edit,ownerPhone:e.target.value})}/></div>
            <textarea className={`${input} min-h-20 resize-y`} maxLength={1000} placeholder="Exact property address / landmark (private)" value={edit.address} onChange={e=>setEdit({...edit,address:e.target.value})}/>
            <div className="grid gap-3 sm:grid-cols-2"><input className={input} placeholder="Exact latitude" value={edit.latitude} onChange={e=>setEdit({...edit,latitude:e.target.value})}/><input className={input} placeholder="Exact longitude" value={edit.longitude} onChange={e=>setEdit({...edit,longitude:e.target.value})}/></div>
            <div className="flex flex-wrap gap-2"><button type="button" className={secondary} onClick={useCurrentLocation}><MapPin className="size-4"/>Use current GPS</button>{edit.latitude&&edit.longitude&&<a className={secondary} target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${encodeURIComponent(`${edit.latitude},${edit.longitude}`)}`}><ExternalLink className="size-4"/>Open pin</a>}</div>
          </div></div>
        </div>
        <button className={`${primary} mt-5`} type="submit" disabled={busy}><Save className="size-4"/>{busy?'Saving…':'Save listing updates'}</button>
      </form>

      <div className="space-y-4">
        <form onSubmit={upload} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><Upload className="size-5 text-blue-600"/><h3 className="font-bold">Photos & videos</h3></div><p className="mt-1 text-xs text-slate-500">Private media vault. Sharing remains controlled per broker/access grant.</p><div className="mt-4 grid gap-3"><select className={input} value={assetType} onChange={e=>setAssetType(e.target.value as 'photo'|'video'|'document')}><option value="photo">Property photo</option><option value="video">Property video</option><option value="document">Property document</option></select>{assetType==='document'&&<select className={input} value={documentKind} onChange={e=>setDocumentKind(e.target.value)}><option value="brochure">Brochure</option><option value="floor_plan">Floor plan</option><option value="mandate">Mandate</option><option value="title_summary">Title summary</option><option value="other">Other</option></select>}<input className={input} maxLength={300} placeholder="Caption / room / view" value={caption} onChange={e=>setCaption(e.target.value)}/><input className={input} type="file" accept={assetType==='photo'?'image/jpeg,image/png,image/webp':assetType==='video'?'video/mp4,video/quicktime,video/webm':'application/pdf,image/jpeg,image/png,image/webp'} onChange={e=>setFile(e.target.files?.[0]||null)} required/></div><button className={`${primary} mt-4 w-full`} disabled={busy||!file}><Upload className="size-4"/>{busy?'Uploading…':'Upload to listing'}</button></form>

        <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><h3 className="font-bold">Listing gallery</h3><span className="text-xs text-slate-500">{activeMedia.length} item(s)</span></div>{activeMedia.length===0?<div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">No photos or videos yet.</div>:<div className="mt-4 grid gap-3 sm:grid-cols-2">{activeMedia.map(item=><div key={item.id} className={`overflow-hidden rounded-xl border ${item.is_cover?'border-blue-400 ring-2 ring-blue-100':'border-slate-200'}`}>{item.asset_type==='photo'&&signed[item.id]?<img src={signed[item.id]} alt={item.caption||item.file_name} className="h-36 w-full object-cover"/>:<button type="button" onClick={()=>void open(item)} className="flex h-36 w-full items-center justify-center bg-slate-100 text-slate-500">{item.asset_type==='video'?<Video className="size-8"/>:item.asset_type==='document'?<FileText className="size-8"/>:<ImageIcon className="size-8"/>}</button>}<div className="p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold">{item.caption||item.file_name}</div><div className="mt-1 text-[11px] uppercase text-slate-400">{item.asset_type}{item.document_kind?` · ${item.document_kind}`:''}{item.is_cover?' · cover':''}</div></div>{item.is_cover&&<Star className="size-4 fill-blue-600 text-blue-600"/>}</div><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={secondary} onClick={()=>void open(item)}>Open</button>{item.asset_type==='photo'&&!item.is_cover&&<button type="button" className={secondary} disabled={busy} onClick={()=>void setCover(item.id)}><Star className="size-4"/>Set cover</button>}{item.uploaded_by_user_id===uid&&<button type="button" className={`${secondary} text-rose-700`} disabled={busy} onClick={()=>void remove(item)}><Trash2 className="size-4"/>Remove</button>}</div></div></div>)}</div>}</div>
      </div>
    </div>
  </section>;
}
