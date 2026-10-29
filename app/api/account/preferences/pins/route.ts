import { getViewer } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { errorResponse, isUuid, readJsonObject } from "@/lib/http";
import { hasValidRequestOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  if (!hasValidRequestOrigin(request))
    return errorResponse("Invalid request origin.", 403);
  const viewer = await getViewer();
  if (!viewer) return errorResponse("Please sign in first.", 401);
  const sql = getDatabase();
  if (!sql) return errorResponse("Cloud chart storage is not configured.", 503);
  let chartId: string;
  let pinned: boolean;
  try {
    const body = await readJsonObject(request);
    if (
      typeof body.chartId !== "string" ||
      !isUuid(body.chartId) ||
      typeof body.pinned !== "boolean"
    ) {
      return errorResponse("The pin change was not valid.", 400);
    }
    chartId = body.chartId;
    pinned = body.pinned;
  } catch {
    return errorResponse("The pin change was not valid.", 400);
  }
  try {
    const rows = (await sql`
      update knitplot_charts set pinned = ${pinned}
      where id = ${chartId}::uuid and user_id = ${viewer.id}
      returning id
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return errorResponse("That chart was not found.", 404);
    return Response.json(
      { pinned },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return errorResponse(
      "KnitPlot could not save that pin. Please try again.",
      503,
    );
  }
}
