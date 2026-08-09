import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-newsreader", display: "swap" });

export const metadata: Metadata = {
  title: "KnitPlot",
  description: "Create, preview, and share gauge-accurate knitting colourwork charts.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${plexSans.variable} ${plexMono.variable} ${newsreader.variable}`}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
