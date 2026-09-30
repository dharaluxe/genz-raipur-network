import { NextRequest } from 'next/server';
import { isValidBrokerCode, normalizeBrokerCode } from '@/lib/public-broker-verification';

export const dynamic = 'force-dynamic';

const DEFAULT_PUBLIC_ORIGIN = 'https://genz-raipur-network.vercel.app';
const MAX_QR_BYTES = 1024 * 1024;

function publicOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_PUBLIC_ORIGIN;
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:') return DEFAULT_PUBLIC_ORIGIN;
    return url.origin;
  } catch {
    return DEFAULT_PUBLIC_ORIGIN;
  }
}

export async function GET(request: NextRequest) {
  const code = normalizeBrokerCode(request.nextUrl.searchParams.get('code') || '');
  if (!isValidBrokerCode(code)) {
    return new Response('Invalid Broker ID', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const target = `${publicOrigin()}/broker/${encodeURIComponent(code)}`;
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
      signal: AbortSignal.timeout(5000),
    });
    if (!upstream.ok) throw new Error('QR_PROVIDER_UNAVAILABLE');
    const contentType = upstream.headers.get('content-type') || '';
    const declaredSize = Number(upstream.headers.get('content-length') || 0);
    if (!contentType.toLowerCase().startsWith('image/png')) throw new Error('QR_PROVIDER_INVALID_TYPE');
    if (declaredSize > MAX_QR_BYTES) throw new Error('QR_PROVIDER_TOO_LARGE');
    const image = await upstream.arrayBuffer();
    if (!image.byteLength || image.byteLength > MAX_QR_BYTES) throw new Error('QR_PROVIDER_INVALID_SIZE');
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
