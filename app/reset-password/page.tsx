'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const buttonClass = 'inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';

export default function ResetPasswordPage() {
  const supabase = useMemo(() => getSupabaseNetworkClient(), []);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Opening secure reset session…');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) {
        setReady(true);
        setMessage('');
      } else {
        setMessage('Open this page from the password-reset link sent to your email.');
      }
    })();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setReady(true);
        setMessage('');
      }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [supabase]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    if (password.length < 8) { setMessage('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setMessage('Passwords do not match.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setSuccess(true);
    setMessage('Password updated successfully.');
  };

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-950">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid size-12 place-items-center rounded-2xl bg-blue-600 text-white"><KeyRound className="size-5" /></div>
        <h1 className="mt-5 text-2xl font-bold">Set a new password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">This reset changes only your GENZ/Supabase login password. Your broker membership and invite history remain unchanged.</p>

        {success ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="flex items-center gap-2 font-bold"><CheckCircle2 className="size-4" /> Password changed</div>
            <p className="mt-2 text-xs leading-5">You can now return to GENZ Network and continue with the new password.</p>
            <a className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white" href="/dashboard">Go to GENZ Network</a>
          </div>
        ) : (
          <form className="mt-5 space-y-3" onSubmit={submit}>
            <input className={inputClass} type="password" required minLength={8} placeholder="New password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} disabled={!ready || busy} />
            <input className={inputClass} type="password" required minLength={8} placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={!ready || busy} />
            {message && <div className={`rounded-lg p-3 text-xs leading-5 ${ready ? 'bg-slate-50 text-slate-700' : 'bg-amber-50 text-amber-900'}`}>{message}</div>}
            <button className={buttonClass} type="submit" disabled={!ready || busy}>{busy ? 'Updating…' : 'Update password'}</button>
          </form>
        )}
      </div>
    </main>
  );
}
