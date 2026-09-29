'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ShieldCheck } from 'lucide-react';
import { isValidBrokerCode, normalizeBrokerCode } from '@/lib/public-broker-verification';

export default function VerifyBrokerPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeBrokerCode(code);
    if (!isValidBrokerCode(normalized)) {
      setMessage('Enter a valid GENZ Broker ID, for example BR-1A2B3C4D.');
      return;
    }
    setMessage('');
    router.push(`/broker/${encodeURIComponent(normalized)}`);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-blue-600 font-black">G</div>
          <div>
            <div className="text-lg font-black">GENZ Network</div>
            <div className="text-sm text-slate-400">Public Broker Verification</div>
          </div>
        </div>

        <section className="mt-12 rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl sm:p-10">
          <div className="grid size-12 place-items-center rounded-2xl bg-blue-600/20 text-blue-300">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="mt-6 text-3xl font-black tracking-tight sm:text-4xl">Verify a GENZ broker</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Enter the exact Broker ID to view the broker&apos;s live GENZ membership status, photo, rating and verified activity. No login is required.
          </p>

          <form onSubmit={submit} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="BR-XXXXXXXX"
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3.5 font-mono text-base uppercase tracking-wider outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-black hover:bg-blue-500">
              <Search className="size-4" /> Verify broker
            </button>
          </form>
          {message && <p className="mt-3 text-sm font-semibold text-amber-300">{message}</p>}

          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/70 p-5 text-xs leading-5 text-slate-400">
            GENZ shows account status from its own network records. “Under review” means a matter is being reviewed and is not a finding of fraud or wrongdoing. Suspended or removed status is shown separately when GENZ has taken an account action.
          </div>
        </section>
      </div>
    </main>
  );
}
