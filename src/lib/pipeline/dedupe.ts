// Idempotency helpers. The dedupe key is a normalized fingerprint of
// name + date + city + url-domain so re-running discovery never creates a
// duplicate candidate. A unique constraint on discovery_queue.dedupe_key
// enforces this at the database level too.

function normalizeText(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Reduce a free-form date ("March 2026", "2026-03-12", "12-14 Mar 2026") to a
// coarse YYYY-MM bucket so small date phrasing differences do not defeat dedupe.
function normalizeDatePart(date: string | null | undefined): string {
  if (!date) return "nodate";
  const iso = date.match(/(\d{4})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}`;
  const year = date.match(/(20\d{2})/);
  const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const lower = date.toLowerCase();
  const mi = months.findIndex((m) => lower.includes(m));
  if (year && mi >= 0) return `${year[1]}-${String(mi + 1).padStart(2, "0")}`;
  if (year) return `${year[1]}-00`;
  return "nodate";
}

function domainOf(url: string | null | undefined): string {
  if (!url) return "nourl";
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.host.replace(/^www\./, "").toLowerCase();
  } catch {
    return "nourl";
  }
}

export function makeDedupeKey(input: {
  name?: string | null;
  date?: string | null;
  city?: string | null;
  url?: string | null;
}): string {
  const parts = [
    normalizeText(input.name).replace(/\s+/g, "-"),
    normalizeDatePart(input.date),
    normalizeText(input.city).replace(/\s+/g, "-") || "nocity",
    domainOf(input.url),
  ];
  return parts.join("|");
}
