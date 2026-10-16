"use client";
import { useEffect } from "react";
// Recheck on resume (including browser back/forward cache) and after key rotation.
export function AccessSessionGuard() {
  useEffect(() => {
    let checking = false;
    const check = async () => {
      if (location.pathname === "/access" || document.hidden || checking) return;
      checking = true;
      try {
        const response = await fetch("/api/access/session", { cache: "no-store" });
        if (response.ok && !(await response.json()).authorized) location.replace("/access");
      } catch { /* Temporary offline state must not erase local data. */ }
      finally { checking = false; }
    };
    void check();
    const interval = setInterval(check, 60_000);
    window.addEventListener("pageshow", check);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(interval);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return null;
}
