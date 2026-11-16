import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { errorResponse, HttpError, readJsonObject } from "@/lib/http";
import { hasValidRequestOrigin } from "@/lib/security/origin";

const followRequest = z.object({
  handle: z.string().regex(/^[a-z0-9_]{3,24}$/),
  following: z.boolean(),
});

export async function PUT(request: Request) {
  if (!hasValidRequestOrigin(request))
    return errorResponse("Invalid request origin.", 403);
  const viewer = await getViewer();
  if (!viewer) return errorResponse("Sign in to follow creators.", 401);
  const sql = getDatabase();
  if (!sql) return errorResponse("Chart Club is not configured.", 503);
  try {
    const input = followRequest.safeParse(
      await readJsonObject(request, {
        bytes: 1024,
        message: "The follow request is too large.",
      }),
    );
    if (!input.success) return errorResponse("Invalid follow request.", 400);
    const { handle, following } = input.data;
    if (following) {
      const [creator] = await sql`
        with target as (
          select user_id from knitplot_club_creators
          where handle = ${handle} and user_id <> ${viewer.id}
          and exists (select 1 from knitplot_club_public_posts where creator_id = knitplot_club_creators.user_id)
        ), added as (
          insert into knitplot_club_follows (follower_id, creator_id)
          select ${viewer.id}, user_id from target on conflict do nothing
        )
        select true as available from target
      `;
      if (!creator)
        return errorResponse("This creator isn’t available to follow.", 404);
    } else {
      await sql`
        delete from knitplot_club_follows f using knitplot_club_creators c
        where f.follower_id = ${viewer.id} and f.creator_id = c.user_id and c.handle = ${handle}
      `;
    }
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof HttpError)
      return errorResponse(error.message, error.status);
    return errorResponse(
      "KnitPlot couldn’t update your follows. Please try again.",
      503,
    );
  }
}
