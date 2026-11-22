import "server-only";

import { cache } from "react";
import { getDatabase } from "./db";
import { isUuid } from "./http";

export const getPublicClubPost = cache(async (id: string) => {
  const sql = getDatabase();
  if (!sql || !isUuid(id)) return null;
  const [post] = await sql`
    select p.title, p.description, p.editable_document, c.handle,
      p.summary->'cover' as cover, p.summary->>'coverView' as cover_view
    from knitplot_club_public_posts p
    join knitplot_club_creators c on c.user_id = p.creator_id
    where p.id = ${id}::uuid
  `;
  if (!post) return null;
  return {
    title: post.title as string,
    description: post.description as string,
    handle: post.handle as string,
    document: post.editable_document as unknown,
    cover: post.cover as unknown,
    legacyView: post.cover_view as string | undefined,
  };
});

export async function getClubPostActivity(id: string, viewerId: string) {
  const sql = getDatabase();
  if (!sql || !isUuid(id)) return null;
  const [activity] = await sql`
    select p.creator_id = ${viewerId} as own,
      exists (select 1 from knitplot_club_hearts where post_id = p.id and user_id = ${viewerId}) as hearted
    from knitplot_club_public_posts p where p.id = ${id}::uuid
  `;
  return activity as { own: boolean; hearted: boolean } | undefined;
}
