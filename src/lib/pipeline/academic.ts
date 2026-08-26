// Academic / predatory-network conference detector. Runs on the scraped page +
// site text plus the extracted line items and records which signals fired.
//
// Thresholds (on the EFFECTIVE count, after the commercial-capacity reduction):
//   >= 3  -> auto-reject the candidate (still restorable in admin)
//   == 2  -> keep as a draft, badged ACADEMIC LIKELY
//   <= 1  -> normal draft, no badge
// These conferences do not issue discount codes, so they generate no revenue and
// (predatory networks) are a brand risk. A page that sells exhibitor / sponsor /
// booth space has seats to fill and may issue codes, so its effective count is
// reduced by one, letting it reach the queue with a badge instead of auto-reject.

// -- academic signal vocab ----------------------------------------------------
const DIMENSION_WORDS = ["student", "academic", "delegate/listener", "delegate / listener", "member / non-member", "member/non-member", "non-member"];
const REG_TYPE_WORDS = ["oral", "poster", "presenter", "speaker"]; // "abstract" is the predatory CTA signal below
const SCHOLARLY = ["call for papers", "committee", "proceedings", "scientific committee"];
const NTH_CONF = /\b\d+\s*(?:st|nd|rd|th)?\s+international conference on\b/i;

// -- predatory-network signal vocab -------------------------------------------
const PREDATORY_NAME = /\b\d+\s*(?:st|nd|rd|th)?\s+edition of\b|\bmeet on\b|\bworld congress on\b|\bglobal summit on\b|\binternational meet\b/i;
const ABSTRACT_CTA = /abstract submission|submit (?:your )?abstract|call for abstracts?|abstracts? (?:are )?invited/i;
const COMMERCIAL = /\bexhibitor\b|\bexhibition\b|\bexhibit\b|\bsponsor\b|\bsponsorship\b|\bbooth\b|floor space|trade show|expo hall/i;
const EMAIL_RE = /[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/gi;

function registrableDomain(host: string): string {
  const p = (host || "").toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  return p.length >= 2 ? p.slice(-2).join(".") : p.join(".");
}

export interface AcademicAssessment {
  signals: string[];              // fired signal labels
  hasCommercialCapacity: boolean; // exhibitor / sponsor / booth present
  effectiveCount: number;         // signals.length minus 1 when commercial capacity, floored at 0
  badge: boolean;                 // effectiveCount >= 2
  autoReject: boolean;            // effectiveCount >= 3
}

export function assessAcademic(opts: {
  pageText: string;
  tierNames: string[];
  excludedNames: string[];
  conferenceName: string;
  siteDomain?: string;            // host of the conference/official URL
  sameDomainOthers?: number;      // other conferences already on the same domain
  sameOrganizerOthers?: number;   // other conferences by the same organizer
}): AcademicAssessment {
  const raw = opts.pageText || "";
  const text = raw.toLowerCase();
  const names = (opts.tierNames || []).map((n) => (n || "").toLowerCase());
  const name = opts.conferenceName || "";
  const signals: string[] = [];

  // -- academic --
  const dim = [...new Set(DIMENSION_WORDS.filter((w) => names.some((n) => n.includes(w))))];
  if (dim.length) signals.push(`pricing dimension (${dim.join(", ")})`);
  const reg = REG_TYPE_WORDS.filter((w) => names.some((n) => new RegExp(`\\b${w}\\b`).test(n)));
  if (reg.length) signals.push(`registration type (${reg.join(", ")})`);
  const sch = SCHOLARLY.filter((w) => text.includes(w));
  if (sch.length) signals.push(`scholarly text (${sch.join(", ")})`);
  if (NTH_CONF.test(name) || NTH_CONF.test(text)) signals.push("name: Nth International Conference on ...");
  if ((opts.excludedNames || []).some((n) => /accommodation|publication|page charge|page fee|hotel|night/i.test(n))) {
    signals.push("bundled accommodation/publication fees");
  }

  // -- predatory network --
  const pm = name.match(PREDATORY_NAME) || text.match(PREDATORY_NAME);
  if (pm) signals.push(`predatory name pattern (${pm[0].trim()})`);

  const siteReg = opts.siteDomain ? registrableDomain(opts.siteDomain) : "";
  if (siteReg) {
    const emailDomains = [...new Set([...raw.matchAll(EMAIL_RE)].map((m) => registrableDomain(m[1])))];
    const foreign = emailDomains.filter((d) => d && d !== siteReg);
    if (foreign.length) signals.push(`contact email off-domain (${foreign.slice(0, 2).join(", ")})`);
  }

  if (ABSTRACT_CTA.test(text)) signals.push("abstract call-to-action");

  const sd = opts.sameDomainOthers || 0, so = opts.sameOrganizerOthers || 0;
  if (sd >= 1 || so >= 1) signals.push(`multiple conferences same domain/organizer (${sd} domain, ${so} organizer)`);

  const hasCommercialCapacity = COMMERCIAL.test(text) || names.some((n) => COMMERCIAL.test(n));
  const effectiveCount = Math.max(0, signals.length - (hasCommercialCapacity ? 1 : 0));
  return { signals, hasCommercialCapacity, effectiveCount, badge: effectiveCount >= 2, autoReject: effectiveCount >= 3 };
}
