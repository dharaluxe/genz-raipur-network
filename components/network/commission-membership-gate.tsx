'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LockKeyhole, LogIn, ShieldCheck } from 'lucide-react';
import CommissionNetwork from '@/components/network/commission-network';
import CommissionOperations from '@/components/network/commission-operations';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';

type GateState = 'checking' | 'signed_out' | 'not_member' | 'member' | 'error';

export default function CommissionMembershipGate() {
  const supabase = useMemo(() => getSupabaseNetworkClient(), []);
  const [state, setState] = useState<GateState>('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          const normalSignedOut = /auth session missing|session.*missing/i.test(error.message || '');
          if (active) setState(normalSignedOut ? 'signed_out' : 'error');
          if (!normalSignedOut && active) setMessage(error.message);
          return;
        }
        const userId = data.user?.id;
        if (!userId) {
          if (active) setState('signed_out');
          return;
        }
        const { data: profile, error: profileError } = await supabase
          .from('genz_profiles')
          .select('id')
          .eq('id', userId)
          .maybeSingle();
        if (profileError) throw profileError;
        if (active) setState(profile ? 'member' : 'not_member');
      } catch (error) {
        if (!active) return;
        setState('error');
        setMessage(error instanceof Error ? error.message : 'Could not verify GENZ membership.');
      }
    })();
    return () => { active = false; };
  }, [supabase]);

  if (state === 'member') return <><CommissionNetwork /><CommissionOperations /></>;

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-700">
        {state === 'checking' ? <ShieldCheck className="size-5" /> : <LockKeyhole className="size-5" />}
      </div>
      <h1 className="mt-4 text-xl font-bold text-slate-950">
        {state === 'checking' ? 'Checking GENZ membership…' : state === 'signed_out' ? 'Broker sign-in required' : state === 'not_member' ? 'Invite-only broker access' : 'Membership check failed'}
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {state === 'checking'
          ? 'Commission and referral records are restricted to approved GENZ members.'
          : state === 'signed_out'
            ? 'Sign in through the GENZ dashboard to access commission agreements, referral protection and disputes.'
            : state === 'not_member'
              ? 'This signed-in account is not an approved GENZ broker. A valid broker invite must be redeemed before commission data can be accessed.'
              : message || 'The secure membership check could not be completed.'}
      </p>
      {state !== 'checking' && (
        <Link href="/dashboard" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          <LogIn className="size-4" /> Go to secure sign in
        </Link>
      )}
    </div>
  );
}
