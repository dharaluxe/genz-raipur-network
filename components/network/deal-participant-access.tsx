'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ShieldCheck, UserPlus, UserX } from 'lucide-react';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';

type DealRow = { deal_id: string; property_title: string; status: string };
type Participant = { deal_id: string; user_id: string; role: string; status: string; can_offer: boolean; can_message: boolean; can_add_evidence: boolean; can_manage_visit: boolean; can_close: boolean; can_view_financials: boolean; can_manage_participants: boolean };
type Profile = { id: string; broker_code: string; display_name: string; firm: string };

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50';

function pretty(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (x) => x.toUpperCase()); }

export default function DealParticipantAccess() {
  const supabase = useMemo(() => getSupabaseNetworkClient(), []);
  const [userId, setUserId] = useState('');
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [dealId, setDealId] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ brokerCode: '', role: 'observer', offer: false, message: true, evidence: false, visit: false, financials: false });

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const ownParticipant = participants.find((p) => p.user_id === userId && p.status === 'active');
  const canManage = Boolean(ownParticipant?.can_manage_participants);

  const loadDeals = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    setUserId(auth.user.id);
    const { data, error } = await supabase.rpc('genz_deal_room_snapshot');
    if (error) throw error;
    const rows = (data || []) as DealRow[];
    setDeals(rows);
    setDealId((current) => current && rows.some((d) => d.deal_id === current) ? current : rows[0]?.deal_id || '');
  }, [supabase]);

  const loadParticipants = useCallback(async (selectedDeal: string) => {
    if (!selectedDeal) return;
    const [participantResult, profileResult] = await Promise.all([
      supabase.from('genz_deal_participants').select('*').eq('deal_id', selectedDeal).order('created_at', { ascending: true }),
      supabase.from('genz_profiles').select('id,broker_code,display_name,firm'),
    ]);
    if (participantResult.error) throw participantResult.error;
    if (profileResult.error) throw profileResult.error;
    setParticipants((participantResult.data || []) as Participant[]);
    setProfiles((profileResult.data || []) as Profile[]);
  }, [supabase]);

  useEffect(() => { void loadDeals().catch((error) => setNotice(error.message)); }, [loadDeals]);
  useEffect(() => { if (dealId) void loadParticipants(dealId).catch((error) => setNotice(error.message)); }, [dealId, loadParticipants]);

  const saveParticipant = async (event: FormEvent) => {
    event.preventDefault();
    if (!dealId || !form.brokerCode.trim()) return;
    setBusy(true); setNotice('');
    try {
      const { error } = await supabase.rpc('genz_upsert_deal_participant', {
        p_deal_id: dealId,
        p_broker_code: form.brokerCode.trim(),
        p_role: form.role,
        p_can_offer: form.offer,
        p_can_message: form.message,
        p_can_add_evidence: form.evidence,
        p_can_manage_visit: form.visit,
        p_can_view_financials: form.financials,
      });
      if (error) throw error;
      setNotice('Participant permissions updated.');
      setForm({ brokerCode: '', role: 'observer', offer: false, message: true, evidence: false, visit: false, financials: false });
      await loadParticipants(dealId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update participant.');
    } finally { setBusy(false); }
  };

  const removeParticipant = async (participant: Participant) => {
    setBusy(true); setNotice('');
    try {
      const { error } = await supabase.rpc('genz_remove_deal_participant', { p_deal_id: dealId, p_user_id: participant.user_id });
      if (error) throw error;
      setNotice('Participant removed from this Deal Room.');
      await loadParticipants(dealId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not remove participant.');
    } finally { setBusy(false); }
  };

  if (!deals.length) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-blue-600" /><h2 className="font-bold">Deal participant access</h2></div>
      <p className="mt-1 text-xs leading-5 text-slate-500">Core buyer/listing brokers cannot be removed. Referral brokers and observers receive only the permissions explicitly selected here; they never receive close or participant-management permission.</p>
      <select className={`${inputClass} mt-4 max-w-xl`} value={dealId} onChange={(e) => setDealId(e.target.value)}>{deals.map((deal) => <option key={deal.deal_id} value={deal.deal_id}>{deal.deal_id} · {deal.property_title} · {pretty(deal.status)}</option>)}</select>

      {notice && <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{notice}</div>}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {participants.filter((p) => p.status === 'active').map((participant) => {
          const profile = profileMap.get(participant.user_id);
          const removable = canManage && ['observer', 'referral_broker'].includes(participant.role);
          return <div key={participant.user_id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><b className="text-sm">{profile?.display_name || 'Broker'}</b><div className="mt-0.5 text-[11px] text-slate-500">{profile?.broker_code || participant.user_id} · {pretty(participant.role)}</div></div>{removable && <button disabled={busy} onClick={() => void removeParticipant(participant)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700"><UserX className="size-3.5" /> Remove</button>}</div><div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">{[['Offer',participant.can_offer],['Message',participant.can_message],['Evidence',participant.can_add_evidence],['Visit',participant.can_manage_visit],['Financials',participant.can_view_financials],['Close',participant.can_close]].filter(([,allowed])=>allowed).map(([label])=><span key={String(label)} className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">{label}</span>)}</div></div>;
        })}
      </div>

      {canManage ? <form onSubmit={saveParticipant} className="mt-5 rounded-xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-sm font-bold"><UserPlus className="size-4" /> Add / update referral access</div><div className="mt-3 grid gap-3 md:grid-cols-2"><input className={inputClass} placeholder="Broker Code e.g. BR-XXXX" value={form.brokerCode} onChange={(e) => setForm({ ...form, brokerCode: e.target.value })} /><select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="observer">Observer</option><option value="referral_broker">Referral broker</option></select></div><div className="mt-3 flex flex-wrap gap-4 text-xs">{([['Offer','offer'],['Message','message'],['Evidence','evidence'],['Visit','visit'],['Financials','financials']] as const).map(([label,key]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} /> {label}</label>)}</div><button className={`${buttonClass} mt-4`} disabled={busy}><UserPlus className="size-4" /> Save access</button></form> : <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">Your participant role can view this room but cannot manage participant access.</div>}
    </section>
  );
}
