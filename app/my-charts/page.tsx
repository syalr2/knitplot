import { redirect } from "next/navigation";
import { MyChartsLibrary } from "@/components/my-charts-library";
import { getViewerWithEmail } from "@/lib/auth";
import { chartSummaryFromRow } from "@/lib/chart-summary";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MyChartsPage() {
  const viewer = await getViewerWithEmail();
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

  return <MyChartsLibrary charts={charts.map(chartSummaryFromRow)} email={viewer.email} avatar={viewer.avatar} initialPinnedIds={viewer.pinnedChartIds} loadError={error} />;
}
