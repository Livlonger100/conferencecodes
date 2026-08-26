// @ts-nocheck
"use client";
import { useState, useEffect, useCallback } from "react";

// Shared admin auth UX. The server session is an httpOnly cookie (12h). This
// verifies the REAL session on load via /api/auth/status (not a stale client
// flag), exposes a persistent header badge, and a sign-in overlay that never
// unmounts the page, so re-authenticating from an expired state keeps whatever
// is on screen (a pasted URL, a draft being edited, a batch result).

export function useAdminAuth() {
  const [status, setStatus] = useState("checking"); // checking | valid | invalid
  const [signInOpen, setSignInOpen] = useState(false);

  const check = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/status", { cache: "no-store" });
      const d = await r.json();
      const authed = !!d.authed;
      setStatus(authed ? "valid" : "invalid");
      try { authed ? sessionStorage.setItem("admin_authed", "1") : sessionStorage.removeItem("admin_authed"); } catch (e) {}
      return authed;
    } catch (e) {
      setStatus("invalid");
      return false;
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  // Re-verify when the tab regains focus (cookie may have expired meanwhile).
  useEffect(() => {
    const onFocus = () => { check(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [check]);

  const signOut = useCallback(async () => {
    try { await fetch("/api/auth", { method: "DELETE" }); } catch (e) {}
    try { sessionStorage.removeItem("admin_authed"); } catch (e) {}
    setStatus("invalid");
    setSignInOpen(true);
  }, []);

  // Called by action handlers when a request returns 401 mid-use.
  const sessionLost = useCallback(() => { setStatus("invalid"); setSignInOpen(true); }, []);
  const openSignIn = useCallback(() => setSignInOpen(true), []);
  const onSignedIn = useCallback(() => {
    setStatus("valid");
    setSignInOpen(false);
    try { sessionStorage.setItem("admin_authed", "1"); } catch (e) {}
  }, []);

  return { status, signInOpen, setSignInOpen, check, signOut, sessionLost, openSignIn, onSignedIn };
}

// Persistent session indicator for the admin header.
export function AuthBadge({ status, onSignIn, onSignOut }) {
  const valid = status === "valid";
  const checking = status === "checking";
  const color = valid ? "#22c55e" : checking ? "#9ca3af" : "#ef4444";
  const label = valid ? "Signed in" : checking ? "Checking session..." : "Signed out";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 10px" }}>
      <span style={{ width: 8, height: 8, borderRadius: 8, background: color, boxShadow: valid ? "0 0 6px rgba(34,197,94,0.7)" : "none" }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: valid ? "#d1fae5" : checking ? "#e5e7eb" : "#fecaca" }}>{label}</span>
      {valid ? (
        <button onClick={onSignOut} style={{ fontSize: 11, fontWeight: 700, color: "#e5e7eb", background: "none", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>Sign out</button>
      ) : !checking ? (
        <button onClick={onSignIn} style={{ fontSize: 11, fontWeight: 800, color: "#111827", background: "#fbbf24", border: "none", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" }}>Sign in</button>
      ) : null}
    </span>
  );
}

// Sign-in overlay. Rendered above the page without unmounting it, so form and
// draft state survive re-authentication. Not dismissable while the session is
// invalid (there is nothing safe to return to); dismissable when opened manually.
export function SignInOverlay({ open, invalid, onSignedIn, onClose }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  const submit = async () => {
    if (!pw) return;
    setBusy(true);
    try {
      const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
      if (r.ok) { setPw(""); setErr(""); onSignedIn(); }
      else setErr("Incorrect password");
    } catch (e) { setErr("Sign-in request failed"); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 24, width: 340, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", fontFamily: "'DM Sans', -apple-system, system-ui, sans-serif" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 4 }}>{invalid ? "Session expired" : "Admin sign in"}</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 14 }}>{invalid ? "Your admin session ended. Sign in again to continue. Nothing on this page is lost." : "Enter the admin password."}</div>
        <input type="password" autoFocus placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, fontFamily: "inherit", outline: "none" }} />
        {err && <div style={{ color: "#ef4444", fontSize: 12, fontWeight: 600, marginTop: 8 }}>{err}</div>}
        <button onClick={submit} disabled={busy || !pw} style={{ width: "100%", marginTop: 12, padding: "11px 16px", borderRadius: 8, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: busy || !pw ? 0.6 : 1 }}>{busy ? "Signing in..." : "Sign in"}</button>
        {!invalid && onClose && (
          <button onClick={onClose} style={{ width: "100%", marginTop: 8, padding: "8px 16px", borderRadius: 8, background: "none", border: "none", color: "#6b7280", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        )}
      </div>
    </div>
  );
}
