// @ts-nocheck
"use client";
import { useState, useEffect } from "react";

// Candidate pipeline UI: Discovered -> (select + Scrape selected) -> Drafted ->
// review -> Published, plus a Failed bucket. "Scrape selected" queues and scrapes
// in one action. Reuses the existing admin password gate.

// Tabs shown to the user. DB status values stay internal ("ingested" shows as
// "Drafted"); the transient "approved" queue state is never shown as a tab.
const TABS = [
  { key: "discovered", label: "Discovered" },
  { key: "ingested", label: "Drafted" },
  { key: "failed", label: "Failed" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];
const STATUS_LABEL = { discovered: "Discovered", ingested: "Drafted", failed: "Failed", rejected: "Rejected", approved: "Queued" };
const statusLabel = (s) => STATUS_LABEL[s] || s;

const S = {
  page: { minHeight: "100vh", background: "#f8f9fa", color: "#374151", fontFamily: "'DM Sans', -apple-system, system-ui, sans-serif", fontSize: 14 },
  header: { background: "rgba(15,23,42,0.98)", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 },
  container: { maxWidth: 1100, margin: "0 auto", padding: "24px 32px" },
  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 18, marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  btnPrimary: { padding: "8px 16px", borderRadius: 8, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnSecondary: { padding: "8px 16px", borderRadius: 8, background: "#f3f4f6", border: "1px solid #d1d5db", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnGreen: { padding: "6px 14px", borderRadius: 6, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#16a34a", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnRed: { padding: "6px 14px", borderRadius: 6, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  tab: (active) => ({ padding: "6px 14px", borderRadius: 20, border: "1px solid", borderColor: active ? "#f97316" : "#d1d5db", background: active ? "rgba(249,115,22,0.1)" : "#fff", color: active ? "#f97316" : "#6b7280", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }),
  input: { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, fontFamily: "inherit", outline: "none" },
};

function CandidatesTool() {
  const [candidates, setCandidates] = useState([]);
  const [counts, setCounts] = useState({});
  const [status, setStatus] = useState("discovered");
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [running, setRunning] = useState(null);
  const [progress, setProgress] = useState(null);
  const [scrapingId, setScrapingId] = useState(null); // row currently scraping
  const [rowResults, setRowResults] = useState({}); // { [id]: { kind: "drafted"|"failed", reason? } }
  const [bulkResult, setBulkResult] = useState(null); // { drafted, failed } persistent summary
  const [usage, setUsage] = useState(null); // firecrawl credit usage

  const loadUsage = async () => {
    try { const r = await fetch("/api/admin/firecrawl-usage"); if (r.ok) { const d = await r.json(); setUsage(d); } } catch (e) {}
  };
  useEffect(() => { loadUsage(); /* eslint-disable-next-line */ }, []);

  const showToast = (msg, type = "info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 5000); };
  const sessionExpired = () => { sessionStorage.removeItem("admin_authed"); showToast("Session expired, please sign in again", "error"); setTimeout(() => location.reload(), 1200); setRunning(null); };

  const load = async (st = status) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/candidates?status=${st}`);
      const data = await res.json();
      setCandidates(data.candidates || []);
      setCounts(data.counts || {});
      setSelected(new Set());
    } catch (e) { showToast("Failed to load candidates", "error"); }
    setLoading(false);
  };

  // Refresh only the tab counts (not the visible list), so per-row results stay
  // on screen while the Discovered/Drafted/Failed numbers update immediately.
  const refreshCounts = async () => {
    try {
      const res = await fetch(`/api/candidates?status=${status}`);
      if (res.ok) { const data = await res.json(); setCounts(data.counts || {}); }
    } catch (e) { /* keep last counts */ }
  };

  // Switch tab and clear any persistent per-row / bulk results from the old tab.
  const goTo = (st) => { if (st === status) return; setRowResults({}); setBulkResult(null); setStatus(st); };

  useEffect(() => { load(status); /* eslint-disable-next-line */ }, [status]);

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const reject = async (ids) => {
    if (!ids.length) return;
    const res = await fetch("/api/candidates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, action: "reject" }) });
    if (res.status === 401) return sessionExpired();
    const data = await res.json();
    if (res.ok) { showToast(`Rejected: ${data.updated}`, "success"); load(status); }
    else showToast(data.error || "Action failed", "error");
  };

  // Queue the selected candidates (discovered -> queue, or drafted/failed ->
  // re-scrape) and then scrape them into drafts, looping batches until done.
  const scrapeMany = async (ids, action) => {
    if (!ids.length) return;
    setRunning("scrape");
    setBulkResult(null);
    try {
      const q = await fetch("/api/candidates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, action }) });
      if (q.status === 401) return sessionExpired();
      if (!q.ok) { const d = await q.json(); showToast(d.error || "Could not queue", "error"); setRunning(null); return; }
      let drafted = 0, failed = 0, remaining = null;
      // Re-scrape forces a fresh fetch (the page may have changed); first scrape reuses cache.
      const force = action === "rescrape" ? "&force=1" : "";
      setProgress("Scraping...");
      for (let round = 0; round < 60; round++) {
        const res = await fetch(`/api/admin/run?job=ingest${force}`, { method: "POST" });
        if (res.status === 401) return sessionExpired();
        const data = await res.json();
        if (!res.ok) { showToast(data.error || "Scrape failed", "error"); break; }
        const r = data.result || {};
        const rs = r.results || [];
        drafted += rs.filter((x) => x.status === "ingested").length;
        failed += rs.filter((x) => x.status === "failed").length;
        remaining = r.remainingApproved ?? 0;
        setProgress(`Scraping... ${drafted} drafted, ${failed} failed, ${remaining} remaining`);
        if (remaining === 0 || (r.processed ?? 0) === 0) break;
      }
      setProgress(null);
      await load(status);
      loadUsage();
      setBulkResult({ drafted, failed });
    } catch (e) { setProgress(null); showToast("Scrape request failed", "error"); }
    setRunning(null);
  };

  // Scrape a single candidate (scoped by id, does not drain others). Records a
  // persistent result on the row (Drafted or Failed) and refreshes tab counts.
  const scrapeOne = async (id, action) => {
    setScrapingId(id);
    setRunning("scrape");
    setRowResults((m) => { const n = { ...m }; delete n[id]; return n; });
    try {
      const q = await fetch("/api/candidates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id], action }) });
      if (q.status === 401) return sessionExpired();
      const res = await fetch(`/api/admin/run?job=ingest&id=${id}${action === "rescrape" ? "&force=1" : ""}`, { method: "POST" });
      if (res.status === 401) return sessionExpired();
      const data = await res.json();
      if (!res.ok) {
        setRowResults((m) => ({ ...m, [id]: { kind: "failed", reason: data.error || "scrape failed" } }));
      } else {
        const r0 = (data.result?.results || [])[0];
        if (r0?.status === "failed") setRowResults((m) => ({ ...m, [id]: { kind: "failed", reason: r0.reason || "no grounded pricing found" } }));
        else setRowResults((m) => ({ ...m, [id]: { kind: "drafted" } }));
      }
      await refreshCounts();
      loadUsage();
    } catch (e) {
      setRowResults((m) => ({ ...m, [id]: { kind: "failed", reason: "request failed" } }));
    } finally { setScrapingId(null); setRunning(null); }
  };

  // Persistent per-row result badge shown after a per-row scrape completes.
  const RowResult = ({ id }) => {
    const r = rowResults[id];
    if (!r) return null;
    if (r.kind === "drafted") return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#16a34a", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", padding: "5px 10px", borderRadius: 6 }}>Drafted</span>
        <a href="/admin" style={{ fontSize: 12, fontWeight: 600, color: "#2563eb", textDecoration: "none" }}>Review draft</a>
      </div>
    );
    return (
      <span style={{ fontSize: 12, fontWeight: 600, color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", padding: "5px 10px", borderRadius: 6, flexShrink: 0, maxWidth: 260 }}>Failed: {r.reason}</span>
    );
  };

  const selectable = status === "discovered" || status === "ingested" || status === "failed";
  const currentLabel = (TABS.find((t) => t.key === status) || {}).label || status;

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');`}</style>
      <div style={S.header}>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Conference<span style={{ color: "#f97316" }}>Codes</span> · Candidates</span>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/admin" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-block" }}>Conferences</a>
          <a href="/admin/import" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-block" }}>Bulk Import</a>
          <a href="/admin/discovery" style={{ ...S.btnPrimary, textDecoration: "none", display: "inline-block" }}>Search discovery</a>
        </div>
      </div>
      {progress && (
        <div style={{ background: "#fff7ed", borderBottom: "1px solid rgba(249,115,22,0.25)", color: "#9a3412", fontSize: 13, fontWeight: 600, padding: "8px 32px" }}>{progress}</div>
      )}

      <div style={S.container}>
        {usage?.usage && (() => {
          const u = usage.usage;
          const pct = Math.min(100, Math.round((u.monthCredits / (usage.freeTierCredits || 1000)) * 100));
          const over = pct >= 80;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#374151" }}>
              <span style={{ fontWeight: 800, color: over ? "#dc2626" : "#111827" }}>Firecrawl: ~{u.monthCredits} / {usage.freeTierCredits} credits this month ({pct}%)</span>
              <span style={{ color: "#6b7280" }}>{u.monthCalls} calls</span>
              <span style={{ color: "#16a34a" }}>{u.cacheHits || 0} cache hits</span>
              {u.failures ? <span style={{ color: "#ef4444" }}>{u.failures} failed</span> : null}
              {u.byType && <span style={{ color: "#6b7280" }}>by type: {Object.entries(u.byType).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}</span>}
              {u.bySource && <span style={{ color: "#6b7280" }}>by source: {Object.entries(u.bySource).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}</span>}
              <button style={{ ...S.btnSecondary, padding: "4px 10px", fontSize: 11, marginLeft: "auto" }} onClick={loadUsage}>Refresh</button>
            </div>
          );
        })()}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {TABS.map((t) => (
            <button key={t.key} style={S.tab(status === t.key)} onClick={() => goTo(t.key)}>
              {t.label}{counts[t.key] != null ? ` (${counts[t.key]})` : ""}
            </button>
          ))}
        </div>

        {bulkResult && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#f0fdf4", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>Scraping complete. {bulkResult.drafted} drafted, {bulkResult.failed} failed.</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button style={S.btnSecondary} onClick={() => goTo("ingested")}>View drafts</button>
              <button style={{ ...S.btnSecondary, background: "transparent", border: "none", color: "#6b7280" }} onClick={() => setBulkResult(null)}>Dismiss</button>
            </div>
          </div>
        )}

        {status === "discovered" && candidates.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <button style={{ ...S.btnPrimary, opacity: selected.size === 0 || running ? 0.6 : 1 }} disabled={selected.size === 0 || !!running} onClick={() => scrapeMany([...selected], "queue")}>Scrape selected ({selected.size})</button>
            <button style={S.btnRed} onClick={() => reject([...selected])} disabled={selected.size === 0 || !!running}>Reject selected</button>
            <button style={S.btnSecondary} onClick={() => setSelected(new Set(candidates.map((c) => c.id)))}>Select all</button>
            <button style={S.btnSecondary} onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}

        {(status === "ingested" || status === "failed") && candidates.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <button style={{ ...S.btnPrimary, opacity: selected.size === 0 || running ? 0.6 : 1 }} disabled={selected.size === 0 || !!running} onClick={() => scrapeMany([...selected], "rescrape")}>Re-scrape selected ({selected.size})</button>
            <button style={S.btnSecondary} onClick={() => setSelected(new Set(candidates.map((c) => c.id)))}>Select all</button>
            <button style={S.btnSecondary} onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading...</div>
        ) : candidates.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>No {currentLabel} candidates.</div>
        ) : (
          candidates.map((c) => (
            <div key={c.id} style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div style={{ display: "flex", gap: 12, flex: 1, minWidth: 0 }}>
                  {selectable && (
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} style={{ marginTop: 4 }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{c.full_name || c.name}</div>
                    {c.full_name && c.full_name !== c.name && (
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{c.name}</div>
                    )}
                    {c.short_description && (
                      <div style={{ fontSize: 13, color: "#374151", margin: "4px 0", lineHeight: 1.45 }}>{c.short_description}</div>
                    )}
                    <div style={{ fontSize: 12, color: "#6b7280", margin: "4px 0" }}>
                      {[c.city, c.country].filter(Boolean).join(", ") || "Location unknown"}
                      {c.approx_date ? ` · ${c.approx_date}` : ""}
                      {c.source ? ` · via ${c.source}` : ""}
                    </div>
                    <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#2563eb", wordBreak: "break-all" }}>{c.url}</a>
                    {c.notes && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 6 }}>{c.notes}</div>}
                  </div>
                </div>
                {status === "discovered" && (
                  rowResults[c.id] ? <RowResult id={c.id} /> : (
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button style={{ ...S.btnGreen, opacity: running ? 0.6 : 1 }} disabled={!!running} onClick={() => scrapeOne(c.id, "queue")}>{scrapingId === c.id ? "Scraping..." : "Scrape"}</button>
                      <button style={S.btnRed} disabled={!!running} onClick={() => reject([c.id])}>Reject</button>
                    </div>
                  )
                )}
                {(status === "ingested" || status === "failed") && (
                  rowResults[c.id] ? <RowResult id={c.id} /> : (
                    <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                      {status === "ingested" && c.conference_id && (
                        <a href={`/admin?edit=${c.conference_id}`} style={{ ...S.btnGreen, background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", color: "#f97316", textDecoration: "none", display: "inline-block" }}>Review draft</a>
                      )}
                      <button style={{ ...S.btnGreen, opacity: running ? 0.6 : 1 }} disabled={!!running} onClick={() => scrapeOne(c.id, "rescrape")}>{scrapingId === c.id ? "Re-scraping..." : "Re-scrape"}</button>
                    </div>
                  )
                )}
                {status === "all" && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>{statusLabel(c.status)}</span>
                )}
                {status === "rejected" && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>{statusLabel(c.status)}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: toast.type === "error" ? "#ef4444" : toast.type === "success" ? "#16a34a" : "#374151", color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.2)", maxWidth: 420 }}>{toast.msg}</div>
      )}
    </div>
  );
}

export default function CandidatesPage() {
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
    if (res.ok) { sessionStorage.setItem("admin_authed", "1"); setAuthed(true); }
    else setPwError("Incorrect password");
  };

  if (!authChecked) return null;
  if (authed) return <CandidatesTool />;

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
