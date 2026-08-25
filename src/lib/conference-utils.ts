// @ts-nocheck

export function transformConference(c: any) {
  const tiers = (c.pricing_tiers || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
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
    hasCode: !!(c.discount_code && String(c.discount_code).trim()) && (c.discount_max_uses == null || (c.discount_uses || 0) < c.discount_max_uses),
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
      currency: t.currency || "USD",
      priceAfterDeadline: t.price_after_deadline != null ? parseFloat(t.price_after_deadline) : null,
      deadline: t.deadline || null,
      isTimeWindow: !!t.deadline,
      sold_out: t.sold_out || false,
      requires_approval: t.requires_approval || false,
      isEarlyBird: t.is_early_bird || false,
    })),
  };
}

export function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateRange(startStr: string, endStr: string): string {
  const s = new Date(startStr), e = new Date(endStr);
  const mo = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  const yr = (d: Date) => d.getFullYear();
  const day = (d: Date) => d.getDate();
  if (mo(s) === mo(e) && yr(s) === yr(e)) return `${mo(s)} ${day(s)}-${day(e)}, ${yr(s)}`;
  return `${mo(s)} ${day(s)} - ${mo(e)} ${day(e)}, ${yr(e)}`;
}

export function formatPrice(p: number | null): string {
  if (p === 0) return "Free";
  return p != null ? "$" + p.toLocaleString() : "TBA";
}

export type ConferenceStatus = {
  status: "live" | "today" | "upcoming" | "ended";
  label: string;
  color: string;
  pulse: boolean;
};

export function getConferenceStatus(start: string, end: string | null): ConferenceStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(start);
  startDate.setHours(0, 0, 0, 0);
  // treat null end as same-day event
  const endDate = end ? new Date(end) : new Date(start);
  endDate.setHours(0, 0, 0, 0);

  if (today > endDate) {
    return { status: "ended", label: "Ended", color: "#9ca3af", pulse: false };
  }
  if (today.getTime() === startDate.getTime()) {
    return { status: "today", label: "Starts today", color: "#22c55e", pulse: false };
  }
  if (today > startDate && today <= endDate) {
    return { status: "live", label: "Happening now", color: "#22c55e", pulse: true };
  }
  // upcoming
  const days = Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const label = days === 1 ? "Tomorrow" : `${days} days away`;
  return { status: "upcoming", label, color: "#f97316", pulse: false };
}

export function sortConferences(conferences: any[]): any[] {
  const priority = (c: any) => {
    const s = getConferenceStatus(c.start, c.end || null);
    if (s.status === "live" || s.status === "today") return 0;
    if (s.status === "upcoming") return 1;
    return 2; // ended
  };
  return [...conferences].sort((a, b) => {
    const pa = priority(a), pb = priority(b);
    if (pa !== pb) return pa - pb;
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });
}

export function getCurrentPricing(conf: any) {
  const now = new Date();
  const tiers = conf.pricingTiers || [];
  const baseTiers = tiers.filter((t: any) => t.isTimeWindow && !t.requires_approval && !t.sold_out);
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
  const sorted = [...baseTiers].sort((a: any, b: any) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });
  let currentIdx = sorted.findIndex((t: any) => t.deadline && new Date(t.deadline) >= now);
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
    specialTiers: tiers.filter((t: any) => !t.isTimeWindow || t.requires_approval),
  };
}
