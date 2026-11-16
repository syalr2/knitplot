import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClubShareForm } from "@/components/club-share-form";
import { getViewer } from "@/lib/auth";
import { readChartDocument } from "@/lib/chart-schema";
import { readClubCover } from "@/lib/club-cover";
import { getDatabase } from "@/lib/db";
import { isRecord, isUuid } from "@/lib/http";

export const dynamic = "force-dynamic";

export default async function ShareChartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  const sql = getDatabase();
  if (!sql) return <p>Chart Club is not configured.</p>;
  const loadChart = () => sql`
    select c.id, c.name, c.document, c.version, creator.handle,
      p.id as post_id, p.removed_at
    from knitplot_charts c
    left join knitplot_club_creators creator on creator.user_id = c.user_id
    left join knitplot_club_posts p on p.creator_id = c.user_id and p.source_id = c.id
    where c.id = ${id}::uuid and c.user_id = ${viewer.id}
  `;
  let chart;
  try {
    [chart] = await loadChart();
  } catch (error) {
    const missingTables = isRecord(error) && error.code === "42P01";
    return (
      <div className="library-empty">
        <h2>Chart sharing isn’t available right now</h2>
        <p>
          {missingTables
            ? "Chart Club’s database setup hasn’t been applied here yet."
            : "KnitPlot couldn’t load the sharing form. Please try again."}
        </p>
        <Link href="/my-charts">Back to My Charts</Link>
      </div>
    );
  }
  if (!chart) notFound();
  if (chart.post_id && !chart.removed_at)
    redirect(`/chart-club/manage/${chart.post_id}`);
  if (chart.removed_at)
    return (
      <p>
        This chart’s public post was removed and can’t be republished from this
        chart.
      </p>
    );
  const document = readChartDocument(chart.document);
  return (
    <>
      <header className="library-heading">
        <div>
          <h1>Share to Chart Club</h1>
          <p>
            This makes a public snapshot of your latest saved chart. Future
            edits to your private chart won’t change the public snapshot.
          </p>
        </div>
      </header>
      {!chart.handle ? (
        <div className="library-empty">
          <h2>Choose a username before sharing</h2>
          <p>You only need to do this once, in Account Settings.</p>
          <Link className="chart-club-link" href="/account">
            Go to Account Settings
          </Link>
        </div>
      ) : (
        <ClubShareForm
          sourceId={id}
          sourceVersion={chart.version}
          title={chart.name}
          description=""
          document={document}
          initialCover={readClubCover(document)}
        />
      )}
    </>
  );
}
