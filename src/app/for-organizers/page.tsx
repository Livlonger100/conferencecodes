export default function ForOrganizers() {
  const benefits = [
    {
      title: "Reach more attendees",
      body: "Get discovered by professionals actively searching for conferences in your space. Our directory is built for buyers, not browsers.",
      icon: (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
      ),
    },
    {
      title: "Verified listings build trust",
      body: "Every listing on ConferenceCodes is verified against the source. Attendees know our data is accurate — so your listing carries more credibility.",
      icon: (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      ),
    },
    {
      title: "Free to list",
      body: "Basic listings are completely free. Submit your conference and we'll add it to the directory at no cost. No catch.",
      icon: (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
      ),
    },
    {
      title: "Optional promoted placement",
      body: "Want to stand out? Promoted listings appear at the top of search results with a featured badge. Get in touch to learn more.",
      icon: (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      ),
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", fontFamily: "var(--font-geist-sans), system-ui, sans-serif", color: "#111827" }}>
      {/* Nav */}
      <div style={{ background: "#0f172a", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <nav style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", display: "flex", justifyContent: "space-between", alignItems: "center", height: 64 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #f97316, #ea580c)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 15px rgba(249,115,22,0.3)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>
              <span style={{ color: "#f1f5f9" }}>Conference</span><span style={{ color: "#f97316" }}>Codes</span>
            </span>
          </a>
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <a href="/how-it-works" style={{ fontSize: 13, color: "#cbd5e1", textDecoration: "none" }}>How It Works</a>
            <a href="/for-organizers" style={{ fontSize: 13, color: "#f97316", fontWeight: 600, textDecoration: "none" }}>For Organizers</a>
            <a href="/" style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", color: "#f97316", padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>Browse Conferences</a>
          </div>
        </nav>
      </div>

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "72px 32px 56px", maxWidth: 700, margin: "0 auto" }}>
        <h1 style={{ fontSize: 44, fontWeight: 800, color: "#111827", lineHeight: 1.15, margin: "0 0 16px" }}>
          List your conference.<br />
          <span style={{ color: "#f97316" }}>Fill more seats.</span>
        </h1>
        <p style={{ fontSize: 17, color: "#6b7280", lineHeight: 1.7, margin: 0 }}>
          ConferenceCodes connects organizers with motivated attendees. Get your event in front of the right people — for free.
        </p>
      </div>

      {/* Benefits grid */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 32px 72px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {benefits.map((b, i) => (
          <div key={i} style={{
            background: "#ffffff", border: "1px solid #e5e7eb",
            borderRadius: 20, padding: "32px 32px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
              {b.icon}
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 10px" }}>{b.title}</h3>
            <p style={{ fontSize: 15, color: "#6b7280", lineHeight: 1.7, margin: 0 }}>{b.body}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ textAlign: "center", padding: "0 32px 96px" }}>
        <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 24, padding: "48px 40px", maxWidth: 560, margin: "0 auto", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: "#111827", margin: "0 0 12px" }}>Get listed today</h2>
          <p style={{ fontSize: 15, color: "#6b7280", margin: "0 0 28px", lineHeight: 1.6 }}>
            Send us your conference details and we'll get it added to the directory. Basic listings are free — promoted placements available on request.
          </p>
          <a
            href="mailto:roger@conferencecodes.com?subject=Organizer%20Partnership"
            style={{
              display: "inline-block", padding: "14px 36px", borderRadius: 10,
              background: "linear-gradient(135deg, #f97316, #ea580c)", color: "#fff",
              fontSize: 16, fontWeight: 700, textDecoration: "none",
              boxShadow: "0 4px 20px rgba(249,115,22,0.3)",
            }}>Contact Us to Get Listed</a>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #e5e7eb", padding: "32px", background: "#f3f4f6" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>
            <span style={{ color: "#111827" }}>Conference</span><span style={{ color: "#f97316" }}>Codes</span>
          </span>
          <div style={{ display: "flex", gap: 24 }}>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>Privacy</span>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>Terms</span>
            <a href="/for-organizers" style={{ fontSize: 12, color: "#9ca3af", textDecoration: "none" }}>For Organizers</a>
          </div>
        </div>
      </div>
    </div>
  );
}
