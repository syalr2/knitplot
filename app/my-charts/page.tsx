import Link from "next/link";
import { redirect } from "next/navigation";
import { CloudChartActions } from "@/components/cloud-chart-actions";
import { getViewer } from "@/lib/auth";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MyChartsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  const sql = getDatabase();
  let charts: Array<Record<string, unknown>> = [];
  let error = false;
  if (!sql) error = true;
  else {
    try {
      charts = await sql`select id, name, updated_at, document from knitplot_charts where user_id = ${viewer.id} order by updated_at desc limit 100` as Array<Record<string, unknown>>;
    } catch {
      error = true;
    }
  }

  return (
    <main className="account-page">
      <section className="account-card account-wide charts-library">
        <div className="account-nav"><Link className="back-link" href="/">← Back to chart maker</Link><Link href="/account">Account</Link></div>
        <div><p className="eyebrow">Cloud library</p><h1>My Charts</h1><p className="account-intro">Charts you save here are private to your account and available across your computers.</p></div>
        {error ? <p className="account-notice error">KnitPlot could not load your charts.</p> : null}
        {!error && !charts.length ? <div className="empty-library"><h2>No cloud charts yet</h2><p>Return to the chart maker and choose <strong>Save to My Charts</strong>. Your browser charts stay where they are until you decide to save them.</p><Link className="primary-link" href="/">Create a chart</Link></div> : null}
        <div className="cloud-chart-list">
          {charts.map((chart) => {
            const doc = chart.document as { width?: number; height?: number } | null;
            const id = String(chart.id);
            const name = String(chart.name || "Untitled chart");
            return <article className="cloud-chart-card" key={id}><div><h2>{name}</h2><p>{doc?.width ?? "?"} stitches × {doc?.height ?? "?"} rows</p><small>Updated {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(chart.updated_at)))}</small></div><CloudChartActions id={id} name={name} /></article>;
          })}
        </div>
      </section>
    </main>
  );
}
