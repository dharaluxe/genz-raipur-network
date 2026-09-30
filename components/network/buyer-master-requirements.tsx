'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronUp, Clock3, History, LockKeyhole, RefreshCw, Save, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';
import { money, nextId, normalizeIndianPhone, PROPERTY_TYPES } from '@/lib/demo-network';

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

type RequirementRow = {
  id: string;
  buyer_id: string;
  source_user_id: string;
  buyer_label: string;
  buyer_phone_masked: string;
  city: string;
  property_type: string;
  min_budget: number | string;
  max_budget: number | string;
  min_size: number;
  status: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  protection_expires_at: string;
  version_no: number;
};

type RelationshipRow = {
  buyer_id: string;
  contact_name: string;
  phone_e164: string;
  status: string;
};

type Candidate = {
  buyer_exists: boolean;
  classification: 'new_buyer' | 'new_requirement' | 'update_own_requirement' | 'protected_requirement';
  own_requirement_id: string | null;
  protected_until: string | null;
};

type VersionRow = {
  id: string;
  requirement_id: string;
  version_no: number;
  city: string;
  property_type: string;
  min_budget: number | string;
  max_budget: number | string;
  min_size: number;
  status: string;
  protection_expires_at: string;
  expires_at: string;
  change_reason: string;
  created_at: string;
};

type FormState = {
  buyerName: string;
  phone: string;
  city: string;
  type: string;
  minBudget: string;
  maxBudget: string;
  minSize: string;
};

const defaultForm: FormState = {
  buyerName: '',
  phone: '',
  city: 'Raipur',
  type: PROPERTY_TYPES[0],
  minBudget: '3000000',
  maxBudget: '4500000',
  minSize: '1500',
};

function budgetRange(row: Pick<RequirementRow, 'min_budget' | 'max_budget'>) {
  const min = Number(row.min_budget || 0);
  const max = Number(row.max_budget || 0);
  return min > 0 ? `${money(min)} – ${money(max)}` : `Up to ${money(max)}`;
}

function statusClass(status: string) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800';
  if (status === 'follow_up') return 'bg-blue-100 text-blue-800';
  if (status === 'paused') return 'bg-amber-100 text-amber-800';
  if (status === 'fulfilled') return 'bg-violet-100 text-violet-800';
  return 'bg-slate-100 text-slate-700';
}

function candidateMessage(candidate: Candidate | null) {
  if (!candidate) return '';
  if (candidate.classification === 'new_buyer') return 'New buyer identity. A new Buyer Master will be created.';
  if (candidate.classification === 'new_requirement') return 'Existing Buyer Master found, but this is a distinct requirement. It can be added separately.';
  if (candidate.classification === 'update_own_requirement') return `A similar active requirement already exists (${candidate.own_requirement_id}). Update it, or explicitly add a separate requirement.`;
  const until = candidate.protected_until ? new Date(candidate.protected_until).toLocaleString('en-IN') : 'the active protection window';
  return `A similar requirement for this buyer is already protected in GENZ until ${until}. Buyer identity and the other broker remain private.`;
}

export default function BuyerMasterRequirements() {
  const supabase = useMemo(() => getSupabaseNetworkClient(), []);
  const [gate, setGate] = useState<'checking' | 'member' | 'blocked'>('checking');
  const [uid, setUid] = useState('');
  const [requirements, setRequirements] = useState<RequirementRow[]>([]);
  const [relationships, setRelationships] = useState<RelationshipRow[]>([]);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState('active');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [expandedVersions, setExpandedVersions] = useState<Record<string, VersionRow[]>>({});
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setError('');
    const auth = await supabase.auth.getUser();
    const activeUid = auth.data.user?.id;
    if (auth.error || !activeUid) {
      setGate('blocked');
      return;
    }
    const member = await supabase.from('genz_profiles').select('id').eq('id', activeUid).maybeSingle();
    if (member.error || !member.data) {
      setGate('blocked');
      return;
    }
    setUid(activeUid);
    setGate('member');
    const [reqRes, relRes] = await Promise.all([
      supabase
        .from('genz_requirements')
        .select('id,buyer_id,source_user_id,buyer_label,buyer_phone_masked,city,property_type,min_budget,max_budget,min_size,status,created_at,updated_at,expires_at,protection_expires_at,version_no')
        .eq('source_user_id', activeUid)
        .order('updated_at', { ascending: false }),
      supabase
        .from('genz_buyer_broker_relationships')
        .select('buyer_id,contact_name,phone_e164,status')
        .eq('broker_user_id', activeUid),
    ]);
    if (reqRes.error) throw reqRes.error;
    if (relRes.error) throw relRes.error;
    setRequirements((reqRes.data || []) as RequirementRow[]);
    setRelationships((relRes.data || []) as RelationshipRow[]);
  }, [supabase]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Could not load requirements.'));
  }, [load]);

  const relationByBuyer = useMemo(() => new Map(relationships.map((row) => [row.buyer_id, row])), [relationships]);

  function validateForm() {
    const phone = normalizeIndianPhone(form.phone);
    const minBudget = Number(form.minBudget || 0);
    const maxBudget = Number(form.maxBudget);
    const minSize = Number(form.minSize || 0);
    if (!form.buyerName.trim() || !form.city.trim() || !form.type.trim()) throw new Error('Buyer, city and property type are required.');
    if (!Number.isFinite(minBudget) || minBudget < 0) throw new Error('Minimum budget cannot be negative.');
    if (!Number.isFinite(maxBudget) || maxBudget <= 0) throw new Error('Enter a valid maximum budget.');
    if (minBudget > maxBudget) throw new Error('Minimum budget cannot be greater than maximum budget.');
    if (!Number.isFinite(minSize) || minSize < 0) throw new Error('Minimum size cannot be negative.');
    return { phone, minBudget, maxBudget, minSize };
  }

  async function checkCandidate() {
    setChecking(true);
    setError('');
    setMessage('');
    try {
      const values = validateForm();
      const { data, error: rpcError } = await supabase.rpc('genz_requirement_candidate', {
        p_phone: values.phone,
        p_city: form.city.trim(),
        p_property_type: form.type,
        p_min_budget: values.minBudget,
        p_max_budget: values.maxBudget,
        p_min_size: values.minSize,
      });
      if (rpcError) throw rpcError;
      const row = (Array.isArray(data) ? data[0] : data) as Candidate | null;
      setCandidate(row);
      return row;
    } catch (e) {
      setCandidate(null);
      setError(e instanceof Error ? e.message : 'Could not check this requirement.');
      return null;
    } finally {
      setChecking(false);
    }
  }

  async function createRequirement(forceSeparate = false) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const values = validateForm();
      const checked = candidate || await checkCandidate();
      if (!checked) return;
      if (checked.classification === 'protected_requirement') throw new Error('This overlapping requirement is currently protected. Create a collaboration from Discovery instead of duplicating it.');
      if (checked.classification === 'update_own_requirement' && !forceSeparate) throw new Error('A similar requirement already exists. Use Update existing, or choose Add separate requirement.');
      const expires = new Date(Date.now() + 30 * 86400000).toISOString();
      const id = nextId('REQ');
      const { error: rpcError } = await supabase.rpc('genz_register_requirement_v2', {
        p_requirement_id: id,
        p_buyer_name: form.buyerName.trim(),
        p_phone: values.phone,
        p_city: form.city.trim(),
        p_property_type: form.type,
        p_min_budget: values.minBudget,
        p_max_budget: values.maxBudget,
        p_min_size: values.minSize,
        p_expires_at: expires,
        p_protection_expires_at: expires,
        p_force_separate: forceSeparate,
      });
      if (rpcError) throw rpcError;
      setMessage(`Requirement ${id} created under the buyer's single Master ID.`);
      setForm({ ...defaultForm, buyerName: '', phone: '' });
      setCandidate(null);
      await load();
    } catch (e) {
      const text = e instanceof Error ? e.message : 'Could not create requirement.';
      setError(text.includes('GENZ_REQUIREMENT_PROTECTED') ? 'A similar requirement is currently protected by another broker. Buyer/broker identity remains private.' : text);
    } finally {
      setBusy(false);
    }
  }

  async function updateRequirement(id: string, statusOverride?: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const values = validateForm();
      const row = requirements.find((item) => item.id === id);
      if (!row) throw new Error('Requirement not found.');
      const expires = new Date(Date.now() + 30 * 86400000).toISOString();
      const nextStatus = statusOverride || editingStatus || row.status;
      const { data, error: rpcError } = await supabase.rpc('genz_update_requirement_v2', {
        p_requirement_id: id,
        p_city: form.city.trim(),
        p_property_type: form.type,
        p_min_budget: values.minBudget,
        p_max_budget: values.maxBudget,
        p_min_size: values.minSize,
        p_status: nextStatus,
        p_expires_at: expires,
        p_protection_expires_at: expires,
        p_change_reason: 'Updated from Buyer Master workspace',
      });
      if (rpcError) throw rpcError;
      setMessage(`${id} updated to version ${data}.`);
      setEditingId(null);
      setCandidate(null);
      setForm({ ...defaultForm, buyerName: '', phone: '' });
      await load();
      if (openHistory[id]) await loadHistory(id, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update requirement.');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(row: RequirementRow) {
    const rel = relationByBuyer.get(row.buyer_id);
    setEditingId(row.id);
    setEditingStatus(row.status);
    setForm({
      buyerName: rel?.contact_name || row.buyer_label || '',
      phone: rel?.phone_e164 || row.buyer_phone_masked || '',
      city: row.city,
      type: row.property_type,
      minBudget: String(Number(row.min_budget || 0)),
      maxBudget: String(Number(row.max_budget || 0)),
      minSize: String(row.min_size || 0),
    });
    setCandidate(null);
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingStatus('active');
    setForm({ ...defaultForm, buyerName: '', phone: '' });
    setCandidate(null);
  }

  async function updateExistingCandidate() {
    if (!candidate?.own_requirement_id) return;
    setEditingStatus(requirements.find((x) => x.id === candidate.own_requirement_id)?.status || 'active');
    await updateRequirement(candidate.own_requirement_id);
  }

  async function loadHistory(id: string, force = false) {
    if (!force && expandedVersions[id]) {
      setOpenHistory((v) => ({ ...v, [id]: !v[id] }));
      return;
    }
    const { data, error: historyError } = await supabase
      .from('genz_requirement_versions')
      .select('id,requirement_id,version_no,city,property_type,min_budget,max_budget,min_size,status,protection_expires_at,expires_at,change_reason,created_at')
      .eq('requirement_id', id)
      .order('version_no', { ascending: false });
    if (historyError) {
      setError(historyError.message);
      return;
    }
    setExpandedVersions((v) => ({ ...v, [id]: (data || []) as VersionRow[] }));
    setOpenHistory((v) => ({ ...v, [id]: true }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (editingId) {
      await updateRequirement(editingId);
      return;
    }
    const checked = await checkCandidate();
    if (!checked) return;
    if (checked.classification === 'new_buyer' || checked.classification === 'new_requirement') await createRequirement(false);
  }

  if (gate === 'checking') return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Checking secure GENZ membership…</div>;
  if (gate === 'blocked') return <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><LockKeyhole className="size-7 text-blue-600"/><h1 className="mt-4 text-xl font-bold">Broker sign-in required</h1><p className="mt-2 text-sm text-slate-600">Buyer Master and requirement protection are available only to approved GENZ brokers.</p><Link href="/dashboard" className={`${primaryButton} mt-5`}>Go to secure sign in</Link></div>;

  return <div className="space-y-7">
    <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div><div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Buyer Master</div><h1 className="mt-1 text-3xl font-bold tracking-tight">Buyer Requirements</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">One buyer identity can have many independent requirements. Protection belongs to each requirement and its time window—not permanently to the person.</p></div>
      <button className={secondaryButton} onClick={() => void load()}><RefreshCw className="size-4"/>Refresh</button>
    </section>

    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900"><ShieldCheck className="mr-1 inline size-4"/><b>Dedupe rule:</b> same phone creates/reuses one Buyer Master. A different city/type/budget requirement can be separate; an overlapping protected requirement is blocked without revealing the other broker or buyer history.</div>
    {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div>}
    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

    <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <form onSubmit={(e) => void submit(e)} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">{editingId ? `Edit ${editingId}` : 'Add buyer requirement'}</h2><p className="mt-1 text-xs text-slate-500">Minimum and maximum budget are stored independently for every requirement.</p></div>{editingId && <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={cancelEdit}><X className="size-4"/></button>}</div>
        <div className="mt-4 grid gap-3">
          <div><label className="text-xs font-semibold text-slate-600">Buyer name</label><input className={`${inputClass} mt-1`} required value={form.buyerName} onChange={(e)=>{setForm({...form,buyerName:e.target.value});setCandidate(null);}} placeholder="Buyer name"/></div>
          <div><label className="text-xs font-semibold text-slate-600">Mobile number</label><input className={`${inputClass} mt-1`} required inputMode="numeric" value={form.phone} onChange={(e)=>{setForm({...form,phone:e.target.value});setCandidate(null);}} placeholder="10-digit mobile"/></div>
          <div><label className="text-xs font-semibold text-slate-600">City / locality</label><input className={`${inputClass} mt-1`} required value={form.city} onChange={(e)=>{setForm({...form,city:e.target.value});setCandidate(null);}}/></div>
          <div><label className="text-xs font-semibold text-slate-600">Property type</label><select className={`${inputClass} mt-1`} value={form.type} onChange={(e)=>{setForm({...form,type:e.target.value});setCandidate(null);}}>{PROPERTY_TYPES.map((x)=><option key={x}>{x}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-slate-600">Minimum budget (₹)</label><input className={`${inputClass} mt-1`} type="number" min="0" required value={form.minBudget} onChange={(e)=>{setForm({...form,minBudget:e.target.value});setCandidate(null);}}/></div><div><label className="text-xs font-semibold text-slate-600">Maximum budget (₹)</label><input className={`${inputClass} mt-1`} type="number" min="1" required value={form.maxBudget} onChange={(e)=>{setForm({...form,maxBudget:e.target.value});setCandidate(null);}}/></div></div>
          <div><label className="text-xs font-semibold text-slate-600">Minimum size (sqft)</label><input className={`${inputClass} mt-1`} type="number" min="0" value={form.minSize} onChange={(e)=>setForm({...form,minSize:e.target.value})}/></div>
          {editingId && <div><label className="text-xs font-semibold text-slate-600">Status</label><select className={`${inputClass} mt-1`} value={editingStatus} onChange={(e)=>setEditingStatus(e.target.value)}><option value="active">Active</option><option value="follow_up">Follow-up</option><option value="paused">Paused</option><option value="fulfilled">Fulfilled</option><option value="closed">Closed</option></select></div>}
        </div>

        {!editingId && candidate && <div className={`mt-4 rounded-xl border p-3 text-xs leading-5 ${candidate.classification==='protected_requirement'?'border-rose-200 bg-rose-50 text-rose-800':candidate.classification==='update_own_requirement'?'border-amber-200 bg-amber-50 text-amber-900':'border-emerald-200 bg-emerald-50 text-emerald-900'}`}><b>{candidate.classification.replaceAll('_',' ')}:</b> {candidateMessage(candidate)}</div>}

        <div className="mt-4 grid gap-2">
          {editingId ? <button className={primaryButton} disabled={busy}><Save className="size-4"/>{busy?'Saving…':'Save new version'}</button> : <button className={primaryButton} disabled={busy||checking}><Search className="size-4"/>{checking?'Checking…':'Check & add requirement'}</button>}
          {!editingId && candidate?.classification==='update_own_requirement' && <><button type="button" className={primaryButton} disabled={busy} onClick={()=>void updateExistingCandidate()}><Save className="size-4"/>Update existing {candidate.own_requirement_id}</button><button type="button" className={secondaryButton} disabled={busy} onClick={()=>void createRequirement(true)}>Add as separate requirement</button></>}
          {!editingId && candidate?.classification==='protected_requirement' && <Link href="/discover" className={secondaryButton}>Open Discovery & Matching</Link>}
        </div>
        <p className="mt-3 text-xs text-slate-500">Default requirement + protection window: 30 days. Updating creates a new immutable version snapshot.</p>
      </form>

      <div className="space-y-3">
        {requirements.map((row)=>{
          const rel=relationByBuyer.get(row.buyer_id);
          const history=expandedVersions[row.id]||[];
          const isOpen=Boolean(openHistory[row.id]);
          return <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{row.id}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusClass(row.status)}`}>{row.status.replaceAll('_',' ')}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">v{row.version_no}</span></div><h3 className="mt-3 text-lg font-bold">{row.property_type} · {row.city}</h3><p className="mt-1 text-sm text-slate-500"><UserRound className="mr-1 inline size-4"/>{rel?.contact_name||row.buyer_label} · {rel?.phone_e164||row.buyer_phone_masked}</p></div>
              <div className="sm:text-right"><div className="font-bold text-slate-950">{budgetRange(row)}</div><div className="mt-1 text-xs text-slate-500">{row.min_size}+ sqft</div></div>
            </div>
            <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500 sm:grid-cols-2"><div><Clock3 className="mr-1 inline size-4"/>Protected until {new Date(row.protection_expires_at).toLocaleDateString('en-IN')}</div><div>Requirement expires {new Date(row.expires_at).toLocaleDateString('en-IN')}</div></div>
            <div className="mt-4 flex flex-wrap gap-2"><button className={secondaryButton} onClick={()=>startEdit(row)}>Edit requirement</button><button className={secondaryButton} onClick={()=>void loadHistory(row.id)}><History className="size-4"/>Version history {isOpen?<ChevronUp className="size-4"/>:<ChevronDown className="size-4"/>}</button></div>
            {isOpen && <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">{history.map((version)=><div key={version.id} className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><div className="flex flex-wrap justify-between gap-2"><b>Version {version.version_no} · {version.property_type} · {version.city}</b><span>{new Date(version.created_at).toLocaleString('en-IN')}</span></div><div className="mt-1">Budget {Number(version.min_budget)>0?`${money(Number(version.min_budget))} – `:''}{money(Number(version.max_budget))} · {version.min_size}+ sqft · {version.status.replaceAll('_',' ')}</div><div className="mt-1 text-slate-500">{version.change_reason||'Updated'}</div></div>)}{history.length===0&&<div className="text-xs text-slate-500">No version history found.</div>}</div>}
          </article>;
        })}
        {requirements.length===0&&<div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No requirements yet. Add the buyer's first requirement from the form.</div>}
      </div>
    </section>
    <div className="text-[11px] text-slate-400">Secure member: {uid.slice(0,8)}… · buyer phone/contact rows are private to the broker relationship.</div>
  </div>;
}
