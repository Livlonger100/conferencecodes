// @ts-nocheck
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { daysUntil, formatDate, formatDateRange, getConferenceStatus } from "@/lib/conference-utils";
import { PUBLIC_PRICING_NOTE_BELOW } from "@/lib/pipeline/config";

// ── Category color map (label only) ───────────────────────────────────────────

function getCategoryStyle(category) {
  const map = {
    "AI / Tech": { bg: "#EEEDFE", text: "#3C3489" },
    "AI/ML":     { bg: "#EEEDFE", text: "#3C3489" },
  };
  return map[category] || { bg: "#EEEDFE", text: "#3C3489" };
}

// Currency-aware price formatter (falls back to "TBA" when price is unknown)
function formatMoney(price, currency = "USD") {
  if (price == null) return "TBA";
  if (Number(price) === 0) return "Free";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${Number(price).toLocaleString()} ${currency || ""}`.trim();
  }
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

  const confStatus = getConferenceStatus(conf.start, conf.end || null);
  const catStyle = getCategoryStyle(conf.category);

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--cc-muted)", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", gap: 6, padding: 0, marginBottom: 24, fontFamily: "inherit" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back to results
      </button>

      {confStatus.status === "ended" && (
        <div style={{ background: "var(--cc-warm-gray)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "10px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--cc-muted)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style={{ fontSize: 13, color: "var(--cc-body)" }}>This conference has ended. Pricing shown for reference.</span>
        </div>
      )}

      {/* Header: title, dates, location, description, official website link */}
      <div style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "24px 28px 20px", marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <span style={{
          display: "inline-block", fontSize: 11, fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase",
          color: catStyle.text, background: catStyle.bg,
          padding: "4px 10px", borderRadius: 6, marginBottom: 10,
        }}>{conf.category}</span>

        <h1 style={{ fontSize: 28, fontWeight: 600, color: "var(--cc-ink)", margin: "0 0 12px 0" }}>{conf.name}</h1>

        {conf.description && (
          <p style={{ fontSize: 15, color: "var(--cc-body)", lineHeight: 1.6, margin: "0 0 16px 0" }}>{conf.description}</p>
        )}

        {conf.source_url && (
          <a href={conf.source_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, fontSize: 14, fontWeight: 600, color: "var(--cc-gold-dk)", textDecoration: "none" }}>
            Visit Official Conference Website
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </a>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div style={{ background: "var(--cc-warm-gray)", borderRadius: 10, padding: 12, border: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 10, color: "var(--cc-muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4, fontWeight: 600 }}>Dates</div>
            <div style={{ fontSize: 14, color: "var(--cc-ink)", fontWeight: 600 }}>{formatDateRange(conf.start, conf.end)}</div>
            {confStatus.label && <div style={{ fontSize: 11, color: confStatus.color, marginTop: 2 }}>{confStatus.label}</div>}
          </div>
          <div style={{ background: "var(--cc-warm-gray)", borderRadius: 10, padding: 12, border: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 10, color: "var(--cc-muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4, fontWeight: 600 }}>Location</div>
            <div style={{ fontSize: 14, color: "var(--cc-ink)", fontWeight: 600 }}>{[conf.city, conf.country].filter(Boolean).join(", ") || "TBA"}</div>
          </div>
        </div>
      </div>

      {/* Pricing tiers */}
      <div style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "20px 28px", marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <h2 style={{ fontSize: 11, fontWeight: 600, color: "var(--cc-muted)", margin: "0 0 20px 0", letterSpacing: "0.8px", textTransform: "uppercase" }}>Pricing</h2>

        {conf.confidence != null && conf.confidence < PUBLIC_PRICING_NOTE_BELOW && (() => {
          // Partial-but-honest pricing: a "from" framing plus a clear note and a
          // link to the official site. Does not imply the tier list is complete.
          const priced = (conf.pricingTiers || []).filter(t => t.price != null && !t.sold_out);
          const lowest = priced.length ? priced.reduce((a, b) => (b.price < a.price ? b : a)) : null;
          return (
            <div style={{ background: "var(--cc-warm-gray)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              {lowest && (
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--cc-ink)", marginBottom: 4 }}>Tickets from {formatMoney(lowest.price, lowest.currency)}</div>
              )}
              <div style={{ fontSize: 12, color: "var(--cc-body)", lineHeight: 1.5 }}>
                Pricing shown may be incomplete. Check the official site for full details and all ticket types.
                {conf.source_url && (
                  <> <a href={conf.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--cc-gold-dk)", fontWeight: 600, textDecoration: "none" }}>Visit the official site</a>.</>
                )}
              </div>
            </div>
          );
        })()}

        {(() => {
          const tiers = conf.pricingTiers || [];
          const now = new Date();
          if (tiers.length === 0) return <div style={{ fontSize: 14, color: "var(--cc-muted)" }}>Pricing not available yet.</div>;
          const visibleTiers = tiers.filter(t => !t.requires_approval);
          const activeTiers = visibleTiers.filter(t => !t.sold_out && t.price != null && (!t.deadline || new Date(t.deadline) >= now));
          const currentPrice = activeTiers.length > 0 ? Math.min(...activeTiers.map(t => t.price)) : null;
          return visibleTiers.map((tier, i) => {
            const isActive = !tier.sold_out && tier.price != null && (!tier.deadline || new Date(tier.deadline) >= now);
            const isCurrent = isActive && tier.price === currentPrice;
            const deadlinePassed = tier.deadline && new Date(tier.deadline) < now;
            const daysLeft = tier.deadline && !deadlinePassed ? daysUntil(tier.deadline) : null;
            const urgent = daysLeft !== null && daysLeft <= 7;
            const expired = tier.sold_out || deadlinePassed;
            return (
              <div key={i} style={{ background: isCurrent ? "var(--cc-gold-bg)" : "var(--cc-warm-gray)", border: `1px solid ${isCurrent ? "var(--cc-gold-dk)" : "rgba(0,0,0,0.06)"}`, borderRadius: 12, padding: "14px 16px", marginBottom: 8, opacity: expired ? 0.5 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isCurrent ? "var(--cc-gold-dk)" : "var(--cc-body)", marginBottom: tier.deadline || tier.priceAfterDeadline ? 4 : 0 }}>
                      {tier.label}
                      {tier.sold_out && <span style={{ marginLeft: 8, fontSize: 11, color: "#ef4444", fontWeight: 700 }}>SOLD OUT</span>}
                    </div>
                    {tier.deadline && (
                      <div style={{ fontSize: 11, color: deadlinePassed ? "var(--cc-muted)" : urgent ? "#ef4444" : "#f59e0b", display: "flex", alignItems: "center", gap: 4 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {deadlinePassed
                          ? (tier.isEarlyBird ? `Early bird expired (${formatDate(tier.deadline)})` : `Price increase passed (${formatDate(tier.deadline)})`)
                          : (tier.isEarlyBird ? `Early bird deadline: ${formatDate(tier.deadline)}, ${daysLeft}d left` : `Price increases after ${formatDate(tier.deadline)}, ${daysLeft}d left`)}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: isCurrent ? "var(--cc-gold-dk)" : expired ? "var(--cc-muted)" : "var(--cc-ink)" }}>{formatMoney(tier.price, tier.currency)}</div>
                    {tier.priceAfterDeadline != null && !deadlinePassed && (
                      <div style={{ fontSize: 12, color: "var(--cc-muted)", marginTop: 2 }}>then {formatMoney(tier.priceAfterDeadline, tier.currency)}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* Discount code section - always shown */}
      <div style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "20px 28px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <h2 style={{ fontSize: 11, fontWeight: 600, color: "var(--cc-muted)", margin: "0 0 16px 0", letterSpacing: "0.8px", textTransform: "uppercase" }}>Discount Code</h2>

        {conf.hasCode ? (
          <div style={{ borderRadius: 12, overflow: "hidden" }}>
            {codeState === "locked" && (
              <div style={{ background: "var(--cc-gold-bg)", border: "1px solid var(--cc-gold)", borderRadius: 12, padding: 20, textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--cc-gold-dk)", marginBottom: 4 }}>{conf.discountPct}% OFF</div>
                <div style={{ fontSize: 13, color: "var(--cc-body)", marginBottom: 14 }}>Exclusive discount available for this conference</div>
                <button onClick={handleGetCode} style={{ width: "100%", padding: "14px 24px", borderRadius: 10, background: "var(--cc-gold)", border: "none", color: "var(--cc-ink)", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                  Get Discount Code
                </button>
              </div>
            )}
            {codeState === "form" && (
              <div style={{ background: "var(--cc-gold-bg)", border: "1px solid var(--cc-gold)", borderRadius: 12, padding: 20, animation: "fadeIn 0.3s ease" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--cc-ink)", marginBottom: 4 }}>Enter your email to unlock your code</div>
                <div style={{ fontSize: 12, color: "var(--cc-body)", marginBottom: 16 }}>Your code will also be emailed to you for safekeeping.</div>
                <input type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmitEmail()} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, marginBottom: 12, background: "#fff", border: "1px solid rgba(0,0,0,0.15)", color: "var(--cc-ink)", fontSize: 14, fontFamily: "inherit", outline: "none" }} />
                <button onClick={handleSubmitEmail} style={{ width: "100%", padding: "12px 24px", borderRadius: 10, background: "var(--cc-gold)", border: "none", color: "var(--cc-ink)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: email.includes("@") ? 1 : 0.5 }}>Unlock My Code</button>
                <div style={{ fontSize: 10, color: "var(--cc-muted)", marginTop: 8, textAlign: "center" }}>We will never spam you. One email with your code, that is it.</div>
              </div>
            )}
            {codeState === "revealed" && (
              <div style={{ background: "var(--cc-gold)", borderRadius: 12, padding: 20, textAlign: "center", animation: "fadeIn 0.3s ease" }}>
                <div style={{ fontSize: 11, color: "var(--cc-gold-dk)", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 6 }}>YOUR EXCLUSIVE CODE</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "var(--cc-ink)", letterSpacing: 3, background: "rgba(0,0,0,0.12)", borderRadius: 8, padding: "12px 24px", display: "inline-block", fontFamily: "monospace", cursor: "pointer" }} onClick={() => navigator.clipboard?.writeText(revealedCode)}>
                  {revealedCode}
                </div>
                <div style={{ fontSize: 13, color: "var(--cc-ink)", marginTop: 10, fontWeight: 600 }}>Save {conf.discountPct}% on your ticket</div>
                <div style={{ fontSize: 11, color: "var(--cc-gold-dk)", marginTop: 4 }}>Code also sent to {email}</div>
                <div style={{ fontSize: 11, color: "var(--cc-gold-dk)", marginTop: 12, padding: "8px 0", borderTop: "1px solid rgba(0,0,0,0.12)" }}>Use this code on the conference registration page at checkout</div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: "var(--cc-warm-gray)", border: "1px dashed rgba(0,0,0,0.18)", borderRadius: 12, padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--cc-muted)", marginBottom: 4 }}>No Discount Code Available</div>
            <div style={{ fontSize: 13, color: "var(--cc-muted)" }}>We are working on securing an exclusive discount for this conference. Check back soon.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Full page wrapper ─────────────────────────────────────────────────────────

export default function ConferenceDetailClient({ conf }: { conf: any }) {
  const router = useRouter();
  return (
    <div style={{ minHeight: "100vh", background: "var(--cc-cream)", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: "var(--cc-ink)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; }
        input:focus { outline: none; border-color: var(--cc-gold) !important; }
        input::placeholder { color: var(--cc-muted); }
      `}</style>

      {/* Nav */}
      <div style={{ background: "#1C1B17", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <nav style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", display: "flex", justifyContent: "space-between", alignItems: "center", height: 60 }}>
          <a href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>
              <span style={{ color: "#ffffff" }}>Conference</span>
              <span style={{ color: "#EDBA2A" }}>Codes</span>
            </span>
          </a>
          <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
            <a href="/how-it-works" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>How It Works</a>
            <a href="/for-organizers" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>For Organizers</a>
          </div>
        </nav>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "32px 32px 80px" }}>
        <ConferenceDetail conf={conf} onBack={() => router.back()} />
      </div>

      {/* Footer */}
      <div style={{ background: "#1C1B17", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
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
    </div>
  );
}
