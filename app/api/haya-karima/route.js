import https from "https";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message) {
  return NextResponse.json(
    { status: 0, message, data: [] },
    {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

function sanitizeAreaCode(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits;
}

function sanitizeLandline(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits;
}

function fetchFromInternalApi(pathnameWithQuery) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: "https:",
        hostname: "10.19.44.2",
        port: 443,
        path: pathnameWithQuery,
        method: "GET",
        rejectUnauthorized: false,
        timeout: 4000,
        headers: {
          Accept: "application/json,text/plain,*/*",
          "User-Agent": "SR-Tool-HayaKarima-Proxy/1.0",
        },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          const statusCode = Number(res.statusCode || 0);
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`Upstream returned ${statusCode || "unknown"}`));
            return;
          }
          resolve(body);
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("Upstream timeout"));
    });

    req.on("error", reject);
    req.end();
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const areaCode = sanitizeAreaCode(searchParams.get("area_code"));
  const landline = sanitizeLandline(searchParams.get("landline"));

  if (!areaCode || !/^\d{2,3}$/.test(areaCode)) {
    return badRequest("invalid area code");
  }

  if (!landline || !/^\d{3,12}$/.test(landline)) {
    return badRequest("invalid landline");
  }

  const upstreamPath = `/ireport/api/haya_karima_api.php?area_code=${encodeURIComponent(areaCode)}&landline=${encodeURIComponent(landline)}`;

  try {
    const raw = await fetchFromInternalApi(upstreamPath);
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (_parseError) {
      return NextResponse.json(
        { status: 0, message: "invalid upstream response", data: [] },
        {
          status: 502,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    return NextResponse.json(parsed, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (_error) {
    return NextResponse.json(
      { status: 0, message: "proxy unavailable", data: [] },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
