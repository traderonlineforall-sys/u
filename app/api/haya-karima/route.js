import { NextResponse } from 'next/server';
import https from 'https';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requestInternal(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      rejectUnauthorized: false,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'ua07-hk-proxy/1.0'
      },
      timeout: 2600
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 200,
          body
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('request timeout'));
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const areaCode = (searchParams.get('area_code') || '').trim();
  const landline = (searchParams.get('landline') || '').trim();

  if (!/^0\d+$/.test(areaCode) || !/^\d+$/.test(landline)) {
    return NextResponse.json(
      { status: -1, message: 'invalid haya karima parameters' },
      { status: 400, headers: { 'cache-control': 'no-store' } }
    );
  }

  const upstreamUrl = `https://10.19.44.2/ireport/api/haya_karima_api.php?area_code=${encodeURIComponent(areaCode)}&landline=${encodeURIComponent(landline)}`;

  try {
    const upstream = await requestInternal(upstreamUrl);
    let payload = null;

    try {
      payload = JSON.parse(upstream.body);
    } catch (error) {
      payload = { status: -1, message: 'invalid upstream response', raw: upstream.body };
    }

    return NextResponse.json(payload, {
      status: upstream.statusCode >= 200 && upstream.statusCode < 300 ? 200 : 502,
      headers: { 'cache-control': 'no-store' }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: -1,
        message: 'proxy request failed',
        error: error instanceof Error ? error.message : 'unknown error'
      },
      { status: 502, headers: { 'cache-control': 'no-store' } }
    );
  }
}
