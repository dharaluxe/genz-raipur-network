'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { BadgeCheck, Building2, CheckCircle2, Clock3, Handshake, LogOut, MapPin, Plus, RefreshCw, Search, ShieldCheck, Star, UserRound, UsersRound } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';
import { calculateTrustScore } from '@/lib/trust-score';
import { rankPropertyMatches } from '@/lib/matching-v2';
import {
  PROPERTY_TYPES,
  maskPhone,
  money,
  nextId,
  normalizeIndianPhone,
  type DemoBroker,
  type DemoDeal,
  type DemoNetworkState,
  type DemoProperty,
  type DemoRequirement,
} from '@/lib/demo-network';

type View = 'dashboard' | 'requirements' | 'properties' | 'brokers' | 'deals';
type SharedBroker = DemoBroker & { userId: string };
type SharedState = Omit<DemoNetworkState, 'brokers'> & { brokers: SharedBroker[] };

type ProfilePatch = { displayName: string; firm: string; cities: string[]; specialties: string[] };

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

function displayPhone(value: string) {
  if (value.includes('*')) return value;
  try { return maskPhone(value); } catch { return 'Protected'; }
}

function brokerName(state: SharedState, id: string) {
  return state.brokers.find((broker) => broker.id === id)?.name || id;
}

function userIdForBroker(state: SharedState, brokerCode: string) {
  return state.brokers.find((broker) => broker.id === brokerCode)?.userId || '';
}

function brokerCodeForUser(state: SharedState, userId: string) {
  return state.brokers.find((broker) => broker.userId === userId)?.id || '';
}

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <section><div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">{eyebrow}</div><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p></section>;
}

function SharedNotice({ syncError }: { syncError: string }) {
  return <div className={`rounded-xl border px-4 py-3 text-xs leading-5 ${syncError ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}><b>{syncError ? 'Sync issue:' : 'Shared network live:'}</b> {syncError || 'records now persist in Supabase across signed-in brokers. Buyer phone and owner identity stay behind row-level security.'}</div>;
}

function useSharedNetwork() {
  const supabase = useMemo(() => getSupabaseNetworkClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<SharedState | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState('');

  const ensureProfile = useCallback(async (activeUser: User) => {
    const { data: existing, error: findError } = await supabase.from('genz_profiles').select('id').eq('id', activeUser.id).maybeSingle();
    if (findError) throw findError;
    if (existing) return;
    const meta = activeUser.user_metadata || {};
    const fallbackName = activeUser.email?.split('@')[0] || 'Broker';
    const { error } = await supabase.from('genz_profiles').insert({
      id: activeUser.id,
      display_name: String(meta.name || fallbackName).slice(0, 80),
      firm: String(meta.firm || 'Independent').slice(0, 120),
      cities: [],
      specialties: [],
    });
    if (error) throw error;
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    setSyncError('');
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const activeUser = authData.user;
      setUser(activeUser);
      if (!activeUser) { setState(null); return; }
      await ensureProfile(activeUser);

      const [profilesRes, requirementsRes, buyersRes, propertiesRes, ownersRes, dealsRes, eventsRes] = await Promise.all([
        supabase.from('genz_profiles').select('*').order('created_at', { ascending: true }),
        supabase.from('genz_requirements').select('*').order('created_at', { ascending: false }),
        supabase.from('genz_buyers').select('id,name,phone_e164,phone_masked,source_user_id,claim_expires_at'),
        supabase.from('genz_properties').select('*').order('created_at', { ascending: false }),
        supabase.from('genz_property_private').select('property_id,owner_name,listing_user_id'),
        supabase.from('genz_deals').select('*').order('created_at', { ascending: false }),
        supabase.from('genz_deal_events').select('*').order('created_at', { ascending: true }),
      ]);
      for (const result of [profilesRes, requirementsRes, buyersRes, propertiesRes, ownersRes, dealsRes, eventsRes]) if (result.error) throw result.error;

      const brokers: SharedBroker[] = (profilesRes.data || []).map((row: any) => ({
        id: row.broker_code,
        userId: row.id,
        name: row.display_name,
        firm: row.firm,
        cities: row.cities || [],
        specialties: row.specialties || [],
        verified: Boolean(row.verified),
        completedDeals: Number(row.completed_deals || 0),
        successfulCollaborations: Number(row.successful_collaborations || 0),
        verifiedVisits: Number(row.verified_visits || 0),
        collaborationRequests: Number(row.collaboration_requests || 0),
        collaborationResponses: Number(row.collaboration_responses || 0),
        rating: Number(row.rating || 0),
        reviewCount: Number(row.review_count || 0),
        unresolvedDisputes: Number(row.unresolved_disputes || 0),
      }));
      const codeByUser = new Map(brokers.map((broker) => [broker.userId, broker.id]));
      const privateBuyers = new Map((buyersRes.data || []).map((row: any) => [row.id, row]));
      const privateOwners = new Map((ownersRes.data || []).map((row: any) => [row.property_id, row]));

      const requirements: DemoRequirement[] = (requirementsRes.data || []).map((row: any) => {
        const privateBuyer: any = privateBuyers.get(row.buyer_id);
        return {
          id: row.id,
          buyerName: privateBuyer?.name || row.buyer_label || 'Protected buyer',
          buyerPhone: privateBuyer?.phone_e164 || row.buyer_phone_masked || 'Protected',
          sourceBrokerId: codeByUser.get(row.source_user_id) || 'Protected source',
          city: row.city,
          type: row.property_type,
          maxBudget: Number(row.max_budget),
          minSize: Number(row.min_size),
          status: row.status,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
        };
      });

      const properties: DemoProperty[] = (propertiesRes.data || []).map((row: any) => {
        const privateOwner: any = privateOwners.get(row.id);
        return {
          id: row.id,
          title: row.title,
          city: row.city,
          type: row.property_type,
          size: Number(row.size),
          asking: Number(row.asking),
          ownerName: privateOwner?.owner_name || row.owner_label || 'Owner protected',
          listingBrokerId: codeByUser.get(row.listing_user_id) || 'Protected listing broker',
          mandateStatus: row.mandate_status,
          status: row.status,
        };
      });

      const eventsByDeal = new Map<string, any[]>();
      for (const row of eventsRes.data || []) {
        const list = eventsByDeal.get((row as any).deal_id) || [];
        list.push(row);
        eventsByDeal.set((row as any).deal_id, list);
      }
      const deals: DemoDeal[] = (dealsRes.data || []).map((row: any) => ({
        id: row.id,
        requirementId: row.requirement_id,
        propertyId: row.property_id,
        buyerBrokerId: codeByUser.get(row.buyer_user_id) || 'Buyer broker',
        listingBrokerId: codeByUser.get(row.listing_user_id) || 'Listing broker',
        status: row.status,
        listingShare: Number(row.listing_share),
        ...(row.last_offer ? { lastOffer: Number(row.last_offer) } : {}),
        events: (eventsByDeal.get(row.id) || []).map((event: any) => ({ id: event.id, type: event.event_type, label: event.label, at: event.created_at })),
      }));

      setState({ brokers, requirements, properties, deals });
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not load the shared network.');
    } finally {
      setLoading(false);
    }
  }, [ensureProfile, supabase]);

  const persistDiff = useCallback(async (current: SharedState, next: SharedState, activeUser: User) => {
    const currentReqIds = new Set(current.requirements.map((item) => item.id));
    for (const req of next.requirements.filter((item) => !currentReqIds.has(item.id))) {
      const { error } = await supabase.rpc('genz_register_requirement', {
        p_requirement_id: req.id,
        p_buyer_name: req.buyerName,
        p_phone: req.buyerPhone,
        p_city: req.city,
        p_property_type: req.type,
        p_max_budget: req.maxBudget,
        p_min_size: req.minSize,
        p_expires_at: req.expiresAt,
      });
      if (error) {
        if (error.message.includes('GENZ_BUYER_PROTECTED')) throw new Error('This buyer is already protected by another broker under an active claim.');
        throw error;
      }
    }

    const currentPropertyIds = new Set(current.properties.map((item) => item.id));
    for (const property of next.properties.filter((item) => !currentPropertyIds.has(item.id))) {
      const { error: propertyError } = await supabase.from('genz_properties').insert({
        id: property.id,
        listing_user_id: activeUser.id,
        title: property.title,
        city: property.city,
        property_type: property.type,
        size: property.size,
        asking: property.asking,
        owner_label: property.ownerName ? `${property.ownerName.slice(0, 1)}***` : 'Owner protected',
        mandate_status: property.mandateStatus,
        status: property.status,
      });
      if (propertyError) throw propertyError;
      const { error: ownerError } = await supabase.from('genz_property_private').insert({ property_id: property.id, listing_user_id: activeUser.id, owner_name: property.ownerName });
      if (ownerError) {
        await supabase.from('genz_properties').delete().eq('id', property.id);
        throw ownerError;
      }
    }

    const currentDeals = new Map(current.deals.map((deal) => [deal.id, deal]));
    for (const deal of next.deals) {
      const before = currentDeals.get(deal.id);
      if (!before) {
        const buyerUserId = userIdForBroker(current, deal.buyerBrokerId);
        const listingUserId = userIdForBroker(current, deal.listingBrokerId);
        if (!buyerUserId || !listingUserId) throw new Error('Could not resolve both brokers for this deal room.');
        const { error: dealError } = await supabase.from('genz_deals').insert({
          id: deal.id,
          requirement_id: deal.requirementId,
          property_id: deal.propertyId,
          buyer_user_id: buyerUserId,
          listing_user_id: listingUserId,
          status: deal.status,
          listing_share: deal.listingShare,
          last_offer: deal.lastOffer || null,
        });
        if (dealError) throw dealError;
        for (const event of deal.events) {
          const { error } = await supabase.from('genz_deal_events').insert({ id: event.id, deal_id: deal.id, actor_user_id: activeUser.id, event_type: event.type, label: event.label, created_at: event.at });
          if (error) throw error;
        }
        continue;
      }
      const changed = before.status !== deal.status || before.lastOffer !== deal.lastOffer || before.listingShare !== deal.listingShare;
      if (changed) {
        const { error } = await supabase.from('genz_deals').update({ status: deal.status, listing_share: deal.listingShare, last_offer: deal.lastOffer || null, updated_at: new Date().toISOString() }).eq('id', deal.id);
        if (error) throw error;
      }
      const previousEventIds = new Set(before.events.map((event) => event.id));
      for (const event of deal.events.filter((item) => !previousEventIds.has(item.id))) {
        const { error } = await supabase.from('genz_deal_events').insert({ id: event.id, deal_id: deal.id, actor_user_id: activeUser.id, event_type: event.type, label: event.label, created_at: event.at });
        if (error) throw error;
      }
    }
  }, [supabase]);

  const commit = useCallback((updater: (current: SharedState) => SharedState) => {
    if (!state || !user) return;
    const current = state;
    const next = updater(current);
    setState(next);
    void (async () => {
      try {
        setSyncError('');
        await persistDiff(current, next, user);
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : 'Could not sync change.');
      } finally {
        await load();
      }
    })();
  }, [load, persistDiff, state, user]);

  const updateProfile = useCallback(async (patch: ProfilePatch) => {
    if (!user) return;
    const { error } = await supabase.from('genz_profiles').update({ display_name: patch.displayName.trim(), firm: patch.firm.trim(), cities: patch.cities, specialties: patch.specialties }).eq('id', user.id);
    if (error) throw error;
    await load();
  }, [load, supabase, user]);

  useEffect(() => {
    void load();
    const { data } = supabase.auth.onAuthStateChange(() => { void load(); });
    return () => data.subscription.unsubscribe();
  }, [load, supabase]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`genz-network-${user.id}`);
    for (const table of ['genz_profiles', 'genz_requirements', 'genz_properties', 'genz_deals', 'genz_deal_events']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => { void load(); });
    }
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, supabase, user]);

  return { supabase, user, state, loading, syncError, commit, refresh: load, updateProfile };
}

function AuthPanel({ onAuthenticated }: { onAuthenticated: () => void }) {
  const supabase = useMemo(() => getSupabaseNetworkClient(), []);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [form, setForm] = useState({ email: '', password: '', name: '', firm: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      if (mode === 'signup') {
        if (!form.name.trim() || !form.firm.trim()) throw new Error('Name and firm are required.');
        const { data, error } = await supabase.auth.signUp({ email: form.email.trim(), password: form.password, options: { data: { name: form.name.trim(), firm: form.firm.trim() } } });
        if (error) throw error;
        if (!data.session) setMessage('Account created. Check your email for the confirmation link, then sign in.');
        else onAuthenticated();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
        if (error) throw error;
        onAuthenticated();
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Authentication failed.'); }
    finally { setBusy(false); }
  };
  return <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="grid size-12 place-items-center rounded-2xl bg-blue-600 font-black text-white">G</div><h1 className="mt-5 text-2xl font-bold">{mode === 'signin' ? 'Sign in to GENZ Network' : 'Join GENZ Network'}</h1><p className="mt-2 text-sm leading-6 text-slate-500">Shared broker data is protected by Supabase Auth and row-level security.</p><form className="mt-5 space-y-3" onSubmit={submit}>{mode === 'signup' && <><input className={inputClass} placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><input className={inputClass} placeholder="Firm / brokerage" value={form.firm} onChange={(e) => setForm({ ...form, firm: e.target.value })} /></>}<input className={inputClass} type="email" required placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><input className={inputClass} type="password" required minLength={8} placeholder="Password (8+ characters)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />{message && <div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">{message}</div>}<button disabled={busy} className={`${buttonClass} w-full`} type="submit">{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create broker account'}</button></form><button className="mt-4 w-full text-center text-sm font-semibold text-blue-600" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(''); }}>{mode === 'signin' ? 'New broker? Create account' : 'Already registered? Sign in'}</button></div>;
}

function DashboardView({ state, user, syncError, refresh, updateProfile, signOut }: { state: SharedState; user: User; syncError: string; refresh: () => Promise<void>; updateProfile: (patch: ProfilePatch) => Promise<void>; signOut: () => Promise<void> }) {
  const currentBroker = state.brokers.find((broker) => broker.userId === user.id);
  const topRequirement = state.requirements.find((item) => item.status === 'active');
  const matches = topRequirement ? rankPropertyMatches(state.properties.map((p) => ({ id: p.id, type: p.type, area: p.city, asking: p.asking, size: p.size, status: p.status })), { type: topRequirement.type, areas: [topRequirement.city], maxBudget: topRequirement.maxBudget, minSize: topRequirement.minSize }) : [];
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState({ displayName: currentBroker?.name || '', firm: currentBroker?.firm || '', cities: (currentBroker?.cities || []).join(', '), specialties: (currentBroker?.specialties || []).join(', ') });
  useEffect(() => setProfile({ displayName: currentBroker?.name || '', firm: currentBroker?.firm || '', cities: (currentBroker?.cities || []).join(', '), specialties: (currentBroker?.specialties || []).join(', ') }), [currentBroker?.name, currentBroker?.firm, currentBroker?.cities, currentBroker?.specialties]);
  const saveProfile = async () => { await updateProfile({ displayName: profile.displayName, firm: profile.firm, cities: profile.cities.split(',').map((x) => x.trim()).filter(Boolean), specialties: profile.specialties.split(',').map((x) => x.trim()).filter(Boolean) }); setEditing(false); };
  const metrics = [['Active requirements', state.requirements.filter((x) => x.status === 'active').length], ['Active properties', state.properties.filter((x) => x.status === 'active').length], ['Network brokers', state.brokers.length], ['My deal rooms', state.deals.length]] as const;
  return <div className="space-y-7"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><SectionTitle eyebrow="Network command center" title="Shared GENZ Network" description="Demand, inventory and protected deal rooms now sync across signed-in brokers." /><div className="flex gap-2"><button className={secondaryButton} onClick={() => void refresh()}><RefreshCw className="size-4" /> Refresh</button><button className={secondaryButton} onClick={() => void signOut()}><LogOut className="size-4" /> Sign out</button></div></div><SharedNotice syncError={syncError} /><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">{label}</div><div className="mt-2 text-3xl font-bold">{value}</div></div>)}</section><section className="grid gap-5 xl:grid-cols-[1.3fr_1fr]"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold">Live opportunity check</h2><p className="text-sm text-slate-500">Top active requirement against current network inventory.</p></div><Search className="size-5 text-blue-600" /></div>{topRequirement ? <div className="mt-5"><div className="font-bold">{topRequirement.type} · {topRequirement.city}</div><div className="mt-1 text-sm text-slate-500">Budget {money(topRequirement.maxBudget)} · {topRequirement.minSize}+ sqft</div><div className="mt-4 space-y-2">{matches.slice(0,3).map((match) => { const p = state.properties.find((x) => x.id === match.propertyId)!; return <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3"><div><div className="font-semibold">{p.title}</div><div className="text-xs text-slate-500">{brokerName(state,p.listingBrokerId)}</div></div><b className="text-emerald-600">{match.score}%</b></div>; })}{!matches.length && <div className="text-sm text-slate-500">No eligible matches yet.</div>}</div></div> : <div className="mt-5 text-sm text-slate-500">No active requirement yet.</div>}</div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold">My broker profile</h2><p className="text-xs text-slate-500">{currentBroker?.id || 'Creating profile…'}</p></div><UserRound className="size-5 text-blue-600" /></div>{editing ? <div className="mt-4 space-y-3"><input className={inputClass} value={profile.displayName} onChange={(e)=>setProfile({...profile,displayName:e.target.value})} placeholder="Name"/><input className={inputClass} value={profile.firm} onChange={(e)=>setProfile({...profile,firm:e.target.value})} placeholder="Firm"/><input className={inputClass} value={profile.cities} onChange={(e)=>setProfile({...profile,cities:e.target.value})} placeholder="Cities, comma separated"/><input className={inputClass} value={profile.specialties} onChange={(e)=>setProfile({...profile,specialties:e.target.value})} placeholder="Specialties, comma separated"/><div className="flex gap-2"><button className={buttonClass} onClick={()=>void saveProfile()}>Save profile</button><button className={secondaryButton} onClick={()=>setEditing(false)}>Cancel</button></div></div> : <div className="mt-4"><div className="text-lg font-bold">{currentBroker?.name}</div><div className="text-sm text-slate-500">{currentBroker?.firm}</div><div className="mt-3 flex flex-wrap gap-2">{currentBroker?.cities.map((x)=><span key={x} className="rounded-full bg-slate-100 px-2 py-1 text-xs">{x}</span>)}</div><button className={`${secondaryButton} mt-4`} onClick={()=>setEditing(true)}>Edit profile</button></div>}</div></section></div>;
}

function RequirementsView({ state, commit, currentBrokerId, syncError }: { state: SharedState; commit: (fn: (state: SharedState) => SharedState) => void; currentBrokerId: string; syncError: string }) {
  const [error, setError] = useState('');
  const [form, setForm] = useState({ buyerName: '', phone: '', city: 'Raipur', type: PROPERTY_TYPES[0], maxBudget: '4500000', minSize: '1500' });
  const submit = (event: FormEvent) => { event.preventDefault(); setError(''); try { const phone = normalizeIndianPhone(form.phone); const budget=Number(form.maxBudget), size=Number(form.minSize); if(!form.buyerName.trim()||!form.city.trim()||budget<=0||size<0) throw new Error('Complete all fields.'); const req: DemoRequirement={id:nextId('REQ'),buyerName:form.buyerName.trim(),buyerPhone:phone,sourceBrokerId:currentBrokerId,city:form.city.trim(),type:form.type,maxBudget:budget,minSize:size,status:'active',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+30*86400000).toISOString()}; commit((s)=>({...s,requirements:[req,...s.requirements]})); setForm({...form,buyerName:'',phone:''}); } catch(e){setError(e instanceof Error?e.message:'Could not add requirement.');} };
  return <div className="space-y-7"><SectionTitle eyebrow="Buyer demand" title="Requirements & Buyer Passport" description="Phone dedupe is enforced across the shared network while public cards expose only protected identity."/><SharedNotice syncError={syncError}/><section className="grid gap-5 xl:grid-cols-[390px_1fr]"><form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Add protected requirement</h2><div className="mt-4 grid gap-3"><input className={inputClass} placeholder="Buyer name" value={form.buyerName} onChange={(e)=>setForm({...form,buyerName:e.target.value})}/><input className={inputClass} placeholder="10-digit mobile" inputMode="numeric" value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})}/><input className={inputClass} placeholder="City / locality" value={form.city} onChange={(e)=>setForm({...form,city:e.target.value})}/><select className={inputClass} value={form.type} onChange={(e)=>setForm({...form,type:e.target.value as typeof form.type})}>{PROPERTY_TYPES.map(x=><option key={x}>{x}</option>)}</select><input className={inputClass} type="number" min="1" value={form.maxBudget} onChange={(e)=>setForm({...form,maxBudget:e.target.value})}/><input className={inputClass} type="number" min="0" value={form.minSize} onChange={(e)=>setForm({...form,minSize:e.target.value})}/></div>{error&&<div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}<button className={`${buttonClass} mt-4 w-full`}><ShieldCheck className="size-4"/> Protect & publish</button><p className="mt-3 text-xs text-slate-500">Default protection window: 30 days.</p></form><div className="space-y-3">{state.requirements.map((r)=>{const matches=rankPropertyMatches(state.properties.map((p)=>({id:p.id,type:p.type,area:p.city,asking:p.asking,size:p.size,status:p.status})),{type:r.type,areas:[r.city],maxBudget:r.maxBudget,minSize:r.minSize});return <article key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex justify-between gap-4"><div><div className="flex gap-2"><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{r.id}</span><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Protected</span></div><h3 className="mt-3 text-lg font-bold">{r.type} · {r.city}</h3><p className="text-sm text-slate-500">Buyer {r.buyerName} · {displayPhone(r.buyerPhone)}</p></div><div className="text-right"><b>{money(r.maxBudget)}</b><div className="text-xs text-slate-500">{r.minSize}+ sqft</div></div></div><div className="mt-4 border-t pt-4 text-xs text-slate-500">Source: <b>{brokerName(state,r.sourceBrokerId)}</b> · expires {new Date(r.expiresAt).toLocaleDateString('en-IN')} · <span className="font-semibold text-blue-600">{matches.length} matches</span></div></article>;})}{!state.requirements.length&&<div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No shared requirements yet.</div>}</div></section></div>;
}

function PropertiesView({ state, commit, currentBrokerId, syncError }: { state: SharedState; commit: (fn: (state: SharedState) => SharedState) => void; currentBrokerId: string; syncError: string }) {
  const [error,setError]=useState(''); const [form,setForm]=useState({title:'',city:'Raipur',type:PROPERTY_TYPES[0],size:'1500',asking:'4300000',ownerName:''});
  const submit=(event:FormEvent)=>{event.preventDefault();setError('');const size=Number(form.size),asking=Number(form.asking);if(!form.title.trim()||!form.city.trim()||!form.ownerName.trim()||size<=0||asking<=0){setError('Complete all property fields.');return;}const duplicate=state.properties.find((p)=>p.status==='active'&&p.city.toLowerCase()===form.city.trim().toLowerCase()&&p.type===form.type&&p.title.toLowerCase()===form.title.trim().toLowerCase()&&Math.abs(p.size-size)<=Math.max(20,size*.02));if(duplicate){setError(`Possible duplicate: ${duplicate.id}`);return;}const property:DemoProperty={id:nextId('PR'),title:form.title.trim(),city:form.city.trim(),type:form.type,size,asking,ownerName:form.ownerName.trim(),listingBrokerId:currentBrokerId,mandateStatus:'pending',status:'active'};commit((s)=>({...s,properties:[property,...s.properties]}));setForm({...form,title:'',ownerName:''});};
  return <div className="space-y-7"><SectionTitle eyebrow="Supply" title="Master Properties & Mandates" description="Shared inventory stays network-visible while the owner identity is visible only to the listing broker."/><SharedNotice syncError={syncError}/><section className="grid gap-5 xl:grid-cols-[390px_1fr]"><form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Add master property</h2><div className="mt-4 grid gap-3"><input className={inputClass} placeholder="Property title" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})}/><input className={inputClass} placeholder="City / locality" value={form.city} onChange={(e)=>setForm({...form,city:e.target.value})}/><select className={inputClass} value={form.type} onChange={(e)=>setForm({...form,type:e.target.value as typeof form.type})}>{PROPERTY_TYPES.map(x=><option key={x}>{x}</option>)}</select><input className={inputClass} type="number" min="1" value={form.size} onChange={(e)=>setForm({...form,size:e.target.value})}/><input className={inputClass} type="number" min="1" value={form.asking} onChange={(e)=>setForm({...form,asking:e.target.value})}/><input className={inputClass} placeholder="Owner name (private)" value={form.ownerName} onChange={(e)=>setForm({...form,ownerName:e.target.value})}/></div>{error&&<div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}<button className={`${buttonClass} mt-4 w-full`}><Plus className="size-4"/> Create property</button></form><div className="grid gap-4 md:grid-cols-2">{state.properties.map((p)=><article key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex justify-between"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{p.id}</span><span className={`rounded-full px-2 py-1 text-xs font-semibold ${p.mandateStatus==='verified'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>{p.mandateStatus==='verified'?'Mandate verified':'Mandate pending'}</span></div><h3 className="mt-4 text-lg font-bold">{p.title}</h3><div className="mt-2 flex items-center gap-1 text-sm text-slate-500"><MapPin className="size-3.5"/>{p.city}</div><div className="mt-4 text-2xl font-bold">{money(p.asking)}</div><div className="text-sm text-slate-500">{p.type} · {p.size} sqft</div><div className="mt-4 border-t pt-4 text-xs text-slate-500">Listing broker: <b>{brokerName(state,p.listingBrokerId)}</b><br/>Owner: {p.ownerName}</div></article>)}{!state.properties.length&&<div className="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No shared properties yet.</div>}</div></section></div>;
}

function BrokersView({ state, syncError }: { state: SharedState; syncError: string }) {
  const [query,setQuery]=useState(''); const brokers=useMemo(()=>state.brokers.filter((b)=>`${b.name} ${b.firm} ${b.cities.join(' ')} ${b.specialties.join(' ')}`.toLowerCase().includes(query.toLowerCase())),[state.brokers,query]);
  return <div className="space-y-7"><SectionTitle eyebrow="Network" title="Broker Directory & Trust" description="Trust is based on shared network activity; verification and sensitive metrics cannot be self-awarded."/><SharedNotice syncError={syncError}/><div className="relative max-w-xl"><Search className="absolute left-3 top-3 size-4 text-slate-400"/><input className={`${inputClass} pl-9`} placeholder="Search broker, city or specialty" value={query} onChange={(e)=>setQuery(e.target.value)}/></div><section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{brokers.map((b)=>{const trust=calculateTrustScore({profileVerified:b.verified,completedDeals:b.completedDeals,successfulCollaborations:b.successfulCollaborations,verifiedVisits:b.verifiedVisits,collaborationRequests:b.collaborationRequests,collaborationResponses:b.collaborationResponses,verifiedReviewAverage:b.rating,verifiedReviewCount:b.reviewCount,unresolvedDisputes:b.unresolvedDisputes});return <article key={b.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex justify-between gap-3"><div className="flex gap-3"><div className="grid size-11 place-items-center rounded-full bg-blue-50 font-bold text-blue-700">{b.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</div><div><div className="flex items-center gap-1 font-bold">{b.name}{b.verified&&<BadgeCheck className="size-4 text-blue-600"/>}</div><div className="text-xs text-slate-500">{b.firm} · {b.id}</div></div></div><div className="rounded-xl bg-slate-950 px-3 py-2 text-center text-white"><div className="text-lg font-black">{trust.score}</div><div className="text-[10px] text-slate-400">TRUST</div></div></div><div className="mt-4 flex flex-wrap gap-2">{b.cities.map(x=><span key={x} className="rounded-full bg-slate-100 px-2 py-1 text-xs">{x}</span>)}{b.specialties.map(x=><span key={x} className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">{x}</span>)}</div><div className="mt-5 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-slate-50 p-2"><b>{b.completedDeals}</b><div className="text-[10px] text-slate-500">Deals</div></div><div className="rounded-lg bg-slate-50 p-2"><b>{b.verifiedVisits}</b><div className="text-[10px] text-slate-500">Visits</div></div><div className="rounded-lg bg-slate-50 p-2"><b>{b.rating.toFixed(1)}★</b><div className="text-[10px] text-slate-500">Reviews</div></div></div></article>;})}{!brokers.length&&<div className="text-sm text-slate-500">No matching brokers.</div>}</section></div>;
}

function DealsView({ state, commit, currentBrokerId, syncError }: { state: SharedState; commit: (fn: (state: SharedState) => SharedState) => void; currentBrokerId: string; syncError: string }) {
  const [selection,setSelection]=useState({requirementId:state.requirements[0]?.id||'',propertyId:state.properties[0]?.id||''}); const [offer,setOffer]=useState<Record<string,string>>({}); const [error,setError]=useState('');
  useEffect(()=>{if(!selection.requirementId&&state.requirements[0])setSelection((s)=>({...s,requirementId:state.requirements[0].id}));if(!selection.propertyId&&state.properties[0])setSelection((s)=>({...s,propertyId:state.properties[0].id}));},[state.requirements,state.properties,selection.requirementId,selection.propertyId]);
  const createDeal=()=>{setError('');const r=state.requirements.find(x=>x.id===selection.requirementId),p=state.properties.find(x=>x.id===selection.propertyId);if(!r||!p){setError('Choose a requirement and property.');return;}if(r.sourceBrokerId!==currentBrokerId&&p.listingBrokerId!==currentBrokerId){setError('You can open a room only when you represent the buyer or the property.');return;}if(state.deals.some(d=>d.requirementId===r.id&&d.propertyId===p.id)){setError('A deal room already exists for this pair.');return;}const deal:DemoDeal={id:nextId('DL'),requirementId:r.id,propertyId:p.id,buyerBrokerId:r.sourceBrokerId,listingBrokerId:p.listingBrokerId,status:'requested',listingShare:50,events:[{id:nextId('EV'),type:'introduction',label:'Protected collaboration requested',at:new Date().toISOString()}]};commit(s=>({...s,deals:[deal,...s.deals]}));};
  const transition=(id:string,status:DemoDeal['status'],label:string,lastOffer?:number)=>commit(s=>({...s,deals:s.deals.map(d=>d.id===id?{...d,status,...(lastOffer?{lastOffer}:{}),events:[...d.events,{id:nextId('EV'),type:status,label,at:new Date().toISOString()}]}:d)}));
  return <div className="space-y-7"><SectionTitle eyebrow="Execution" title="Deal Rooms & Proof Timeline" description="Rooms are visible only to the buyer-side and listing-side brokers enforced by database RLS."/><SharedNotice syncError={syncError}/><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]"><select className={inputClass} value={selection.requirementId} onChange={(e)=>setSelection({...selection,requirementId:e.target.value})}><option value="">Select requirement</option>{state.requirements.map(r=><option key={r.id} value={r.id}>{r.id} · {r.type} · {r.city}</option>)}</select><select className={inputClass} value={selection.propertyId} onChange={(e)=>setSelection({...selection,propertyId:e.target.value})}><option value="">Select property</option>{state.properties.map(p=><option key={p.id} value={p.id}>{p.id} · {p.title}</option>)}</select><button className={buttonClass} onClick={createDeal}><Handshake className="size-4"/> Create room</button></div>{error&&<div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}</section><section className="space-y-4">{state.deals.map((d)=>{const r=state.requirements.find(x=>x.id===d.requirementId),p=state.properties.find(x=>x.id===d.propertyId);return <article key={d.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b p-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex gap-2"><span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">{d.id}</span><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold capitalize text-blue-700">{d.status.replace('_',' ')}</span></div><h3 className="mt-3 font-bold">{r?.type||d.requirementId} → {p?.title||d.propertyId}</h3><p className="text-xs text-slate-500">Buyer broker: {brokerName(state,d.buyerBrokerId)} · Listing broker: {brokerName(state,d.listingBrokerId)} · split {100-d.listingShare}/{d.listingShare}</p></div><div className="flex gap-2">{d.status==='requested'&&<button className={buttonClass} onClick={()=>transition(d.id,'accepted','Co-broker terms accepted · 50/50 split')}>Accept terms</button>}{d.status==='accepted'&&<button className={buttonClass} onClick={()=>transition(d.id,'visit_verified','Site visit verified with broker proof')}>Verify visit</button>}{['visit_verified','negotiation'].includes(d.status)&&<button className={secondaryButton} onClick={()=>transition(d.id,'closed','Deal marked closed after accepted negotiation')}>Close deal</button>}</div></div><div className="grid gap-5 p-5 lg:grid-cols-[1fr_360px]"><div><h4 className="text-sm font-bold">Proof timeline</h4><div className="mt-3 space-y-3">{d.events.slice().reverse().map(ev=><div key={ev.id} className="flex gap-3"><div className="mt-1 grid size-7 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-3.5"/></div><div><div className="text-sm font-medium">{ev.label}</div><div className="text-xs text-slate-400">{new Date(ev.at).toLocaleString('en-IN')}</div></div></div>)}</div></div><div className="rounded-xl bg-slate-50 p-4"><h4 className="font-bold">Negotiation</h4>{d.lastOffer&&<div className="mt-2 text-xl font-bold">Last offer {money(d.lastOffer)}</div>}<div className="mt-3 flex gap-2"><input className={inputClass} type="number" min="1" placeholder="Offer ₹" value={offer[d.id]||''} onChange={(e)=>setOffer({...offer,[d.id]:e.target.value})}/><button className="rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white" onClick={()=>{const value=Number(offer[d.id]);if(value>0){transition(d.id,'negotiation',`Buyer offer recorded · ${money(value)}`,value);setOffer({...offer,[d.id]:''});}}}>Add</button></div><div className="mt-4 text-xs text-slate-500"><Clock3 className="mr-1 inline size-3"/> Events are append-only in the timeline UI.</div></div></div></article>;})}{!state.deals.length&&<div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No deal rooms for your account yet.</div>}</section></div>;
}

export default function SharedNetwork({ view }: { view: View }) {
  const network = useSharedNetwork();
  if (network.loading && !network.user) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading secure network…</div>;
  if (!network.user) return <AuthPanel onAuthenticated={() => void network.refresh()} />;
  if (!network.state) return <div className="space-y-4"><SharedNotice syncError={network.syncError || 'Could not load network state.'}/><button className={secondaryButton} onClick={()=>void network.refresh()}><RefreshCw className="size-4"/> Retry</button></div>;
  const currentBrokerId = brokerCodeForUser(network.state, network.user.id);
  const signOut = async () => { await network.supabase.auth.signOut(); await network.refresh(); };
  if (view === 'dashboard') return <DashboardView state={network.state} user={network.user} syncError={network.syncError} refresh={network.refresh} updateProfile={network.updateProfile} signOut={signOut}/>;
  if (view === 'requirements') return <RequirementsView state={network.state} commit={network.commit} currentBrokerId={currentBrokerId} syncError={network.syncError}/>;
  if (view === 'properties') return <PropertiesView state={network.state} commit={network.commit} currentBrokerId={currentBrokerId} syncError={network.syncError}/>;
  if (view === 'brokers') return <BrokersView state={network.state} syncError={network.syncError}/>;
  return <DealsView state={network.state} commit={network.commit} currentBrokerId={currentBrokerId} syncError={network.syncError}/>;
}
