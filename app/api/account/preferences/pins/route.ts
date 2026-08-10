import { clerkClient } from "@clerk/nextjs/server";
import { parsePinnedChartIds } from "@/lib/account-preferences";
import { getViewer } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { hasValidRequestOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function responseError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  if (!hasValidRequestOrigin(request)) return responseError("Invalid request origin.", 403);
  const viewer = await getViewer();
  if (!viewer) return responseError("Please sign in first.", 401);

  let chartId = "";
  let pinned = false;
  try {
    const body = await request.json() as { chartId?: unknown; pinned?: unknown };
    chartId = typeof body.chartId === "string" ? body.chartId : "";
    pinned = body.pinned === true;
  } catch {
    return responseError("The pin change was not valid.", 400);
  }
  if (!isUuid(chartId)) return responseError("That chart was not found.", 404);

  try {
    if (pinned) {
      const sql = getDatabase();
      if (!sql) return responseError("Cloud chart storage is not configured.", 503);
      const rows = await sql`
        select id from knitplot_charts
        where id = ${chartId}::uuid and user_id = ${viewer.id}
        limit 1
      ` as Array<Record<string, unknown>>;
      if (rows.length === 0) return responseError("That chart was not found.", 404);
    }

    const client = await clerkClient();
    const user = await client.users.getUser(viewer.id);
    const current = parsePinnedChartIds(user.publicMetadata);
    const next = pinned ? [chartId, ...current.filter((id) => id !== chartId)].slice(0, 100) : current.filter((id) => id !== chartId);
    await client.users.updateUserMetadata(viewer.id, { publicMetadata: { knitplot: { pinnedChartIds: next } } });
    return Response.json({ pinnedChartIds: next }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return responseError("KnitPlot could not save that pin. Please try again.", 503);
  }
}
