import Link from "next/link";
import { ClubChartPreview } from "./club-chart-preview";
import { ClubKnitCover } from "./club-knit-cover";
import type { ClubCoverSettings } from "@/lib/club-cover";

export type PublishedChart = {
  id: string;
  title: string;
  preview: string[][];
  cover?: ClubCoverSettings;
  cover_view?: string;
};

export function MyPublishedCharts({
  posts,
  page,
  pageSize,
}: {
  posts: PublishedChart[] | null;
  page: number;
  pageSize: number;
}) {
  return (
    <section aria-label="Published charts">
      <p className="library-message">
        Published charts are snapshots. Changes to your private charts never
        change these posts.
      </p>
      {!posts ? (
        <p role="alert">Published charts couldn’t load. Please try again.</p>
      ) : !posts.length ? (
        <div className="library-empty">
          <h2>
            {page === 1 ? "No published charts yet" : "No posts on this page"}
          </h2>
          <p>Share a chart from All charts to see it here.</p>
          <Link href="/my-charts" className="chart-club-link">
            Go to All charts
          </Link>
        </div>
      ) : (
        <div className="library-grid">
          {posts.slice(0, pageSize).map((post) => (
            <article className="library-card" key={post.id}>
              <Link href={`/chart-club/${post.id}`}>
                <ClubKnitCover
                  id={post.id}
                  cover={post.cover}
                  view={post.cover_view}
                >
                  <ClubChartPreview pixels={post.preview} title={post.title} />
                </ClubKnitCover>
              </Link>
              <div className="library-card-copy">
                <div className="library-card-title">
                  <h2>{post.title}</h2>
                </div>
                <div className="cloud-chart-actions club-published-actions">
                  <Link
                    className="library-share-link"
                    href={`/chart-club/${post.id}`}
                  >
                    View post
                  </Link>
                  <Link
                    className="library-share-link"
                    href={`/chart-club/manage/${post.id}`}
                  >
                    Manage post
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {(page > 1 || (posts?.length ?? 0) > pageSize) && (
        <nav className="club-creator-links" aria-label="Published chart pages">
          {page > 1 && (
            <Link
              className="chart-club-link"
              href={`?tab=published&page=${page - 1}`}
            >
              Previous page
            </Link>
          )}
          {(posts?.length ?? 0) > pageSize && (
            <Link
              className="chart-club-link"
              href={`?tab=published&page=${page + 1}`}
            >
              Next page
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
