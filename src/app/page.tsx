import type { Metadata } from "next";
import HomeClient from "./HomeClient";

export const metadata: Metadata = {
  title: "AI Conferences Directory 2026-2027: Browse, Compare & Save | ConferenceCodes",
  description:
    "A comprehensive directory of verified AI conferences worldwide. Browse and compare by topic, date, location, and price, with exclusive discount codes when available. New conferences added weekly.",
};

export default function HomePage() {
  return <HomeClient />;
}
