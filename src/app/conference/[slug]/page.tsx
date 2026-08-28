import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase";
import { transformConference, formatDateRange, ymd } from "@/lib/conference-utils";
import ConferenceDetailClient from "./ConferenceDetailClient";

const BASE_URL = "https://conferencecodes.com";

// Revalidate ISR every hour so pricing/details stay fresh
export const revalidate = 3600;

// Cached fetch — deduplicates between generateMetadata and the page render
const getConference = cache(async (slug: string) => {
  const { data, error } = await supabaseAdmin
    .from("conferences")
    .select("*, pricing_tiers(*)")
    .eq("slug", slug)
    .maybeSingle();
  if (error) console.error("getConference error:", error.message);
  return data ?? null;
});

// Pre-render all active conference pages at build time
export async function generateStaticParams() {
  const { data } = await supabaseAdmin
    .from("conferences")
    .select("slug")
    .in("status", ["active", "sold_out"]);
  return (data ?? []).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getConference(slug);
  if (!data) return { title: "Conference Not Found | ConferenceCodes", robots: { index: false, follow: false } };

  const conf = transformConference(data);

  // Only append the year when the name does not already contain it.
  const year = ymd(conf.start)?.y;
  const titleName = year && !conf.name.includes(String(year)) ? `${conf.name} ${year}` : conf.name;
  const title = `${titleName}: Tickets, Pricing & Discount Codes | ConferenceCodes`;

  // Fallback description so no detail page is left with an empty meta description.
  const rawDesc = (conf.description || "").trim();
  const location = [conf.city, conf.country].filter(Boolean).join(", ");
  const dateRange = conf.start ? formatDateRange(conf.start, conf.end) : "";
  const fallbackDesc = `Discount codes, pricing, and dates for ${conf.name}${location ? ` in ${location}` : ""}.${dateRange ? ` ${dateRange}.` : ""}`;
  const baseDesc = rawDesc || fallbackDesc;
  const description = baseDesc.length > 155 ? baseDesc.slice(0, 152) + "..." : baseDesc;

  const url = `${BASE_URL}/conference/${conf.slug}`;
  // Only live listings (active or sold out) should be indexable.
  const indexable = conf.status === "active" || conf.status === "sold_out";

  return {
    title,
    description,
    robots: { index: indexable, follow: true, googleBot: { index: indexable, follow: true } },
    openGraph: {
      title: `${conf.name}: Verified Pricing & Exclusive Discount Codes`,
      description,
      url,
      type: "website",
      siteName: "ConferenceCodes",
    },
    twitter: {
      card: "summary",
      title: `${conf.name}: Discount Codes & Pricing`,
      description,
    },
    alternates: { canonical: url },
  };
}

export default async function ConferencePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getConference(slug);
  if (!data) notFound();

  const conf = transformConference(data);

  // JSON-LD Event schema for Google rich results
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: conf.name,
    description: conf.description,
    startDate: conf.start,
    endDate: conf.end,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode:
      conf.format === "Virtual"
        ? "https://schema.org/OnlineEventAttendanceMode"
        : conf.format === "Hybrid"
        ? "https://schema.org/MixedEventAttendanceMode"
        : "https://schema.org/OfflineEventAttendanceMode",
    location:
      conf.format === "Virtual"
        ? { "@type": "VirtualLocation", url: conf.source_url || BASE_URL }
        : {
            "@type": "Place",
            name: conf.venue || `${conf.city}, ${conf.country}`,
            address: {
              "@type": "PostalAddress",
              addressLocality: conf.city,
              addressCountry: conf.country,
            },
          },
    organizer: {
      "@type": "Organization",
      name: conf.organizer,
    },
    // Structured data keeps the numeric price and currency (including a real 0
    // for free tiers). A free tier is emitted as price 0, never the word "Free".
    // An unknown/absent price (no 0 tier and no positive price) is omitted.
    ...((conf.price > 0 || conf.pricingTiers?.some((t: any) => t.price === 0)) && {
      offers: {
        "@type": "Offer",
        price: conf.earlyBird ?? conf.price ?? 0,
        priceCurrency:
          conf.pricingTiers?.find((t: any) => t.price != null)?.currency ||
          conf.pricingTiers?.[0]?.currency ||
          "USD",
        url: `${BASE_URL}/conference/${conf.slug}`,
        availability: "https://schema.org/InStock",
      },
    }),
    ...(conf.attendees && { maximumAttendeeCapacity: conf.attendees }),
    url: `${BASE_URL}/conference/${conf.slug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ConferenceDetailClient conf={conf} />
    </>
  );
}
