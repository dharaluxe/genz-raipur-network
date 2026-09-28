'use client';

import { useEffect, useMemo } from 'react';
import { getSupabaseNetworkClient } from '@/lib/supabase-network-client';

export default function RecoveryRedirect() {
  const supabase = useMemo(() => getSupabaseNetworkClient(), []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/reset-password') {
        window.location.replace('/reset-password');
      }
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  return null;
}
