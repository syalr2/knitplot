import type { getDatabase } from "./db";

export async function recordClubReport(
  sql: NonNullable<ReturnType<typeof getDatabase>>,
  reporterId: string,
  postId: string,
  reason: "spam" | "permission" | "other",
) {
  // A duplicate is a successful retry only while the post is still reportable.
  const [result] = await sql`
    with reportable as (
      select id, title from knitplot_club_public_posts
      where id = ${postId}::uuid and creator_id <> ${reporterId}
    ), recorded as (
      insert into knitplot_club_reports (reporter_id, post_id, post_title, reason)
      select ${reporterId}, id, title, ${reason} from reportable
      on conflict (reporter_id, post_id) do nothing
    )
    select exists (select 1 from reportable) as available
  `;
  return result.available === true;
}
