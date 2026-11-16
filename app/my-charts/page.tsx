import Link from "next/link";
import { ClubNavigation } from "@/components/club-navigation";
import { accountsConfigured } from "@/lib/auth-config";
import { MyChartsLibrary } from "@/components/my-charts-library";
import { getViewerWithEmail } from "@/lib/auth";
import { chartSummaryFromRow } from "@/lib/chart-summary";
import { getDatabase } from "@/lib/db";
import {
  MyPublishedCharts,
  type PublishedChart,
} from "@/components/my-published-charts";
import "@/app/chart-club/chart-club.css";

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
  if (!viewer)
    return (
      <main className="library-page">
        <nav className="library-nav">
          <Link className="library-brand" href="/">
            <span aria-hidden="true" />
            KnitPlot
          </Link>
          <ClubNavigation active="mine" />
        </nav>
        <section className="library-shell">
          <header className="library-heading">
            <h1>My Charts</h1>
          </header>
          <div className="library-empty">
            <h2>Keep your charts together</h2>
            <p>
              Sign in or create an account to save charts across devices. You
              can still make charts and explore Chart Club without an account.
            </p>
            {accountsConfigured() ? (
              <div className="library-auth-actions">
                <Link
                  className="chart-club-link primary-button"
                  href="/sign-in"
                >
                  Sign in
                </Link>
                <Link className="text-button library-auth-link" href="/sign-up">
                  Create an account
                </Link>
              </div>
            ) : (
              <p>Accounts aren’t configured on this instance.</p>
            )}
          </div>
        </section>
      </main>
    );
  const sql = getDatabase();
  if (params.tab === "published") {
    let posts: PublishedChart[] | null = null;
    if (sql) {
      try {
        posts = (await sql`
          select id, title, summary->'preview' as preview,
            summary->'cover' as cover, summary->>'coverView' as cover_view
          from knitplot_club_public_posts
          where creator_id = ${viewer.id}
          order by published_at desc, id desc
          limit ${pageSize + 1} offset ${(page - 1) * pageSize}
        `) as PublishedChart[];
      } catch {
        // Keep My Charts usable if the community tables are unavailable.
      }
    }
    return (
      <MyChartsLibrary
        key="published"
        charts={[]}
        email={viewer.email}
        avatar={viewer.avatar}
        initialPinnedIds={[]}
        loadError={false}
        total={0}
        matching={0}
        page={page}
        pageSize={pageSize}
        initialQuery=""
        initialSort="updated-desc"
        publishedContent={
          <MyPublishedCharts posts={posts} page={page} pageSize={pageSize} />
        }
      />
    );
  }
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

  const publicPosts =
    sql && charts.length
      ? await sql`select id, source_id from knitplot_club_public_posts
        where creator_id = ${viewer.id} and source_id::text = any(${charts.map(({ id }) => String(id))}::text[])`.catch(
          () => [],
        )
      : [];
  const publicBySource = new Map(
    publicPosts.map((post) => [post.source_id, post.id]),
  );
  return (
    <MyChartsLibrary
      key={`${query}-${sort}-${page}`}
      charts={charts.map((row) => {
        const chart = chartSummaryFromRow(row);
        return { ...chart, publicPostId: publicBySource.get(chart.id) };
      })}
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
