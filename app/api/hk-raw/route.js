import { NextResponse } from "next/server";
import { noStore } from "../../../lib/server/auth.js";
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const ALLOWED_HOSTS = new Set(["10.19.44.2"]);
const ALLOWED_PATHS = [/^\/ireport\/api\/haya_karima_api\.php$/i];

function isAllowedTarget(target) {
  return (
    target.protocol === "https:" &&
    ALLOWED_HOSTS.has(target.hostname) &&
    ALLOWED_PATHS.some((pattern) => pattern.test(target.pathname || ""))
  );
}

export async function GET(request) {
  const current = new URL(request.url);
  const rawUrl = (current.searchParams.get("url") || "").trim();

  if (!rawUrl) {
    return noStore(NextResponse.json({ error: "Missing url." }, { status: 400 }));
  }

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return noStore(NextResponse.json({ error: "Invalid url." }, { status: 400 }));
  }

  if (!isAllowedTarget(target)) {
    return noStore(NextResponse.json({ error: "URL not allowed." }, { status: 400 }));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const upstream = await fetch(target.toString(), {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "application/json,text/plain,*/*"
      }
    });

    if (upstream.status >= 300 && upstream.status < 400) {
      return noStore(
        NextResponse.json({ error: "Upstream redirect blocked." }, { status: 502 })
      );
    }

    const rawText = await upstream.text();
    let payload = null;
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = null;
    }

    if (!upstream.ok) {
      return noStore(
        NextResponse.json(
          {
            error: "Upstream request failed.",
            upstream_status: upstream.status
          },
          { status: 502 }
        )
      );
    }

    if (!payload || typeof payload !== "object") {
      return noStore(
        NextResponse.json(
          {
            error: "Invalid upstream JSON."
          },
          { status: 502 }
        )
      );
    }

    return noStore(NextResponse.json(payload));
  } catch (error) {
    return noStore(
      NextResponse.json(
        {
          error: String(error?.message || error || "Fetch failed")
        },
        { status: 502 }
      )
    );
  } finally {
    clearTimeout(timer);
  }
}
