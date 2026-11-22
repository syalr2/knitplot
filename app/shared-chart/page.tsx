import type { Metadata } from "next";
import Link from "next/link";
import { SharedChart } from "@/components/shared-chart";
import "@/app/chart-club/chart-club.css";
import "@/app/yoke-designer/yoke.css";

export const metadata: Metadata = {
  title: "Shared chart · KnitPlot",
  description: "Open a knitting chart someone shared with you.",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function SharedChartPage() {
  return (
    <main className="library-page">
      <section className="library-shell">
        <nav className="library-nav">
          <Link className="library-brand" href="/">
            <span aria-hidden="true" />
            KnitPlot
          </Link>
        </nav>
        <SharedChart />
      </section>
    </main>
  );
}
