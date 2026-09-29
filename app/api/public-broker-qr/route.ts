import { NextRequest } from 'next/server';
import { isValidBrokerCode, normalizeBrokerCode } from '@/lib/public-broker-verification';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const code = normalizeBrokerCode(request.nextUrl.searchParams.get('code') || '');
  if (!isValidBrokerCode(code)) {
    return new Response('Invalid Broker ID', { status: 400 });
  }

  const target = `${request.nextUrl.origin}/broker/${encodeURIComponent(code)}`;
  const upstreamUrl = new URL('https://quickchart.io/qr');
  upstreamUrl.searchParams.set('text', target);
  upstreamUrl.searchParams.set('size', '320');
  upstreamUrl.searchParams.set('margin', '2');
  upstreamUrl.searchParams.set('ecLevel', 'M');
  upstreamUrl.searchParams.set('format', 'png');

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: 'image/png' },
      next: { revalidate: 86400 },
    });
    if (!upstream.ok) throw new Error(`QR provider returned ${upstream.status}`);
    const image = await upstream.arrayBuffer();
    return new Response(image, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
        'Content-Disposition': `inline; filename="${code}-verification-qr.png"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('QR image is temporarily unavailable. The Broker ID and verification link remain valid.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
