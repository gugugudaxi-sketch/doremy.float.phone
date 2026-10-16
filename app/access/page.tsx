"use client";
import { useEffect, useState, type FormEvent } from "react";
export default function AccessPage() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  useEffect(() => { fetch("/api/access/session", { cache: "no-store" }).then(r => r.json()).then(d => setAuthorized(!!d.authorized)).catch(() => {}); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/access/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      const data = await response.json().catch(() => ({}));
      setKey("");
      if (!response.ok) { setError(data.error || (response.status === 429 ? "尝试过于频繁，请稍后重试。" : "验证失败，请稍后重试。")); return; }
      location.replace("/");
    } catch { setError("连接失败，请检查网络后重试。"); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try {
      const response = await fetch("/api/access/session", { method: "DELETE" });
      if (!response.ok) throw new Error();
      setAuthorized(false); setKey(""); setError("");
    } catch { setError("退出失败，请重试。"); }
    finally { setBusy(false); }
  }
  return <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "max(28px, env(safe-area-inset-top)) 24px", background: "#f7f5f4", color: "#3c3940" }}>
    <section style={{ width: "100%", maxWidth: 340 }}>
      <p style={{ letterSpacing: 4, fontSize: 12 }}>FLOAT · PRIVATE</p>
      <h1 style={{ fontSize: 26, margin: "18px 0" }}>访问验证</h1>
      <p style={{ fontSize: 14, lineHeight: 1.8, marginBottom: 24 }}>请输入部署者提供的密钥。验证后，此设备会记住授权状态。</p>
      {authorized ? <div style={{ display: "grid", gap: 16 }}><p>此设备已授权。</p><a href="/">进入小手机</a><button disabled={busy} onClick={logout}>退出授权 / 重新验证</button></div> :
        <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
          <label htmlFor="access-key">访问密钥</label>
          <input id="access-key" type="password" autoComplete="current-password" required maxLength={1024} value={key} onChange={e => setKey(e.target.value)} style={{ padding: 14, border: "1px solid #d7d1d5", borderRadius: 12, background: "white", fontSize: 16 }} />
          <button disabled={busy} style={{ padding: 14, border: 0, borderRadius: 12, background: "#514951", color: "white" }}>{busy ? "正在验证…" : "验证并进入"}</button>
        </form>}
      {error && <p role="alert" style={{ marginTop: 16, color: "#a83951", fontSize: 14 }}>{error}</p>}
    </section>
  </main>;
}
