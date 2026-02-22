// @ts-nocheck
"use client";
import { useState, useEffect } from "react";

// ============================================================
// ConferenceCodes Admin Tool — Next.js + Supabase
// ============================================================

const TODAY = new Date().toISOString().split("T")[0];

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
      notes: c.outreach_notes || "",
    },
    pricing: (c.pricing_tiers || []).sort((a: any, b: any) => (a.sort_order||0) - (b.sort_order||0)).map((t: any) => ({
      id: t.id,
      tier: t.tier_name || "",
      price: t.price != null ? parseFloat(t.price) : null,
      currency: t.currency || "USD",
      deadline: t.deadline || "",
      days_included: t.days_included || "",
      notes: t.notes || "",
      deadline_passed: t.deadline_passed || false,
      requires_approval: t.requires_approval || false,
      sold_out: t.sold_out || false,
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
    region: conf.region,
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
    outreach_notes: conf.organizer_contact?.notes || "",
    pricing: (conf.pricing || []).map((t: any, i: number) => ({
      tier_name: t.tier || "",
      price: t.price,
      currency: t.currency || "USD",
      deadline: t.deadline || null,
      days_included: t.days_included || "",
      notes: t.notes || "",
      deadline_passed: t.deadline_passed || false,
      requires_approval: t.requires_approval || false,
      sold_out: t.sold_out || false,
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

// ============================================================
// EXTRACTION PROMPT — sent to Claude API
// ============================================================
const EXTRACTION_SYSTEM = `You are a conference data extraction assistant for ConferenceCodes.com. 
Given a conference website URL, extract ALL available information and return ONLY valid JSON (no markdown, no backticks, no explanation).

Return this exact structure:
{
  "name": "Conference Name",
  "organizer": "Organizing Company/Entity",
  "description": "2-3 sentence description of the conference",
  "category": "Longevity / Health" or "AI / Tech" or "Other",
  "city": "City",
  "country": "Country",
  "region": "North America" or "Europe" or "Asia" or "Global" or "Other",
  "venue": "Venue name if found",
  "start": "YYYY-MM-DD",
  "end": "YYYY-MM-DD",
  "format": "In-person" or "Virtual" or "Hybrid",
  "language": "English" or "German" or "English/German" etc - the language(s) presentations are given in,
  "pricing": [
    {
      "tier": "Early Bird" or "Standard" or "VIP" or "Student" or "Day Pass" or custom tier name,
      "price": 1234 or null,
      "currency": "USD",
      "deadline": "YYYY-MM-DD or null",
      "deadline_passed": true or false,
      "days_included": "all" or "Monday only" or "Day 1" etc,
      "requires_approval": false,
      "notes": "any relevant notes"
    }
  ],
  "speakers": ["Speaker Name 1", "Speaker Name 2"],
  "attendees": 500 or null,
  "tags": ["tag1", "tag2"],
  "hotels": [
    {
      "name": "Hotel Name",
      "stars": 4,
      "conf_rate": 189,
      "rack_rate": 299,
      "currency": "USD",
      "book_by": "YYYY-MM-DD",
      "distance": "0.2 mi",
      "booking_url": "https://...",
      "group_code": "CODE123 or null"
    }
  ],
  "organizer_contact": {
    "name": "contact person name if found",
    "role": "their role/title if found",
    "email": "email if found",
    "phone": "phone if found",
    "website": "main URL",
    "affiliate": "yes" or "no" or "unknown",
    "affiliate_details": "affiliate program details if found (commission rate, platform, etc.)"
  },
  "extraction_notes": "Any issues encountered, fields you couldn't find, pages you checked"
}

CRITICAL PRICING RULES:
- NEVER guess, estimate, or fabricate a price. If the actual dollar/euro/pound amount is not explicitly shown on the page, set price to null.
- Many ticketing platforms (Luma, Eventbrite, etc.) load prices via JavaScript that you cannot see. If you see tier names but no dollar amounts, set each price to null and note this in extraction_notes.
- Always include Early Bird tiers even if the deadline has passed. Set deadline_passed to true if the deadline has passed or if the page says "Sales ended". The early bird price is still valuable historical data.
- For pricing, look for ALL ticket tiers including day passes, single-day options, group rates, student rates, virtual tickets, press passes, academic rates
- If a tier requires approval (e.g. "Require Approval" on Luma), set requires_approval to true
- If a tier is free (e.g. press passes, some virtual tickets), set price to 0
- If the conference allows per-day attendance, create separate pricing entries for each day option

OTHER RULES:
- For hotels, check pages labeled Travel, Venue, Accommodation, Hotel, or Where to Stay
- Dates must be in YYYY-MM-DD format
- Prices must be numbers without currency symbols, or null if unknown
- If a field cannot be found, use null
- NEVER label a tier as "Early Bird" unless the page explicitly uses the words "Early Bird" or "Early-Bird". A discounted price shown with a strikethrough original price does NOT mean it is an early bird price — it may simply be the current promotional price or the standard price with a comparison to list price.
- Look for affiliate/partner program pages — check footer links, "Partners", "Affiliates", "Become a Partner" pages. If found, set affiliate to "yes" and capture commission details.
- For contact info, look for specific people (Head of Partnerships, Marketing Director, etc.) not just generic info@ emails. Check "Contact", "About", "Team" pages.
- CRITICAL DATE RULE: Many conference sites show dates from MULTIPLE editions (past and upcoming). ONLY extract dates for the NEXT UPCOMING edition (the one in the future, closest to today's date which is ${new Date().toISOString().split("T")[0]}). Ignore all past edition dates. Look for the most prominent/hero date on the page — that is usually the upcoming edition.
- Return ONLY the JSON object, nothing else`;

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
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

  useEffect(() => {
    loadConferencesAsync().then(data => setConferences(data));
  }, []);

  // Auto-expire conferences
  useEffect(() => {
    const expired = conferences.filter((c: any) => c.status === "active" && c.end && c.end < TODAY);
    if (expired.length > 0) {
      expired.forEach((c: any) => {
        fetch("/api/conferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: c.id, status: "expired" }),
        });
      });
      setConferences(conferences.map((c: any) => 
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
    setExtractStatus("Fetching conference page...");
    setExtractedData(null);

    try {
      setExtractStatus("Sending to Claude for extraction...");
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: EXTRACTION_SYSTEM,
          messages: [{
            role: "user",
            content: `Extract all conference data from these URLs:
${extractUrl.trim().split(/[
,]+/).map((u: string) => u.trim()).filter(Boolean).join("
")}

CRITICAL INSTRUCTIONS:
1. Visit EACH URL provided above
2. ALSO try visiting these common subpages by appending to the base domain: /registration, /register, /pricing, /tickets, /attend, /speakers, /travel, /hotels, /accommodation, /venue, /about, /contact
3. The PRICING is often NOT on the main page — it is usually on a separate registration or tickets page. You MUST check the registration page.
4. Look for links containing words like "Register", "Attend", "Tickets", "Pricing", "Book" and follow them.
5. Return ONLY valid JSON.`
          }],
          tools: [{
            type: "web_search_20250305",
            name: "web_search"
          }],
        }),
      });

      const data = await response.json();
      setExtractStatus("Parsing extracted data...");

      // Combine all text blocks
      const fullText = data.content
        .map(item => (item.type === "text" ? item.text : ""))
        .filter(Boolean)
        .join("
");

      // Parse JSON from response
      const clean = fullText.replace(/```json|```/g, "").trim();
      // Find the JSON object in the response
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");

      const parsed = JSON.parse(jsonMatch[0]);

      // Normalize the extracted data into our internal format
      const urls = extractUrl.trim().split(/[
,]+/).map(u => u.trim()).filter(Boolean);
      const normalized = {
        id: `conf_${Date.now()}`,
        source_url: urls[0] || extractUrl.trim(),
        name: parsed.name || "",
        organizer: parsed.organizer || "",
        description: parsed.description || "",
        category: parsed.category || "Other",
        city: parsed.city || "",
        country: parsed.country || "",
        region: parsed.region || "Other",
        venue: parsed.venue || "",
        start: parsed.start || "",
        end: parsed.end || "",
        format: parsed.format || "In-person",
        pricing: (parsed.pricing || []).map((p, i) => ({
          id: `tier_${i}`,
          tier: p.tier || "Standard",
          price: p.price === undefined ? null : p.price,
          currency: p.currency || "USD",
          deadline: p.deadline || null,
          deadline_passed: p.deadline_passed || false,
          days_included: p.days_included || "all",
          requires_approval: p.requires_approval || false,
          notes: p.notes || "",
        })),
        speakers: parsed.speakers || [],
        attendees: parsed.attendees || null,
        tags: parsed.tags || [],
        hotels: (parsed.hotels || []).map((h, i) => ({
          id: `hotel_${i}`,
          name: h.name || "",
          stars: h.stars || 3,
          conf_rate: h.conf_rate || 0,
          rack_rate: h.rack_rate || 0,
          currency: h.currency || "USD",
          book_by: h.book_by || "",
          distance: h.distance || "",
          booking_url: h.booking_url || "",
          group_code: h.group_code || "",
        })),
        organizer_contact: parsed.organizer_contact || {},
        discount_code: "",
        discount_pct: 0,
        discount_type: "percentage",
        discount_max_uses: null,
        discount_uses: 0,
        status: "draft",
        extraction_notes: parsed.extraction_notes || "",
        created_at: new Date().toISOString(),
        last_verified: new Date().toISOString(),
        confidence: 0.85,
      };

      setExtractedData(normalized);
      setExtractStatus("Extraction complete — review below");
    } catch (err) {
      console.error("Extraction error:", err);
      setExtractStatus(`Error: ${err.message}. You can still create the conference manually.`);
      // Provide empty template for manual entry
      setExtractedData({
        id: `conf_${Date.now()}`,
        source_url: extractUrl.trim(),
        name: "", organizer: "", description: "", category: "Other",
        city: "", country: "", region: "Other", venue: "",
        start: "", end: "", format: "In-person",
        pricing: [{ id: "tier_0", tier: "Standard", price: null, currency: "USD", deadline: null, deadline_passed: false, days_included: "all", requires_approval: false, notes: "" }],
        speakers: [], attendees: null, tags: [],
        hotels: [], organizer_contact: {},
        discount_code: "", discount_pct: 0, discount_type: "percentage",
        discount_max_uses: null, discount_uses: 0,
        status: "draft", extraction_notes: "Manual entry — extraction failed",
        created_at: new Date().toISOString(),
        last_verified: new Date().toISOString(),
        confidence: 0,
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
    // Most recently added first (by created_at timestamp)
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  const counts = {
    all: conferences.length,
    active: conferences.filter((c: any) => c.status === "active").length,
    draft: conferences.filter((c: any) => c.status === "draft").length,
    expired: conferences.filter((c: any) => c.status === "expired").length,
  };

  // ============================================================
  // STYLES
  // ============================================================
  const S = {
    page: { minHeight: "100vh", background: "#0a0f1a", color: "#e2e8f0", fontFamily: "'DM Sans', -apple-system, system-ui, sans-serif", fontSize: 14 },
    header: { background: "rgba(15,23,42,0.95)", borderBottom: "1px solid rgba(51,65,85,0.3)", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 100 },
    logo: { display: "flex", alignItems: "center", gap: 10 },
    logoIcon: { width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #f97316, #ea580c)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 10px rgba(249,115,22,0.3)" },
    container: { maxWidth: 1100, margin: "0 auto", padding: "24px 32px" },
    card: { background: "#0f172a", border: "1px solid rgba(51,65,85,0.4)", borderRadius: 14, padding: 20, marginBottom: 12, boxShadow: "0 2px 10px rgba(0,0,0,0.2)" },
    input: { width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(30,41,59,0.6)", border: "1px solid rgba(51,65,85,0.5)", color: "#e2e8f0", fontSize: 13, fontFamily: "inherit", outline: "none" },
    inputSm: { padding: "8px 12px", borderRadius: 6, background: "rgba(30,41,59,0.6)", border: "1px solid rgba(51,65,85,0.5)", color: "#e2e8f0", fontSize: 12, fontFamily: "inherit", outline: "none" },
    label: { fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4, display: "block" },
    btnPrimary: { padding: "10px 20px", borderRadius: 8, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 10px rgba(249,115,22,0.3)" },
    btnSecondary: { padding: "10px 20px", borderRadius: 8, background: "rgba(30,41,59,0.6)", border: "1px solid rgba(51,65,85,0.5)", color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    btnDanger: { padding: "8px 16px", borderRadius: 6, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    btnGhost: { padding: "6px 12px", borderRadius: 6, background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
    grid4: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 },
    tag: { display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, padding: "2px 8px", borderRadius: 4 },
    divider: { borderTop: "1px solid rgba(51,65,85,0.3)", margin: "16px 0" },
  };

  // ============================================================
  // RENDER: CONFERENCE EDITOR FORM
  // ============================================================
  const ConferenceForm = ({ initial, onSave, onCancel, isNew, saving }: any) => {
    const [form, setForm] = useState(initial);
    const [newSpeaker, setNewSpeaker] = useState("");
    const [newTag, setNewTag] = useState("");

    const u = (field, value) => setForm(f => ({ ...f, [field]: value }));

    const updatePricing = (index, field, value) => {
      const p = [...form.pricing];
      p[index] = { ...p[index], [field]: value };
      setForm(f => ({ ...f, pricing: p }));
    };
    const addPricingTier = () => {
      setForm(f => ({ ...f, pricing: [...f.pricing, { id: `tier_${Date.now()}`, tier: "Day Pass", price: null, currency: "USD", deadline: null, deadline_passed: false, days_included: "", requires_approval: false, notes: "" }] }));
    };
    const removePricingTier = (index) => {
      setForm(f => ({ ...f, pricing: f.pricing.filter((_, i) => i !== index) }));
    };

    const updateHotel = (index, field, value) => {
      const h = [...form.hotels];
      h[index] = { ...h[index], [field]: value };
      setForm(f => ({ ...f, hotels: h }));
    };
    const addHotel = () => {
      setForm(f => ({ ...f, hotels: [...f.hotels, { id: `hotel_${Date.now()}`, name: "", stars: 3, conf_rate: 0, rack_rate: 0, currency: "USD", book_by: "", distance: "", booking_url: "", group_code: "" }] }));
    };
    const removeHotel = (index) => {
      setForm(f => ({ ...f, hotels: f.hotels.filter((_, i) => i !== index) }));
    };

    const addSpeaker = () => { if (newSpeaker.trim()) { u("speakers", [...form.speakers, newSpeaker.trim()]); setNewSpeaker(""); }};
    const removeSpeaker = (i) => u("speakers", form.speakers.filter((_, idx) => idx !== i));
    const addTag = () => { if (newTag.trim()) { u("tags", [...form.tags, newTag.trim().toLowerCase()]); setNewTag(""); }};
    const removeTag = (i) => u("tags", form.tags.filter((_, idx) => idx !== i));

    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", margin: 0 }}>
            {isNew ? "Add Conference" : `Edit: ${form.name}`}
          </h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onCancel} style={S.btnSecondary}>Cancel</button>
            <button onClick={() => onSave(form, isNew)} disabled={saving} style={{ ...S.btnPrimary, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving..." : isNew ? "Save as Draft" : "Save Changes"}
            </button>
            {isNew && (
              <button onClick={() => onSave({ ...form, status: "active" }, isNew)} disabled={saving} style={{ ...S.btnPrimary, background: "linear-gradient(135deg, #22c55e, #16a34a)", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : "Publish"}
              </button>
            )}
          </div>
        </div>

        {/* DISCOUNT CODE STATUS — prominent at top */}
        {form.discount_code ? (
          <div style={{ ...S.card, background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.3)", marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg, #f97316, #ea580c)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#f97316", letterSpacing: 0.5 }}>CC DISCOUNT CODE ACTIVE</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#f97316", fontFamily: "monospace", letterSpacing: 2 }}>{form.discount_code}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#f97316" }}>{form.discount_pct}% off</div>
                {form.discount_max_uses && <div style={{ fontSize: 11, color: "#94a3b8" }}>Limit: {form.discount_max_uses} uses</div>}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ ...S.card, background: "rgba(100,116,139,0.05)", border: "1px dashed rgba(100,116,139,0.3)", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(100,116,139,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#64748b" }}>No discount code yet</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>Scroll to "CC Discount Code" section to add one after organizer agreement</div>
              </div>
            </div>
          </div>
        )}

        {form.extraction_notes && (
          <div style={{ ...S.card, background: "rgba(249,115,22,0.05)", border: "1px solid rgba(249,115,22,0.2)", marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#f97316", marginBottom: 4 }}>EXTRACTION NOTES</div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{form.extraction_notes}</div>
          </div>
        )}

        {/* MISSING PRICES WARNING + QUICK FILL */}
        {form.pricing.some(t => t.price === null) && (
          <div style={{ ...S.card, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>Prices couldn't be auto-extracted</span>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>Many ticketing platforms load prices via JavaScript. Enter the prices manually below:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {form.pricing.map((tier, i) => tier.price === null ? (
                <div key={tier.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", minWidth: 160 }}>{tier.tier || `Tier ${i+1}`}</span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>$</span>
                  <input
                    style={{ ...S.inputSm, width: 100, fontWeight: 700, fontSize: 14 }}
                    type="number"
                    placeholder="0"
                    onChange={e => {
                      const val = e.target.value === "" ? null : parseFloat(e.target.value) || 0;
                      updatePricing(i, "price", val);
                    }}
                  />
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{tier.currency}</span>
                  {tier.deadline_passed && <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 600 }}>EXPIRED</span>}
                  {tier.requires_approval && <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 600 }}>APPROVAL</span>}
                </div>
              ) : null)}
            </div>
          </div>
        )}

        {/* BASIC INFO */}
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f97316", marginBottom: 16, textTransform: "uppercase", letterSpacing: 0.5 }}>Basic Information</div>
          <div style={{ ...S.grid2, marginBottom: 12 }}>
            <div>
              <label style={S.label}>Conference Name *</label>
              <input style={S.input} value={form.name} onChange={e => u("name", e.target.value)} placeholder="e.g. RAADfest 2026" />
            </div>
            <div>
              <label style={S.label}>Organizer</label>
              <input style={S.input} value={form.organizer} onChange={e => u("organizer", e.target.value)} placeholder="e.g. RAAD" />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>Description</label>
            <textarea style={{ ...S.input, minHeight: 70, resize: "vertical" }} value={form.description} onChange={e => u("description", e.target.value)} placeholder="2-3 sentence description..." />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>Source URL</label>
            <input style={S.input} value={form.source_url} onChange={e => u("source_url", e.target.value)} placeholder="https://..." />
          </div>
          <div style={S.grid4}>
            <div>
              <label style={S.label}>Category</label>
              <select style={S.input} value={form.category} onChange={e => u("category", e.target.value)}>
                <option>Longevity / Health</option><option>AI / Tech</option><option>Other</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Format</label>
              <select style={S.input} value={form.format} onChange={e => u("format", e.target.value)}>
                <option>In-person</option><option>Virtual</option><option>Hybrid</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Language</label>
              <input style={S.input} value={form.language || ""} onChange={e => u("language", e.target.value)} placeholder="e.g. English, German/English, Japanese" />
            </div>
            <div>
              <label style={S.label}>Status</label>
              <select style={S.input} value={form.status} onChange={e => u("status", e.target.value)}>
                <option value="draft">Draft</option><option value="active">Active</option><option value="sold_out">Sold Out</option><option value="expired">Expired</option><option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Expected Attendees</label>
              <input style={S.input} type="number" value={form.attendees || ""} onChange={e => u("attendees", e.target.value ? parseInt(e.target.value) : null)} />
            </div>
          </div>
        </div>

        {/* LOCATION & DATES */}
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f97316", marginBottom: 16, textTransform: "uppercase", letterSpacing: 0.5 }}>Location & Dates</div>
          <div style={S.grid4}>
            <div>
              <label style={S.label}>City</label>
              <input style={S.input} value={form.city} onChange={e => u("city", e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Country</label>
              <input style={S.input} value={form.country} onChange={e => u("country", e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Start Date *</label>
              <input style={{ ...S.input, colorScheme: "dark" }} type="date" value={form.start} onChange={e => u("start", e.target.value)} />
            </div>
            <div>
              <label style={S.label}>End Date *</label>
              <input style={{ ...S.input, colorScheme: "dark" }} type="date" value={form.end} onChange={e => u("end", e.target.value)} />
            </div>
          </div>
          {form.start && form.end && (() => {
            const dur = Math.ceil((new Date(form.end) - new Date(form.start)) / (1000*60*60*24)) + 1;
            return (
              <div style={{ marginTop: 10, fontSize: 13, color: "#f97316", fontWeight: 600 }}>
                Duration: {dur} day{dur !== 1 ? "s" : ""}
              </div>
            );
          })()}
          <div style={{ ...S.grid2, marginTop: 12 }}>
            <div>
              <label style={S.label}>Venue</label>
              <input style={S.input} value={form.venue} onChange={e => u("venue", e.target.value)} placeholder="e.g. Los Angeles Convention Center" />
            </div>
            <div>
              <label style={S.label}>Region</label>
              <select style={S.input} value={form.region} onChange={e => u("region", e.target.value)}>
                <option>North America</option><option>Europe</option><option>Asia</option><option>Global</option><option>Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* PRICING TIERS */}
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: 0.5 }}>Pricing Tiers</div>
            <button onClick={addPricingTier} style={S.btnSecondary}>+ Add Tier</button>
          </div>
          {form.pricing.length === 0 && (
            <div style={{ color: "#64748b", fontSize: 13, fontStyle: "italic" }}>No pricing tiers yet. Add one above.</div>
          )}
          {form.pricing.map((tier, i) => {
            const isExpired = tier.deadline_passed || (tier.deadline && tier.deadline < TODAY);
            const isSoldOut = !!tier.sold_out;
            return (
            <div key={tier.id} style={{ background: isSoldOut ? "rgba(239,68,68,0.06)" : isExpired ? "rgba(239,68,68,0.03)" : "rgba(30,41,59,0.4)", borderRadius: 10, padding: 16, marginBottom: 8, border: isSoldOut ? "1px solid rgba(239,68,68,0.3)" : isExpired ? "1px solid rgba(239,68,68,0.15)" : "1px solid rgba(51,65,85,0.3)", opacity: isSoldOut ? 0.7 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isSoldOut ? "#ef4444" : isExpired ? "#ef4444" : "#1e293b" }}>Tier {i + 1}{isSoldOut ? " (SOLD OUT)" : isExpired ? " (EXPIRED)" : ""}</span>
                  {isSoldOut && <span style={{ fontSize: 9, color: "#ef4444", background: "rgba(239,68,68,0.1)", padding: "1px 6px", borderRadius: 3, fontWeight: 700 }}>SOLD OUT</span>}
                  {tier.requires_approval && <span style={{ fontSize: 9, color: "#f59e0b", background: "rgba(245,158,11,0.1)", padding: "1px 6px", borderRadius: 3, fontWeight: 700 }}>REQUIRES APPROVAL</span>}
                </div>
                <button onClick={() => removePricingTier(i)} style={{ ...S.btnGhost, color: "#ef4444" }}>Remove</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 2fr", gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={S.label}>Tier Name</label>
                  <input style={S.inputSm} value={tier.tier} onChange={e => updatePricing(i, "tier", e.target.value)} placeholder="e.g. Early Bird, Day Pass" />
                </div>
                <div>
                  <label style={S.label}>Price {tier.price === null ? "(unknown)" : ""}</label>
                  <input style={{ ...S.inputSm, color: tier.price === null ? "#f59e0b" : undefined }} type="number" value={tier.price === null ? "" : tier.price} onChange={e => updatePricing(i, "price", e.target.value === "" ? null : parseFloat(e.target.value) || 0)} placeholder="null = unknown" />
                </div>
                <div>
                  <label style={S.label}>Currency</label>
                  <select style={S.inputSm} value={tier.currency} onChange={e => updatePricing(i, "currency", e.target.value)}>
                    <option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option><option>AUD</option><option>CHF</option>
                  </select>
                </div>
                <div>
                  <label style={S.label}>Deadline</label>
                  <input style={{ ...S.inputSm, colorScheme: "dark" }} type="date" value={tier.deadline || ""} onChange={e => updatePricing(i, "deadline", e.target.value || null)} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 2fr", gap: 8 }}>
                <div>
                  <label style={S.label}>Days Included</label>
                  <input style={S.inputSm} value={tier.days_included || ""} onChange={e => updatePricing(i, "days_included", e.target.value)} placeholder='"all" or "Day 1 only"' />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: "#94a3b8" }}>
                    <input type="checkbox" checked={!!tier.deadline_passed} onChange={e => updatePricing(i, "deadline_passed", e.target.checked)} />
                    Deadline passed
                  </label>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: "#94a3b8" }}>
                    <input type="checkbox" checked={!!tier.requires_approval} onChange={e => updatePricing(i, "requires_approval", e.target.checked)} />
                    Requires approval
                  </label>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: isSoldOut ? "#ef4444" : "#94a3b8" }}>
                    <input type="checkbox" checked={isSoldOut} onChange={e => updatePricing(i, "sold_out", e.target.checked)} />
                    Sold out
                  </label>
                </div>
                <div>
                  <label style={S.label}>Notes</label>
                  <input style={S.inputSm} value={tier.notes} onChange={e => updatePricing(i, "notes", e.target.value)} placeholder="e.g. Includes networking dinner" />
                </div>
              </div>
            </div>
            );
          })}
        </div>

        {/* DISCOUNT CODE */}
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f97316", marginBottom: 16, textTransform: "uppercase", letterSpacing: 0.5 }}>CC Discount Code</div>
          <div style={S.grid4}>
            <div>
              <label style={S.label}>Code</label>
              <input style={{ ...S.input, fontFamily: "monospace", letterSpacing: 1 }} value={form.discount_code} onChange={e => u("discount_code", e.target.value.toUpperCase())} placeholder="e.g. RAAD-CC" />
            </div>
            <div>
              <label style={S.label}>Discount %</label>
              <input style={S.input} type="number" value={form.discount_pct} onChange={e => u("discount_pct", parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label style={S.label}>Max Uses</label>
              <input style={S.input} type="number" value={form.discount_max_uses || ""} onChange={e => u("discount_max_uses", e.target.value ? parseInt(e.target.value) : null)} placeholder="Empty = unlimited" />
            </div>
            <div>
              <label style={S.label}>Uses So Far</label>
              <input style={S.input} type="number" value={form.discount_uses} onChange={e => u("discount_uses", parseInt(e.target.value) || 0)} />
            </div>
          </div>
        </div>

        {/* HOTELS */}
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 0.5 }}>Hotel Partners</div>
            <button onClick={addHotel} style={S.btnSecondary}>+ Add Hotel</button>
          </div>
          {form.hotels.length === 0 && (
            <div style={{ color: "#64748b", fontSize: 13, fontStyle: "italic" }}>No hotel partners found. Add one or extraction may not have found hotel info.</div>
          )}
          {form.hotels.map((hotel, i) => (
            <div key={hotel.id} style={{ background: "rgba(30,41,59,0.4)", borderRadius: 10, padding: 16, marginBottom: 8, border: "1px solid rgba(96,165,250,0.15)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa" }}>Hotel {i + 1}</span>
                <button onClick={() => removeHotel(i)} style={{ ...S.btnGhost, color: "#ef4444" }}>Remove</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={S.label}>Hotel Name</label>
                  <input style={S.inputSm} value={hotel.name} onChange={e => updateHotel(i, "name", e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>Stars</label>
                  <select style={S.inputSm} value={hotel.stars} onChange={e => updateHotel(i, "stars", parseInt(e.target.value))}>
                    <option value={2}>2</option><option value={3}>3</option><option value={4}>4</option><option value={5}>5</option>
                  </select>
                </div>
                <div>
                  <label style={S.label}>Conf Rate</label>
                  <input style={S.inputSm} type="number" value={hotel.conf_rate} onChange={e => updateHotel(i, "conf_rate", parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <label style={S.label}>Rack Rate</label>
                  <input style={S.inputSm} type="number" value={hotel.rack_rate} onChange={e => updateHotel(i, "rack_rate", parseFloat(e.target.value) || 0)} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                <div>
                  <label style={S.label}>Book By</label>
                  <input style={{ ...S.inputSm, colorScheme: "dark" }} type="date" value={hotel.book_by} onChange={e => updateHotel(i, "book_by", e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>Distance</label>
                  <input style={S.inputSm} value={hotel.distance} onChange={e => updateHotel(i, "distance", e.target.value)} placeholder="0.2 mi" />
                </div>
                <div>
                  <label style={S.label}>Booking URL</label>
                  <input style={S.inputSm} value={hotel.booking_url} onChange={e => updateHotel(i, "booking_url", e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>Group Code</label>
                  <input style={S.inputSm} value={hotel.group_code} onChange={e => updateHotel(i, "group_code", e.target.value)} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* SPEAKERS & TAGS */}
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f97316", marginBottom: 16, textTransform: "uppercase", letterSpacing: 0.5 }}>Speakers & Tags</div>
          <div style={S.grid2}>
            <div>
              <label style={S.label}>Speakers</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input style={{ ...S.inputSm, flex: 1 }} value={newSpeaker} onChange={e => setNewSpeaker(e.target.value)} onKeyDown={e => e.key === "Enter" && addSpeaker()} placeholder="Speaker name" />
                <button onClick={addSpeaker} style={S.btnSecondary}>Add</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {form.speakers.map((s, i) => (
                  <span key={i} style={{ ...S.tag, background: "rgba(51,65,85,0.4)", color: "#cbd5e1", cursor: "pointer" }} onClick={() => removeSpeaker(i)}>{s} ×</span>
                ))}
              </div>
            </div>
            <div>
              <label style={S.label}>Tags</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input style={{ ...S.inputSm, flex: 1 }} value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === "Enter" && addTag()} placeholder="Tag" />
                <button onClick={addTag} style={S.btnSecondary}>Add</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {form.tags.map((t, i) => (
                  <span key={i} style={{ ...S.tag, background: "rgba(249,115,22,0.1)", color: "#fb923c", cursor: "pointer" }} onClick={() => removeTag(i)}>{t} ×</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ORGANIZER CONTACT & OUTREACH */}
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f97316", marginBottom: 16, textTransform: "uppercase", letterSpacing: 0.5 }}>Organizer Contact & Outreach</div>
          <div style={S.grid3}>
            <div>
              <label style={S.label}>Contact Name</label>
              <input style={S.input} value={form.organizer_contact?.name || ""} onChange={e => u("organizer_contact", { ...form.organizer_contact, name: e.target.value })} placeholder="e.g. Sarah Chen" />
            </div>
            <div>
              <label style={S.label}>Role / Title</label>
              <input style={S.input} value={form.organizer_contact?.role || ""} onChange={e => u("organizer_contact", { ...form.organizer_contact, role: e.target.value })} placeholder="e.g. Head of Partnerships" />
            </div>
            <div>
              <label style={S.label}>Email</label>
              <input style={S.input} value={form.organizer_contact?.email || ""} onChange={e => u("organizer_contact", { ...form.organizer_contact, email: e.target.value })} placeholder="partnerships@conference.com" />
            </div>
          </div>
          <div style={{ ...S.grid3, marginTop: 12 }}>
            <div>
              <label style={S.label}>Phone</label>
              <input style={S.input} value={form.organizer_contact?.phone || ""} onChange={e => u("organizer_contact", { ...form.organizer_contact, phone: e.target.value })} />
            </div>
            <div>
              <label style={S.label}>Website</label>
              <input style={S.input} value={form.organizer_contact?.website || ""} onChange={e => u("organizer_contact", { ...form.organizer_contact, website: e.target.value })} />
            </div>
            <div>
              <label style={S.label}>Outreach Status</label>
              <select style={S.input} value={form.organizer_contact?.outreach_status || "not_contacted"} onChange={e => u("organizer_contact", { ...form.organizer_contact, outreach_status: e.target.value })}>
                <option value="not_contacted">Not Contacted</option>
                <option value="emailed">Emailed</option>
                <option value="called">Called</option>
                <option value="in_discussion">In Discussion</option>
                <option value="agreed">Agreed — Code Pending</option>
                <option value="live">Live — Code Active</option>
                <option value="declined">Declined</option>
                <option value="no_response">No Response</option>
              </select>
            </div>
          </div>
          <div style={{ ...S.grid2, marginTop: 12 }}>
            <div>
              <label style={S.label}>Affiliate Program?</label>
              <select style={S.input} value={form.organizer_contact?.affiliate || "unknown"} onChange={e => u("organizer_contact", { ...form.organizer_contact, affiliate: e.target.value })}>
                <option value="unknown">Unknown</option>
                <option value="yes">Yes — Has Affiliate Program</option>
                <option value="no">No Affiliate Program</option>
                <option value="custom">Custom Deal Possible</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Affiliate / Commission Details</label>
              <input style={S.input} value={form.organizer_contact?.affiliate_details || ""} onChange={e => u("organizer_contact", { ...form.organizer_contact, affiliate_details: e.target.value })} placeholder="e.g. 15% commission, 30-day cookie, via Impact.com" />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={S.label}>Outreach Notes</label>
            <textarea style={{ ...S.input, minHeight: 60, resize: "vertical" }} value={form.organizer_contact?.notes || ""} onChange={e => u("organizer_contact", { ...form.organizer_contact, notes: e.target.value })} placeholder="e.g. Spoke with Sarah on Feb 15, she's checking with marketing team. Follow up March 1." />
          </div>
        </div>

        {/* BOTTOM ACTIONS */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <button onClick={onCancel} style={S.btnSecondary}>Cancel</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => onSave(form, isNew)} disabled={saving} style={{ ...S.btnPrimary, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving..." : isNew ? "Save as Draft" : "Save Changes"}
            </button>
            {(isNew || form.status === "draft") && (
              <button onClick={() => onSave({ ...form, status: "active" }, isNew)} disabled={saving} style={{ ...S.btnPrimary, background: "linear-gradient(135deg, #22c55e, #16a34a)", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : "Publish"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

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
          <div style={{ background: "#0f172a", borderRadius: 16, padding: 28, maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>Possible Duplicate</span>
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 8 }}>This looks similar to:</div>
            {dupeWarning.dupes.map((d, i) => (
              <div key={i} style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9", padding: "6px 0" }}>
                {d.name} — {d.city}, {d.start}
              </div>
            ))}
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 10, marginBottom: 18 }}>Save anyway?</div>
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
          <span style={{ fontSize: 11, color: "#64748b", background: "rgba(51,65,85,0.3)", padding: "2px 8px", borderRadius: 4, marginLeft: 4 }}>ADMIN</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setView("list"); setEditingConf(null); setExtractedData(null); }} style={view === "list" ? S.btnPrimary : S.btnSecondary}>All Conferences</button>
          <button onClick={() => { setView("add"); setEditingConf(null); setExtractedData(null); setExtractUrl(""); setExtractStatus(""); }} style={view === "add" ? S.btnPrimary : S.btnSecondary}>+ Add New</button>
        </div>
      </div>

      <div style={S.container}>
        {/* ============ ADD VIEW ============ */}
        {view === "add" && !extractedData && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", marginBottom: 20 }}>Add Conference</h2>

            {/* URL EXTRACT */}
            <div style={{ ...S.card, border: "1px solid rgba(249,115,22,0.3)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f97316", marginBottom: 4 }}>PASTE URL(s) — Claude will extract everything</div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>Paste the main page URL. If pricing is on a separate registration page, paste that URL too (one per line).</div>
              <div style={{ display: "flex", gap: 12 }}>
                <textarea
                  style={{ ...S.input, flex: 1, fontSize: 14, minHeight: 56, resize: "vertical", fontFamily: "monospace" }}
                  value={extractUrl}
                  onChange={e => setExtractUrl(e.target.value)}
                  placeholder={"https://events.economist.com/technology-for-change-week/
https://events.economist.com/technology-for-change-week/registration/"}
                  disabled={extracting}
                  rows={2}
                />
                <button onClick={handleExtract} disabled={extracting || !extractUrl.trim()} style={{ ...S.btnPrimary, opacity: extracting ? 0.6 : 1, minWidth: 120 }}>
                  {extracting ? "Extracting..." : "Extract"}
                </button>
              </div>
              {extractStatus && (
                <div style={{ marginTop: 12, fontSize: 13, color: extracting ? "#fb923c" : (extractStatus.includes("Error") ? "#ef4444" : "#22c55e"), display: "flex", alignItems: "center", gap: 8 }}>
                  {extracting && (
                    <div style={{ width: 14, height: 14, border: "2px solid rgba(249,115,22,0.3)", borderTop: "2px solid #f97316", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  )}
                  {extractStatus}
                </div>
              )}
            </div>

            <div style={{ textAlign: "center", color: "#94a3b8", margin: "20px 0", fontSize: 13 }}>— or —</div>

            {/* MANUAL ENTRY */}
            <button onClick={() => {
              setExtractedData({
                id: `conf_${Date.now()}`, source_url: "", name: "", organizer: "", description: "", category: "Longevity / Health",
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
          />
        )}

        {view === "edit" && editingConf && (
          <ConferenceForm
            initial={editingConf}
            onSave={(conf) => handleSave(conf, false)}
            onCancel={() => { setView("list"); setEditingConf(null); }}
            isNew={false}
            saving={saving}
          />
        )}

        {/* ============ LIST VIEW ============ */}
        {view === "list" && (
          <div>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Total", count: counts.all, color: "#f1f5f9" },
                { label: "Active", count: counts.active, color: "#22c55e" },
                { label: "Draft", count: counts.draft, color: "#f97316" },
                { label: "Expired", count: counts.expired, color: "#ef4444" },
              ].map((s, i) => (
                <div key={i} style={{ ...S.card, textAlign: "center", cursor: "pointer", border: filterStatus === s.label.toLowerCase() ? `1px solid ${s.color}` : undefined }}
                  onClick={() => setFilterStatus(filterStatus === s.label.toLowerCase() ? "all" : s.label.toLowerCase())}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.count}</div>
                  <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Search & filters */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <input style={{ ...S.input, flex: 1 }} value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search conferences..." />
              <select style={{ ...S.input, width: 180 }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                <option value="all">All Categories</option>
                <option>Longevity / Health</option>
                <option>AI / Tech</option>
                <option>Other</option>
              </select>
            </div>

            {/* Conference list */}
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>
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
              return (
                <div key={conf.id} style={{ ...S.card, cursor: "pointer", transition: "all 0.2s" }}
                  onClick={() => { setEditingConf(conf); setView("edit"); }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ ...S.tag, background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text }}>{conf.status.toUpperCase()}</span>
                        <span style={{ ...S.tag, background: conf.category.includes("Longevity") ? "rgba(52,211,153,0.1)" : "rgba(96,165,250,0.1)", color: conf.category.includes("Longevity") ? "#34d399" : "#60a5fa" }}>{conf.category}</span>
                        {conf.discount_code && (
                          <span style={{ ...S.tag, background: "rgba(249,115,22,0.1)", color: "#f97316" }}>{conf.discount_code} ({conf.discount_pct}% off)</span>
                        )}
                        {hasFree && (
                          <span style={{ ...S.tag, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}>FREE TIER</span>
                        )}
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>{conf.name || "Untitled"}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>
                        {conf.city && conf.country ? `${conf.city}, ${conf.country}` : "Location TBD"}
                        {conf.start && ` · ${new Date(conf.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                        {conf.end && conf.end !== conf.start && ` – ${new Date(conf.end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                        {duration && <span style={{ color: "#64748b" }}> · {duration} day{duration !== 1 ? "s" : ""}</span>}
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
                        <div style={{ fontSize: 11, color: "#64748b" }}>
                          {lowestPrice === 0 ? "Free" : `from $${lowestPrice.toLocaleString()}`}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: "#64748b" }}>
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
        input:focus, select:focus, textarea:focus { border-color: rgba(249,115,22,0.5) !important; }
        ::placeholder { color: #475569; }
        select { cursor: pointer; }
      `}</style>
    </div>
  );
}
