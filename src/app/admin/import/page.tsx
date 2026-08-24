// @ts-nocheck
"use client";
import { useState, useEffect } from "react";

// Bulk URL import. Paste conference URLs, one click dedupes and queues the new
// ones as approved candidates, then one clearly-labeled ingestion button drains
// the approved queue with live progress and a completion summary. Everything
// still feeds the existing review/publish gate. Uses the existing admin login.

const S = {
  page: { minHeight: "100vh", background: "#f8f9fa", color: "#374151", fontFamily: "'DM Sans', -apple-system, system-ui, sans-serif", fontSize: 14 },
  header: { background: "rgba(15,23,42,0.98)", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 },
  container: { maxWidth: 900, margin: "0 auto", padding: "24px 32px" },
  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  btnPrimary: { padding: "11px 22px", borderRadius: 8, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnGreen: { padding: "11px 22px", borderRadius: 8, background: "linear-gradient(135deg, #22c55e, #16a34a)", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnSecondary: { padding: "10px 16px", borderRadius: 8, background: "#f3f4f6", border: "1px solid #d1d5db", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  input: { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, fontFamily: "inherit", outline: "none" },
  textarea: { width: "100%", minHeight: 170, padding: "12px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, fontFamily: "monospace", outline: "none", resize: "vertical" },
};

const TAG = {
  new: { bg: "rgba(34,197,94,0.1)", color: "#16a34a", label: "QUEUED" },
  known: { bg: "rgba(100,116,139,0.12)", color: "#64748b", label: "ALREADY KNOWN" },
  duplicate: { bg: "rgba(245,158,11,0.12)", color: "#b45309", label: "DUPLICATE IN PASTE" },
  invalid: { bg: "rgba(239,68,68,0.1)", color: "#ef4444", label: "INVALID" },
};

const MAX_ROUNDS = 30;

function ImportTool({ onAuthError }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(null);
  const [ingest, setIngest] = useState(null); // { running, ingested, failed, remaining, done }
  const [toast, setToast] = useState(null);

  const showToast = (msg, error = false) => { setToast({ msg, error }); setTimeout(() => setToast(null), 6000); };

  // One action: dedupe + queue the new URLs (commit). Shows the tags as result.
  const queueUrls = async () => {
    setBusy("queue");
    try {
      const res = await fetch("/api/admin/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, mode: "commit" }) });
      if (res.status === 401) { onAuthError(); return; }
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Import failed", true); return; }
      setResult(data);
      setIngest(null);
      showToast(`Queued ${data.queued} new candidate${data.queued === 1 ? "" : "s"}.`);
    } catch (e) { showToast("Request failed", true); }
    finally { setBusy(null); }
  };

  // Drain the approved queue in batches, showing live progress + a final summary.
  const ingestAll = async () => {
    setBusy("ingest");
    let ingested = 0, failed = 0, remaining = null;
    setIngest({ running: true, ingested, failed, remaining: null, done: false });
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const res = await fetch("/api/admin/run?job=ingest", { method: "POST" });
        if (res.status === 401) { onAuthError(); return; }
        const data = await res.json();
        if (!res.ok) { showToast(data.error || "Ingestion failed", true); break; }
        const r = data.result || {};
        const results = r.results || [];
        ingested += results.filter((x) => x.status === "ingested").length;
        failed += results.filter((x) => x.status === "failed").length;
        remaining = r.remainingApproved ?? 0;
        setIngest({ running: true, ingested, failed, remaining, done: false });
        if (remaining === 0 || (r.processed ?? 0) === 0) break;
      }
      setIngest({ running: false, ingested, failed, remaining: remaining ?? 0, done: true });
      showToast(`Ingestion complete. ${ingested} scraped into drafts, ${failed} failed.`);
    } catch (e) {
      showToast("Ingestion request failed", true);
      setIngest((s) => (s ? { ...s, running: false, done: true } : null));
    } finally { setBusy(null); }
  };

  const counts = result?.counts;

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');`}</style>
      <div style={S.header}>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Conference<span style={{ color: "#f97316" }}>Codes</span> · Bulk Import</span>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/admin" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-block" }}>Conferences</a>
          <a href="/admin/candidates" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-block" }}>Candidates</a>
        </div>
      </div>

      <div style={S.container}>
        {/* Step 1: paste + queue in one click */}
        <div style={S.card}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>1. Paste conference URLs</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>One per line, or separated by commas or spaces. Up to 50 at a time. Blank lines are ignored. Missing https:// is added. New URLs are deduped on domain against existing conferences and candidates, then queued.</div>
          <textarea style={S.textarea} value={text} onChange={(e) => setText(e.target.value)} placeholder={"aiconference.com\nhttps://www.ai-expo.net/europe/\nneurips.cc"} />
          <div style={{ marginTop: 12 }}>
            <button style={{ ...S.btnPrimary, opacity: busy || !text.trim() ? 0.6 : 1 }} disabled={!!busy || !text.trim()} onClick={queueUrls}>{busy === "queue" ? "Queuing..." : "Dedupe and queue new URLs"}</button>
          </div>
        </div>

        {/* Result of queue */}
        {result && (
          <div style={S.card}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12, fontSize: 13 }}>
              <span><b>{counts.parsed}</b> parsed</span>
              <span style={{ color: "#16a34a", fontWeight: 700 }}>{result.queued} queued</span>
              <span style={{ color: "#64748b" }}><b>{counts.known}</b> already known</span>
              <span style={{ color: "#b45309" }}><b>{counts.duplicate}</b> duplicate in paste</span>
              <span style={{ color: "#ef4444" }}><b>{counts.invalid}</b> invalid</span>
            </div>
            {result.truncated && <div style={{ fontSize: 12, color: "#b45309", marginBottom: 10 }}>Only the first {result.maxUrls} URLs were processed. Paste the rest separately.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {result.parsed.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                  <span style={{ flexShrink: 0, width: 130, textAlign: "center", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: "3px 6px", borderRadius: 4, background: TAG[p.status].bg, color: TAG[p.status].color }}>{TAG[p.status].label}</span>
                  <span style={{ color: "#374151", wordBreak: "break-all" }}>{p.url || p.raw}{p.reason ? ` (${p.reason})` : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: ingest with visible progress */}
        <div style={S.card}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>2. Ingest approved candidates</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>Runs Firecrawl pricing extraction on every approved candidate (these plus any already approved), in batches, into drafts. This can take a minute or two. Leave this tab open.</div>
          <button style={{ ...S.btnGreen, opacity: busy ? 0.6 : 1 }} disabled={!!busy} onClick={ingestAll}>{busy === "ingest" ? "Ingesting..." : "Run ingestion now"}</button>

          {ingest && (
            <div style={{ marginTop: 14, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: ingest.done ? "#16a34a" : "#f97316", marginBottom: 6 }}>
                {ingest.running ? "Ingesting..." : "Ingestion complete"}
              </div>
              <div style={{ fontSize: 13, color: "#374151" }}>
                {ingest.ingested} scraped into drafts, {ingest.failed} failed{ingest.remaining != null ? `, ${ingest.remaining} approved remaining` : ""}.
              </div>
              {ingest.done && (
                <a href="/admin" style={{ ...S.btnSecondary, display: "inline-block", textDecoration: "none", marginTop: 12 }}>Review drafts in admin</a>
              )}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: toast.error ? "#ef4444" : "#16a34a", color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.2)", maxWidth: 380 }}>{toast.msg}</div>
      )}
    </div>
  );
}

export default function ImportPage() {
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
  if (authed) return <ImportTool onAuthError={handleAuthError} />;

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
