import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Viewer } from "./auth";
import type { getDatabase } from "./db";
import { readChartDocument } from "./chart-schema";
import {
  isChartLinkToken,
  isShareLinkToken,
  isDraftChartLinkToken,
  isChartLinkSlug,
  isShortChartLinkToken,
} from "./chart-links";
import { errorResponse, HttpError, readJsonObject } from "./http";
import { hasValidRequestOrigin } from "./security/origin";
import { stringifyKnitplot } from "./yoke-program-wire";

type Dependencies = {
  getViewer: () => Promise<Pick<Viewer, "id"> | null>;
  getDatabase: typeof getDatabase;
};
const createInput = z
  .object({
    sourceId: z.uuid(),
    version: z.number().int().positive(),
    shareYokeMeasurements: z.boolean().optional(),
  })
  .strict();
const revokeInput = z
  .object({
    sourceId: z.uuid(),
    token: z.string().refine(isChartLinkToken),
  })
  .strict();
const headers = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};
const limit = { bytes: 512, message: "The link details are too large." };
const notFound = () =>
  errorResponse("This chart link is invalid or has been turned off.", 404);
const unavailable = () =>
  errorResponse(
    "Chart links aren’t available right now. Please try again.",
    503,
  );

export function createChartLinkHandlers({
  getViewer,
  getDatabase,
}: Dependencies) {
  async function owner(request: Request) {
    if (!hasValidRequestOrigin(request))
      throw new HttpError("Invalid request origin.", 403);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError("Sign in to manage chart links.", 401);
    const sql = getDatabase();
    if (!sql)
      throw new HttpError("Chart links aren’t available right now.", 503);
    return { sql, ownerId: viewer.id };
  }

  return {
    async create(request: Request) {
      try {
        const { sql, ownerId } = await owner(request);
        const input = createInput.safeParse(
          await readJsonObject(request, limit),
        );
        if (!input.success)
          return errorResponse("The chart link request is invalid.", 400);
        const { sourceId, version, shareYokeMeasurements } = input.data;
        const [source] = await sql`
          select name, document, version from knitplot_charts
          where id = ${sourceId}::uuid and user_id = ${ownerId}
        `;
        if (!source) return errorResponse("That chart was not found.", 404);
        if (source.version !== version)
          return errorResponse(
            "This chart changed. Reload this page before creating the link.",
            409,
          );
        const document = readChartDocument(source.document);
        if (document.yoke && shareYokeMeasurements !== true)
          return errorResponse(
            "Confirm that you want to include the yoke measurements.",
            400,
          );
        const snapshot = stringifyKnitplot({ ...document, name: source.name });
        const token = randomBytes(24).toString("base64url");
        const [link] = await sql`
          insert into knitplot_chart_links (source_id, token, document)
          select id, ${token}, ${snapshot}::jsonb from knitplot_charts
          where id = ${sourceId}::uuid and user_id = ${ownerId} and version = ${version}
          for share
          on conflict (source_id) do nothing
          returning token
        `;
        if (!link)
          return errorResponse(
            "This chart changed or already has a link. Reload this page to check.",
            409,
          );
        return Response.json({ token: link.token }, { status: 201, headers });
      } catch (error) {
        return error instanceof HttpError
          ? errorResponse(error.message, error.status)
          : unavailable();
      }
    },
    async revoke(request: Request) {
      try {
        const { sql, ownerId } = await owner(request);
        const input = revokeInput.safeParse(
          await readJsonObject(request, limit),
        );
        if (!input.success)
          return errorResponse("The chart link request is invalid.", 400);
        const [link] = await sql`
          delete from knitplot_chart_links links using knitplot_charts charts
          where links.source_id = charts.id and links.source_id = ${input.data.sourceId}::uuid
            and charts.user_id = ${ownerId} and links.token = ${input.data.token}
          returning links.source_id
        `;
        return link ? new Response(null, { status: 204, headers }) : notFound();
      } catch (error) {
        return error instanceof HttpError
          ? errorResponse(error.message, error.status)
          : unavailable();
      }
    },
    async open(request: Request) {
      if (!hasValidRequestOrigin(request))
        return errorResponse("Invalid request origin.", 403);
      try {
        const { token, slug } = await readJsonObject(request, limit);
        if (!isShareLinkToken(token)) return notFound();
        const shortCode = isShortChartLinkToken(token);
        if (shortCode && !isChartLinkSlug(slug)) return notFound();
        const sql = getDatabase();
        if (!sql) return unavailable();
        const [link] = isDraftChartLinkToken(token)
          ? await sql`
          select document from knitplot_draft_chart_links
          where token = ${token} and (${!shortCode}::boolean or slug = ${shortCode ? slug : null})
        `
          : await sql`
          select document from knitplot_chart_links where token = ${token}
        `;
        if (!link) return notFound();
        return new Response(
          stringifyKnitplot({
            format: "colorwork-chart",
            version: 2,
            document: link.document,
          }),
          { headers: { ...headers, "Content-Type": "application/json" } },
        );
      } catch (error) {
        return error instanceof HttpError
          ? errorResponse(error.message, error.status)
          : unavailable();
      }
    },
  };
}
