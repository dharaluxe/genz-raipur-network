'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Building2,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Upload,
  UserRound,
  Video,
  XCircle,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';

type Profile = {
  id: string;
  broker_code: string;
  display_name: string;
  firm: string;
  is_admin: boolean;
};

type BuilderMembership = { builder_id: string; role: 'owner' | 'admin' | 'sales'; status: string };
type PropertyRow = {
  id: string;
  listing_user_id: string;
  title: string;
  city: string;
  locality: string | null;
  property_type: string;
  size: number;
  mandate_status: string;
};
type ProjectRow = {
  id: string;
  builder_id: string;
  name: string;
  city: string;
  locality: string | null;
  property_type: string;
};
type ShareGrant = {
  id: string;
  property_id: string | null;
  project_id: string | null;
  granted_by_user_id: string;
  broker_user_id: string;
  status: string;
  can_view_price: boolean;
  can_view_photos: boolean;
  can_view_videos: boolean;
  can_view_approx_location: boolean;
  can_view_exact_location: boolean;
  can_view_documents: boolean;
  can_view_owner_contact: boolean;
  allow_download: boolean;
  note: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};
type MediaRow = {
  id: string;
  property_id: string | null;
  project_id: string | null;
  uploaded_by_user_id: string;
  asset_type: 'photo' | 'video' | 'document';
  document_kind: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  caption: string;
  sort_order: number;
  is_cover: boolean;
  created_at: string;
};
type AccessEvent = {
  id: string;
  grant_id: string;
  viewer_user_id: string;
  event_type: string;
  resource_id: string | null;
  created_at: string;
};
type SharedListing = {
  grant_id: string;
  source_type: 'property' | 'project';
  source_id: string;
  title: string;
  city: string;
  locality: string | null;
  property_type: string;
  size: number;
  price: number | null;
  latitude: number | null;
  longitude: number | null;
  owner_name: string | null;
  owner_phone: string | null;
  can_view_price: boolean;
  can_view_photos: boolean;
  can_view_videos: boolean;
  can_view_approx_location: boolean;
  can_view_exact_location: boolean;
  can_view_documents: boolean;
  can_view_owner_contact: boolean;
  allow_download: boolean;
  note: string;
  expires_at: string | null;
};
type MatchingBroker = {
  broker_user_id: string;
  broker_code: string;
  display_name: string;
  firm: string;
  matched_requirements: number;
};

type PermissionState = {
  price: boolean;
  photos: boolean;
  videos: boolean;
  approxLocation: boolean;
  exactLocation: boolean;
  documents: boolean;
  ownerContact: boolean;
  download: boolean;
};

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

function money(value: unknown) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return <section><div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Controlled collaboration</div><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{title}</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{description}</p></section>;
}

function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>{children}</div>;
}

function permissionBadges(grant: ShareGrant) {
  const values = [
    ['Price', grant.can_view_price],
    ['Photos', grant.can_view_photos],
    ['Videos', grant.can_view_videos],
    ['Approx location', grant.can_view_approx_location],
    ['Exact pin', grant.can_view_exact_location],
    ['Documents', grant.can_view_documents],
    ['Owner contact', grant.can_view_owner_contact],
    ['Download', grant.allow_download],
  ] as const;
  return values.filter(([, allowed]) => allowed).map(([label]) => label);
}

export default function ListingSharing() {
  const supabase = useMemo(() => getSupabaseNetworkClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [builderMemberships, setBuilderMemberships] = useState<BuilderMembership[]>([]);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [brokers, setBrokers] = useState<Profile[]>([]);
  const [matchingBrokers, setMatchingBrokers] = useState<MatchingBroker[]>([]);
  const [grants, setGrants] = useState<ShareGrant[]>([]);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [events, setEvents] = useState<AccessEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [sourceType, setSourceType] = useState<'property' | 'project'>('property');
  const [sourceId, setSourceId] = useState('');
  const [targetBrokerId, setTargetBrokerId] = useState('');
  const [permissions, setPermissions] = useState<PermissionState>({
    price: false,
    photos: true,
    videos: false,
    approxLocation: true,
    exactLocation: false,
    documents: false,
    ownerContact: false,
    download: false,
  });
  const [shareNote, setShareNote] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const [assetType, setAssetType] = useState<'photo' | 'video' | 'document'>('photo');
  const [documentKind, setDocumentKind] = useState('brochure');
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const [activeGrantId, setActiveGrantId] = useState('');
  const [activeShared, setActiveShared] = useState<SharedListing | null>(null);
  const [revealedPrice, setRevealedPrice] = useState<any>(null);
  const [revealedLocation, setRevealedLocation] = useState<any>(null);
  const [revealedOwner, setRevealedOwner] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const activeUser = sessionData.session?.user || null;
      setUser(activeUser);
      if (!activeUser) return;

      const [profileRes, membershipsRes] = await Promise.all([
        supabase.from('genz_profiles').select('id,broker_code,display_name,firm,is_admin').eq('id', activeUser.id).maybeSingle(),
        supabase.from('genz_builder_memberships').select('builder_id,role,status').eq('user_id', activeUser.id).eq('status', 'active'),
      ]);
      if (profileRes.error) throw profileRes.error;
      if (membershipsRes.error) throw membershipsRes.error;
      const memberProfile = (profileRes.data || null) as Profile | null;
      const memberships = (membershipsRes.data || []) as BuilderMembership[];
      setProfile(memberProfile);
      setBuilderMemberships(memberships);

      if (!memberProfile && memberships.length === 0) return;

      const propertyQuery = supabase.from('genz_properties').select('id,listing_user_id,title,city,locality,property_type,size,mandate_status').order('created_at', { ascending: false });
      const propertiesRes = memberProfile?.is_admin ? await propertyQuery : memberProfile ? await propertyQuery.eq('listing_user_id', activeUser.id) : { data: [], error: null } as any;
      if (propertiesRes.error) throw propertiesRes.error;
      setProperties((propertiesRes.data || []) as PropertyRow[]);

      const builderIds = memberships.map((item) => item.builder_id);
      if (builderIds.length) {
        const projectsRes = await supabase.from('genz_builder_projects').select('id,builder_id,name,city,locality,property_type').in('builder_id', builderIds).order('created_at', { ascending: false });
        if (projectsRes.error) throw projectsRes.error;
        setProjects((projectsRes.data || []) as ProjectRow[]);
      } else setProjects([]);

      if (memberProfile) {
        const brokersRes = await supabase.from('genz_profiles').select('id,broker_code,display_name,firm,is_admin').order('display_name');
        if (brokersRes.error) throw brokersRes.error;
        setBrokers((brokersRes.data || []) as Profile[]);
      } else setBrokers([]);

      const [grantsRes, mediaRes, eventsRes] = await Promise.all([
        supabase.from('genz_listing_share_grants').select('*').order('updated_at', { ascending: false }),
        supabase.from('genz_listing_media').select('*').order('sort_order').order('created_at', { ascending: false }),
        supabase.from('genz_listing_access_events').select('*').order('created_at', { ascending: false }).limit(200),
      ]);
      if (grantsRes.error) throw grantsRes.error;
      if (mediaRes.error) throw mediaRes.error;
      if (eventsRes.error) throw eventsRes.error;
      setGrants((grantsRes.data || []) as ShareGrant[]);
      setMedia((mediaRes.data || []) as MediaRow[]);
      setEvents((eventsRes.data || []) as AccessEvent[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sharing controls.');
    } finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => {
    void load();
    const { data } = supabase.auth.onAuthStateChange(() => void load());
    return () => data.subscription.unsubscribe();
  }, [load, supabase]);

  useEffect(() => {
    setTargetBrokerId(''); setMatchingBrokers([]);
    if (sourceType !== 'project' || !sourceId) return;
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc('genz_builder_matching_brokers', { p_project_id: sourceId });
      if (rpcError) { setError(rpcError.message); return; }
      setMatchingBrokers((data || []) as MatchingBroker[]);
    })();
  }, [sourceId, sourceType, supabase]);

  const ownedSources = sourceType === 'property' ? properties : projects;
  const selectedIsProject = sourceType === 'project';
  const targetOptions = selectedIsProject
    ? matchingBrokers.map((item) => ({ id: item.broker_user_id, label: `${item.display_name} · ${item.broker_code} · ${item.matched_requirements} matching buyers` }))
    : brokers.filter((item) => item.id !== user?.id).map((item) => ({ id: item.id, label: `${item.display_name} · ${item.broker_code} · ${item.firm}` }));

  const createShare = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (!sourceId || !targetBrokerId) throw new Error('Select a listing/project and recipient broker.');
      const { error: rpcError } = await supabase.rpc('genz_upsert_listing_share', {
        p_property_id: sourceType === 'property' ? sourceId : null,
        p_project_id: sourceType === 'project' ? sourceId : null,
        p_broker_user_id: targetBrokerId,
        p_can_view_price: permissions.price,
        p_can_view_photos: permissions.photos,
        p_can_view_videos: permissions.videos,
        p_can_view_approx_location: permissions.approxLocation,
        p_can_view_exact_location: sourceType === 'property' ? permissions.exactLocation : false,
        p_can_view_documents: permissions.documents,
        p_can_view_owner_contact: sourceType === 'property' ? permissions.ownerContact : false,
        p_allow_download: permissions.download,
        p_note: shareNote,
        p_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      if (rpcError) throw rpcError;
      setMessage('Sharing permissions saved. The recipient broker now sees only the enabled resources inside the controlled room.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save sharing permissions.'); }
    finally { setBusy(false); }
  };

  const revoke = async (grantId: string) => {
    setError(''); setMessage('');
    const { error: rpcError } = await supabase.rpc('genz_revoke_listing_share', { p_grant_id: grantId });
    if (rpcError) { setError(rpcError.message); return; }
    setMessage('Share revoked immediately.'); await load();
  };

  const uploadAsset = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (!user || !sourceId || !file) throw new Error('Select a source and file.');
      const allowed = assetType === 'photo'
        ? ['image/jpeg','image/png','image/webp']
        : assetType === 'video'
          ? ['video/mp4','video/quicktime','video/webm']
          : ['application/pdf','image/jpeg','image/png','image/webp'];
      if (!allowed.includes(file.type)) throw new Error(`Unsupported ${assetType} format.`);
      const limit = assetType === 'video' ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
      if (file.size > limit) throw new Error(assetType === 'video' ? 'Video must be 100 MB or smaller.' : 'File must be 20 MB or smaller.');
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${user.id}/${sourceType}/${sourceId}/${crypto.randomUUID()}-${safe}`;
      const { error: uploadError } = await supabase.storage.from('genz-listing-media').upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;
      const { error: metaError } = await supabase.from('genz_listing_media').insert({
        property_id: sourceType === 'property' ? sourceId : null,
        project_id: sourceType === 'project' ? sourceId : null,
        uploaded_by_user_id: user.id,
        asset_type: assetType,
        document_kind: assetType === 'document' ? documentKind : null,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
        caption: caption.trim(),
      });
      if (metaError) {
        await supabase.storage.from('genz-listing-media').remove([path]);
        throw metaError;
      }
      setFile(null); setCaption('');
      setMessage(`${assetType === 'photo' ? 'Photo' : assetType === 'video' ? 'Video' : 'Document'} uploaded to the private listing vault.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not upload asset.'); }
    finally { setBusy(false); }
  };

  const openAsset = async (item: MediaRow, grant?: ShareGrant) => {
    setError('');
    if (grant && grant.broker_user_id === user?.id) {
      const eventType = item.asset_type === 'photo' ? 'view_photo' : item.asset_type === 'video' ? 'view_video' : 'view_document';
      const { error: logError } = await supabase.rpc('genz_log_listing_access', { p_grant_id: grant.id, p_event_type: eventType, p_resource_id: item.id });
      if (logError) { setError(logError.message); return; }
    }
    const { data, error: urlError } = await supabase.storage.from('genz-listing-media').createSignedUrl(item.storage_path, 600);
    if (urlError) { setError(urlError.message); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    await load();
  };

  const explicitDownload = async (item: MediaRow, grant: ShareGrant) => {
    if (!grant.allow_download) { setError('This share does not allow the GENZ download action.'); return; }
    const { error: logError } = await supabase.rpc('genz_log_listing_access', { p_grant_id: grant.id, p_event_type: 'download_asset', p_resource_id: item.id });
    if (logError) { setError(logError.message); return; }
    const { data, error: urlError } = await supabase.storage.from('genz-listing-media').createSignedUrl(item.storage_path, 120);
    if (urlError) { setError(urlError.message); return; }
    const a = document.createElement('a'); a.href = data.signedUrl; a.download = item.file_name; a.rel = 'noopener'; a.click();
    await load();
  };

  const openSharedRoom = async (grant: ShareGrant) => {
    setActiveGrantId(grant.id); setActiveShared(null); setRevealedPrice(null); setRevealedLocation(null); setRevealedOwner(null); setError('');
    const { data, error: rpcError } = await supabase.rpc('genz_get_shared_listing', { p_grant_id: grant.id });
    if (rpcError) { setError(rpcError.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    setActiveShared(row as SharedListing);
    await load();
  };

  const reveal = async (field: 'price' | 'exact_location' | 'owner_contact') => {
    if (!activeGrantId) return;
    const { data, error: rpcError } = await supabase.rpc('genz_reveal_shared_listing_field', { p_grant_id: activeGrantId, p_field: field });
    if (rpcError) { setError(rpcError.message); return; }
    if (field === 'price') setRevealedPrice(data);
    if (field === 'exact_location') setRevealedLocation(data);
    if (field === 'owner_contact') setRevealedOwner(data);
    await load();
  };

  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading secure sharing controls…</div>;
  if (!user) return <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><ShieldCheck className="size-8 text-blue-600"/><h1 className="mt-4 text-2xl font-bold">Sign in required</h1><p className="mt-2 text-sm text-slate-600">Property Sharing Rooms are available only to approved brokers and builder-team members.</p><Link className={`${primaryButton} mt-5`} href="/dashboard">Go to sign in</Link></div>;
  if (!profile && builderMemberships.length === 0) return <Notice error>This account is not an approved GENZ broker or builder-team member.</Notice>;

  const myCreatedGrants = grants.filter((grant) => grant.granted_by_user_id === user.id || properties.some((property) => property.id === grant.property_id));
  const incomingGrants = grants.filter((grant) => grant.broker_user_id === user.id && grant.status === 'active');
  const selectedSourceMedia = media.filter((item) => sourceType === 'property' ? item.property_id === sourceId : item.project_id === sourceId);
  const activeGrant = grants.find((grant) => grant.id === activeGrantId);
  const activeMedia = activeShared ? media.filter((item) => activeShared.source_type === 'property' ? item.property_id === activeShared.source_id : item.project_id === activeShared.source_id) : [];
  const activeEvents = activeGrant ? events.filter((event) => event.grant_id === activeGrant.id) : [];

  return <div className="space-y-7">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <SectionTitle title="Property Sharing Rooms" description="Share a property or builder project with a specific buyer broker and control price, photos, videos, locality, exact pin, documents, owner contact and the explicit download action. Sensitive reveals are audited."/>
      <button className={secondaryButton} onClick={() => void load()}><RefreshCw className="size-4"/>Refresh</button>
    </div>
    {message && <Notice>{message}</Notice>}
    {error && <Notice error>{error}</Notice>}

    <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><Building2 className="size-5 text-blue-600"/><h2 className="font-bold">Choose sharing source</h2></div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" className={sourceType === 'property' ? primaryButton : secondaryButton} onClick={() => { setSourceType('property'); setSourceId(''); }}>Property</button>
            <button type="button" className={sourceType === 'project' ? primaryButton : secondaryButton} onClick={() => { setSourceType('project'); setSourceId(''); }}>Builder project</button>
          </div>
          <select className={`${inputClass} mt-3`} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">Select {sourceType}</option>
            {ownedSources.map((item: any) => <option key={item.id} value={item.id}>{item.id} · {'title' in item ? item.title : item.name} · {item.city}</option>)}
          </select>
        </div>

        <form onSubmit={uploadAsset} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><Upload className="size-5 text-blue-600"/><h2 className="font-bold">Media & document vault</h2></div>
          <div className="mt-4 grid gap-3">
            <select className={inputClass} value={assetType} onChange={(e) => setAssetType(e.target.value as any)}><option value="photo">Photo</option><option value="video">Video</option><option value="document">Document</option></select>
            {assetType === 'document' && <select className={inputClass} value={documentKind} onChange={(e) => setDocumentKind(e.target.value)}><option value="brochure">Brochure</option><option value="floor_plan">Floor plan</option><option value="mandate">Mandate</option><option value="title_summary">Title summary</option><option value="other">Other</option></select>}
            <input className={inputClass} placeholder="Caption / note" maxLength={300} value={caption} onChange={(e) => setCaption(e.target.value)}/>
            <input className="block w-full text-xs" type="file" accept={assetType === 'photo' ? 'image/jpeg,image/png,image/webp' : assetType === 'video' ? 'video/mp4,video/quicktime,video/webm' : 'application/pdf,image/jpeg,image/png,image/webp'} onChange={(e) => setFile(e.target.files?.[0] || null)}/>
          </div>
          <button disabled={busy || !sourceId || !file} className={`${primaryButton} mt-4 w-full`}><Upload className="size-4"/>Upload privately</button>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">Photos/documents up to 20 MB; videos up to 100 MB. Files stay in a private bucket and are delivered through short-lived signed URLs.</p>
          {selectedSourceMedia.length > 0 && <div className="mt-4 space-y-2">{selectedSourceMedia.map((item) => <button type="button" onClick={() => void openAsset(item)} key={item.id} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3 text-left text-sm"><span className="grid size-8 place-items-center rounded-lg bg-slate-100">{item.asset_type === 'photo' ? <ImageIcon className="size-4"/> : item.asset_type === 'video' ? <Video className="size-4"/> : <FileText className="size-4"/>}</span><span className="min-w-0 flex-1 truncate">{item.file_name}</span><Eye className="size-4 text-slate-400"/></button>)}</div>}
        </form>
      </div>

      <form onSubmit={createShare} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-blue-600"/><h2 className="font-bold">Create / update broker access</h2></div>
        <p className="mt-2 text-sm leading-6 text-slate-500">Recipient sees only permissions enabled here. Builder projects use privacy-safe broker matching; raw buyer details are not shown to the builder.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select className={inputClass} required value={targetBrokerId} onChange={(e) => setTargetBrokerId(e.target.value)}><option value="">Recipient buyer broker</option>{targetOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          <input className={inputClass} type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}/>
        </div>
        {selectedIsProject && sourceId && matchingBrokers.length === 0 && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">No verified broker with matching protected demand is currently eligible for this project.</div>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['price','Price'],['photos','Photos'],['videos','Videos'],['approxLocation','Approx location'],['exactLocation','Exact GPS pin'],['documents','Documents'],['ownerContact','Owner contact'],['download','Download button'],
          ].map(([key,label]) => {
            const projectBlocked = selectedIsProject && (key === 'exactLocation' || key === 'ownerContact');
            return <label key={key} className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${projectBlocked ? 'bg-slate-50 text-slate-400' : 'bg-white'}`}><input type="checkbox" disabled={projectBlocked} checked={permissions[key as keyof PermissionState]} onChange={(e) => setPermissions({ ...permissions, [key]: e.target.checked })}/>{label}</label>;
          })}
        </div>
        <textarea className={`${inputClass} mt-4`} rows={3} maxLength={600} placeholder="Instructions for buyer broker (optional)" value={shareNote} onChange={(e) => setShareNote(e.target.value)}/>
        <button disabled={busy || !sourceId || !targetBrokerId} className={`${primaryButton} mt-4`}><ShieldCheck className="size-4"/>Save controlled access</button>
      </form>
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold">Access I issued</h2>
        <div className="mt-4 space-y-3">{myCreatedGrants.map((grant) => <article key={grant.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-bold text-blue-600">{grant.property_id || grant.project_id}</div><div className="mt-1 font-semibold">To {brokers.find((b) => b.id === grant.broker_user_id)?.display_name || grant.broker_user_id}</div><div className="mt-2 flex flex-wrap gap-1">{permissionBadges(grant).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{tag}</span>)}</div></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${grant.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{grant.status}</span></div>{grant.status === 'active' && <button className={`${secondaryButton} mt-3`} type="button" onClick={() => void revoke(grant.id)}><XCircle className="size-4"/>Revoke</button>}{events.filter((event) => event.grant_id === grant.id).length > 0 && <div className="mt-3 text-xs text-slate-500">{events.filter((event) => event.grant_id === grant.id).length} audited access events</div>}</article>)}{!myCreatedGrants.length && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No sharing grants issued yet.</div>}</div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold">Shared with me</h2>
        <div className="mt-4 space-y-3">{incomingGrants.map((grant) => <button key={grant.id} type="button" onClick={() => void openSharedRoom(grant)} className={`w-full rounded-xl border p-4 text-left transition ${activeGrantId === grant.id ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-bold text-blue-600">{grant.property_id ? 'PROPERTY' : 'BUILDER PROJECT'}</div><div className="mt-1 font-semibold">{grant.property_id || grant.project_id}</div><div className="mt-2 flex flex-wrap gap-1">{permissionBadges(grant).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{tag}</span>)}</div></div><Eye className="size-5 text-blue-600"/></div></button>)}{!incomingGrants.length && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No controlled listings shared with you yet.</div>}</div>
      </div>
    </section>

    {activeShared && activeGrant && <section className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="text-xs font-bold uppercase tracking-wide text-blue-600">Controlled room · {activeShared.source_type}</div><h2 className="mt-1 text-2xl font-bold">{activeShared.title}</h2><div className="mt-1 text-sm text-slate-500">{activeShared.city}{activeShared.locality ? ` · ${activeShared.locality}` : ''} · {activeShared.property_type} · {activeShared.size} sqft</div>{activeShared.note && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{activeShared.note}</div>}</div><div className="text-xs text-slate-500">{activeShared.expires_at ? `Access until ${new Date(activeShared.expires_at).toLocaleString('en-IN')}` : 'No expiry set'}</div></div>
      <div className="mt-5 flex flex-wrap gap-2">
        {activeShared.can_view_price && <button className={secondaryButton} onClick={() => void reveal('price')}><Eye className="size-4"/>Reveal price</button>}
        {activeShared.can_view_exact_location && <button className={secondaryButton} onClick={() => void reveal('exact_location')}><MapPin className="size-4"/>Reveal exact pin</button>}
        {activeShared.can_view_owner_contact && <button className={secondaryButton} onClick={() => void reveal('owner_contact')}><UserRound className="size-4"/>Reveal owner contact</button>}
      </div>
      {(revealedPrice || revealedLocation || revealedOwner) && <div className="mt-4 grid gap-3 md:grid-cols-3">{revealedPrice && <div className="rounded-xl bg-emerald-50 p-4 text-sm"><div className="text-xs font-bold uppercase text-emerald-700">Price revealed</div><div className="mt-1 text-xl font-bold text-emerald-950">{revealedPrice.price ? money(revealedPrice.price) : `${money(revealedPrice.min_price)} – ${money(revealedPrice.max_price)}`}</div></div>}{revealedLocation && <div className="rounded-xl bg-blue-50 p-4 text-sm"><div className="text-xs font-bold uppercase text-blue-700">Exact location revealed</div><div className="mt-1 font-semibold">{revealedLocation.latitude}, {revealedLocation.longitude}</div>{revealedLocation.latitude && revealedLocation.longitude && <a className="mt-2 inline-block text-xs font-semibold text-blue-700 underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${revealedLocation.latitude}&mlon=${revealedLocation.longitude}#map=17/${revealedLocation.latitude}/${revealedLocation.longitude}`}>Open map</a>}</div>}{revealedOwner && <div className="rounded-xl bg-amber-50 p-4 text-sm"><div className="text-xs font-bold uppercase text-amber-700">Owner contact revealed</div><div className="mt-1 font-semibold">{revealedOwner.owner_name || 'Owner'}</div><div>{revealedOwner.owner_phone || 'Phone not recorded'}</div></div>}</div>}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{activeMedia.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-slate-100">{item.asset_type === 'photo' ? <ImageIcon className="size-4"/> : item.asset_type === 'video' ? <Video className="size-4"/> : <FileText className="size-4"/>}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{item.file_name}</div><div className="text-[11px] text-slate-500">{item.asset_type}{item.document_kind ? ` · ${item.document_kind}` : ''}</div></div></div><div className="mt-3 flex gap-2"><button className={secondaryButton} type="button" onClick={() => void openAsset(item, activeGrant)}><Eye className="size-4"/>View</button>{activeGrant.allow_download && <button className={secondaryButton} type="button" onClick={() => void explicitDownload(item, activeGrant)}><Download className="size-4"/>Download</button>}</div></article>)}{!activeMedia.length && <div className="col-span-full rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No media currently visible under this permission set.</div>}</div>
      <div className="mt-6 border-t border-slate-200 pt-5"><div className="text-sm font-bold">Access audit</div><div className="mt-3 space-y-2">{activeEvents.slice(0,20).map((event) => <div key={event.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"><span>{event.event_type.replaceAll('_',' ')}</span><span className="text-slate-400">{new Date(event.created_at).toLocaleString('en-IN')}</span></div>)}{!activeEvents.length && <div className="text-xs text-slate-500">No access events yet.</div>}</div></div>
      <p className="mt-5 text-[11px] leading-5 text-slate-400">GENZ can hide the explicit download action and use short-lived links, but any media that a recipient is allowed to view may still be capturable by that recipient's device. Owner contact and exact GPS remain server-gated reveal actions with an audit trail.</p>
    </section>}
  </div>;
}
