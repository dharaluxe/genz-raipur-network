import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GENZ Network | Broker Collaboration OS',
  description: 'A private real-estate collaboration network for brokers, buyer requirements, property mandates, protected introductions and deal rooms across India.',
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: false },
  other: { 'codex-preview': 'development' },
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
