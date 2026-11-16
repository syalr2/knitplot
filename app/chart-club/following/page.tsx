import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { accountsConfigured } from "@/lib/auth-config";
import { getDatabase } from "@/lib/db";
import { ClubCardGrid, type ClubCard } from "@/components/club-card-grid";
import { LibrarySearch } from "@/components/library-search";

export const dynamic = "force-dynamic";

export default async function FollowingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: rawPage } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const page =
    typeof rawPage === "string" && /^\d{1,6}$/.test(rawPage)
      ? Math.max(1, Number(rawPage))
      : 1;
  const pageSize = 24;
  const viewer = await getViewer();
  const sql = getDatabase();
  async function loadPosts() {
    if (!viewer || !sql) return null;
    try {
      return (await sql`
        select p.id, p.title, p.summary->'preview' as preview, c.handle,
          p.summary->'cover' as cover, p.summary->>'coverView' as cover_view, p.summary->>'coverRatio' as cover_ratio,
          exists (select 1 from knitplot_club_hearts where post_id = p.id and user_id = ${viewer.id}) as hearted
        from knitplot_club_follows f
        join knitplot_club_public_posts p on p.creator_id = f.creator_id
        join knitplot_club_creators c on c.user_id = f.creator_id
        where f.follower_id = ${viewer.id}
          and (strpos(lower(p.title), lower(${query})) > 0
            or strpos(c.handle, lower(${query})) > 0
            or strpos(lower(c.display_name), lower(${query})) > 0)
        order by p.published_at desc, p.id desc
        limit ${pageSize + 1} offset ${(page - 1) * pageSize}
      `) as ClubCard[];
    } catch {
      return null;
    }
  }
  const posts = await loadPosts();
  return (
    <>
      <header className="library-heading">
        <div>
          <h1>Following</h1>
          <p>The latest charts from creators you follow.</p>
        </div>
      </header>
      {viewer && posts && (
        <div className="library-toolbar">
          <LibrarySearch
            action="/chart-club/following"
            label="Search Following"
            placeholder="Chart title or creator"
            query={query}
          />
        </div>
      )}
      {!viewer ? (
        <div className="library-empty">
          <h2>Keep up with your favourite creators</h2>
          {accountsConfigured() ? (
            <>
              <p>
                Sign in to follow creators and see their charts here. You don’t
                need a public profile.
              </p>
              <Link className="chart-club-link primary-button" href="/sign-in">
                Sign in
              </Link>
            </>
          ) : (
            <p>Accounts aren’t configured on this instance.</p>
          )}
        </div>
      ) : !posts ? (
        <p>Following couldn’t load. Please try again later.</p>
      ) : posts.length === 0 && (query || page > 1) ? (
        <p>No matching charts on this page.</p>
      ) : posts.length === 0 ? (
        <div className="library-empty">
          <h2>No charts here yet</h2>
          <p>
            Find a chart you like, then follow its creator to see their charts
            here.
          </p>
          <Link href="/chart-club">Explore charts</Link>
        </div>
      ) : (
        <ClubCardGrid posts={posts.slice(0, pageSize)} signedIn />
      )}
      {posts && (page > 1 || posts.length > pageSize) && (
        <nav className="club-creator-links" aria-label="Following pages">
          {page > 1 && (
            <Link href={`?q=${encodeURIComponent(query)}&page=${page - 1}`}>
              Previous page
            </Link>
          )}
          {posts.length > pageSize && (
            <Link href={`?q=${encodeURIComponent(query)}&page=${page + 1}`}>
              Next page
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
