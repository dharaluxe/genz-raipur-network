import AppShell from '@/components/network/app-shell';
import RecoveryRedirect from '@/components/network/recovery-redirect';

export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RecoveryRedirect />
      <AppShell>{children}</AppShell>
    </>
  );
}
