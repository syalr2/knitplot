import { redirect } from "next/navigation";
import { MyChartsLibrary } from "@/components/my-charts-library";
import { getViewerWithEmail } from "@/lib/auth";
import { chartSummaryFromRow } from "@/lib/chart-summary";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MyChartsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const sort =
    params.sort === "name" || params.sort === "updated-asc"
      ? params.sort
      : "updated-desc";
  const page = Math.max(
    1,
    Math.min(100_000, Math.floor(Number(params.page) || 1)),
  );
  const pageSize = 24;
  const viewer = await getViewerWithEmail();
  if (!viewer) redirect("/sign-in");
  const sql = getDatabase();
  let charts: Array<Record<string, unknown>> = [];
  let error = false;
  let total = 0;
  let matching = 0;
  let pinnedIds: string[] = [];
  if (!sql) error = true;
  else {
    try {
      // Import legacy pins only into untouched rows. Concurrent explicit pin
      // updates set a non-NULL value and cannot be overwritten by this import.
      await sql`update knitplot_charts set pinned = (id::text = any(${viewer.pinnedChartIds}::text[])) where user_id = ${viewer.id} and pinned is null`;
      const counts =
        (await sql`select count(*)::int as total, count(*) filter (where strpos(lower(name), lower(${query})) > 0)::int as matching from knitplot_charts where user_id = ${viewer.id}`) as Array<{
          total: number;
          matching: number;
        }>;
      total = Number(counts[0]?.total ?? 0);
      matching = Number(counts[0]?.matching ?? 0);
      charts = (await sql`
        select id, name, updated_at, document, pinned from knitplot_charts
        where user_id = ${viewer.id} and strpos(lower(name), lower(${query})) > 0
        order by pinned desc,
          case when ${sort} = 'name' then lower(name) end asc,
          case when ${sort} = 'updated-asc' then updated_at end asc,
          case when ${sort} = 'updated-desc' then updated_at end desc, id asc
        limit ${pageSize} offset ${(page - 1) * pageSize}
      `) as Array<Record<string, unknown>>;
      pinnedIds = charts
        .filter((row) => row.pinned === true)
        .map((row) => String(row.id));
    } catch {
      error = true;
    }
  }

  return (
    <MyChartsLibrary
      key={`${query}-${sort}-${page}`}
      charts={charts.map(chartSummaryFromRow)}
      email={viewer.email}
      avatar={viewer.avatar}
      initialPinnedIds={pinnedIds}
      loadError={error}
      total={total}
      matching={matching}
      page={page}
      pageSize={pageSize}
      initialQuery={query}
      initialSort={sort}
    />
  );
}
