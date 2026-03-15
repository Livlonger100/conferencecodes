// @ts-nocheck
"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// ── Utilities ────────────────────────────────────────────────────────────────

function transformConference(c: any) {
  const tiers = (c.pricing_tiers || []).sort((a: any, b: any) => (a.sort_order||0) - (b.sort_order||0));
  const lowestPrice = tiers.length > 0 ? Math.min(...tiers.filter((t: any) => t.price != null && !t.sold_out).map((t: any) => parseFloat(t.price))) : null;
  const highestPrice = tiers.length > 0 ? Math.max(...tiers.filter((t: any) => t.price != null).map((t: any) => parseFloat(t.price))) : null;
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
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
}
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function formatDateRange(startStr, endStr) {
  const s = new Date(startStr), e = new Date(endStr);
  const mo = (d) => d.toLocaleDateString("en-US", { month: "short" });
  const yr = (d) => d.getFullYear();
  const day = (d) => d.getDate();
  if (mo(s) === mo(e) && yr(s) === yr(e)) return `${mo(s)} ${day(s)}-${day(e)}, ${yr(s)}`;
  return `${mo(s)} ${day(s)} - ${mo(e)} ${day(e)}, ${yr(e)}`;
}
function formatPrice(p) {
  return p != null ? "$" + p.toLocaleString() : "TBA";
}

function getCurrentPricing(conf) {
  const now = new Date();
  const tiers = conf.pricingTiers || [];
  const baseTiers = tiers.filter(t => t.isTimeWindow && !t.requires_approval && !t.sold_out);
  if (baseTiers.length === 0) {
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
  const sorted = [...baseTiers].sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });
  let currentIdx = sorted.findIndex(t => t.deadline && new Date(t.deadline) >= now);
  if (currentIdx === -1) currentIdx = sorted.length - 1;
  const current = sorted[currentIdx];
  const next = currentIdx < sorted.length - 1 ? sorted[currentIdx + 1] : null;
  const nextPrice = current.priceAfterDeadline || (next ? next.price : null);
  return {
    currentPrice: current.price,
    standardPrice: sorted[sorted.length - 1].price,
    nextPrice,
    nextPriceDate: current.deadline || null,
    daysUntilIncrease: current.deadline ? daysUntil(current.deadline) : null,
    isEarlyBird: currentIdx < sorted.length - 1 || !!current.priceAfterDeadline,
    label: current.label || "Current Price",
    specialTiers: tiers.filter(t => !t.isTimeWindow || t.requires_approval),
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg, #f97316, #ea580c)", borderRadius: 6, padding: "5px 10px" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
      <span style={{ color: "#fff", fontWeight: 700, fontSize: 12, letterSpacing: 0.5 }}>{pct}% OFF</span>
    </div>
  );
}

// ── ConferenceDetail ──────────────────────────────────────────────────────────

function ConferenceDetail({ conf, onBack }) {
  const [codeState, setCodeState] = useState("locked");
  const [email, setEmail] = useState("");
  const [revealedCode, setRevealedCode] = useState(null);

  const handleGetCode = () => { if (codeState === "locked") setCodeState("form"); };
  const handleSubmitEmail = () => {
    if (!email || !email.includes("@")) return;
    setRevealedCode(conf.discount);
    setCodeState("revealed");
  };

  if (!conf) return null;
  const duration = Math.ceil((new Date(conf.end) - new Date(conf.start)) / (1000 * 60 * 60 * 24)) + 1;
  const daysAway = daysUntil(conf.start);

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <button onClick={onBack} style={{
        background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 14,
        display: "flex", alignItems: "center", gap: 6, padding: 0, marginBottom: 24, fontFamily: "inherit",
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back to results
      </button>

      {/* Header card */}
      <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 20, padding: "24px 28px 20px", marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <span style={{
              display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase",
              color: conf.category === "Longevity / Health" ? "#34d399" : "#60a5fa",
              background: conf.category === "Longevity / Health" ? "rgba(52,211,153,0.1)" : "rgba(96,165,250,0.1)",
              padding: "4px 10px", borderRadius: 5, marginBottom: 10,
            }}>{conf.category}</span>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#111827", margin: "0 0 6px 0" }}>{conf.name}</h1>
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>by {conf.organizer}</p>
          </div>
          <VerifiedBadge confidence={conf.confidence} lastVerified={conf.lastVerified} />
        </div>

        <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.6, margin: "16px 0" }}>{conf.description}</p>

        {conf.source_url && (
          <a href={conf.source_url} target="_blank" rel="noopener noreferrer" style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16,
            fontSize: 14, fontWeight: 600, color: "#f97316", textDecoration: "none",
          }}>
            Visit Conference Website
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </a>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {[
            { label: "Location", value: `${conf.city}, ${conf.country}` },
            { label: "Dates", value: formatDateRange(conf.start, conf.end), sub: daysAway > 0 ? `${daysAway} days away` : null },
            { label: "Duration", value: `${duration} days` },
            { label: "Attendees", value: conf.attendees ? conf.attendees.toLocaleString() : "TBA" },
          ].map((item, i) => (
            <div key={i} style={{ background: "#f9fafb", borderRadius: 10, padding: 12, border: "1px solid #f3f4f6" }}>
              <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 14, color: "#111827", fontWeight: 600 }}>{item.value}</div>
              {item.sub && <div style={{ fontSize: 11, color: "#f97316", marginTop: 2 }}>{item.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Pricing card */}
      <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 20, padding: "20px 28px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 20px 0", letterSpacing: 0.5, textTransform: "uppercase" }}>Pricing</h3>

        {(() => {
          const tiers = conf.pricingTiers || [];
          const now = new Date();
          if (tiers.length === 0) return <div style={{ fontSize: 14, color: "#9ca3af" }}>Pricing not available</div>;

          const visibleTiers = tiers.filter(t => !t.requires_approval);
          const activeTiers = visibleTiers.filter(t => !t.sold_out && t.price != null && (!t.deadline || new Date(t.deadline) >= now));
          const currentPrice = activeTiers.length > 0 ? Math.min(...activeTiers.map(t => t.price)) : null;

          return visibleTiers.map((tier, i) => {
            const isActive = !tier.sold_out && tier.price != null && (!tier.deadline || new Date(tier.deadline) >= now);
            const isCurrent = isActive && tier.price === currentPrice;
            const deadlinePassed = tier.deadline && new Date(tier.deadline) < now;
            const daysLeft = tier.deadline && !deadlinePassed ? daysUntil(tier.deadline) : null;
            const urgent = daysLeft !== null && daysLeft <= 7;
            return (
              <div key={i} style={{
                background: isCurrent ? "rgba(249,115,22,0.06)" : "#f9fafb",
                border: `1px solid ${isCurrent ? "rgba(249,115,22,0.25)" : "#e5e7eb"}`,
                borderRadius: 12, padding: "14px 16px", marginBottom: 8,
                opacity: (tier.sold_out || deadlinePassed) ? 0.5 : 1,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isCurrent ? "#f97316" : "#374151", marginBottom: tier.deadline || tier.priceAfterDeadline ? 4 : 0 }}>
                      {tier.label}
                      {tier.sold_out && <span style={{ marginLeft: 8, fontSize: 11, color: "#ef4444", fontWeight: 700 }}>SOLD OUT</span>}
                      {tier.requires_approval && !tier.sold_out && <span style={{ marginLeft: 8, fontSize: 11, color: "#9ca3af" }}>requires approval</span>}
                    </div>
                    {tier.deadline && (
                      <div style={{ fontSize: 11, color: deadlinePassed ? "#9ca3af" : urgent ? "#ef4444" : "#f59e0b", display: "flex", alignItems: "center", gap: 4 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {deadlinePassed
                          ? (tier.isEarlyBird ? `Early bird expired (${formatDate(tier.deadline)})` : `Price increase passed (${formatDate(tier.deadline)})`)
                          : (tier.isEarlyBird ? `Early bird deadline: ${formatDate(tier.deadline)} — ${daysLeft}d left` : `Price increases after ${formatDate(tier.deadline)} — ${daysLeft}d left`)}
                      </div>
                    )}
                    {tier.priceAfterDeadline && !deadlinePassed && (
                      <div style={{ fontSize: 11, color: "#f97316", marginTop: 2 }}>
                        ↑ rises to {formatPrice(tier.priceAfterDeadline)} after deadline
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: isCurrent ? "#f97316" : tier.sold_out || deadlinePassed ? "#9ca3af" : "#111827" }}>
                      {formatPrice(tier.price)}
                    </div>
                    {tier.priceAfterDeadline && !deadlinePassed && (
                      <div style={{ fontSize: 12, color: "#9ca3af", textDecoration: "line-through" }}>{formatPrice(tier.priceAfterDeadline)}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          });
        })()}

        {/* CC code savings */}
        {conf.discount && (() => {
          const p = getCurrentPricing(conf);
          const withCode = Math.round(p.currentPrice * (1 - conf.discountPct / 100));
          const totalSavings = p.standardPrice - withCode;
          return (
            <div style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.06), rgba(34,197,94,0.02))", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 600, marginBottom: 4 }}>{conf.earlyBird ? "EARLY BIRD + CC CODE" : "WITH CC CODE"}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#22c55e" }}>{formatPrice(withCode)}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    {conf.earlyBird ? `${formatPrice(conf.earlyBird)} early bird – ${conf.discountPct}% code` : `${formatPrice(conf.price)} – ${conf.discountPct}% code`}
                  </div>
                </div>
                <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 600 }}>TOTAL SAVINGS</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#22c55e" }}>{formatPrice(totalSavings)}</div>
                  <div style={{ fontSize: 10, color: "#4ade80" }}>{Math.round((1 - withCode / conf.price) * 100)}% off standard</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Savings waterfall */}
        {(conf.earlyBird || conf.discount) && (() => {
          const steps = [];
          steps.push({ label: "Standard price", amount: conf.price, color: "#94a3b8" });
          if (conf.earlyBird) steps.push({ label: "Early bird saves you", amount: -(conf.price - conf.earlyBird), color: "#f97316" });
          if (conf.discount) {
            const base = conf.earlyBird || conf.price;
            steps.push({ label: "CC code saves you", amount: -Math.round(base * conf.discountPct / 100), color: "#22c55e" });
          }
          const finalPrice = conf.discount
            ? Math.round((conf.earlyBird || conf.price) * (1 - conf.discountPct / 100))
            : conf.earlyBird || conf.price;
          return (
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, letterSpacing: 0.5, marginBottom: 10, textTransform: "uppercase" }}>Savings Breakdown</div>
              {steps.map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{s.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: s.color, fontFamily: "'Space Mono', monospace" }}>
                    {s.amount > 0 ? formatPrice(s.amount) : "–" + formatPrice(Math.abs(s.amount))}
                  </span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#111827", fontWeight: 700 }}>You pay</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#22c55e", fontFamily: "'Space Mono', monospace" }}>{formatPrice(finalPrice)}</span>
              </div>
            </div>
          );
        })()}

        {/* Discount code reveal */}
        {conf.discount && (
          <div style={{ borderRadius: 12, overflow: "hidden" }}>
            {codeState === "locked" && (
              <div style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.1), rgba(234,88,12,0.05))", border: "1px solid rgba(249,115,22,0.25)", borderRadius: 12, padding: 20, textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#f97316", marginBottom: 4 }}>{conf.discountPct}% OFF</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 14 }}>Exclusive discount available for this conference</div>
                <div style={{ fontSize: 12, color: "#fb923c", marginBottom: 14 }}>
                  {conf.earlyBird
                    ? <span>Pay <span style={{ fontWeight: 800, fontSize: 16 }}>{formatPrice(Math.round(conf.earlyBird * (1 - conf.discountPct / 100)))}</span> instead of {formatPrice(conf.earlyBird)}</span>
                    : <span>Pay <span style={{ fontWeight: 800, fontSize: 16 }}>{formatPrice(Math.round(conf.price * (1 - conf.discountPct / 100)))}</span> instead of {formatPrice(conf.price)}</span>
                  }
                </div>
                <button onClick={handleGetCode} style={{ width: "100%", padding: "14px 24px", borderRadius: 10, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 20px rgba(249,115,22,0.3)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                  Get Your Code — Free
                </button>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>Limited codes available</div>
              </div>
            )}
            {codeState === "form" && (
              <div style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.08), rgba(234,88,12,0.03))", border: "1px solid rgba(249,115,22,0.25)", borderRadius: 12, padding: 20, animation: "fadeIn 0.3s ease" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Enter your email to unlock your code</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>Your code will also be emailed to you for safekeeping.</div>
                <input type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmitEmail()} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, marginBottom: 12, background: "#f9fafb", border: "1px solid #d1d5db", color: "#111827", fontSize: 14, fontFamily: "inherit", outline: "none" }} />
                <button onClick={handleSubmitEmail} style={{ width: "100%", padding: "12px 24px", borderRadius: 8, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: email.includes("@") ? 1 : 0.5 }}>Unlock My Code</button>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 8, textAlign: "center" }}>We'll never spam you. One email with your code, that's it.</div>
              </div>
            )}
            {codeState === "revealed" && (
              <div style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", borderRadius: 12, padding: 20, textAlign: "center", animation: "fadeIn 0.3s ease" }}>
                <div style={{ fontSize: 11, color: "rgba(15,23,42,0.6)", fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>YOUR EXCLUSIVE CODE</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: 3, background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "12px 24px", display: "inline-block", fontFamily: "monospace", cursor: "pointer" }} onClick={() => navigator.clipboard?.writeText(revealedCode)}>
                  {revealedCode}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" style={{ marginLeft: 10, verticalAlign: "middle" }}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", marginTop: 10, fontWeight: 600 }}>Save {conf.discountPct}% on your ticket</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>Code also sent to {email}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 12, padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.15)" }}>Use this code on the conference's registration page at checkout</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Speakers & Tags */}
      {(conf.speakers?.length > 0 || conf.tags?.length > 0) && (
        <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24, marginTop: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          {conf.speakers?.length > 0 && (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af", margin: "0 0 12px 0", letterSpacing: 0.5, textTransform: "uppercase" }}>Speakers</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: conf.tags?.length > 0 ? 20 : 0 }}>
                {conf.speakers.map((s, i) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 20, padding: "5px 12px 5px 6px" }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: `hsl(${i * 60 + 200}, 50%, 50%)`, fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{s.charAt(0)}</span>
                    <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>{s}</span>
                  </span>
                ))}
              </div>
            </>
          )}
          {conf.tags?.length > 0 && (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af", margin: "0 0 12px 0", letterSpacing: 0.5, textTransform: "uppercase" }}>Topics</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {conf.tags.map((t, i) => (
                  <span key={i} style={{ fontSize: 12, color: "#6b7280", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 6, padding: "5px 12px" }}>{t}</span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Hotels */}
      {conf.hotels && conf.hotels.length > 0 && (
        <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 28, marginTop: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: 0, letterSpacing: 0.5, textTransform: "uppercase" }}>
              <span style={{ marginRight: 8 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" style={{ verticalAlign: "middle" }}><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v.01M12 14v.01M16 14v.01M8 18v.01M12 18v.01M16 18v.01"/></svg></span>
              Official Hotel Partners
            </h3>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>Negotiated conference rates</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: conf.hotels.length > 1 ? "1fr 1fr" : "1fr", gap: 16 }}>
            {conf.hotels.map((hotel, i) => {
              const nights = Math.ceil((new Date(conf.end) - new Date(conf.start)) / (1000 * 60 * 60 * 24));
              const savings = (hotel.rackRate - hotel.confRate) * nights;
              const hotelBookDays = daysUntil(hotel.bookBy);
              return (
                <div key={i} style={{ background: "#f9fafb", borderRadius: 14, padding: 20, border: "1px solid rgba(96,165,250,0.2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{hotel.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ display: "flex", gap: 2 }}>
                          {Array.from({ length: hotel.stars }).map((_, s) => (
                            <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                          ))}
                        </div>
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>{hotel.distance}</span>
                      </div>
                    </div>
                    <div style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "#60a5fa", fontWeight: 600, letterSpacing: 0.5 }}>SAVE</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#60a5fa" }}>{formatPrice(savings)}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, marginBottom: 2 }}>CONF RATE</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#60a5fa" }}>{formatPrice(hotel.confRate)}<span style={{ fontSize: 12, fontWeight: 400, color: "#9ca3af" }}>/night</span></div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, marginBottom: 2 }}>RACK RATE</div>
                      <div style={{ fontSize: 16, color: "#9ca3af", textDecoration: "line-through", marginTop: 4 }}>{formatPrice(hotel.rackRate)}/night</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                    {nights} nights = <span style={{ color: "#60a5fa", fontWeight: 700 }}>{formatPrice(hotel.confRate * nights)} total</span>
                    <span style={{ color: "#9ca3af" }}> (vs {formatPrice(hotel.rackRate * nights)} rack)</span>
                  </div>
                  {hotelBookDays > 0
                    ? <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: hotelBookDays < 14 ? "#ef4444" : "#f59e0b", fontWeight: 600 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Book by {hotel.bookBy} ({hotelBookDays} days left)</div>
                    : <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>Block rate expired</div>
                  }
                  <button style={{ width: "100%", marginTop: 12, padding: "10px 16px", borderRadius: 8, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.3)", color: "#60a5fa", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Book Hotel →</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Trip cost calculator */}
      {conf.hotels && conf.hotels.length > 0 && (() => {
        const nights = Math.ceil((new Date(conf.end) - new Date(conf.start)) / (1000 * 60 * 60 * 24));
        const cheapestHotel = conf.hotels.reduce((a, b) => a.confRate < b.confRate ? a : b);
        const ticketPrice = conf.earlyBird || conf.price;
        const ticketWithDiscount = conf.discount ? Math.round(ticketPrice * (1 - conf.discountPct / 100)) : ticketPrice;
        const hotelTotal = cheapestHotel.confRate * nights;
        const totalTrip = ticketWithDiscount + hotelTotal;
        const totalSavings = (conf.price + cheapestHotel.rackRate * nights) - totalTrip;
        return (
          <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 28, marginTop: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 20px 0", letterSpacing: 0.5, textTransform: "uppercase" }}>Estimated Trip Cost</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto 1fr", gap: 16, alignItems: "center" }}>
              <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>TICKET{conf.discount ? " (w/ code)" : ""}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#f97316" }}>{formatPrice(ticketWithDiscount)}</div>
                {conf.discount && <div style={{ fontSize: 11, color: "#9ca3af", textDecoration: "line-through" }}>{formatPrice(conf.earlyBird || conf.price)}</div>}
              </div>
              <div style={{ textAlign: "center", fontSize: 24, color: "#9ca3af", fontWeight: 300 }}>+</div>
              <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>HOTEL ({nights} nights)</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#60a5fa" }}>{formatPrice(hotelTotal)}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{cheapestHotel.name}</div>
              </div>
              <div style={{ textAlign: "center", fontSize: 24, color: "#9ca3af", fontWeight: 300 }}>=</div>
              <div style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.05))", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>TOTAL TRIP</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#22c55e" }}>{formatPrice(totalTrip)}</div>
                <div style={{ fontSize: 11, color: "#4ade80", fontWeight: 600 }}>You save {formatPrice(totalSavings)} via ConferenceCodes</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CTA buttons */}
      <div style={{ textAlign: "center", marginTop: 32, display: "flex", gap: 16, justifyContent: "center" }}>
        {conf.discount && codeState === "locked" && (
          <button onClick={handleGetCode} style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", color: "#fff", border: "none", padding: "16px 36px", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5, boxShadow: "0 8px 30px rgba(249,115,22,0.3)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            Get {conf.discountPct}% Off Code
          </button>
        )}
        <button style={{ background: conf.discount && codeState !== "locked" ? "rgba(249,115,22,0.1)" : "linear-gradient(135deg, #f97316, #ea580c)", color: conf.discount && codeState !== "locked" ? "#f97316" : "#fff", border: conf.discount && codeState !== "locked" ? "1px solid rgba(249,115,22,0.3)" : "none", padding: "16px 36px", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5, boxShadow: conf.discount && codeState !== "locked" ? "none" : "0 8px 30px rgba(249,115,22,0.3)", fontFamily: "inherit" }}>Book Now →</button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ConferencePage() {
  const { slug } = useParams();
  const router = useRouter();
  const [conf, setConf] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch("/api/public/conferences")
      .then(r => r.json())
      .then(data => {
        const match = data.find((c: any) => c.slug === slug);
        if (match) {
          setConf(transformConference(match));
        } else {
          setNotFound(true);
        }
        setLoading(false);
      })
      .catch(() => { setLoading(false); setNotFound(true); });
  }, [slug]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", fontFamily: "'DM Sans', -apple-system, sans-serif", color: "#111827" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&family=Space+Mono:wght@400;700&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; }
      `}</style>

      {/* Nav */}
      <div style={{ background: "#0f172a", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <nav style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", display: "flex", justifyContent: "space-between", alignItems: "center", height: 64 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #f97316, #ea580c)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 15px rgba(249,115,22,0.3)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>
              <span style={{ color: "#f1f5f9" }}>Conference</span>
              <span style={{ color: "#f97316" }}>Codes</span>
            </span>
          </a>
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <a href="/how-it-works" style={{ fontSize: 13, color: "#cbd5e1", textDecoration: "none" }}>How It Works</a>
            <a href="/for-organizers" style={{ fontSize: 13, color: "#cbd5e1", textDecoration: "none" }}>For Organizers</a>
          </div>
        </nav>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px 80px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#6b7280" }}>Loading...</div>
        )}
        {notFound && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#6b7280", marginBottom: 12 }}>Conference not found</div>
            <a href="/" style={{ color: "#f97316", textDecoration: "none", fontWeight: 600 }}>← Back to all conferences</a>
          </div>
        )}
        {conf && <ConferenceDetail conf={conf} onBack={() => router.back()} />}
      </div>
    </div>
  );
}
