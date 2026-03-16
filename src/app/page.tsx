import type { Metadata } from "next";
import HomeClient from "./HomeClient";

export const metadata: Metadata = {
  title: "Conference Discount Codes 2026 — AI, Tech & Longevity Events | ConferenceCodes",
  description:
    "Exclusive discount codes for NVIDIA GTC, Databricks Data+AI Summit, SuperAI, Google Cloud Next, Longevity Summit Dublin, and 11 more verified conferences in 2026. Verified early bird pricing, deadlines, and negotiated hotel rates.",
};

export default function HomePage() {
  return <HomeClient />;
}
