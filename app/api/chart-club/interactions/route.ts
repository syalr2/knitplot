import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { recordClubReport } from "@/lib/club-reports";
import { errorResponse, HttpError, readJsonObject } from "@/lib/http";
import { hasValidRequestOrigin } from "@/lib/security/origin";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("heart"), id: z.uuid(), hearted: z.boolean() }),
  z.object({
    action: z.literal("report"),
    id: z.uuid(),
    reason: z.enum(["spam", "permission", "other"]),
  }),
  z.object({ action: z.literal("remove"), id: z.uuid() }),
]);

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request))
    return errorResponse("Invalid request origin.", 403);
  const viewer = await getViewer();
  if (!viewer) return errorResponse("Sign in to continue.", 401);
  const sql = getDatabase();
  if (!sql) return errorResponse("Chart Club isn’t configured.", 503);
  try {
    const parsed = input.safeParse(
      await readJsonObject(request, {
        bytes: 1024,
        message: "The request is too large.",
      }),
    );
    if (!parsed.success)
      return errorResponse("Invalid Chart Club request.", 400);
    const action = parsed.data;
    if (action.action === "remove") {
      if (viewer.id !== process.env.CHART_CLUB_MODERATOR_ID)
        return errorResponse("Not available.", 404);
      await sql`update knitplot_club_posts set removed_at = now()
        where id = ${action.id}::uuid and removed_at is null`;
    } else if (action.action === "report") {
      if (!(await recordClubReport(sql, viewer.id, action.id, action.reason)))
        return errorResponse("This chart isn’t available to report.", 404);
    } else if (action.hearted) {
      await sql`insert into knitplot_club_hearts (user_id, post_id)
        select ${viewer.id}, id from knitplot_club_public_posts where id = ${action.id}::uuid
        on conflict do nothing`;
    } else {
      await sql`delete from knitplot_club_hearts where user_id = ${viewer.id} and post_id = ${action.id}::uuid`;
    }
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof HttpError)
      return errorResponse(error.message, error.status);
    return errorResponse("KnitPlot couldn’t save that change. Try again.", 503);
  }
}
