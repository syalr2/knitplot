import type { Metadata } from "next";
import { accountsConfigured } from "@/lib/auth-config";
import { ClerkProvider } from "@clerk/nextjs";
import { SiteAnalytics } from "@/components/site-analytics";
import { knitplotFonts } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "KnitPlot",
  description:
    "Create, preview, and share gauge-accurate knitting colourwork charts.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const content = (
    <html lang="en" className={knitplotFonts}>
      <body>
        {children}
        <SiteAnalytics />
      </body>
    </html>
  );
  return accountsConfigured() ? (
    <ClerkProvider>{content}</ClerkProvider>
  ) : (
    content
  );
}
