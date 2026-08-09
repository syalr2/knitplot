import { getViewer } from "@/lib/auth";
import { readCloudChartPayload } from "@/lib/cloud-charts";
import { getDatabase } from "@/lib/db";
import { hasValidRequestOrigin } from "@/lib/security/origin";

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

async function context() {
  const viewer = await getViewer();
  const sql = getDatabase();
  return { viewer, sql };
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { viewer, sql } = await context();
  if (!viewer) return errorResponse("Please sign in to open this chart.", 401);
  if (!sql) return errorResponse("Cloud chart storage is not configured.", 503);
  const { id } = await params;
  if (!isUuid(id)) return errorResponse("That chart was not found.", 404);
  let data: Record<string, unknown> | undefined;
  try {
    const rows = await sql`select id, name, document, knit_progress, preview, updated_at from knitplot_charts where id = ${id}::uuid and user_id = ${viewer.id} limit 1` as Array<Record<string, unknown>>;
    data = rows[0];
  } catch {
    return errorResponse("KnitPlot could not open the chart.", 503);
  }
  if (!data) return errorResponse("That chart was not found.", 404);
  return Response.json({
    id: data.id,
    document: data.document,
    knitProgress: data.knit_progress,
    preview: data.preview,
    updatedAt: data.updated_at,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasValidRequestOrigin(request)) return errorResponse("Invalid request origin.", 403);
  const { viewer, sql } = await context();
  if (!viewer) return errorResponse("Please sign in to save this chart.", 401);
  if (!sql) return errorResponse("Cloud chart storage is not configured.", 503);
  const { id } = await params;
  if (!isUuid(id)) return errorResponse("That chart was not found.", 404);
  try {
    const payload = readCloudChartPayload(await request.json());
    const name = payload.document.name.trim() || "Untitled chart";
    const documentJson = JSON.stringify(payload.document);
    const progressJson = JSON.stringify(payload.knitProgress);
    const previewJson = JSON.stringify(payload.preview);
    const rows = await sql`
      update knitplot_charts set
        name = ${name}, document = ${documentJson}::jsonb, knit_progress = ${progressJson}::jsonb,
        preview = ${previewJson}::jsonb, updated_at = now()
      where id = ${id}::uuid and user_id = ${viewer.id}
      returning id, updated_at
    ` as Array<Record<string, unknown>>;
    const data = rows[0];
    if (!data) return errorResponse("That chart was not found.", 404);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("The chart") ? error.message : "KnitPlot could not save the chart.";
    return errorResponse(message, message.startsWith("The chart") ? 400 : 503);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasValidRequestOrigin(request)) return errorResponse("Invalid request origin.", 403);
  const { viewer, sql } = await context();
  if (!viewer) return errorResponse("Please sign in first.", 401);
  if (!sql) return errorResponse("Cloud chart storage is not configured.", 503);
  const { id } = await params;
  if (!isUuid(id)) return errorResponse("That chart was not found.", 404);
  try {
    await sql`delete from knitplot_charts where id = ${id}::uuid and user_id = ${viewer.id}`;
  } catch {
    return errorResponse("KnitPlot could not delete the chart.", 503);
  }
  return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
}
