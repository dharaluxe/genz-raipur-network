'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Handshake,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Send,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';
const darkButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

const CLOSE_REASONS = [
  ['price_not_agreed', 'Price not agreed'],
  ['buyer_unresponsive', 'Buyer unresponsive'],
  ['seller_unresponsive', 'Seller unresponsive'],
  ['property_unavailable', 'Property unavailable'],
  ['financing_failed', 'Financing failed'],
  ['documentation_issue', 'Documentation issue'],
  ['commission_not_agreed', 'Commission not agreed'],
  ['duplicate_opportunity', 'Duplicate opportunity'],
  ['expired_requirement', 'Requirement expired'],
  ['other', 'Other'],
] as const;

type DealSnapshot = {
  deal_id: string;
  requirement_id: string;
  property_id: string;
  status: string;
  last_offer: number | string | null;
  listing_share: number;
  created_at: string;
  requirement_city: string;
  requirement_type: string;
  property_title: string;
  property_city: string;
  property_type: string;
  buyer_broker_code: string;
  buyer_broker_name: string;
  listing_broker_code: string;
  listing_broker_name: string;
  participant_role: string;
  can_offer: boolean;
  can_message: boolean;
  can_add_evidence: boolean;
  can_manage_visit: boolean;
  can_close: boolean;
};

type Offer = {
  id: string;
  deal_id: string;
  parent_offer_id: string | null;
  offered_by_user_id: string;
  amount: number | string;
  note: string;
  status: string;
  valid_until: string;
  responded_by_user_id: string | null;
  responded_at: string | null;
  created_at: string;
};

type DealMessage = { id: string; deal_id: string; sender_user_id: string; reply_to_message_id: string | null; body: string; created_at: string };
type DealEvent = { id: string; deal_id: string; actor_user_id: string; event_type: string; label: string; created_at: string };
type Evidence = { id: string; deal_id: string; added_by_user_id: string; evidence_type: string; title: string; note: string; storage_path: string | null; original_name: string; created_at: string };
type Closeout = { id: string; deal_id: string; version: number; outcome: string; reason_code: string; note: string; status: string; proposed_by_user_id: string; confirmed_at: string | null; created_at: string };
type Participant = { deal_id: string; user_id: string; role: string; status: string; can_offer: boolean; can_message: boolean; can_add_evidence: boolean; can_manage_visit: boolean; can_close: boolean; can_view_financials: boolean; can_manage_participants: boolean };
type Profile = { id: string; broker_code: string; display_name: string; firm: string };

type DealDetails = {
  offers: Offer[];
  messages: DealMessage[];
  events: DealEvent[];
  evidence: Evidence[];
  closeouts: Closeout[];
  participants: Participant[];
  profiles: Profile[];
};

function money(value: number | string | null | undefined) {
  const n = Number(value || 0);
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;
}

function when(value: string) {
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function pretty(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (x) => x.toUpperCase());
}

function friendlyError(message: string) {
  const pairs: Array<[string, string]> = [
    ['OTHER_BROKER_MUST_ACCEPT', 'The broker who received this collaboration request must accept it.'],
    ['DEAL_NOT_READY_FOR_OFFER', 'Accept the Deal Room before starting price negotiation.'],
    ['CANNOT_RESPOND_OWN_OFFER', 'The other broker must accept or reject this offer.'],
    ['CANNOT_COUNTER_OWN_OFFER', 'You can counter only the other broker’s open offer.'],
    ['PARENT_OFFER_NOT_OPEN', 'That offer is no longer open for a counter-offer.'],
    ['DEAL_OFFER_DENIED', 'Your participant role does not have offer permission.'],
    ['DEAL_MESSAGE_DENIED', 'Your participant role does not have message permission.'],
    ['DEAL_EVIDENCE_DENIED', 'Your participant role does not have evidence permission.'],
    ['DEAL_CLOSE_DENIED', 'Your participant role cannot close this deal.'],
    ['DEAL_ALREADY_CLOSED', 'This deal is already closed.'],
    ['DEAL_CREATE_DENIED', 'You can create a room only when you represent this buyer requirement or property.'],
    ['SOURCE_NOT_ACTIVE', 'The selected requirement or property is no longer active.'],
  ];
  const hit = pairs.find(([key]) => message.includes(key));
  return hit?.[1] || message;
}

function StatusPill({ value }: { value: string }) {
  const tone = value === 'accepted' || value === 'confirmed'
    ? 'bg-emerald-50 text-emerald-700'
    : value === 'rejected' || value === 'failed'
      ? 'bg-red-50 text-red-700'
      : value === 'proposed' || value === 'negotiation' || value === 'requested'
        ? 'bg-amber-50 text-amber-800'
        : 'bg-slate-100 text-slate-700';
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>{pretty(value)}</span>;
}

export default function AdvancedDealRoom() {
  const supabase = useMemo(() => getSupabaseNetworkClient(), []);
  const [userId, setUserId] = useState('');
  const [member, setMember] = useState<boolean | null>(null);
  const [deals, setDeals] = useState<DealSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [details, setDetails] = useState<DealDetails>({ offers: [], messages: [], events: [], evidence: [], closeouts: [], participants: [], profiles: [] });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [createForm, setCreateForm] = useState({ requirementId: '', propertyId: '' });
  const [offerForm, setOfferForm] = useState({ amount: '', note: '', parentId: '' });
  const [chat, setChat] = useState('');
  const [proof, setProof] = useState({ title: '', note: '' });
  const [closeout, setCloseout] = useState({ outcome: 'failed', reason: 'price_not_agreed', note: '' });

  const selected = deals.find((deal) => deal.deal_id === selectedId) || null;
  const profileMap = useMemo(() => new Map(details.profiles.map((profile) => [profile.id, profile])), [details.profiles]);
  const latestCloseout = details.closeouts[0] || null;

  const brokerLabel = useCallback((id: string) => {
    const profile = profileMap.get(id);
    if (!profile) return id === userId ? 'You' : 'Broker';
    return `${profile.display_name} · ${profile.broker_code}`;
  }, [profileMap, userId]);

  const loadDeals = useCallback(async () => {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!auth.user) {
      setUserId('');
      setMember(false);
      setDeals([]);
      return;
    }
    setUserId(auth.user.id);
    const { data: profile, error: profileError } = await supabase.from('genz_profiles').select('id').eq('id', auth.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) {
      setMember(false);
      setDeals([]);
      return;
    }
    setMember(true);
    const { data, error } = await supabase.rpc('genz_deal_room_snapshot');
    if (error) throw error;
    const rows = (data || []) as DealSnapshot[];
    setDeals(rows);
    setSelectedId((current) => current && rows.some((row) => row.deal_id === current) ? current : rows[0]?.deal_id || '');
  }, [supabase]);

  const loadDetails = useCallback(async (dealId: string) => {
    if (!dealId) {
      setDetails({ offers: [], messages: [], events: [], evidence: [], closeouts: [], participants: [], profiles: [] });
      return;
    }
    const [offers, messages, events, evidence, closeouts, participants, profiles] = await Promise.all([
      supabase.from('genz_deal_offers').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }),
      supabase.from('genz_deal_messages').select('*').eq('deal_id', dealId).order('created_at', { ascending: true }),
      supabase.from('genz_deal_events').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }),
      supabase.from('genz_deal_evidence').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }),
      supabase.from('genz_deal_closeouts').select('*').eq('deal_id', dealId).order('version', { ascending: false }),
      supabase.from('genz_deal_participants').select('*').eq('deal_id', dealId).order('created_at', { ascending: true }),
      supabase.from('genz_profiles').select('id,broker_code,display_name,firm'),
    ]);
    for (const result of [offers, messages, events, evidence, closeouts, participants, profiles]) if (result.error) throw result.error;
    setDetails({
      offers: (offers.data || []) as Offer[],
      messages: (messages.data || []) as DealMessage[],
      events: (events.data || []) as DealEvent[],
      evidence: (evidence.data || []) as Evidence[],
      closeouts: (closeouts.data || []) as Closeout[],
      participants: (participants.data || []) as Participant[],
      profiles: (profiles.data || []) as Profile[],
    });
  }, [supabase]);

  const refresh = useCallback(async () => {
    setMessage('');
    try {
      await loadDeals();
    } catch (error) {
      setMessage(friendlyError(error instanceof Error ? error.message : 'Could not load Deal Rooms.'));
    }
  }, [loadDeals]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (selectedId) void loadDetails(selectedId).catch((error) => setMessage(friendlyError(error.message))); }, [loadDetails, selectedId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`genz-deal-room-${userId}`);
    for (const table of ['genz_deals', 'genz_deal_events', 'genz_deal_offers', 'genz_deal_messages', 'genz_deal_evidence', 'genz_deal_closeouts']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        void loadDeals();
        if (selectedId) void loadDetails(selectedId);
      });
    }
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadDeals, loadDetails, selectedId, supabase, userId]);

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setMessage('');
    try {
      await action();
      setMessage(success);
      await loadDeals();
      if (selectedId) await loadDetails(selectedId);
    } catch (error) {
      setMessage(friendlyError(error instanceof Error ? error.message : 'Action failed.'));
    } finally {
      setBusy(false);
    }
  };

  const createRoom = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      if (!createForm.requirementId.trim() || !createForm.propertyId.trim()) throw new Error('Requirement ID and Property ID are required.');
      const { data, error } = await supabase.rpc('genz_create_deal_room_v2', { p_requirement_id: createForm.requirementId.trim(), p_property_id: createForm.propertyId.trim() });
      if (error) throw error;
      const dealId = String(data || '');
      if (dealId) setSelectedId(dealId);
      setCreateForm({ requirementId: '', propertyId: '' });
    }, 'Deal Room ready.');
  };

  const makeOffer = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    await run(async () => {
      const amount = Number(offerForm.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid offer amount.');
      const { error } = await supabase.rpc('genz_make_deal_offer', {
        p_deal_id: selected.deal_id,
        p_amount: amount,
        p_note: offerForm.note.trim(),
        p_parent_offer_id: offerForm.parentId || null,
        p_valid_hours: 72,
      });
      if (error) throw error;
      setOfferForm({ amount: '', note: '', parentId: '' });
    }, offerForm.parentId ? 'Counter-offer recorded.' : 'Offer recorded.');
  };

  const respondOffer = async (offerId: string, decision: 'accepted' | 'rejected') => {
    await run(async () => {
      const { error } = await supabase.rpc('genz_respond_deal_offer', { p_offer_id: offerId, p_decision: decision, p_note: '' });
      if (error) throw error;
    }, `Offer ${decision}.`);
  };

  const withdrawOffer = async (offerId: string) => {
    await run(async () => {
      const { error } = await supabase.rpc('genz_withdraw_deal_offer', { p_offer_id: offerId });
      if (error) throw error;
    }, 'Offer withdrawn.');
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const body = chat.trim();
    if (!body) return;
    await run(async () => {
      const { error } = await supabase.rpc('genz_post_deal_message', { p_deal_id: selected.deal_id, p_body: body, p_reply_to_message_id: null });
      if (error) throw error;
      setChat('');
    }, 'Message sent.');
  };

  const addProofNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    await run(async () => {
      if (!proof.title.trim()) throw new Error('Evidence title is required.');
      const { error } = await supabase.rpc('genz_register_deal_evidence', {
        p_deal_id: selected.deal_id,
        p_evidence_type: 'note',
        p_title: proof.title.trim(),
        p_note: proof.note.trim(),
        p_storage_path: null,
        p_original_name: '',
        p_mime_type: '',
        p_size_bytes: 0,
      });
      if (error) throw error;
      setProof({ title: '', note: '' });
    }, 'Proof note added to timeline.');
  };

  const uploadEvidence = async (file: File | null) => {
    if (!selected || !file) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) { setMessage('Evidence file must be PDF, JPG or PNG.'); return; }
    if (file.size > 10 * 1024 * 1024) { setMessage('Evidence file must be 10 MB or smaller.'); return; }
    await run(async () => {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120);
      const path = `${userId}/deal/${selected.deal_id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from('genz-property-docs').upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;
      const type = file.type.startsWith('image/') ? 'image' : 'document';
      const { error } = await supabase.rpc('genz_register_deal_evidence', {
        p_deal_id: selected.deal_id,
        p_evidence_type: type,
        p_title: file.name,
        p_note: '',
        p_storage_path: path,
        p_original_name: file.name,
        p_mime_type: file.type,
        p_size_bytes: file.size,
      });
      if (error) {
        await supabase.storage.from('genz-property-docs').remove([path]);
        throw error;
      }
    }, 'Evidence uploaded.');
  };

  const openEvidence = async (item: Evidence) => {
    if (!item.storage_path) return;
    setMessage('');
    const { data, error } = await supabase.storage.from('genz-property-docs').createSignedUrl(item.storage_path, 300);
    if (error) { setMessage(friendlyError(error.message)); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const proposeCloseout = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    await run(async () => {
      const { error } = await supabase.rpc('genz_propose_deal_closeout', {
        p_deal_id: selected.deal_id,
        p_outcome: closeout.outcome,
        p_reason_code: closeout.reason,
        p_note: closeout.note.trim(),
      });
      if (error) throw error;
      setCloseout({ outcome: 'failed', reason: 'price_not_agreed', note: '' });
    }, 'Closeout proposed. The other core broker must confirm it.');
  };

  const respondCloseout = async (accept: boolean) => {
    if (!latestCloseout) return;
    await run(async () => {
      const { error } = await supabase.rpc('genz_respond_deal_closeout', { p_closeout_id: latestCloseout.id, p_accept: accept, p_note: '' });
      if (error) throw error;
    }, accept ? 'Closeout confirmed.' : 'Closeout rejected; deal remains open.');
  };

  if (member === null) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading Deal Rooms…</div>;
  if (!userId) return <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"><Handshake className="size-8 text-blue-600" /><h1 className="mt-4 text-2xl font-bold">Sign in to open Deal Rooms</h1><p className="mt-2 text-sm text-slate-600">Negotiation, proof and closeout history are private to deal participants.</p><Link href="/login" className={`${primaryButton} mt-5`}>Sign in</Link></div>;
  if (!member) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-7"><ShieldCheck className="size-8 text-amber-700" /><h1 className="mt-4 text-2xl font-bold">GENZ membership required</h1><p className="mt-2 text-sm text-amber-900">This authenticated account is not an approved broker member.</p></div>;

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Execution</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Deal Rooms & Negotiation</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Offer history, broker messages, evidence and unsuccessful closeout reasons are recorded separately so one overwritten field cannot erase the negotiation trail.</p>
        </div>
        <button className={secondaryButton} disabled={busy} onClick={() => void refresh()}><RefreshCw className="size-4" /> Refresh</button>
      </header>

      {message && <div className={`rounded-xl border p-3 text-sm ${message.toLowerCase().includes('failed') || message.toLowerCase().includes('denied') || message.toLowerCase().includes('required') ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>{message}</div>}

      <form onSubmit={createRoom} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><Handshake className="size-5 text-blue-600" /><h2 className="font-bold">Open or reuse a Deal Room</h2></div>
        <p className="mt-1 text-xs text-slate-500">Only the buyer-requirement broker or listing broker can create the room. Existing requirement/property pair is reused.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <input className={inputClass} placeholder="Requirement ID" value={createForm.requirementId} onChange={(e) => setCreateForm({ ...createForm, requirementId: e.target.value })} />
          <input className={inputClass} placeholder="Property ID" value={createForm.propertyId} onChange={(e) => setCreateForm({ ...createForm, propertyId: e.target.value })} />
          <button className={primaryButton} disabled={busy}>Open room</button>
        </div>
      </form>

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Your rooms</div>
          {deals.map((deal) => (
            <button key={deal.deal_id} onClick={() => setSelectedId(deal.deal_id)} className={`w-full rounded-xl border p-4 text-left transition ${selectedId === deal.deal_id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <div className="flex items-start justify-between gap-2"><b className="text-sm">{deal.deal_id}</b><StatusPill value={deal.status} /></div>
              <div className="mt-2 text-sm font-semibold text-slate-800">{deal.requirement_type} → {deal.property_title}</div>
              <div className="mt-1 text-xs text-slate-500">{deal.property_city || deal.requirement_city}</div>
              {deal.last_offer && <div className="mt-2 text-xs font-bold text-slate-700">Last offer {money(deal.last_offer)}</div>}
            </button>
          ))}
          {!deals.length && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">No Deal Rooms yet.</div>}
        </aside>

        {selected ? (
          <main className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">{selected.deal_id}</span><StatusPill value={selected.status} /><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{pretty(selected.participant_role)}</span></div>
                  <h2 className="mt-3 text-xl font-bold">{selected.requirement_type} → {selected.property_title}</h2>
                  <p className="mt-1 text-xs text-slate-500">Requirement {selected.requirement_id} · Property {selected.property_id}</p>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 p-3"><b>Buyer broker</b><div className="mt-1 text-xs text-slate-600">{selected.buyer_broker_name} · {selected.buyer_broker_code}</div></div>
                    <div className="rounded-xl bg-slate-50 p-3"><b>Listing broker</b><div className="mt-1 text-xs text-slate-600">{selected.listing_broker_name} · {selected.listing_broker_code}</div></div>
                  </div>
                </div>
                {selected.status === 'requested' && <button className={primaryButton} disabled={busy} onClick={() => void run(async () => { const { error } = await supabase.rpc('genz_accept_deal_room', { p_deal_id: selected.deal_id }); if (error) throw error; }, 'Deal Room accepted.') }><Check className="size-4" /> Accept room</button>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                {[['Offer', selected.can_offer], ['Message', selected.can_message], ['Evidence', selected.can_add_evidence], ['Visit', selected.can_manage_visit], ['Close', selected.can_close]].map(([label, allowed]) => <span key={String(label)} className={`rounded-full px-2.5 py-1 font-bold ${allowed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{label}: {allowed ? 'Allowed' : 'No'}</span>)}
              </div>
            </section>

            <div className="grid gap-5 2xl:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2"><ArrowRightLeft className="size-5 text-blue-600" /><h3 className="font-bold">Offer history</h3></div>
                <form onSubmit={makeOffer} className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
                  {offerForm.parentId && <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"><span>Countering offer {offerForm.parentId.slice(0, 8)}…</span><button type="button" onClick={() => setOfferForm({ ...offerForm, parentId: '' })}><X className="size-4" /></button></div>}
                  <input className={inputClass} type="number" min="1" placeholder="Offer amount ₹" value={offerForm.amount} onChange={(e) => setOfferForm({ ...offerForm, amount: e.target.value })} disabled={!selected.can_offer || selected.status === 'closed'} />
                  <input className={inputClass} placeholder="Offer note (optional)" value={offerForm.note} onChange={(e) => setOfferForm({ ...offerForm, note: e.target.value })} disabled={!selected.can_offer || selected.status === 'closed'} />
                  <button className={darkButton} disabled={busy || !selected.can_offer || selected.status === 'closed'}>{offerForm.parentId ? 'Send counter' : 'Make offer'}</button>
                </form>
                <div className="mt-4 space-y-3">
                  {details.offers.map((item) => {
                    const mine = item.offered_by_user_id === userId;
                    const open = item.status === 'proposed' && new Date(item.valid_until).getTime() > Date.now();
                    return <div key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-lg font-black">{money(item.amount)}</div><div className="text-[11px] text-slate-500">{mine ? 'You' : brokerLabel(item.offered_by_user_id)} · {when(item.created_at)}</div></div><StatusPill value={item.status} /></div>{item.note && <p className="mt-2 text-xs leading-5 text-slate-600">{item.note}</p>}<div className="mt-2 text-[11px] text-slate-400"><Clock3 className="mr-1 inline size-3" /> Valid until {when(item.valid_until)}</div>{open && <div className="mt-3 flex flex-wrap gap-2">{mine ? <button className={secondaryButton} disabled={busy} onClick={() => void withdrawOffer(item.id)}>Withdraw</button> : <><button className={primaryButton} disabled={busy} onClick={() => void respondOffer(item.id, 'accepted')}><Check className="size-4" /> Accept</button><button className={secondaryButton} disabled={busy} onClick={() => void respondOffer(item.id, 'rejected')}><X className="size-4" /> Reject</button><button className={secondaryButton} disabled={busy} onClick={() => setOfferForm({ amount: String(item.amount), note: '', parentId: item.id })}><ArrowRightLeft className="size-4" /> Counter</button></>}</div>}</div>;
                  })}
                  {!details.offers.length && <div className="text-sm text-slate-500">No recorded offers yet.</div>}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2"><MessageSquare className="size-5 text-blue-600" /><h3 className="font-bold">Broker messages</h3></div>
                <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {details.messages.map((item) => <div key={item.id} className={`max-w-[88%] rounded-xl p-3 text-sm ${item.sender_user_id === userId ? 'ml-auto bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'}`}><div>{item.body}</div><div className={`mt-1 text-[10px] ${item.sender_user_id === userId ? 'text-blue-100' : 'text-slate-400'}`}>{item.sender_user_id === userId ? 'You' : brokerLabel(item.sender_user_id)} · {when(item.created_at)}</div></div>)}
                  {!details.messages.length && <div className="text-sm text-slate-500">No messages yet.</div>}
                </div>
                <form onSubmit={sendMessage} className="mt-4 flex gap-2"><input className={inputClass} maxLength={2000} placeholder="Write a broker message" value={chat} onChange={(e) => setChat(e.target.value)} disabled={!selected.can_message || selected.status === 'closed'} /><button className={darkButton} disabled={busy || !selected.can_message || selected.status === 'closed'}><Send className="size-4" /></button></form>
              </section>
            </div>

            <div className="grid gap-5 2xl:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2"><Paperclip className="size-5 text-blue-600" /><h3 className="font-bold">Deal evidence</h3></div>
                <form onSubmit={addProofNote} className="mt-4 grid gap-2"><input className={inputClass} placeholder="Proof note title" value={proof.title} onChange={(e) => setProof({ ...proof, title: e.target.value })} disabled={!selected.can_add_evidence || selected.status === 'closed'} /><textarea className={`${inputClass} min-h-20`} placeholder="Evidence note" value={proof.note} onChange={(e) => setProof({ ...proof, note: e.target.value })} disabled={!selected.can_add_evidence || selected.status === 'closed'} /><div className="flex flex-wrap gap-2"><button className={secondaryButton} disabled={busy || !selected.can_add_evidence || selected.status === 'closed'}><FileText className="size-4" /> Add proof note</button><label className={`${secondaryButton} cursor-pointer ${!selected.can_add_evidence || selected.status === 'closed' ? 'pointer-events-none opacity-50' : ''}`}><Upload className="size-4" /> Upload PDF / image<input className="hidden" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => { const file = e.target.files?.[0] || null; void uploadEvidence(file); e.currentTarget.value = ''; }} /></label></div></form>
                <div className="mt-4 space-y-2">{details.evidence.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-2"><div><b className="text-sm">{item.title}</b><div className="mt-1 text-[11px] text-slate-500">{pretty(item.evidence_type)} · {brokerLabel(item.added_by_user_id)} · {when(item.created_at)}</div></div>{item.storage_path && <button className={secondaryButton} onClick={() => void openEvidence(item)}><ExternalLink className="size-4" /> Open</button>}</div>{item.note && <p className="mt-2 text-xs leading-5 text-slate-600">{item.note}</p>}</div>)}{!details.evidence.length && <div className="text-sm text-slate-500">No evidence attached yet.</div>}</div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2"><AlertTriangle className="size-5 text-amber-600" /><h3 className="font-bold">Unsuccessful closeout</h3></div>
                <p className="mt-1 text-xs leading-5 text-slate-500">A failed/withdrawn deal needs a structured reason and confirmation from both core brokers. Successful final-price closing remains in the Commission workspace.</p>
                {latestCloseout?.status === 'proposed' && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center justify-between gap-2"><b className="text-sm">Pending closeout v{latestCloseout.version}</b><StatusPill value={latestCloseout.status} /></div><div className="mt-2 text-sm">{pretty(latestCloseout.outcome)} · {pretty(latestCloseout.reason_code)}</div>{latestCloseout.note && <p className="mt-1 text-xs text-amber-900">{latestCloseout.note}</p>}{latestCloseout.proposed_by_user_id !== userId && <div className="mt-3 flex gap-2"><button className={primaryButton} disabled={busy} onClick={() => void respondCloseout(true)}><Check className="size-4" /> Confirm</button><button className={secondaryButton} disabled={busy} onClick={() => void respondCloseout(false)}><X className="size-4" /> Reject</button></div>}{latestCloseout.proposed_by_user_id === userId && <div className="mt-3 text-xs font-semibold text-amber-900">Waiting for the other broker.</div>}</div>}
                <form onSubmit={proposeCloseout} className="mt-4 space-y-3"><div className="grid gap-2 sm:grid-cols-2"><select className={inputClass} value={closeout.outcome} onChange={(e) => setCloseout({ ...closeout, outcome: e.target.value })} disabled={!selected.can_close || selected.status === 'closed'}><option value="failed">Failed</option><option value="withdrawn">Withdrawn</option><option value="expired">Expired</option><option value="duplicate">Duplicate</option></select><select className={inputClass} value={closeout.reason} onChange={(e) => setCloseout({ ...closeout, reason: e.target.value })} disabled={!selected.can_close || selected.status === 'closed'}>{CLOSE_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><textarea className={`${inputClass} min-h-20`} placeholder="Closeout note / factual context" value={closeout.note} onChange={(e) => setCloseout({ ...closeout, note: e.target.value })} disabled={!selected.can_close || selected.status === 'closed'} /><button className={secondaryButton} disabled={busy || !selected.can_close || selected.status === 'closed' || latestCloseout?.status === 'proposed'}>Propose closeout</button></form>
                <Link href="/commissions" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-blue-700">Successful closing & commission confirmation <ExternalLink className="size-3" /></Link>
              </section>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><CheckCircle2 className="size-5 text-emerald-600" /><h3 className="font-bold">Proof timeline</h3></div>
              <div className="mt-4 space-y-3">{details.events.map((event) => <div key={event.id} className="flex gap-3"><div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-3.5" /></div><div><div className="text-sm font-medium">{event.label}</div><div className="mt-0.5 text-[11px] text-slate-400">{pretty(event.event_type)} · {brokerLabel(event.actor_user_id)} · {when(event.created_at)}</div></div></div>)}{!details.events.length && <div className="text-sm text-slate-500">No timeline events yet.</div>}</div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-blue-600" /><h3 className="font-bold">Participant permissions</h3></div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">{details.participants.map((participant) => <div key={participant.user_id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between"><div><b className="text-sm">{brokerLabel(participant.user_id)}</b><div className="text-[11px] text-slate-500">{pretty(participant.role)}</div></div><StatusPill value={participant.status} /></div><div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">{[['Offer',participant.can_offer],['Message',participant.can_message],['Evidence',participant.can_add_evidence],['Visit',participant.can_manage_visit],['Close',participant.can_close],['Financials',participant.can_view_financials]].map(([label,allowed])=><span key={String(label)} className={`rounded-full px-2 py-1 font-semibold ${allowed?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-400'}`}>{label}</span>)}</div></div>)}</div>
            </section>
          </main>
        ) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Create or select a Deal Room to start.</div>}
      </div>
    </div>
  );
}
