import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ConferenceCodes — Verified Conference Tickets & Exclusive Discount Codes",
    template: "%s | ConferenceCodes",
  },
  description:
    "Find verified AI, tech, and longevity conference tickets with exclusive discount codes. Real pricing, early bird deadlines, and negotiated hotel rates — all in one place.",
  metadataBase: new URL("https://conferencecodes.com"),
  openGraph: {
    siteName: "ConferenceCodes",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    site: "@conferencecodes",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
