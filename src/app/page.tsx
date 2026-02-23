// @ts-nocheck
"use client";
import { useState, useEffect, useRef } from "react";

const CATEGORIES = ["All", "AI / Tech", "Longevity / Health"];
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
      deadline: t.deadline || null,
      isTimeWindow: !!t.deadline,
      sold_out: t.sold_out || false,
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

function formatPrice(p) {
  return p != null ? "$" + p.toLocaleString() : "TBA";
}

// Determine current and next price from a conference's pricing tiers
function getCurrentPricing(conf) {
  const now = new Date();
  const tiers = conf.pricingTiers || [];
  
  // Separate time-based tiers (same base ticket with deadlines) from different ticket types
  const baseTiers = tiers.filter(t => t.isTimeWindow);
  const specialTiers = tiers.filter(t => !t.isTimeWindow);
  
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
  
  return {
    currentPrice: current.price,
    standardPrice: sorted[sorted.length - 1].price,
    nextPrice: next ? next.price : null,
    nextPriceDate: current.deadline || null,
    daysUntilIncrease: current.deadline ? daysUntil(current.deadline) : null,
    isEarlyBird: currentIdx < sorted.length - 1,
    label: current.label || "Current Price",
    specialTiers,
  };
}

function VerifiedBadge({ confidence, lastVerified }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: confidence > 0.9 ? "#22c55e" : confidence > 0.8 ? "#f59e0b" : "#ef4444" }} />
      <span style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 0.3 }}>Verified {lastVerified}</span>
    </div>
  );
}

function DiscountBadge({ code, pct }) {
  if (!code) return null;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: "linear-gradient(135deg, #f97316, #ea580c)", borderRadius: 6, padding: "5px 10px",
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
      <span style={{ color: "#fff", fontWeight: 700, fontSize: 12, letterSpacing: 0.5 }}>{pct}% OFF</span>
    </div>
  );
}

function DynamicPricingBadge({ conf }) {
  const p = getCurrentPricing(conf);
  if (!p.nextPrice || !p.daysUntilIncrease || p.daysUntilIncrease < 0) {
    // Fallback for old model
    if (conf.earlyBirdDeadline) {
      const days = daysUntil(conf.earlyBirdDeadline);
      if (days < 0) return <span style={{ fontSize: 11, color: "#94a3b8" }}>Early bird expired</span>;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={days < 30 ? "#ef4444" : "#f59e0b"} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span style={{ fontSize: 11, color: days < 30 ? "#ef4444" : "#f59e0b", fontWeight: 600 }}>Early bird: {days} days left</span>
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

function ConferenceCard({ conf, onClick }) {
  const [hovered, setHovered] = useState(false);
  const duration = Math.ceil((new Date(conf.end) - new Date(conf.start)) / (1000 * 60 * 60 * 24)) + 1;
  return (
    <div
      onClick={() => onClick(conf)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "rgba(30,41,59,0.95)" : "rgba(15,23,42,0.8)",
        border: `1px solid ${hovered ? "rgba(249,115,22,0.4)" : "rgba(51,65,85,0.5)"}`,
        borderRadius: 16, padding: 24, cursor: "pointer",
        transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
        boxShadow: hovered ? "0 20px 60px rgba(0,0,0,0.4), 0 0 40px rgba(249,115,22,0.08)" : "0 4px 20px rgba(0,0,0,0.3)",
        position: "relative", overflow: "hidden",
      }}
    >
      {hovered && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent, #f97316, transparent)" }} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <span style={{
            display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase",
            color: conf.category === "Longevity / Health" ? "#34d399" : "#60a5fa",
            background: conf.category === "Longevity / Health" ? "rgba(52,211,153,0.1)" : "rgba(96,165,250,0.1)",
            padding: "3px 8px", borderRadius: 4, marginBottom: 8,
          }}>{conf.category}</span>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", margin: 0, lineHeight: 1.3 }}>{conf.name}</h3>
        </div>
        <DiscountBadge code={conf.discount} pct={conf.discountPct} />
      </div>

      <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 16px 0", lineHeight: 1.5 }}>{conf.description}</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span style={{ fontSize: 13, color: "#cbd5e1" }}>{conf.city}, {conf.country}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span style={{ fontSize: 13, color: "#cbd5e1" }}>{formatDate(conf.start)} \u2013 {formatDate(conf.end)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span style={{ fontSize: 13, color: "#cbd5e1" }}>{duration} days</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          <span style={{ fontSize: 13, color: "#cbd5e1" }}>{conf.attendees ? conf.attendees.toLocaleString() : "TBA"} attendees</span>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, borderTop: "1px solid rgba(51,65,85,0.4)" }}>
        <div>
          {(() => {
            const p = getCurrentPricing(conf);
            return (
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: "#f97316" }}>{formatPrice(p.currentPrice)}</span>
                {p.currentPrice < p.standardPrice && (
                  <span style={{ fontSize: 14, fontWeight: 400, color: "#94a3b8", textDecoration: "line-through" }}>{formatPrice(p.standardPrice)}</span>
                )}
              </div>
            );
          })()}
          <DynamicPricingBadge conf={conf} />
        </div>
        {conf.hotels && conf.hotels.length > 0 && (() => {
          const cheapest = conf.hotels.reduce((a, b) => a.confRate < b.confRate ? a : b);
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.12)", borderRadius: 8, padding: "6px 10px" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11"/></svg>
              <span style={{ fontSize: 12, color: "#60a5fa", fontWeight: 600 }}>from {formatPrice(cheapest.confRate)}/nt</span>
              <span style={{ fontSize: 11, color: "#94a3b8", textDecoration: "line-through" }}>{formatPrice(cheapest.rackRate)}</span>
            </div>
          );
        })()}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <VerifiedBadge confidence={conf.confidence} lastVerified={conf.lastVerified} />
          <span style={{
            fontSize: 11, color: "#94a3b8", background: "rgba(51,65,85,0.3)", padding: "2px 8px", borderRadius: 4,
          }}>{conf.format}</span>
        </div>
      </div>
    </div>
  );
}

function ConferenceDetail({ conf, onBack }) {
  const [codeState, setCodeState] = useState("locked"); // locked | form | revealed
  const [email, setEmail] = useState("");
  const [revealedCode, setRevealedCode] = useState(null);

  const handleGetCode = () => {
    if (codeState === "locked") {
      setCodeState("form");
    }
  };

  const handleSubmitEmail = () => {
    if (!email || !email.includes("@")) return;
    // In production: POST to API, assign code from pool, track
    setRevealedCode(conf.discount);
    setCodeState("revealed");
  };

  if (!conf) return null;
  const duration = Math.ceil((new Date(conf.end) - new Date(conf.start)) / (1000 * 60 * 60 * 24)) + 1;
  const daysAway = daysUntil(conf.start);
  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <button onClick={onBack} style={{
        background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 14,
        display: "flex", alignItems: "center", gap: 6, padding: 0, marginBottom: 24,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back to results
      </button>

      <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(51,65,85,0.5)", borderRadius: 20, padding: 36, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <span style={{
              display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase",
              color: conf.category === "Longevity / Health" ? "#34d399" : "#60a5fa",
              background: conf.category === "Longevity / Health" ? "rgba(52,211,153,0.1)" : "rgba(96,165,250,0.1)",
              padding: "4px 10px", borderRadius: 5, marginBottom: 12,
            }}>{conf.category}</span>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: "#f1f5f9", margin: "0 0 8px 0" }}>{conf.name}</h1>
            <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>by {conf.organizer}</p>
          </div>
          <VerifiedBadge confidence={conf.confidence} lastVerified={conf.lastVerified} />
        </div>

        <p style={{ fontSize: 16, color: "#cbd5e1", lineHeight: 1.7, margin: "24px 0" }}>{conf.description}</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
          {[
            { icon: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z", label: "Location", value: `${conf.city}, ${conf.country}` },
            { icon: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18", label: "Dates", value: `${formatDate(conf.start)} \u2013 ${formatDate(conf.end)}` },
            { icon: "M12 6v6l4 2", label: "Duration", value: `${duration} days` },
            { icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2", label: "Attendees", value: conf.attendees ? conf.attendees.toLocaleString() : "TBA" },
          ].map((item, i) => (
            <div key={i} style={{ background: "rgba(30,41,59,0.4)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 15, color: "#e2e8f0", fontWeight: 600 }}>{item.value}</div>
            </div>
          ))}
        </div>

        {daysAway > 0 && (
          <div style={{
            background: "linear-gradient(135deg, rgba(249,115,22,0.1), rgba(234,88,12,0.05))",
            border: "1px solid rgba(249,115,22,0.2)", borderRadius: 12, padding: 16, marginBottom: 24,
            textAlign: "center",
          }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: "#f97316" }}>{daysAway}</span>
            <span style={{ fontSize: 14, color: "#fb923c", marginLeft: 8 }}>days until event</span>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(51,65,85,0.5)", borderRadius: 20, padding: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", margin: "0 0 20px 0", letterSpacing: 0.5, textTransform: "uppercase" }}>Pricing</h3>

          {/* Standard price - always shown */}
          {(() => {
            const p = getCurrentPricing(conf);
            const hasTimeTiers = conf.pricingTiers?.some(t => t.isTimeWindow);
            
            if (hasTimeTiers) {
              // New model: dynamic rolling prices
              return (
                <>
                  {/* Current price with countdown */}
                  <div style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 12, color: "#fb923c", fontWeight: 600, marginBottom: 4 }}>CURRENT PRICE — {p.label.toUpperCase()}</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: "#f97316" }}>{formatPrice(p.currentPrice)}</div>
                        <DynamicPricingBadge conf={conf} />
                      </div>
                      {p.currentPrice < p.standardPrice && (
                        <div style={{
                          background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)",
                          borderRadius: 8, padding: "6px 12px", textAlign: "center",
                        }}>
                          <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 600 }}>YOU SAVE</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: "#22c55e" }}>{formatPrice(p.standardPrice - p.currentPrice)}</div>
                          <div style={{ fontSize: 10, color: "#4ade80" }}>{Math.round((1 - p.currentPrice / p.standardPrice) * 100)}% off</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Full price shown with strikethrough */}
                  {p.currentPrice < p.standardPrice && (
                    <div style={{ background: "rgba(30,41,59,0.4)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, marginBottom: 4 }}>ON-SITE PRICE</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#94a3b8", textDecoration: "line-through" }}>{formatPrice(p.standardPrice)}</div>
                    </div>
                  )}

                  {/* Special tiers (Student, etc.) */}
                  {p.specialTiers?.length > 0 && p.specialTiers.map((tier, i) => (
                    <div key={i} style={{ background: "rgba(30,41,59,0.4)", borderRadius: 12, padding: 12, marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{tier.label.toUpperCase()}</span>
                        <span style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0" }}>{formatPrice(tier.price)}</span>
                      </div>
                    </div>
                  ))}
                </>
              );
            }
            
            // Old model: simple earlyBird / price
            return (
              <>
                <div style={{ background: "rgba(30,41,59,0.4)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, marginBottom: 4 }}>STANDARD PRICE</div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: conf.earlyBird ? "#94a3b8" : "#1e293b", textDecoration: conf.earlyBird ? "line-through" : "none" }}>{formatPrice(conf.price)}</div>
                    </div>
                    {!conf.earlyBird && !conf.discount && (
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>Current price</div>
                    )}
                  </div>
                </div>
                {conf.earlyBird && (
                  <div style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 12, color: "#fb923c", fontWeight: 600, marginBottom: 4 }}>EARLY BIRD</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: "#f97316" }}>{formatPrice(conf.earlyBird)}</div>
                        <DynamicPricingBadge conf={conf} />
                      </div>
                      <div style={{
                        background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)",
                        borderRadius: 8, padding: "6px 12px", textAlign: "center",
                      }}>
                        <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 600 }}>YOU SAVE</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "#22c55e" }}>{formatPrice(conf.price - conf.earlyBird)}</div>
                        <div style={{ fontSize: 10, color: "#4ade80" }}>{Math.round((1 - conf.earlyBird / conf.price) * 100)}% off</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* CC code - show additional savings stacked on current price */}
          {conf.discount && (() => {
            const p = getCurrentPricing(conf);
            const basePrice = p.currentPrice;
            const withCode = Math.round(basePrice * (1 - conf.discountPct / 100));
            const codeSavings = basePrice - withCode;
            const totalSavings = p.standardPrice - withCode;
            return (
              <div style={{
                background: "linear-gradient(135deg, rgba(34,197,94,0.06), rgba(34,197,94,0.02))",
                border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, padding: 16, marginBottom: 16,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 600, marginBottom: 4 }}>
                      {conf.earlyBird ? "EARLY BIRD + CC CODE" : "WITH CC CODE"}
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#22c55e" }}>{formatPrice(withCode)}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      {conf.earlyBird
                        ? `${formatPrice(conf.earlyBird)} early bird \u2013 ${conf.discountPct}% code`
                        : `${formatPrice(conf.price)} \u2013 ${conf.discountPct}% code`
                      }
                    </div>
                  </div>
                  <div style={{
                    background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)",
                    borderRadius: 8, padding: "6px 12px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 600 }}>TOTAL SAVINGS</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#22c55e" }}>{formatPrice(totalSavings)}</div>
                    <div style={{ fontSize: 10, color: "#4ade80" }}>{Math.round((1 - withCode / conf.price) * 100)}% off standard</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Savings waterfall summary */}
          {(conf.earlyBird || conf.discount) && (() => {
            const steps = [];
            steps.push({ label: "Standard price", amount: conf.price, color: "#94a3b8" });
            if (conf.earlyBird) {
              steps.push({ label: "Early bird saves you", amount: -(conf.price - conf.earlyBird), color: "#f97316" });
            }
            if (conf.discount) {
              const base = conf.earlyBird || conf.price;
              const codeSaving = Math.round(base * conf.discountPct / 100);
              steps.push({ label: "CC code saves you", amount: -codeSaving, color: "#22c55e" });
            }
            const finalPrice = conf.discount
              ? Math.round((conf.earlyBird || conf.price) * (1 - conf.discountPct / 100))
              : conf.earlyBird || conf.price;
            return (
              <div style={{ background: "rgba(30,41,59,0.3)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, letterSpacing: 0.5, marginBottom: 10, textTransform: "uppercase" }}>Savings Breakdown</div>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{s.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: s.color, fontFamily: "'Space Mono', monospace" }}>
                      {s.amount > 0 ? formatPrice(s.amount) : "\u2013" + formatPrice(Math.abs(s.amount))}
                    </span>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid rgba(51,65,85,0.4)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#f1f5f9", fontWeight: 700 }}>You pay</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#22c55e", fontFamily: "'Space Mono', monospace" }}>{formatPrice(finalPrice)}</span>
                </div>
              </div>
            );
          })()}
          {conf.discount && (
            <div style={{ borderRadius: 12, overflow: "hidden" }}>
              {codeState === "locked" && (
                <div style={{
                  background: "linear-gradient(135deg, rgba(249,115,22,0.1), rgba(234,88,12,0.05))",
                  border: "1px solid rgba(249,115,22,0.25)", borderRadius: 12, padding: 20, textAlign: "center",
                }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#f97316", marginBottom: 4 }}>{conf.discountPct}% OFF</div>
                  <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 14 }}>Exclusive discount available for this conference</div>
                  <div style={{ fontSize: 12, color: "#fb923c", marginBottom: 14 }}>
                    {conf.earlyBird ? (
                      <span>Pay <span style={{ fontWeight: 800, fontSize: 16 }}>{formatPrice(Math.round(conf.earlyBird * (1 - conf.discountPct / 100)))}</span> instead of {formatPrice(conf.earlyBird)}</span>
                    ) : (
                      <span>Pay <span style={{ fontWeight: 800, fontSize: 16 }}>{formatPrice(Math.round(conf.price * (1 - conf.discountPct / 100)))}</span> instead of {formatPrice(conf.price)}</span>
                    )}
                  </div>
                  <button onClick={handleGetCode} style={{
                    width: "100%", padding: "14px 24px", borderRadius: 10,
                    background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none",
                    color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    boxShadow: "0 4px 20px rgba(249,115,22,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                    Get Your Code — Free
                  </button>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>Limited codes available</div>
                </div>
              )}

              {codeState === "form" && (
                <div style={{
                  background: "linear-gradient(135deg, rgba(249,115,22,0.08), rgba(234,88,12,0.03))",
                  border: "1px solid rgba(249,115,22,0.25)", borderRadius: 12, padding: 20,
                  animation: "fadeIn 0.3s ease",
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>Enter your email to unlock your code</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>Your code will also be emailed to you for safekeeping.</div>
                  <input
                    type="email" placeholder="you@email.com" value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSubmitEmail()}
                    style={{
                      width: "100%", padding: "12px 14px", borderRadius: 8, marginBottom: 12,
                      background: "rgba(15,23,42,0.6)", border: "1px solid rgba(249,115,22,0.2)",
                      color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none",
                    }}
                  />
                  <button onClick={handleSubmitEmail} style={{
                    width: "100%", padding: "12px 24px", borderRadius: 8,
                    background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none",
                    color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    opacity: email.includes("@") ? 1 : 0.5,
                  }}>Unlock My Code</button>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 8, textAlign: "center" }}>
                    We\u2019ll never spam you. One email with your code, that\u2019s it.
                  </div>
                </div>
              )}

              {codeState === "revealed" && (
                <div style={{
                  background: "linear-gradient(135deg, #f97316, #ea580c)", borderRadius: 12, padding: 20, textAlign: "center",
                  animation: "fadeIn 0.3s ease",
                }}>
                  <div style={{ fontSize: 11, color: "rgba(15,23,42,0.6)", fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>YOUR EXCLUSIVE CODE</div>
                  <div style={{
                    fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: 3,
                    background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "12px 24px", display: "inline-block",
                    fontFamily: "monospace", cursor: "pointer", position: "relative",
                  }} onClick={() => { navigator.clipboard && navigator.clipboard.writeText(revealedCode); }}>
                    {revealedCode}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" style={{ marginLeft: 10, verticalAlign: "middle" }}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", marginTop: 10, fontWeight: 600 }}>Save {conf.discountPct}% on your ticket</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>Code also sent to {email}</div>
                  <div style={{
                    fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 12, padding: "8px 0",
                    borderTop: "1px solid rgba(255,255,255,0.15)",
                  }}>Use this code on the conference\u2019s registration page at checkout</div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(51,65,85,0.5)", borderRadius: 20, padding: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", margin: "0 0 20px 0", letterSpacing: 0.5, textTransform: "uppercase" }}>Speakers</h3>
          {conf.speakers.map((s, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
              borderBottom: i < conf.speakers.length - 1 ? "1px solid rgba(51,65,85,0.3)" : "none",
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: `hsl(${i * 60 + 200}, 40%, 25%)`, fontSize: 16, fontWeight: 700, color: "#e2e8f0",
              }}>{s.charAt(0)}</div>
              <span style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 500 }}>{s}</span>
            </div>
          ))}
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", margin: "28px 0 16px 0", letterSpacing: 0.5, textTransform: "uppercase" }}>Topics</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {conf.tags.map((t, i) => (
              <span key={i} style={{
                fontSize: 12, color: "#94a3b8", background: "rgba(51,65,85,0.4)", borderRadius: 6, padding: "5px 12px",
              }}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* HOTEL SECTION */}
      {conf.hotels && conf.hotels.length > 0 && (
        <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(51,65,85,0.5)", borderRadius: 20, padding: 28, marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", margin: 0, letterSpacing: 0.5, textTransform: "uppercase" }}>
              <span style={{ marginRight: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" style={{ verticalAlign: "middle" }}><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v.01M12 14v.01M16 14v.01M8 18v.01M12 18v.01M16 18v.01"/></svg>
              </span>
              Official Hotel Partners
            </h3>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Negotiated conference rates</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: conf.hotels.length > 1 ? "1fr 1fr" : "1fr", gap: 16 }}>
            {conf.hotels.map((hotel, i) => {
              const nights = Math.ceil((new Date(conf.end) - new Date(conf.start)) / (1000 * 60 * 60 * 24));
              const savings = (hotel.rackRate - hotel.confRate) * nights;
              const hotelBookDays = daysUntil(hotel.bookBy);
              return (
                <div key={i} style={{
                  background: "rgba(30,41,59,0.4)", borderRadius: 14, padding: 20,
                  border: "1px solid rgba(96,165,250,0.15)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>{hotel.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ display: "flex", gap: 2 }}>
                          {Array.from({ length: hotel.stars }).map((_, s) => (
                            <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                          ))}
                        </div>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>{hotel.distance}</span>
                      </div>
                    </div>
                    <div style={{
                      background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)",
                      borderRadius: 8, padding: "6px 12px", textAlign: "center",
                    }}>
                      <div style={{ fontSize: 10, color: "#60a5fa", fontWeight: 600, letterSpacing: 0.5 }}>SAVE</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#60a5fa" }}>{formatPrice(savings)}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>CONF RATE</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#60a5fa" }}>{formatPrice(hotel.confRate)}<span style={{ fontSize: 12, fontWeight: 400, color: "#94a3b8" }}>/night</span></div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>RACK RATE</div>
                      <div style={{ fontSize: 16, color: "#94a3b8", textDecoration: "line-through", marginTop: 4 }}>{formatPrice(hotel.rackRate)}/night</div>
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
                    {nights} nights = <span style={{ color: "#60a5fa", fontWeight: 700 }}>{formatPrice(hotel.confRate * nights)} total</span>
                    <span style={{ color: "#94a3b8" }}> (vs {formatPrice(hotel.rackRate * nights)} rack)</span>
                  </div>

                  {hotelBookDays > 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: hotelBookDays < 14 ? "#ef4444" : "#f59e0b", fontWeight: 600 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      Book by {hotel.bookBy} ({hotelBookDays} days left)
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>Block rate expired</div>
                  )}

                  <button style={{
                    width: "100%", marginTop: 12, padding: "10px 16px", borderRadius: 8,
                    background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.3)",
                    color: "#60a5fa", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}>Book Hotel \u2192</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TOTAL TRIP COST CALCULATOR */}
      {conf.hotels && conf.hotels.length > 0 && (() => {
        const nights = Math.ceil((new Date(conf.end) - new Date(conf.start)) / (1000 * 60 * 60 * 24));
        const cheapestHotel = conf.hotels.reduce((a, b) => a.confRate < b.confRate ? a : b);
        const ticketPrice = conf.earlyBird || conf.price;
        const ticketWithDiscount = conf.discount ? Math.round(ticketPrice * (1 - conf.discountPct / 100)) : ticketPrice;
        const hotelTotal = cheapestHotel.confRate * nights;
        const totalTrip = ticketWithDiscount + hotelTotal;
        const totalWithoutSavings = conf.price + (cheapestHotel.rackRate * nights);
        const totalSavings = totalWithoutSavings - totalTrip;
        return (
          <div style={{
            background: "linear-gradient(135deg, rgba(96,165,250,0.08), rgba(249,115,22,0.08))",
            border: "1px solid rgba(96,165,250,0.2)", borderRadius: 20, padding: 28, marginTop: 24,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", margin: "0 0 20px 0", letterSpacing: 0.5, textTransform: "uppercase" }}>
              Estimated Trip Cost
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto 1fr", gap: 16, alignItems: "center" }}>
              <div style={{ background: "rgba(255,255,255,0.7)", borderRadius: 12, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>TICKET{conf.discount ? " (w/ code)" : ""}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#f97316" }}>{formatPrice(ticketWithDiscount)}</div>
                {conf.discount && <div style={{ fontSize: 11, color: "#94a3b8", textDecoration: "line-through" }}>{formatPrice(conf.earlyBird || conf.price)}</div>}
              </div>
              <div style={{ textAlign: "center", fontSize: 24, color: "#94a3b8", fontWeight: 300 }}>+</div>
              <div style={{ background: "rgba(255,255,255,0.7)", borderRadius: 12, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>HOTEL ({nights} nights)</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#60a5fa" }}>{formatPrice(hotelTotal)}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{cheapestHotel.name}</div>
              </div>
              <div style={{ textAlign: "center", fontSize: 24, color: "#94a3b8", fontWeight: 300 }}>=</div>
              <div style={{
                background: "linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.05))",
                border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, padding: 16, textAlign: "center",
              }}>
                <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>TOTAL TRIP</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#22c55e" }}>{formatPrice(totalTrip)}</div>
                <div style={{ fontSize: 11, color: "#4ade80", fontWeight: 600 }}>You save {formatPrice(totalSavings)} via ConferenceCodes</div>
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{ textAlign: "center", marginTop: 32, display: "flex", gap: 16, justifyContent: "center" }}>
        {conf.discount && codeState === "locked" && (
          <button onClick={handleGetCode} style={{
            background: "linear-gradient(135deg, #f97316, #ea580c)", color: "#fff", border: "none",
            padding: "16px 36px", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer",
            letterSpacing: 0.5, boxShadow: "0 8px 30px rgba(249,115,22,0.3)", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            Get {conf.discountPct}% Off Code
          </button>
        )}
        <button style={{
          background: conf.discount && codeState !== "locked" ? "rgba(249,115,22,0.1)" : "linear-gradient(135deg, #f97316, #ea580c)",
          color: conf.discount && codeState !== "locked" ? "#f97316" : "#fff",
          border: conf.discount && codeState !== "locked" ? "1px solid rgba(249,115,22,0.3)" : "none",
          padding: "16px 36px", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer",
          letterSpacing: 0.5,
          boxShadow: conf.discount && codeState !== "locked" ? "none" : "0 8px 30px rgba(249,115,22,0.3)",
          fontFamily: "inherit",
        }}>Book Now \u2192</button>
      </div>
    </div>
  );
}

export default function App() {
  const [conferences, setConferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("All");
  const [locationQuery, setLocationQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [format, setFormat] = useState("All Formats");
  const [searchQuery, setSearchQuery] = useState("");
  const [maxPrice, setMaxPrice] = useState(10000);
  const [selectedConf, setSelectedConf] = useState(null);
  const [showDeepSearch, setShowDeepSearch] = useState(false);
  const [deepSearchQuery, setDeepSearchQuery] = useState("");
  const [deepSearching, setDeepSearching] = useState(false);
  const [mounted, setMounted] = useState(false);

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

  const CONFERENCES = conferences;

  // Derive unique cities, countries, regions from data
  const allLocations = [...new Set(CONFERENCES.flatMap(c => [c.city, c.country, c.region]))];

  const filtered = CONFERENCES.filter(c => {
    if (category !== "All" && c.category !== category) return false;
    if (format !== "All Formats" && c.format !== format) return false;

    // Location: match against city, country, or region (fuzzy)
    if (locationQuery) {
      const q = locationQuery.toLowerCase().trim();
      const loc = `${c.city} ${c.country} ${c.region}`.toLowerCase();
      if (!loc.includes(q)) return false;
    }

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
  }).sort((a, b) => new Date(a.start) - new Date(b.start));

  const activeFilterCount = [
    category !== "All",
    locationQuery !== "",
    dateFrom !== "",
    dateTo !== "",
    format !== "All Formats",
    maxPrice < 10000,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setCategory("All"); setLocationQuery(""); setDateFrom(""); setDateTo("");
    setFormat("All Formats"); setMaxPrice(10000); setSearchQuery("");
  };

  const handleDeepSearch = () => {
    if (!deepSearchQuery.trim()) return;
    setDeepSearching(true);
    setTimeout(() => setDeepSearching(false), 3000);
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0f1a",
      fontFamily: "'DM Sans', -apple-system, sans-serif",
      color: "#e2e8f0",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&family=Space+Mono:wght@400;700&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes scanLine { 0% { transform: translateY(-100%); } 100% { transform: translateY(400%); } }
        * { box-sizing: border-box; }
        input:focus, select:focus { outline: none; border-color: rgba(249,115,22,0.5) !important; }
        select { appearance: none; -webkit-appearance: none; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.3); border-radius: 3px; }
      `}</style>

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#f97316", marginBottom: 8 }}>ConferenceCodes</div>
            <div style={{ color: "#94a3b8" }}>Loading conferences...</div>
          </div>
        </div>
      )}

      {!loading && <>
      {/* HERO / HEADER */}
      <div style={{
        position: "relative", overflow: "hidden",
        background: "linear-gradient(180deg, rgba(15,23,42,1) 0%, rgba(11,17,32,1) 100%)",
        borderBottom: "1px solid rgba(51,65,85,0.5)",
      }}>
        {/* Subtle grid background */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.03,
          backgroundImage: "linear-gradient(rgba(249,115,22,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(249,115,22,0.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }} />
        {/* Gradient orbs */}
        <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(249,115,22,0.06) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: -50, left: -50, width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(96,165,250,0.04) 0%, transparent 70%)" }} />

        <div style={{ position: "relative", maxWidth: 1200, margin: "0 auto", padding: "0 32px" }}>
          {/* Nav */}
          <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "linear-gradient(135deg, #f97316, #ea580c)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 15px rgba(249,115,22,0.3)",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>
                <span style={{ color: "#f1f5f9" }}>Conference</span>
                <span style={{ color: "#f97316" }}>Codes</span>
              </span>
            </div>
            <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#94a3b8", cursor: "pointer" }}>How It Works</span>
              <span style={{ fontSize: 13, color: "#94a3b8", cursor: "pointer" }}>For Organizers</span>
              <button style={{
                background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)",
                color: "#f97316", padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Sign In</button>
            </div>
          </nav>

          {/* Hero content */}
          <div style={{ textAlign: "center", padding: "60px 0 48px" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 20,
              background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 100, padding: "6px 16px",
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600, letterSpacing: 0.5 }}>Every listing verified against source</span>
            </div>

            <h1 style={{
              fontSize: 52, fontWeight: 800, lineHeight: 1.1, margin: "0 0 16px",
              background: "linear-gradient(135deg, #f8fafc 0%, #94a3b8 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              maxWidth: 700, marginLeft: "auto", marginRight: "auto",
            }}>
              Verified conferences.<br />Exclusive codes.
            </h1>
            <p style={{ fontSize: 18, color: "#64748b", maxWidth: 520, margin: "0 auto 36px", lineHeight: 1.6 }}>
              Every listing checked against the source. Every code saves you 5-10%.<br />No ghost listings. No stale data. No BS.
            </p>

            {/* Stats bar */}
            <div style={{ display: "flex", justifyContent: "center", gap: 40, marginBottom: 8 }}>
              {[
                { n: String(CONFERENCES.length), label: "Verified Conferences" },
                
                
              ].map((s, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#f97316", fontFamily: "'Space Mono', monospace" }}>{s.n}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 0.5, textTransform: "uppercase" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px 80px" }}>
        {selectedConf ? (
          <ConferenceDetail conf={selectedConf} onBack={() => setSelectedConf(null)} />
        ) : (
          <>
            {/* SEARCH & FILTERS */}
            <div style={{
              background: "#0f172a", border: "1px solid rgba(51,65,85,0.5)",
              borderRadius: 16, padding: 24, marginBottom: 32,
              boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
            }}>
              {/* Search bar */}
              <div style={{ position: "relative", marginBottom: 20 }}>
                <svg style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  type="text" placeholder="Search conferences, speakers, topics..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%", padding: "14px 16px 14px 48px", borderRadius: 12,
                    background: "rgba(30,41,59,0.4)", border: "1px solid rgba(51,65,85,0.5)",
                    color: "#e2e8f0", fontSize: 15, fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Filter row 1: Category + Location */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <div style={{ flex: "1 1 180px" }}>
                  <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>Category</div>
                  <select value={category} onChange={e => setCategory(e.target.value)} style={{
                    width: "100%", padding: "10px 14px", borderRadius: 10,
                    background: category !== "All" ? "rgba(249,115,22,0.1)" : "rgba(30,41,59,0.6)",
                    border: category !== "All" ? "1px solid rgba(249,115,22,0.3)" : "1px solid rgba(51,65,85,0.5)",
                    color: category !== "All" ? "#f97316" : "#334155", fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                    appearance: "none", WebkitAppearance: "none", outline: "none",
                  }}>
                    {CATEGORIES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                <div style={{ flex: "2 1 250px" }}>
                  <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>City, Country, or Region</div>
                  <div style={{ position: "relative" }}>
                    <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <input
                      type="text" placeholder='e.g. "London", "UK", "Europe", "Spain"'
                      value={locationQuery} onChange={e => setLocationQuery(e.target.value)}
                      style={{
                        width: "100%", padding: "10px 14px 10px 34px", borderRadius: 10,
                        background: locationQuery ? "rgba(249,115,22,0.1)" : "rgba(30,41,59,0.6)",
                        border: locationQuery ? "1px solid rgba(249,115,22,0.3)" : "1px solid rgba(51,65,85,0.5)",
                        color: locationQuery ? "#f97316" : "#334155", fontSize: 13, fontFamily: "inherit", outline: "none",
                      }}
                    />
                    {locationQuery && (
                      <button onClick={() => setLocationQuery("")} style={{
                        position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                        background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16, padding: 4,
                      }}>\u00d7</button>
                    )}
                  </div>
                </div>
              </div>

              {/* Filter row 2: Date range + Format + Price */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 160px" }}>
                  <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>From</div>
                  <input
                    type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: 10,
                      background: dateFrom ? "rgba(249,115,22,0.1)" : "rgba(30,41,59,0.6)",
                      border: dateFrom ? "1px solid rgba(249,115,22,0.3)" : "1px solid rgba(51,65,85,0.5)",
                      color: dateFrom ? "#f97316" : "#334155", fontSize: 13, fontFamily: "inherit", outline: "none",
                      colorScheme: "dark",
                    }}
                  />
                </div>
                <div style={{ flex: "1 1 160px" }}>
                  <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>To</div>
                  <input
                    type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: 10,
                      background: dateTo ? "rgba(249,115,22,0.1)" : "rgba(30,41,59,0.6)",
                      border: dateTo ? "1px solid rgba(249,115,22,0.3)" : "1px solid rgba(51,65,85,0.5)",
                      color: dateTo ? "#f97316" : "#334155", fontSize: 13, fontFamily: "inherit", outline: "none",
                      colorScheme: "dark",
                    }}
                  />
                </div>
                {/* Quick date presets */}
                <div style={{ flex: "2 1 300px", display: "flex", gap: 6, flexWrap: "wrap", paddingBottom: 2 }}>
                  {[
                    { label: "This month", fn: () => { const n = new Date(); setDateFrom(n.toISOString().split("T")[0]); const e = new Date(n.getFullYear(), n.getMonth() + 1, 0); setDateTo(e.toISOString().split("T")[0]); }},
                    { label: "Next 30 days", fn: () => { const n = new Date(); setDateFrom(n.toISOString().split("T")[0]); const e = new Date(n); e.setDate(e.getDate() + 30); setDateTo(e.toISOString().split("T")[0]); }},
                    { label: "Next 3 months", fn: () => { const n = new Date(); setDateFrom(n.toISOString().split("T")[0]); const e = new Date(n); e.setMonth(e.getMonth() + 3); setDateTo(e.toISOString().split("T")[0]); }},
                    { label: "Q2 2026", fn: () => { setDateFrom("2026-04-01"); setDateTo("2026-06-30"); }},
                    { label: "Q3 2026", fn: () => { setDateFrom("2026-07-01"); setDateTo("2026-09-30"); }},
                    { label: "Summer", fn: () => { setDateFrom("2026-06-01"); setDateTo("2026-08-31"); }},
                  ].map((p, i) => (
                    <button key={i} onClick={p.fn} style={{
                      padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: "rgba(30,41,59,0.4)", border: "1px solid rgba(51,65,85,0.4)",
                      color: "#94a3b8", cursor: "pointer", fontFamily: "inherit",
                      whiteSpace: "nowrap",
                    }}>{p.label}</button>
                  ))}
                </div>
              </div>

              {/* Filter row 3: Format + Price */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
                <div style={{ flex: "1 1 140px" }}>
                  <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>Format</div>
                  <select value={format} onChange={e => setFormat(e.target.value)} style={{
                    width: "100%", padding: "10px 14px", borderRadius: 10,
                    background: format !== "All Formats" ? "rgba(249,115,22,0.1)" : "rgba(30,41,59,0.6)",
                    border: format !== "All Formats" ? "1px solid rgba(249,115,22,0.3)" : "1px solid rgba(51,65,85,0.5)",
                    color: format !== "All Formats" ? "#f97316" : "#334155", fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                    appearance: "none", WebkitAppearance: "none", outline: "none",
                  }}>
                    {FORMATS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div style={{ flex: "1 1 200px" }}>
                  <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>Max Price</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="range" min={0} max={10000} step={100} value={maxPrice} onChange={e => setMaxPrice(Number(e.target.value))}
                      style={{ flex: 1, accentColor: "#f97316" }} />
                    <span style={{ fontSize: 13, color: "#f97316", fontWeight: 700, fontFamily: "'Space Mono', monospace", minWidth: 60 }}>
                      {maxPrice >= 10000 ? "Any" : formatPrice(maxPrice)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Active filters + clear */}
              {activeFilterCount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(51,65,85,0.3)" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {category !== "All" && (
                      <span style={{ fontSize: 11, color: "#f97316", background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 6, padding: "3px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                        {category} <button onClick={() => setCategory("All")} style={{ background: "none", border: "none", color: "#f97316", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>\u00d7</button>
                      </span>
                    )}
                    {locationQuery && (
                      <span style={{ fontSize: 11, color: "#f97316", background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 6, padding: "3px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                        {locationQuery} <button onClick={() => setLocationQuery("")} style={{ background: "none", border: "none", color: "#f97316", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>\u00d7</button>
                      </span>
                    )}
                    {dateFrom && (
                      <span style={{ fontSize: 11, color: "#f97316", background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 6, padding: "3px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                        From {dateFrom} <button onClick={() => setDateFrom("")} style={{ background: "none", border: "none", color: "#f97316", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>\u00d7</button>
                      </span>
                    )}
                    {dateTo && (
                      <span style={{ fontSize: 11, color: "#f97316", background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 6, padding: "3px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                        To {dateTo} <button onClick={() => setDateTo("")} style={{ background: "none", border: "none", color: "#f97316", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>\u00d7</button>
                      </span>
                    )}
                  </div>
                  <button onClick={clearFilters} style={{
                    background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12, fontFamily: "inherit",
                    textDecoration: "underline",
                  }}>Clear all filters</button>
                </div>
              )}
            </div>

            {/* Results header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <span style={{ fontSize: 14, color: "#94a3b8" }}>
                  Showing <span style={{ color: "#f1f5f9", fontWeight: 700 }}>{filtered.length}</span> verified conferences
                </span>
              </div>
              <button onClick={() => setShowDeepSearch(!showDeepSearch)} style={{
                display: "flex", alignItems: "center", gap: 8,
                background: showDeepSearch ? "rgba(249,115,22,0.15)" : "rgba(30,41,59,0.4)",
                border: `1px solid ${showDeepSearch ? "rgba(249,115,22,0.3)" : "rgba(51,65,85,0.5)"}`,
                color: showDeepSearch ? "#f97316" : "#94a3b8", padding: "8px 16px", borderRadius: 10,
                fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 110 20 10 10 0 010-20z"/><path d="M12 8v4l2 2"/></svg>
                AI Deep Search
              </button>
            </div>

            {/* Deep Search Panel */}
            {showDeepSearch && (
              <div style={{
                background: "linear-gradient(135deg, rgba(249,115,22,0.05), rgba(234,88,12,0.02))",
                border: "1px solid rgba(249,115,22,0.2)", borderRadius: 16, padding: 24, marginBottom: 24,
                animation: "fadeIn 0.3s ease",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><path d="M12 2a10 10 0 110 20 10 10 0 010-20z"/><path d="M12 8v4l2 2"/></svg>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#f97316" }}>AI Deep Search</span>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>\u2014 Find niche conferences not yet in our database</span>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <input
                    type="text" placeholder='Try: "peptide therapy conferences in Florida before June"'
                    value={deepSearchQuery} onChange={e => setDeepSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleDeepSearch()}
                    style={{
                      flex: 1, padding: "12px 16px", borderRadius: 10,
                      background: "rgba(15,23,42,0.6)", border: "1px solid rgba(249,115,22,0.2)",
                      color: "#e2e8f0", fontSize: 14, fontFamily: "inherit",
                    }}
                  />
                  <button onClick={handleDeepSearch} disabled={deepSearching} style={{
                    background: "linear-gradient(135deg, #f97316, #ea580c)", color: "#fff",
                    border: "none", padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 700,
                    cursor: deepSearching ? "not-allowed" : "pointer", fontFamily: "inherit",
                    opacity: deepSearching ? 0.7 : 1,
                  }}>
                    {deepSearching ? "Searching..." : "Search"}
                  </button>
                </div>
                {deepSearching && (
                  <div style={{ marginTop: 16, padding: 16, background: "rgba(15,23,42,0.4)", borderRadius: 10 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {["Searching the web...", "Visiting conference websites...", "Verifying details..."].map((step, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, animation: `fadeIn ${0.3 + i * 0.4}s ease` }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f97316", animation: "pulse 1s infinite", animationDelay: `${i * 0.3}s` }} />
                          <span style={{ fontSize: 13, color: "#fb923c" }}>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Conference grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
              {filtered.map((conf, i) => (
                <div key={conf.id} style={{ animation: `fadeIn ${0.15 + i * 0.05}s ease` }}>
                  <ConferenceCard conf={conf} onClick={setSelectedConf} />
                </div>
              ))}
            </div>

            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#94a3b8", margin: "0 0 8px" }}>No conferences match your filters</h3>
                <p style={{ fontSize: 14, color: "#94a3b8" }}>Try broadening your search or use AI Deep Search to find niche events.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: "1px solid rgba(51,65,85,0.3)", padding: "32px",
        background: "rgba(255,255,255,0.7)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 800 }}>
              <span style={{ color: "#f1f5f9" }}>Conference</span><span style={{ color: "#f97316" }}>Codes</span>
            </span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>\u00a9 2026</span>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Privacy</span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Terms</span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>For Organizers</span>
          </div>
        </div>
      </div>
      </>}
    </div>
  );
}
