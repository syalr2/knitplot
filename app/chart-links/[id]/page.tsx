import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChartLinkManager } from "@/components/chart-link-manager";
import { getViewer } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { isUuid } from "@/lib/http";
import "@/app/chart-club/chart-club.css";

export const metadata: Metadata = {
  title: "Share a chart link · KnitPlot",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ChartLinkPage({
  params,
}: PageProps<"/chart-links/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  const sql = getDatabase();
  const chart = sql
    ? await sql`
    select c.name, c.version, jsonb_typeof(c.document->'yoke') = 'object' as has_yoke,
      l.token, coalesce(l.document->>'name', c.name) as link_title
    from knitplot_charts c
    left join knitplot_chart_links l on l.source_id = c.id
    where c.id = ${id}::uuid and c.user_id = ${viewer.id}
  `.then(
        (rows) => rows[0] ?? null,
        () => undefined,
      )
    : undefined;
  if (chart === null) notFound();
  return (
    <main className="library-page">
      <section className="library-shell">
        <header className="library-heading">
          <div>
            <h1>Share a link</h1>
            {chart && <p>{chart.name}</p>}
          </div>
          <Link className="chart-club-link" href="/my-charts">
            My Charts
          </Link>
        </header>
        {chart ? (
          <ChartLinkManager
            sourceId={id}
            version={chart.version}
            hasYoke={Boolean(chart.has_yoke)}
            initialToken={chart.token ?? null}
            linkTitle={chart.link_title}
          />
        ) : (
          <p role="status">
            Chart links aren’t available right now. Please try again.
          </p>
        )}
      </section>
    </main>
  );
}
