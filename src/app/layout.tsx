import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
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
    default: "ConferenceCodes: Verified AI Conference Tickets & Exclusive Discount Codes",
    template: "%s | ConferenceCodes",
  },
  description:
    "Find verified AI and tech conference tickets with exclusive discount codes. Real pricing, early bird deadlines, and registration details, all in one place.",
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
        {/* Privacy-friendly analytics by Plausible */}
        <Script
          src="https://plausible.io/js/pa-ZlcwqmzWPS60uzIiiVKln.js"
          strategy="afterInteractive"
        />
        <Script id="plausible-init" strategy="afterInteractive">
          {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
  plausible.init()`}
        </Script>
        {children}
      </body>
    </html>
  );
}
