import { notFound } from "next/navigation";
import Link from "next/link";
import "@/app/yoke-designer/yoke.css";
import { getDatabase } from "@/lib/db";
import { isUuid } from "@/lib/http";
import { getViewer } from "@/lib/auth";
import { ClubPostActions } from "@/components/club-post-actions";
import { OpenClubCopy } from "@/components/open-club-copy";
import { readChartDocument } from "@/lib/chart-schema";
import { ClubChartViewer } from "@/components/club-chart-viewer";

export const dynamic = "force-dynamic";

export default async function PublicChartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sql = getDatabase();
  if (!sql || !isUuid(id)) notFound();
  const viewer = await getViewer();
  const [post] = await sql`
    select p.title, p.description, p.editable_document, c.handle,
      p.summary->>'coverView' as cover_view,
      p.creator_id = ${viewer?.id ?? null} as own,
      exists (select 1 from knitplot_club_hearts where post_id = p.id and user_id = ${viewer?.id ?? null}) as hearted
    from knitplot_club_public_posts p join knitplot_club_creators c on c.user_id = p.creator_id
    where p.id = ${id}::uuid
  `;
  if (!post) notFound();
  const chart = readChartDocument(post.editable_document);
  return (
    <>
      <header className="library-heading">
        <div>
          <h1>{post.title}</h1>
          <p>
            By{" "}
            <Link href={`/chart-club/creators/${post.handle}`}>
              @{post.handle}
            </Link>
          </p>
        </div>
      </header>
      {post.description && (
        <p className="club-description">{post.description}</p>
      )}
      <div className="club-creator-links">
        <OpenClubCopy id={id} />
        <a className="chart-club-link" href={`/api/chart-club/copy?id=${id}`}>
          Download editable copy
        </a>
      </div>
      <ClubChartViewer
        document={chart}
        coverView={post.cover_view}
        heart={
          <ClubPostActions
            id={id}
            initialHearted={post.hearted}
            signedIn={Boolean(viewer)}
          />
        }
      />
      {!post.own && (
        <ClubPostActions
          id={id}
          initialHearted={false}
          signedIn={Boolean(viewer)}
          report
        />
      )}
    </>
  );
}
