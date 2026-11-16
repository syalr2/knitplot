import Link from "next/link";
import { ClubNavigation } from "@/components/club-navigation";
import "./chart-club.css";

export default function ChartClubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="library-page">
      <nav className="library-nav">
        <Link className="library-brand" href="/">
          <span aria-hidden="true" />
          KnitPlot
        </Link>
        <ClubNavigation active="explore" />
      </nav>
      <section className="library-shell">{children}</section>
    </main>
  );
}
