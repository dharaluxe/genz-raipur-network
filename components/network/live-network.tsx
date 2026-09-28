'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, BadgeCheck, Building2, CheckCircle2, Clock3, Handshake, MapPin, Plus, RotateCcw, Search, ShieldCheck, Star, UsersRound } from 'lucide-react';
import { calculateTrustScore } from '@/lib/trust-score';
import { rankPropertyMatches } from '@/lib/matching-v2';
import {
  DEMO_NETWORK_SEED,
  PROPERTY_TYPES,
  loadDemoNetwork,
  maskPhone,
  money,
  nextId,
  normalizeIndianPhone,
  resetDemoNetwork,
  saveDemoNetwork,
  type DemoDeal,
  type DemoNetworkState,
  type DemoProperty,
  type DemoRequirement,
} from '@/lib/demo-network';

type View = 'dashboard' | 'requirements' | 'properties' | 'brokers' | 'deals';

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';

function useDemoNetwork() {
  const [state, setState] = useState<DemoNetworkState | null>(null);
  useEffect(() => {
    const refresh = () => setState(loadDemoNetwork());
    refresh();
    window.addEventListener('genz-network-demo-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('genz-network-demo-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const commit = (updater: (current: DemoNetworkState) => DemoNetworkState) => {
    const current = loadDemoNetwork();
    const next = updater(current);
    saveDemoNetwork(next);
    setState(next);
  };
  return { state, commit };
}

function brokerName(state: DemoNetworkState, id: string) {
  return state.brokers.find((broker) => broker.id === id)?.name || id;
}

function SectionTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">{eyebrow}</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {action}
    </section>
  );
}

function BetaNotice() {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900">
      <b>Live V2 beta:</b> the complete interaction flow is enabled. Beta records persist in this browser while the shared Supabase network database is being cut over; protected phone numbers are never shown in public cards.
    </div>
  );
}

function DashboardView({ state }: { state: DemoNetworkState }) {
  const topRequirement = state.requirements.find((item) => item.status === 'active');
  const matches = topRequirement
    ? rankPropertyMatches(
        state.properties.map((p) => ({ id: p.id, type: p.type, area: p.city, asking: p.asking, size: p.size, status: p.status })),
        { type: topRequirement.type, areas: [topRequirement.city], maxBudget: topRequirement.maxBudget, minSize: topRequirement.minSize },
      )
    : [];
  const metrics = [
    ['Active requirements', state.requirements.filter((x) => x.status === 'active').length, 'Protected buyer demand'],
    ['Active properties', state.properties.filter((x) => x.status === 'active').length, 'Master inventory'],
    ['Verified brokers', state.brokers.filter((x) => x.verified).length, 'Cross-market network'],
    ['Deal rooms', state.deals.length, 'Evidence-backed collaboration'],
  ] as const;

  return (
    <div className="space-y-7">
      <SectionTitle eyebrow="Network command center" title="One broker network. No city lock." description="Post demand, register verified inventory, discover the right broker and freeze collaboration proof inside a deal room." />
      <BetaNotice />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, hint]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-2 text-3xl font-bold tracking-tight">{value}</div>
            <div className="mt-1 text-xs text-slate-500">{hint}</div>
          </div>
        ))}
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><div><h2 className="font-bold">Live opportunity check</h2><p className="mt-1 text-sm text-slate-500">Top active requirement against current inventory.</p></div><Search className="size-5 text-blue-600" /></div>
          {topRequirement ? (
            <div className="mt-5 rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{topRequirement.id}</span><span className="text-sm font-semibold">{topRequirement.type}</span><span className="text-sm text-slate-500">· {topRequirement.city}</span></div>
              <div className="mt-3 text-sm text-slate-600">Budget {money(topRequirement.maxBudget)} · Min {topRequirement.minSize.toLocaleString('en-IN')} sqft</div>
              <div className="mt-4 space-y-2">
                {matches.slice(0, 3).map((match) => {
                  const property = state.properties.find((p) => p.id === match.propertyId)!;
                  return <div key={match.propertyId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"><div><div className="text-sm font-semibold">{property.title}</div><div className="text-xs text-slate-500">Listing broker: {brokerName(state, property.listingBrokerId)}</div></div><div className="text-sm font-bold text-emerald-600">{match.score}%</div></div>;
                })}
                {!matches.length && <div className="text-sm text-slate-500">No eligible match yet.</div>}
              </div>
            </div>
          ) : <div className="mt-5 text-sm text-slate-500">No active requirement.</div>}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-400">Protection logic</div>
          <div className="mt-4 space-y-4 text-sm leading-6 text-slate-300">
            <p><b className="text-white">Buyer claim</b> expires instead of staying forever.</p>
            <p><b className="text-white">Matching</b> is explainable by location, price, size and property type.</p>
            <p><b className="text-white">Deal room</b> records the introduction, visit, offers and closure as events.</p>
            <p><b className="text-white">Trust Score</b> is calculated from verified activity rather than admin mood.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function RequirementsView({ state, commit }: { state: DemoNetworkState; commit: ReturnType<typeof useDemoNetwork>['commit'] }) {
  const [error, setError] = useState('');
  const [form, setForm] = useState({ buyerName: '', phone: '', city: 'Raipur', type: PROPERTY_TYPES[0], maxBudget: '4500000', minSize: '1500' });
  const addRequirement = (event: FormEvent) => {
    event.preventDefault(); setError('');
    try {
      const phone = normalizeIndianPhone(form.phone);
      const existing = state.requirements.find((item) => item.buyerPhone === phone && item.status === 'active');
      if (existing) throw new Error(`Buyer already protected under ${existing.id} by ${brokerName(state, existing.sourceBrokerId)}.`);
      const budget = Number(form.maxBudget), minSize = Number(form.minSize);
      if (!form.buyerName.trim() || !form.city.trim() || !Number.isFinite(budget) || budget <= 0 || !Number.isFinite(minSize) || minSize < 0) throw new Error('Complete all requirement fields with valid values.');
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
      const requirement: DemoRequirement = { id: nextId('REQ'), buyerName: form.buyerName.trim(), buyerPhone: phone, sourceBrokerId: state.brokers[0]?.id || 'BR-OWNER', city: form.city.trim(), type: form.type, maxBudget: budget, minSize, status: 'active', createdAt, expiresAt };
      commit((current) => ({ ...current, requirements: [requirement, ...current.requirements] }));
      setForm((current) => ({ ...current, buyerName: '', phone: '' }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add requirement.'); }
  };

  return (
    <div className="space-y-7">
      <SectionTitle eyebrow="Buyer demand" title="Requirements & Buyer Passport" description="Register a buyer once, prevent duplicate source claims and broadcast only the requirement—not the customer's private number." />
      <BetaNotice />
      <section className="grid gap-5 xl:grid-cols-[390px_1fr]">
        <form onSubmit={addRequirement} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><Plus className="size-4 text-blue-600" /><h2 className="font-bold">Add requirement</h2></div>
          <div className="mt-4 grid gap-3">
            <input className={inputClass} placeholder="Buyer name" value={form.buyerName} onChange={(e) => setForm({ ...form, buyerName: e.target.value })} />
            <input className={inputClass} placeholder="10-digit mobile" inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className={inputClass} placeholder="City / locality" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}>{PROPERTY_TYPES.map((item) => <option key={item}>{item}</option>)}</select>
            <input className={inputClass} type="number" min="1" placeholder="Max budget ₹" value={form.maxBudget} onChange={(e) => setForm({ ...form, maxBudget: e.target.value })} />
            <input className={inputClass} type="number" min="0" placeholder="Minimum sqft" value={form.minSize} onChange={(e) => setForm({ ...form, minSize: e.target.value })} />
          </div>
          {error && <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}
          <button className={`${buttonClass} mt-4 w-full`} type="submit"><ShieldCheck className="size-4" /> Protect & publish</button>
          <p className="mt-3 text-xs leading-5 text-slate-500">Default protection: 30 days. Network cards expose only masked identity.</p>
        </form>
        <div className="space-y-3">
          {state.requirements.map((requirement) => {
            const matches = rankPropertyMatches(state.properties.map((p) => ({ id: p.id, type: p.type, area: p.city, asking: p.asking, size: p.size, status: p.status })), { type: requirement.type, areas: [requirement.city], maxBudget: requirement.maxBudget, minSize: requirement.minSize });
            return (
              <article key={requirement.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{requirement.id}</span><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Protected</span></div><h3 className="mt-3 text-lg font-bold">{requirement.type} · {requirement.city}</h3><p className="mt-1 text-sm text-slate-500">Buyer {requirement.buyerName} · {maskPhone(requirement.buyerPhone)}</p></div><div className="text-right"><div className="text-sm font-bold">{money(requirement.maxBudget)}</div><div className="text-xs text-slate-500">{requirement.minSize.toLocaleString('en-IN')}+ sqft</div></div></div>
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500"><span>Source: <b className="text-slate-700">{brokerName(state, requirement.sourceBrokerId)}</b></span><span>Expires {new Date(requirement.expiresAt).toLocaleDateString('en-IN')}</span><span className="font-semibold text-blue-600">{matches.length} eligible match{matches.length === 1 ? '' : 'es'}</span></div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function PropertiesView({ state, commit }: { state: DemoNetworkState; commit: ReturnType<typeof useDemoNetwork>['commit'] }) {
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', city: 'Raipur', type: PROPERTY_TYPES[0], size: '1500', asking: '4300000', ownerName: '', listingBrokerId: state.brokers[0]?.id || '' });
  const addProperty = (event: FormEvent) => {
    event.preventDefault(); setError('');
    const size = Number(form.size), asking = Number(form.asking);
    if (!form.title.trim() || !form.city.trim() || !form.ownerName.trim() || !Number.isFinite(size) || size <= 0 || !Number.isFinite(asking) || asking <= 0) { setError('Complete all property and mandate fields.'); return; }
    const duplicate = state.properties.find((item) => item.status === 'active' && item.city.trim().toLowerCase() === form.city.trim().toLowerCase() && item.type === form.type && Math.abs(item.size - size) <= Math.max(20, size * 0.02) && item.title.trim().toLowerCase() === form.title.trim().toLowerCase());
    if (duplicate) { setError(`Possible duplicate master property: ${duplicate.id}. Use the existing property and add broker authorization instead.`); return; }
    const property: DemoProperty = { id: nextId('PR'), title: form.title.trim(), city: form.city.trim(), type: form.type, size, asking, ownerName: form.ownerName.trim(), listingBrokerId: form.listingBrokerId, mandateStatus: 'pending', status: 'active' };
    commit((current) => ({ ...current, properties: [property, ...current.properties] }));
    setForm((current) => ({ ...current, title: '', ownerName: '' }));
  };
  return (
    <div className="space-y-7">
      <SectionTitle eyebrow="Supply" title="Master Properties & Mandates" description="One property identity, multiple broker relationships. Duplicate listings are blocked before they fragment the network." />
      <BetaNotice />
      <section className="grid gap-5 xl:grid-cols-[390px_1fr]">
        <form onSubmit={addProperty} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><Building2 className="size-4 text-blue-600" /><h2 className="font-bold">Add master property</h2></div>
          <div className="mt-4 grid gap-3">
            <input className={inputClass} placeholder="Property title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input className={inputClass} placeholder="City / locality" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}>{PROPERTY_TYPES.map((item) => <option key={item}>{item}</option>)}</select>
            <input className={inputClass} type="number" min="1" placeholder="Size sqft" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
            <input className={inputClass} type="number" min="1" placeholder="Asking price ₹" value={form.asking} onChange={(e) => setForm({ ...form, asking: e.target.value })} />
            <input className={inputClass} placeholder="Owner name" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
            <select className={inputClass} value={form.listingBrokerId} onChange={(e) => setForm({ ...form, listingBrokerId: e.target.value })}>{state.brokers.map((broker) => <option value={broker.id} key={broker.id}>{broker.name} · {broker.firm}</option>)}</select>
          </div>
          {error && <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}
          <button className={`${buttonClass} mt-4 w-full`} type="submit"><Plus className="size-4" /> Create master property</button>
        </form>
        <div className="grid gap-4 md:grid-cols-2">
          {state.properties.map((property) => (
            <article key={property.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{property.id}</span><span className={`rounded-full px-2 py-1 text-xs font-semibold ${property.mandateStatus === 'verified' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{property.mandateStatus === 'verified' ? 'Mandate verified' : 'Mandate pending'}</span></div>
              <h3 className="mt-4 text-lg font-bold">{property.title}</h3>
              <div className="mt-2 flex items-center gap-1 text-sm text-slate-500"><MapPin className="size-3.5" /> {property.city}</div>
              <div className="mt-4 text-2xl font-bold">{money(property.asking)}</div>
              <div className="mt-1 text-sm text-slate-500">{property.type} · {property.size.toLocaleString('en-IN')} sqft</div>
              <div className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">Listing broker: <b className="text-slate-700">{brokerName(state, property.listingBrokerId)}</b><br />Owner: {property.ownerName}</div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function BrokersView({ state }: { state: DemoNetworkState }) {
  const [query, setQuery] = useState('');
  const brokers = useMemo(() => state.brokers.filter((broker) => `${broker.name} ${broker.firm} ${broker.cities.join(' ')} ${broker.specialties.join(' ')}`.toLowerCase().includes(query.toLowerCase())), [state.brokers, query]);
  return (
    <div className="space-y-7">
      <SectionTitle eyebrow="Network" title="Broker Directory & Trust" description="Discover collaborators by geography, specialization and verified performance—not by paid ranking." />
      <BetaNotice />
      <div className="relative max-w-xl"><Search className="absolute left-3 top-3 size-4 text-slate-400" /><input className={`${inputClass} pl-9`} placeholder="Search city, broker, firm or specialty" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {brokers.map((broker) => {
          const trust = calculateTrustScore({ profileVerified: broker.verified, completedDeals: broker.completedDeals, successfulCollaborations: broker.successfulCollaborations, verifiedVisits: broker.verifiedVisits, collaborationRequests: broker.collaborationRequests, collaborationResponses: broker.collaborationResponses, verifiedReviewAverage: broker.rating, verifiedReviewCount: broker.reviewCount, unresolvedDisputes: broker.unresolvedDisputes });
          return (
            <article key={broker.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-full bg-blue-50 font-bold text-blue-700">{broker.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div><div><div className="flex items-center gap-1.5 font-bold">{broker.name}{broker.verified && <BadgeCheck className="size-4 text-blue-600" />}</div><div className="text-xs text-slate-500">{broker.firm} · {broker.id}</div></div></div><div className="rounded-xl bg-slate-950 px-3 py-2 text-center text-white"><div className="text-lg font-black">{trust.score}</div><div className="text-[10px] uppercase tracking-wide text-slate-400">Trust</div></div></div>
              <div className="mt-4 flex flex-wrap gap-2">{broker.cities.map((city) => <span key={city} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{city}</span>)}{broker.specialties.map((item) => <span key={item} className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">{item}</span>)}</div>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-slate-50 p-2"><b>{broker.completedDeals}</b><div className="text-[10px] text-slate-500">Deals</div></div><div className="rounded-lg bg-slate-50 p-2"><b>{broker.verifiedVisits}</b><div className="text-[10px] text-slate-500">Visits</div></div><div className="rounded-lg bg-slate-50 p-2"><b>{broker.rating.toFixed(1)}★</b><div className="text-[10px] text-slate-500">{broker.reviewCount} reviews</div></div></div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500"><span>Confidence: <b className="capitalize text-slate-700">{trust.confidence}</b></span><span className="text-emerald-600">{broker.unresolvedDisputes === 0 ? '0 unresolved disputes' : `${broker.unresolvedDisputes} dispute`}</span></div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function DealsView({ state, commit }: { state: DemoNetworkState; commit: ReturnType<typeof useDemoNetwork>['commit'] }) {
  const [selection, setSelection] = useState({ requirementId: state.requirements[0]?.id || '', propertyId: state.properties[0]?.id || '' });
  const [offer, setOffer] = useState<Record<string, string>>({});
  const createDeal = () => {
    const requirement = state.requirements.find((item) => item.id === selection.requirementId);
    const property = state.properties.find((item) => item.id === selection.propertyId);
    if (!requirement || !property) return;
    if (state.deals.some((deal) => deal.requirementId === requirement.id && deal.propertyId === property.id)) return;
    const deal: DemoDeal = { id: nextId('DL'), requirementId: requirement.id, propertyId: property.id, buyerBrokerId: requirement.sourceBrokerId, listingBrokerId: property.listingBrokerId, status: 'requested', listingShare: 50, events: [{ id: nextId('EV'), type: 'introduction', label: 'Protected collaboration requested', at: new Date().toISOString() }] };
    commit((current) => ({ ...current, deals: [deal, ...current.deals] }));
  };
  const transition = (dealId: string, status: DemoDeal['status'], label: string, lastOffer?: number) => commit((current) => ({ ...current, deals: current.deals.map((deal) => deal.id === dealId ? { ...deal, status, ...(lastOffer ? { lastOffer } : {}), events: [...deal.events, { id: nextId('EV'), type: status, label, at: new Date().toISOString() }] } : deal) }));
  return (
    <div className="space-y-7">
      <SectionTitle eyebrow="Execution" title="Deal Rooms & Proof Timeline" description="Freeze the parties and property before contact is shared, then keep visits, offers and closure events in one auditable collaboration timeline." />
      <BetaNotice />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end"><label className="flex-1 text-xs font-semibold text-slate-600">Requirement<select className={`${inputClass} mt-1`} value={selection.requirementId} onChange={(e) => setSelection({ ...selection, requirementId: e.target.value })}>{state.requirements.map((item) => <option value={item.id} key={item.id}>{item.id} · {item.type} · {item.city}</option>)}</select></label><label className="flex-1 text-xs font-semibold text-slate-600">Property<select className={`${inputClass} mt-1`} value={selection.propertyId} onChange={(e) => setSelection({ ...selection, propertyId: e.target.value })}>{state.properties.map((item) => <option value={item.id} key={item.id}>{item.id} · {item.title}</option>)}</select></label><button className={buttonClass} type="button" onClick={createDeal}><Handshake className="size-4" /> Create deal room</button></div>
      </section>
      <section className="space-y-4">
        {state.deals.map((deal) => {
          const requirement = state.requirements.find((item) => item.id === deal.requirementId);
          const property = state.properties.find((item) => item.id === deal.propertyId);
          return (
            <article key={deal.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">{deal.id}</span><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold capitalize text-blue-700">{deal.status.replace('_', ' ')}</span></div><h3 className="mt-3 font-bold">{requirement?.type || deal.requirementId} → {property?.title || deal.propertyId}</h3><p className="mt-1 text-xs text-slate-500">Buyer broker: {brokerName(state, deal.buyerBrokerId)} · Listing broker: {brokerName(state, deal.listingBrokerId)} · Split {100 - deal.listingShare}/{deal.listingShare}</p></div><div className="flex flex-wrap gap-2">{deal.status === 'requested' && <button className={buttonClass} onClick={() => transition(deal.id, 'accepted', 'Co-broker terms accepted · 50/50 split')}>Accept terms</button>}{deal.status === 'accepted' && <button className={buttonClass} onClick={() => transition(deal.id, 'visit_verified', 'Site visit verified with broker proof')}>Verify visit</button>}{['visit_verified', 'negotiation'].includes(deal.status) && <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" onClick={() => transition(deal.id, 'closed', 'Deal marked closed after accepted negotiation')}>Close deal</button>}</div></div>
              <div className="grid gap-5 p-5 lg:grid-cols-[1fr_360px]"><div><h4 className="text-sm font-bold">Proof timeline</h4><div className="mt-3 space-y-3">{deal.events.slice().reverse().map((event) => <div key={event.id} className="flex gap-3"><div className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-3.5" /></div><div><div className="text-sm font-medium">{event.label}</div><div className="text-xs text-slate-400">{new Date(event.at).toLocaleString('en-IN')}</div></div></div>)}</div></div><div className="rounded-xl bg-slate-50 p-4"><h4 className="text-sm font-bold">Negotiation</h4>{deal.lastOffer && <div className="mt-2 text-xl font-bold">Last offer {money(deal.lastOffer)}</div>}<div className="mt-3 flex gap-2"><input className={inputClass} type="number" min="1" placeholder="Offer ₹" value={offer[deal.id] || ''} onChange={(e) => setOffer({ ...offer, [deal.id]: e.target.value })} /><button className="rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white" type="button" onClick={() => { const value = Number(offer[deal.id]); if (value > 0) { transition(deal.id, 'negotiation', `Buyer offer recorded · ${money(value)}`, value); setOffer({ ...offer, [deal.id]: '' }); } }}>Add</button></div><div className="mt-4 text-xs leading-5 text-slate-500"><Clock3 className="mr-1 inline size-3" /> Material actions append to the timeline; prior events are not overwritten.</div></div></div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

export default function LiveNetwork({ view }: { view: View }) {
  const { state, commit } = useDemoNetwork();
  if (!state) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading GENZ Network…</div>;
  const resetButton = view === 'dashboard' ? <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => { resetDemoNetwork(); }}><RotateCcw className="size-3.5" /> Reset beta data</button> : undefined;
  if (view === 'dashboard') return <div className="space-y-4"><div className="flex justify-end">{resetButton}</div><DashboardView state={state} /></div>;
  if (view === 'requirements') return <RequirementsView state={state} commit={commit} />;
  if (view === 'properties') return <PropertiesView state={state} commit={commit} />;
  if (view === 'brokers') return <BrokersView state={state} />;
  return <DealsView state={state} commit={commit} />;
}
