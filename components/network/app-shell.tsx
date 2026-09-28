import Link from 'next/link';
import {
  Building2,
  Handshake,
  LayoutDashboard,
  Network,
  Search,
  ShieldCheck,
  Star,
  UsersRound,
} from 'lucide-react';

const navigation = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/requirements', label: 'Requirements', icon: Search },
  { href: '/properties', label: 'Properties', icon: Building2 },
  { href: '/brokers', label: 'Broker Network', icon: UsersRound },
  { href: '/deals', label: 'Deal Rooms', icon: Handshake },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 lg:grid lg:grid-cols-[270px_1fr]">
      <aside className="border-b border-slate-800 bg-slate-950 text-white lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="grid size-10 place-items-center rounded-xl bg-blue-600 font-black">G</div>
          <div>
            <div className="text-lg font-bold tracking-tight">GENZ Network</div>
            <div className="text-xs text-slate-400">Broker Collaboration OS</div>
          </div>
        </div>

        <div className="mx-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Network className="size-4 text-blue-400" /> Nationwide network
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Location is a requirement, not a broker restriction. Brokers can collaborate across India.
          </p>
        </div>

        <nav className="grid gap-1 px-3 py-5">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="mx-4 mt-auto border-t border-slate-800 py-5 text-xs text-slate-500">
          <div className="flex items-center gap-2"><ShieldCheck className="size-4" /> Protected introductions</div>
          <div className="mt-2 flex items-center gap-2"><Star className="size-4" /> Evidence-based trust</div>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="flex min-h-16 items-center justify-between border-b border-slate-200 bg-white px-5 lg:px-8">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">GENZ Network V2</div>
            <div className="text-sm text-slate-500">Verified property collaboration without broker conflict</div>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">Private beta</div>
        </header>
        <div className="mx-auto w-full max-w-[1500px] p-5 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
