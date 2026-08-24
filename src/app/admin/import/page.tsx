// @ts-nocheck
"use client";
import { useState, useEffect } from "react";

// Bulk URL import. Paste many conference URLs, preview + dedupe, then queue the
// new ones as approved candidates for the existing ingestion pipeline. Uses the
// existing admin login (server cookie), same as the rest of admin.

const S = {
  page: { minHeight: "100vh", background: "#f8f9fa", color: "#374151", fontFamily: "'DM Sans', -apple-system, system-ui, sans-serif", fontSize: 14 },
  header: { background: "rgba(15,23,42,0.98)", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 },
  container: { maxWidth: 900, margin: "0 auto", padding: "24px 32px" },
  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  btnPrimary: { padding: "10px 20px", borderRadius: 8, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnGreen: { padding: "10px 20px", borderRadius: 8, background: "linear-gradient(135deg, #22c55e, #16a34a)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnSecondary: { padding: "10px 16px", borderRadius: 8, background: "#f3f4f6", border: "1px solid #d1d5db", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  input: { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, fontFamily: "inherit", outline: "none" },
  textarea: { width: "100%", minHeight: 180, padding: "12px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, fontFamily: "monospace", outline: "none", resize: "vertical" },
};

const TAG = {
  new: { bg: "rgba(34,197,94,0.1)", color: "#16a34a", label: "NEW" },
  known: { bg: "rgba(100,116,139,0.12)", color: "#64748b", label: "ALREADY KNOWN" },
  duplicate: { bg: "rgba(245,158,11,0.12)", color: "#b45309", label: "DUPLICATE IN PASTE" },
  invalid: { bg: "rgba(239,68,68,0.1)", color: "#ef4444", label: "INVALID" },
};

function ImportTool({ onAuthError }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, error = false) => { setToast({ msg, error }); setTimeout(() => setToast(null), 5000); };

  const call = async (mode) => {
    setBusy(mode);
    try {
      const res = await fetch("/api/admin/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, mode }) });
      if (res.status === 401) { onAuthError(); return null; }
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Request failed", true); return null; }
      return data;
    } catch (e) { showToast("Request failed", true); return null; }
    finally { setBusy(null); }
  };

  const doPreview = async () => { const d = await call("preview"); if (d) setPreview(d); };
  const doImport = async () => {
    const d = await call("commit");
    if (d) { setPreview(d); showToast(`Queued ${d.queued} new candidate${d.queued === 1 ? "" : "s"} as approved. Run ingestion to extract pricing.`); }
  };

  const runIngest = async () => {
    setBusy("ingest");
    try {
      const res = await fetch("/api/admin/run?job=ingest", { method: "POST" });
      if (res.status === 401) { onAuthError(); return; }
      const data = await res.json();
      if (res.ok) showToast(`Ingestion run complete. Processed ${data.result?.processed ?? 0}, ${data.result?.remainingApproved ?? 0} approved remaining.`);
      else showToast(data.error || "Ingestion failed", true);
    } catch (e) { showToast("Ingestion request failed", true); }
    setBusy(null);
  };

  const c = preview?.counts;

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');`}</style>
      <div style={S.header}>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Conference<span style={{ color: "#f97316" }}>Codes</span> · Bulk Import</span>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/admin" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-block" }}>Conferences</a>
          <a href="/admin/candidates" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-block" }}>Candidates</a>
          <button style={{ ...S.btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={!!busy} onClick={runIngest}>{busy === "ingest" ? "Running..." : "Run ingestion"}</button>
        </div>
      </div>

      <div style={S.container}>
        <div style={S.card}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Paste conference URLs</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>One per line, or separated by commas or spaces. Up to 50 at a time. Blank lines are ignored. Missing https:// is added automatically.</div>
          <textarea style={S.textarea} value={text} onChange={(e) => setText(e.target.value)} placeholder={"aiconference.com\nhttps://www.ai-expo.net/europe/\nneurips.cc"} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={{ ...S.btnSecondary, opacity: busy ? 0.6 : 1 }} disabled={!!busy || !text.trim()} onClick={doPreview}>{busy === "preview" ? "Checking..." : "Preview and dedupe"}</button>
            <button style={{ ...S.btnGreen, opacity: busy || !preview || !c?.new ? 0.5 : 1 }} disabled={!!busy || !preview || !c?.new} onClick={doImport}>{busy === "commit" ? "Importing..." : `Import ${c?.new ?? 0} new`}</button>
          </div>
        </div>

        {preview && (
          <div style={S.card}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12, fontSize: 13 }}>
              <span><b>{c.parsed}</b> parsed</span>
              <span style={{ color: "#16a34a" }}><b>{c.new}</b> new</span>
              <span style={{ color: "#64748b" }}><b>{c.known}</b> already known</span>
              <span style={{ color: "#b45309" }}><b>{c.duplicate}</b> duplicate in paste</span>
              <span style={{ color: "#ef4444" }}><b>{c.invalid}</b> invalid</span>
              {preview.mode === "commit" && <span style={{ color: "#16a34a", fontWeight: 700 }}>{preview.queued} queued</span>}
            </div>
            {preview.truncated && <div style={{ fontSize: 12, color: "#b45309", marginBottom: 10 }}>Only the first {preview.maxUrls} URLs were processed. Paste the rest separately.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {preview.parsed.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                  <span style={{ flexShrink: 0, width: 130, textAlign: "center", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: "3px 6px", borderRadius: 4, background: TAG[p.status].bg, color: TAG[p.status].color }}>{TAG[p.status].label}</span>
                  <span style={{ color: "#374151", wordBreak: "break-all" }}>{p.url || p.raw}{p.reason ? ` (${p.reason})` : ""}</span>
                </div>
              ))}
            </div>
            {preview.mode === "commit" && preview.queued > 0 && (
              <div style={{ marginTop: 14, fontSize: 13, color: "#374151" }}>
                Queued as approved candidates. Click Run ingestion above to extract pricing into drafts, then review and publish in the admin.
              </div>
            )}
          </div>
        )}
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
