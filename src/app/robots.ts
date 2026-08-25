import type { MetadataRoute } from "next";

const BASE_URL = "https://conferencecodes.com";

// Served at /robots.txt. Allows crawling of the public site, keeps the admin
// tooling and API routes out of the index, and points crawlers at the sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
