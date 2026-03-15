import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase";
import { transformConference } from "@/lib/conference-utils";
import ConferenceDetailClient from "./ConferenceDetailClient";

const BASE_URL = "https://conferencecodes.com";

// Revalidate ISR every hour so pricing/details stay fresh
export const revalidate = 3600;

// Cached fetch — deduplicates between generateMetadata and the page render
const getConference = cache(async (slug: string) => {
  const { data, error } = await supabaseAdmin
    .from("conferences")
    .select("*, pricing_tiers(*), hotels(*)")
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
  params: { slug: string };
}): Promise<Metadata> {
  const data = await getConference(params.slug);
  if (!data) return { title: "Conference Not Found | ConferenceCodes" };

  const conf = transformConference(data);
  const title = `${conf.name} ${new Date(conf.start).getFullYear()} — Tickets, Pricing & Discount Codes | ConferenceCodes`;
  const description =
    conf.description.length > 155
      ? conf.description.slice(0, 152) + "..."
      : conf.description;
  const url = `${BASE_URL}/conference/${conf.slug}`;

  return {
    title,
    description,
    openGraph: {
      title: `${conf.name} — Verified Pricing & Exclusive Discount Codes`,
      description,
      url,
      type: "website",
      siteName: "ConferenceCodes",
    },
    twitter: {
      card: "summary",
      title: `${conf.name} — Discount Codes & Pricing`,
      description,
    },
    alternates: { canonical: url },
  };
}

export default async function ConferencePage({
  params,
}: {
  params: { slug: string };
}) {
  const data = await getConference(params.slug);
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
    ...(conf.price > 0 && {
      offers: {
        "@type": "Offer",
        price: conf.earlyBird ?? conf.price,
        priceCurrency: "USD",
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
