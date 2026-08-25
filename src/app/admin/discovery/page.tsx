// @ts-nocheck
"use client";
import { useState, useEffect } from "react";

// Discovery Settings: view/add/edit/enable/remove the discovery search sources.
// Persisted in the discovery_sources table; the discovery job reads enabled rows
// and falls back to config defaults if the table is empty. Admin-authenticated.

const S = {
  page: { minHeight: "100vh", background: "#f8f9fa", color: "#374151", fontFamily: "'DM Sans', -apple-system, system-ui, sans-serif", fontSize: 14 },
  header: { background: "rgba(15,23,42,0.98)", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 },
  container: { maxWidth: 1000, margin: "0 auto", padding: "24px 32px" },
  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  btnPrimary: { padding: "9px 16px", borderRadius: 8, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnSecondary: { padding: "8px 14px", borderRadius: 8, background: "#f3f4f6", border: "1px solid #d1d5db", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { padding: "6px 10px", borderRadius: 6, background: "none", border: "none", color: "#ef4444", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  label: { fontSize: 10, color: "#6b7280", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 3, display: "block" },
  input: { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, fontFamily: "inherit", outline: "none" },
};

function Row({ src, onChanged, onAuthError, showToast }) {
  const [s, setS] = useState(src);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(src);
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/sources", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
      if (res.status === 401) return onAuthError();
      const d = await res.json();
      if (res.ok) { showToast("Saved"); onChanged(); } else showToast(d.error || "Save failed", true);
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Remove source "${s.label}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/sources?id=${s.id}`, { method: "DELETE" });
      if (res.status === 401) return onAuthError();
      if (res.ok) { showToast("Removed"); onChanged(); } else showToast("Remove failed", true);
    } finally { setBusy(false); }
  };
  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/sources", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, enabled: !s.enabled }) });
      if (res.status === 401) return onAuthError();
      if (res.ok) { showToast(!s.enabled ? "Enabled" : "Disabled"); onChanged(); }
    } finally { setBusy(false); }
  };
  const runNow = async () => {
    if (dirty && !window.confirm("You have unsaved edits to this source. Run using the last saved version?")) return;
    setBusy(true);
    try {
      const run = await fetch(`/api/admin/run?job=discover&sourceId=${s.id}`, { method: "POST" });
      if (run.status === 401) return onAuthError();
      const d = await run.json();
      if (run.ok) {
        const r = d.result || {};
        showToast(`"${s.label}": found ${r.candidatesFound ?? 0}, inserted ${r.newInserted ?? 0} (kept ${r.keptForInsert ?? 0}, ${r.pastDropped ?? 0} past, ${r.tooFarDropped ?? 0} too far)`);
      } else showToast(d.error || "Run failed", true);
    } catch (e) { showToast("Run request failed", true); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ ...S.card, opacity: s.enabled ? 1 : 0.6 }}>
      <div style={{ display: "grid", gridTemplateColumns: "110px 1.4fr 1fr 70px", gap: 10, marginBottom: 8 }}>
        <div>
          <label style={S.label}>Type</label>
          <select style={S.input} value={s.kind} onChange={(e) => set("kind", e.target.value)}>
            <option value="search">search</option>
            <option value="directory">directory</option>
          </select>
        </div>
        <div>
          <label style={S.label}>Label</label>
          <input style={S.input} value={s.label || ""} onChange={(e) => set("label", e.target.value)} />
        </div>
        <div>
          <label style={S.label}>Region</label>
          <input style={S.input} value={s.region || ""} onChange={(e) => set("region", e.target.value)} />
        </div>
        <div>
          <label style={S.label}>Order</label>
          <input style={S.input} value={s.sort_order ?? 0} onChange={(e) => set("sort_order", parseInt(e.target.value.replace(/[^0-9]/g, "")) || 0)} />
        </div>
      </div>
      {s.kind === "directory" ? (
        <div><label style={S.label}>Directory URL</label><input style={S.input} value={s.url || ""} onChange={(e) => set("url", e.target.value)} placeholder="https://..." /></div>
      ) : (
        <div><label style={S.label}>Search query (use {"{YEARS}"} for the rolling window years)</label><input style={S.input} value={s.query || ""} onChange={(e) => set("query", e.target.value)} placeholder="AI conferences {YEARS} ..." /></div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151" }}>
          <input type="checkbox" checked={!!s.enabled} onChange={toggle} disabled={busy} /> Enabled
        </label>
        <div style={{ flex: 1 }} />
        <button style={S.btnGhost} disabled={busy} onClick={remove}>Remove</button>
        <button style={{ ...S.btnSecondary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={runNow}>{busy ? "Working..." : "Run now"}</button>
        <button style={{ ...S.btnPrimary, opacity: !dirty || busy ? 0.5 : 1 }} disabled={!dirty || busy} onClick={save}>Save</button>
      </div>
    </div>
  );
}

function DiscoveryTool({ onAuthError }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const showToast = (msg, error = false) => { setToast({ msg, error }); setTimeout(() => setToast(null), 4000); };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sources");
      if (res.status === 401) return onAuthError();
      const d = await res.json();
      setSources(d.sources || []);
    } catch (e) { showToast("Failed to load", true); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const addSource = async () => {
    const res = await fetch("/api/admin/sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "search", label: "New source", query: "AI conferences {YEARS}", region: "Global", enabled: true, sort_order: (sources.length || 0) + 1 }) });
    if (res.status === 401) return onAuthError();
    if (res.ok) { showToast("Added"); load(); } else showToast("Add failed", true);
  };

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');`}</style>
      <div style={S.header}>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Conference<span style={{ color: "#f97316" }}>Codes</span> · Discovery Settings</span>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/admin" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-block" }}>Conferences</a>
          <a href="/admin/candidates" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-block" }}>Candidates</a>
          <button style={S.btnPrimary} onClick={addSource}>+ Add source</button>
        </div>
      </div>
      <div style={S.container}>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
          Discovery runs these enabled sources each cycle. Search sources use web search; {"{YEARS}"} is replaced with the current rolling window years. If this list is empty, discovery falls back to built-in defaults.
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading...</div>
        ) : sources.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>No sources yet. Add one, or discovery will use built-in defaults.</div>
        ) : (
          sources.map((src) => <Row key={src.id} src={src} onChanged={load} onAuthError={onAuthError} showToast={showToast} />)
        )}
      </div>
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: toast.error ? "#ef4444" : "#16a34a", color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>{toast.msg}</div>
      )}
    </div>
  );
}

export default function DiscoveryPage() {
  const [authed, setAuthed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    if (sessionStorage.getItem("admin_authed") === "1") setAuthed(true);
    setAuthChecked(true);
  }, []);

  const submit = async () => {
    const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pwInput }) });
    if (res.ok) { sessionStorage.setItem("admin_authed", "1"); setAuthed(true); setPwError(""); }
    else setPwError("Incorrect password");
  };
  const handleAuthError = () => { sessionStorage.removeItem("admin_authed"); setAuthed(false); setPwError("Please sign in again to continue."); };

  if (!authChecked) return null;
  if (authed) return <DiscoveryTool onAuthError={handleAuthError} />;

  return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');`}</style>
      <div style={{ ...S.card, width: 320 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 12 }}>Admin access</div>
        <input type="password" style={S.input} placeholder="Password" value={pwInput}
          onChange={(e) => setPwInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {pwError && <div style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>{pwError}</div>}
        <button style={{ ...S.btnPrimary, width: "100%", marginTop: 12 }} onClick={submit}>Enter</button>
      </div>
    </div>
  );
}
