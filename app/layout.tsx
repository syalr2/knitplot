import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KnitPlot",
  description: "Create, preview, and share gauge-accurate knitting colourwork charts.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
