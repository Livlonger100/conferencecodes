// @ts-nocheck
"use client";
import { useState, useEffect, Fragment } from "react";
import { useAdminAuth, AuthBadge, SignInOverlay } from "./authUi";

// ============================================================
// ConferenceCodes Admin Tool — Next.js + Supabase
// ============================================================

const TODAY = new Date().toISOString().split("T")[0];

// Region is auto-derived from country (kept in the background, not shown in the form).
function regionFromCountry(country) {
  const c = (country || "").toLowerCase().trim();
  if (!c) return "Other";
  const NA = ["united states", "usa", "us", "u.s.", "u.s.a.", "america", "canada", "mexico"];
  const EU = ["united kingdom", "uk", "u.k.", "england", "scotland", "wales", "ireland", "france", "germany", "spain", "portugal", "italy", "netherlands", "the netherlands", "holland", "switzerland", "sweden", "norway", "denmark", "finland", "iceland", "poland", "austria", "belgium", "czech republic", "czechia", "greece", "hungary", "romania"];
  const ASIA = ["singapore", "japan", "china", "india", "south korea", "korea", "hong kong", "taiwan", "thailand", "vietnam", "malaysia", "indonesia", "philippines", "pakistan", "bangladesh", "sri lanka", "nepal", "mongolia", "kazakhstan"];
  const has = (list) => list.some((x) => c === x || c.includes(x));
  if (has(NA)) return "North America";
  if (has(EU)) return "Europe";
  if (has(ASIA)) return "Asia";
  return "Other";
}

// Money formatting for no-spinner price inputs: store a plain number, show it
// formatted with the tier currency (whole amounts, no decimals).
const CUR_SYMBOL = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", INR: "₹", AUD: "A$", CAD: "C$", SGD: "S$", NZD: "NZ$", HKD: "HK$", CHF: "CHF ", AED: "AED ", ZAR: "R", BRL: "R$", CNY: "¥", KRW: "₩", MXN: "MX$", SEK: "kr ", NOK: "kr ", DKK: "kr " };
function fmtMoney(n, cur) {
  if (n == null || n === "") return "";
  const num = Number(n);
  if (Number.isNaN(num)) return "";
  return (CUR_SYMBOL[cur] || "") + num.toLocaleString("en-US");
}
function parseMoney(s) {
  const digits = String(s).replace(/[^0-9]/g, "");
  return digits === "" ? null : parseInt(digits, 10);
}
function parseIntOrNull(s) {
  const digits = String(s).replace(/[^0-9]/g, "");
  return digits === "" ? null : parseInt(digits, 10);
}

// Transform DB row to admin tool format
function transformConference(c: any) {
  return {
    id: c.id,
    created_at: c.created_at,
    name: c.name,
    slug: c.slug,
    organizer: c.organizer || "",
    description: c.description || "",
    category: c.category || "AI / Tech",
    format: c.format || "In-person",
    language: c.language || "English",
    status: c.status || "draft",
    start: c.start_date || "",
    end: c.end_date || "",
    city: c.city || "",
    country: c.country || "",
    region: c.region || "North America",
    venue: c.venue || "",
    attendees: c.attendees || null,
    confidence: c.confidence || null,
    speakers: c.speakers || [],
    tags: c.tags || [],
    source_url: c.source_url || "",
    registration_url: c.registration_url || "",
    extraction_notes: c.extraction_notes || "",
    discount_code: c.discount_code || "",
    discount_pct: c.discount_pct || 0,
    discount_type: c.discount_type || "percentage",
    discount_max_uses: c.discount_max_uses || null,
    discount_uses: c.discount_uses || 0,
    organizer_contact: {
      name: c.contact_name || "",
      role: c.contact_role || "",
      email: c.contact_email || "",
      phone: c.contact_phone || "",
      website: c.contact_website || "",
      outreach_status: c.outreach_status || "not_contacted",
      affiliate: c.affiliate || "unknown",
      affiliate_details: c.affiliate_details || "",
      affiliate_url: c.affiliate_url || "",
      notes: c.outreach_notes || "",
    },
    pricing: (c.pricing_tiers || []).sort((a: any, b: any) => (a.sort_order||0) - (b.sort_order||0)).map((t: any) => ({
      id: t.id,
      tier: t.tier_name || "",
      price: t.price != null ? parseFloat(t.price) : null,
      price_after_deadline: t.price_after_deadline != null ? parseFloat(t.price_after_deadline) : null,
      currency: t.currency || "USD",
      deadline: t.deadline || "",
      early_bird_start: t.early_bird_start || "",
      early_bird_end: t.early_bird_end || "",
      days_included: t.days_included || "",
      notes: t.notes || "",
      deadline_passed: t.deadline_passed || false,
      requires_approval: t.requires_approval || false,
      sold_out: t.sold_out || false,
      is_early_bird: t.is_early_bird || false,
    })),
    hotels: (c.hotels || []).map((h: any) => ({
      id: h.id,
      name: h.name || "",
      stars: h.stars || 3,
      confRate: h.conf_rate ? parseFloat(h.conf_rate) : null,
      rackRate: h.rack_rate ? parseFloat(h.rack_rate) : null,
      bookBy: h.book_by || "",
      distance: h.distance || "",
      url: h.url || "",
    })),
  };
}

function toDbFormat(conf: any) {
  return {
    id: conf.id,
    name: conf.name,
    organizer: conf.organizer,
    description: conf.description,
    category: conf.category,
    format: conf.format,
    language: conf.language || "English",
    status: conf.status,
    start_date: conf.start || null,
    end_date: conf.end || null,
    city: conf.city,
    country: conf.country,
    region: regionFromCountry(conf.country) || conf.region,
    venue: conf.venue,
    attendees: conf.attendees ? parseInt(conf.attendees) : null,
    confidence: conf.confidence ? parseFloat(conf.confidence) : null,
    speakers: conf.speakers || [],
    tags: conf.tags || [],
    source_url: conf.source_url,
    registration_url: conf.registration_url,
    extraction_notes: conf.extraction_notes,
    discount_code: conf.discount_code,
    discount_pct: conf.discount_pct || 0,
    discount_type: conf.discount_type || "percentage",
    discount_max_uses: conf.discount_max_uses || null,
    discount_uses: conf.discount_uses || 0,
    contact_name: conf.organizer_contact?.name || "",
    contact_role: conf.organizer_contact?.role || "",
    contact_email: conf.organizer_contact?.email || "",
    contact_phone: conf.organizer_contact?.phone || "",
    contact_website: conf.organizer_contact?.website || "",
    outreach_status: conf.organizer_contact?.outreach_status || "not_contacted",
    affiliate: conf.organizer_contact?.affiliate || "unknown",
    affiliate_details: conf.organizer_contact?.affiliate_details || "",
    affiliate_url: conf.organizer_contact?.affiliate_url || "",
    outreach_notes: conf.organizer_contact?.notes || "",
    pricing: (conf.pricing || []).map((t: any, i: number) => ({
      tier_name: t.tier || "",
      price: t.price,
      price_after_deadline: t.price_after_deadline || null,
      currency: t.currency || "USD",
      deadline: t.deadline || null,
      early_bird_start: t.early_bird_start || null,
      early_bird_end: t.early_bird_end || null,
      days_included: t.days_included || "",
      notes: t.notes || "",
      deadline_passed: t.deadline_passed || false,
      requires_approval: t.requires_approval || false,
      sold_out: t.sold_out || false,
      is_early_bird: t.is_early_bird || false,
      sort_order: i,
    })),
    hotels: (conf.hotels || []).map((h: any) => ({
      name: h.name || "",
      stars: h.stars || 3,
      conf_rate: h.confRate || null,
      rack_rate: h.rackRate || null,
      book_by: h.bookBy || null,
      distance: h.distance || "",
      url: h.url || "",
    })),
  };
}

async function loadConferencesAsync() {
  try {
    const res = await fetch("/api/conferences");
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.map(transformConference);
  } catch (e) {
    console.error("Load failed:", e);
    return [];
  }
}

async function saveConferenceToDb(conf: any, isNew: boolean) {
  const body = toDbFormat(conf);
  if (isNew) {
    const res = await fetch("/api/conferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } else {
    const res = await fetch("/api/conferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  }
}

async function deleteConferenceFromDb(id: string) {
  const res = await fetch(`/api/conferences?id=${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// Status color map
const STATUS_COLORS = {
  active: { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)", text: "#22c55e" },
  draft: { bg: "rgba(249,115,22,0.1)", border: "rgba(249,115,22,0.3)", text: "#f97316" },
  expired: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", text: "#ef4444" },
  sold_out: { bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.4)", text: "#ef4444" },
  archived: { bg: "rgba(100,116,139,0.1)", border: "rgba(100,116,139,0.3)", text: "#64748b" },
};

// Extraction now runs entirely through the shared pipeline at /api/extract
// (Firecrawl fetch + shared extraction prompt + grounding gate + pricing-page
// finder), the same route Scrape / Bulk Import / Re-scrape use. There is no
// longer a separate Add New prompt or fetch here.

// ============================================================
// MAIN APP
// ============================================================
  const ConferenceForm = ({ initial, onSave, onCancel, isNew, saving, S }: any) => {
    const [form, setForm] = useState(initial);
    const u = (field, value) => setForm(f => ({ ...f, [field]: value }));

    const _eventEnd = form.end || form.start || "";
    const isPastDated = !!_eventEnd && _eventEnd < TODAY;
    const publish = () => {
      if (isPastDated && !window.confirm("This event date is in the past. Publishing will make a past event public on the site. Publish anyway?")) return;
      onSave({ ...form, status: "active" }, isNew);
    };

    const updatePricing = (index, field, value) => {
      const p = [...(form.pricing || [])];
      p[index] = { ...p[index], [field]: value };
      setForm(f => ({ ...f, pricing: p }));
    };
    const addPricingTier = () => {
      setForm(f => ({ ...f, pricing: [...(f.pricing || []), { id: `tier_${Date.now()}`, tier: "Standard", price: null, price_after_deadline: null, currency: "USD", deadline: null, deadline_passed: false, days_included: "", requires_approval: false, sold_out: false, is_early_bird: false, notes: "" }] }));
    };
    const removePricingTier = (index) => {
      setForm(f => ({ ...f, pricing: (f.pricing || []).filter((_, i) => i !== index) }));
    };

    const CURRENCIES = ["USD","EUR","GBP","AUD","CAD","SGD","INR","JPY","CHF","AED","BRL","CNY","DKK","HKD","KRW","MXN","NOK","NZD","SEK","ZAR"];
    const currentStatus = form.status || "draft";

    return (
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        {/* Toolbar: item 7 status + actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111827", margin: 0 }}>{isNew ? "Add Conference" : (form.name || "Edit")}</h2>
            <span style={{ ...S.tag, background: currentStatus === "active" ? "rgba(34,197,94,0.12)" : "rgba(249,115,22,0.12)", color: currentStatus === "active" ? "#16a34a" : "#f97316" }}>{currentStatus.toUpperCase()}</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {!isNew && (
              <button onClick={() => { if (confirm(`Delete "${form.name}"? This cannot be undone.`)) onSave({ ...form, _delete: true }, false); }} style={{ ...S.btnSecondary, color: "#ef4444", borderColor: "rgba(239,68,68,0.3)" }}>Delete</button>
            )}
            <button onClick={onCancel} style={S.btnSecondary}>Cancel</button>
            <button onClick={() => onSave(form, isNew)} disabled={saving} style={{ ...S.btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving..." : isNew ? "Save Draft" : "Save"}</button>
            {(isNew || currentStatus === "draft") && (
              <>
                {isPastDated && <span style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700, alignSelf: "center" }}>Past event, confirm to publish</span>}
                <button onClick={publish} disabled={saving} style={{ ...S.btnPrimary, background: isPastDated ? "#9ca3af" : "linear-gradient(135deg, #22c55e, #16a34a)", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving..." : "Publish"}</button>
              </>
            )}
            {!isNew && currentStatus === "active" && (
              <button onClick={() => onSave({ ...form, status: "draft" }, false)} disabled={saving} style={{ ...S.btnPrimary, background: "linear-gradient(135deg, #f97316, #ea580c)", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving..." : "Unpublish"}</button>
            )}
          </div>
        </div>

        {/* 0. Academic-likely triage badge */}
        {/ACADEMIC LIKELY/i.test(form.extraction_notes || "") && (
          <div style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.4)", borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#9333ea", letterSpacing: 0.5 }}>ACADEMIC LIKELY</span>
            <span style={{ fontSize: 12, color: "#6b21a8" }}>{((form.extraction_notes || "").match(/ACADEMIC LIKELY[^\n]*/i) || [""])[0].replace(/^ACADEMIC LIKELY[^:]*:\s*/i, "")}</span>
          </div>
        )}

        {/* 1. Grounding evidence + compare link (replaces self-reported confidence) */}
        {(form.extraction_notes || form.source_url) && (
          <div style={{ ...S.card, background: "rgba(249,115,22,0.05)", border: "1px solid rgba(249,115,22,0.2)", marginBottom: 12, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Grounding evidence</span>
              <a href={form.source_url || "#"} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}>Open official site to compare</a>
            </div>
            {form.extraction_notes && <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, marginTop: 8, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace" }}>{form.extraction_notes}</div>}
          </div>
        )}

        {/* 2-6. Essentials */}
        <div style={{ ...S.card, padding: 16 }}>
          <div style={{ marginBottom: 10 }}>
            <label style={S.label}>Conference Name</label>
            <input style={S.input} value={form.name || ""} onChange={e => u("name", e.target.value)} placeholder="e.g. The AI Summit Singapore" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={S.label}>City (include state/province for USA)</label>
              <input style={S.input} value={form.city || ""} onChange={e => u("city", e.target.value)} placeholder="e.g. Austin, TX" />
            </div>
            <div>
              <label style={S.label}>Country</label>
              <input style={S.input} value={form.country || ""} onChange={e => u("country", e.target.value)} placeholder="e.g. USA" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={S.label}>Start Date</label>
              <input style={S.input} type="date" value={form.start || ""} onChange={e => u("start", e.target.value)} />
            </div>
            <div>
              <label style={S.label}>End Date</label>
              <input style={S.input} type="date" value={form.end || ""} onChange={e => u("end", e.target.value)} />
            </div>
          </div>
          {isPastDated && (
            <div style={{ marginTop: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>
              This event date is in the past. It should not be published.
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <label style={S.label}>Source URL</label>
            <input style={S.input} value={form.source_url || ""} onChange={e => u("source_url", e.target.value)} placeholder="https://..." />
          </div>
        </div>

        {/* 8. Pricing tiers */}
        <div style={{ ...S.card, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: 0.5 }}>Pricing Tiers</div>
            <button onClick={addPricingTier} style={S.btnSecondary}>+ Add Tier</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 0.9fr) minmax(0, 0.9fr) 72px 124px 46px 24px", gap: 8, alignItems: "center", width: "100%" }}>
            <div style={S.label}>Tier</div>
            <div style={S.label}>Price</div>
            <div style={S.label}>After deadline</div>
            <div style={S.label}>Currency</div>
            <div style={S.label}>Early-bird deadline</div>
            <div style={{ ...S.label, textAlign: "center" }}>Sold out</div>
            <div></div>
            {(form.pricing || []).map((tier, i) => {
              const ci = { ...S.inputSm, width: "100%", minWidth: 0, boxSizing: "border-box" };
              return (
              <Fragment key={tier.id || i}>
                <input style={ci} value={tier.tier || ""} onChange={e => updatePricing(i, "tier", e.target.value)} placeholder="Early Bird" />
                <input style={ci} type="text" inputMode="numeric" value={fmtMoney(tier.price, tier.currency)} onChange={e => updatePricing(i, "price", parseMoney(e.target.value))} placeholder="Price" />
                <input style={ci} type="text" inputMode="numeric" value={fmtMoney(tier.price_after_deadline, tier.currency)} onChange={e => updatePricing(i, "price_after_deadline", parseMoney(e.target.value))} placeholder="After" />
                <select style={ci} value={tier.currency || "USD"} onChange={e => updatePricing(i, "currency", e.target.value)}>
                  {CURRENCIES.map(cx => <option key={cx}>{cx}</option>)}
                </select>
                <input style={{ ...ci, colorScheme: "light" }} type="date" value={tier.deadline || ""} onChange={e => updatePricing(i, "deadline", e.target.value || null)} />
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                  <input type="checkbox" checked={!!tier.sold_out} onChange={e => updatePricing(i, "sold_out", e.target.checked)} />
                </div>
                <button onClick={() => removePricingTier(i)} title="Remove tier" style={{ ...S.btnGhost, color: "#ef4444", padding: 2, fontSize: 18, lineHeight: 1, justifySelf: "center" }}>×</button>
              </Fragment>
              );
            })}
          </div>
          {(form.pricing || []).length === 0 && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>No tiers yet. Click Add Tier.</div>}
        </div>

        {/* 9. Discount code */}
        <div style={{ ...S.card, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f97316", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>CC Discount Code</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={S.label}>Code</label>
              <input style={{ ...S.input, fontFamily: "monospace", letterSpacing: 1 }} value={form.discount_code || ""} onChange={e => u("discount_code", e.target.value.toUpperCase())} placeholder="e.g. AISUMMIT-CC" />
            </div>
            <div>
              <label style={S.label}>Discount %</label>
              <input style={S.input} type="text" inputMode="decimal" value={form.discount_pct ?? ""} onChange={e => u("discount_pct", e.target.value.replace(/[^0-9.]/g, ""))} placeholder="10" />
            </div>
            <div>
              <label style={S.label}>Max Uses</label>
              <input style={S.input} type="text" inputMode="numeric" value={form.discount_max_uses ?? ""} onChange={e => u("discount_max_uses", parseIntOrNull(e.target.value))} placeholder="Unlimited" />
            </div>
            <div>
              <label style={S.label}>Uses So Far</label>
              <input style={S.input} type="text" inputMode="numeric" value={form.discount_uses ?? ""} onChange={e => u("discount_uses", parseIntOrNull(e.target.value) || 0)} placeholder="0" />
            </div>
          </div>
        </div>
      </div>
    );
  };

function AdminTool({ auth }) {

  const [conferences, setConferences] = useState([]);
  const [view, setView] = useState("list"); // list | add | edit | detail
  const [editingConf, setEditingConf] = useState(null);
  const [extractUrl, setExtractUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState("");
  const [extractedData, setExtractedData] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [toast, setToast] = useState(null);
  const [pendingEditId, setPendingEditId] = useState(null);

  useEffect(() => {
    loadConferencesAsync().then(data => setConferences(data));
  }, []);

  // Deep link: /admin?edit=<conferenceId> opens that conference straight in the
  // editor. Used by the "Review draft" link on the Candidates page. Reads the id
  // on mount, then opens it once the conference list has loaded and clears the URL.
  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get("edit");
      if (id) setPendingEditId(id);
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (!pendingEditId || conferences.length === 0) return;
    const conf = conferences.find(c => c.id === pendingEditId);
    if (conf) { setEditingConf(conf); setView("edit"); }
    else showToast("Draft conference not found", "error");
    setPendingEditId(null);
    try { window.history.replaceState({}, "", "/admin"); } catch (e) {}
  }, [pendingEditId, conferences]);

  // Auto-expire conferences
  useEffect(() => {
    const expired = conferences.filter(c => c.status === "active" && c.end && c.end < TODAY);
    if (expired.length > 0) {
      expired.forEach(c => {
        fetch("/api/conferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: c.id, status: "expired" }),
        });
      });
      setConferences(conferences.map(c => 
        c.status === "active" && c.end && c.end < TODAY ? { ...c, status: "expired" } : c
      ));
    }
  }, [conferences]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ============================================================
  // EXTRACT FROM URL
  // ============================================================
  const handleExtract = async () => {
    if (!extractUrl.trim()) return;
    setExtracting(true);
    setExtractStatus("Fetching and grounding via the pricing pipeline (this can take a minute)...");
    setExtractedData(null);

    const urls = extractUrl.trim().split(/[\n,]+/).map((u: string) => u.trim()).filter(Boolean);
    const url = urls[0] || extractUrl.trim();
    try {
      // Same single route as Scrape / Bulk Import / Re-scrape: Firecrawl fetch,
      // shared extraction prompt, grounding gate, and pricing-page finder.
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (response.status === 401) { setExtractStatus("Session expired. Sign in to continue, then run the extraction again."); auth.sessionLost(); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Extraction failed");

      const b = data.base || {};
      const normalized = {
        id: `conf_${Date.now()}`,
        source_url: b.official_url || url,
        name: b.name || "",
        organizer: "",
        description: b.description || "",
        category: b.category || "AI / Tech",
        city: b.city || "",
        country: b.country || "",
        region: "Other",
        venue: "",
        start: b.start || "",
        end: b.end || "",
        format: "In-person",
        // Grounded pricing only, from the shared gate. price_after_deadline is
        // carried through so collapsed multi-window tiers keep their rise price.
        pricing: (data.pricing || []).map((p, i) => ({
          id: `tier_${i}`,
          tier: p.tier || "Standard",
          price: p.price === undefined ? null : p.price,
          price_after_deadline: p.price_after_deadline ?? null,
          currency: p.currency || "USD",
          deadline: p.deadline || null,
          deadline_passed: false,
          days_included: "all",
          requires_approval: false,
          notes: "",
        })),
        speakers: [], attendees: null, tags: [], hotels: [], organizer_contact: {},
        discount_code: "", discount_pct: 0, discount_type: "percentage",
        discount_max_uses: null, discount_uses: 0,
        status: "draft",
        // Mechanical grounding evidence replaces the model prose + confidence.
        extraction_notes: data.groundingNote || (data.errors?.length ? data.errors.join("; ") : "No pricing could be grounded against the page text."),
        created_at: new Date().toISOString(),
        last_verified: new Date().toISOString(),
        confidence: null,
      };

      setExtractedData(normalized);
      setExtractStatus((data.pricing || []).length ? "Extraction complete, review below" : "No grounded pricing found. Review base fields and add pricing manually if needed.");
    } catch (err) {
      setExtractStatus(`Error: ${err.message}. You can still create the conference manually.`);
      setExtractedData({
        id: `conf_${Date.now()}`,
        source_url: url,
        name: "", organizer: "", description: "", category: "AI / Tech",
        city: "", country: "", region: "Other", venue: "",
        start: "", end: "", format: "In-person",
        pricing: [{ id: "tier_0", tier: "Standard", price: null, price_after_deadline: null, currency: "USD", deadline: null, deadline_passed: false, days_included: "all", requires_approval: false, notes: "" }],
        speakers: [], attendees: null, tags: [],
        hotels: [], organizer_contact: {},
        discount_code: "", discount_pct: 0, discount_type: "percentage",
        discount_max_uses: null, discount_uses: 0,
        status: "draft", extraction_notes: "Manual entry, extraction failed",
        created_at: new Date().toISOString(),
        last_verified: new Date().toISOString(),
        confidence: null,
      });
    } finally {
      setExtracting(false);
    }
  };

  // ============================================================
  // SAVE CONFERENCE
  // ============================================================
  const [dupeWarning, setDupeWarning] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async (conf, isNew = true) => {
    // Handle delete from edit view
    if (conf._delete && conf.id) {
      setSaving(true);
      try {
        await deleteConferenceFromDb(conf.id);
        const fresh = await loadConferencesAsync();
        setConferences(fresh);
        setView("list");
        setEditingConf(null);
        showToast(`"${conf.name}" deleted`, "error");
      } catch (e) {
        showToast(`Delete failed: ${e.message}`, "error");
      }
      setSaving(false);
      return;
    }
    // Duplicate detection for new conferences
    if (isNew && !dupeWarning) {
      const dupes = conferences.filter(c => {
        const nameMatch = c.name && conf.name && c.name.toLowerCase().trim() === conf.name.toLowerCase().trim();
        const urlMatch = c.source_url && conf.source_url && c.source_url.replace(/\/+$/, "").toLowerCase() === conf.source_url.replace(/\/+$/, "").toLowerCase();
        const dateMatch = c.start && conf.start && c.start === conf.start;
        return nameMatch || urlMatch || (dateMatch && c.city && conf.city && c.city.toLowerCase() === conf.city.toLowerCase());
      });
      if (dupes.length > 0) {
        setDupeWarning({ conf, isNew, dupes });
        return;
      }
    }
    setDupeWarning(null);
    setSaving(true);
    try {
      await saveConferenceToDb(conf, isNew);
      // Reload from DB to get server-generated fields (id, slug, created_at)
      const fresh = await loadConferencesAsync();
      setConferences(fresh);
      setView("list");
      setExtractedData(null);
      setExtractUrl("");
      setEditingConf(null);
      showToast(isNew ? `"${conf.name}" saved to database` : `"${conf.name}" updated`);
    } catch (e) {
      showToast(`Save failed: ${e.message}`, "error");
      console.error(e);
    }
    setSaving(false);
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const handleDelete = async (id) => {
    const conf = conferences.find(c => c.id === id);
    try {
      await deleteConferenceFromDb(id);
      setConferences(conferences.filter(c => c.id !== id));
      setDeleteConfirmId(null);
      showToast(`"${conf?.name}" deleted`, "error");
    } catch (e) {
      showToast(`Delete failed: ${e.message}`, "error");
    }
  };

  // ============================================================
  // FILTERED LIST
  // ============================================================
  const filtered = conferences.filter(c => {
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (filterCategory !== "all" && c.category !== filterCategory) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      return `${c.name} ${c.city} ${c.country} ${c.organizer}`.toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => {
    // Group ACADEMIC LIKELY drafts together (first), then most recently added.
    const aca = (x) => (/ACADEMIC LIKELY/i.test(x.extraction_notes || "") ? 0 : 1);
    if (aca(a) !== aca(b)) return aca(a) - aca(b);
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  const counts = {
    all: conferences.length,
    active: conferences.filter(c => c.status === "active").length,
    draft: conferences.filter(c => c.status === "draft").length,
    expired: conferences.filter(c => c.status === "expired").length,
  };

  // ============================================================
  // STYLES
  // ============================================================
  const S = {
    page: { minHeight: "100vh", background: "#f8f9fa", color: "#374151", fontFamily: "'DM Sans', -apple-system, system-ui, sans-serif", fontSize: 14 },
    header: { background: "rgba(15,23,42,0.98)", borderBottom: "1px solid rgba(0,0,0,0.2)", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 100 },
    logo: { display: "flex", alignItems: "center", gap: 10 },
    logoIcon: { width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #f97316, #ea580c)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 10px rgba(249,115,22,0.3)" },
    container: { maxWidth: 1100, margin: "0 auto", padding: "24px 32px" },
    card: { background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 20, marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
    input: { width: "100%", padding: "10px 14px", borderRadius: 8, background: "#ffffff", border: "1px solid #d1d5db", color: "#111827", fontSize: 13, fontFamily: "inherit", outline: "none" },
    inputSm: { padding: "8px 12px", borderRadius: 6, background: "#ffffff", border: "1px solid #d1d5db", color: "#111827", fontSize: 12, fontFamily: "inherit", outline: "none" },
    label: { fontSize: 10, color: "#374151", fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4, display: "block" },
    btnPrimary: { padding: "10px 20px", borderRadius: 8, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px rgba(249,115,22,0.25)" },
    btnSecondary: { padding: "10px 20px", borderRadius: 8, background: "#f3f4f6", border: "1px solid #d1d5db", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    btnDanger: { padding: "8px 16px", borderRadius: 6, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    btnGhost: { padding: "6px 12px", borderRadius: 6, background: "none", border: "none", color: "#6b7280", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
    grid4: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 },
    tag: { display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, padding: "2px 8px", borderRadius: 4 },
    divider: { borderTop: "1px solid #e5e7eb", margin: "16px 0" },
  };

  // ============================================================
  // RENDER: CONFERENCE EDITOR FORM
  // ============================================================

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div style={S.page}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 200,
          background: toast.type === "error" ? "rgba(239,68,68,0.9)" : "rgba(34,197,94,0.9)",
          color: "#fff", padding: "12px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)", animation: "fadeIn 0.2s ease",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Duplicate Warning Modal */}
      {dupeWarning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#ffffff", borderRadius: 16, padding: 28, maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", border: "1px solid #e5e7eb" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>Possible Duplicate</span>
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>This looks similar to:</div>
            {dupeWarning.dupes.map((d, i) => (
              <div key={i} style={{ fontSize: 14, fontWeight: 600, color: "#111827", padding: "6px 0" }}>
                {d.name} — {d.city}, {d.start}
              </div>
            ))}
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 10, marginBottom: 18 }}>Save anyway?</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setDupeWarning(null)} style={S.btnSecondary}>Cancel</button>
              <button onClick={() => { const { conf, isNew } = dupeWarning; setDupeWarning("override"); handleSave(conf, isNew); }} style={{ ...S.btnPrimary, background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>Save Anyway</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={S.header}>
        <div style={S.logo}>
          <div style={S.logoIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>Conference<span style={{ color: "#f97316" }}>Codes</span></span>
          <span style={{ fontSize: 11, color: "#94a3b8", background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: 4, marginLeft: 4 }}>ADMIN</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setView("list"); setEditingConf(null); setExtractedData(null); }} style={view === "list" ? S.btnPrimary : S.btnSecondary}>All Conferences</button>
          <button onClick={() => { setView("add"); setEditingConf(null); setExtractedData(null); setExtractUrl(""); setExtractStatus(""); }} style={view === "add" ? S.btnPrimary : S.btnSecondary}>+ Add New</button>
          <a href="/admin/candidates" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Candidates</a>
          <a href="/admin/import" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Bulk Import</a>
          <a href="/admin/discovery" style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Discovery</a>
          <AuthBadge status={auth.status} onSignIn={auth.openSignIn} onSignOut={auth.signOut} />
        </div>
      </div>

      <div style={S.container}>
        {/* ============ ADD VIEW ============ */}
        {view === "add" && !extractedData && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 20 }}>Add Conference</h2>

            {/* URL EXTRACT */}
            <div style={{ ...S.card, border: "1px solid rgba(249,115,22,0.3)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f97316", marginBottom: 4 }}>PASTE URL(s) — Claude will extract everything</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>Paste the main page URL. If pricing is on a separate registration page, paste that URL too (one per line).</div>
              <div style={{ display: "flex", gap: 12 }}>
                <textarea
                  style={{ ...S.input, flex: 1, fontSize: 14, minHeight: 56, resize: "vertical", fontFamily: "monospace" }}
                  value={extractUrl}
                  onChange={e => setExtractUrl(e.target.value)}
                  placeholder={"https://events.economist.com/technology-for-change-week/\nhttps://events.economist.com/technology-for-change-week/registration/"}
                  disabled={extracting}
                  rows={2}
                />
                <button onClick={handleExtract} disabled={extracting || !extractUrl.trim()} style={{ ...S.btnPrimary, opacity: extracting ? 0.6 : 1, minWidth: 120 }}>
                  {extracting ? "Extracting..." : "Extract"}
                </button>
              </div>
              {extractStatus && (
                <div style={{ marginTop: 12, fontSize: 13, color: extracting ? "#fb923c" : (/error|expired|fail|invalid|could not|not signed/i.test(extractStatus) ? "#ef4444" : "#22c55e"), display: "flex", alignItems: "center", gap: 8 }}>
                  {extracting && (
                    <div style={{ width: 14, height: 14, border: "2px solid rgba(249,115,22,0.3)", borderTop: "2px solid #f97316", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  )}
                  {extractStatus}
                </div>
              )}
            </div>

            <div style={{ textAlign: "center", color: "#6b7280", margin: "20px 0", fontSize: 13 }}>— or —</div>

            {/* MANUAL ENTRY */}
            <button onClick={() => {
              setExtractedData({
                id: `conf_${Date.now()}`, source_url: "", name: "", organizer: "", description: "", category: "AI / Tech",
                city: "", country: "", region: "North America", venue: "", start: "", end: "", format: "In-person",
                pricing: [{ id: "tier_0", tier: "Standard", price: null, currency: "USD", deadline: null, deadline_passed: false, days_included: "all", requires_approval: false, notes: "" }],
                speakers: [], attendees: null, tags: [], hotels: [], organizer_contact: {},
                discount_code: "", discount_pct: 0, discount_type: "percentage", discount_max_uses: null, discount_uses: 0,
                status: "draft", extraction_notes: "", created_at: new Date().toISOString(), last_verified: new Date().toISOString(), confidence: 0,
              });
            }} style={{ ...S.btnSecondary, width: "100%" }}>
              Enter manually without URL extraction
            </button>
          </div>
        )}

        {/* ============ EXTRACTED / EDIT FORM ============ */}
        {(view === "add" && extractedData) && (
          <ConferenceForm
            initial={extractedData}
            onSave={handleSave}
            onCancel={() => { setExtractedData(null); setExtractUrl(""); setExtractStatus(""); }}
            isNew={true}
            saving={saving}
            S={S}
          />
        )}

        {view === "edit" && editingConf && (
          <ConferenceForm
            initial={editingConf}
            onSave={(conf) => handleSave(conf, false)}
            onCancel={() => { setView("list"); setEditingConf(null); }}
            isNew={false}
            saving={saving}
            S={S}
          />
        )}

        {/* ============ LIST VIEW ============ */}
        {view === "list" && (
          <div>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Total", count: counts.all, color: "#111827" },
                { label: "Active", count: counts.active, color: "#22c55e" },
                { label: "Draft", count: counts.draft, color: "#f97316" },
                { label: "Expired", count: counts.expired, color: "#ef4444" },
              ].map((s, i) => (
                <div key={i} style={{ ...S.card, textAlign: "center", cursor: "pointer", border: filterStatus === s.label.toLowerCase() ? `1px solid ${s.color}` : undefined }}
                  onClick={() => setFilterStatus(filterStatus === s.label.toLowerCase() ? "all" : s.label.toLowerCase())}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.count}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Search & filters */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <input style={{ ...S.input, flex: 1 }} value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search conferences..." />
              <select style={{ ...S.input, width: 180 }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                <option value="all">All Categories</option>
                <option>AI / Tech</option>
                <option>Other</option>
              </select>
            </div>

            {/* Conference list */}
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: "#6b7280" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>&#128269;</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No conferences yet</div>
                <div style={{ fontSize: 13 }}>Click "+ Add New" to extract your first conference from a URL</div>
              </div>
            ) : filtered.map(conf => {
              const sc = STATUS_COLORS[conf.status] || STATUS_COLORS.draft;
              const daysAway = conf.start ? Math.ceil((new Date(conf.start) - new Date()) / (1000*60*60*24)) : null;
              const mainPrice = conf.pricing?.find(p => p.tier === "Early Bird") || conf.pricing?.[0];
              const duration = (conf.start && conf.end) ? Math.ceil((new Date(conf.end) - new Date(conf.start)) / (1000*60*60*24)) + 1 : null;
              const lowestPrice = conf.pricing?.length ? Math.min(...conf.pricing.map(p => p.price)) : null;
              const hasFree = conf.pricing?.some(p => p.price === 0);
              const isAcademic = /ACADEMIC LIKELY/i.test(conf.extraction_notes || "");
              return (
                <div key={conf.id} style={{ ...S.card, cursor: "pointer", transition: "all 0.2s" }}
                  onClick={() => { setEditingConf(conf); setView("edit"); }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ ...S.tag, background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text }}>{conf.status.toUpperCase()}</span>
                        <span style={{ ...S.tag, background: "rgba(96,165,250,0.1)", color: "#60a5fa" }}>{conf.category}</span>
                        {conf.discount_code && (
                          <span style={{ ...S.tag, background: "rgba(249,115,22,0.1)", color: "#f97316" }}>{conf.discount_code} ({conf.discount_pct}% off)</span>
                        )}
                        {hasFree && (
                          <span style={{ ...S.tag, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}>FREE TIER</span>
                        )}
                        {isAcademic && (
                          <span style={{ ...S.tag, background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.35)", color: "#9333ea", fontWeight: 800 }}>ACADEMIC LIKELY</span>
                        )}
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{conf.name || "Untitled"}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        {conf.city && conf.country ? `${conf.city}, ${conf.country}` : "Location TBD"}
                        {conf.start && ` · ${new Date(conf.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                        {conf.end && conf.end !== conf.start && ` – ${new Date(conf.end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                        {duration && <span style={{ color: "#6b7280" }}> · {duration} day{duration !== 1 ? "s" : ""}</span>}
                        {daysAway !== null && daysAway > 0 && <span style={{ color: daysAway < 30 ? "#f97316" : "#64748b" }}> · {daysAway}d away</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {mainPrice && (
                        <div style={{ fontSize: 18, fontWeight: 800, color: mainPrice.price === 0 ? "#22c55e" : mainPrice.price === null ? "#f59e0b" : "#f97316", fontFamily: "monospace" }}>
                          {mainPrice.price === null ? "TBD" : mainPrice.price === 0 ? "Free" : `$${mainPrice.price?.toLocaleString()}`}
                        </div>
                      )}
                      {conf.pricing?.length > 1 && lowestPrice !== null && lowestPrice !== mainPrice?.price && (
                        <div style={{ fontSize: 11, color: "#6b7280" }}>
                          {lowestPrice === 0 ? "Free" : `from $${lowestPrice.toLocaleString()}`}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        {conf.pricing?.length || 0} tier{conf.pricing?.length !== 1 ? "s" : ""}
                        {conf.hotels?.length > 0 && ` · ${conf.hotels.length} hotel${conf.hotels.length !== 1 ? "s" : ""}`}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                        <button onClick={e => { e.stopPropagation(); setEditingConf(conf); setView("edit"); }} style={S.btnGhost}>Edit</button>
                        {deleteConfirmId === conf.id ? (
                          <>
                            <button onClick={e => { e.stopPropagation(); handleDelete(conf.id); }} style={{ ...S.btnGhost, color: "#ef4444", fontWeight: 700 }}>Confirm</button>
                            <button onClick={e => { e.stopPropagation(); setDeleteConfirmId(null); }} style={S.btnGhost}>Cancel</button>
                          </>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); setDeleteConfirmId(conf.id); }} style={{ ...S.btnGhost, color: "#ef4444" }}>Delete</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus, select:focus, textarea:focus { border-color: #f97316 !important; box-shadow: 0 0 0 3px rgba(249,115,22,0.1) !important; }
        ::placeholder { color: #9ca3af; }
        select { cursor: pointer; }
        select option { background: #ffffff; color: #111827; }
      `}</style>
    </div>
  );
}

export default function App() {
  const auth = useAdminAuth();
  const [everAuthed, setEverAuthed] = useState(false);
  useEffect(() => { if (auth.status === "valid") setEverAuthed(true); }, [auth.status]);

  if (auth.status === "checking") {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f9fa", color: "#6b7280" }}>Checking session...</div>;
  }
  if (auth.status === "invalid" && !everAuthed) {
    return <SignInOverlay open invalid={false} onSignedIn={auth.onSignedIn} onClose={null} />;
  }
  return (
    <>
      <AdminTool auth={auth} />
      <SignInOverlay open={auth.signInOpen || auth.status === "invalid"} invalid={auth.status === "invalid"} onSignedIn={auth.onSignedIn} onClose={() => auth.setSignInOpen(false)} />
    </>
  );
}
