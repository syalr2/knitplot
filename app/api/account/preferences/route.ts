import { clerkClient } from "@clerk/nextjs/server";
import { ACCOUNT_COLORS, ACCOUNT_SYMBOLS, type AccountAvatar, type AccountColor } from "@/lib/account-preferences";
import { getViewer } from "@/lib/auth";
import { hasValidRequestOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

function responseError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

function parseAvatar(value: unknown): AccountAvatar | null {
  if (!value || typeof value !== "object") return null;
  const kind = (value as Record<string, unknown>).kind;
  const raw = (value as Record<string, unknown>).value;
  const rawColor = (value as Record<string, unknown>).color;
  const color: AccountColor = typeof rawColor === "string" && rawColor in ACCOUNT_COLORS ? rawColor as AccountColor : "green";
  if (kind === "symbol" && typeof raw === "string" && raw in ACCOUNT_SYMBOLS) {
    return { kind, value: raw as keyof typeof ACCOUNT_SYMBOLS, color };
  }
  if (kind === "initials" && typeof raw === "string") {
    const initials = raw.trim().replace(/\s+/g, "").toLocaleUpperCase();
    if (/^[\p{L}\p{N}]{1,2}$/u.test(initials)) return { kind, value: initials, color };
  }
  return null;
}

export async function PATCH(request: Request) {
  if (!hasValidRequestOrigin(request)) return responseError("Invalid request origin.", 403);
  const viewer = await getViewer();
  if (!viewer) return responseError("Please sign in first.", 401);

  let avatar: AccountAvatar | null = null;
  try {
    const body = await request.json() as { avatar?: unknown };
    avatar = parseAvatar(body.avatar);
  } catch {
    return responseError("The account icon was not valid.", 400);
  }
  if (!avatar) return responseError("Choose an icon or enter one or two letters.", 400);

  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(viewer.id, {
      publicMetadata: { knitplot: { avatar } },
    });
    return Response.json({ avatar }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return responseError("KnitPlot could not save the account icon. Please try again.", 503);
  }
}
