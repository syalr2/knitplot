import Link from "next/link";
import { ClubHeart } from "@/components/club-heart";
import { ClubCardGrid, type ClubCard } from "@/components/club-card-grid";
import { getViewer } from "@/lib/auth";
import { accountsConfigured } from "@/lib/auth-config";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HeartedPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const viewer = await getViewer();
  const sql = getDatabase();
  const { page: raw } = await searchParams;
  const page =
    typeof raw === "string" && /^\d{1,6}$/.test(raw)
      ? Math.max(1, Number(raw))
      : 1;
  let posts: ClubCard[] | null = null;
  if (viewer && sql) {
    try {
      posts = (await sql`
        select p.id, p.title, c.handle, p.summary->'preview' as preview, true as hearted,
          p.summary->'cover' as cover, p.summary->>'coverView' as cover_view, p.summary->>'coverRatio' as cover_ratio
        from knitplot_club_hearts h join knitplot_club_public_posts p on p.id = h.post_id
        join knitplot_club_creators c on c.user_id = p.creator_id
        where h.user_id = ${viewer.id} order by h.created_at desc, h.post_id desc
        limit 25 offset ${(page - 1) * 24}
      `) as ClubCard[];
    } catch {
      /* Show a retry message below. */
    }
  }
  return (
    <>
      <header className="library-heading">
        <div>
          <h1 className="club-hearts-label" aria-label="My hearts">
            My <ClubHeart filled />s
          </h1>
          <p>Your private list of favourite charts.</p>
        </div>
      </header>
      {!viewer ? (
        <div className="library-empty">
          <h2>Keep your favourites together</h2>
          {accountsConfigured() ? (
            <Link href="/sign-in">Sign in to heart charts</Link>
          ) : (
            <p>Accounts aren’t configured here.</p>
          )}
        </div>
      ) : !posts ? (
        <p>Hearted charts couldn’t load. Please try again later.</p>
      ) : posts.length ? (
        <ClubCardGrid posts={posts.slice(0, 24)} signedIn />
      ) : (
        <p>
          No hearted charts on this page.{" "}
          <Link href="/chart-club">Explore charts</Link>
        </p>
      )}
      <nav className="club-creator-links" aria-label="Hearted pages">
        {page > 1 && <Link href={`?page=${page - 1}`}>Previous page</Link>}
        {posts && posts.length > 24 && (
          <Link href={`?page=${page + 1}`}>Next page</Link>
        )}
      </nav>
    </>
  );
}
