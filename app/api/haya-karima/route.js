import { NextResponse } from 'next/server';
import { requireUserSession, noStore } from '../../../lib/server/auth.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 32);
}

export async function GET(request) {
  const sess = await requireUserSession(request);
  if(!sess.ok) return noStore(NextResponse.json({ error: sess.error }, { status: sess.status || 401 }));

  const { searchParams } = new URL(request.url);
  const areaCode = digitsOnly(searchParams.get('area_code'));
  const landline = digitsOnly(searchParams.get('landline'));

  if (!areaCode || !landline) {
    return noStore(NextResponse.json({ error: 'Missing area_code or landline' }, { status: 400 }));
  }

  const upstreamUrl = `https://10.19.44.2/ireport/api/haya_karima_api.php?area_code=${encodeURIComponent(areaCode)}&landline=${encodeURIComponent(landline)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(upstreamUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'accept': 'application/json,text/html;q=0.9,*/*;q=0.8'
      }
    });

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (parseError) {
      return noStore(NextResponse.json({ error: 'Invalid upstream payload', raw: text.slice(0, 500) }, { status: 502 }));
    }

    return noStore(NextResponse.json(payload, { status: 200 }));
  } catch (error) {
    const message = error && error.name === 'AbortError'
      ? 'Upstream timeout'
      : (error && error.message) || 'Unable to reach upstream';
    return noStore(NextResponse.json({ error: message }, { status: 502 }));
  } finally {
    clearTimeout(timeout);
  }
}
