// @ts-nocheck
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  daysUntil, formatDate, formatDateRange, formatPrice, getCurrentPricing, getConferenceStatus,
} from "@/lib/conference-utils";

// ── Category color map (matches homepage) ─────────────────────────────────────

function getCategoryStyle(category) {
  const map = {
    "AI / Tech":          { bg: "#EEEDFE", text: "#3C3489" },
    "Longevity / Health": { bg: "#E1F5EE", text: "#085041" },
    "SaaS":               { bg: "#E6F1FB", text: "#0C447C" },
    "Biotech":            { bg: "#FAECE7", text: "#712B13" },
    "Developer":          { bg: "#FEF7E0", text: "#8B6914" },
    "Health tech":        { bg: "#FAEEDA", text: "#633806" },
  };
  return map[category] || { bg: "#EEEDFE", text: "#3C3489" };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function VerifiedBadge({ confidence, lastVerified }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: confidence > 0.9 ? "#22c55e" : confidence > 0.8 ? "#f59e0b" : "#ef4444" }} />
      <span style={{ fontSize: 11, color: "var(--cc-muted)", letterSpacing: 0.3 }}>Verified {lastVerified}</span>
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

  const duration = Math.ceil((new Date(conf.end).getTime() - new Date(conf.start).getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const daysAway = daysUntil(conf.start);
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

      {/* Header */}
      <div style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "24px 28px 20px", marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <span style={{
              display: "inline-block", fontSize: 11, fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase",
              color: catStyle.text, background: catStyle.bg,
              padding: "4px 10px", borderRadius: 6, marginBottom: 10,
            }}>{conf.category}</span>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: "var(--cc-ink)", margin: "0 0 6px 0" }}>{conf.name}</h1>
            <p style={{ fontSize: 14, color: "var(--cc-muted)", margin: 0 }}>by {conf.organizer}</p>
          </div>
          <VerifiedBadge confidence={conf.confidence} lastVerified={conf.lastVerified} />
        </div>

        <p style={{ fontSize: 15, color: "var(--cc-body)", lineHeight: 1.6, margin: "16px 0" }}>{conf.description}</p>

        {conf.source_url && (
          <a href={conf.source_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, fontSize: 14, fontWeight: 600, color: "var(--cc-gold-dk)", textDecoration: "none" }}>
            Visit Conference Website
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </a>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {[
            { label: "Location", value: `${conf.city}, ${conf.country}` },
            { label: "Dates", value: formatDateRange(conf.start, conf.end), sub: confStatus.label, subColor: confStatus.color },
            { label: "Duration", value: `${duration} days` },
            { label: "Attendees", value: conf.attendees ? conf.attendees.toLocaleString() : "TBA" },
          ].map((item, i) => (
            <div key={i} style={{ background: "var(--cc-warm-gray)", borderRadius: 10, padding: 12, border: "1px solid rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 10, color: "var(--cc-muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4, fontWeight: 600 }}>{item.label}</div>
              <div style={{ fontSize: 14, color: "var(--cc-ink)", fontWeight: 600 }}>{item.value}</div>
              {item.sub && <div style={{ fontSize: 11, color: item.subColor || "var(--cc-gold-dk)", marginTop: 2 }}>{item.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "20px 28px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, color: "var(--cc-muted)", margin: "0 0 20px 0", letterSpacing: "0.8px", textTransform: "uppercase" }}>Pricing</h3>

        {(() => {
          const tiers = conf.pricingTiers || [];
          const now = new Date();
          if (tiers.length === 0) return <div style={{ fontSize: 14, color: "var(--cc-muted)" }}>Pricing not available</div>;
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
              <div key={i} style={{ background: isCurrent ? "var(--cc-gold-bg)" : "var(--cc-warm-gray)", border: `1px solid ${isCurrent ? "var(--cc-gold-dk)" : "rgba(0,0,0,0.06)"}`, borderRadius: 12, padding: "14px 16px", marginBottom: 8, opacity: (tier.sold_out || deadlinePassed) ? 0.5 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isCurrent ? "var(--cc-gold-dk)" : "var(--cc-body)", marginBottom: tier.deadline || tier.priceAfterDeadline ? 4 : 0 }}>
                      {tier.label}
                      {tier.sold_out && <span style={{ marginLeft: 8, fontSize: 11, color: "#ef4444", fontWeight: 700 }}>SOLD OUT</span>}
                      {tier.requires_approval && !tier.sold_out && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--cc-muted)" }}>requires approval</span>}
                    </div>
                    {tier.deadline && (
                      <div style={{ fontSize: 11, color: deadlinePassed ? "var(--cc-muted)" : urgent ? "#ef4444" : "#f59e0b", display: "flex", alignItems: "center", gap: 4 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {deadlinePassed
                          ? (tier.isEarlyBird ? `Early bird expired (${formatDate(tier.deadline)})` : `Price increase passed (${formatDate(tier.deadline)})`)
                          : (tier.isEarlyBird ? `Early bird deadline: ${formatDate(tier.deadline)} — ${daysLeft}d left` : `Price increases after ${formatDate(tier.deadline)} — ${daysLeft}d left`)}
                      </div>
                    )}
                    {tier.priceAfterDeadline && !deadlinePassed && (
                      <div style={{ fontSize: 11, color: "var(--cc-gold-dk)", marginTop: 2 }}>↑ rises to {formatPrice(tier.priceAfterDeadline)} after deadline</div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: isCurrent ? "var(--cc-gold-dk)" : tier.sold_out || deadlinePassed ? "var(--cc-muted)" : "var(--cc-ink)" }}>{formatPrice(tier.price)}</div>
                    {tier.priceAfterDeadline && !deadlinePassed && (
                      <div style={{ fontSize: 12, color: "var(--cc-muted)", textDecoration: "line-through" }}>{formatPrice(tier.priceAfterDeadline)}</div>
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
            <div style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 11, color: "#22c55e", fontWeight: 600, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 4 }}>{conf.earlyBird ? "Early Bird + CC Code" : "With CC Code"}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e" }}>{formatPrice(withCode)}</div>
                  <div style={{ fontSize: 11, color: "var(--cc-muted)" }}>{conf.earlyBird ? `${formatPrice(conf.earlyBird)} early bird – ${conf.discountPct}% code` : `${formatPrice(conf.price)} – ${conf.discountPct}% code`}</div>
                </div>
                <div style={{ background: "#E2F5D6", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "#1D6B10", fontWeight: 600, letterSpacing: "0.5px" }}>TOTAL SAVINGS</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1D6B10" }}>{formatPrice(totalSavings)}</div>
                  <div style={{ fontSize: 10, color: "#1D6B10" }}>{Math.round((1 - withCode / conf.price) * 100)}% off standard</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Savings waterfall */}
        {(conf.earlyBird || conf.discount) && (() => {
          const steps = [{ label: "Standard price", amount: conf.price, color: "var(--cc-muted)" }];
          if (conf.earlyBird) steps.push({ label: "Early bird saves you", amount: -(conf.price - conf.earlyBird), color: "var(--cc-gold-dk)" });
          if (conf.discount) {
            const base = conf.earlyBird || conf.price;
            steps.push({ label: "CC code saves you", amount: -Math.round(base * conf.discountPct / 100), color: "#22c55e" });
          }
          const finalPrice = conf.discount
            ? Math.round((conf.earlyBird || conf.price) * (1 - conf.discountPct / 100))
            : conf.earlyBird || conf.price;
          return (
            <div style={{ background: "var(--cc-warm-gray)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "var(--cc-muted)", fontWeight: 600, letterSpacing: "0.6px", marginBottom: 10, textTransform: "uppercase" }}>Savings Breakdown</div>
              {steps.map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                  <span style={{ fontSize: 12, color: "var(--cc-body)" }}>{s.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: s.color, fontFamily: "monospace" }}>
                    {s.amount > 0 ? formatPrice(s.amount) : "–" + formatPrice(Math.abs(s.amount))}
                  </span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "var(--cc-ink)", fontWeight: 600 }}>You pay</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#22c55e", fontFamily: "monospace" }}>{formatPrice(finalPrice)}</span>
              </div>
            </div>
          );
        })()}

        {/* Discount code reveal */}
        {conf.discount && (
          <div style={{ borderRadius: 12, overflow: "hidden" }}>
            {codeState === "locked" && (
              <div style={{ background: "var(--cc-gold-bg)", border: "1px solid var(--cc-gold)", borderRadius: 12, padding: 20, textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--cc-gold-dk)", marginBottom: 4 }}>{conf.discountPct}% OFF</div>
                <div style={{ fontSize: 13, color: "var(--cc-body)", marginBottom: 14 }}>Exclusive discount available for this conference</div>
                <div style={{ fontSize: 12, color: "var(--cc-gold-dk)", marginBottom: 14 }}>
                  {conf.earlyBird
                    ? <span>Pay <span style={{ fontWeight: 700, fontSize: 16 }}>{formatPrice(Math.round(conf.earlyBird * (1 - conf.discountPct / 100)))}</span> instead of {formatPrice(conf.earlyBird)}</span>
                    : <span>Pay <span style={{ fontWeight: 700, fontSize: 16 }}>{formatPrice(Math.round(conf.price * (1 - conf.discountPct / 100)))}</span> instead of {formatPrice(conf.price)}</span>}
                </div>
                <button onClick={handleGetCode} style={{ width: "100%", padding: "14px 24px", borderRadius: 10, background: "var(--cc-gold)", border: "none", color: "var(--cc-ink)", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                  Get Your Code — Free
                </button>
                <div style={{ fontSize: 11, color: "var(--cc-muted)", marginTop: 8 }}>Limited codes available</div>
              </div>
            )}
            {codeState === "form" && (
              <div style={{ background: "var(--cc-gold-bg)", border: "1px solid var(--cc-gold)", borderRadius: 12, padding: 20, animation: "fadeIn 0.3s ease" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--cc-ink)", marginBottom: 4 }}>Enter your email to unlock your code</div>
                <div style={{ fontSize: 12, color: "var(--cc-body)", marginBottom: 16 }}>Your code will also be emailed to you for safekeeping.</div>
                <input type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmitEmail()} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, marginBottom: 12, background: "#fff", border: "1px solid rgba(0,0,0,0.15)", color: "var(--cc-ink)", fontSize: 14, fontFamily: "inherit", outline: "none" }} />
                <button onClick={handleSubmitEmail} style={{ width: "100%", padding: "12px 24px", borderRadius: 10, background: "var(--cc-gold)", border: "none", color: "var(--cc-ink)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: email.includes("@") ? 1 : 0.5 }}>Unlock My Code</button>
                <div style={{ fontSize: 10, color: "var(--cc-muted)", marginTop: 8, textAlign: "center" }}>We'll never spam you. One email with your code, that's it.</div>
              </div>
            )}
            {codeState === "revealed" && (
              <div style={{ background: "var(--cc-gold)", borderRadius: 12, padding: 20, textAlign: "center", animation: "fadeIn 0.3s ease" }}>
                <div style={{ fontSize: 11, color: "var(--cc-gold-dk)", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 6 }}>YOUR EXCLUSIVE CODE</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "var(--cc-ink)", letterSpacing: 3, background: "rgba(0,0,0,0.12)", borderRadius: 8, padding: "12px 24px", display: "inline-block", fontFamily: "monospace", cursor: "pointer" }} onClick={() => navigator.clipboard?.writeText(revealedCode)}>
                  {revealedCode}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--cc-ink)" strokeWidth="2" style={{ marginLeft: 10, verticalAlign: "middle", opacity: 0.5 }}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                </div>
                <div style={{ fontSize: 13, color: "var(--cc-ink)", marginTop: 10, fontWeight: 600 }}>Save {conf.discountPct}% on your ticket</div>
                <div style={{ fontSize: 11, color: "var(--cc-gold-dk)", marginTop: 4 }}>Code also sent to {email}</div>
                <div style={{ fontSize: 11, color: "var(--cc-gold-dk)", marginTop: 12, padding: "8px 0", borderTop: "1px solid rgba(0,0,0,0.12)" }}>Use this code on the conference's registration page at checkout</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Speakers & Tags */}
      {(conf.speakers?.length > 0 || conf.tags?.length > 0) && (
        <div style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 24, marginTop: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          {conf.speakers?.length > 0 && (
            <>
              <h3 style={{ fontSize: 10, fontWeight: 600, color: "var(--cc-muted)", margin: "0 0 12px 0", letterSpacing: "0.8px", textTransform: "uppercase" }}>Speakers</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: conf.tags?.length > 0 ? 20 : 0 }}>
                {conf.speakers.map((s, i) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--cc-warm-gray)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 20, padding: "5px 12px 5px 6px" }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: `hsl(${i * 60 + 200}, 40%, 50%)`, fontSize: 11, fontWeight: 600, color: "#fff", flexShrink: 0 }}>{s.charAt(0)}</span>
                    <span style={{ fontSize: 13, color: "var(--cc-body)", fontWeight: 500 }}>{s}</span>
                  </span>
                ))}
              </div>
            </>
          )}
          {conf.tags?.length > 0 && (
            <>
              <h3 style={{ fontSize: 10, fontWeight: 600, color: "var(--cc-muted)", margin: "0 0 12px 0", letterSpacing: "0.8px", textTransform: "uppercase" }}>Topics</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {conf.tags.map((t, i) => (
                  <span key={i} style={{ fontSize: 12, color: "var(--cc-body)", background: "var(--cc-warm-gray)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, padding: "5px 12px" }}>{t}</span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Hotels */}
      {conf.hotels && conf.hotels.length > 0 && (
        <div style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 28, marginTop: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ fontSize: 11, fontWeight: 600, color: "var(--cc-muted)", margin: 0, letterSpacing: "0.8px", textTransform: "uppercase" }}>
              Official Hotel Partners
            </h3>
            <span style={{ fontSize: 12, color: "var(--cc-muted)" }}>Negotiated conference rates</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: conf.hotels.length > 1 ? "1fr 1fr" : "1fr", gap: 16 }}>
            {conf.hotels.map((hotel, i) => {
              const nights = Math.ceil((new Date(conf.end).getTime() - new Date(conf.start).getTime()) / (1000 * 60 * 60 * 24));
              const savings = (hotel.rackRate - hotel.confRate) * nights;
              const hotelBookDays = daysUntil(hotel.bookBy);
              return (
                <div key={i} style={{ background: "var(--cc-warm-gray)", borderRadius: 12, padding: 20, border: "1px solid rgba(0,0,0,0.08)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--cc-ink)", marginBottom: 4 }}>{hotel.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ display: "flex", gap: 2 }}>
                          {Array.from({ length: hotel.stars }).map((_, s) => (
                            <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                          ))}
                        </div>
                        <span style={{ fontSize: 11, color: "var(--cc-muted)" }}>{hotel.distance}</span>
                      </div>
                    </div>
                    <div style={{ background: "#E6F1FB", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "#0C447C", fontWeight: 600, letterSpacing: "0.5px" }}>SAVE</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#0C447C" }}>{formatPrice(savings)}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "var(--cc-muted)", fontWeight: 600, letterSpacing: "0.5px", marginBottom: 2 }}>CONF RATE</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "#0C447C" }}>{formatPrice(hotel.confRate)}<span style={{ fontSize: 12, fontWeight: 400, color: "var(--cc-muted)" }}>/night</span></div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "var(--cc-muted)", fontWeight: 600, letterSpacing: "0.5px", marginBottom: 2 }}>RACK RATE</div>
                      <div style={{ fontSize: 16, color: "var(--cc-muted)", textDecoration: "line-through", marginTop: 4 }}>{formatPrice(hotel.rackRate)}/night</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--cc-body)", marginBottom: 8 }}>
                    {nights} nights = <span style={{ color: "#0C447C", fontWeight: 700 }}>{formatPrice(hotel.confRate * nights)} total</span>
                    <span style={{ color: "var(--cc-muted)" }}> (vs {formatPrice(hotel.rackRate * nights)} rack)</span>
                  </div>
                  {hotelBookDays > 0
                    ? <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: hotelBookDays < 14 ? "#ef4444" : "#f59e0b", fontWeight: 600 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Book by {hotel.bookBy} ({hotelBookDays} days left)</div>
                    : <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>Block rate expired</div>}
                  <button style={{ width: "100%", marginTop: 12, padding: "10px 16px", borderRadius: 8, background: "transparent", border: "1px solid rgba(0,0,0,0.15)", color: "var(--cc-body)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Book Hotel →</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Trip cost calculator */}
      {conf.hotels && conf.hotels.length > 0 && (() => {
        const nights = Math.ceil((new Date(conf.end).getTime() - new Date(conf.start).getTime()) / (1000 * 60 * 60 * 24));
        const cheapestHotel = conf.hotels.reduce((a, b) => a.confRate < b.confRate ? a : b);
        const ticketPrice = conf.earlyBird || conf.price;
        const ticketWithDiscount = conf.discount ? Math.round(ticketPrice * (1 - conf.discountPct / 100)) : ticketPrice;
        const hotelTotal = cheapestHotel.confRate * nights;
        const totalTrip = ticketWithDiscount + hotelTotal;
        const totalSavings = (conf.price + cheapestHotel.rackRate * nights) - totalTrip;
        return (
          <div style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 28, marginTop: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <h3 style={{ fontSize: 11, fontWeight: 600, color: "var(--cc-muted)", margin: "0 0 20px 0", letterSpacing: "0.8px", textTransform: "uppercase" }}>Estimated Trip Cost</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto 1fr", gap: 16, alignItems: "center" }}>
              <div style={{ background: "var(--cc-gold-bg)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "var(--cc-muted)", fontWeight: 600, letterSpacing: "0.5px", marginBottom: 6 }}>TICKET{conf.discount ? " (w/ code)" : ""}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--cc-gold-dk)" }}>{formatPrice(ticketWithDiscount)}</div>
                {conf.discount && <div style={{ fontSize: 11, color: "var(--cc-muted)", textDecoration: "line-through" }}>{formatPrice(conf.earlyBird || conf.price)}</div>}
              </div>
              <div style={{ textAlign: "center", fontSize: 24, color: "var(--cc-muted)", fontWeight: 300 }}>+</div>
              <div style={{ background: "#E6F1FB", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "var(--cc-muted)", fontWeight: 600, letterSpacing: "0.5px", marginBottom: 6 }}>HOTEL ({nights} nights)</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#0C447C" }}>{formatPrice(hotelTotal)}</div>
                <div style={{ fontSize: 11, color: "var(--cc-muted)" }}>{cheapestHotel.name}</div>
              </div>
              <div style={{ textAlign: "center", fontSize: 24, color: "var(--cc-muted)", fontWeight: 300 }}>=</div>
              <div style={{ background: "#E2F5D6", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#1D6B10", fontWeight: 600, letterSpacing: "0.5px", marginBottom: 6 }}>TOTAL TRIP</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#1D6B10" }}>{formatPrice(totalTrip)}</div>
                <div style={{ fontSize: 11, color: "#1D6B10", fontWeight: 600 }}>You save {formatPrice(totalSavings)} via ConferenceCodes</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CTA */}
      <div style={{ textAlign: "center", marginTop: 32, display: "flex", gap: 12, justifyContent: "center" }}>
        {conf.discount && codeState === "locked" && (
          <button onClick={handleGetCode} style={{ background: "var(--cc-gold)", color: "var(--cc-ink)", border: "none", padding: "14px 32px", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            Get {conf.discountPct}% Off Code
          </button>
        )}
        <button style={{
          background: conf.discount && codeState !== "locked" ? "transparent" : "var(--cc-gold)",
          color: conf.discount && codeState !== "locked" ? "var(--cc-body)" : "var(--cc-ink)",
          border: conf.discount && codeState !== "locked" ? "1px solid rgba(0,0,0,0.15)" : "none",
          padding: "14px 32px", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>Book Now →</button>
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
      <div style={{ background: "var(--cc-ink)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <nav style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", display: "flex", justifyContent: "space-between", alignItems: "center", height: 60 }}>
          <a href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>
              <span style={{ color: "#ffffff" }}>Conference</span>
              <span style={{ color: "var(--cc-gold)" }}>Codes</span>
            </span>
          </a>
          <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
            <a href="/how-it-works" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>How It Works</a>
            <a href="/for-organizers" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>For Organizers</a>
          </div>
        </nav>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px 80px" }}>
        <ConferenceDetail conf={conf} onBack={() => router.back()} />
      </div>

      {/* Footer */}
      <div style={{ background: "var(--cc-ink)", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>© 2026 ConferenceCodes</span>
          <div style={{ display: "flex", gap: 24 }}>
            <a href="/for-organizers" style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>For Organizers</a>
            <a href="/how-it-works" style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>How It Works</a>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Privacy</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Terms</span>
          </div>
        </div>
      </div>
    </div>
  );
}
