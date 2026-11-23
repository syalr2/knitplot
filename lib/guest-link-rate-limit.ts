import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { getDatabase } from "./db";
import { HttpError } from "./http";

export type GuestLinkScope = "create" | "open" | "manage";

export async function limitGuestLink(
  request: Request,
  sql: NonNullable<ReturnType<typeof getDatabase>>,
  scope: GuestLinkScope,
) {
  // Do not trust forwarding headers on local or self-hosted instances.
  if (process.env.VERCEL !== "1") return;
  const secret = process.env.KNITPLOT_LINK_RATE_SECRET;
  if (!secret || secret.length < 32)
    throw new HttpError("Chart links aren’t available right now.", 503);
  const forwarded = request.headers.get("x-vercel-forwarded-for") ?? "";
  const address = isIP(forwarded) ? forwarded : "unknown";
  const bucket = createHmac("sha256", secret)
    .update(`${scope}:${address}`)
    .digest("hex");
  const limit = scope === "create" ? 12 : scope === "manage" ? 60 : 150;
  const seconds = scope === "create" ? 3_600 : 300;
  const [result] = await sql`
    select knitplot_take_guest_link_request(${bucket}, ${limit}, ${seconds}) as allowed
  `;
  if (!result?.allowed)
    throw new HttpError(
      "Too many chart link requests. Please try again later.",
      429,
    );
}
