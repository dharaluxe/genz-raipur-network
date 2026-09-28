import AppShell from '@/components/network/app-shell';

export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
