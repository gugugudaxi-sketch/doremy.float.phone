import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, SESSION_SECONDS, accessConfigured, createAccessSession, matchesAccessKey, verifyAccessSession } from "@/lib/access/session";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
// Local defence as well as Netlify's distributed IP limiter. Bounded and expiring.
const attempts = new Map<string, { count: number; until: number }>();
function sameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}
export async function GET(request: NextRequest) {
  return NextResponse.json({ authorized: await verifyAccessSession(request.cookies.get(ACCESS_COOKIE)?.value ?? "") }, { headers });
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403, headers });
  if (!accessConfigured()) return NextResponse.json({ error: "站点尚未配置访问密钥，请联系部署者。" }, { status: 503, headers });
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  // Netlify overwrites this header; never trust arbitrary X-Forwarded-For.
  const ip = request.headers.get("x-nf-client-connection-ip") ?? "local";
  const entry = attempts.get(ip) ?? { count: 0, until: now + 60_000 };
  if (entry.count >= 5 || attempts.size >= 10000) return NextResponse.json({ error: "尝试过于频繁，请一分钟后重试。" }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
  entry.count++;
  attempts.set(ip, entry);
  // Stream with a hard bound, including when Content-Length is absent.
  let body = "";
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    let size = 0;
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new Error(); }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const data = JSON.parse(body);
    if (typeof data.key !== "string" || data.key.length > 1024 || !(await matchesAccessKey(data.key))) {
      return NextResponse.json({ error: "密钥不正确" }, { status: 401, headers });
    }
  } catch {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400, headers });
  }
  const response = NextResponse.json({ ok: true }, { headers });
  response.cookies.set(ACCESS_COOKIE, await createAccessSession(), {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: SESSION_SECONDS,
  });
  return response;
}
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403, headers });
  const response = NextResponse.json({ ok: true }, { headers });
  response.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
