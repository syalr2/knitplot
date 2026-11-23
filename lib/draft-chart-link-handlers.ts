import { createHash, randomBytes, randomInt } from "node:crypto";
import type { getDatabase } from "./db";
import { readChartDocument } from "./chart-schema";
import {
  chartLinkSlug,
  isChartLinkToken,
  isDraftChartLinkToken,
} from "./chart-links";
import { errorResponse, HttpError, readJsonObject } from "./http";
import { hasValidRequestOrigin } from "./security/origin";
import { stringifyKnitplot } from "./yoke-program-wire";
import { limitGuestLink } from "./guest-link-rate-limit";

const maxBytes = 4_000_000;
const tooLarge =
  "This chart is too large to share by link. Download an editable KnitPlot file instead.";
const noStore = { "Cache-Control": "no-store" };
const unavailable = () =>
  errorResponse(
    "Chart links aren’t available right now. Please try again.",
    503,
  );
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const codeAlphabet =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const newCode = () =>
  Array.from(
    { length: 6 },
    () => codeAlphabet[randomInt(codeAlphabet.length)],
  ).join("");

export function createDraftChartLinkHandlers(database: typeof getDatabase) {
  return {
    async POST(request: Request) {
      if (!hasValidRequestOrigin(request))
        return errorResponse("Invalid request origin.", 403);
      const sql = database();
      if (!sql) return unavailable();
      try {
        await limitGuestLink(request, sql, "create");
        const {
          document,
          shareYokeMeasurements,
          confirmRights,
          revokeToken: key,
        } = await readJsonObject(request, {
          bytes: maxBytes,
          message: tooLarge,
        });
        if (key !== undefined && !isChartLinkToken(key))
          return errorResponse("The link recovery key is invalid.", 400);
        if (confirmRights !== true)
          return errorResponse(
            "Confirm that you made this chart or have permission to share it.",
            400,
          );
        const chart = readChartDocument(document);
        if (chart.yoke && shareYokeMeasurements !== true)
          return errorResponse(
            "Confirm that you want to include the yoke measurements.",
            400,
          );
        const snapshot = stringifyKnitplot(chart);
        const size = Buffer.byteLength(snapshot);
        if (size > maxBytes) return errorResponse(tooLarge, 413);
        const slug = chartLinkSlug(chart.name);
        const revokeToken = key ?? randomBytes(24).toString("base64url");
        const revokeHash = digest(revokeToken);
        for (let attempt = 0; attempt < 4; attempt++) {
          const token = newCode();
          const [result] = await sql`
            select * from knitplot_admit_guest_link(
              ${token}, ${revokeHash}, ${snapshot}::jsonb, ${size}::integer, ${slug}
            )
          `;
          if (result?.capacity_warning)
            console.warn("guest_link_capacity_warning", {
              thresholdPercent: 80,
            });
          if (result?.outcome === "created" || result?.outcome === "existing")
            return Response.json(
              key === undefined
                ? { token: result.token, revokeToken }
                : { token: result.token, slug: result.slug },
              {
                status: result.outcome === "created" ? 201 : 200,
                headers: noStore,
              },
            );
          if (result?.outcome === "full")
            return errorResponse(
              "Chart link storage is full right now. Download an editable KnitPlot file instead.",
              429,
            );
          if (result?.outcome !== "collision") break;
        }
        return unavailable();
      } catch (error) {
        return error instanceof HttpError
          ? errorResponse(error.message, error.status)
          : unavailable();
      }
    },

    async PATCH(request: Request) {
      if (!hasValidRequestOrigin(request))
        return errorResponse("Invalid request origin.", 403);
      const sql = database();
      if (!sql) return unavailable();
      try {
        await limitGuestLink(request, sql, "manage");
        const { revokeToken } = await readJsonObject(request, {
          bytes: 512,
          message: "The link details are too large.",
        });
        if (!isChartLinkToken(revokeToken))
          return errorResponse("The link recovery key is invalid.", 400);
        const [link] = await sql`
          select token, slug from knitplot_draft_chart_links
          where revoke_hash = ${digest(revokeToken)}
        `;
        return link
          ? Response.json(
              { token: link.token, slug: link.slug },
              { headers: noStore },
            )
          : errorResponse(
              "No active link was found for this recovery key.",
              404,
            );
      } catch (error) {
        return error instanceof HttpError
          ? errorResponse(error.message, error.status)
          : unavailable();
      }
    },

    async DELETE(request: Request) {
      if (!hasValidRequestOrigin(request))
        return errorResponse("Invalid request origin.", 403);
      const sql = database();
      if (!sql) return unavailable();
      try {
        await limitGuestLink(request, sql, "manage");
        const { token, revokeToken } = await readJsonObject(request, {
          bytes: 512,
          message: "The link details are too large.",
        });
        if (
          (token !== undefined && !isDraftChartLinkToken(token)) ||
          !isChartLinkToken(revokeToken)
        )
          return errorResponse("That chart link is invalid.", 400);
        const [link] = await sql`
          delete from knitplot_draft_chart_links
          where revoke_hash = ${digest(revokeToken)} and
            (${token ?? null}::text is null or token = ${token ?? null})
          returning token
        `;
        return link
          ? new Response(null, { status: 204, headers: noStore })
          : errorResponse(
              "This link is already off or can’t be managed from this browser.",
              404,
            );
      } catch (error) {
        return error instanceof HttpError
          ? errorResponse(error.message, error.status)
          : unavailable();
      }
    },
  };
}
