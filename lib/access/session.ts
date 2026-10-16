// Server/edge only. Never import from a client component.
export const ACCESS_COOKIE = "__Host-float-access";
export const SESSION_SECONDS = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

export function accessConfigured(): boolean {
  return !!process.env.FLOAT_ACCESS_KEY && (process.env.FLOAT_SESSION_SECRET?.length ?? 0) >= 32;
}
async function signingKey() {
  if (!accessConfigured()) throw new Error("Access control is not configured");
  // Changing either server secret invalidates every existing session.
  return crypto.subtle.importKey("raw", encoder.encode(JSON.stringify([
    process.env.FLOAT_SESSION_SECRET, process.env.FLOAT_ACCESS_KEY,
  ])), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
export async function matchesAccessKey(input: string): Promise<boolean> {
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
  const [a, b] = await Promise.all([digest(input), digest(process.env.FLOAT_ACCESS_KEY ?? "")]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return accessConfigured() && difference === 0;
}
export async function createAccessSession(now = Date.now()): Promise<string> {
  const payload = `v1.${Math.floor(now / 1000) + SESSION_SECONDS}.${crypto.randomUUID()}`;
  return `${payload}.${hex(await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(payload)))}`;
}
export async function verifyAccessSession(token: string, now = Date.now()): Promise<boolean> {
  if (!accessConfigured() || token.length > 256) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || !/^\d+$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[3])) return false;
  const expiry = Number(parts[1]);
  const seconds = Math.floor(now / 1000);
  if (expiry <= seconds || expiry > seconds + SESSION_SECONDS) return false;
  const signature = Uint8Array.from(parts[3].match(/../g)!, s => parseInt(s, 16));
  return crypto.subtle.verify("HMAC", await signingKey(), signature, encoder.encode(parts.slice(0, 3).join(".")));
}
