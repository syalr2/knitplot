import type { getViewer as ViewerGetter } from "./auth";
import type { getDatabase as DatabaseGetter } from "./db";
import { HttpError, errorResponse, readJsonObject, isUuid } from "./http";
import { readCloudChartPayload } from "./cloud-charts";
import { hasValidRequestOrigin } from "./security/origin";

// Dependency injection keeps HTTP behaviour testable without Clerk/network/keys.
export function createChartHandlers(dependencies: {
  getViewer: typeof ViewerGetter;
  getDatabase: typeof DatabaseGetter;
}) {
  const { getViewer, getDatabase } = dependencies;
  async function context() {
    const viewer = await getViewer();
    const sql = getDatabase();
    return { viewer, sql };
  }

  async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const { viewer, sql } = await context();
    if (!viewer)
      return errorResponse("Please sign in to open this chart.", 401);
    if (!sql)
      return errorResponse("Cloud chart storage is not configured.", 503);
    const { id } = await params;
    if (!isUuid(id)) return errorResponse("That chart was not found.", 404);
    let data: Record<string, unknown> | undefined;
    try {
      const rows =
        (await sql`select id, name, document, knit_progress, preview, updated_at::text as updated_at from knitplot_charts where id = ${id}::uuid and user_id = ${viewer.id} limit 1`) as Array<
          Record<string, unknown>
        >;
      data = rows[0];
    } catch {
      return errorResponse("KnitPlot could not open the chart.", 503);
    }
    if (!data) return errorResponse("That chart was not found.", 404);
    return Response.json(
      {
        id: data.id,
        document: data.document,
        knitProgress: data.knit_progress,
        preview: data.preview,
        updatedAt: data.updated_at,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) {
    if (!hasValidRequestOrigin(request))
      return errorResponse("Invalid request origin.", 403);
    const { viewer, sql } = await context();
    if (!viewer)
      return errorResponse("Please sign in to save this chart.", 401);
    if (!sql)
      return errorResponse("Cloud chart storage is not configured.", 503);
    const { id } = await params;
    if (!isUuid(id)) return errorResponse("That chart was not found.", 404);
    try {
      const body = await readJsonObject(request);
      const payload = readCloudChartPayload(body);
      const version = body.expectedVersion;
      if (typeof version !== "string" || version.length > 100 || !version)
        return errorResponse("Reopen this chart before saving it.", 428);
      const name = payload.document.name.trim() || "Untitled chart";
      const documentJson = JSON.stringify(payload.document);
      const progressJson = JSON.stringify(payload.knitProgress);
      const previewJson = JSON.stringify(payload.preview);
      const rows = (await sql`
      update knitplot_charts set
        name = ${name}, document = ${documentJson}::jsonb, knit_progress = ${progressJson}::jsonb,
        preview = ${previewJson}::jsonb, updated_at = now()
      where id = ${id}::uuid and user_id = ${viewer.id} and updated_at::text = ${version}
      returning id, updated_at::text as "updatedAt"
    `) as Array<Record<string, unknown>>;
      const data = rows[0];
      if (!data)
        return errorResponse(
          "This chart changed elsewhere or was deleted. Your local copy has been kept.",
          409,
        );
      return Response.json(data, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const message =
        error instanceof HttpError
          ? error.message
          : "KnitPlot could not save the chart.";
      return errorResponse(
        message,
        error instanceof HttpError ? error.status : 503,
      );
    }
  }

  async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) {
    if (!hasValidRequestOrigin(request))
      return errorResponse("Invalid request origin.", 403);
    const { viewer, sql } = await context();
    if (!viewer)
      return errorResponse("Please sign in to rename this chart.", 401);
    if (!sql)
      return errorResponse("Cloud chart storage is not configured.", 503);
    const { id } = await params;
    if (!isUuid(id)) return errorResponse("That chart was not found.", 404);
    let name = "";
    try {
      const body = await readJsonObject(request);
      name = typeof body.name === "string" ? body.name.trim() : "";
    } catch {
      return errorResponse("The new chart name was not valid.", 400);
    }
    if (!name || name.length > 200)
      return errorResponse(
        "Chart names must be between 1 and 200 characters.",
        400,
      );
    try {
      const rows = (await sql`
      update knitplot_charts set
        name = ${name}, document = jsonb_set(document, '{name}', to_jsonb(${name}::text), true), updated_at = now()
      where id = ${id}::uuid and user_id = ${viewer.id}
      returning id, name, updated_at::text as "updatedAt"
    `) as Array<Record<string, unknown>>;
      const data = rows[0];
      if (!data) return errorResponse("That chart was not found.", 404);
      return Response.json(data, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return errorResponse("KnitPlot could not rename the chart.", 503);
    }
  }

  async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) {
    if (!hasValidRequestOrigin(request))
      return errorResponse("Invalid request origin.", 403);
    const { viewer, sql } = await context();
    if (!viewer) return errorResponse("Please sign in first.", 401);
    if (!sql)
      return errorResponse("Cloud chart storage is not configured.", 503);
    const { id } = await params;
    if (!isUuid(id)) return errorResponse("That chart was not found.", 404);
    try {
      await sql`delete from knitplot_charts where id = ${id}::uuid and user_id = ${viewer.id}`;
    } catch {
      return errorResponse("KnitPlot could not delete the chart.", 503);
    }
    return Response.json(
      { deleted: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  async function POST(request: Request) {
    if (!hasValidRequestOrigin(request))
      return errorResponse("Invalid request origin.", 403);
    const viewer = await getViewer();
    const sql = getDatabase();
    if (!viewer)
      return errorResponse("Please sign in to save this chart.", 401);
    if (!sql)
      return errorResponse("Cloud chart storage is not configured.", 503);

    try {
      const payload = readCloudChartPayload(await readJsonObject(request));
      const name = payload.document.name.trim() || "Untitled chart";
      const documentJson = JSON.stringify(payload.document);
      const progressJson = JSON.stringify(payload.knitProgress);
      const previewJson = JSON.stringify(payload.preview);
      const rows = (await sql`
      insert into knitplot_charts (user_id, name, document, knit_progress, preview)
      values (${viewer.id}, ${name}, ${documentJson}::jsonb, ${progressJson}::jsonb, ${previewJson}::jsonb)
      returning id, updated_at::text as "updatedAt"
    `) as Array<Record<string, unknown>>;
      return Response.json(rows[0], {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      const message =
        error instanceof HttpError
          ? error.message
          : "KnitPlot could not save the chart.";
      return errorResponse(
        message,
        error instanceof HttpError ? error.status : 503,
      );
    }
  }

  return { GET, PUT, POST, PATCH, DELETE };
}
