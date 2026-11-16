import Link from "next/link";
import { LibrarySearch } from "@/components/library-search";
import { ClubCardGrid, type ClubCard } from "@/components/club-card-grid";
import { getDatabase } from "@/lib/db";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ChartClubPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: raw } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const page =
    typeof raw === "string" && /^\d{1,6}$/.test(raw)
      ? Math.max(1, Number(raw))
      : 1;
  const viewer = await getViewer();
  const sql = getDatabase();
  let posts: ClubCard[];
  try {
    posts = sql
      ? ((await sql`
      select p.id, p.title, p.summary->'preview' as preview, c.handle,
        p.summary->'cover' as cover, p.summary->>'coverView' as cover_view,
        case when p.summary->>'kind' = 'yoke' then 1
          else (p.summary->>'width')::float / nullif((p.summary->>'height')::float, 0)
          * coalesce((p.editable_document->>'gaugeRows')::float / nullif((p.editable_document->>'gaugeStitches')::float, 0), 1)
        end as cover_ratio,
        exists (select 1 from knitplot_club_hearts where post_id = p.id and user_id = ${viewer?.id ?? null}) as hearted
      from knitplot_club_public_posts p join knitplot_club_creators c on c.user_id = p.creator_id
      where strpos(lower(p.title), lower(${query})) > 0 or strpos(c.handle, lower(${query})) > 0
        or strpos(lower(c.display_name), lower(${query})) > 0
      order by p.published_at desc, p.id desc limit 25 offset ${(page - 1) * 24}
    `) as ClubCard[])
      : [];
  } catch {
    return <p>Chart Club couldn’t load. Please try again later.</p>;
  }
  return (
    <>
      <header className="library-heading">
        <div>
          <h1>Chart Club</h1>
          <p>A little library of charts made by knitters.</p>
          {viewer && viewer.id === process.env.CHART_CLUB_MODERATOR_ID && (
            <Link href="/chart-club/moderation">Review reports</Link>
          )}
        </div>
      </header>
      <div className="library-toolbar">
        <LibrarySearch
          action="/chart-club"
          label="Search Chart Club"
          placeholder="Chart title or creator"
          query={query}
        />
      </div>
      {!posts.length ? (
        query || page > 1 ? (
          <p>No charts found on this page.</p>
        ) : (
          <p>
            No shared charts yet. Share one from{" "}
            <Link href="/my-charts">My charts</Link>.
          </p>
        )
      ) : (
        <ClubCardGrid posts={posts.slice(0, 24)} signedIn={Boolean(viewer)} />
      )}
      <nav className="club-creator-links" aria-label="Explore pages">
        {page > 1 && (
          <Link href={`?q=${encodeURIComponent(query)}&page=${page - 1}`}>
            Previous page
          </Link>
        )}
        {posts.length > 24 && (
          <Link href={`?q=${encodeURIComponent(query)}&page=${page + 1}`}>
            Next page
          </Link>
        )}
      </nav>
    </>
  );
}
