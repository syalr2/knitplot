import Link from "next/link";
import { ClubChartPreview } from "./club-chart-preview";
import { ClubPostActions } from "./club-post-actions";
import { ClubKnitCover } from "./club-knit-cover";
import type { ClubCoverSettings } from "@/lib/club-cover";

export type ClubCard = {
  id: string;
  title: string;
  handle: string;
  preview: string[][];
  hearted: boolean;
  cover_view?: string;
  cover_ratio?: number;
  cover?: ClubCoverSettings;
};

export function ClubCardGrid({
  posts,
  signedIn,
}: {
  posts: ClubCard[];
  signedIn: boolean;
}) {
  return (
    <div className="library-grid">
      {posts.map((post) => (
        <article
          className={`library-card club-gallery-card${Number(post.cover_ratio) * (post.cover?.kind === "chart" ? post.cover.across / post.cover.down : post.cover_view === "repeat" ? 2 : 1) >= 3 ? " club-gallery-wide" : ""}`}
          key={post.id}
        >
          <Link href={`/chart-club/${post.id}`}>
            <ClubKnitCover
              id={post.id}
              view={post.cover_view}
              cover={post.cover}
            >
              <ClubChartPreview pixels={post.preview} title={post.title} />
            </ClubKnitCover>
          </Link>
          <div className="library-card-copy">
            <h2>
              <Link href={`/chart-club/${post.id}`}>{post.title}</Link>
            </h2>
            <p>
              By{" "}
              <Link href={`/chart-club/creators/${post.handle}`}>
                @{post.handle}
              </Link>
            </p>
          </div>
          <ClubPostActions
            id={post.id}
            initialHearted={post.hearted}
            signedIn={signedIn}
          />
        </article>
      ))}
    </div>
  );
}
