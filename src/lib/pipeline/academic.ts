// Non-blocking academic-conference signal detector. Runs on the scraped page /
// site text plus the extracted line items and records which signals fired. Two
// or more fired signals mark a draft ACADEMIC LIKELY (a triage aid, never a gate).

const DIMENSION_WORDS = ["student", "academic", "delegate/listener", "delegate / listener", "member / non-member", "member/non-member", "non-member"];
const REG_TYPE_WORDS = ["oral", "poster", "abstract", "presenter", "speaker"];
const SCHOLARLY = ["abstract submission", "call for papers", "committee", "proceedings", "scientific committee"];
const NTH_CONF = /\b\d+\s*(?:st|nd|rd|th)?\s+international conference on\b/i;

export function detectAcademicSignals(opts: {
  pageText: string;
  tierNames: string[];
  excludedNames: string[];
  conferenceName: string;
}): string[] {
  const text = (opts.pageText || "").toLowerCase();
  const names = (opts.tierNames || []).map((n) => (n || "").toLowerCase());
  const signals: string[] = [];

  const dim = [...new Set(DIMENSION_WORDS.filter((w) => names.some((n) => n.includes(w))))];
  if (dim.length) signals.push(`pricing dimension (${dim.join(", ")})`);

  const reg = REG_TYPE_WORDS.filter((w) => names.some((n) => new RegExp(`\\b${w}\\b`).test(n)));
  if (reg.length) signals.push(`registration type (${reg.join(", ")})`);

  const sch = SCHOLARLY.filter((w) => text.includes(w));
  if (sch.length) signals.push(`scholarly page text (${sch.join(", ")})`);

  if (NTH_CONF.test(opts.conferenceName || "") || NTH_CONF.test(text)) {
    signals.push("name pattern (Nth International Conference on ...)");
  }

  const bundled = (opts.excludedNames || []).some((n) => /accommodation|publication|page charge|page fee|hotel|night/i.test(n));
  if (bundled) signals.push("bundled accommodation/publication fees in the pricing table");

  return signals;
}

// True when the draft should be flagged (two or more independent signals).
export function isAcademicLikely(signals: string[]): boolean {
  return signals.length >= 2;
}
