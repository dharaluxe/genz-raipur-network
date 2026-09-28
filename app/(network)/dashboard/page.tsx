import Link from 'next/link';
import { ArrowRight, Building2, Handshake, Search, ShieldCheck, UsersRound } from 'lucide-react';

const metrics = [
  { label: 'Active requirements', value: '—', hint: 'Buyer needs across all cities' },
  { label: 'Verified properties', value: '—', hint: 'Deduped mandate-backed inventory' },
  { label: 'Broker connections', value: '—', hint: 'Invite-only verified network' },
  { label: 'Protected deals', value: '—', hint: 'Introductions with evidence trail' },
];

const flows = [
  { href: '/requirements', title: 'Post buyer requirement', body: 'Register the buyer once, protect source ownership and match across the whole network.', icon: Search },
  { href: '/properties', title: 'Add / verify property', body: 'Create a master property, attach mandate evidence and avoid duplicate listings.', icon: Building2 },
  { href: '/brokers', title: 'Find a broker', body: 'Discover brokers by market, inventory, response history and evidence-based trust.', icon: UsersRound },
  { href: '/deals', title: 'Open deal room', body: 'Freeze parties, commission terms, visits, offers, proofs and settlement history.', icon: Handshake },
];

export default function DashboardPage() {
  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-sm font-semibold text-blue-600">Network command center</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">One broker network. No city lock.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            A requirement can originate in Raipur and close through a broker in Bhopal, Indore, Pune or any other market. Protection belongs to the verified source and deal trail, not to a city boundary.
          </p>
        </div>
        <Link href="/requirements" className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          Add requirement <ArrowRight className="size-4" />
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">{item.label}</div>
            <div className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{item.value}</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">{item.hint}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Core workflows</h2>
              <p className="mt-1 text-sm text-slate-500">V2 is rebuilt around network actions instead of one oversized workspace screen.</p>
            </div>
            <ShieldCheck className="size-6 text-blue-600" />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {flows.map(({ href, title, body, icon: Icon }) => (
              <Link key={href} href={href} className="group rounded-xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50/40">
                <div className="flex items-center gap-3">
                  <div className="grid size-9 place-items-center rounded-lg bg-blue-50 text-blue-600"><Icon className="size-4" /></div>
                  <h3 className="font-semibold text-slate-900">{title}</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-500">{body}</p>
                <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-blue-600">Open <ArrowRight className="size-3" /></div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-400">Network rules</div>
          <h2 className="mt-2 text-xl font-bold">Trust must be provable.</h2>
          <div className="mt-5 space-y-4 text-sm leading-6 text-slate-300">
            <p><b className="text-white">Buyer source:</b> protected by hashed identity + claim timeline, not a public phone-number dump.</p>
            <p><b className="text-white">Property:</b> one master identity with multiple authorized brokers instead of duplicate cards.</p>
            <p><b className="text-white">Broker score:</b> based on verification, successful collaborations, response behavior and disputes.</p>
            <p><b className="text-white">Deal:</b> accepted terms and evidence are append-only; edits create revisions.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
