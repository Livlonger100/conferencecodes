import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabase";

const BASE_URL = "https://conferencecodes.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data } = await supabaseAdmin
    .from("conferences")
    .select("slug, updated_at")
    .in("status", ["active", "sold_out"]);

  const conferencePaths: MetadataRoute.Sitemap = (data ?? []).map((c) => ({
    url: `${BASE_URL}/conference/${c.slug}`,
    lastModified: new Date(c.updated_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/how-it-works`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/for-organizers`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    ...conferencePaths,
  ];
}
