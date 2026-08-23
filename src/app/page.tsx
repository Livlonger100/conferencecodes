import type { Metadata } from "next";
import HomeClient from "./HomeClient";

export const metadata: Metadata = {
  title: "AI Conference Discount Codes 2026: Verified Tickets & Promo Codes | ConferenceCodes",
  description:
    "Exclusive discount codes for NVIDIA GTC, Databricks Data+AI Summit, SuperAI, Google Cloud Next, and more verified AI and tech conferences in 2026. Verified early bird pricing and registration deadlines, all in one place.",
};

export default function HomePage() {
  return <HomeClient />;
}
