import { getViewer } from "@/lib/auth";
import { clubUsernameSchema } from "@/lib/club-username";
import { getDatabase } from "@/lib/db";
import { errorResponse, HttpError, isRecord, readJsonObject } from "@/lib/http";
import { hasValidRequestOrigin } from "@/lib/security/origin";

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request))
    return errorResponse("Invalid request origin.", 403);
  const viewer = await getViewer();
  if (!viewer) return errorResponse("Sign in to choose a username.", 401);
  const sql = getDatabase();
  if (!sql) return errorResponse("Chart Club isn’t configured here yet.", 503);
  try {
    const body = await readJsonObject(request, {
      bytes: 1024,
      message: "The request is too large.",
    });
    const username = clubUsernameSchema.safeParse(body.handle);
    if (!username.success)
      return errorResponse("Use 3–24 letters, numbers or underscores.", 400);
    const [creator] = await sql`
      insert into knitplot_club_creators (user_id, handle)
      values (${viewer.id}, ${username.data})
      on conflict (user_id) do update set handle = excluded.handle
      returning handle
    `;
    return Response.json(
      { handle: creator.handle },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof HttpError)
      return errorResponse(error.message, error.status);
    if (isRecord(error) && error.code === "KP001") {
      const previous = await sql`
        select handles.handle from knitplot_club_handles handles
        join knitplot_club_creators creator on creator.user_id = handles.creator_id
        where handles.creator_id = ${viewer.id} and handles.handle <> creator.handle
        order by handles.handle
      `.catch(() => null);
      if (previous)
        return Response.json(
          {
            error: "You’ve reached the five-username limit.",
            code: "username_limit",
            previousHandles: previous.map(({ handle }) => handle),
          },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
    }
    if (isRecord(error) && error.code === "23505")
      return errorResponse("That username is already taken.", 409);
    if (isRecord(error) && error.code === "42P01")
      return errorResponse(
        "Chart Club’s database setup hasn’t been applied here yet.",
        503,
      );
    return errorResponse(
      "KnitPlot couldn’t save your username. Try again.",
      503,
    );
  }
}
