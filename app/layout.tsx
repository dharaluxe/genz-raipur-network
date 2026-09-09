import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GENZ | Raipur Broker Network",
  description: "Raipur's private broker workspace for property introductions, site visits and brokerage records.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
