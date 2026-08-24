// @ts-nocheck
"use client";
import { useState, useEffect } from "react";

// Side-by-side pricing review for pipeline-ingested DRAFT conferences.
// Nothing scraped is public until approved here. Uses the existing admin login
// (a server cookie is set at login), so job triggers and approvals need no
// worker secret.

const S = {
  page: { minHeight: "100vh", background: "#f8f9fa", color: "#374151", fontFamily: "'DM Sans', -apple-system, system-ui, sans-serif", fontSize: 14 },
  header: { background: "rgba(15,23,42,0.98)", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 },
  container: { maxWidth: 1100, margin: "0 auto", padding: "24px 32px" },
  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  btnPrimary: { padding: "9px 18px", borderRadius: 8, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnGreen: { padding: "9px 18px", borderRadius: 8, background: "linear-gradient(135deg, #22c55e, #16a34a)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnSecondary: { padding: "9px 16px", borderRadius: 8, background: "#f3f4f6", border: "1px solid #d1d5db", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { padding: "6px 10px", borderRadius: 6, background: "none", border: "none", color: "#ef4444", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  label: { fontSize: 10, color: "#6b7280", fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 4, display: "block" },
  input: { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, fontFamily: "inherit", outline: "none" },
  inputSm: { width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, fontFamily: "inherit", outline: "none" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  grid4: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 },
};

function confColor(v) {
  if (v == null) return "#6b7280";
  if (v >= 0.7) return "#16a34a";
  if (v >= 0.5) return "#f59e0b";
  return "#ef4444";
}

function ReviewCard({ conf, onDone, onAuthError }) {
  const [form, setForm] = useState(() => ({
    name: conf.name || "",
    description: conf.description || "",
    city: conf.city || "",
    country: conf.country || "",
    start_date: conf.start_date || "",
    end_date: conf.end_date || "",
    source_url: conf.source_url || "",
    pricing: (conf.pricing_tiers || []).map((t) => ({
      tier_name: t.tier_name || "",
      price: t.price == null ? "" : t.price,
      currency: t.currency || "USD",
      is_early_bird: !!t.is_early_bird,
      early_bird_start: t.early_bird_start || "",
      early_bird_end: t.early_bird_end || "",
      deadline: t.deadline || "",
    })),
  }));
  const [saving, setSaving] = useState(false);

  const u = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const uTier = (i, k, v) => setForm((f) => { const p = [...f.pricing]; p[i] = { ...p[i], [k]: v }; return { ...f, pricing: p }; });
  const addTier = () => setForm((f) => ({ ...f, pricing: [...f.pricing, { tier_name: "", price: "", currency: "USD", is_early_bird: false, early_bird_start: "", early_bird_end: "", deadline: "" }] }));
  const removeTier = (i) => setForm((f) => ({ ...f, pricing: f.pricing.filter((_, idx) => idx !== i) }));

  const save = async (action) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: conf.id, action, ...form }),
      });
      if (res.status === 401) { onAuthError(); return; }
      const data = await res.json();
      if (res.ok) onDone(action === "approve" ? `Approved and published: ${form.name}` : `Saved draft: ${form.name}`);
      else onDone(`Error: ${data.error || "save failed"}`, true);
    } catch (e) {
      onDone("Request failed", true);
    }
    setSaving(false);
  };

  return (
    <div style={S.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#111827" }}>{form.name || "(untitled)"}</div>
          <a href={form.source_url} target="_blank" rel="noopener noreferrer" style={{ ...S.btnSecondary, display: "inline-block", textDecoration: "none", marginTop: 8 }}>
            Open official site to compare
          </a>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: confColor(conf.confidence) }}>
            {conf.confidence == null ? "n/a" : `${Math.round(conf.confidence * 100)}%`}
          </div>
          <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, letterSpacing: 0.5 }}>CONFIDENCE</div>
          {conf.candidate?.tier_used && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>method: {conf.candidate.tier_used}</div>}
        </div>
      </div>

      {conf.extraction_notes && (
        <div style={{ background: "#fff7ed", border: "1px solid rgba(249,115,22,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#9a3412" }}>
          {conf.extraction_notes}
        </div>
      )}

      <div style={{ ...S.grid2, marginBottom: 10 }}>
        <div><label style={S.label}>Name</label><input style={S.input} value={form.name} onChange={(e) => u("name", e.target.value)} /></div>
        <div><label style={S.label}>Official URL</label><input style={S.input} value={form.source_url} onChange={(e) => u("source_url", e.target.value)} /></div>
      </div>
      <div style={{ ...S.grid4, marginBottom: 10 }}>
        <div><label style={S.label}>Start date</label><input type="date" style={S.input} value={form.start_date} onChange={(e) => u("start_date", e.target.value)} /></div>
        <div><label style={S.label}>End date</label><input type="date" style={S.input} value={form.end_date} onChange={(e) => u("end_date", e.target.value)} /></div>
        <div><label style={S.label}>City</label><input style={S.input} value={form.city} onChange={(e) => u("city", e.target.value)} /></div>
        <div><label style={S.label}>Country</label><input style={S.input} value={form.country} onChange={(e) => u("country", e.target.value)} /></div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={S.label}>Description</label>
        <textarea style={{ ...S.input, minHeight: 56, resize: "vertical" }} value={form.description} onChange={(e) => u("description", e.target.value)} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>Pricing tiers ({form.pricing.length})</div>
        <button style={S.btnSecondary} onClick={addTier}>+ Add tier</button>
      </div>
      {form.pricing.map((t, i) => (
        <div key={i} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8, marginBottom: 8 }}>
            <div><label style={S.label}>Tier name</label><input style={S.inputSm} value={t.tier_name} onChange={(e) => uTier(i, "tier_name", e.target.value)} /></div>
            <div><label style={S.label}>Price</label><input type="number" style={S.inputSm} value={t.price} onChange={(e) => uTier(i, "price", e.target.value)} /></div>
            <div><label style={S.label}>Currency</label><input style={S.inputSm} value={t.currency} onChange={(e) => uTier(i, "currency", e.target.value.toUpperCase())} /></div>
            <div style={{ display: "flex", alignItems: "flex-end" }}><button style={S.btnGhost} onClick={() => removeTier(i)}>Remove</button></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr", gap: 8, alignItems: "end" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151", paddingBottom: 6 }}>
              <input type="checkbox" checked={t.is_early_bird} onChange={(e) => uTier(i, "is_early_bird", e.target.checked)} /> Early bird
            </label>
            <div><label style={S.label}>EB start</label><input type="date" style={S.inputSm} value={t.early_bird_start} onChange={(e) => uTier(i, "early_bird_start", e.target.value)} /></div>
            <div><label style={S.label}>EB end</label><input type="date" style={S.inputSm} value={t.early_bird_end} onChange={(e) => uTier(i, "early_bird_end", e.target.value)} /></div>
            <div><label style={S.label}>Deadline</label><input type="date" style={S.inputSm} value={t.deadline} onChange={(e) => uTier(i, "deadline", e.target.value)} /></div>
          </div>
        </div>
      ))}
      {form.pricing.length === 0 && <div style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic", marginBottom: 8 }}>No tiers captured. Add tiers from the official site before approving.</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
        <button style={{ ...S.btnSecondary, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={() => save("draft")}>Save, keep as draft</button>
        <button style={{ ...S.btnGreen, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={() => save("approve")}>Approve and publish</button>
      </div>
    </div>
  );
}

function ReviewTool({ onAuthError }) {
  const [conferences, setConferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [running, setRunning] = useState(null);

  const showToast = (msg, error = false) => { setToast({ msg, error }); setTimeout(() => setToast(null), 4000); };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/review");
      if (res.status === 401) { onAuthError(); return; }
      const data = await res.json();
      setConferences(data.conferences || []);
    } catch (e) { showToast("Failed to load", true); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const runJob = async (job) => {
    setRunning(job);
    try {
      const res = await fetch(`/api/admin/run?job=${job}`, { method: "POST" });
      if (res.status === 401) { onAuthError(); return; }
      const data = await res.json();
      if (res.ok) { showToast(`${job} complete`); load(); }
      else showToast(data.error || `${job} failed`, true);
    } catch (e) { showToast(`${job} request failed`, true); }
    setRunning(null);
  };

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');`}</style>
      <div style={S.header}>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Conference<span style={{ color: "#f97316" }}>Codes</span> · Review</span>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/admin" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-block" }}>Conferences</a>
          <a href="/admin/candidates" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-block" }}>Candidates</a>
          <button style={{ ...S.btnSecondary, opacity: running ? 0.6 : 1 }} disabled={!!running} onClick={() => runJob("discover")}>{running === "discover" ? "Running..." : "Run discovery"}</button>
          <button style={{ ...S.btnPrimary, opacity: running ? 0.6 : 1 }} disabled={!!running} onClick={() => runJob("ingest")}>{running === "ingest" ? "Running..." : "Run ingestion"}</button>
        </div>
      </div>

      <div style={S.container}>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
          {loading ? "Loading..." : `${conferences.length} pipeline draft${conferences.length === 1 ? "" : "s"} awaiting review. Scraped data is not public until you approve it.`}
        </div>
        {!loading && conferences.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>No drafts awaiting review.</div>
        )}
        {conferences.map((c) => (
          <ReviewCard key={c.id} conf={c} onAuthError={onAuthError} onDone={(msg, err) => { showToast(msg, err); if (!err) load(); }} />
        ))}
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: toast.error ? "#ef4444" : "#16a34a", color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>{toast.msg}</div>
      )}
    </div>
  );
}

export default function ReviewPage() {
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

  // Called when an admin API returns 401 (e.g. cookie missing/expired): force a
  // clean re-login, which sets the server cookie.
  const handleAuthError = () => { sessionStorage.removeItem("admin_authed"); setAuthed(false); setPwError("Please sign in again to continue."); };

  if (!authChecked) return null;
  if (authed) return <ReviewTool onAuthError={handleAuthError} />;

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
