import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { ClubPostActions } from "@/components/club-post-actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const viewer = await getViewer();
  const sql = getDatabase();
  if (!viewer || viewer.id !== process.env.CHART_CLUB_MODERATOR_ID || !sql)
    notFound();
  const { page: requested } = await searchParams;
  const page =
    typeof requested === "string" && /^\d{1,8}$/.test(requested)
      ? Math.max(1, Number(requested))
      : 1;
  const rows = await sql`
    select r.id, r.post_id, r.post_title, r.reason, p.id is not null as available
    from knitplot_club_reports r left join knitplot_club_public_posts p on p.id = r.post_id
    order by r.created_at desc, r.id desc
    limit ${PAGE_SIZE + 1} offset ${(page - 1) * PAGE_SIZE}
  `;
  const reports = rows.slice(0, PAGE_SIZE);
  const reasons: Record<string, string> = {
    spam: "Spam",
    permission: "Shared without permission",
    other: "Other issue",
  };
  return (
    <>
      <h1>Chart Club reports</h1>
      {!reports.length && <p>No reports on this page.</p>}
      {reports.map((report) => (
        <article className="account-hub-card" key={report.id}>
          <h2>{report.post_title}</h2>
          <p>{reasons[report.reason]}</p>
          {report.available ? (
            <>
              <Link href={`/chart-club/${report.post_id}`}>
                Open reported chart
              </Link>
              <ClubPostActions
                id={report.post_id}
                initialHearted={false}
                signedIn
                moderate
              />
            </>
          ) : (
            <p>This post is no longer public.</p>
          )}
        </article>
      ))}
      {(page > 1 || rows.length > PAGE_SIZE) && (
        <nav className="club-share-actions" aria-label="Report pages">
          {page > 1 && (
            <Link className="secondary-button" href={`?page=${page - 1}`}>
              Newer reports
            </Link>
          )}
          {rows.length > PAGE_SIZE && (
            <Link className="secondary-button" href={`?page=${page + 1}`}>
              Older reports
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
