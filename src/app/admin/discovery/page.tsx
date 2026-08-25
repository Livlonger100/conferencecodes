// @ts-nocheck
"use client";
import { useState, useEffect } from "react";
import { discoveryYearsPhrase } from "@/lib/pipeline/config";

// Discovery: a single on-demand search form. Pick a continent, optionally a
// country, an optional year within the rolling window, and an optional
// keyword/type. Click Search to build one web-search query, run discovery for it,
// and see how many candidates were found, added, already known, or dropped as
// out-of-window. The date-window filtering is applied server-side, same as the
// scheduled discovery. Admin-authenticated. No saved sources.

const CONTINENTS = ["Any", "Africa", "Asia", "Europe", "North America", "South America", "Oceania"];
// Years the current rolling window touches, e.g. ["2026", "2027"].
const YEARS = discoveryYearsPhrase().split(" ");

const S = {
  page: { minHeight: "100vh", background: "#f8f9fa", color: "#374151", fontFamily: "'DM Sans', -apple-system, system-ui, sans-serif", fontSize: 14 },
  header: { background: "rgba(15,23,42,0.98)", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 },
  container: { maxWidth: 720, margin: "0 auto", padding: "24px 32px" },
  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  btnPrimary: { padding: "11px 22px", borderRadius: 8, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnSecondary: { padding: "8px 14px", borderRadius: 8, background: "#f3f4f6", border: "1px solid #d1d5db", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  label: { fontSize: 10, color: "#6b7280", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4, display: "block" },
  input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff" },
};

// Build a loose web-search query from the form. Country wins over continent for
// placement; keyword biases toward commercial events. Web search geo-targets
// loosely, so this is a bias, not a strict filter (strays are caught at review).
function buildQuery({ continent, country, year, keyword }) {
  const parts = ["AI"];
  const kw = keyword.trim();
  if (kw) parts.push(kw);
  else parts.push("conferences");
  const place = country.trim() || (continent !== "Any" ? continent : "");
  if (place) parts.push(place);
  if (year !== "Any") parts.push(year);
  return parts.join(" ");
}

function DiscoveryTool({ onAuthError }) {
  const [continent, setContinent] = useState("Any");
  const [country, setCountry] = useState("");
  const [year, setYear] = useState("Any");
  const [keyword, setKeyword] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, error = false) => { setToast({ msg, error }); setTimeout(() => setToast(null), 5000); };

  const query = buildQuery({ continent, country, year, keyword });
  const region = country.trim() || (continent !== "Any" ? continent : "Global");

  const search = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/run?job=discover&q=${encodeURIComponent(query)}&region=${encodeURIComponent(region)}`, { method: "POST" });
      if (res.status === 401) { onAuthError(); return; }
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Search failed", true); return; }
      const r = data.result || {};
      const found = r.candidatesFound ?? 0;
      const added = r.newInserted ?? 0;
      const outOfWindow = (r.pastDropped ?? 0) + (r.tooFarDropped ?? 0);
      const known = Math.max(0, found - outOfWindow - added);
      setResult({ query: r.query || query, found, added, known, outOfWindow });
      showToast(`Search complete. ${added} new candidate${added === 1 ? "" : "s"} added.`);
    } catch (e) { showToast("Search request failed", true); }
    finally { setRunning(false); }
  };

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');`}</style>
      <div style={S.header}>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Conference<span style={{ color: "#f97316" }}>Codes</span> · Discovery</span>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/admin" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-block" }}>Conferences</a>
          <a href="/admin/candidates" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-block" }}>Candidates</a>
        </div>
      </div>

      <div style={S.container}>
        <div style={S.card}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Search for conferences</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
            Choose where and what to look for, then run one web search. New events are added to Discovered for review. Location is a loose bias, not a strict filter, so review the results.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={S.label}>Continent</label>
              <select style={S.input} value={continent} onChange={(e) => setContinent(e.target.value)}>
                {CONTINENTS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Country (optional)</label>
              <input style={S.input} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Australia, United Kingdom" />
            </div>
            <div>
              <label style={S.label}>Year</label>
              <select style={S.input} value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="Any">Any / all upcoming</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Keyword / type (optional)</label>
              <input style={S.input} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder='e.g. summit, expo, enterprise AI' />
            </div>
          </div>

          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 14 }}>
            Search query: <span style={{ fontFamily: "monospace", color: "#111827" }}>{query}</span>
            {year === "Any" && <span> (across the full upcoming window)</span>}
          </div>

          <button style={{ ...S.btnPrimary, opacity: running ? 0.6 : 1 }} disabled={running} onClick={search}>
            {running ? "Searching..." : "Search"}
          </button>
        </div>

        {result && (
          <div style={S.card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 10 }}>Result</div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, marginBottom: 12 }}>
              <span><b>{result.found}</b> found</span>
              <span style={{ color: "#16a34a", fontWeight: 700 }}>{result.added} new</span>
              <span style={{ color: "#64748b" }}><b>{result.known}</b> already known</span>
              <span style={{ color: "#b45309" }}><b>{result.outOfWindow}</b> out of window</span>
            </div>
            {result.added > 0 ? (
              <a href="/admin/candidates" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-block" }}>View {result.added} new candidate{result.added === 1 ? "" : "s"}</a>
            ) : (
              <div style={{ fontSize: 12, color: "#6b7280" }}>Nothing new to add. Try a different continent, country, year, or keyword.</div>
            )}
          </div>
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
