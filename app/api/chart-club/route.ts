import { getViewer } from "@/lib/auth";
import {
  clubPostUpdateSchema,
  clubSnapshot,
  readClubShare,
} from "@/lib/chart-club";
import { getDatabase } from "@/lib/db";
import { errorResponse, HttpError, isUuid, readJsonObject } from "@/lib/http";
import { hasValidRequestOrigin } from "@/lib/security/origin";

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request))
    return errorResponse("Invalid request origin.", 403);
  const viewer = await getViewer();
  if (!viewer) return errorResponse("Sign in to share a chart.", 401);
  const sql = getDatabase();
  if (!sql) return errorResponse("Chart Club is not configured.", 503);
  try {
    const options = readClubShare(
      await readJsonObject(request, {
        bytes: 8192,
        message: "The sharing details are too large.",
      }),
    );
    const [source] = await sql`
      select chart.document, chart.version, creator.handle
      from knitplot_charts chart left join knitplot_club_creators creator on creator.user_id = chart.user_id
      where chart.id = ${options.sourceId}::uuid and chart.user_id = ${viewer.id}
    `;
    if (!source) return errorResponse("That chart was not found.", 404);
    if (!source.handle)
      return errorResponse(
        "Choose a Chart Club username in Account Settings before sharing.",
        409,
      );
    if (source.version !== options.sourceVersion)
      return errorResponse(
        "The saved chart changed. Reopen it before sharing.",
        409,
      );
    const snapshot = clubSnapshot(source.document, options);
    const [post] = await sql`
      with source as (
        select id from knitplot_charts
        where id = ${options.sourceId}::uuid and user_id = ${viewer.id}
          and version = ${options.sourceVersion}
        for share
      )
      insert into knitplot_club_posts
        (creator_id, source_id, title, description, summary, editable_document)
      select creator.user_id, source.id, ${options.title}, ${options.description},
        ${JSON.stringify(snapshot.summary)}::jsonb, ${snapshot.editableDocument}::jsonb
      from knitplot_club_creators creator cross join source where creator.user_id = ${viewer.id}
      on conflict (creator_id, source_id) do nothing
      returning id
    `;
    if (!post)
      return errorResponse(
        "This chart may already be published, or its saved version changed. Check Published charts in My Charts before trying again.",
        409,
      );
    return Response.json(
      { id: post.id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof HttpError)
      return errorResponse(error.message, error.status);
    return errorResponse(
      "KnitPlot couldn’t share the chart. Please try again.",
      503,
    );
  }
}

export async function PATCH(request: Request) {
  if (!hasValidRequestOrigin(request))
    return errorResponse("Invalid request origin.", 403);
  const viewer = await getViewer();
  if (!viewer) return errorResponse("Sign in to edit your post.", 401);
  const sql = getDatabase();
  if (!sql) return errorResponse("Chart Club is not configured.", 503);
  try {
    const input = clubPostUpdateSchema.safeParse(
      await readJsonObject(request, {
        bytes: 8192,
        message: "The post details are too large.",
      }),
    );
    if (!input.success)
      return errorResponse("Check your post title and description.", 400);
    const { id, title, description } = input.data;
    const [post] = await sql`
      update knitplot_club_posts
      set title = ${title}, description = ${description}, updated_at = now()
      where id = ${id}::uuid and creator_id = ${viewer.id}
        and removed_at is null and editable_document is not null
      returning id
    `;
    if (!post) return errorResponse("That post was not found.", 404);
    return Response.json(
      { id: post.id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof HttpError)
      return errorResponse(error.message, error.status);
    return errorResponse(
      "KnitPlot couldn’t save the post details. Try again.",
      503,
    );
  }
}

export async function DELETE(request: Request) {
  if (!hasValidRequestOrigin(request))
    return errorResponse("Invalid request origin.", 403);
  const viewer = await getViewer();
  if (!viewer) return errorResponse("Sign in to unshare a chart.", 401);
  const sql = getDatabase();
  if (!sql) return errorResponse("Chart Club is not configured.", 503);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!isUuid(id)) return errorResponse("That post was not found.", 404);
  try {
    const [post] = await sql`
      delete from knitplot_club_posts where id = ${id}::uuid
        and creator_id = ${viewer.id} and removed_at is null returning id
    `;
    return post
      ? new Response(null, {
          status: 204,
          headers: { "Cache-Control": "no-store" },
        })
      : errorResponse("That post was not found.", 404);
  } catch {
    return errorResponse(
      "KnitPlot couldn’t unshare the chart. Please try again.",
      503,
    );
  }
}
