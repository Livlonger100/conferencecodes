// @ts-nocheck
"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const FORMATS = ["All Formats", "In-person", "Virtual", "Hybrid"];

function transformConference(c: any) {
  const tiers = (c.pricing_tiers || []).sort((a: any, b: any) => (a.sort_order||0) - (b.sort_order||0));
  const lowestPrice = tiers.length > 0 ? Math.min(...tiers.filter((t: any) => t.price != null && !t.sold_out).map((t: any) => parseFloat(t.price))) : null;
  const highestPrice = tiers.length > 0 ? Math.max(...tiers.filter((t: any) => t.price != null).map((t: any) => parseFloat(t.price))) : null;
  
  // Find earliest non-expired time-based tier as "early bird"
  const now = new Date();
  const timeTiers = tiers.filter((t: any) => t.deadline && !t.sold_out && new Date(t.deadline) > now);
  const earlyBird = timeTiers.length > 0 ? parseFloat(timeTiers[0].price) : null;
  const earlyBirdDeadline = timeTiers.length > 0 ? timeTiers[0].deadline : null;
  const earlyBirdIsEarlyBird = timeTiers.length > 0 ? (timeTiers[0].is_early_bird || false) : false;
  
  return {
    id: c.id,
    name: c.name || "",
    slug: c.slug || "",
    organizer: c.organizer || "",
    description: c.description || "",
    category: c.category || "AI / Tech",
    format: c.format || "In-person",
    status: c.status || "active",
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
    discount: c.discount_code || null,
    discountPct: c.discount_pct || 0,
    price: highestPrice || lowestPrice || 0,
    earlyBird,
    earlyBirdDeadline,
    earlyBirdIsEarlyBird,
    verified: true,
    lastVerified: c.updated_at ? c.updated_at.split("T")[0] : "",
    hotels: (c.hotels || []).map((h: any) => ({
      name: h.name || "",
      stars: h.stars || 3,
      confRate: h.conf_rate ? parseFloat(h.conf_rate) : null,
      rackRate: h.rack_rate ? parseFloat(h.rack_rate) : null,
      bookBy: h.book_by || "",
      distance: h.distance || "",
    })),
    pricingTiers: tiers.map((t: any) => ({
      label: t.tier_name || "Standard",
      price: t.price != null ? parseFloat(t.price) : null,
      priceAfterDeadline: t.price_after_deadline != null ? parseFloat(t.price_after_deadline) : null,
      deadline: t.deadline || null,
      isTimeWindow: !!t.deadline,
      sold_out: t.sold_out || false,
      requires_approval: t.requires_approval || false,
      isEarlyBird: t.is_early_bird || false,
    })),
  };
}


function daysUntil(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateRange(startStr, endStr) {
  const s = new Date(startStr);
  const e = new Date(endStr);
  const mo = (d) => d.toLocaleDateString("en-US", { month: "short" });
  const yr = (d) => d.getFullYear();
  const day = (d) => d.getDate();
  if (mo(s) === mo(e) && yr(s) === yr(e)) {
    return `${mo(s)} ${day(s)}-${day(e)}, ${yr(s)}`;
  }
  return `${mo(s)} ${day(s)} - ${mo(e)} ${day(e)}, ${yr(e)}`;
}

function formatPrice(p) {
  return p != null ? "$" + p.toLocaleString() : "TBA";
}

function getConferenceStatus(start, end) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(start);
  startDate.setHours(0, 0, 0, 0);
  const endDate = end ? new Date(end) : new Date(start);
  endDate.setHours(0, 0, 0, 0);

  if (today > endDate) return { status: "ended", label: "Ended", color: "#9ca3af", pulse: false };
  if (today.getTime() === startDate.getTime()) return { status: "today", label: "Starts today", color: "#22c55e", pulse: false };
  if (today > startDate && today <= endDate) return { status: "live", label: "Happening now", color: "#22c55e", pulse: true };
  const days = Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return { status: "upcoming", label: days === 1 ? "Tomorrow" : `${days} days away`, color: "#f97316", pulse: false };
}

// Determine current and next price from a conference's pricing tiers
function getCurrentPricing(conf) {
  const now = new Date();
  const tiers = conf.pricingTiers || [];
  
  // Separate time-based tiers (with deadlines) from different ticket types (requires_approval, no deadline)
  const baseTiers = tiers.filter(t => t.isTimeWindow && !t.requires_approval && !t.sold_out);
  const specialTiers = tiers.filter(t => !t.isTimeWindow || t.requires_approval);
  
  if (baseTiers.length === 0) {
    // Fallback to old model
    return {
      currentPrice: conf.earlyBird || conf.price,
      standardPrice: conf.price,
      nextPrice: conf.earlyBird ? conf.price : null,
      nextPriceDate: conf.earlyBirdDeadline || null,
      daysUntilIncrease: conf.earlyBirdDeadline ? daysUntil(conf.earlyBirdDeadline) : null,
      isEarlyBird: !!conf.earlyBird,
      label: conf.earlyBird ? "Early Bird" : "Standard",
    };
  }
  
  // Sort by deadline ascending (null deadline = final price, goes last)
  const sorted = [...baseTiers].sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });
  
  // Find current active tier (first one whose deadline hasn't passed)
  let currentIdx = sorted.findIndex(t => t.deadline && new Date(t.deadline) >= now);
  if (currentIdx === -1) currentIdx = sorted.length - 1; // all deadlines passed, use final
  
  const current = sorted[currentIdx];
  const next = currentIdx < sorted.length - 1 ? sorted[currentIdx + 1] : null;
  
  // Use priceAfterDeadline if set, otherwise fall back to next tier's price
  const nextPrice = current.priceAfterDeadline || (next ? next.price : null);
  
  return {
    currentPrice: current.price,
    standardPrice: sorted[sorted.length - 1].price,
    nextPrice,
    nextPriceDate: current.deadline || null,
    daysUntilIncrease: current.deadline ? daysUntil(current.deadline) : null,
    isEarlyBird: currentIdx < sorted.length - 1 || !!current.priceAfterDeadline,
    label: current.label || "Current Price",
    specialTiers,
  };
}

function VerifiedBadge({ confidence, lastVerified }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: confidence > 0.9 ? "#22c55e" : confidence > 0.8 ? "#f59e0b" : "#ef4444" }} />
      <span style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 0.3 }}>Verified {lastVerified}</span>
    </div>
  );
}

function DiscountBadge({ code, pct }) {
  if (!code) return null;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: "var(--cc-gold)", borderRadius: 6, padding: "5px 10px",
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--cc-ink)" strokeWidth="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
      <span style={{ color: "var(--cc-ink)", fontWeight: 700, fontSize: 12, letterSpacing: 0.5 }}>{pct}% OFF</span>
    </div>
  );
}

function DynamicPricingBadge({ conf }) {
  const p = getCurrentPricing(conf);
  if (!p.nextPrice || !p.daysUntilIncrease || p.daysUntilIncrease < 0) {
    // Fallback for old model
    if (conf.earlyBirdDeadline) {
      const days = daysUntil(conf.earlyBirdDeadline);
      if (days < 0) return <span style={{ fontSize: 11, color: "#9ca3af" }}>{conf.earlyBirdIsEarlyBird ? "Early bird expired" : "Price increase passed"}</span>;
      const color = days < 30 ? "#ef4444" : "#f59e0b";
      const label = conf.earlyBirdIsEarlyBird
        ? `Early bird: ${days} days left`
        : `Price increases after ${formatDate(conf.earlyBirdDeadline)}`;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span style={{ fontSize: 11, color, fontWeight: 600 }}>{label}</span>
        </div>
      );
    }
    return null;
  }
  const urgent = p.daysUntilIncrease <= 7;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      background: urgent ? "rgba(239,68,68,0.08)" : "rgba(249,115,22,0.08)",
      border: `1px solid ${urgent ? "rgba(239,68,68,0.2)" : "rgba(249,115,22,0.2)"}`,
      borderRadius: 8, padding: "6px 12px", marginTop: 4,
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={urgent ? "#ef4444" : "#f97316"} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span style={{ fontSize: 12, fontWeight: 700, color: urgent ? "#ef4444" : "#f97316" }}>
        Up to {formatPrice(p.nextPrice)} in {p.daysUntilIncrease} day{p.daysUntilIncrease !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

function getCategoryStyle(category) {
  const map = {
    "AI / Tech":          { bg: "#EEEDFE", text: "#3C3489" },
    "AI/ML":              { bg: "#EEEDFE", text: "#3C3489" },
  };
  return map[category] || { bg: "#F5F1E8", text: "#4D4B42" };
}

function ConferenceCard({ conf }) {
  const [hovered, setHovered] = useState(false);
  const router = useRouter();
  const confStatus = getConferenceStatus(conf.start, conf.end || null);
  const isEnded = confStatus.status === "ended";
  const catStyle = getCategoryStyle(conf.category);
  const p = getCurrentPricing(conf);

  const startDate = new Date(conf.start);
  const monthAbbr = startDate.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const dayNum = startDate.getDate();

  return (
    <div
      onClick={() => router.push('/conference/' + conf.slug)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#ffffff",
        border: `1px solid ${hovered ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.08)"}`,
        borderRadius: 14,
        padding: "16px 20px",
        cursor: "pointer",
        transition: "border-color 0.2s, box-shadow 0.2s",
        boxShadow: hovered ? "0 2px 12px rgba(0,0,0,0.08)" : "none",
        opacity: isEnded ? 0.6 : 1,
        display: "grid",
        gridTemplateColumns: "80px 1fr auto",
        gap: 16,
        alignItems: "center",
      }}
    >
      {/* Date block */}
      <div style={{
        width: 80, height: 80, borderRadius: 12, flexShrink: 0,
        background: catStyle.bg,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: catStyle.text, letterSpacing: "0.5px" }}>{monthAbbr}</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: catStyle.text, lineHeight: 1.1 }}>{dayNum}</div>
      </div>

      {/* Info */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--cc-ink)", marginBottom: 4, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {conf.name}
        </div>
        <div style={{ fontSize: 12, color: "var(--cc-muted)", marginBottom: 8 }}>
          {formatDateRange(conf.start, conf.end)} · {conf.city}, {conf.country}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {(conf.discount || conf.discountPct > 0) && (
            <span style={{ fontSize: 11, fontWeight: 500, background: "#E2F5D6", color: "#1D6B10", borderRadius: 6, padding: "2px 8px" }}>
              {conf.discountPct > 0 ? `${conf.discountPct}% off` : "Code"}
            </span>
          )}
          {p.isEarlyBird && p.daysUntilIncrease && p.daysUntilIncrease > 0 && (
            <span style={{ fontSize: 11, fontWeight: 500, background: "var(--cc-gold-bg)", color: "var(--cc-gold-dk)", borderRadius: 6, padding: "2px 8px" }}>
              Early bird
            </span>
          )}
          <span style={{ fontSize: 11, fontWeight: 500, background: catStyle.bg, color: catStyle.text, borderRadius: 6, padding: "2px 8px" }}>
            {conf.category}
          </span>
        </div>
      </div>

      {/* Get code button */}
      <div style={{ flexShrink: 0 }}>
        <button
          onClick={e => { e.stopPropagation(); router.push('/conference/' + conf.slug); }}
          style={{
            background: "var(--cc-gold)",
            color: "var(--cc-ink)",
            border: "none",
            borderRadius: 10,
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
            opacity: hovered ? 0.88 : 1,
            transition: "opacity 0.15s",
          }}
        >
          Get code
        </button>
      </div>
    </div>
  );
}


export default function HomeClient() {
  const [conferences, setConferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locationQuery, setLocationQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [format, setFormat] = useState("All Formats");
  const [searchQuery, setSearchQuery] = useState("");
  const [maxPrice, setMaxPrice] = useState(10000);
  const [showDeepSearch, setShowDeepSearch] = useState(false);
  const [deepSearchQuery, setDeepSearchQuery] = useState("");
  const [deepSearching, setDeepSearching] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [submitModal, setSubmitModal] = useState(false);
  const [submitUrl, setSubmitUrl] = useState("");
  const [submitEmail, setSubmitEmail] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [sortBy, setSortBy] = useState("date");
  const [visibleCount, setVisibleCount] = useState(10);
  const [countryFilter, setCountryFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");

  useEffect(() => {
    setMounted(true);
    fetch("/api/public/conferences")
      .then(r => r.json())
      .then(data => {
        setConferences(data.map(transformConference));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    setVisibleCount(10);
  }, [countryFilter, cityFilter, dateFrom, searchQuery, sortBy]);

  const CONFERENCES = conferences;

  // Derive unique cities, countries, regions from data
  const allLocations = [...new Set(CONFERENCES.flatMap(c => [c.city, c.country, c.region]))];
  const allCountries = [...new Set(CONFERENCES.map(c => c.country))].filter(Boolean).sort();
  const allCities = [...new Set(CONFERENCES.map(c => c.city))].filter(Boolean).sort();

  const filtered = CONFERENCES.filter(c => {
    if (format !== "All Formats" && c.format !== format) return false;

    // Location: match against city, country, or region (fuzzy)
    if (locationQuery) {
      const q = locationQuery.toLowerCase().trim();
      const loc = `${c.city} ${c.country} ${c.region}`.toLowerCase();
      if (!loc.includes(q)) return false;
    }
    if (countryFilter && c.country !== countryFilter) return false;
    if (cityFilter && c.city !== cityFilter) return false;

    // Date range: conference overlaps with selected range
    if (dateFrom) {
      const from = new Date(dateFrom);
      const confEnd = new Date(c.end);
      if (confEnd < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      const confStart = new Date(c.start);
      if (confStart > to) return false;
    }

    const effectivePrice = c.earlyBird || c.price;
    if (effectivePrice > maxPrice) return false;

    // Free text search across everything
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const searchable = `${c.name} ${c.city} ${c.country} ${c.region} ${c.description} ${c.category} ${c.tags.join(" ")} ${c.speakers.join(" ")}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const priority = (c) => {
      const s = getConferenceStatus(c.start, c.end || null);
      if (s.status === "live" || s.status === "today") return 0;
      if (s.status === "upcoming") return 1;
      return 2;
    };
    const pa = priority(a), pb = priority(b);
    if (pa !== pb) return pa - pb;
    return new Date(a.start) - new Date(b.start);
  });

  const sortedFiltered = sortBy === "date" ? filtered : [...filtered].sort((a, b) => {
    if (sortBy === "discount") return (b.discountPct || 0) - (a.discountPct || 0);
    if (sortBy === "recent") return new Date(b.lastVerified).getTime() - new Date(a.lastVerified).getTime();
    return 0;
  });

  const activeFilterCount = [
    locationQuery !== "",
    countryFilter !== "",
    cityFilter !== "",
    dateFrom !== "",
    dateTo !== "",
    format !== "All Formats",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setLocationQuery(""); setCountryFilter(""); setCityFilter("");
    setDateFrom(""); setDateTo(""); setFormat("All Formats"); setSearchQuery("");
  };

  const handleDeepSearch = () => {
    if (!deepSearchQuery.trim()) return;
    setDeepSearching(true);
    setTimeout(() => setDeepSearching(false), 3000);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--cc-cream)",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      color: "var(--cc-ink)",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes statusPulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.5; } }
        * { box-sizing: border-box; }
        #cc-nav { background-color: #1C1B17 !important; }
        #cc-hero { background-color: #EDBA2A !important; }
        #cc-footer { background-color: #1C1B17 !important; }
        input:focus, select:focus { outline: none; border-color: #EDBA2A !important; }
        input::placeholder { color: #8A8880; }
        select { appearance: none; -webkit-appearance: none; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(138,136,128,0.4); border-radius: 3px; }
      `}</style>

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: "var(--cc-ink)", marginBottom: 8 }}>
              Conference<span style={{ color: "var(--cc-gold)" }}>Codes</span>
            </div>
            <div style={{ color: "var(--cc-muted)", fontSize: 14 }}>Loading conferences...</div>
          </div>
        </div>
      )}

      {!loading && <>
      {/* DARK NAV */}
      <div id="cc-nav" style={{ background: "#1C1B17", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <nav style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", display: "flex", justifyContent: "space-between", alignItems: "center", height: 60 }}>
          <a href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>
              <span style={{ color: "#ffffff" }}>Conference</span>
              <span style={{ color: "var(--cc-gold)" }}>Codes</span>
            </span>
          </a>
          <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
            <a href="/ai-conferences" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>AI Conferences</a>
            <a href="/how-it-works" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>How It Works</a>
            <a href="/for-organizers" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>For Organizers</a>
            <button
              onClick={() => { setSubmitModal(true); setSubmitDone(false); setSubmitUrl(""); setSubmitEmail(""); }}
              style={{
                background: "transparent", border: "1px solid rgba(255,255,255,0.25)",
                color: "rgba(255,255,255,0.65)", padding: "7px 18px", borderRadius: 10,
                fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              }}
            >Submit a Conference</button>
          </div>
        </nav>
      </div>

      {/* GOLD HERO BANNER */}
      <div id="cc-hero" style={{ background: "#EDBA2A", padding: "48px 32px", position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: -80, right: -80,
          width: 280, height: 280, borderRadius: "50%",
          background: "rgba(255,255,255,0.12)", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: -100, left: -60,
          width: 340, height: 340, borderRadius: "50%",
          background: "rgba(255,255,255,0.12)", pointerEvents: "none",
        }} />
        <div style={{ maxWidth: 1200, margin: "0 auto", textAlign: "center", position: "relative" }}>
          <h1 style={{
            fontSize: 32, fontWeight: 600, letterSpacing: "-0.8px",
            color: "#1C1B17", margin: "0 0 10px 0", lineHeight: 1.2,
          }}>
            Discount codes for the world&apos;s best AI conferences
          </h1>
          <p style={{ fontSize: 15, color: "#8B6914", margin: 0, fontWeight: 400 }}>
            {CONFERENCES.length} verified conferences with active discount codes
          </p>
        </div>
      </div>

      {/* SEARCH & FILTER PANEL */}
      <div style={{ background: "#ffffff", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 32px" }}>
          {/* Search bar */}
          <div style={{ position: "relative", marginBottom: 16 }}>
            <svg style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cc-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text" placeholder="Search conferences, speakers, topics..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              style={{
                width: "100%", padding: "12px 110px 12px 42px", borderRadius: 8,
                background: "#f9fafb", border: "1px solid #d1d5db",
                color: "var(--cc-ink)", fontSize: 14, fontFamily: "inherit", outline: "none",
              }}
            />
            <button
              onClick={() => (document.activeElement as HTMLElement)?.blur()}
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                padding: "7px 20px", borderRadius: 7,
                background: "var(--cc-ink)", border: "none",
                color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}
            >Search</button>
          </div>

          {/* 3-column filter grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--cc-muted)", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 6 }}>Date from</div>
              <input
                type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{
                  width: "100%", padding: "9px 10px", borderRadius: 8,
                  background: "#f9fafb", border: "1px solid #d1d5db",
                  color: "var(--cc-body)", fontSize: 13, fontFamily: "inherit", outline: "none",
                  colorScheme: "light",
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 10, color: "var(--cc-muted)", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 6 }}>Country</div>
              <select
                value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 8,
                  background: "#f9fafb", border: "1px solid #d1d5db",
                  color: "var(--cc-body)", fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                  appearance: "none", WebkitAppearance: "none", outline: "none",
                }}
              >
                <option value="">All Countries</option>
                {allCountries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 10, color: "var(--cc-muted)", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 6 }}>City</div>
              <select
                value={cityFilter} onChange={e => setCityFilter(e.target.value)}
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 8,
                  background: "#f9fafb", border: "1px solid #d1d5db",
                  color: "var(--cc-body)", fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                  appearance: "none", WebkitAppearance: "none", outline: "none",
                }}
              >
                <option value="">All Cities</option>
                {allCities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Active filter tags */}
          {activeFilterCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(0,0,0,0.06)" }}>
              {countryFilter && (
                <span style={{ fontSize: 11, color: "var(--cc-gold-dk)", background: "var(--cc-gold-bg)", borderRadius: 20, padding: "4px 12px", display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                  {countryFilter}
                  <button onClick={() => setCountryFilter("")} style={{ background: "none", border: "none", color: "var(--cc-gold-dk)", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                </span>
              )}
              {cityFilter && (
                <span style={{ fontSize: 11, color: "var(--cc-gold-dk)", background: "var(--cc-gold-bg)", borderRadius: 20, padding: "4px 12px", display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                  {cityFilter}
                  <button onClick={() => setCityFilter("")} style={{ background: "none", border: "none", color: "var(--cc-gold-dk)", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                </span>
              )}
              {dateFrom && (
                <span style={{ fontSize: 11, color: "var(--cc-gold-dk)", background: "var(--cc-gold-bg)", borderRadius: 20, padding: "4px 12px", display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                  From {dateFrom}
                  <button onClick={() => setDateFrom("")} style={{ background: "none", border: "none", color: "var(--cc-gold-dk)", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                </span>
              )}
              <button onClick={clearFilters} style={{
                background: "none", border: "none", color: "var(--cc-muted)", cursor: "pointer",
                fontSize: 12, fontFamily: "inherit", textDecoration: "underline", padding: 0, marginLeft: 4,
              }}>Clear all</button>
            </div>
          )}
        </div>
      </div>

      {/* RESULTS BAR */}
      <div style={{ background: "var(--cc-warm-gray)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "12px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--cc-body)" }}>
            Showing <span style={{ color: "var(--cc-ink)", fontWeight: 600 }}>{filtered.length}</span> conferences with active codes
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--cc-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px" }}>Sort</span>
            <select
              value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{
                padding: "6px 28px 6px 10px", borderRadius: 8, fontSize: 12,
                background: "#fff", border: "1px solid rgba(0,0,0,0.12)",
                color: "var(--cc-body)", fontFamily: "inherit", cursor: "pointer",
                appearance: "none", WebkitAppearance: "none", outline: "none",
              }}
            >
              <option value="date">Date soonest</option>
              <option value="discount">Biggest discount</option>
              <option value="recent">Recently added</option>
            </select>
          </div>
        </div>
      </div>

      {/* CONFERENCE LISTING */}
      <div style={{ background: "var(--cc-cream)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 32px 80px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {sortedFiltered.slice(0, visibleCount).map((conf, i) => (
              <div key={conf.id} style={{ animation: `fadeIn ${0.1 + i * 0.04}s ease` }}>
                <ConferenceCard conf={conf} />
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" style={{ display: "block", margin: "0 auto 16px" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--cc-muted)", margin: "0 0 8px" }}>No conferences match your filters</h3>
              <p style={{ fontSize: 14, color: "var(--cc-muted)", margin: 0 }}>Try broadening your search.</p>
            </div>
          )}

          {/* LOAD MORE */}
          {visibleCount < sortedFiltered.length && (
            <div style={{ textAlign: "center", marginTop: 32 }}>
              <button
                onClick={() => setVisibleCount(v => v + 10)}
                style={{
                  padding: "12px 36px", borderRadius: 10,
                  background: "transparent", border: "1px solid rgba(0,0,0,0.15)",
                  color: "var(--cc-body)", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.3)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.15)")}
              >
                Load more conferences
              </button>
            </div>
          )}
        </div>
      </div>

      {/* DARK FOOTER */}
      <div id="cc-footer" style={{ background: "#1C1B17", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>© 2026 ConferenceCodes</span>
          <div style={{ display: "flex", gap: 24 }}>
            <a href="/for-organizers" style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>For Organizers</a>
            <a href="/how-it-works" style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>How It Works</a>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Privacy</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Terms</span>
          </div>
        </div>
      </div>
      </>}

      {/* Submit a Conference modal */}
      {submitModal && (
        <div onClick={() => setSubmitModal(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 20,
            padding: 32, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          }}>
            {submitDone ? (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Thanks for the tip!</div>
                <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 24 }}>We'll review it and add it to the list if it's a good fit.</div>
                <button onClick={() => setSubmitModal(false)} style={{ padding: "10px 28px", borderRadius: 8, background: "#f3f4f6", border: "1px solid #e5e7eb", color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 6 }}>Submit a Conference</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>Know a conference we're missing? Share the link.</div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Conference URL *</label>
                  <input
                    type="url" placeholder="https://..." value={submitUrl}
                    onChange={e => setSubmitUrl(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "#f9fafb", border: "1px solid #d1d5db", color: "#111827", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Your Email <span style={{ color: "#9ca3af", fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                  <input
                    type="email" placeholder="you@email.com" value={submitEmail}
                    onChange={e => setSubmitEmail(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "#f9fafb", border: "1px solid #d1d5db", color: "#111827", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setSubmitModal(false)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: "#f3f4f6", border: "1px solid #e5e7eb", color: "#6b7280", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  <button
                    disabled={!submitUrl.trim() || submitLoading}
                    onClick={async () => {
                      setSubmitLoading(true);
                      await fetch("/api/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: submitUrl, email: submitEmail }) });
                      setSubmitLoading(false);
                      setSubmitDone(true);
                    }}
                    style={{ flex: 2, padding: "10px 0", borderRadius: 8, background: "var(--cc-gold)", border: "none", color: "var(--cc-ink)", fontSize: 14, fontWeight: 700, cursor: !submitUrl.trim() || submitLoading ? "not-allowed" : "pointer", opacity: !submitUrl.trim() || submitLoading ? 0.6 : 1 }}
                  >{submitLoading ? "Submitting..." : "Submit"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
