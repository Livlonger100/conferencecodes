import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase";
import { transformConference, formatDateRange, formatPrice } from "@/lib/conference-utils";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "AI Conference Discount Codes 2026: Verified Promo Codes | ConferenceCodes",
  description:
    "Exclusive discount codes for AI and tech conferences in 2026. Verified pricing and promo codes for NVIDIA GTC, Databricks Data+AI Summit, SuperAI, Google Cloud Next, AI Agent Conference, and more.",
};

const NAV_LINKS = [
  { href: "/ai-conferences", label: "AI Conferences", active: true },
  { href: "/how-it-works", label: "How It Works", active: false },
  { href: "/for-organizers", label: "For Organizers", active: false },
];

export default async function AIConferencesPage() {
  const { data } = await supabaseAdmin
    .from("conferences")
    .select("*, pricing_tiers(*), hotels(*)")
    .eq("category", "AI / Tech")
    .in("status", ["active", "sold_out"])
    .order("start_date", { ascending: true });

  const conferences = (data ?? []).map(transformConference);

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", fontFamily: "'DM Sans', -apple-system, sans-serif", color: "#111827" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        a { text-decoration: none; }
        .conf-card:hover { border-color: rgba(96,165,250,0.4) !important; transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0,0,0,0.08) !important; }
        .conf-card { transition: all 0.2s ease; }
        @media (max-width: 640px) {
          .aic-nav { flex-wrap: wrap !important; height: auto !important; padding: 10px 16px !important; row-gap: 8px !important; }
          .aic-nav-links { flex-basis: 100% !important; justify-content: flex-start !important; gap: 10px 16px !important; flex-wrap: wrap !important; }
          .aic-nav-links a { padding-top: 6px !important; padding-bottom: 6px !important; }
          .aic-card-row { flex-direction: column !important; gap: 12px !important; }
          .aic-card-cta { text-align: left !important; }
          .aic-hero-title { font-size: 28px !important; }
        }
      `}</style>

      {/* Nav */}
      <div style={{ background: "#0f172a", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <nav className="aic-nav" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", display: "flex", justifyContent: "space-between", alignItems: "center", height: 64 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #f97316, #ea580c)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 15px rgba(249,115,22,0.3)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>
              <span style={{ color: "#f1f5f9" }}>Conference</span><span style={{ color: "#f97316" }}>Codes</span>
            </span>
          </a>
          <div className="aic-nav-links" style={{ display: "flex", gap: 24, alignItems: "center" }}>
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} style={{ fontSize: 13, color: l.active ? "#f97316" : "#cbd5e1", fontWeight: l.active ? 700 : 400 }}>{l.label}</a>
            ))}
          </div>
        </nav>
      </div>

      {/* Hero */}
      <div style={{ background: "#f8f9fa", borderBottom: "1px solid #e5e7eb", padding: "40px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#60a5fa", background: "rgba(96,165,250,0.1)", padding: "4px 10px", borderRadius: 5, marginBottom: 14 }}>AI / Tech</span>
          <h1 className="aic-hero-title" style={{ fontSize: 36, fontWeight: 800, color: "#111827", margin: "0 0 12px 0", lineHeight: 1.2 }}>
            AI Conference Discount Codes 2026
          </h1>
          <p style={{ fontSize: 16, color: "#6b7280", margin: "0 0 20px 0", maxWidth: 600, lineHeight: 1.6 }}>
            {conferences.length} verified AI and tech conferences with exclusive promo codes, confirmed early bird pricing, and negotiated hotel rates.
          </p>
          <a href="/" style={{ fontSize: 13, color: "#9ca3af" }}>← All conferences</a>
        </div>
      </div>

      {/* Conference list */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
          {conferences.map((conf) => {
            const price = conf.earlyBird ?? conf.price;
            return (
              <a key={conf.id} href={`/conference/${conf.slug}`} className="conf-card" style={{ display: "block", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                <div className="aic-card-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}>{conf.name}</h2>
                      {conf.hasCode && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.1)", padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>{conf.discountPct}% CODE AVAILABLE</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 10 }}>
                      {formatDateRange(conf.start, conf.end)} &nbsp;·&nbsp; {conf.city}, {conf.country} &nbsp;·&nbsp; {conf.format}
                    </div>
                    <p style={{ fontSize: 14, color: "#374151", margin: 0, lineHeight: 1.5 }}>{conf.description}</p>
                  </div>
                  <div className="aic-card-cta" style={{ textAlign: "right", flexShrink: 0 }}>
                    {price > 0 && (
                      <div style={{ fontSize: 24, fontWeight: 800, color: "#f97316", marginBottom: 4 }}>{formatPrice(price)}</div>
                    )}
                    {conf.earlyBird && (
                      <div style={{ fontSize: 11, color: "#f97316", marginBottom: 8 }}>Early bird</div>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#60a5fa" }}>View details →</span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>

        <div style={{ textAlign: "center", marginTop: 48 }}>
          <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: "#f97316", padding: "12px 28px", border: "1px solid rgba(249,115,22,0.3)", borderRadius: 10, background: "rgba(249,115,22,0.05)" }}>
            View all conferences →
          </a>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #e5e7eb", padding: "32px", background: "#f3f4f6" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}><span style={{ color: "#111827" }}>Conference</span><span style={{ color: "#f97316" }}>Codes</span></span>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>© 2026</span>
        </div>
      </div>
    </div>
  );
}
