import { getViewer } from "@/lib/auth";
import { readCloudChartPayload } from "@/lib/cloud-charts";
import { getDatabase } from "@/lib/db";
import { hasValidRequestOrigin } from "@/lib/security/origin";

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) return errorResponse("Invalid request origin.", 403);
  const viewer = await getViewer();
  const sql = getDatabase();
  if (!viewer) return errorResponse("Please sign in to save this chart.", 401);
  if (!sql) return errorResponse("Cloud chart storage is not configured.", 503);

  try {
    const payload = readCloudChartPayload(await request.json());
    const name = payload.document.name.trim() || "Untitled chart";
    const documentJson = JSON.stringify(payload.document);
    const progressJson = JSON.stringify(payload.knitProgress);
    const previewJson = JSON.stringify(payload.preview);
    const rows = await sql`
      insert into knitplot_charts (user_id, name, document, knit_progress, preview)
      values (${viewer.id}, ${name}, ${documentJson}::jsonb, ${progressJson}::jsonb, ${previewJson}::jsonb)
      returning id, updated_at
    ` as Array<Record<string, unknown>>;
    return Response.json(rows[0], { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("The chart") ? error.message : "KnitPlot could not save the chart.";
    return errorResponse(message, message.startsWith("The chart") ? 400 : 503);
  }
}
