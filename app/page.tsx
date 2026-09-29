import Link from 'next/link';
import { Search, ShieldCheck, UsersRound } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-blue-600 text-lg font-black">G</div>
          <div><div className="text-xl font-black">GENZ Network</div><div className="text-sm text-slate-400">Broker Collaboration OS</div></div>
        </div>

        <section className="mt-16 grid gap-8 lg:grid-cols-[1.2fr_.8fr] lg:items-center">
          <div>
            <div className="text-xs font-bold uppercase tracking-[.2em] text-blue-400">Public verification + private collaboration</div>
            <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">Verify a broker before you deal.</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">Anyone can check a GENZ Broker ID without signing in. Approved brokers can then enter the private collaboration network for requirements, properties, deals and protected sharing.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/verify" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-black hover:bg-blue-500"><Search className="size-4"/>Verify Broker by ID</Link>
              <Link href="/login" className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3.5 text-sm font-black hover:bg-slate-800"><UsersRound className="size-4"/>Broker Sign In</Link>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
            <div className="grid size-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-300"><ShieldCheck className="size-6"/></div>
            <h2 className="mt-5 text-xl font-black">No login needed for verification</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Use the public lookup to check broker photo, name, firm, Broker ID, rating, Trust Score and current GENZ account status.</p>
            <Link href="/verify" className="mt-6 inline-flex text-sm font-black text-blue-400 hover:text-blue-300">Open public broker lookup →</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
