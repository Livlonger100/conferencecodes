export default function HowItWorks() {
  const steps = [
    {
      n: "1",
      title: "Find your conference",
      body: "Browse or search our verified directory of conferences across AI, tech, longevity, and more. Every listing is checked against the source — no ghost events, no stale data.",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      ),
    },
    {
      n: "2",
      title: "Get your discount code",
      body: "Enter your email to unlock an exclusive discount code worth 5–10% off registration. Your code is sent straight to your inbox so you never lose it.",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
      ),
    },
    {
      n: "3",
      title: "Register and save",
      body: "Head to the conference's registration page and enter your code at checkout. The discount applies instantly — no hoops, no fine print.",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      ),
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}>
      {/* Nav */}
      <div style={{ borderBottom: "1px solid rgba(51,65,85,0.5)", background: "rgba(15,23,42,0.95)" }}>
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
            <a href="/how-it-works" style={{ fontSize: 13, color: "#f97316", fontWeight: 600, textDecoration: "none" }}>How It Works</a>
            <a href="/for-organizers" style={{ fontSize: 13, color: "#94a3b8", textDecoration: "none" }}>For Organizers</a>
            <a href="/" style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", color: "#f97316", padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>Browse Conferences</a>
          </div>
        </nav>
      </div>

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "72px 32px 56px", maxWidth: 700, margin: "0 auto" }}>
        <h1 style={{ fontSize: 44, fontWeight: 800, color: "#f1f5f9", lineHeight: 1.15, margin: "0 0 16px" }}>
          Save on every conference<br />
          <span style={{ color: "#f97316" }}>you attend</span>
        </h1>
        <p style={{ fontSize: 17, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>
          ConferenceCodes gives attendees access to exclusive discount codes for verified conferences. It takes 30 seconds.
        </p>
      </div>

      {/* Steps */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 32px 80px", display: "flex", flexDirection: "column", gap: 24 }}>
        {steps.map((step, i) => (
          <div key={i} style={{
            background: "rgba(15,23,42,0.8)", border: "1px solid rgba(51,65,85,0.5)",
            borderRadius: 20, padding: "36px 40px", display: "flex", gap: 32, alignItems: "flex-start",
          }}>
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {step.icon}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#f97316", letterSpacing: 1 }}>STEP {step.n}</div>
            </div>
            <div style={{ paddingTop: 4 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: "0 0 10px" }}>{step.title}</h2>
              <p style={{ fontSize: 16, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>{step.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ textAlign: "center", padding: "0 32px 96px" }}>
        <div style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.08), rgba(234,88,12,0.04))", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 24, padding: "48px 40px", maxWidth: 560, margin: "0 auto" }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9", margin: "0 0 12px" }}>Ready to save?</h2>
          <p style={{ fontSize: 15, color: "#94a3b8", margin: "0 0 28px", lineHeight: 1.6 }}>Browse our verified conference directory and get your first discount code in under a minute.</p>
          <a href="/" style={{
            display: "inline-block", padding: "14px 36px", borderRadius: 10,
            background: "linear-gradient(135deg, #f97316, #ea580c)", color: "#fff",
            fontSize: 16, fontWeight: 700, textDecoration: "none",
            boxShadow: "0 4px 20px rgba(249,115,22,0.3)",
          }}>Browse Conferences</a>
        </div>
      </div>
    </div>
  );
}
