// Slug generation for conference detail URLs. Generated in the app on insert so
// the year is not doubled and long names are capped. The DB respects an explicit
// slug (it only auto-generates when slug is null), so providing one here wins.
// Existing slugs are never rewritten, so live URLs are preserved.

export function slugifyName(name: string): string {
  return (name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumerics to hyphen
    .replace(/-+/g, "-") // collapse repeated hyphens
    .replace(/^-+|-+$/g, ""); // trim
}

// Build a clean slug: slugified name plus start year, but only append the year
// when the name does not already contain it, and cap the length at a hyphen
// boundary so long names do not produce huge slugs.
export function makeSlug(name: string, startDate?: string | null, maxLen = 60): string {
  let base = slugifyName(name);
  const y = startDate ? new Date(startDate).getUTCFullYear() : NaN;
  const year = Number.isFinite(y) ? String(y) : "";

  const room = year ? maxLen - year.length - 1 : maxLen;
  if (base.length > room) {
    base = base.slice(0, room);
    const lastHyphen = base.lastIndexOf("-");
    if (lastHyphen > 10) base = base.slice(0, lastHyphen);
    base = base.replace(/-+$/g, "");
  }

  if (year && !base.split("-").includes(year)) {
    base = base ? `${base}-${year}` : year;
  }
  return base || "conference";
}
