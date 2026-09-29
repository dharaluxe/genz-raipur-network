'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { BadgeCheck, CalendarDays, Download, RefreshCw, Share2, ShieldCheck, Star } from 'lucide-react';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';
import { brokerInitials, isValidBrokerCode, normalizeBrokerCode, publicLookupErrorMessage, publicStatusPresentation, type PublicBrokerStatus } from '@/lib/public-broker-verification';

type PublicBroker = {
  broker_code: string;
  display_name: string;
  firm: string;
  cities: string[] | null;
  specialties: string[] | null;
  verified: boolean;
  rating: number | string;
  review_count: number;
  completed_deals: number;
  successful_collaborations: number;
  verified_visits: number;
  owner_confirmed_listings: number;
  member_since: string;
  avatar_url: string | null;
  account_status: PublicBrokerStatus;
  public_status_note: string | null;
  status_effective_at: string;
  trust_score: number;
  trust_confidence: string;
};

const toneClass = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  rose: 'border-rose-200 bg-rose-50 text-rose-900',
};

export default function PublicBrokerProfilePage() {
  const params = useParams<{ brokerCode: string }>();
  const supabase = useMemo(() => getSupabaseNetworkClient(), []);
  const brokerCode = normalizeBrokerCode(decodeURIComponent(params?.brokerCode || ''));
  const [broker, setBroker] = useState<PublicBroker | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      if (!isValidBrokerCode(brokerCode)) throw new Error('This is not a valid GENZ Broker ID.');
      const { data, error } = await supabase.rpc('genz_public_broker_lookup', { p_broker_code: brokerCode });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as PublicBroker | undefined;
      if (!row) throw new Error('No GENZ broker was found with this Broker ID.');
      setBroker(row);
      setCheckedAt(new Date());
    } catch (error) {
      setBroker(null);
      setMessage(publicLookupErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [brokerCode, supabase]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <main className="min-h-screen bg-slate-50 px-5 py-12"><div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Checking live GENZ broker status…</div></main>;

  if (!broker) return <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-950"><div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm"><div className="grid size-12 place-items-center rounded-2xl bg-slate-950 text-white"><ShieldCheck className="size-6" /></div><h1 className="mt-5 text-2xl font-black">Broker not verified</h1><p className="mt-2 text-sm leading-6 text-slate-600">{message}</p><Link href="/verify" className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white">Try another Broker ID</Link></div></main>;

  const status = publicStatusPresentation(broker.account_status);
  const rating = Number(broker.rating || 0);
  const qrPath = `/api/public-broker-qr?code=${encodeURIComponent(broker.broker_code)}`;
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `GENZ Broker ${broker.broker_code}`, text: `Verify ${broker.display_name} on GENZ`, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      // The browser may report AbortError when the user closes the share sheet.
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/verify" className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-blue-600 font-black text-white">G</div>
            <div><div className="font-black">GENZ Network</div><div className="text-xs text-slate-500">Public Broker Verification</div></div>
          </Link>
          <div className="flex flex-wrap gap-2"><button onClick={() => void share()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><Share2 className="size-4" /> Share</button><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><RefreshCw className="size-4" /> Refresh live status</button></div>
        </div>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex gap-4">
                {broker.avatar_url ? <img src={broker.avatar_url} alt={`${broker.display_name} broker profile`} className="size-20 rounded-2xl border border-slate-200 object-cover" /> : <div className="grid size-20 place-items-center rounded-2xl bg-blue-50 text-2xl font-black text-blue-700">{brokerInitials(broker.display_name)}</div>}
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black">{broker.display_name}</h1>{broker.verified && <BadgeCheck className="size-5 text-blue-600" />}</div>
                  <p className="mt-1 text-sm text-slate-600">{broker.firm || 'Independent broker'}</p>
                  <div className="mt-2 inline-flex rounded-lg bg-slate-950 px-3 py-1.5 font-mono text-sm font-bold tracking-wide text-white">{broker.broker_code}</div>
                </div>
              </div>
              <div className="rounded-2xl bg-slate-950 px-5 py-4 text-center text-white">
                <div className="text-3xl font-black">{broker.trust_score}</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Trust · {broker.trust_confidence}</div>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <div className={`rounded-2xl border p-5 ${toneClass[status.tone]}`}>
              <div className="flex items-center gap-2 text-lg font-black"><ShieldCheck className="size-5" />{status.label}</div>
              <p className="mt-2 text-sm leading-6">{status.explanation}</p>
              {broker.public_status_note && <p className="mt-3 rounded-xl bg-white/70 p-3 text-sm"><b>GENZ public note:</b> {broker.public_status_note}</p>}
              {broker.account_status !== 'active' && <p className="mt-3 text-xs opacity-80">Status effective: {new Date(broker.status_effective_at).toLocaleString('en-IN')}</p>}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-1 text-sm font-black"><Star className="size-4 text-amber-500" />{rating.toFixed(1)} / 5</div><div className="mt-1 text-xs text-slate-500">{broker.review_count} verified review(s)</div></div>
              <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xl font-black">{broker.completed_deals}</div><div className="text-xs text-slate-500">Completed deals</div></div>
              <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xl font-black">{broker.verified_visits}</div><div className="text-xs text-slate-500">Verified visits</div></div>
              <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xl font-black">{broker.owner_confirmed_listings}</div><div className="text-xs text-slate-500">Owner confirmations</div></div>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-5"><h2 className="font-black">Operating areas</h2><div className="mt-3 flex flex-wrap gap-2">{(broker.cities || []).length ? (broker.cities || []).map((city) => <span key={city} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{city}</span>) : <span className="text-sm text-slate-500">Not specified</span>}</div></div>
              <div className="rounded-2xl border border-slate-200 p-5"><h2 className="font-black">Specialties</h2><div className="mt-3 flex flex-wrap gap-2">{(broker.specialties || []).length ? (broker.specialties || []).map((item) => <span key={item} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{item}</span>) : <span className="text-sm text-slate-500">Not specified</span>}</div></div>
            </div>

            <div className="mt-6 grid gap-5 rounded-2xl border border-slate-200 p-5 sm:grid-cols-[1fr_150px] sm:items-center"><div><h2 className="font-black">Scan to verify this Broker ID</h2><p className="mt-2 text-sm leading-6 text-slate-600">The QR opens this live GENZ verification page. It contains only the public verification URL.</p><a href={qrPath} download={`${broker.broker_code}-verification-qr.png`} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-blue-700 hover:bg-slate-50"><Download className="size-4"/>Download QR</a></div><img src={qrPath} alt={`QR to verify ${broker.broker_code}`} className="mx-auto aspect-square w-full max-w-36 rounded-xl border border-slate-100"/></div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-950 p-4 text-xs text-slate-300">
              <span className="flex items-center gap-2"><CalendarDays className="size-4" />GENZ member since {new Date(broker.member_since).toLocaleDateString('en-IN')}</span>
              <span>{checkedAt ? `Live lookup checked ${checkedAt.toLocaleString('en-IN')}` : 'Live lookup'}</span>
            </div>

            <p className="mt-5 text-xs leading-5 text-slate-500">A GENZ rating or Trust Score summarizes activity recorded on the GENZ platform and is not a legal, financial or title guarantee. Current account status should be considered separately from historical activity metrics.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
