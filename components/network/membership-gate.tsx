'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, Clipboard, KeyRound, Link2, LogOut, Mail, RefreshCw, ShieldCheck, UserPlus, XCircle } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import SharedNetwork from '@/components/network/shared-network';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';

type View = 'dashboard' | 'requirements' | 'properties' | 'brokers' | 'deals';

type MemberProfile = {
  id: string;
  broker_code: string;
  display_name: string;
  firm: string;
  is_admin: boolean;
};

type InviteRow = {
  id: string;
  email: string;
  invited_by_user_id: string;
  status: 'pending' | 'redeemed' | 'revoked';
  expires_at: string;
  redeemed_by_user_id: string | null;
  created_at: string;
  redeemed_at: string | null;
};

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

function getInviteToken() {
  if (typeof window === 'undefined') return '';
  const fromUrl = new URLSearchParams(window.location.search).get('invite') || '';
  if (fromUrl) {
    window.sessionStorage.setItem('genz_pending_invite', fromUrl);
    return fromUrl;
  }
  return window.sessionStorage.getItem('genz_pending_invite') || '';
}

function friendlyAuthError(message: string) {
  if (message.includes('Invalid login credentials')) return 'Email or password is incorrect.';
  if (message.includes('Email not confirmed')) return 'Confirm your email first, then sign in.';
  if (message.includes('INVITE_INVALID_OR_EXPIRED')) return 'This invite is invalid, expired, already used, or belongs to a different email.';
  if (message.includes('ALREADY_MEMBER')) return 'That email is already a GENZ Network member.';
  if (message.includes('INVITE_ALREADY_PENDING')) return 'A pending invite already exists for that email.';
  if (message.includes('INVITE_PENDING_LIMIT')) return 'You already have 10 active pending invites. Revoke or wait for some to be used.';
  if (message.includes('INVITE_MONTHLY_LIMIT')) return 'Broker invite limit reached for this 30-day period.';
  return message;
}

function SignInPanel({ onMembershipReady }: { onMembershipReady: () => Promise<void> }) {
  const supabase = useMemo(() => getSupabaseNetworkClient(), []);
  const [mode, setMode] = useState<'signin' | 'join' | 'forgot'>('signin');
  const [inviteToken, setInviteToken] = useState('');
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  const [inviterName, setInviterName] = useState('');
  const [inviteExpiry, setInviteExpiry] = useState('');
  const [form, setForm] = useState({ email: '', password: '', name: '', firm: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = getInviteToken();
    setInviteToken(token);
    if (!token) {
      setInviteValid(false);
      return;
    }
    void (async () => {
      const { data, error } = await supabase.rpc('genz_validate_invite', { p_token: token });
      if (error) {
        setInviteValid(false);
        setMessage(friendlyAuthError(error.message));
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      const valid = Boolean(row?.valid);
      setInviteValid(valid);
      setInviterName(row?.inviter_name || 'GENZ broker');
      setInviteExpiry(row?.invite_expires_at || '');
      if (valid) setMode('join');
    })();
  }, [supabase]);

  const redeemInvite = useCallback(async (user: User, token: string, name?: string, firm?: string) => {
    const meta = user.user_metadata || {};
    const displayName = (name || String(meta.name || '') || user.email?.split('@')[0] || 'Broker').trim();
    const brokerage = (firm || String(meta.firm || '') || 'Independent').trim();
    const { error } = await supabase.rpc('genz_redeem_invite', {
      p_token: token,
      p_display_name: displayName,
      p_firm: brokerage,
    });
    if (error) throw error;
    window.sessionStorage.removeItem('genz_pending_invite');
    if (window.location.search.includes('invite=')) window.history.replaceState({}, '', window.location.pathname);
  }, [supabase]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'forgot') {
        const email = form.email.trim();
        if (!email) throw new Error('Enter your registered email.');
        const redirectTo = `${window.location.origin}/reset-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        setMessage('Password reset link sent. Check your email and open the link on this device.');
        return;
      }

      if (mode === 'join') {
        if (!inviteToken || !inviteValid) throw new Error('A valid broker invite link is required to join GENZ Network.');
        if (!form.name.trim() || !form.firm.trim()) throw new Error('Name and firm are required.');
        const { data, error } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard?invite=${encodeURIComponent(inviteToken)}`,
            data: { name: form.name.trim(), firm: form.firm.trim(), genz_invite_token: inviteToken },
          },
        });
        if (error) throw error;
        if (data.session && data.user) {
          await redeemInvite(data.user, inviteToken, form.name, form.firm);
          await onMembershipReady();
        } else {
          setMessage('Account created. Confirm your email from the verification message; the invite will be redeemed after you return.');
        }
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
      if (error) throw error;
      if (!data.user) throw new Error('Could not load signed-in account.');
      const token = inviteToken || String(data.user.user_metadata?.genz_invite_token || '') || getInviteToken();
      if (token) {
        const { data: profile } = await supabase.from('genz_profiles').select('id').eq('id', data.user.id).maybeSingle();
        if (!profile) await redeemInvite(data.user, token);
      }
      await onMembershipReady();
    } catch (error) {
      setMessage(friendlyAuthError(error instanceof Error ? error.message : 'Authentication failed.'));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'join' ? 'Accept broker invite' : mode === 'forgot' ? 'Reset your password' : 'Sign in to GENZ Network';
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid size-12 place-items-center rounded-2xl bg-blue-600 font-black text-white">G</div>
      <h1 className="mt-5 text-2xl font-bold">{title}</h1>
      {mode === 'join' && inviteValid && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
          <b>Invite verified.</b> Invited by {inviterName}{inviteExpiry ? ` · valid until ${new Date(inviteExpiry).toLocaleString('en-IN')}` : ''}.
        </div>
      )}
      {mode === 'signin' && (
        <p className="mt-2 text-sm leading-6 text-slate-500">GENZ is invite-only. Existing members can sign in; new brokers must open an invite link sent by a GENZ broker or admin.</p>
      )}
      {mode === 'forgot' && <p className="mt-2 text-sm leading-6 text-slate-500">Enter your registered email. We will send a secure password-reset link.</p>}

      <form className="mt-5 space-y-3" onSubmit={submit}>
        {mode === 'join' && (
          <>
            <input className={inputClass} required placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={inputClass} required placeholder="Firm / brokerage" value={form.firm} onChange={(e) => setForm({ ...form, firm: e.target.value })} />
          </>
        )}
        <input className={inputClass} type="email" required placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        {mode !== 'forgot' && <input className={inputClass} type="password" required minLength={8} placeholder="Password (8+ characters)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        {message && <div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">{message}</div>}
        <button disabled={busy || (mode === 'join' && inviteValid !== true)} className={`${primaryButton} w-full`} type="submit">
          {busy ? 'Please wait…' : mode === 'join' ? 'Accept invite & create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
        </button>
      </form>

      <div className="mt-4 grid gap-2 text-center text-sm">
        {mode === 'signin' && <button className="font-semibold text-blue-600" onClick={() => { setMode('forgot'); setMessage(''); }}>Forgot password?</button>}
        {mode === 'forgot' && <button className="font-semibold text-blue-600" onClick={() => { setMode('signin'); setMessage(''); }}>Back to sign in</button>}
        {inviteValid && mode !== 'join' && <button className="font-semibold text-blue-600" onClick={() => { setMode('join'); setMessage(''); }}>Use broker invite</button>}
        {mode === 'join' && <button className="font-semibold text-blue-600" onClick={() => { setMode('signin'); setMessage(''); }}>Already have an account? Sign in</button>}
      </div>
      {!inviteToken && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><b>No public signup.</b> Ask a GENZ member to invite your email.</div>}
      {inviteToken && inviteValid === false && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">This invite is not active. Ask the inviter to issue a fresh link.</div>}
    </div>
  );
}

function MembershipBlocked({ user, onSignOut }: { user: User; onSignOut: () => Promise<void> }) {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
      <ShieldCheck className="size-8 text-amber-600" />
      <h1 className="mt-4 text-2xl font-bold">Invite required</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{user.email} is authenticated, but it is not an approved GENZ broker membership. Open the broker invite link sent to this email. Uninvited Supabase accounts cannot read GENZ network data.</p>
      <button className={`${secondaryButton} mt-5`} onClick={() => void onSignOut()}><LogOut className="size-4" /> Sign out</button>
    </div>
  );
}

function InviteConsole({ currentProfile }: { currentProfile: MemberProfile }) {
  const supabase = useMemo(() => getSupabaseNetworkClient(), []);
  const [email, setEmail] = useState('');
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [profiles, setProfiles] = useState<MemberProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [newLink, setNewLink] = useState('');

  const load = useCallback(async () => {
    const [inviteRes, profileRes] = await Promise.all([
      supabase.from('genz_invites').select('id,email,invited_by_user_id,status,expires_at,redeemed_by_user_id,created_at,redeemed_at').order('created_at', { ascending: false }),
      supabase.from('genz_profiles').select('id,broker_code,display_name,firm,is_admin').order('created_at', { ascending: true }),
    ]);
    if (inviteRes.error) throw inviteRes.error;
    if (profileRes.error) throw profileRes.error;
    setInvites((inviteRes.data || []) as InviteRow[]);
    setProfiles((profileRes.data || []) as MemberProfile[]);
  }, [supabase]);

  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [load]);

  const brokerLabel = (id: string | null) => {
    if (!id) return 'Not joined';
    const profile = profiles.find((item) => item.id === id);
    return profile ? `${profile.display_name} · ${profile.broker_code}` : 'Broker';
  };

  const createInvite = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setMessage(''); setNewLink('');
    try {
      const { data, error } = await supabase.rpc('genz_create_invite', { p_email: email.trim(), p_expires_hours: 168 });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.invite_token) throw new Error('Invite token was not returned.');
      const url = `${window.location.origin}/dashboard?invite=${encodeURIComponent(row.invite_token)}`;
      setNewLink(url);
      setEmail('');
      setMessage('Invite created. Copy this link now; for security, the raw token is not stored for later display.');
      await load();
    } catch (error) {
      setMessage(friendlyAuthError(error instanceof Error ? error.message : 'Could not create invite.'));
    } finally { setBusy(false); }
  };

  const copyLink = async () => {
    if (!newLink) return;
    await navigator.clipboard.writeText(newLink);
    setMessage('Invite link copied. Share it only with the invited broker.');
  };

  const revoke = async (id: string) => {
    setMessage('');
    const { error } = await supabase.rpc('genz_revoke_invite', { p_invite_id: id });
    if (error) { setMessage(friendlyAuthError(error.message)); return; }
    await load();
  };

  return (
    <section className="mb-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><UserPlus className="size-5 text-blue-600" /><h2 className="font-bold">Broker invites & join audit</h2></div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Every broker joins through an accountable inviter. {currentProfile.is_admin ? 'Admin view shows the full invite ledger.' : 'You can see invites you sent and the broker who invited you.'}</p>
        </div>
        <div className={`rounded-full px-3 py-1.5 text-xs font-bold ${currentProfile.is_admin ? 'bg-violet-100 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>{currentProfile.is_admin ? 'Admin audit' : currentProfile.broker_code}</div>
      </div>

      <form onSubmit={createInvite} className="mt-5 flex flex-col gap-2 sm:flex-row">
        <input className={inputClass} type="email" required placeholder="Broker email to invite" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button disabled={busy} className={primaryButton} type="submit"><Mail className="size-4" /> {busy ? 'Creating…' : 'Create 7-day invite'}</button>
        <button className={secondaryButton} type="button" onClick={() => void load()}><RefreshCw className="size-4" /> Refresh</button>
      </form>

      {newLink && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-blue-700">Private invite link</div>
          <div className="mt-2 break-all rounded-lg bg-white p-3 text-xs text-slate-700">{newLink}</div>
          <button className={`${secondaryButton} mt-3`} type="button" onClick={() => void copyLink()}><Clipboard className="size-4" /> Copy invite link</button>
        </div>
      )}
      {message && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">{message}</div>}

      <div className="mt-5 space-y-3">
        {invites.map((invite) => {
          const inviter = brokerLabel(invite.invited_by_user_id);
          const joined = brokerLabel(invite.redeemed_by_user_id);
          const expired = invite.status === 'pending' && new Date(invite.expires_at).getTime() <= Date.now();
          const effective = expired ? 'expired' : invite.status;
          const canRevoke = effective === 'pending' && (currentProfile.is_admin || invite.invited_by_user_id === currentProfile.id);
          return (
            <article key={invite.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm">{invite.email}</b>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${effective === 'redeemed' ? 'bg-emerald-50 text-emerald-700' : effective === 'pending' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{effective}</span>
                  </div>
                  <div className="mt-2 text-xs leading-5 text-slate-500">Invited by <b className="text-slate-700">{inviter}</b> · Joined broker <b className="text-slate-700">{joined}</b></div>
                  <div className="text-xs text-slate-400">Created {new Date(invite.created_at).toLocaleString('en-IN')} · expires {new Date(invite.expires_at).toLocaleString('en-IN')}</div>
                </div>
                {canRevoke && <button className={secondaryButton} type="button" onClick={() => void revoke(invite.id)}><XCircle className="size-4" /> Revoke</button>}
              </div>
            </article>
          );
        })}
        {!invites.length && <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No visible invite history yet.</div>}
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600"><Link2 className="mt-0.5 size-4 shrink-0 text-slate-500" /> Non-admin brokers can keep at most 10 active pending invites and 30 invites per 30 days. Each invite is email-bound, expires, and can be redeemed once.</div>
    </section>
  );
}

export default function MembershipGate({ view }: { view: View }) {
  const supabase = useMemo(() => getSupabaseNetworkClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setMessage(''); setBlocked(false);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const activeUser = authData.user;
      setUser(activeUser);
      if (!activeUser) { setProfile(null); return; }

      let { data: member } = await supabase.from('genz_profiles').select('id,broker_code,display_name,firm,is_admin').eq('id', activeUser.id).maybeSingle();
      if (!member) {
        const token = getInviteToken() || String(activeUser.user_metadata?.genz_invite_token || '');
        if (token) {
          const { error: redeemError } = await supabase.rpc('genz_redeem_invite', {
            p_token: token,
            p_display_name: String(activeUser.user_metadata?.name || activeUser.email?.split('@')[0] || 'Broker'),
            p_firm: String(activeUser.user_metadata?.firm || 'Independent'),
          });
          if (!redeemError) {
            window.sessionStorage.removeItem('genz_pending_invite');
            if (window.location.search.includes('invite=')) window.history.replaceState({}, '', window.location.pathname);
            const profileRes = await supabase.from('genz_profiles').select('id,broker_code,display_name,firm,is_admin').eq('id', activeUser.id).maybeSingle();
            member = profileRes.data;
          } else if (!redeemError.message.includes('INVITE_INVALID_OR_EXPIRED')) {
            throw redeemError;
          }
        }
      }
      if (!member) { setProfile(null); setBlocked(true); return; }
      setProfile(member as MemberProfile);
    } catch (error) {
      setMessage(friendlyAuthError(error instanceof Error ? error.message : 'Could not verify membership.'));
    } finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => {
    void refresh();
    const { data } = supabase.auth.onAuthStateChange(() => { void refresh(); });
    return () => data.subscription.unsubscribe();
  }, [refresh, supabase]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.sessionStorage.removeItem('genz_pending_invite');
    setUser(null); setProfile(null); setBlocked(false);
  };

  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Checking secure GENZ membership…</div>;
  if (message) return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><b>Membership check failed:</b> {message}<button className={`${secondaryButton} ml-3`} onClick={() => void refresh()}>Retry</button></div>;
  if (!user) return <SignInPanel onMembershipReady={refresh} />;
  if (blocked || !profile) return <MembershipBlocked user={user} onSignOut={signOut} />;

  return (
    <>
      {view === 'dashboard' && <InviteConsole currentProfile={profile} />}
      <SharedNetwork view={view} />
    </>
  );
}
