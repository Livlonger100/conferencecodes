import type { Metadata } from "next";
import HomeClient from "./HomeClient";

export const metadata: Metadata = {
  title: "AI Conference Discount Codes 2026: Verified Tickets & Promo Codes | ConferenceCodes",
  description:
    "A comprehensive directory of verified AI conferences worldwide. Browse and compare by topic, date, location, and price, with exclusive discount codes when available. New conferences added weekly.",
};

export default function HomePage() {
  return <HomeClient />;
}
