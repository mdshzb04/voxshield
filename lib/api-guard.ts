import { NextRequest, NextResponse } from "next/server";

const REQUEST_LIMIT = 20;
const WINDOW_MS = 60_000;

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const requestsByIp = new Map<string, RateLimitEntry>();

function getClientIp(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimit(req: NextRequest) {
  const now = Date.now();
  const ip = getClientIp(req);
  const existing = requestsByIp.get(ip);

  if (!existing || existing.resetAt <= now) {
    requestsByIp.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }

  existing.count += 1;
  if (existing.count <= REQUEST_LIMIT) return null;

  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return NextResponse.json(
    {
      error: "rate_limit_exceeded",
      message: "Too many requests. Please try again in a minute.",
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    }
  );
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 10_000
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
