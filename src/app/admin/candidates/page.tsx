// @ts-nocheck
"use client";
import { useState, useEffect } from "react";

// Approval gate UI (Task 3). Lists discovered candidates and lets you approve or
// reject them (single or bulk). Also provides protected manual triggers for the
// discovery and ingestion workers. Reuses the existing admin password gate.

const STATUSES = ["discovered", "approved", "rejected", "ingested", "failed", "all"];

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

  const showToast = (msg, type = "info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); };

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

  useEffect(() => { load(status); /* eslint-disable-next-line */ }, [status]);

  const act = async (ids, action) => {
    if (ids.length === 0) return;
    const res = await fetch("/api/candidates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action }),
    });
    const data = await res.json();
    const label = action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Requeued for ingestion";
    if (res.ok) { showToast(`${label}: ${data.updated}`, "success"); load(status); }
    else showToast(data.error || "Action failed", "error");
  };

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  // Triggers run through the admin-authenticated endpoint (uses the login cookie),
  // so no worker secret is needed in the UI.
  const runJob = async (job) => {
    setRunning(job);
    try {
      if (job === "ingest") {
        // Drain the approved queue batch by batch (each call respects the
        // per-batch size for the serverless timeout), with live progress.
        let ingested = 0, failed = 0, remaining = null;
        setProgress("Ingesting...");
        for (let round = 0; round < 40; round++) {
          const res = await fetch(`/api/admin/run?job=ingest`, { method: "POST" });
          if (res.status === 401) { sessionStorage.removeItem("admin_authed"); showToast("Session expired, please sign in again", "error"); setTimeout(() => location.reload(), 1200); return; }
          const data = await res.json();
          if (!res.ok) { showToast(data.error || "ingestion failed", "error"); break; }
          const r = data.result || {};
          const rs = r.results || [];
          ingested += rs.filter((x) => x.status === "ingested").length;
          failed += rs.filter((x) => x.status === "failed").length;
          remaining = r.remainingApproved ?? 0;
          setProgress(`Ingesting... ${ingested} into drafts, ${failed} failed, ${remaining} approved remaining`);
          if (remaining === 0 || (r.processed ?? 0) === 0) break;
        }
        setProgress(null);
        showToast(`Ingestion complete. ${ingested} into drafts, ${failed} failed, ${remaining ?? 0} remaining.`, "success");
        load(status);
      } else {
        const res = await fetch(`/api/admin/run?job=${job}`, { method: "POST" });
        if (res.status === 401) { sessionStorage.removeItem("admin_authed"); showToast("Session expired, please sign in again", "error"); setTimeout(() => location.reload(), 1200); return; }
        const data = await res.json();
        if (res.ok) { showToast(`${job} run complete`, "success"); load(status); }
        else showToast(data.error || `${job} failed`, "error");
      }
    } catch (e) { showToast(`${job} request failed`, "error"); }
    setRunning(null);
  };

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');`}</style>
      <div style={S.header}>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Conference<span style={{ color: "#f97316" }}>Codes</span> · Candidates</span>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/admin" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-block" }}>Conferences</a>
          <a href="/admin/import" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-block" }}>Bulk Import</a>
          <a href="/admin/discovery" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-block" }}>Discovery</a>
          <button style={{ ...S.btnSecondary, opacity: running ? 0.6 : 1 }} disabled={!!running} onClick={() => runJob("discover")}>{running === "discover" ? "Running..." : "Run discovery"}</button>
          <button style={{ ...S.btnPrimary, opacity: running ? 0.6 : 1 }} disabled={!!running} onClick={() => runJob("ingest")}>{running === "ingest" ? "Running..." : "Run ingestion"}</button>
        </div>
      </div>
      {progress && (
        <div style={{ background: "#fff7ed", borderBottom: "1px solid rgba(249,115,22,0.25)", color: "#9a3412", fontSize: 13, fontWeight: 600, padding: "8px 32px" }}>{progress}</div>
      )}

      <div style={S.container}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {STATUSES.map((st) => (
            <button key={st} style={S.tab(status === st)} onClick={() => setStatus(st)}>
              {st}{counts[st] != null ? ` (${counts[st]})` : ""}
            </button>
          ))}
        </div>

        {status === "discovered" && candidates.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <button style={S.btnGreen} onClick={() => act([...selected], "approve")} disabled={selected.size === 0}>Approve selected ({selected.size})</button>
            <button style={S.btnRed} onClick={() => act([...selected], "reject")} disabled={selected.size === 0}>Reject selected</button>
            <button style={S.btnSecondary} onClick={() => setSelected(new Set(candidates.map((c) => c.id)))}>Select all</button>
            <button style={S.btnSecondary} onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}

        {status === "failed" && candidates.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <button style={S.btnGreen} onClick={() => act([...selected], "retry")} disabled={selected.size === 0}>Retry selected ({selected.size})</button>
            <button style={S.btnSecondary} onClick={() => setSelected(new Set(candidates.map((c) => c.id)))}>Select all</button>
            <button style={S.btnSecondary} onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading...</div>
        ) : candidates.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>No {status} candidates.</div>
        ) : (
          candidates.map((c) => (
            <div key={c.id} style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div style={{ display: "flex", gap: 12, flex: 1, minWidth: 0 }}>
                  {(status === "discovered" || status === "failed") && (
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
                    {c.tier_used && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>tier: {c.tier_used}</div>}
                  </div>
                </div>
                {status === "discovered" && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button style={S.btnGreen} onClick={() => act([c.id], "approve")}>Approve</button>
                    <button style={S.btnRed} onClick={() => act([c.id], "reject")}>Reject</button>
                  </div>
                )}
                {status === "failed" && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                    <button style={S.btnGreen} onClick={() => act([c.id], "retry")}>Retry</button>
                  </div>
                )}
                {status !== "discovered" && status !== "failed" && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>{c.status}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: toast.type === "error" ? "#ef4444" : toast.type === "success" ? "#16a34a" : "#374151", color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>{toast.msg}</div>
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
